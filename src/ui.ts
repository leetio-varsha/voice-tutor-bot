import { InlineKeyboard, Keyboard } from "grammy";
import type { TopicId, UiText } from "./i18n.js";
import type { PronunciationResult } from "./speech/types.js";

export const CAPTION_LIMIT = 1024;
// Words scoring below this are highlighted, both in drills and as "say more clearly" in conversation.
export const UNCLEAR_BELOW = 80;

export const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const spoiler = (text: string) => `<tg-spoiler>${esc(text)}</tg-spoiler>`;
export const stripStress = (text: string) => text.replace(/́/g, "");
export const clip = (html: string) => (html.length <= CAPTION_LIMIT ? html : html.slice(0, CAPTION_LIMIT - 1) + "…");

// The learner never types commands; everything is a button.
export const mainMenu = (t: UiText) =>
  new Keyboard()
    .text(t.menu.talk)
    .text(t.menu.repeat)
    .row()
    .text(t.menu.dictation)
    .text(t.menu.words)
    .row()
    .text(t.menu.progress)
    .text(t.menu.settings)
    .resized()
    .persistent()
    .placeholder(t.micPlaceholder);

/** Scenarios are prompt text for Claude; button labels come from UiText.topics. */
export const TOPICS: { id: TopicId; scenario?: string }[] = [
  { id: "cafe", scenario: "ordering at a café" },
  { id: "taxi", scenario: "a taxi ride: giving directions and small talk with the driver" },
  { id: "market", scenario: "buying groceries at a market and asking about prices" },
  { id: "neighbour", scenario: "meeting a new neighbour in the building" },
  { id: "work", scenario: "a short call with a colleague" },
  { id: "pharmacy", scenario: "explaining how they feel at a pharmacy" },
  { id: "day", scenario: "chatting with a friend about their day and plans" },
  { id: "random" },
];

export function topicKeyboard(t: UiText): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  TOPICS.forEach((topic, i) => {
    keyboard.text(t.topics[topic.id], `topic:${topic.id}`);
    if (i % 2 === 1) keyboard.row();
  });
  return keyboard;
}

export const lessonButtons = (t: UiText) =>
  new InlineKeyboard().text(t.slower, "slower").text(t.helpMeAnswer, "hint").row().text(t.finish, "finish").danger();

export const drillButtons = (t: UiText, next: "repeat:next" | "dictation:next") =>
  new InlineKeyboard().text(t.slower, "slower").text(t.next, next).primary().row().text(t.finish, "finish").danger();

export function wordScoresLine(result: PronunciationResult): string {
  return result.words
    .map((w) => {
      const label = `${esc(w.word)} ${Math.round(w.accuracy)}`;
      return w.accuracy < UNCLEAR_BELOW || (w.errorType !== "None" && w.errorType !== "") ? `<u>${label}</u>` : label;
    })
    .join(" · ");
}
