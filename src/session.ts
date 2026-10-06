import type { LessonMode } from "./store.js";

export interface Turn {
  speaker: "tutor" | "learner";
  text: string;
}

/** The 💎 recall task the learner is answering. */
export interface VocabCard {
  wordId: number;
  stage: number;
  term: string;
  meaning: string;
  /** What the learner was asked, for the answer check. */
  task: string;
  /** The word the target is contrasted with, when the task is a contrast. */
  neighbour?: string;
  /** Hints in the order they are given; a costly one keeps the word on its rung even after a right answer. */
  hints: { text: string; costly: boolean; photo?: string }[];
  hintsShown: number;
  usedLetters: boolean;
}

/**
 * Short-lived state of the lesson in progress. Everything worth keeping (lessons, turns, drill
 * scores, words, tutor notes) is in Postgres; this is only what the next message needs.
 */
export interface Session {
  mode: LessonMode | "idle";
  lessonId?: number;
  scenario?: string;
  history: Turn[];
  /** Target phrase for "repeat after me" or dictation. */
  target?: string;
  /** Phrases used in drills, so Claude doesn't repeat them. Seeded from the database. */
  usedTargets: string[];
  /** Last synthesized tutor audio (raw provider output), kept for the "Slower" button. */
  lastAudio?: Buffer;
  /** Set by "Add word", "Type my city", "My topic" or "My own picture": the next message answers that prompt, not the lesson. */
  awaiting?: "word" | "city" | "topic" | "picture";
  /** The word the learner is describing their own picture for. */
  pictureFor?: number;
  /** A 💎 session: the word ids still to come and the card on screen. */
  vocab?: { queue: number[]; card?: VocabCard; passed: number; total: number };
}

const sessions = new Map<number, Session>();

export function hasSession(learnerId: number): boolean {
  return sessions.has(learnerId);
}

export function getSession(learnerId: number): Session {
  let session = sessions.get(learnerId);
  if (!session) {
    session = { mode: "idle", history: [], usedTargets: [] };
    sessions.set(learnerId, session);
  }
  return session;
}

export function clearLessonState(session: Session): void {
  session.mode = "idle";
  session.lessonId = undefined;
  session.scenario = undefined;
  session.history = [];
  session.target = undefined;
  session.vocab = undefined;
}
