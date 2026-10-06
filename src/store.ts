import { config } from "./config.js";
import type { Lang, Level } from "./courses.js";
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
  /** Difficulty set by the learner, per course; no entry means the tutor decides. */
  levels: Partial<Record<Lang, Level>>;
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
  levels: Partial<Record<Lang, Level>>;
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
  levels: row.levels,
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

/** Sets the difficulty for one course; null hands the choice back to the tutor. */
export async function setLevel(learnerId: number, course: Lang, level: Level | null): Promise<void> {
  await pool.query(
    `UPDATE learners SET levels = CASE WHEN $3::text IS NULL THEN levels - $2::text ELSE levels || jsonb_build_object($2::text, $3::text) END
     WHERE telegram_id = $1`,
    [learnerId, course, level],
  );
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

export type LessonMode = "talk" | "repeat" | "dictation" | "vocab";

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

/** Scenarios of the learner's latest role-plays, newest first, so the next one can differ. */
export async function recentScenarios(learnerId: number, limit: number): Promise<string[]> {
  const { rows } = await pool.query<{ scenario: string }>(
    `SELECT scenario FROM lessons
     WHERE learner_id = $1 AND mode = 'talk' AND scenario IS NOT NULL AND opening_line IS NOT NULL
     ORDER BY id DESC LIMIT $2`,
    [learnerId, limit],
  );
  return rows.map((row) => row.scenario);
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
  kind: "repeat" | "dictation" | "vocab";
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

// --- word ladder ---

/** Stages 0-3 are recall drills; at `ambush` a word waits to be used unprompted in conversation. */
export const LADDER = { ambush: 4, learned: 5 } as const;

export interface LadderWord extends Word {
  stage: number;
  /** The learner's own wording that showed the gap; null for a word they added by hand. */
  said: string | null;
  /** Their full line at that moment, which `said` is a part of. */
  moment: string | null;
  /** Telegram file id of the word's picture, and what the picture shows. */
  imageFileId: string | null;
  imageScene: string | null;
}

/**
 * Puts vocabulary gaps on the ladder, due right away. A word that is already there slips back one rung:
 * the learner has just talked around it again.
 */
export async function addGapWords(
  learnerId: number,
  learning: Lang,
  lessonId: number,
  moment: string | null,
  gaps: { said: string; ru: string; en: string }[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const gap of gaps) {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO words (learner_id, learning, ru, en, source, lesson_id, said, moment, stage, due_at)
       VALUES ($1, $2, $3, $4, 'gap', $5, $6, $7, 0, now())
       ON CONFLICT (learner_id, learning, lower(CASE learning WHEN 'en' THEN en ELSE ru END)) DO UPDATE
         SET said = EXCLUDED.said, moment = EXCLUDED.moment, lesson_id = EXCLUDED.lesson_id,
             stage = GREATEST(coalesce(words.stage, 1) - 1, 0), due_at = now()
       RETURNING id`,
      [learnerId, learning, gap.ru.trim(), gap.en.trim(), lessonId, gap.said.trim(), moment],
    );
    ids.push(rows[0]!.id);
  }
  return ids;
}

export async function gapWordsSince(learnerId: number, learning: Lang, hours: number): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM words
     WHERE learner_id = $1 AND learning = $2 AND source = 'gap' AND created_at > now() - make_interval(hours => $3)`,
    [learnerId, learning, hours],
  );
  return rows[0]!.count;
}

/** A word the learner added by hand starts at the first new-situation rung; it has no line of their own to return to. */
export async function startLadder(learnerId: number, wordId: number, dueInHours: number): Promise<void> {
  await pool.query(`UPDATE words SET stage = 1, due_at = now() + make_interval(hours => $3) WHERE learner_id = $1 AND id = $2 AND stage IS NULL`, [
    learnerId,
    wordId,
    dueInHours,
  ]);
}

const LADDER_COLUMNS = `id, ru, en, stage, said, moment, image_file_id AS "imageFileId", image_scene AS "imageScene"`;

export async function dueLadderWords(learnerId: number, learning: Lang, limit: number): Promise<LadderWord[]> {
  const { rows } = await pool.query<LadderWord>(
    `SELECT ${LADDER_COLUMNS} FROM words
     WHERE learner_id = $1 AND learning = $2 AND stage < ${LADDER.ambush} AND due_at <= now()
     ORDER BY due_at, id LIMIT $3`,
    [learnerId, learning, limit],
  );
  return rows;
}

/** Words on the last rung that are due: the tutor steers a role-play toward them without saying them. */
export async function ambushWords(learnerId: number, learning: Lang, limit: number): Promise<LadderWord[]> {
  const { rows } = await pool.query<LadderWord>(
    `SELECT ${LADDER_COLUMNS} FROM words
     WHERE learner_id = $1 AND learning = $2 AND stage = ${LADDER.ambush} AND due_at <= now()
     ORDER BY due_at, id LIMIT $3`,
    [learnerId, learning, limit],
  );
  return rows;
}

export async function findLadderWord(learnerId: number, wordId: number): Promise<LadderWord | undefined> {
  const { rows } = await pool.query<LadderWord>(`SELECT ${LADDER_COLUMNS} FROM words WHERE learner_id = $1 AND id = $2 AND stage IS NOT NULL`, [
    learnerId,
    wordId,
  ]);
  return rows[0];
}

export async function moveOnLadder(learnerId: number, wordId: number, stage: number, dueInHours: number): Promise<void> {
  await pool.query(`UPDATE words SET stage = $3, due_at = now() + make_interval(hours => $4) WHERE learner_id = $1 AND id = $2`, [
    learnerId,
    wordId,
    stage,
    dueInHours,
  ]);
}

/** Marks last-rung words as learned by their learned-side spelling; returns the ones that were. */
export async function markLearned(learnerId: number, learning: Lang, terms: string[]): Promise<Word[]> {
  const { rows } = await pool.query<Word>(
    `UPDATE words SET stage = ${LADDER.learned}, due_at = NULL
     WHERE learner_id = $1 AND learning = $2 AND stage = ${LADDER.ambush}
       AND lower(CASE learning WHEN 'en' THEN en ELSE ru END) = ANY($3::text[])
     RETURNING id, ru, en`,
    [learnerId, learning, terms.map((term) => term.trim().toLowerCase())],
  );
  return rows;
}

export async function ladderStats(learnerId: number, learning: Lang): Promise<{ active: number; due: number; learned: number }> {
  const { rows } = await pool.query<{ active: number; due: number; learned: number }>(
    `SELECT count(*) FILTER (WHERE stage < ${LADDER.learned})::int AS active,
            count(*) FILTER (WHERE stage < ${LADDER.ambush} AND due_at <= now())::int AS due,
            count(*) FILTER (WHERE stage = ${LADDER.learned})::int AS learned
     FROM words WHERE learner_id = $1 AND learning = $2 AND stage IS NOT NULL`,
    [learnerId, learning],
  );
  return rows[0]!;
}

/** Takes one picture from the learner's daily allowance; false when it is used up. */
export async function claimPicture(learnerId: number, perDay: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO picture_log (learner_id)
     SELECT $1 WHERE (SELECT count(*) FROM picture_log WHERE learner_id = $1 AND created_at > now() - interval '24 hours') < $2`,
    [learnerId, perDay],
  );
  return (rowCount ?? 0) > 0;
}

export async function saveWordPicture(learnerId: number, wordId: number, fileId: string, scene: string): Promise<void> {
  await pool.query(`UPDATE words SET image_file_id = $3, image_scene = $4 WHERE learner_id = $1 AND id = $2`, [learnerId, wordId, fileId, scene]);
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
