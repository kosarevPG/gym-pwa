-- Политика DELETE для training_logs (редактирование прошедших тренировок).
ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "training_logs allow anon delete" ON training_logs;
CREATE POLICY "training_logs allow anon delete" ON training_logs
  FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';
