-- Выполни этот SQL в Supabase: SQL Editor → New query → вставь и Run.
-- Если таблицы training_logs или exercises уже есть с другой структурой — удали их (DROP TABLE) или измени скрипт под свои колонки.
-- Имя таблицы с подходами должно быть именно training_logs (или поменяй константу в коде src/lib/api.ts).
-- Важно: exercises.id должен быть UUID. Иначе training_logs не примет exercise_id.
--
-- Если ошибка "invalid input syntax for type uuid: ex-back-3" — в базе лежат старые id. Сбрось таблицы и выполни скрипт целиком:
--   DROP TABLE IF EXISTS training_logs;
--   DROP TABLE IF EXISTS exercises;
-- (раскомментируй две строки ниже и выполни один раз, затем закомментируй и выполни весь скрипт)
-- DROP TABLE IF EXISTS training_logs;
-- DROP TABLE IF EXISTS exercises;

-- 1. Таблица упражнений (категория + свои упражнения пользователя)
CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('back','legs','chest','shoulders','triceps','biceps','abs','cardio')),
  name_ru TEXT NOT NULL,
  name_en TEXT DEFAULT '',
  weight_type TEXT DEFAULT 'barbell' CHECK (weight_type IN ('barbell','dumbbell','machine','bodyweight','standard')),
  base_weight NUMERIC DEFAULT 20,
  target_weight_kg NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Таблица подходов (логи тренировок)
CREATE TABLE IF NOT EXISTS training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  weight NUMERIC NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  set_group_id TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS: разрешить анонимное чтение и вставку (для PWA без авторизации)
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercises allow anon read" ON exercises;
CREATE POLICY "exercises allow anon read" ON exercises FOR SELECT USING (true);

DROP POLICY IF EXISTS "exercises allow anon insert" ON exercises;
CREATE POLICY "exercises allow anon insert" ON exercises FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "training_logs allow anon read" ON training_logs;
CREATE POLICY "training_logs allow anon read" ON training_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "training_logs allow anon insert" ON training_logs;
CREATE POLICY "training_logs allow anon insert" ON training_logs FOR INSERT WITH CHECK (true);

-- 4. Если таблица training_logs уже есть с другими колонками — посмотри в Table Editor имена колонок.
--    Код ожидает: exercise_id (UUID), weight (number), reps (integer), set_group_id (text), order_index (integer).
--    Если exercise_id у тебя TEXT — пересоздай таблицу с exercise_id UUID REFERENCES exercises(id),
--    иначе вставка из приложения не сработает.

-- 5. Наполнение дефолтными упражнениями (опционально)
INSERT INTO exercises (category, name_ru, name_en, weight_type, base_weight, target_weight_kg) VALUES
  ('back', 'Тяга верхнего блока', 'Lat Pulldown', 'machine', 0, 60),
  ('back', 'Тяга штанги в наклоне', 'Barbell Row', 'barbell', 20, 80),
  ('back', 'Подтягивания', 'Pull-ups', 'bodyweight', 0, NULL),
  ('legs', 'Присед со штангой', 'Barbell Squat', 'barbell', 20, 100),
  ('legs', 'Жим ногами', 'Leg Press', 'machine', 0, 120),
  ('legs', 'Румынская тяга', 'Romanian Deadlift', 'barbell', 20, 80),
  ('chest', 'Жим штанги лёжа', 'Bench Press', 'barbell', 20, 80),
  ('chest', 'Разводка гантелей', 'Dumbbell Fly', 'dumbbell', 0, 20),
  ('chest', 'Жим гантелей', 'Dumbbell Press', 'dumbbell', 0, 30),
  ('shoulders', 'Жим стоя', 'Overhead Press', 'barbell', 20, 50),
  ('shoulders', 'Махи в стороны', 'Lateral Raise', 'dumbbell', 0, 12),
  ('triceps', 'Разгибания на блоке', 'Triceps Pushdown', 'machine', 0, 40),
  ('triceps', 'Отжимания на брусьях', 'Dips', 'bodyweight', 0, NULL),
  ('biceps', 'Подъём на бицепс', 'Bicep Curl', 'dumbbell', 0, 14),
  ('biceps', 'Молотки', 'Hammer Curl', 'dumbbell', 0, 12),
  ('abs', 'Скручивания', 'Crunches', 'bodyweight', 0, NULL),
  ('abs', 'Планка', 'Plank', 'bodyweight', 0, NULL),
  ('cardio', 'Бег', 'Running', 'bodyweight', 0, NULL),
  ('cardio', 'Велосипед', 'Cycling', 'bodyweight', 0, NULL);
-- Если выполняешь скрипт повторно — закомментируй блок INSERT выше, чтобы не дублировать.
