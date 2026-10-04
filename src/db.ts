import { Pool, types } from "pg";
import { config } from "./config.js";

// BIGINT/BIGSERIAL come back as strings by default; every id and count here fits a JS number.
types.setTypeParser(20, (value) => Number(value));

export const pool = new Pool({ connectionString: config.databaseUrl, max: 5 });

// Idempotent schema: safe to run on every start. Voice audio is never stored, only text.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS learners (
  telegram_id BIGINT PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL,
  lesson_times TEXT[] NOT NULL,
  reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  tutor_notes TEXT NOT NULL DEFAULT '',
  next_focus TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lessons (
  id BIGSERIAL PRIMARY KEY,
  learner_id BIGINT NOT NULL REFERENCES learners (telegram_id),
  mode TEXT NOT NULL,
  scenario TEXT,
  opening_line TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  notes_updated BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS lessons_learner_started ON lessons (learner_id, started_at DESC);
CREATE INDEX IF NOT EXISTS lessons_open ON lessons (last_activity_at) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS turns (
  id BIGSERIAL PRIMARY KEY,
  lesson_id BIGINT NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  learner_text TEXT NOT NULL,
  corrected TEXT,
  feedback TEXT NOT NULL,
  tutor_reply TEXT NOT NULL,
  unclear_words TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS turns_lesson ON turns (lesson_id, id);

CREATE TABLE IF NOT EXISTS drill_attempts (
  id BIGSERIAL PRIMARY KEY,
  lesson_id BIGINT NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  answer TEXT NOT NULL,
  score REAL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drill_attempts_lesson ON drill_attempts (lesson_id, id);

CREATE TABLE IF NOT EXISTS words (
  id BIGSERIAL PRIMARY KEY,
  learner_id BIGINT NOT NULL REFERENCES learners (telegram_id),
  ru TEXT NOT NULL,
  en TEXT NOT NULL,
  source TEXT NOT NULL,
  lesson_id BIGINT REFERENCES lessons (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The language each learner studies (src/courses.ts). Learners from before courses existed were learning
-- Russian; new learners pick on /start, so after the backfill the column has no default (NULL = not picked).
ALTER TABLE learners ADD COLUMN IF NOT EXISTS learning TEXT DEFAULT 'ru' CHECK (learning IN ('ru', 'en'));
ALTER TABLE learners ALTER COLUMN learning DROP DEFAULT;

-- A word is unique by its learned side: ru for Russian learners, en for English learners
-- (two English words can share one Russian translation, and the other way round).
ALTER TABLE words ADD COLUMN IF NOT EXISTS learning TEXT NOT NULL DEFAULT 'ru' CHECK (learning IN ('ru', 'en'));
DROP INDEX IF EXISTS words_learner_ru;
CREATE UNIQUE INDEX IF NOT EXISTS words_learner_term ON words (learner_id, learning, lower(CASE learning WHEN 'en' THEN en ELSE ru END));

CREATE TABLE IF NOT EXISTS sent_notifications (
  learner_id BIGINT NOT NULL REFERENCES learners (telegram_id),
  kind TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, kind, slot_key)
);
`;

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
}
