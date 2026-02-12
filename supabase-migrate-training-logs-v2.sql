-- Миграция training_logs под экран активной тренировки (RPE/таймер/суперсеты/аналитика).
-- Без удаления данных.

ALTER TABLE training_logs
  ADD COLUMN IF NOT EXISTS ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS set_no INTEGER,
  ADD COLUMN IF NOT EXISTS input_wt NUMERIC,
  ADD COLUMN IF NOT EXISTS side TEXT,
  ADD COLUMN IF NOT EXISTS body_wt_snapshot NUMERIC,
  ADD COLUMN IF NOT EXISTS side_mult NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS set_volume NUMERIC,
  ADD COLUMN IF NOT EXISTS rpe NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS rest_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS superset_exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS one_rm NUMERIC,
  ADD COLUMN IF NOT EXISTS volume NUMERIC,
  ADD COLUMN IF NOT EXISTS effective_load NUMERIC,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Для исторических строк (где completed_at пустой) ставим created_at:
UPDATE training_logs
SET completed_at = created_at
WHERE completed_at IS NULL;

UPDATE training_logs
SET
  ts = COALESCE(ts, completed_at, created_at),
  session_id = COALESCE(session_id, set_group_id),
  set_no = COALESCE(set_no, order_index),
  input_wt = COALESCE(input_wt, weight),
  side = COALESCE(side, 'BOTH'),
  side_mult = COALESCE(side_mult, 1),
  set_volume = COALESCE(set_volume, volume),
  body_wt_snapshot = COALESCE(body_wt_snapshot, NULL)
WHERE
  ts IS NULL
  OR session_id IS NULL
  OR set_no IS NULL
  OR input_wt IS NULL
  OR side IS NULL
  OR side_mult IS NULL
  OR set_volume IS NULL;

ALTER TABLE training_logs
  DROP CONSTRAINT IF EXISTS training_logs_side_check;
ALTER TABLE training_logs
  ADD CONSTRAINT training_logs_side_check CHECK (upper(side) IN ('LEFT', 'RIGHT', 'BOTH'));

-- Индексы для истории и суперсетов:
CREATE INDEX IF NOT EXISTS idx_training_logs_completed_at ON training_logs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_logs_superset_exercise_id ON training_logs(superset_exercise_id);
CREATE INDEX IF NOT EXISTS idx_training_logs_session_id ON training_logs(session_id);

-- RLS policy на UPDATE уже может быть в схеме; на всякий случай дублируем безопасно:
ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "training_logs allow anon update" ON training_logs;
CREATE POLICY "training_logs allow anon update" ON training_logs
FOR UPDATE USING (true) WITH CHECK (true);

-- Обновить кэш схемы PostgREST:
NOTIFY pgrst, 'reload schema';
