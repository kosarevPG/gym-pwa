-- Сессионный подход: одна тренировка = одна запись с началом/концом.
-- training_logs.set_group_id хранит id этой сессии (uuid).

CREATE TABLE IF NOT EXISTS workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_ended_at ON workout_sessions(ended_at);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_started_at ON workout_sessions(started_at DESC);

ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workout_sessions allow anon read" ON workout_sessions;
CREATE POLICY "workout_sessions allow anon read" ON workout_sessions FOR SELECT USING (true);
DROP POLICY IF EXISTS "workout_sessions allow anon insert" ON workout_sessions;
CREATE POLICY "workout_sessions allow anon insert" ON workout_sessions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "workout_sessions allow anon update" ON workout_sessions;
CREATE POLICY "workout_sessions allow anon update" ON workout_sessions FOR UPDATE USING (true) WITH CHECK (true);
