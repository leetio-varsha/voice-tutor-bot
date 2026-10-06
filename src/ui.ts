import { InlineKeyboard, Keyboard } from "grammy";
import type { UiText } from "./i18n.js";
import type { PronunciationResult } from "./speech/types.js";
import { TOPIC_CATEGORIES, TOPICS, type TopicCategory } from "./topics.js";

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
    .text(t.menu.vocab)
    .row()
    .text(t.menu.repeat)
    .text(t.menu.dictation)
    .row()
    .text(t.menu.words)
    .text(t.menu.progress)
    .row()
    .text(t.menu.settings)
    .resized()
    .persistent()
    .placeholder(t.micPlaceholder);

/** First step of the topic picker: categories, plus a random topic and the learner's own. */
export function categoryKeyboard(t: UiText): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  TOPIC_CATEGORIES.forEach((category, i) => {
    keyboard.text(t.topicCategories[category], `tcat:${category}`);
    if (i % 2 === 1) keyboard.row();
  });
  return keyboard.row().text(t.surpriseMe, "topic:random").text(t.ownTopic, "topic:own");
}

export function topicKeyboard(t: UiText, category: TopicCategory): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  TOPICS.filter((topic) => topic.category === category).forEach((topic, i) => {
    keyboard.text(t.topics[topic.id], `topic:${topic.id}`);
    if (i % 2 === 1) keyboard.row();
  });
  return keyboard.row().text(t.back, "topics");
}

export const lessonButtons = (t: UiText) =>
  new InlineKeyboard().text(t.slower, "slower").text(t.helpMeAnswer, "hint").row().text(t.finish, "finish").danger();

export const drillButtons = (t: UiText, next: "repeat:next" | "dictation:next") =>
  new InlineKeyboard().text(t.slower, "slower").text(t.next, next).primary().row().text(t.finish, "finish").danger();

export const vocabButtons = (t: UiText) =>
  new InlineKeyboard().text(t.hint, "vocab:hint").text(t.skip, "vocab:skip").row().text(t.finish, "finish").danger();

export function wordScoresLine(result: PronunciationResult): string {
  return result.words
    .map((w) => {
      const label = `${esc(w.word)} ${Math.round(w.accuracy)}`;
      return w.accuracy < UNCLEAR_BELOW || (w.errorType !== "None" && w.errorType !== "") ? `<u>${label}</u>` : label;
    })
    .join(" · ");
}
