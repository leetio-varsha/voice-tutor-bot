import { Composer } from "grammy";
import { onButton, type BotContext } from "../context.js";
import { learnerContext, startLesson } from "../lessons.js";
import { assessClarity } from "../speech/stt.js";
import * as store from "../store.js";
import { pictureInBackground } from "./pictures.js";
import * as tutor from "../tutor.js";
import { menuLabels } from "../i18n.js";
import { isTopicCategory, randomTopic, TOPICS } from "../topics.js";
import { categoryKeyboard, esc, lessonButtons, spoiler, topicKeyboard, UNCLEAR_BELOW } from "../ui.js";
import { renderVoice, sendVoice, speak } from "../voice.js";

export const talk = new Composer<BotContext>();

/** How many past role-plays the tutor is told to steer away from. */
const RECENT_SCENARIOS = 8;
const OWN_TOPIC_MAX_LENGTH = 200;
/** New words a day that go from conversation onto the ladder; more than that and reviews pile up. */
const GAP_WORDS_PER_DAY = 4;
/** How much of the learner's line is kept with a gap word, to show it back to them later. */
const MOMENT_MAX_LENGTH = 300;

// The picker is one message edited in place: categories, then the topics of one category.
const pickTopic = (ctx: BotContext) => ctx.reply(ctx.t.pickTopic, { reply_markup: categoryKeyboard(ctx.t) });
talk.hears(menuLabels("talk"), pickTopic);
onButton(talk, "menu:talk", pickTopic);
onButton(talk, "topics", (ctx) => ctx.editMessageText(ctx.t.pickTopic, { reply_markup: categoryKeyboard(ctx.t) }));

onButton(talk, /^tcat:(.+)$/, async (ctx) => {
  const category = ctx.match[1];
  if (!isTopicCategory(category)) return;
  await ctx.editMessageText(ctx.t.topicCategories[category], { reply_markup: topicKeyboard(ctx.t, category) });
});

async function beginRolePlay(ctx: BotContext, topic?: string): Promise<void> {
  const { session, learner, t } = ctx;
  await ctx.replyWithChatAction("typing");
  const recent = await store.recentScenarios(learner.id, RECENT_SCENARIOS);
  const start = await tutor.startLesson(await learnerContext(learner), topic, recent);
  await startLesson(session, learner, "talk", start.scenario_native, start.line_target);
  await ctx.reply(`<b>${esc(start.scenario_native)}</b>\n${esc(t.topicIntro)}`, { parse_mode: "HTML" });
  await speak(ctx, start.line_target, `${spoiler(start.line_target)}\n${spoiler(start.line_native)}`, lessonButtons(t));
}

onButton(talk, "topic:own", async (ctx) => {
  ctx.session.awaiting = "topic";
  await ctx.reply(ctx.t.ownTopicPrompt);
});

onButton(talk, /^topic:(.+)$/, async (ctx) => {
  // "Surprise me" is drawn here: left to itself the model keeps returning to the same few situations.
  const topic = ctx.match[1] === "random" ? randomTopic() : TOPICS.find((t) => t.id === ctx.match[1]);
  await beginRolePlay(ctx, topic?.scenario);
});

/** Handles the typed or spoken answer to "My topic". */
export async function startOwnTopic(ctx: BotContext, topic: string): Promise<void> {
  ctx.session.awaiting = undefined;
  await beginRolePlay(ctx, topic.slice(0, OWN_TOPIC_MAX_LENGTH));
}

/** The ladder drills one word or short set phrase; "exhausted / burned out" or a whole clause can't be recalled as a unit. */
const isLadderUnit = (term: string) => !term.includes("/") && term.trim().split(/\s+/).length <= 4;

export type LearnerInput = { kind: "text" } | { kind: "voice"; wav: Buffer; lexical: string };

