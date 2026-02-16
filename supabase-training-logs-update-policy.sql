-- Политика UPDATE для training_logs (редактирование подходов и порядка в истории тренировок).
ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "training_logs allow anon update" ON training_logs;
CREATE POLICY "training_logs allow anon update" ON training_logs
  FOR UPDATE USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
