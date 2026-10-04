import { COURSES } from "./courses.js";
import { clearLessonState, getSession, hasSession, type Session } from "./session.js";
import * as store from "./store.js";
import type { Learner, LessonMode } from "./store.js";
import * as tutor from "./tutor.js";

/** A lesson with no activity for this long is closed; a restart within it resumes the conversation. */
export const IDLE_MINUTES = 60;
const RECENT_WORDS_FOR_CONTEXT = 20;

/** Only for learners who have picked a course (every handler and the notes job guarantee that). */
export async function learnerContext(learner: Learner): Promise<tutor.LearnerContext> {
  const course = COURSES[learner.learning ?? "ru"];
  const { words } = await store.latestWords(learner.id, course.target, RECENT_WORDS_FOR_CONTEXT);
  return { course, name: learner.firstName, notes: learner.tutorNotes, recentWords: words.map((w) => w[course.target]) };
}

/** Closes whatever lesson is open and starts a new one. */
export async function startLesson(
  session: Session,
  learner: Learner,
  mode: LessonMode,
  scenario: string | null,
  openingLine: string | null,
): Promise<number> {
  await finishCurrentLesson(session, learner.id);
  const lessonId = await store.openLesson(learner.id, mode, scenario, openingLine);
  session.mode = mode;
  session.lessonId = lessonId;
  session.scenario = scenario ?? undefined;
  if (openingLine) session.history.push({ speaker: "tutor", text: openingLine });
  return lessonId;
}

/** Drills continue the current drill lesson ("Next" is the same session); switching modes starts a new one. */
export async function ensureDrillLesson(session: Session, learner: Learner, mode: "repeat" | "dictation"): Promise<number> {
  if (session.mode === mode && session.lessonId !== undefined) return session.lessonId;
  const lessonId = await startLesson(session, learner, mode, null, null);
  if (session.usedTargets.length === 0) session.usedTargets = await store.recentDrillTargets(learner.id, 50);
  return lessonId;
}

export async function finishCurrentLesson(session: Session, learnerId: number): Promise<void> {
  const lessonId = session.lessonId;
  clearLessonState(session);
  if (lessonId !== undefined && (await store.closeLesson(lessonId))) void processPendingNotes();
}

/** After a restart, resumes a talk lesson that was active recently so the conversation keeps its context. */
export async function restoreSession(learner: Learner): Promise<void> {
  if (hasSession(learner.id)) return;
  const session = getSession(learner.id);
  const open = await store.recentOpenLesson(learner.id, IDLE_MINUTES);
  if (!open || open.mode !== "talk") return;
  session.mode = "talk";
  session.lessonId = open.id;
  session.scenario = open.scenario ?? undefined;
  if (open.openingLine) session.history.push({ speaker: "tutor", text: open.openingLine });
  for (const turn of await store.lessonTurns(open.id)) {
    session.history.push({ speaker: "learner", text: turn.learnerText }, { speaker: "tutor", text: turn.tutorReply });
  }
}

export async function closeIdleLessons(): Promise<void> {
  for (const lesson of await store.idleLessons(IDLE_MINUTES)) {
    const session = getSession(lesson.learnerId);
    if (session.lessonId === lesson.id) clearLessonState(session);
    await store.closeLesson(lesson.id);
  }
  await processPendingNotes();
}

let notesRunning = false;

/**
 * Updates tutor notes for closed lessons, oldest first. Driven from the database flag, so a
 * restart or a failed Claude call just means the next scheduler tick picks the lesson up again.
 */
export async function processPendingNotes(): Promise<void> {
  if (notesRunning) return;
  notesRunning = true;
  try {
    const learners = new Map((await store.listLearners()).map((learner) => [learner.id, learner]));
    for (const { id, learnerId } of await store.lessonsNeedingNotes(10)) {
      const learner = learners.get(learnerId);
      const [info, turns, drills] = await Promise.all([store.lessonInfo(id), store.lessonTurns(id), store.lessonDrills(id)]);
      if (!learner || !info || (turns.length === 0 && drills.length === 0)) {
        await store.markNotesUpdated(id);
        continue;
      }
      try {
        const updated = await tutor.updateNotes(await learnerContext(learner), { mode: info.mode, scenario: info.scenario, turns, drills });
        await store.saveTutorNotes(learnerId, updated.notes, updated.next_focus_native);
        learner.tutorNotes = updated.notes;
        learner.nextFocus = updated.next_focus_native;
        await store.markNotesUpdated(id);
        console.log(`[notes] updated for learner ${learnerId} from lesson ${id}`);
      } catch (err) {
        console.error(`[notes] lesson ${id} failed, will retry:`, err instanceof Error ? err.message : err);
        break;
      }
    }
  } finally {
    notesRunning = false;
  }
}
