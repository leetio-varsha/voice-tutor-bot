import { Composer } from "grammy";
import { onButton, type BotContext } from "../context.js";
import { ensureDrillLesson, learnerContext } from "../lessons.js";
import { recognize } from "../speech/stt.js";
import * as store from "../store.js";
import * as tutor from "../tutor.js";
import { drillButtons, esc, MENU, spoiler, UNCLEAR_BELOW, wordScoresLine } from "../ui.js";
import { speak } from "../voice.js";

export const drills = new Composer<BotContext>();

// --- repeat after me ---

async function nextRepeat(ctx: BotContext) {
  const { session, learner } = ctx;
  await ctx.replyWithChatAction("typing");
  await ensureDrillLesson(session, learner, "repeat");
  const drill = await tutor.repeatPhrase(await learnerContext(learner), session.usedTargets);
  session.target = drill.phrase_ru;
  session.usedTargets.push(drill.phrase_ru);
  await speak(
    ctx,
    drill.phrase_ru,
    `<b>${esc(drill.phrase_ru_stressed)}</b>\n${spoiler(drill.translation_en)}\n<i>${esc(drill.focus_en)}</i>\n\nListen, then hold the mic and say it.`,
    drillButtons("repeat:next"),
  );
}

drills.hears(MENU.repeat, nextRepeat);
onButton(drills, "repeat:next", nextRepeat);

export async function assessRepeat(ctx: BotContext, wav: Buffer): Promise<void> {
  const { session } = ctx;
  const target = session.target!;
  const started = Date.now();
  const rec = await recognize(wav, { referenceText: target });
  if (!rec.pronunciation) {
    await ctx.reply(
      `I heard: <i>${esc(rec.text || "(nothing)")}</i>\nTarget: <b>${esc(target)}</b>\n\n(Pronunciation scoring needs Azure Speech configured.)`,
      { parse_mode: "HTML", reply_markup: drillButtons("repeat:next") },
    );
    return;
  }
  const p = rec.pronunciation;
  const feedback = await tutor.pronunciationFeedback(target, rec.text, p);
  const scores = `accuracy ${Math.round(p.accuracy)} · fluency ${Math.round(p.fluency)}${p.completeness === undefined ? "" : ` · completeness ${Math.round(p.completeness)}`}`;
  const tips = feedback.tips_en.map((tip) => `• ${esc(tip)}`).join("\n");
  await ctx.reply(
    [`<b>${Math.round(p.pronScore)}/100</b> (${scores})`, wordScoresLine(p), esc(feedback.verdict_en), tips, "Say it again, or tap Next."]
      .filter(Boolean)
      .join("\n\n"),
    { parse_mode: "HTML", reply_markup: drillButtons("repeat:next") },
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
  session.target = dictation.sentence_ru;
  session.usedTargets.push(dictation.sentence_ru);
  await speak(ctx, dictation.sentence_ru, `Type what you hear.\n${spoiler(dictation.translation_en)}`, drillButtons("dictation:next"));
}

drills.hears(MENU.dictation, nextDictation);
onButton(drills, "dictation:next", nextDictation);

export async function checkDictation(ctx: BotContext, typed: string): Promise<void> {
  const { session } = ctx;
  const target = session.target!;
  await ctx.replyWithChatAction("typing");
  const result = await tutor.checkDictation(target, typed);
  const mistakes = result.mistakes.map((m) => `• <s>${esc(m.typed)}</s> → <b>${esc(m.correct)}</b>: ${esc(m.rule_en)}`).join("\n");
  await ctx.reply(
    [result.all_correct ? "<b>Perfect!</b>" : mistakes, `Correct: <b>${esc(target)}</b>`, esc(result.comment_en)].join("\n\n"),
    { parse_mode: "HTML", reply_markup: drillButtons("dictation:next") },
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
