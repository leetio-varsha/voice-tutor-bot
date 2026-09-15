import { InlineKeyboard, Keyboard } from "grammy";
import type { PronunciationResult } from "./speech/types.js";

export const CAPTION_LIMIT = 1024;
// Words scoring below this are highlighted, both in drills and as "say more clearly" in conversation.
export const UNCLEAR_BELOW = 80;

export const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const spoiler = (text: string) => `<tg-spoiler>${esc(text)}</tg-spoiler>`;
export const stripStress = (text: string) => text.replace(/́/g, "");
export const clip = (html: string) => (html.length <= CAPTION_LIMIT ? html : html.slice(0, CAPTION_LIMIT - 1) + "…");

// The learner never types commands; everything is a button.
export const MENU = {
  talk: "🗣 Talk",
  repeat: "🎧 Repeat after me",
  dictation: "✍️ Dictation",
  words: "📚 My words",
  progress: "📈 Progress",
  settings: "⚙️ Settings",
} as const;

export const mainMenu = new Keyboard()
  .text(MENU.talk)
  .text(MENU.repeat)
  .row()
  .text(MENU.dictation)
  .text(MENU.words)
  .row()
  .text(MENU.progress)
  .text(MENU.settings)
  .resized()
  .persistent()
  .placeholder("Hold the mic and speak Russian");

export const TOPICS: { id: string; label: string; scenario?: string }[] = [
  { id: "cafe", label: "☕ Café", scenario: "ordering at a café" },
  { id: "taxi", label: "🚕 Taxi", scenario: "a taxi ride: giving directions and small talk with the driver" },
  { id: "market", label: "🛒 Market", scenario: "buying groceries at a market and asking about prices" },
  { id: "neighbour", label: "🏠 Neighbour", scenario: "meeting a new neighbour in the building" },
  { id: "work", label: "💼 Work call", scenario: "a short call with a Russian-speaking colleague" },
  { id: "pharmacy", label: "💊 Pharmacy", scenario: "explaining how they feel at a pharmacy" },
  { id: "day", label: "🗓 My day", scenario: "chatting with a friend about their day and plans" },
  { id: "random", label: "🎲 Surprise me" },
];

export function topicKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  TOPICS.forEach((topic, i) => {
    keyboard.text(topic.label, `topic:${topic.id}`);
    if (i % 2 === 1) keyboard.row();
  });
  return keyboard;
}

export const lessonButtons = () =>
  new InlineKeyboard().text("🐢 Slower", "slower").text("💡 Help me answer", "hint").row().text("⏹ Finish", "finish").danger();

export const drillButtons = (next: "repeat:next" | "dictation:next") =>
  new InlineKeyboard().text("🐢 Slower", "slower").text("➡️ Next", next).primary().row().text("⏹ Finish", "finish").danger();

export function wordScoresLine(result: PronunciationResult): string {
  return result.words
    .map((w) => {
      const label = `${esc(w.word)} ${Math.round(w.accuracy)}`;
      return w.accuracy < UNCLEAR_BELOW || (w.errorType !== "None" && w.errorType !== "") ? `<u>${label}</u>` : label;
    })
    .join(" · ");
}
