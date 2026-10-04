import { Composer, InlineKeyboard, InputFile } from "grammy";
import { toTelegramVoice } from "../audio.js";
import { onButton, type BotContext } from "../context.js";
import type { Course } from "../courses.js";
import { menuLabels, type UiText } from "../i18n.js";
import { finishCurrentLesson } from "../lessons.js";
import * as store from "../store.js";
import type { Word } from "../store.js";
import * as tutor from "../tutor.js";
import { esc } from "../ui.js";
import { renderVoice, sendVoice, SLOWER_TEMPO, withChatAction } from "../voice.js";

export const words = new Composer<BotContext>();

const WORD_LIST_LIMIT = 15;
const WORD_BUTTONS_PER_ROW = 5;

type WordListMode = "listen" | "edit";

const slowerButton = (t: UiText) => new InlineKeyboard().text(t.slower, "slower");

/**
 * A word list message. The word ids live in its buttons (say:<id> / del:<id>), so any list
 * message can be edited or played later without server-side state about what it showed.
 */
function wordListView(ctx: BotContext, list: Word[], title: string, mode: WordListMode) {
  const { t } = ctx;
  const lines = list.map((w, i) => `${i + 1}. ${wordLine(ctx.course, w)}`);
  const text = `${esc(title)}\n\n${lines.join("\n") || esc(t.empty)}`;

  const keyboard = new InlineKeyboard();
  list.forEach((w, i) => {
    if (mode === "listen") keyboard.text(`🔊 ${i + 1}`, `say:${w.id}`);
    else keyboard.text(`✖ ${i + 1}`, `del:${w.id}`);
    if ((i + 1) % WORD_BUTTONS_PER_ROW === 0) keyboard.row();
  });
  keyboard.row();
  if (mode === "listen") {
    if (list.length) keyboard.text(t.listenToAll, "say:all").primary().row().text(t.edit, "words:edit");
    keyboard.text(t.addWord, "words:add");
  } else {
    keyboard.text(t.done, "words:done").success();
  }
  return { text, keyboard };
}

/** "<b>word</b> - translation", with the side the learner studies first. */
const wordLine = (course: Course, w: Word) => `<b>${esc(w[course.target])}</b> - ${esc(w[course.native])}`;

/** Word ids and title recovered from the list message whose button was pressed. */
function listOnMessage(ctx: BotContext): { ids: number[]; title: string } {
  const message = ctx.callbackQuery?.message;
  const rows = message && "reply_markup" in message ? (message.reply_markup?.inline_keyboard ?? []) : [];
  const ids = rows.flat().flatMap((button) => {
    const match = "callback_data" in button ? /^(?:say|del):(\d+)$/.exec(button.callback_data) : null;
    return match ? [Number(match[1])] : [];
  });
  const text = message && "text" in message ? (message.text ?? "") : "";
  return { ids, title: text.split("\n\n")[0] || ctx.t.yourWords };
}

words.hears(menuLabels("words"), async (ctx) => {
  const { t } = ctx;
  const { words: latest, total } = await store.latestWords(ctx.learner.id, ctx.course.target, WORD_LIST_LIMIT);
  if (total === 0) {
    await ctx.reply(t.noWordsYet, { reply_markup: new InlineKeyboard().text(t.addWord, "words:add") });
    return;
  }
  const title = total > latest.length ? t.yourLatestWords(latest.length, total) : t.yourWords;
  const view = wordListView(ctx, latest, title, "listen");
  await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
});

onButton(words, "finish", async (ctx) => {
  const { session, learner } = ctx;
  const lessonWords = session.lessonId !== undefined ? await store.lessonWords(session.lessonId) : [];
  await finishCurrentLesson(session, learner.id);
  if (lessonWords.length === 0) {
    await ctx.reply(ctx.t.sessionDone);
    return;
  }
  const view = wordListView(ctx, lessonWords.slice(-WORD_LIST_LIMIT), ctx.t.sessionWords, "listen");
  await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
});

onButton(words, /^say:(\d+)$/, async (ctx) => {
  const word = await store.findWord(ctx.learner.id, Number(ctx.match[1]));
  if (!word) return;
  const { course } = ctx;
  await ctx.replyWithChatAction("record_voice");
  await sendVoice(ctx, await renderVoice(ctx.session, word[course.target], course.target), wordLine(course, word), slowerButton(ctx.t));
});

onButton(words, "say:all", async (ctx) => {
  const list = await store.findWords(ctx.learner.id, listOnMessage(ctx).ids);
  if (list.length === 0) return;
  const { course } = ctx;
  await withChatAction(ctx, "record_voice", async () => {
    // Ellipses give TTS voices a clear pause between phrases.
    const voice = await renderVoice(ctx.session, list.map((w) => w[course.target].replace(/[.…]+$/, "")).join(" … "), course.target);
    await sendVoice(ctx, voice, list.map((w) => esc(w[course.target])).join(" · "), slowerButton(ctx.t));
  });
});

onButton(words, "slower", async (ctx) => {
  const { session } = ctx;
  if (!session.lastAudio) return;
  await ctx.replyWithChatAction("record_voice");
  const voice = await toTelegramVoice(session.lastAudio, SLOWER_TEMPO);
  await ctx.replyWithVoice(new InputFile(voice, "slower.ogg"), { caption: ctx.t.slower });
});

// --- editing the list in place ---

onButton(words, "words:edit", async (ctx) => {
  const { ids, title } = listOnMessage(ctx);
  const list = await store.findWords(ctx.learner.id, ids);
  await ctx.editMessageReplyMarkup({ reply_markup: wordListView(ctx, list, title, "edit").keyboard });
});

onButton(words, "words:done", async (ctx) => {
  const { ids, title } = listOnMessage(ctx);
  const list = await store.findWords(ctx.learner.id, ids);
  await ctx.editMessageReplyMarkup({ reply_markup: wordListView(ctx, list, title, "listen").keyboard });
});

onButton(words, /^del:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const { ids, title } = listOnMessage(ctx);
  await store.deleteWord(ctx.learner.id, id);
  const view = wordListView(ctx, await store.findWords(ctx.learner.id, ids.filter((wordId) => wordId !== id)), title, "edit");
  await ctx.editMessageText(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
});

onButton(words, "words:add", async (ctx) => {
  ctx.session.awaiting = "word";
  await ctx.reply(ctx.t.addWordPrompt);
});

export async function saveWord(ctx: BotContext, input: string): Promise<void> {
  const { session, learner, course, t } = ctx;
  session.awaiting = undefined;
  const [word] = await store.addWords(learner.id, course.target, session.lessonId ?? null, "manual", [await tutor.translateWord(course, input)]);
  await ctx.reply(`${esc(word!.isNew ? t.added : t.alreadyInList)}: ${wordLine(course, word!)}`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text(t.listen, `say:${word!.id}`).text(t.addAnother, "words:add"),
  });
}
