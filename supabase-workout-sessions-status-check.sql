-- Один источник истины для активной сессии: ended_at IS NULL ⇔ status = 'active'.
-- Канонический признак активности в коде — ended_at; status храним для отображения и экспорта.

ALTER TABLE workout_sessions
  DROP CONSTRAINT IF EXISTS workout_sessions_status_check;

ALTER TABLE workout_sessions
  ADD CONSTRAINT workout_sessions_status_check
  CHECK (
    (ended_at IS NULL AND status = 'active')
    OR (ended_at IS NOT NULL AND status = 'completed')
  );

COMMENT ON COLUMN workout_sessions.ended_at IS 'NULL = активная сессия (единственный источник истины для «идёт тренировка»)';
COMMENT ON COLUMN workout_sessions.status IS 'Должен совпадать с ended_at: active ⇔ ended_at IS NULL (см. workout_sessions_status_check)';

-- NOTIFY pgrst, 'reload schema';
