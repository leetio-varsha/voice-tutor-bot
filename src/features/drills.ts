import { Composer } from "grammy";
import { onButton, type BotContext } from "../context.js";
import { ensureDrillLesson, learnerContext } from "../lessons.js";
import { recognize } from "../speech/stt.js";
import * as store from "../store.js";
import * as tutor from "../tutor.js";
import { menuLabels } from "../i18n.js";
import { drillButtons, esc, spoiler, UNCLEAR_BELOW, wordScoresLine } from "../ui.js";
import { speak } from "../voice.js";

export const drills = new Composer<BotContext>();

// --- repeat after me ---

async function nextRepeat(ctx: BotContext) {
  const { session, learner } = ctx;
  await ctx.replyWithChatAction("typing");
  await ensureDrillLesson(session, learner, "repeat");
  const drill = await tutor.repeatPhrase(await learnerContext(learner), session.usedTargets);
  session.target = drill.phrase_target;
  session.usedTargets.push(drill.phrase_target);
  await speak(
    ctx,
    drill.phrase_target,
    `<b>${esc(drill.phrase_display)}</b>\n${spoiler(drill.translation_native)}\n<i>${esc(drill.focus_native)}</i>\n\n${esc(ctx.t.repeatPrompt)}`,
    drillButtons(ctx.t, "repeat:next"),
  );
}

drills.hears(menuLabels("repeat"), nextRepeat);
onButton(drills, "repeat:next", nextRepeat);

export async function assessRepeat(ctx: BotContext, wav: Buffer): Promise<void> {
  const { session, course, t } = ctx;
  const target = session.target!;
  const started = Date.now();
  const rec = await recognize(wav, { lang: course.target, referenceText: target });
  if (!rec.pronunciation) {
    await ctx.reply(t.noPronunciationScoring(esc(rec.text), esc(target)), { parse_mode: "HTML", reply_markup: drillButtons(t, "repeat:next") });
    return;
  }
  const p = rec.pronunciation;
  const feedback = await tutor.pronunciationFeedback(course, target, rec.text, p);
  const scores = t.scores(Math.round(p.accuracy), Math.round(p.fluency), p.completeness === undefined ? undefined : Math.round(p.completeness));
  const tips = feedback.tips_native.map((tip) => `• ${esc(tip)}`).join("\n");
  await ctx.reply(
    [`<b>${Math.round(p.pronScore)}/100</b> (${scores})`, wordScoresLine(p), esc(feedback.verdict_native), tips, esc(t.sayAgain)]
      .filter(Boolean)
      .join("\n\n"),
    { parse_mode: "HTML", reply_markup: drillButtons(t, "repeat:next") },
  );

  if (session.lessonId !== undefined) {
    const weak = p.words.filter((w) => w.accuracy < UNCLEAR_BELOW || w.errorType !== "None").map((w) => ({ word: w.word, score: Math.round(w.accuracy), error: w.errorType }));
    await store.addDrillAttempt(session.lessonId, { kind: "repeat", target, answer: rec.text, score: p.pronScore, details: { weak } });
  }
  console.log(`[timing] repeat drill: assessment + feedback ${Date.now() - started} ms`);
}

// --- dictation ---

async function nextDictation(ctx: BotContext) {
  const { session, learner } = ctx;
  await ctx.replyWithChatAction("typing");
  await ensureDrillLesson(session, learner, "dictation");
  const dictation = await tutor.dictationSentence(await learnerContext(learner), session.usedTargets);
  session.target = dictation.sentence_target;
  session.usedTargets.push(dictation.sentence_target);
  await speak(ctx, dictation.sentence_target, `${esc(ctx.t.dictationPrompt)}\n${spoiler(dictation.translation_native)}`, drillButtons(ctx.t, "dictation:next"));
}

drills.hears(menuLabels("dictation"), nextDictation);
onButton(drills, "dictation:next", nextDictation);

export async function checkDictation(ctx: BotContext, typed: string): Promise<void> {
  const { session, course, t } = ctx;
  const target = session.target!;
  await ctx.replyWithChatAction("typing");
  const result = await tutor.checkDictation(course, target, typed);
  const mistakes = result.mistakes.map((m) => `• <s>${esc(m.typed)}</s> → <b>${esc(m.correct)}</b>: ${esc(m.rule_native)}`).join("\n");
  await ctx.reply(
    [result.all_correct ? `<b>${esc(t.perfect)}</b>` : mistakes, `${esc(t.correct)}: <b>${esc(target)}</b>`, esc(result.comment_native)].join("\n\n"),
    { parse_mode: "HTML", reply_markup: drillButtons(t, "dictation:next") },
  );
  if (session.lessonId !== undefined) {
    await store.addDrillAttempt(session.lessonId, {
      kind: "dictation",
      target,
      answer: typed,
      score: null,
      details: { mistakes: result.mistakes.map((m) => ({ typed: m.typed, correct: m.correct })) },
    });
  }
}
