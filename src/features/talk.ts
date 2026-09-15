import { Composer } from "grammy";
import { onButton, type BotContext } from "../context.js";
import { learnerContext, startLesson } from "../lessons.js";
import { assessClarity } from "../speech/stt.js";
import * as store from "../store.js";
import * as tutor from "../tutor.js";
import { esc, lessonButtons, MENU, spoiler, topicKeyboard, TOPICS, UNCLEAR_BELOW } from "../ui.js";
import { renderVoice, sendVoice, speak } from "../voice.js";

export const talk = new Composer<BotContext>();

const pickTopic = (ctx: BotContext) => ctx.reply("What do you want to talk about?", { reply_markup: topicKeyboard() });
talk.hears(MENU.talk, pickTopic);
onButton(talk, "menu:talk", pickTopic);

onButton(talk, /^topic:(.+)$/, async (ctx) => {
  const topic = TOPICS.find((t) => t.id === ctx.match[1]);
  await ctx.replyWithChatAction("typing");
  const start = await tutor.startLesson(await learnerContext(ctx.learner), topic?.scenario);
  await startLesson(ctx.session, ctx.learner, "talk", start.scenario_en, start.tutor_line_ru);
  await ctx.reply(`<b>${esc(start.scenario_en)}</b>\nListen, then hold the mic and answer in Russian. Stuck? Tap 💡.`, { parse_mode: "HTML" });
  await speak(ctx, start.tutor_line_ru, `${spoiler(start.tutor_line_ru)}\n${spoiler(start.tutor_line_en)}`, lessonButtons());
});

export type LearnerInput = { kind: "text" } | { kind: "voice"; wav: Buffer; lexical: string };

/** One conversation turn: correction and feedback text, then the tutor's in-character voice reply. */
export async function handleLearnerLine(ctx: BotContext, text: string, input: LearnerInput): Promise<void> {
  const { session, learner } = ctx;
  if (session.mode !== "talk" || session.lessonId === undefined) {
    await startLesson(session, learner, "talk", "free conversation about their day", null);
  }
  const lessonId = session.lessonId!;
  const started = Date.now();

  // The clarity check doesn't feed Claude, so it runs alongside it instead of before it.
  const clarity =
    input.kind === "voice"
      ? assessClarity(input.wav, input.lexical).catch((err) => {
          console.warn("Clarity assessment failed:", err instanceof Error ? err.message : err);
          return undefined;
        })
      : Promise.resolve(undefined);

  const turn = await tutor.tutorTurn(session, await learnerContext(learner), text, input.kind);
  const claudeMs = Date.now() - started;
  session.history.push({ speaker: "learner", text }, { speaker: "tutor", text: turn.reply_ru });

  // Start synthesis right away; the feedback text goes out while the voice renders.
  const voice = renderVoice(session, turn.reply_ru);
  const unclear = (await clarity)?.words.filter((w) => w.accuracy < UNCLEAR_BELOW).map((w) => w.word) ?? [];

  const lines: string[] = [];
  if (input.kind === "voice") lines.push(`I heard: <i>${esc(text)}</i>`);
  if (turn.corrected_ru) lines.push(`Better: <b>${esc(turn.corrected_ru)}</b>`);
  lines.push(esc(turn.feedback_en));
  if (unclear.length) lines.push(`Say these more clearly: ${unclear.map((w) => `<b>${esc(w)}</b>`).join(", ")}`);
  await ctx.reply(lines.join("\n\n"), { parse_mode: "HTML" });

  await ctx.replyWithChatAction("record_voice");
  await sendVoice(ctx, await voice, `${spoiler(turn.reply_ru)}\n${spoiler(turn.reply_en)}`, lessonButtons());

  await store.addTurn(lessonId, {
    kind: input.kind,
    learnerText: text,
    corrected: turn.corrected_ru,
    feedback: turn.feedback_en,
    tutorReply: turn.reply_ru,
    unclearWords: unclear,
  });
  await store.addWords(learner.id, lessonId, "lesson", turn.new_words);
  console.log(`[timing] ${input.kind} turn: claude ${claudeMs} ms, total after recognition ${Date.now() - started} ms`);
}

onButton(talk, "hint", async (ctx) => {
  const { session } = ctx;
  if (session.mode !== "talk" || session.history.length === 0) return;
  await ctx.replyWithChatAction("typing");
  const { options } = await tutor.suggestReplies(session, await learnerContext(ctx.learner));
  const text = options.map((o, i) => `${i + 1}. <b>${esc(o.ru)}</b>\n${spoiler(o.en)}`).join("\n\n");
  // Voice the suggestions so they can be shadowed, not just read.
  await speak(ctx, options.map((o) => o.ru).join(" … "), `You could say:\n\n${text}`, lessonButtons());
});
