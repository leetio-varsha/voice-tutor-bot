import { config } from "./config.js";
import type { Lang } from "./courses.js";
import { pool } from "./db.js";

// --- learners ---

export interface Learner {
  id: number;
  firstName: string;
  timezone: string;
  lessonTimes: string[];
  remindersEnabled: boolean;
  tutorNotes: string;
  nextFocus: string;
  /** The language they study; null until they pick it on /start. */
  learning: Lang | null;
}

interface LearnerRow {
  telegram_id: number;
  first_name: string;
  timezone: string;
  lesson_times: string[];
  reminders_enabled: boolean;
  tutor_notes: string;
  next_focus: string;
  learning: Lang | null;
}

const toLearner = (row: LearnerRow): Learner => ({
  id: row.telegram_id,
  firstName: row.first_name,
  timezone: row.timezone,
  lessonTimes: row.lesson_times,
  remindersEnabled: row.reminders_enabled,
  tutorNotes: row.tutor_notes,
  nextFocus: row.next_focus,
  learning: row.learning,
});

export async function ensureLearner(telegramId: number, firstName: string): Promise<Learner> {
  const { rows } = await pool.query<LearnerRow>(
    `INSERT INTO learners (telegram_id, first_name, timezone, lesson_times)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name
     RETURNING *`,
    [telegramId, firstName, config.defaultTimezone, config.defaultLessonTimes],
  );
  return toLearner(rows[0]!);
}

export async function listLearners(): Promise<Learner[]> {
  const { rows } = await pool.query<LearnerRow>(`SELECT * FROM learners ORDER BY created_at`);
  return rows.map(toLearner);
}

export async function saveTutorNotes(learnerId: number, notes: string, nextFocus: string): Promise<void> {
  await pool.query(`UPDATE learners SET tutor_notes = $2, next_focus = $3 WHERE telegram_id = $1`, [learnerId, notes, nextFocus]);
}

export async function setLearning(learnerId: number, learning: Lang): Promise<void> {
  await pool.query(`UPDATE learners SET learning = $2 WHERE telegram_id = $1`, [learnerId, learning]);
}

export async function saveSchedule(learnerId: number, lessonTimes: string[], timezone: string, remindersEnabled: boolean): Promise<void> {
  await pool.query(`UPDATE learners SET lesson_times = $2, timezone = $3, reminders_enabled = $4 WHERE telegram_id = $1`, [
    learnerId,
    lessonTimes,
    timezone,
    remindersEnabled,
  ]);
}

// --- lessons ---

export type LessonMode = "talk" | "repeat" | "dictation";

export async function openLesson(learnerId: number, mode: LessonMode, scenario: string | null, openingLine: string | null): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO lessons (learner_id, mode, scenario, opening_line) VALUES ($1, $2, $3, $4) RETURNING id`,
    [learnerId, mode, scenario, openingLine],
  );
  return rows[0]!.id;
}

export async function touchLesson(lessonId: number): Promise<void> {
  await pool.query(`UPDATE lessons SET last_activity_at = now() WHERE id = $1`, [lessonId]);
}

/** Ends a lesson at its last activity (so idle time doesn't count as practice). False if already closed. */
export async function closeLesson(lessonId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`UPDATE lessons SET ended_at = last_activity_at WHERE id = $1 AND ended_at IS NULL`, [lessonId]);
  return (rowCount ?? 0) > 0;
}

export async function idleLessons(idleMinutes: number): Promise<{ id: number; learnerId: number }[]> {
  const { rows } = await pool.query<{ id: number; learner_id: number }>(
    `SELECT id, learner_id FROM lessons WHERE ended_at IS NULL AND last_activity_at < now() - make_interval(mins => $1)`,
    [idleMinutes],
  );
  return rows.map((row) => ({ id: row.id, learnerId: row.learner_id }));
}

export interface OpenLesson {
  id: number;
  mode: LessonMode;
  scenario: string | null;
  openingLine: string | null;
}

export async function recentOpenLesson(learnerId: number, withinMinutes: number): Promise<OpenLesson | undefined> {
  const { rows } = await pool.query<{ id: number; mode: LessonMode; scenario: string | null; opening_line: string | null }>(
    `SELECT id, mode, scenario, opening_line FROM lessons
     WHERE learner_id = $1 AND ended_at IS NULL AND last_activity_at > now() - make_interval(mins => $2)
     ORDER BY started_at DESC LIMIT 1`,
    [learnerId, withinMinutes],
  );
  const row = rows[0];
  return row && { id: row.id, mode: row.mode, scenario: row.scenario, openingLine: row.opening_line };
}

export async function lessonsNeedingNotes(limit: number): Promise<{ id: number; learnerId: number }[]> {
  const { rows } = await pool.query<{ id: number; learner_id: number }>(
    `SELECT id, learner_id FROM lessons WHERE ended_at IS NOT NULL AND NOT notes_updated ORDER BY id LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({ id: row.id, learnerId: row.learner_id }));
}

