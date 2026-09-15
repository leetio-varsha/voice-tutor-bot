import type { LessonMode } from "./store.js";

export interface Turn {
  speaker: "tutor" | "learner";
  text: string;
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
  /** Set by "Add word" or "Type my city": the next message answers that prompt, not the lesson. */
  awaiting?: "word" | "city";
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
}
