-- Миграция существующей БД exercises -> v2 (без удаления данных).
-- Запуск: Supabase SQL Editor -> New query -> выполнить целиком.

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
  code TEXT NOT NULL UNIQUE,
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

-- Добавляем колонку updated_at в любом случае (если её ещё нет)
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Добавляем v2-колонки.
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS media_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_unilateral BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS simultaneous BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weight_step NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS default_rest_seconds INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS is_compound BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hidden_from_stats BOOLEAN NOT NULL DEFAULT false;

-- body_part: добавляем как enum, если колонки ещё нет.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exercises'
      AND column_name = 'body_part'
  ) THEN
    ALTER TABLE exercises
      ADD COLUMN body_part body_part_enum NOT NULL DEFAULT 'OTHER';
  END IF;
END $$;

-- input_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exercises'
      AND column_name = 'input_mode'
  ) THEN
    ALTER TABLE exercises
      ADD COLUMN input_mode input_mode_enum NOT NULL DEFAULT 'WEIGHT_REPS';
  END IF;
END $$;

-- bodyweight_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exercises'
      AND column_name = 'bodyweight_type'
  ) THEN
    ALTER TABLE exercises
      ADD COLUMN bodyweight_type bodyweight_type_enum NOT NULL DEFAULT 'NONE';
  END IF;
END $$;

-- Заполняем body_part из legacy category для уже существующих строк
UPDATE exercises
SET body_part = CASE category
  WHEN 'chest' THEN 'CHEST'::body_part_enum
  WHEN 'back' THEN 'BACK'::body_part_enum
  WHEN 'legs' THEN 'LEGS'::body_part_enum
  WHEN 'shoulders' THEN 'SHOULDERS'::body_part_enum
  WHEN 'triceps' THEN 'TRICEPS'::body_part_enum
  WHEN 'biceps' THEN 'BICEPS'::body_part_enum
  WHEN 'abs' THEN 'ABS'::body_part_enum
  WHEN 'cardio' THEN 'CARDIO'::body_part_enum
  ELSE 'OTHER'::body_part_enum
END
WHERE body_part = 'OTHER'::body_part_enum;

-- Нормализуем default_rest_seconds
UPDATE exercises
SET default_rest_seconds = 120
WHERE default_rest_seconds IS NULL OR default_rest_seconds < 0;

ALTER TABLE exercises
  DROP CONSTRAINT IF EXISTS exercises_default_rest_seconds_check;
ALTER TABLE exercises
  ADD CONSTRAINT exercises_default_rest_seconds_check CHECK (default_rest_seconds >= 0);

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

-- Индексы
CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);
CREATE INDEX IF NOT EXISTS idx_exercises_body_part ON exercises(body_part);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exercises_external_id ON exercises(external_id);

-- RLS + политики (минимум для текущего фронта)
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment allow anon read" ON equipment;
CREATE POLICY "equipment allow anon read" ON equipment FOR SELECT USING (true);

DROP POLICY IF EXISTS "exercises allow anon read" ON exercises;
CREATE POLICY "exercises allow anon read" ON exercises FOR SELECT USING (true);

DROP POLICY IF EXISTS "exercises allow anon insert" ON exercises;
CREATE POLICY "exercises allow anon insert" ON exercises FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "exercises allow anon update" ON exercises;
CREATE POLICY "exercises allow anon update" ON exercises FOR UPDATE USING (true) WITH CHECK (true);
