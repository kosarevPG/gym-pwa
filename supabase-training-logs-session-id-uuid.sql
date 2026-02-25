-- training_logs.session_id: TEXT → UUID FK на workout_sessions.id.
-- Выполнять после того, как все session_id в таблице — валидные UUID (как в текущем приложении).
-- При ошибке приведения проверь: SELECT DISTINCT session_id FROM training_logs WHERE session_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- Снять ограничения, мешающие смене типа (если есть FK — его нет в текущей схеме на session_id)
ALTER TABLE training_logs
  ALTER COLUMN session_id TYPE UUID USING session_id::uuid;

ALTER TABLE training_logs
  ADD CONSTRAINT training_logs_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE;

COMMENT ON COLUMN training_logs.session_id IS 'UUID сессии (workout_sessions.id). Раньше был TEXT для legacy.';

-- NOTIFY pgrst, 'reload schema';
