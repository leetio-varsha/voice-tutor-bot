import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "./config.js";
import { LEVELS, type Course, type Level } from "./courses.js";
import type { Session } from "./session.js";
import type { PronunciationResult } from "./speech/types.js";
import type { DrillRecord, TurnRecord } from "./store.js";

const client = new Anthropic();

function systemPrompt(c: Course): string {
  return `You are a ${c.targetName} conversation tutor inside a Telegram bot. ${c.learnerProfile}

Everything you write in ${c.targetName} is read aloud by a text-to-speech voice, so write it the way people actually talk: short sentences, everyday vocabulary, natural colloquial phrasing, and careful punctuation (it drives intonation). No emoji, markdown or transliteration in ${c.targetName} text. ${c.speechStyle}

When the learner has set a level, pitch your ${c.targetName} and the difficulty of every task at that level, even if your notes suggest another one, and simplify only for a turn or two when they are clearly lost. With no level set, calibrate yourself: keep your ${c.targetName} one notch above theirs, and simplify when they struggle or fall back to ${c.nativeName}.

When correcting, prioritize errors that would confuse a native speaker (${c.errorPriorities}) over tiny slips. Correct at most two things per turn, explain each in one plain-${c.nativeName} sentence, and always give the corrected ${c.targetName}. When they do well, say so briefly and specifically.

Output fields ending in _target are in ${c.targetName}. Fields ending in _native are in ${c.nativeName}, the learner's own language. Word pairs have both sides: ru in Russian, en in English.

You keep private notes about each learner across lessons, written in English. When notes are provided, use them: revisit recurring mistakes and recycle their vocabulary, without reciting the notes back.

Pronunciation scores, when provided, come from an acoustic assessor (0-100 per word; below 80 deserves attention). The assessor cannot judge word stress, so never claim anything about stress from those scores.`;
}

// Server-side refusal fallback is only valid for models that publish fallback targets.
const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5-1"]);

