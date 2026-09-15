import { Composer, InlineKeyboard, InputFile } from "grammy";
import { toTelegramVoice } from "../audio.js";
import { onButton, type BotContext } from "../context.js";
import { finishCurrentLesson } from "../lessons.js";
import * as store from "../store.js";
import type { Word } from "../store.js";
import * as tutor from "../tutor.js";
import { esc, MENU } from "../ui.js";
import { renderVoice, sendVoice, SLOWER_TEMPO, withChatAction } from "../voice.js";

export const words = new Composer<BotContext>();

const WORD_LIST_LIMIT = 15;
const WORD_BUTTONS_PER_ROW = 5;

type WordListMode = "listen" | "edit";

/**
 * A word list message. The word ids live in its buttons (say:<id> / del:<id>), so any list
 * message can be edited or played later without server-side state about what it showed.
 */
function wordListView(list: Word[], title: string, mode: WordListMode) {
  const lines = list.map((w, i) => `${i + 1}. <b>${esc(w.ru)}</b> - ${esc(w.en)}`);
  const text = `${esc(title)}\n\n${lines.join("\n") || "(empty)"}`;

  const keyboard = new InlineKeyboard();
  list.forEach((w, i) => {
    if (mode === "listen") keyboard.text(`🔊 ${i + 1}`, `say:${w.id}`);
    else keyboard.text(`✖ ${i + 1}`, `del:${w.id}`);
    if ((i + 1) % WORD_BUTTONS_PER_ROW === 0) keyboard.row();
  });
  keyboard.row();
  if (mode === "listen") {
    if (list.length) keyboard.text("🔊 Listen to all", "say:all").primary().row().text("✏️ Edit", "words:edit");
    keyboard.text("➕ Add word", "words:add");
  } else {
    keyboard.text("✅ Done", "words:done").success();
  }
  return { text, keyboard };
}

/** Word ids and title recovered from the list message whose button was pressed. */
function listOnMessage(ctx: BotContext): { ids: number[]; title: string } {
  const message = ctx.callbackQuery?.message;
  const rows = message && "reply_markup" in message ? (message.reply_markup?.inline_keyboard ?? []) : [];
  const ids = rows.flat().flatMap((button) => {
    const match = "callback_data" in button ? /^(?:say|del):(\d+)$/.exec(button.callback_data) : null;
    return match ? [Number(match[1])] : [];
  });
  const text = message && "text" in message ? (message.text ?? "") : "";
  return { ids, title: text.split("\n\n")[0] || "Your words:" };
}

words.hears(MENU.words, async (ctx) => {
  const { words: latest, total } = await store.latestWords(ctx.learner.id, WORD_LIST_LIMIT);
  if (total === 0) {
    await ctx.reply("No words yet. Have a conversation, or add your own.", {
      reply_markup: new InlineKeyboard().text("➕ Add word", "words:add"),
    });
    return;
  }
  const title = total > latest.length ? `Your words (latest ${latest.length} of ${total}):` : "Your words:";
  const view = wordListView(latest, title, "listen");
  await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
});

onButton(words, "finish", async (ctx) => {
  const { session, learner } = ctx;
  const lessonWords = session.lessonId !== undefined ? await store.lessonWords(session.lessonId) : [];
  await finishCurrentLesson(session, learner.id);
  if (lessonWords.length === 0) {
    await ctx.reply("Отлично поработали! See you next time.");
    return;
  }
  const view = wordListView(lessonWords.slice(-WORD_LIST_LIMIT), "Отлично поработали! Words from this session:", "listen");
  await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
});

onButton(words, /^say:(\d+)$/, async (ctx) => {
  const word = await store.findWord(ctx.learner.id, Number(ctx.match[1]));
  if (!word) return;
  await ctx.replyWithChatAction("record_voice");
  await sendVoice(ctx, await renderVoice(ctx.session, word.ru), `<b>${esc(word.ru)}</b> - ${esc(word.en)}`, new InlineKeyboard().text("🐢 Slower", "slower"));
});

onButton(words, "say:all", async (ctx) => {
  const list = await store.findWords(ctx.learner.id, listOnMessage(ctx).ids);
  if (list.length === 0) return;
  await withChatAction(ctx, "record_voice", async () => {
    // Ellipses give TTS voices a clear pause between phrases.
    const voice = await renderVoice(ctx.session, list.map((w) => w.ru.replace(/[.…]+$/, "")).join(" … "));
    await sendVoice(ctx, voice, list.map((w) => esc(w.ru)).join(" · "), new InlineKeyboard().text("🐢 Slower", "slower"));
  });
});

onButton(words, "slower", async (ctx) => {
  const { session } = ctx;
  if (!session.lastAudio) return;
  await ctx.replyWithChatAction("record_voice");
  const voice = await toTelegramVoice(session.lastAudio, SLOWER_TEMPO);
  await ctx.replyWithVoice(new InputFile(voice, "slower.ogg"), { caption: "🐢 Slower" });
});

// --- editing the list in place ---

onButton(words, "words:edit", async (ctx) => {
  const { ids, title } = listOnMessage(ctx);
  const list = await store.findWords(ctx.learner.id, ids);
  await ctx.editMessageReplyMarkup({ reply_markup: wordListView(list, title, "edit").keyboard });
});

onButton(words, "words:done", async (ctx) => {
  const { ids, title } = listOnMessage(ctx);
  const list = await store.findWords(ctx.learner.id, ids);
  await ctx.editMessageReplyMarkup({ reply_markup: wordListView(list, title, "listen").keyboard });
});

onButton(words, /^del:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const { ids, title } = listOnMessage(ctx);
  await store.deleteWord(ctx.learner.id, id);
  const view = wordListView(await store.findWords(ctx.learner.id, ids.filter((wordId) => wordId !== id)), title, "edit");
  await ctx.editMessageText(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
});

onButton(words, "words:add", async (ctx) => {
  ctx.session.awaiting = "word";
  await ctx.reply("Send a word or phrase to save: type it or say it. Russian or English both work.");
});

export async function saveWord(ctx: BotContext, input: string): Promise<void> {
  const { session, learner } = ctx;
  session.awaiting = undefined;
  const [word] = await store.addWords(learner.id, session.lessonId ?? null, "manual", [await tutor.translateWord(input)]);
  await ctx.reply(`${word!.isNew ? "Added" : "Already in your list"}: <b>${esc(word!.ru)}</b> - ${esc(word!.en)}`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("🔊 Listen", `say:${word!.id}`).text("➕ Add another", "words:add"),
  });
}
