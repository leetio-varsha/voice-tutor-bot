import { Bot, InlineKeyboard } from "grammy";
import { toWav16k } from "./audio.js";
import { config } from "./config.js";
import { onButton, type BotContext } from "./context.js";
import { COURSES, isLang } from "./courses.js";
import { admin } from "./features/admin.js";
import { assessRepeat, checkDictation, drills } from "./features/drills.js";
import { progress } from "./features/progress.js";
import { pictures, startOwnPicture } from "./features/pictures.js";
import { saveCityTimezone, settings } from "./features/settings.js";
import { handleLearnerLine, startOwnTopic, talk } from "./features/talk.js";
import { answerVocab, vocab } from "./features/vocab.js";
import { saveWord, words } from "./features/words.js";
import { ALL_MENU_LABELS, COURSE_PICKER, UI, type UiText } from "./i18n.js";
import { restoreSession } from "./lessons.js";
import { getSession } from "./session.js";
import { recognize } from "./speech/stt.js";
import * as store from "./store.js";
import { mainMenu } from "./ui.js";
import { downloadVoice, withChatAction } from "./voice.js";

/** A reply slower than this gets a visible "working on it" message. */
const THINKING_NOTICE_AFTER_MS = 1500;

/** Learners with an update being handled right now. */
const inProgress = new Map<number, { warned: boolean }>();

