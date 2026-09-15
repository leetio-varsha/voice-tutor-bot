import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "./config.js";
import type { Session } from "./session.js";
import type { PronunciationResult } from "./speech/types.js";
import type { DrillRecord, TurnRecord } from "./store.js";

const client = new Anthropic();

const SYSTEM = `You are a Russian conversation tutor inside a Telegram bot. The learner is a native English speaker who already speaks some Russian but feels stuck: they understand more than they can say. They learn best by listening to natural speech and answering out loud, not through gamified drills.

Everything you write in Russian fields is read aloud by a text-to-speech voice, so write it the way people actually talk: short sentences, everyday vocabulary, natural colloquial phrasing, and careful punctuation (it drives intonation). No emoji, markdown or transliteration in Russian fields. Use ё where it belongs.

Calibrate to the learner's level: keep your Russian one notch above theirs, and simplify when they struggle or fall back to English.

When correcting, prioritize errors that would confuse a native speaker (case endings, verb aspect, wrong word choice) over tiny slips. Correct at most two things per turn, explain each in one plain-English sentence, and always give the corrected Russian. When they do well, say so briefly and specifically.

You keep private notes about each learner across lessons. When notes are provided, use them: revisit recurring mistakes and recycle their vocabulary, without reciting the notes back.

Pronunciation scores, when provided, come from an acoustic assessor (0-100 per word; below 80 deserves attention). The assessor cannot judge word stress, so never claim anything about stress from those scores.`;

// Server-side refusal fallback is only valid for models that publish fallback targets.
const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5-1"]);

async function ask<T extends z.ZodType>(schema: T, prompt: string): Promise<z.infer<T>> {
  const useFallbacks = FALLBACK_MODELS.has(config.claudeModel);
  const response = await client.beta.messages.parse({
    model: config.claudeModel,
    max_tokens: 16000,
    system: SYSTEM,
    // Conversational turns: latency matters more than deep reasoning.
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: prompt }],
    ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined this request");
  if (response.parsed_output == null) {
    throw new Error(`Claude returned no parseable output (stop_reason=${response.stop_reason})`);
  }
  return unescapeStrings(response.parsed_output) as z.infer<T>;
}

// The model occasionally writes a "—"-style escape as literal text inside a string value; show the character instead.
function unescapeStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }
  if (Array.isArray(value)) return value.map(unescapeStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, unescapeStrings(v)]));
  }
  return value;
}

/** What the tutor knows about the learner beyond the current lesson. */
export interface LearnerContext {
  name: string;
  notes: string;
  recentWords: string[];
}

function learnerBlock(learner: LearnerContext): string {
  const notes = learner.notes ? `Your notes from earlier lessons:\n${learner.notes}` : "No earlier lessons yet.";
  const words = learner.recentWords.length ? `\nWords they are learning: ${learner.recentWords.join(", ")}` : "";
  return `Learner: ${learner.name || "the learner"}\n${notes}${words}`;
}

function transcript(session: Session, learner: LearnerContext): string {
  if (session.history.length === 0) return "(no turns yet)";
  return session.history.map((turn) => `${turn.speaker === "tutor" ? "Tutor" : learner.name || "Learner"}: ${turn.text}`).join("\n");
}

function pronunciationLines(result: PronunciationResult): string {
  const words = result.words.map((w) => `${w.word} ${Math.round(w.accuracy)} ${w.errorType}`).join("; ");
  return `overall ${Math.round(result.pronScore)}, accuracy ${Math.round(result.accuracy)}, fluency ${Math.round(result.fluency)}; words: ${words}`;
}

const WordSchema = z.object({ ru: z.string(), en: z.string() });

export const LessonStartSchema = z.object({
  scenario_en: z.string().describe("One line: the setting and who each side plays"),
  tutor_line_ru: z.string(),
  tutor_line_en: z.string(),
});

