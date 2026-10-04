import { Composer } from "grammy";
import { onButton, type BotContext } from "../context.js";
import { learnerContext, startLesson } from "../lessons.js";
import { assessClarity } from "../speech/stt.js";
import * as store from "../store.js";
import * as tutor from "../tutor.js";
import { menuLabels } from "../i18n.js";
import { esc, lessonButtons, spoiler, topicKeyboard, TOPICS, UNCLEAR_BELOW } from "../ui.js";
import { renderVoice, sendVoice, speak } from "../voice.js";

export const talk = new Composer<BotContext>();

const pickTopic = (ctx: BotContext) => ctx.reply(ctx.t.pickTopic, { reply_markup: topicKeyboard(ctx.t) });
talk.hears(menuLabels("talk"), pickTopic);
onButton(talk, "menu:talk", pickTopic);

onButton(talk, /^topic:(.+)$/, async (ctx) => {
  const topic = TOPICS.find((t) => t.id === ctx.match[1]);
  await ctx.replyWithChatAction("typing");
  const start = await tutor.startLesson(await learnerContext(ctx.learner), topic?.scenario);
  await startLesson(ctx.session, ctx.learner, "talk", start.scenario_native, start.line_target);
  await ctx.reply(`<b>${esc(start.scenario_native)}</b>\n${esc(ctx.t.topicIntro)}`, { parse_mode: "HTML" });
  await speak(ctx, start.line_target, `${spoiler(start.line_target)}\n${spoiler(start.line_native)}`, lessonButtons(ctx.t));
});

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
  const claudeMs = Date.now() - started;
  session.history.push({ speaker: "learner", text }, { speaker: "tutor", text: turn.reply_target });

  // Start synthesis right away; the feedback text goes out while the voice renders.
  const voice = renderVoice(session, turn.reply_target, course.target);
  const unclear = (await clarity)?.words.filter((w) => w.accuracy < UNCLEAR_BELOW).map((w) => w.word) ?? [];

  const lines: string[] = [];
  if (input.kind === "voice") lines.push(`${esc(t.iHeard)}: <i>${esc(text)}</i>`);
  if (turn.corrected_target) lines.push(`${esc(t.better)}: <b>${esc(turn.corrected_target)}</b>`);
  lines.push(esc(turn.feedback_native));
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
