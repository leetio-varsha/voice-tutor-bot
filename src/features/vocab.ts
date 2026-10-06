import { Composer, InlineKeyboard } from "grammy";
import { onButton, type BotContext } from "../context.js";
import { menuLabels } from "../i18n.js";
import { ensureDrillLesson, finishCurrentLesson, learnerContext } from "../lessons.js";
import type { VocabCard } from "../session.js";
import * as store from "../store.js";
import * as tutor from "../tutor.js";
import { esc, spoiler, vocabButtons } from "../ui.js";
import { speak } from "../voice.js";

/**
 * 💎 The word ladder. A word the learner talked around in conversation comes back as a different recall
 * task on each rung, so it is retrieved, not re-read: their own line again, a new situation, a contrast
 * with a neighbouring word, a story from their own life. The last rung is outside this drill: the word
 * counts as learned once they use it unprompted in a role-play (see the hidden targets in tutorTurn).
 */
export const vocab = new Composer<BotContext>();

const SESSION_CARDS = 8;
/** Hours until the next rung after passing rungs 0-3: a day, 3 days, a week, 16 days, each a little short so a daily habit doesn't drift later. */
const NEXT_RUNG_HOURS = [20, 68, 164, 380];
const RETRY_HOURS = 20;

type Rung = "anchor" | "picture" | "situation" | "contrast" | "story";

function rungOf(word: store.LadderWord): Rung {
  if (word.stage >= 3) return "story";
  if (word.stage === 2) return "contrast";
  // Words added by hand have no line of their own to return to.
  if (word.stage === 0 && word.said) return "anchor";
  // The first new context is the word's picture, this time without the word; with no picture, a spoken situation.
  return word.stage === 1 && word.imageFileId ? "picture" : "situation";
}

/** "burned out" -> "b_____ o__" */
const lettersMask = (term: string) =>
  term
    .split(" ")
    .map((part) => part.slice(0, 1) + "_".repeat(Math.max(part.length - 1, 0)))
    .join(" ");

/** The learner's full line as HTML with the weak spot underlined; just the weak spot when the line wasn't kept or doesn't contain it. */
function ownLine(moment: string | null, said: string): string {
  const at = moment ? moment.toLowerCase().indexOf(said.toLowerCase()) : -1;
  if (!moment || at < 0) return esc(said);
  return `${esc(moment.slice(0, at))}<u>${esc(moment.slice(at, at + said.length))}</u>${esc(moment.slice(at + said.length))}`;
}

async function startSession(ctx: BotContext): Promise<void> {
  const { session, learner, course, t } = ctx;
  const due = await store.dueLadderWords(learner.id, course.target, SESSION_CARDS);
  if (due.length === 0) {
    const stats = await store.ladderStats(learner.id, course.target);
    await ctx.reply(`${t.vocabNothingDue}\n\n${t.ladder(stats.active, stats.due, stats.learned)}`, {
      reply_markup: new InlineKeyboard().text(t.menu.talk, "menu:talk"),
    });
    return;
  }
  await ensureDrillLesson(session, learner, "vocab");
  session.vocab = { queue: due.map((word) => word.id), passed: 0, total: due.length };
  await nextCard(ctx);
}

vocab.hears(menuLabels("vocab"), startSession);
onButton(vocab, "vocab:start", startSession);