export function startLesson(learner: LearnerContext, topic?: string) {
  const topicLine = topic
    ? `Topic chosen by the learner: ${topic}.`
    : "Pick a practical everyday situation (café, taxi, market, neighbour, calling a colleague, pharmacy, renting a flat, and so on), preferably one not covered in your notes.";
  return ask(
    LessonStartSchema,
    `${learnerBlock(learner)}

Start a new 15-minute speaking lesson as a role-play. ${topicLine} You play the other person. Open with your first line: 1-2 sentences that end with a question they can answer. If it fits naturally, set the scene so they get to use a word or structure they struggled with before.`,
  );
}

export const TurnSchema = z.object({
  reply_ru: z.string().describe("In-character reply that keeps the conversation going, 1-3 sentences"),
  reply_en: z.string(),
  corrected_ru: z.string().nullable().describe("Their last line rewritten as a native speaker would say it; null if it was already fine"),
  feedback_en: z.string().describe("Short teaching note in English, at most 3 sentences"),
  new_words: z.array(WordSchema).describe("Up to 3 useful words or phrases from this exchange worth reviewing later"),
});

export function tutorTurn(session: Session, learner: LearnerContext, learnerText: string, kind: "voice" | "text") {
  // No pronunciation scores here: in free speech they only measure clarity against what recognition
  // heard, so a wrong word said clearly scores 100. Pronunciation is judged in listen-and-repeat only.
  const how =
    kind === "voice"
      ? "spoken; transcribed by speech recognition, so ignore punctuation and capitalization. You cannot hear the audio, so don't comment on pronunciation"
      : "typed; also check spelling";
  return ask(
    TurnSchema,
    `${learnerBlock(learner)}

Role-play: ${session.scenario ?? "free conversation about their day"}

Conversation so far:
${transcript(session, learner)}

Latest line from the learner (${how}):
${learnerText}

Stay in character in reply_ru. Keep the teaching in feedback_en, not in the reply. If they wrote or spoke in English, help them say it in Russian. If they repeat a mistake from your notes, point out that it came up before.`,
  );
}

export const SuggestionsSchema = z.object({
  options: z
    .array(z.object({ ru: z.string(), en: z.string() }))
    .describe("Two different natural replies they could say next, at their level, 1 short sentence each"),
});

export function suggestReplies(session: Session, learner: LearnerContext) {
  return ask(
    SuggestionsSchema,
    `${learnerBlock(learner)}

Role-play: ${session.scenario ?? "free conversation"}

Conversation so far:
${transcript(session, learner)}

The learner is stuck and asked for help answering the tutor's last line. Suggest two different replies they could realistically say, simple enough to repeat after hearing them once.`,
  );
}

export const SavedWordSchema = z.object({
  ru: z.string().describe("Correct Russian spelling; keep the form given unless it was misspelled, misheard, or English"),
  en: z.string().describe("Short English translation"),
});

export function translateWord(input: string) {
  return ask(
    SavedWordSchema,
    `The learner wants to save a word or phrase to their vocabulary list. It may be Russian (possibly misspelled, or transcribed from speech) or English. Return the correct Russian and a short English translation.

Their input: ${input}`,
  );
}

export const TimezoneSchema = z.object({
  timezone: z.string().describe("IANA timezone name such as Europe/Berlin; empty string if the place can't be identified"),
});

export function cityTimezone(place: string) {
  return ask(TimezoneSchema, `Which IANA timezone is this place in? Answer with the timezone only.\n\nPlace: ${place}`);
}

export const RepeatPhraseSchema = z.object({
  phrase_ru: z.string().describe("Plain phrase without stress marks"),
  phrase_ru_stressed: z.string().describe("Same phrase with a combining acute accent (U+0301) after the stressed vowel of each multi-syllable word"),
  translation_en: z.string(),
  focus_en: z.string().describe("Which sound or pattern this drill trains, one short line"),
});

