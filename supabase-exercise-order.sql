-- Порядок выполнения упражнений в рамках одной тренировки (session_id).
-- Используется при выводе истории: упражнения сортируются по exercise_order.

ALTER TABLE training_logs
  ADD COLUMN IF NOT EXISTS exercise_order INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN training_logs.exercise_order IS 'Порядок упражнения в тренировке (0, 1, 2, …); один и тот же для всех подходов этого упражнения в сессии.';

CREATE INDEX IF NOT EXISTS idx_training_logs_session_exercise_order
  ON training_logs(session_id, exercise_order);

NOTIFY pgrst, 'reload schema';
