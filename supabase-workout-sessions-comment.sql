-- Комментарий к тренировке (для календаря).
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS comment TEXT;

COMMENT ON COLUMN workout_sessions.comment IS 'Комментарий пользователя к тренировке (доступен из календаря)';