/** One conversation turn: correction and feedback text, then the tutor's in-character voice reply. */
export async function handleLearnerLine(ctx: BotContext, text: string, input: LearnerInput): Promise<void> {
  const { session, learner, course, t } = ctx;
  if (session.mode !== "talk" || session.lessonId === undefined) {
    await startLesson(session, learner, "talk", "free conversation about their day", null);
  }
  const lessonId = session.lessonId!;
  const started = Date.now();

  // The clarity check doesn't feed Claude, so it runs alongside it instead of before it.
  const clarity =
    input.kind === "voice"
      ? assessClarity(input.wav, input.lexical, course.target).catch((err) => {
          console.warn("Clarity assessment failed:", err instanceof Error ? err.message : err);
          return undefined;
        })
      : Promise.resolve(undefined);

  const turn = await tutor.tutorTurn(session, await learnerContext(learner), text, input.kind);
  // Past the daily cap gaps are neither saved nor shown, so 💎 always means "this is on your ladder".
  const room = GAP_WORDS_PER_DAY - (await store.gapWordsSince(learner.id, course.target, 20));
  const gaps = turn.upgrades.filter((gap) => isLadderUnit(gap.word[course.target])).slice(0, Math.max(Math.min(room, 2), 0));
  // A last-rung word said unprompted is the ladder's finish line.
  const learned = turn.used_targets.length ? await store.markLearned(learner.id, course.target, turn.used_targets) : [];
  const claudeMs = Date.now() - started;
  session.history.push({ speaker: "learner", text }, { speaker: "tutor", text: turn.reply_target });

  // Start synthesis right away; the feedback text goes out while the voice renders.
  const voice = renderVoice(session, turn.reply_target, course.target);
  const unclear = (await clarity)?.words.filter((w) => w.accuracy < UNCLEAR_BELOW).map((w) => w.word) ?? [];

  const lines: string[] = [];
  if (input.kind === "voice") lines.push(`${esc(t.iHeard)}: <i>${esc(text)}</i>`);
  if (turn.corrected_target) lines.push(`${esc(t.better)}: <b>${esc(turn.corrected_target)}</b>`);
  lines.push(esc(turn.feedback_native));
  if (gaps.length) {
    lines.push(gaps.map((gap) => `${esc(t.upgrade)}: <i>${esc(gap.said)}</i> → <b>${esc(gap.word[course.target])}</b> (${esc(gap.word[course.native])})`).join("\n"));
  }
  if (learned.length) lines.push(`${esc(t.usedUnprompted)}: ${learned.map((w) => `<b>${esc(w[course.target])}</b>`).join(", ")}`);
  if (unclear.length) lines.push(`${esc(t.sayMoreClearly)}: ${unclear.map((w) => `<b>${esc(w)}</b>`).join(", ")}`);
  await ctx.reply(lines.join("\n\n"), { parse_mode: "HTML" });

  await ctx.replyWithChatAction("record_voice");
  await sendVoice(ctx, await voice, `${spoiler(turn.reply_target)}\n${spoiler(turn.reply_native)}`, lessonButtons(t));

  await store.addTurn(lessonId, {
    kind: input.kind,
    learnerText: text,
    corrected: turn.corrected_target,
    feedback: turn.feedback_native,
    tutorReply: turn.reply_target,
    unclearWords: unclear,
  });
  await store.addWords(learner.id, course.target, lessonId, "lesson", turn.new_words);
  const gapIds = await store.addGapWords(
    learner.id,
    course.target,
    lessonId,
    text.slice(0, MOMENT_MAX_LENGTH),
    gaps.map((gap) => ({ said: gap.said, ...gap.word })),
  );
  for (const id of gapIds) pictureInBackground(ctx, id);
  console.log(`[timing] ${input.kind} turn: claude ${claudeMs} ms, total after recognition ${Date.now() - started} ms`);
}

onButton(talk, "hint", async (ctx) => {
  const { session } = ctx;
  if (session.mode !== "talk" || session.history.length === 0) return;
  await ctx.replyWithChatAction("typing");
  const { options } = await tutor.suggestReplies(session, await learnerContext(ctx.learner));
  const text = options.map((o, i) => `${i + 1}. <b>${esc(o.say_target)}</b>\n${spoiler(o.translation_native)}`).join("\n\n");
  // Voice the suggestions so they can be shadowed, not just read.
  await speak(ctx, options.map((o) => o.say_target).join(" … "), `${esc(ctx.t.youCouldSay)}\n\n${text}`, lessonButtons(ctx.t));
});
