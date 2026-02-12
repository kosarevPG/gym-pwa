-- Расширенная схема упражнений под гибкий UI и аналитику.
-- Совместима с текущим приложением: сохраняются legacy-поля category/weight_type/base_weight/target_weight_kg.
-- Запускай в Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'body_part_enum') THEN
    CREATE TYPE body_part_enum AS ENUM (
      'CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'TRICEPS', 'BICEPS', 'ABS', 'CARDIO', 'FULL_BODY', 'OTHER'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'input_mode_enum') THEN
    CREATE TYPE input_mode_enum AS ENUM (
      'WEIGHT_REPS', 'DISTANCE_TIME', 'TIME_ONLY', 'REPS_ONLY'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bodyweight_type_enum') THEN
    CREATE TYPE bodyweight_type_enum AS ENUM (
      'NONE', 'WEIGHTED', 'ASSISTED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,                    -- BARBELL, DUMBBELL, MACHINE...
  name_ru TEXT NOT NULL,
  name_en TEXT NOT NULL,
  default_weight_step NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO equipment (code, name_ru, name_en, default_weight_step) VALUES
  ('BARBELL', 'Штанга', 'Barbell', 2.5),
  ('DUMBBELL', 'Гантели', 'Dumbbell', 1.0),
  ('MACHINE', 'Тренажёр', 'Machine', 5.0),
  ('BODYWEIGHT', 'Собственный вес', 'Bodyweight', 0),
  ('CABLE', 'Блок/Трос', 'Cable', 2.5),
  ('OTHER', 'Другое', 'Other', NULL)
ON CONFLICT (code) DO UPDATE
SET
  name_ru = EXCLUDED.name_ru,
  name_en = EXCLUDED.name_en,
  default_weight_step = EXCLUDED.default_weight_step;

CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 1) Метаданные и контент
  name_ru TEXT NOT NULL,
  name_en TEXT DEFAULT '',
  external_id TEXT UNIQUE,
  description TEXT,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  body_part body_part_enum NOT NULL DEFAULT 'OTHER',
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,

  -- 2) Логика ввода
  input_mode input_mode_enum NOT NULL DEFAULT 'WEIGHT_REPS',
  bodyweight_type bodyweight_type_enum NOT NULL DEFAULT 'NONE',
  is_unilateral BOOLEAN NOT NULL DEFAULT false,
  simultaneous BOOLEAN NOT NULL DEFAULT false,

  -- 3) Аналитика и настройки
  weight_step NUMERIC(6,2),
  default_rest_seconds INTEGER NOT NULL DEFAULT 120 CHECK (default_rest_seconds >= 0),
  is_compound BOOLEAN NOT NULL DEFAULT true,
  hidden_from_stats BOOLEAN NOT NULL DEFAULT false,

  -- Legacy-совместимость (чтобы текущий фронт работал без миграции кода)
  category TEXT NOT NULL CHECK (category IN ('back','legs','chest','shoulders','triceps','biceps','abs','cardio')),
  weight_type TEXT DEFAULT 'barbell' CHECK (weight_type IN ('barbell','dumbbell','machine','bodyweight','standard')),
  base_weight NUMERIC DEFAULT 20,
  target_weight_kg NUMERIC,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (category, name_ru)
);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_exercises_set_updated_at ON exercises;
CREATE TRIGGER trg_exercises_set_updated_at
BEFORE UPDATE ON exercises
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- Логи выполненных упражнений/подходов
CREATE TABLE IF NOT EXISTS training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Каноническая модель Set (краткие имена)
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id TEXT NOT NULL,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  set_no INTEGER NOT NULL DEFAULT 0,
  input_wt NUMERIC NOT NULL DEFAULT 0,
  side TEXT CHECK (upper(side) IN ('LEFT', 'RIGHT', 'BOTH')) DEFAULT 'BOTH',
  rpe NUMERIC(4,2),
  rest_s INTEGER,
  body_wt_snapshot NUMERIC,
  effective_load NUMERIC,
  side_mult NUMERIC(6,2),
  set_volume NUMERIC,

  -- Совместимость с legacy-кодом
  set_group_id TEXT NOT NULL,                            -- идентификатор тренировки/сессии
  order_index INTEGER NOT NULL DEFAULT 0,

  -- для WEIGHT_REPS
  weight NUMERIC NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,

  -- для DISTANCE_TIME / TIME_ONLY
  distance_km NUMERIC,
  duration_seconds INTEGER,

  -- общие
  superset_exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  one_rm NUMERIC,
  volume NUMERIC,
  completed_at TIMESTAMPTZ,
  rest_seconds INTEGER,
  volume_multiplier NUMERIC(6,2) DEFAULT 1.0,          -- удобно для unilateral/simultaneous
  hidden_from_stats BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);