async function nextCard(ctx: BotContext): Promise<void> {
  const { session, learner, course, t } = ctx;
  const state = session.vocab;
  if (!state) return;
  state.card = undefined;

  let word: store.LadderWord | undefined;
  // A word can be deleted from the list while it waits in the queue.
  while (!word && state.queue.length > 0) word = await store.findLadderWord(learner.id, state.queue.shift()!);
  if (!word) {
    const stats = await store.ladderStats(learner.id, course.target);
    await finishCurrentLesson(session, learner.id);
    await ctx.reply(`${t.vocabSummary(state.passed, state.total)}\n${t.ladder(stats.active, stats.due, stats.learned)}`);
    return;
  }

  const term = word[course.target];
  const meaning = word[course.native];
  const position = `💎 ${state.total - state.queue.length}/${state.total}`;
  const hintSaid = word.said ? [{ text: t.vocabHintSaid(word.said), costly: false }] : [];
  const hintMeaning = { text: t.vocabHintMeaning(meaning), costly: false };
  const hintLetters = { text: t.vocabHintLetters(lettersMask(term)), costly: true };
  const card: VocabCard = { wordId: word.id, stage: word.stage, term, meaning, task: "", hints: [], hintsShown: 0, usedLetters: false };
  const rung = rungOf(word);
  // Seeing the picture again is the gentlest hint, so it comes first wherever the picture isn't the task itself.
  const hintPicture = word.imageFileId && rung !== "picture" ? [{ text: "", costly: false, photo: word.imageFileId }] : [];

  if (rung === "anchor") {
    card.task = `Say their own earlier line again, this time with the precise word. Their line was: "${word.said}"`;
    card.hints = [...hintPicture, hintMeaning, hintLetters];
    await ctx.reply(`${position}\n${esc(t.vocabAnchorIntro)}\n<i>«${ownLine(word.moment, word.said!)}»</i>\n\n${esc(t.vocabAnchorAsk(word.said!))}`, {
      parse_mode: "HTML",
      reply_markup: vocabButtons(t),
    });
  } else if (rung === "story") {
    card.task = `Tell, in two sentences, about a real moment from their own life that calls for the word meaning "${meaning}"`;
    card.hints = [...hintPicture, ...hintSaid, hintLetters];
    await ctx.reply(`${position}\n${esc(t.vocabStoryAsk(meaning))}`, { reply_markup: vocabButtons(t) });
  } else if (rung === "picture") {
    card.task = `Say one sentence about what is happening in a picture, using the precise word. The picture shows: ${word.imageScene ?? meaning}`;
    card.hints = [...hintSaid, hintMeaning, hintLetters];
    await ctx.replyWithPhoto(word.imageFileId!, { caption: `${position}\n${esc(t.vocabPictureAsk)}`, reply_markup: vocabButtons(t) });
  } else {
    await ctx.replyWithChatAction("typing");
    const task = await tutor.vocabCard(await learnerContext(learner), { term, meaning, said: word.said, moment: word.moment }, rung);
    const neighbour = rung === "contrast" ? task.neighbour?.[course.target] : undefined;
    card.task = task.task_target;
    card.neighbour = neighbour;
    // In a contrast task both words are on screen, so only the meaning is left to hint at.
    card.hints = neighbour ? [...hintPicture, hintMeaning] : [...hintPicture, ...hintSaid, hintMeaning, hintLetters];
    const ask = neighbour ? `<b>${esc(term)}</b> / <b>${esc(neighbour)}</b>\n${esc(t.vocabContrastAsk)}` : esc(t.vocabSituationAsk);
    await speak(ctx, task.task_target, `${position}\n${ask}\n${spoiler(task.task_target)}\n${spoiler(task.task_native)}`, vocabButtons(t));
  }
  state.card = card;
}

/** Checks a spoken or typed answer to the current card, moves the word on the ladder and deals the next card. */
export async function answerVocab(ctx: BotContext, answer: string, kind: "voice" | "text"): Promise<void> {
  const { session, learner, t } = ctx;
  const state = session.vocab;
  const card = state?.card;
  if (!state || !card) return;

  const check = await tutor.checkVocab(await learnerContext(learner), card, answer, kind);
  // A pass with the first letters shown proves less: the word stays on its rung and returns tomorrow.
  const result = !check.used_correctly ? "fail" : card.usedLetters ? "hold" : "pass";
  const stage = result === "pass" ? card.stage + 1 : result === "fail" ? Math.max(card.stage - 1, 0) : card.stage;
  const hours = result === "pass" ? NEXT_RUNG_HOURS[card.stage]! : RETRY_HOURS;
  await store.moveOnLadder(learner.id, card.wordId, stage, hours);
  if (result === "pass") state.passed++;

  const word = `<b>${esc(card.term)}</b> · ${esc(card.meaning)}`;
  const goesWith = check.collocations_target.length ? `${esc(t.vocabGoesWith)}: ${check.collocations_target.map(esc).join(" · ")}` : "";
  const lines: string[] = [];
  if (kind === "voice") lines.push(`${esc(t.iHeard)}: <i>${esc(answer)}</i>`);
  lines.push(result === "fail" ? `❌ ${esc(t.vocabMissed)}: ${word}` : `✅ ${word}`);
  lines.push(esc(check.feedback_native));
  if (result === "pass") {
    lines.push(goesWith, esc(stage === store.LADDER.ambush ? t.vocabAmbushNext : t.vocabNextIn(Math.round(hours / 24))));
  } else if (result === "hold") {
    lines.push(goesWith, esc(t.vocabHold));
  }
  await ctx.reply(lines.filter(Boolean).join("\n\n"), { parse_mode: "HTML" });

  // After a miss the learner hears the word in a sentence instead of only reading it.
  if (result === "fail") {
    await speak(ctx, check.model_target, [`<b>${esc(check.model_target)}</b>`, goesWith].filter(Boolean).join("\n"), new InlineKeyboard().text(t.slower, "slower"));
  }

  if (session.lessonId !== undefined) {
    await store.addDrillAttempt(session.lessonId, { kind: "vocab", target: card.term, answer, score: null, details: { rung: card.stage, result } });
  }
  await nextCard(ctx);
}

onButton(vocab, "vocab:hint", async (ctx) => {
  const card = ctx.session.vocab?.card;
  if (!card) return;
  const hint = card.hints[card.hintsShown];
  if (!hint) {
    await ctx.reply(ctx.t.vocabNoMoreHints);
    return;
  }
  card.hintsShown++;
  if (hint.costly) card.usedLetters = true;
  if (hint.photo) await ctx.replyWithPhoto(hint.photo);
  else await ctx.reply(hint.text);
});

// A skipped word stays due and comes back in the next session.
onButton(vocab, "vocab:skip", async (ctx) => {
  if (ctx.session.vocab?.card) await nextCard(ctx);
});