export async function markNotesUpdated(lessonId: number): Promise<void> {
  await pool.query(`UPDATE lessons SET notes_updated = TRUE WHERE id = $1`, [lessonId]);
}

export async function lessonInfo(lessonId: number): Promise<{ mode: LessonMode; scenario: string | null } | undefined> {
  const { rows } = await pool.query<{ mode: LessonMode; scenario: string | null }>(`SELECT mode, scenario FROM lessons WHERE id = $1`, [lessonId]);
  return rows[0];
}

// --- turns and drill attempts ---

export interface TurnRecord {
  kind: "voice" | "text";
  learnerText: string;
  corrected: string | null;
  feedback: string;
  tutorReply: string;
  unclearWords: string[];
}

export async function addTurn(lessonId: number, turn: TurnRecord): Promise<void> {
  await pool.query(
    `INSERT INTO turns (lesson_id, kind, learner_text, corrected, feedback, tutor_reply, unclear_words)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [lessonId, turn.kind, turn.learnerText, turn.corrected, turn.feedback, turn.tutorReply, turn.unclearWords],
  );
  await touchLesson(lessonId);
}

export async function lessonTurns(lessonId: number): Promise<TurnRecord[]> {
  const { rows } = await pool.query<{
    kind: "voice" | "text";
    learner_text: string;
    corrected: string | null;
    feedback: string;
    tutor_reply: string;
    unclear_words: string[];
  }>(`SELECT kind, learner_text, corrected, feedback, tutor_reply, unclear_words FROM turns WHERE lesson_id = $1 ORDER BY id`, [lessonId]);
  return rows.map((row) => ({
    kind: row.kind,
    learnerText: row.learner_text,
    corrected: row.corrected,
    feedback: row.feedback,
    tutorReply: row.tutor_reply,
    unclearWords: row.unclear_words,
  }));
}

export interface DrillRecord {
  kind: "repeat" | "dictation";
  target: string;
  answer: string;
  score: number | null;
  details: unknown;
}

export async function addDrillAttempt(lessonId: number, attempt: DrillRecord): Promise<void> {
  await pool.query(`INSERT INTO drill_attempts (lesson_id, kind, target, answer, score, details) VALUES ($1, $2, $3, $4, $5, $6)`, [
    lessonId,
    attempt.kind,
    attempt.target,
    attempt.answer,
    attempt.score,
    JSON.stringify(attempt.details ?? null),
  ]);
  await touchLesson(lessonId);
}

export async function lessonDrills(lessonId: number): Promise<DrillRecord[]> {
  const { rows } = await pool.query<DrillRecord>(
    `SELECT kind, target, answer, score, details FROM drill_attempts WHERE lesson_id = $1 ORDER BY id`,
    [lessonId],
  );
  return rows;
}

export async function recentDrillTargets(learnerId: number, limit: number): Promise<string[]> {
  const { rows } = await pool.query<{ target: string }>(
    `SELECT target FROM (
       SELECT d.target, max(d.id) AS last_id FROM drill_attempts d JOIN lessons l ON l.id = d.lesson_id
       WHERE l.learner_id = $1 GROUP BY d.target
     ) t ORDER BY last_id DESC LIMIT $2`,
    [learnerId, limit],
  );
  return rows.map((row) => row.target);
}

// --- words ---

export interface Word {
  id: number;
  ru: string;
  en: string;
}

/**
 * Saves words, skipping ones already in the learner's list (case-insensitive on the side they learn).
 * Returns each stored word and whether it is new.
 */
export async function addWords(
  learnerId: number,
  learning: Lang,
  lessonId: number | null,
  source: "lesson" | "manual",
  words: { ru: string; en: string }[],
): Promise<(Word & { isNew: boolean })[]> {
  const saved: (Word & { isNew: boolean })[] = [];
  for (const word of words) {
    const { rows } = await pool.query<Word & { is_new: boolean }>(
      `INSERT INTO words (learner_id, learning, ru, en, source, lesson_id) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (learner_id, learning, lower(CASE learning WHEN 'en' THEN en ELSE ru END)) DO UPDATE SET ru = words.ru
       RETURNING id, ru, en, (xmax = 0) AS is_new`,
      [learnerId, learning, word.ru.trim(), word.en.trim(), source, lessonId],
    );
    const row = rows[0]!;
    saved.push({ id: row.id, ru: row.ru, en: row.en, isNew: row.is_new });
  }
  return saved;
}

export async function findWord(learnerId: number, wordId: number): Promise<Word | undefined> {
  const { rows } = await pool.query<Word>(`SELECT id, ru, en FROM words WHERE learner_id = $1 AND id = $2`, [learnerId, wordId]);
  return rows[0];
}

export async function findWords(learnerId: number, wordIds: number[]): Promise<Word[]> {
  const { rows } = await pool.query<Word>(`SELECT id, ru, en FROM words WHERE learner_id = $1 AND id = ANY($2::bigint[])`, [learnerId, wordIds]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return wordIds.map((id) => byId.get(id)).filter((word): word is Word => word !== undefined);
}

export async function deleteWord(learnerId: number, wordId: number): Promise<void> {
  await pool.query(`DELETE FROM words WHERE learner_id = $1 AND id = $2`, [learnerId, wordId]);
}

export async function latestWords(learnerId: number, learning: Lang, limit: number): Promise<{ words: Word[]; total: number }> {
  const { rows } = await pool.query<Word & { total: number }>(
    `SELECT id, ru, en, count(*) OVER ()::int AS total FROM words WHERE learner_id = $1 AND learning = $2 ORDER BY id DESC LIMIT $3`,
    [learnerId, learning, limit],
  );
  return { words: rows.reverse().map(({ id, ru, en }) => ({ id, ru, en })), total: rows[0]?.total ?? 0 };
}

export async function lessonWords(lessonId: number): Promise<Word[]> {
  const { rows } = await pool.query<Word>(`SELECT id, ru, en FROM words WHERE lesson_id = $1 ORDER BY id`, [lessonId]);
  return rows;
}

// --- notifications ---

/** Records a notification slot; true only for the first caller, so a reminder is sent at most once. */
export async function claimNotification(learnerId: number, kind: "reminder" | "weekly", slotKey: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO sent_notifications (learner_id, kind, slot_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [learnerId, kind, slotKey],
  );
  return (rowCount ?? 0) > 0;
}

export async function minutesSinceActivity(learnerId: number): Promise<number | undefined> {
  const { rows } = await pool.query<{ minutes: number | null }>(
    `SELECT extract(epoch FROM now() - max(last_activity_at)) / 60 AS minutes FROM lessons WHERE learner_id = $1`,
    [learnerId],
  );
  return rows[0]?.minutes ?? undefined;
}

// --- progress ---

export interface ProgressStats {
  activeDays: string[];
  sessionsToday: number;
  sessions: number;
  minutes: number;
  spokenReplies: number;
  typedReplies: number;
  drills: number;
  pronThisWeek: number | null;
  pronLastWeek: number | null;
  wordsTotal: number;
  wordsThisWeek: number;
}

export async function progressStats(learnerId: number, timezone: string, today: string): Promise<ProgressStats> {
  // "Active" lessons have at least one turn or drill attempt; opening a lesson and leaving doesn't count.
  const { rows } = await pool.query(
    `WITH active AS (
       SELECT l.* FROM lessons l
       WHERE l.learner_id = $1
         AND (EXISTS (SELECT 1 FROM turns t WHERE t.lesson_id = l.id) OR EXISTS (SELECT 1 FROM drill_attempts d WHERE d.lesson_id = l.id))
     ),
     activity AS (
       SELECT t.created_at FROM turns t JOIN lessons l ON l.id = t.lesson_id WHERE l.learner_id = $1
       UNION ALL
       SELECT d.created_at FROM drill_attempts d JOIN lessons l ON l.id = d.lesson_id WHERE l.learner_id = $1
     )
     SELECT
       (SELECT coalesce(array_agg(day ORDER BY day DESC), '{}') FROM (
          SELECT DISTINCT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day FROM activity
        ) days) AS active_days,
       (SELECT count(*)::int FROM active WHERE to_char(started_at AT TIME ZONE $2, 'YYYY-MM-DD') = $3) AS sessions_today,
       (SELECT count(*)::int FROM active WHERE started_at > now() - interval '7 days') AS sessions,
       (SELECT coalesce(round(sum(extract(epoch FROM coalesce(ended_at, last_activity_at) - started_at)) / 60), 0)::int
          FROM active WHERE started_at > now() - interval '7 days') AS minutes,
       (SELECT count(*)::int FROM turns t JOIN lessons l ON l.id = t.lesson_id
          WHERE l.learner_id = $1 AND t.kind = 'voice' AND t.created_at > now() - interval '7 days') AS spoken_replies,
       (SELECT count(*)::int FROM turns t JOIN lessons l ON l.id = t.lesson_id
          WHERE l.learner_id = $1 AND t.kind = 'text' AND t.created_at > now() - interval '7 days') AS typed_replies,
       (SELECT count(*)::int FROM drill_attempts d JOIN lessons l ON l.id = d.lesson_id
          WHERE l.learner_id = $1 AND d.created_at > now() - interval '7 days') AS drills,
       (SELECT avg(score)::real FROM drill_attempts d JOIN lessons l ON l.id = d.lesson_id
          WHERE l.learner_id = $1 AND d.kind = 'repeat' AND d.created_at > now() - interval '7 days') AS pron_this_week,
       (SELECT avg(score)::real FROM drill_attempts d JOIN lessons l ON l.id = d.lesson_id
          WHERE l.learner_id = $1 AND d.kind = 'repeat'
            AND d.created_at <= now() - interval '7 days' AND d.created_at > now() - interval '14 days') AS pron_last_week,
       (SELECT count(*)::int FROM words WHERE learner_id = $1) AS words_total,
       (SELECT count(*)::int FROM words WHERE learner_id = $1 AND created_at > now() - interval '7 days') AS words_this_week`,
    [learnerId, timezone, today],
  );
  const row = rows[0];
  return {
    activeDays: row.active_days,
    sessionsToday: row.sessions_today,
    sessions: row.sessions,
    minutes: row.minutes,
    spokenReplies: row.spoken_replies,
    typedReplies: row.typed_replies,
    drills: row.drills,
    pronThisWeek: row.pron_this_week,
    pronLastWeek: row.pron_last_week,
    wordsTotal: row.words_total,
    wordsThisWeek: row.words_this_week,
  };
}

export async function usageByLearner(): Promise<{ learnerId: number; firstName: string; sessions7d: number; lastActivity: Date | null }[]> {
  const { rows } = await pool.query<{ telegram_id: number; first_name: string; sessions: number; last_activity: Date | null }>(
    `SELECT le.telegram_id, le.first_name,
       (SELECT count(*)::int FROM lessons l WHERE l.learner_id = le.telegram_id AND l.started_at > now() - interval '7 days'
          AND (EXISTS (SELECT 1 FROM turns t WHERE t.lesson_id = l.id) OR EXISTS (SELECT 1 FROM drill_attempts d WHERE d.lesson_id = l.id))) AS sessions,
       (SELECT max(last_activity_at) FROM lessons l WHERE l.learner_id = le.telegram_id) AS last_activity
     FROM learners le ORDER BY le.created_at`,
  );
  return rows.map((row) => ({ learnerId: row.telegram_id, firstName: row.first_name, sessions7d: row.sessions, lastActivity: row.last_activity }));
}