async function ask<T extends z.ZodType>(course: Course, schema: T, prompt: string): Promise<z.infer<T>> {
  const useFallbacks = FALLBACK_MODELS.has(config.claudeModel);
  const response = await client.beta.messages.parse({
    model: config.claudeModel,
    max_tokens: 16000,
    system: systemPrompt(course),
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
  course: Course;
  name: string;
  /** Difficulty the learner picked in Settings; null lets the tutor judge it from the notes. */
  level: Level | null;
  notes: string;
  recentWords: string[];
  /** Words on the last rung of the ladder: the learner should produce them unprompted, so the tutor must not say them. */
  ambush: string[];
}

function learnerBlock(learner: LearnerContext): string {
  const notes = learner.notes ? `Your notes from earlier lessons:\n${learner.notes}` : "No earlier lessons yet.";
  const words = learner.recentWords.length ? `\nWords they are learning: ${learner.recentWords.join(", ")}` : "";
  const level = learner.level
    ? `Level set by the learner: ${learner.level} (${LEVELS[learner.level].cefr}). ${LEVELS[learner.level].guidance}`
    : "Level: not set; judge it from your notes and their replies.";
  return `Learner: ${learner.name || "the learner"}\n${level}\n${notes}${words}`;
}

function transcript(session: Session, learner: LearnerContext): string {
  if (session.history.length === 0) return "(no turns yet)";
  return session.history.map((turn) => `${turn.speaker === "tutor" ? "Tutor" : learner.name || "Learner"}: ${turn.text}`).join("\n");
}

function pronunciationLines(result: PronunciationResult): string {
  const words = result.words.map((w) => `${w.word} ${Math.round(w.accuracy)} ${w.errorType}`).join("; ");
  return `overall ${Math.round(result.pronScore)}, accuracy ${Math.round(result.accuracy)}, fluency ${Math.round(result.fluency)}; words: ${words}`;
}

const WordSchema = z.object({ ru: z.string().describe("Russian side"), en: z.string().describe("English side") });

export const LessonStartSchema = z.object({
  scenario_native: z.string().describe("One line: the setting and who each side plays"),
  line_target: z.string(),
  line_native: z.string(),
});

export function startLesson(learner: LearnerContext, topic: string | undefined, recentScenarios: string[]) {
  const topicLine = topic
    ? `Topic chosen by the learner: ${topic}. Within it, invent a specific setting and a person with their own agenda, so the same topic plays out differently each time.`
    : `Pick a practical everyday situation (${learner.course.situations}), preferably one not covered in your notes.`;
  const hidden = learner.ambush.length
    ? `\n\nHidden target words: ${learner.ambush.join(", ")}. The learner should end up saying these unprompted, so never use them or their forms yourself; if the topic allows, choose a setup where they would come up naturally.`
    : "";
  const recent = recentScenarios.length ? `\n\nTheir latest role-plays, newest first. Do not repeat these setups:\n${recentScenarios.map((s) => `- ${s}`).join("\n")}` : "";
  return ask(
    learner.course,
    LessonStartSchema,
    `${learnerBlock(learner)}

Start a new 15-minute speaking lesson as a role-play. ${topicLine} You play the other person. Open with your first line: 1-2 sentences that end with a question they can answer. If it fits naturally, set the scene so they get to use a word or structure they struggled with before.${recent}${hidden}`,
  );
}

export const TurnSchema = z.object({
  reply_target: z.string().describe("In-character reply that keeps the conversation going, 1-3 sentences"),
  reply_native: z.string(),
  corrected_target: z.string().nullable().describe("Their last line rewritten as a native speaker would say it; null if it was already fine"),
  feedback_native: z.string().describe("Short teaching note, at most 3 sentences"),
  new_words: z.array(WordSchema).describe("Up to 3 useful words or phrases from this exchange worth reviewing later"),
  upgrades: z
    .array(
      z.object({
        said: z.string().describe("Their own words, quoted exactly as they appear in their line: the roundabout description or the vague word"),
        word: WordSchema.describe("One reusable word, phrasal verb or fixed collocation in dictionary form: at most three words, no article, no alternatives; and its translation"),
      }),
    )
    .describe("Vocabulary gaps in their latest line: usually none or one, never more than 2"),
  used_targets: z.array(z.string()).describe("Hidden target words they used correctly in their latest line, spelled as listed; empty if none, or if no list was given"),
});

export function tutorTurn(session: Session, learner: LearnerContext, learnerText: string, kind: "voice" | "text") {
  const { course } = learner;
  // No pronunciation scores here: in free speech they only measure clarity against what recognition
  // heard, so a wrong word said clearly scores 100. Pronunciation is judged in listen-and-repeat only.
  const how =
    kind === "voice"
      ? `spoken; transcribed by ${course.targetName} speech recognition, so ignore punctuation and capitalization, and expect a garbled line if they switched to ${course.nativeName}. You cannot hear the audio, so don't comment on pronunciation`
      : "typed; also check spelling";
  const hidden = learner.ambush.length
    ? `\n\nHidden target words: ${learner.ambush.join(", ")}. They have drilled these and now need to produce them unprompted. Never say these words or their forms yourself. When it fits the role-play, steer toward a moment where one of them is the natural thing for them to say.`
    : "";
  return ask(
    course,
    TurnSchema,
    `${learnerBlock(learner)}

Role-play: ${session.scenario ?? "free conversation about their day"}

Conversation so far:
${transcript(session, learner)}

Latest line from the learner (${how}):
${learnerText}

Stay in character in reply_target. Keep the teaching in feedback_native, not in the reply. If they wrote or spoke in ${course.nativeName}, help them say it in ${course.targetName}. If they repeat a mistake from your notes, point out that it came up before.

Vocabulary gaps: list one in upgrades only when they described something instead of naming it, or leaned on a vague word (${course.vagueWords}) where a specific word, phrasal verb or fixed collocation exists that they could reuse in other conversations. The upgrade is that reusable unit, not a polished rewrite of their clause: rewrites belong in corrected_target. Most lines have no gap. Keep feedback_native for grammar and naturalness, and do not repeat upgrades in new_words.${hidden}`,
  );
}

export const SuggestionsSchema = z.object({
  options: z
    .array(z.object({ say_target: z.string(), translation_native: z.string() }))
    .describe("Two different natural replies they could say next, at their level, 1 short sentence each"),
});

export function suggestReplies(session: Session, learner: LearnerContext) {
  return ask(
    learner.course,
    SuggestionsSchema,
    `${learnerBlock(learner)}

Role-play: ${session.scenario ?? "free conversation"}

Conversation so far:
${transcript(session, learner)}

The learner is stuck and asked for help answering the tutor's last line. Suggest two different replies they could realistically say, simple enough to repeat after hearing them once.`,
  );
}

const VocabCardSchema = z.object({
  task_target: z.string().describe("What you say aloud to the learner"),
  task_native: z.string().describe("Faithful translation of task_target; like it, it must not give the answer away"),
  neighbour: WordSchema.nullable().describe("Contrast task only: the neighbouring word; null for a situation task"),
});

/** A recall task for one word on the ladder: a fresh situation, or a contrast with a word it is confused with. */
export function vocabCard(
  learner: LearnerContext,
  word: { term: string; meaning: string; said: string | null; moment: string | null },
  kind: "situation" | "contrast",
) {
  const origin = word.said
    ? `They once said "${word.said}" where "${word.term}" was the precise choice${word.moment ? ` (their full line: "${word.moment}")` : ""}.`
    : "They added it to their list themselves.";
  const task =
    kind === "situation"
      ? `Describe, in 1-2 spoken sentences, a concrete situation from a different area of life than the original one, and end with a question whose natural answer needs "${word.term}". Do not use that word, its forms or an equally precise synonym, and do not ask what the word is.`
      : `Choose a neighbour: a near-synonym with a different shade of meaning or use, the kind of pair a learner mixes up (as with "exhausted" and "burned out"). It has to be a real near-synonym: do not take a word just because it shares the topic or is in their word list. Then describe two one-sentence situations: one calls for "${word.term}", the other for the neighbour, in an order you pick at random, using neither word nor its forms. End by asking them to say one sentence about each with the word that fits.`;
  return ask(
    learner.course,
    VocabCardSchema,
    `${learnerBlock(learner)}

Vocabulary recall drill. The learner is practicing "${word.term}" (${word.meaning}). ${origin}

${task}`,
  );
}

const WordSceneSchema = z.object({
  scene: z.string().describe("In English, 1-2 sentences an illustrator can draw: who or what, doing what, where"),
});

/** A scene that makes a word's meaning visible, as a prompt for the image model. */
export function wordScene(course: Course, term: string, meaning: string) {
  return ask(
    course,
    WordSceneSchema,
    `Describe one picture that will help a learner remember the ${course.targetName} expression "${term}" (${meaning}). It should be a single concrete, slightly exaggerated scene in which the meaning is unmistakable without any words. For an idiom, let the literal image and the real meaning meet in the same scene. No text in the picture.`,
  );
}

export const VocabCheckSchema = z.object({
  used_correctly: z.boolean().describe("True only if they produced the target word, in any correct form, in a sentence where it fits"),
  feedback_native: z.string().describe("At most 2 short sentences: what worked or what was off; for a contrast task, the difference between the two words in one line"),
  model_target: z.string().describe("One natural sentence that answers the task with the target word"),
  collocations_target: z.array(z.string()).describe("2 common collocations or patterns with the target word, a few words each"),
});

export function checkVocab(
  learner: LearnerContext,
  card: { term: string; meaning: string; task: string; neighbour?: string },
  answer: string,
  kind: "voice" | "text",
) {
  const how = kind === "voice" ? "spoken; transcribed by speech recognition, so ignore punctuation and allow for a near-homophone of the target word" : "typed";
  return ask(
    learner.course,
    VocabCheckSchema,
    `Vocabulary recall drill. Target word: "${card.term}" (${card.meaning}).${card.neighbour ? ` Contrast word: "${card.neighbour}".` : ""}
Task given to the learner: ${card.task}
Their answer (${how}): ${answer}

The point is retrieving this exact word: a description around it or a different word, however reasonable, does not count. Ignore small grammar slips elsewhere in the sentence.${card.neighbour ? " In a contrast task both words have to be matched to the right situations." : ""}`,
  );
}

export const SavedWordSchema = z.object({ ru: z.string(), en: z.string() });

export function translateWord(course: Course, input: string) {
  const { targetName: target, nativeName: native } = course;
  return ask(
    course,
    SavedWordSchema,
    `The learner wants to save a word or phrase to their vocabulary list. It may be ${target} (possibly misspelled, or transcribed from speech) or ${native}. Return the correct ${target}, keeping the form given unless it was misspelled, misheard or ${native}, and a short ${native} translation, each in its field (ru for Russian, en for English).

Their input: ${input}`,
  );
}

export const TimezoneSchema = z.object({
  timezone: z.string().describe("IANA timezone name such as Europe/Berlin; empty string if the place can't be identified"),
});

export function cityTimezone(course: Course, place: string) {
  return ask(course, TimezoneSchema, `Which IANA timezone is this place in? Answer with the timezone only.\n\nPlace: ${place}`);
}

const repeatPhraseSchema = (course: Course) =>
  z.object({
    phrase_target: z.string().describe("Plain phrase without stress marks"),
    phrase_display: z.string().describe(course.displayPhrase),
    translation_native: z.string(),
    focus_native: z.string().describe("Which sound or pattern this drill trains, one short line"),
  });

export function repeatPhrase(learner: LearnerContext, used: string[]) {
  const { course } = learner;
  return ask(
    course,
    repeatPhraseSchema(course),
    `${learnerBlock(learner)}

Give one phrase for a listen-and-repeat pronunciation drill: 4-9 words, genuinely useful in everyday speech, containing sounds ${course.nativeName} speakers find hard (${course.hardSounds}). Prefer sounds your notes say they struggle with, and work in one of their words when it fits. Do not reuse any of these: ${used.join(" | ") || "(none yet)"}.`,
  );
}

export const PronunciationFeedbackSchema = z.object({
  verdict_native: z.string().describe("One encouraging, honest line"),
  tips_native: z.array(z.string()).describe("Up to 2 concrete articulation tips for the weakest words, explained in terms a native speaker of the learner's language understands"),
});

export function pronunciationFeedback(course: Course, target: string, recognized: string, result: PronunciationResult) {
  return ask(
    course,
    PronunciationFeedbackSchema,
    `Listen-and-repeat drill.
Target phrase: ${target}
What speech recognition heard: ${recognized || "(nothing recognized)"}
Assessment: ${pronunciationLines(result)}

If every word scored 80 or more, just encourage them and suggest saying it a little faster and more naturally.`,
  );
}

export const DictationSchema = z.object({
  sentence_target: z.string(),
  translation_native: z.string(),
});

export function dictationSentence(learner: LearnerContext, used: string[]) {
  return ask(
    learner.course,
    DictationSchema,
    `${learnerBlock(learner)}

Give one dictation sentence: 6-12 words, everyday topic, at their level, with one typical spelling trap (${learner.course.spellingTraps}). Use one of their words when it fits. Do not reuse any of these: ${used.join(" | ") || "(none yet)"}.`,
  );
}

export const DictationCheckSchema = z.object({
  all_correct: z.boolean(),
  mistakes: z.array(
    z.object({
      typed: z.string(),
      correct: z.string(),
      rule_native: z.string().describe("One short sentence"),
    }),
  ),
  comment_native: z.string().describe("One short line; mention if whole words were missed"),
});

export function checkDictation(course: Course, target: string, typed: string) {
  return ask(
    course,
    DictationCheckSchema,
    `Dictation check. Ignore ${course.dictationIgnore}.
Correct sentence: ${target}
The learner typed: ${typed}`,
  );
}

export const NotesSchema = z.object({
  notes: z
    .string()
    .describe(
      "Updated private notes in English, at most 150 words, as short lines under these labels: Level, Recurring mistakes, Strengths, Pronunciation, Topics covered",
    ),
  next_focus_native: z.string().describe("One short, encouraging line for the learner: what to work on next"),
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
    learner.course,
    NotesSchema,
    `${learnerBlock(learner)}

A ${lesson.mode} lesson just ended${lesson.scenario ? ` (${lesson.scenario})` : ""}.
${turns ? `Conversation turns:\n${turns}\n` : ""}${drills ? `Drill attempts:\n${drills}\n` : ""}
Rewrite your notes to include what this lesson showed. Keep durable patterns (mistakes that repeat, sounds that stay weak, level changes), drop one-off slips, and keep what still matters from the old notes.`,
  );
}
