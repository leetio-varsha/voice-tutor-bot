/** A language the bot speaks: what a learner practices, or the language their interface is in. */
export type Lang = "ru" | "en";

/**
 * One direction of study. Everything that differs between "English speaker learning Russian" and
 * "Russian speaker learning English" lives here: speech locale, the tutor's teaching priorities, and
 * the learner's own language for buttons, explanations and translations.
 */
export interface Course {
  /** The language being learned; also the course id stored in learners.learning. */
  target: Lang;
  /** The learner's own language: the interface, explanations and translations. */
  native: Lang;
  targetName: string;
  nativeName: string;
  /** Speech recognition, assessment and TTS locale. */
  locale: string;
  learnerProfile: string;
  /** Extra writing rules for text that is read aloud. */
  speechStyle: string;
  /** Errors worth correcting first, as a parenthetical list. */
  errorPriorities: string;
  /** Catch-all words learners lean on when a more precise one exists. */
  vagueWords: string;
  situations: string;
  hardSounds: string;
  spellingTraps: string;
  /** Differences a dictation check should not count as mistakes. */
  dictationIgnore: string;
  /** How the drill phrase is shown on screen (stress marks for Russian, plain for English). */
  displayPhrase: string;
}

export const COURSES: Record<Lang, Course> = {
  ru: {
    target: "ru",
    native: "en",
    targetName: "Russian",
    nativeName: "English",
    locale: "ru-RU",
    learnerProfile:
      "The learner is a native English speaker who already speaks some Russian but feels stuck: they understand more than they can say. They learn best by listening to natural speech and answering out loud, not through gamified drills.",
    speechStyle: "Use ё where it belongs.",
    errorPriorities: "case endings, verb aspect, wrong word choice",
    vagueWords: "вещь, штука, очень + adjective, хороший, плохой, делать, много",
    situations: "café, taxi, market, neighbour, calling a colleague, pharmacy, renting a flat, and so on",
    hardSounds: "ы, щ, ж/ш, soft consonants, rolled р, vowel reduction",
    spellingTraps: "unstressed vowel, soft sign, -тся/-ться, double consonant",
    dictationIgnore: "capitalization, punctuation, and е/ё differences",
    displayPhrase: "Same phrase with a combining acute accent (U+0301) after the stressed vowel of each multi-syllable word",
  },
  en: {
    target: "en",
    native: "ru",
    targetName: "English",
    nativeName: "Russian",
    locale: "en-US",
    learnerProfile:
      "The learner is a native Russian speaker learning to speak American English. They learn best by listening to natural speech and answering out loud, not through gamified drills. Until a level is set or your notes say otherwise, assume a lower-intermediate level.",
    speechStyle: "Use American spelling and vocabulary, and contractions wherever people naturally say them (I'm, don't, it's).",
    errorPriorities: "verb tenses, articles, word order in questions, prepositions, wrong word choice, false friends from Russian",
    vagueWords: "thing, stuff, very + adjective, good, bad, nice, big, get, do, a lot of",
    situations: "café, taxi, grocery store, neighbor, calling a colleague, pharmacy, hotel check-in, small talk at work, and so on",
    hardSounds: "th in think/this, w vs v, short vs long vowels as in ship/sheep, the vowel in cat, h, final voiced consonants as in bed/dog, -ng",
    spellingTraps: "silent letter, homophone such as their/there, doubled consonant, -ed/-ing spelling, ie/ei",
    dictationIgnore: "capitalization, punctuation, and contracted vs full forms (don't vs do not)",
    displayPhrase: "Exactly the same phrase, unchanged",
  },
};

export const isLang = (value: unknown): value is Lang => value === "ru" || value === "en";

/**
 * Difficulty a learner can set per course in ⚙️ Settings. Without one the tutor judges the level from its notes.
 * The guidance is prompt text; button labels come from UiText.levels.
 */
export const LEVELS = {
  beginner: {
    cefr: "A1-A2",
    guidance:
      "Speak in very short, simple sentences with the most common words and no idioms. Keep situations predictable, one step at a time. Keep drill phrases and dictation sentences at the short end of the range. Correct only errors that block understanding.",
  },
  intermediate: {
    cefr: "B1",
    guidance:
      "Use everyday vocabulary, connected sentences and common set phrases, with at most one idiom per reply. Situations go mostly as expected, with one small twist. Correct errors a native speaker would notice.",
  },
  upper: {
    cefr: "B2",
    guidance:
      "Speak naturally: idioms, colloquial turns of phrase, longer sentences. Give every situation a complication that makes them explain, insist or negotiate. Besides errors, point out phrasing that is correct but unnatural.",
  },
  advanced: {
    cefr: "C1",
    guidance:
      "Speak as you would to a native speaker: nuance, humour, register shifts, less common vocabulary. Situations involve conflict, persuasion or abstract ideas, and you push back instead of agreeing. Use the long end of the range for drill phrases and dictation sentences. Treat correct-but-plain phrasing as worth improving: when they use a vague or basic word where a precise one exists, give the precise one.",
  },
} as const;

export type Level = keyof typeof LEVELS;

export const LEVEL_IDS = Object.keys(LEVELS) as Level[];

export const isLevel = (value: unknown): value is Level => typeof value === "string" && value in LEVELS;