CREATE INDEX IF NOT EXISTS idx_exercises_body_part ON exercises(body_part);
CREATE INDEX IF NOT EXISTS idx_training_logs_exercise_id ON training_logs(exercise_id);
CREATE INDEX IF NOT EXISTS idx_training_logs_set_group_id ON training_logs(set_group_id);
CREATE INDEX IF NOT EXISTS idx_training_logs_session_id ON training_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_training_logs_ts ON training_logs(ts DESC);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment allow anon read" ON equipment;
CREATE POLICY "equipment allow anon read" ON equipment FOR SELECT USING (true);

DROP POLICY IF EXISTS "exercises allow anon read" ON exercises;
CREATE POLICY "exercises allow anon read" ON exercises FOR SELECT USING (true);

DROP POLICY IF EXISTS "exercises allow anon insert" ON exercises;
CREATE POLICY "exercises allow anon insert" ON exercises FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "exercises allow anon update" ON exercises;
CREATE POLICY "exercises allow anon update" ON exercises FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "training_logs allow anon read" ON training_logs;
CREATE POLICY "training_logs allow anon read" ON training_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "training_logs allow anon insert" ON training_logs;
CREATE POLICY "training_logs allow anon insert" ON training_logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "training_logs allow anon update" ON training_logs;
CREATE POLICY "training_logs allow anon update" ON training_logs FOR UPDATE USING (true) WITH CHECK (true);

-- Пример сидов (id генерируются как UUID автоматически)
INSERT INTO exercises (
  name_ru, name_en, description, media_urls, body_part, equipment_id,
  input_mode, bodyweight_type, is_unilateral, simultaneous,
  weight_step, default_rest_seconds, is_compound, hidden_from_stats,
  category, weight_type, base_weight, target_weight_kg
)
VALUES
(
  'Жим штанги лёжа',
  'Bench Press',
  'Контролируй лопатки и траекторию грифа.',
  ARRAY['https://example.com/bench-setup.jpg', 'https://example.com/bench-technique.mp4'],
  'CHEST',
  (SELECT id FROM equipment WHERE code = 'BARBELL'),
  'WEIGHT_REPS',
  'NONE',
  false,
  false,
  2.5,
  180,
  true,
  false,
  'chest',
  'barbell',
  20,
  80
),
(
  'Подтягивания с весом',
  'Weighted Pull-ups',
  'Добавочный вес на пояс.',
  ARRAY[]::TEXT[],
  'BACK',
  (SELECT id FROM equipment WHERE code = 'BODYWEIGHT'),
  'WEIGHT_REPS',
  'WEIGHTED',
  false,
  false,
  2.5,
  150,
  true,
  false,
  'back',
  'bodyweight',
  0,
  NULL
),
(
  'Планка',
  'Plank',
  'Держи корпус ровно.',
  ARRAY[]::TEXT[],
  'ABS',
  (SELECT id FROM equipment WHERE code = 'BODYWEIGHT'),
  'TIME_ONLY',
  'NONE',
  false,
  false,
  NULL,
  60,
  false,
  false,
  'abs',
  'bodyweight',
  0,
  NULL
)
ON CONFLICT (category, name_ru) DO UPDATE
SET
  description = EXCLUDED.description,
  media_urls = EXCLUDED.media_urls,
  body_part = EXCLUDED.body_part,
  equipment_id = EXCLUDED.equipment_id,
  input_mode = EXCLUDED.input_mode,
  bodyweight_type = EXCLUDED.bodyweight_type,
  is_unilateral = EXCLUDED.is_unilateral,
  simultaneous = EXCLUDED.simultaneous,
  weight_step = EXCLUDED.weight_step,
  default_rest_seconds = EXCLUDED.default_rest_seconds,
  is_compound = EXCLUDED.is_compound,
  hidden_from_stats = EXCLUDED.hidden_from_stats,
  weight_type = EXCLUDED.weight_type,
  base_weight = EXCLUDED.base_weight,
  target_weight_kg = EXCLUDED.target_weight_kg,
  updated_at = now();
