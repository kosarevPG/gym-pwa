-- Миграция training_logs под экран активной тренировки (RPE/таймер/суперсеты/аналитика).
-- Без удаления данных.

ALTER TABLE training_logs
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

-- Индексы для истории и суперсетов:
CREATE INDEX IF NOT EXISTS idx_training_logs_completed_at ON training_logs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_logs_superset_exercise_id ON training_logs(superset_exercise_id);

-- RLS policy на UPDATE уже может быть в схеме; на всякий случай дублируем безопасно:
ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "training_logs allow anon update" ON training_logs;
CREATE POLICY "training_logs allow anon update" ON training_logs
FOR UPDATE USING (true) WITH CHECK (true);

-- Обновить кэш схемы PostgREST:
NOTIFY pgrst, 'reload schema';