/** Resolves once no update is being handled, or after the timeout: lets a shutdown finish replies that are on their way. */
export async function whenIdle(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (inProgress.size > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
}

async function reportError(ctx: BotContext, error: unknown): Promise<void> {
  console.error(`Error while handling update ${ctx.update.update_id}:`, error);
  const message = error instanceof Error ? error.message : String(error);
  // The error can come before the learner's course is known (e.g. the database is down).
  const prefix = ctx.t?.somethingWentWrong ?? UI.en.somethingWentWrong;
  await ctx.reply(`${prefix}: ${message}`).catch(() => {});
}

/** Builds the bot with every handler attached; starting it is up to the caller (src/index.ts). */
export function createBot(telegramToken: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(telegramToken);

  // --- access control: the bot spends paid API credits, so only listed users get through ---

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId !== undefined && config.allowedUserIds.includes(userId)) return next();
    console.warn(`Blocked update from user ${userId ?? "unknown"}`);
    if (ctx.chat?.type === "private") {
      await ctx.reply(
        `This bot is private. Your Telegram user id is ${userId}; ask the owner to add it to ALLOWED_USER_IDS.\n\nЭто закрытый бот. Твой Telegram id: ${userId}. Попроси владельца добавить его в ALLOWED_USER_IDS.`,
      );
    }
  });

  // --- learner profile and in-progress lesson state for every update ---

  const coursePicker = () =>
    new InlineKeyboard().text(COURSE_PICKER.ru, "course:ru").row().text(COURSE_PICKER.en, "course:en");

  const welcome = (t: UiText) => t.welcome.join("\n");

  bot.use(async (ctx, next) => {
    const learner = await store.ensureLearner(ctx.from!.id, ctx.from!.first_name);
    ctx.learner = learner;
    ctx.session = getSession(learner.id);

    // A new learner picks what they study before anything else; the interface language follows from it.
    if (!learner.learning) {
      const picked = /^course:(ru|en)$/.exec(ctx.callbackQuery?.data ?? "")?.[1];
      if (!isLang(picked)) {
        await ctx.reply(COURSE_PICKER.question, { reply_markup: coursePicker() });
        return;
      }
      await ctx.answerCallbackQuery().catch(() => {});
      await store.setLearning(learner.id, picked);
      learner.learning = picked;
      const t = UI[COURSES[picked].native];
      await ctx.reply(welcome(t), { reply_markup: mainMenu(t) });
      return;
    }

    ctx.course = COURSES[learner.learning];
    ctx.t = UI[ctx.course.native];
    await restoreSession(learner);
    await next();
  });

  // --- one thing at a time per learner ---
  // grammY's polling handles updates strictly one after another. A slow turn held up every other learner,
  // and a message sent five times while the bot was thinking got five answers in a row. So each update
  // now runs in the background, and while one is in progress the same learner's other updates are turned
  // away with a notice instead of being queued.

  bot.use(async (ctx, next) => {
    const learnerId = ctx.learner.id;
    const current = inProgress.get(learnerId);
    if (current) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: ctx.t.stillWorkingButton }).catch(() => {});
      else if (!current.warned) {
        // One notice per wait, however many times they resend.
        current.warned = true;
        await ctx.reply(ctx.t.stillWorking).catch(() => {});
      }
      return;
    }
    inProgress.set(learnerId, { warned: false });

    // "typing…" in the chat header is easy to miss; a slow answer also gets a visible message, removed once it is out.
    let notice: Promise<number | undefined> | undefined;
    const timer = setTimeout(() => {
      notice = ctx.reply(ctx.t.thinking).then(
        (message) => message.message_id,
        () => undefined,
      );
    }, THINKING_NOTICE_AFTER_MS);

    void next()
      .catch((error) => reportError(ctx, error))
      .finally(async () => {
        clearTimeout(timer);
        inProgress.delete(learnerId);
        const noticeId = await notice;
        if (noticeId !== undefined && ctx.chat) await ctx.api.deleteMessage(ctx.chat.id, noticeId).catch(() => {});
      });
  });

  // "Add word", "Type my city", "My topic" and "My own picture" wait for the next message; any menu button, command or other button cancels the wait.
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text;
    const data = ctx.callbackQuery?.data;
    const isNavigation = text !== undefined && (ALL_MENU_LABELS.includes(text) || text.startsWith("/"));
    const startsWait = data === "words:add" || data === "set:city" || data === "topic:own" || data?.startsWith("pic:own:");
    if (isNavigation || (data !== undefined && !startsWait)) ctx.session.awaiting = undefined;
    await next();
  });

  bot.command(["start", "menu"], (ctx) => ctx.reply(welcome(ctx.t), { reply_markup: mainMenu(ctx.t) }));

  // A course picker pressed again after the course is set (e.g. an old message): the course stays; changing it is /course for the owner.
  onButton(bot, /^course:(ru|en)$/, (ctx) => ctx.reply(welcome(ctx.t), { reply_markup: mainMenu(ctx.t) }));

  bot.use(talk, drills, vocab, pictures, words, progress, settings, admin);

  // --- incoming voice and text that no button handler took ---

  bot.on("message:voice", async (ctx) => {
    const { session, course, t } = ctx;
    if (session.awaiting === "city") {
      await ctx.reply(t.typeCityName);
      return;
    }
    if (session.mode === "dictation" && !session.awaiting) {
      await ctx.reply(t.dictationNeedsTyping);
      return;
    }
    await withChatAction(ctx, "typing", async () => {
      const started = Date.now();
      const wav = await toWav16k(await downloadVoice(ctx, telegramToken));

      if (session.mode === "repeat" && session.target && !session.awaiting) {
        await assessRepeat(ctx, wav);
        return;
      }

      const rec = await recognize(wav, { lang: course.target });
      console.log(`[timing] voice download + recognition ${Date.now() - started} ms`);
      if (!rec.text) {
        await ctx.reply(t.noSpeech);
        return;
      }
      if (session.awaiting === "word") {
        await saveWord(ctx, rec.text);
        return;
      }
      if (session.awaiting === "topic") {
        await startOwnTopic(ctx, rec.text);
        return;
      }
      if (session.awaiting === "picture") {
        await startOwnPicture(ctx, rec.text);
        return;
      }
      if (session.mode === "vocab" && session.vocab?.card) {
        await answerVocab(ctx, rec.text, "voice");
        return;
      }
      await handleLearnerLine(ctx, rec.text, { kind: "voice", wav, lexical: rec.lexical ?? rec.text });
    });
  });

  bot.on("message:text", async (ctx) => {
    const { session } = ctx;
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) {
      await ctx.reply(ctx.t.useMenu, { reply_markup: mainMenu(ctx.t) });
      return;
    }
    await withChatAction(ctx, "typing", async () => {
      if (session.awaiting === "word") await saveWord(ctx, text);
      else if (session.awaiting === "city") await saveCityTimezone(ctx, text);
      else if (session.awaiting === "topic") await startOwnTopic(ctx, text);
      else if (session.awaiting === "picture") await startOwnPicture(ctx, text);
      else if (session.mode === "dictation" && session.target) await checkDictation(ctx, text);
      else if (session.mode === "vocab" && session.vocab?.card) await answerVocab(ctx, text, "text");
      else await handleLearnerLine(ctx, text, { kind: "text" });
    });
  });

  bot.catch((err) => reportError(err.ctx, err.error));

  return bot;
}
