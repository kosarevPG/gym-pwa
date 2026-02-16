-- Политика DELETE для workout_sessions (удаление тренировки из экрана редактирования).
DROP POLICY IF EXISTS "workout_sessions allow anon delete" ON workout_sessions;
CREATE POLICY "workout_sessions allow anon delete" ON workout_sessions
  FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';
