import { Bot, GrammyError } from "grammy";
import { toWav16k } from "./audio.js";
import { assertBotConfig, config } from "./config.js";
import type { BotContext } from "./context.js";
import { migrate, pool } from "./db.js";
import { admin } from "./features/admin.js";
import { assessRepeat, checkDictation, drills } from "./features/drills.js";
import { progress } from "./features/progress.js";
import { saveCityTimezone, settings } from "./features/settings.js";
import { handleLearnerLine, talk } from "./features/talk.js";
import { saveWord, words } from "./features/words.js";
import { restoreSession } from "./lessons.js";
import { startScheduler } from "./scheduler.js";
import { getSession } from "./session.js";
import { recognize } from "./speech/stt.js";
import * as store from "./store.js";
import { getTtsProvider } from "./tts/index.js";
import { MENU, mainMenu } from "./ui.js";
import { downloadVoice, withChatAction } from "./voice.js";

const { telegramToken } = assertBotConfig();
await migrate();

const bot = new Bot<BotContext>(telegramToken);

// --- access control: the bot spends paid API credits, so only listed users get through ---

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (userId !== undefined && config.allowedUserIds.includes(userId)) return next();
  console.warn(`Blocked update from user ${userId ?? "unknown"}`);
  if (ctx.chat?.type === "private") {
    await ctx.reply(`This bot is private. Your Telegram user id is ${userId}; ask the owner to add it to ALLOWED_USER_IDS.`);
  }
});

// --- learner profile and in-progress lesson state for every update ---

bot.use(async (ctx, next) => {
  const learner = await store.ensureLearner(ctx.from!.id, ctx.from!.first_name);
  await restoreSession(learner);
  ctx.learner = learner;
  ctx.session = getSession(learner.id);
  await next();
});

// "Add word" and "Type my city" wait for the next message; any menu button, command or other button cancels the wait.
bot.use(async (ctx, next) => {
  const text = ctx.message?.text;
  const data = ctx.callbackQuery?.data;
  const isNavigation = text !== undefined && ((Object.values(MENU) as string[]).includes(text) || text.startsWith("/"));
  if (isNavigation || (data !== undefined && data !== "words:add" && data !== "set:city")) ctx.session.awaiting = undefined;
  await next();
});

bot.command(["start", "menu"], (ctx) =>
  ctx.reply(
    [
      "Привет! I'm your Russian speaking coach.",
      "",
      `${MENU.talk}: a role-play conversation, voice in and voice out`,
      `${MENU.repeat}: say a phrase and get a pronunciation score`,
      `${MENU.dictation}: listen and type what you hear`,
      `${MENU.progress}: your streak and how you're improving`,
      `${MENU.settings}: reminder times and timezone`,
      "",
      "Or just hold the mic and say something in Russian.",
    ].join("\n"),
    { reply_markup: mainMenu },
  ),
);

bot.use(talk, drills, words, progress, settings, admin);

// --- incoming voice and text that no button handler took ---

bot.on("message:voice", async (ctx) => {
  const { session } = ctx;
  if (session.awaiting === "city") {
    await ctx.reply("Please type the city name.");
    return;
  }
  if (session.mode === "dictation" && session.awaiting !== "word") {
    await ctx.reply("For dictation, type the sentence you heard.");
    return;
  }
  await withChatAction(ctx, "typing", async () => {
    const started = Date.now();
    const wav = await toWav16k(await downloadVoice(ctx, telegramToken));

    if (session.mode === "repeat" && session.target && session.awaiting !== "word") {
      await assessRepeat(ctx, wav);
      return;
    }

    const rec = await recognize(wav);
    console.log(`[timing] voice download + recognition ${Date.now() - started} ms`);
    if (!rec.text) {
      await ctx.reply("I couldn't make out any speech there. Try again a bit closer to the mic.");
      return;
    }
    if (session.awaiting === "word") {
      await saveWord(ctx, rec.text);
      return;
    }
    await handleLearnerLine(ctx, rec.text, { kind: "voice", wav, lexical: rec.lexical ?? rec.text });
  });
});

bot.on("message:text", async (ctx) => {
  const { session } = ctx;
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) {
    await ctx.reply("Use the menu below.", { reply_markup: mainMenu });
    return;
  }
  await withChatAction(ctx, "typing", async () => {
    if (session.awaiting === "word") await saveWord(ctx, text);
    else if (session.awaiting === "city") await saveCityTimezone(ctx, text);
    else if (session.mode === "dictation" && session.target) await checkDictation(ctx, text);
    else await handleLearnerLine(ctx, text, { kind: "text" });
  });
});

bot.catch(async (err) => {
  console.error(`Error while handling update ${err.ctx.update.update_id}:`, err.error);
  const message = err.error instanceof Error ? err.error.message : String(err.error);
  await err.ctx.reply(`Sorry, something went wrong: ${message}`).catch(() => {});
});

await bot.api.setMyCommands([{ command: "menu", description: "Show the main menu" }]);

const scheduler = startScheduler(bot.api);

async function shutdown() {
  clearInterval(scheduler);
  await bot.stop();
  await pool.end();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

// Long polling: no public URL needed. During a deploy the previous instance may still be polling,
// and Telegram answers 409 Conflict; wait for it to stop instead of crashing.
const MAX_CONFLICT_RETRIES = 24;
for (let attempt = 1; ; attempt++) {
  try {
    await bot.start({
      onStart: (me) =>
        console.log(
          `@${me.username} is running. TTS: ${getTtsProvider()}, STT: ${config.azure ? "azure + pronunciation" : "openai"}, model: ${config.claudeModel}, allowed users: ${config.allowedUserIds.join(", ") || "none"}`,
        ),
    });
    break;
  } catch (err) {
    if (err instanceof GrammyError && err.error_code === 409 && attempt <= MAX_CONFLICT_RETRIES) {
      console.warn(`Another instance is still polling Telegram; retrying in 5 s (${attempt}/${MAX_CONFLICT_RETRIES})`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    throw err;
  }
}