export function repeatPhrase(learner: LearnerContext, used: string[]) {
  return ask(
    RepeatPhraseSchema,
    `${learnerBlock(learner)}

Give one phrase for a listen-and-repeat pronunciation drill: 4-9 words, genuinely useful in everyday speech, containing sounds English speakers find hard (ы, щ, ж/ш, soft consonants, rolled р, vowel reduction). Prefer sounds your notes say they struggle with, and work in one of their words when it fits. Do not reuse any of these: ${used.join(" | ") || "(none yet)"}.`,
  );
}

export const PronunciationFeedbackSchema = z.object({
  verdict_en: z.string().describe("One encouraging, honest line"),
  tips_en: z.array(z.string()).describe("Up to 2 concrete articulation tips for the weakest words, explained in English terms"),
});

export function pronunciationFeedback(target: string, recognized: string, result: PronunciationResult) {
  return ask(
    PronunciationFeedbackSchema,
    `Listen-and-repeat drill.
Target phrase: ${target}
What speech recognition heard: ${recognized || "(nothing recognized)"}
Assessment: ${pronunciationLines(result)}

If every word scored 80 or more, just encourage them and suggest saying it a little faster and more naturally.`,
  );
}

export const DictationSchema = z.object({
  sentence_ru: z.string(),
  translation_en: z.string(),
});

export function dictationSentence(learner: LearnerContext, used: string[]) {
  return ask(
    DictationSchema,
    `${learnerBlock(learner)}

Give one dictation sentence: 6-12 words, everyday topic, at their level, with one typical spelling trap (unstressed vowel, soft sign, -тся/-ться, double consonant). Use one of their words when it fits. Do not reuse any of these: ${used.join(" | ") || "(none yet)"}.`,
  );
}

export const DictationCheckSchema = z.object({
  all_correct: z.boolean(),
  mistakes: z.array(
    z.object({
      typed: z.string(),
      correct: z.string(),
      rule_en: z.string().describe("One short sentence"),
    }),
  ),
  comment_en: z.string().describe("One short line; mention if whole words were missed"),
});

export function checkDictation(target: string, typed: string) {
  return ask(
    DictationCheckSchema,
    `Dictation check. Ignore capitalization, punctuation, and е/ё differences.
Correct sentence: ${target}
The learner typed: ${typed}`,
  );
}

export const NotesSchema = z.object({
  notes: z
    .string()
    .describe(
      "Updated private notes, at most 150 words, as short lines under these labels: Level, Recurring mistakes, Strengths, Pronunciation, Topics covered",
    ),
  next_focus_en: z.string().describe("One short, encouraging line for the learner: what to work on next"),
});

/** Merges one finished lesson into the tutor's running notes about the learner. */
export function updateNotes(
  learner: LearnerContext,
  lesson: { mode: string; scenario: string | null; turns: TurnRecord[]; drills: DrillRecord[] },
) {
  const turns = lesson.turns
    .map((t) => `- ${t.kind} line: ${t.learnerText}${t.corrected ? ` | corrected: ${t.corrected}` : ""} | feedback: ${t.feedback}`)
    .join("\n");
  const drills = lesson.drills
    .map((d) => `- ${d.kind}: target "${d.target}", answer "${d.answer}"${d.score === null ? "" : `, score ${Math.round(d.score)}`}${d.details ? `, details ${JSON.stringify(d.details)}` : ""}`)
    .join("\n");
  return ask(
    NotesSchema,
    `${learnerBlock(learner)}

A ${lesson.mode} lesson just ended${lesson.scenario ? ` (${lesson.scenario})` : ""}.
${turns ? `Conversation turns:\n${turns}\n` : ""}${drills ? `Drill attempts:\n${drills}\n` : ""}
Rewrite your notes to include what this lesson showed. Keep durable patterns (mistakes that repeat, sounds that stay weak, level changes), drop one-off slips, and keep what still matters from the old notes.`,
  );
}
