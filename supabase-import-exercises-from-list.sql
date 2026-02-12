-- Импорт списка упражнений из твоего сообщения в таблицу exercises.
-- Важно: сначала выполни supabase-migrate-to-v2.sql (добавляет нужные поля и external_id).

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_exercises_external_id ON exercises(external_id);

-- Для старых записей привяжем external_id к текущему UUID
UPDATE exercises
SET external_id = id::text
WHERE external_id IS NULL;

WITH raw_data (source_id, name_raw, muscle_group_ru, description_raw, image_url, image_url2, weight_type_raw, base_wt, multiplier) AS (
  VALUES
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd3','Бабочка (Pec fly)','Грудь','', 'http://newlife.com.cy/wp-content/uploads/2019/11/22551301-Lever-Seated-Fly-female_Chest_360.gif','', 'Machine', 0, 1),
  ('99382933-f01f-4cbd-bb72-b17b298859be','Бабочка / Machine Fly (Pec Deck)','Грудь','', '','', 'Machine', 0, 1),
  ('bed65fc9-7ca9-4b26-b49f-07e9019e8286','Блин перед собой на уровень глаз','Плечи','', '','', 'Plate_Loaded', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd14','Выпады на месте / Dumbbell Lunge','Ноги','', 'https://kosarevPG.github.io/GymApp/images/exercises/DB_LUNGE.gif','', 'Dumbbell', 0, 2),
  ('21ab404b-6107-42c9-bc02-4f94af33ea53','Выпады при ходьбе / Dumbbell Walking Lunge','Ноги','', '','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd32','Гиперэкстензия / Hyperextension','Спина','', 'https://kosarevPG.github.io/GymApp/images/exercises/WEI_HPET.gif','', 'Bodyweight', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd22','Дельта-машина / Delt Machine','Плечи','', '','', 'Machine', 0, 1),
  ('e526a870-5ee0-4942-8e21-01bc68c157b1','Жим Арнольда / Arnold Dumbbell Press','Плечи','', 'https://kosarevPG.github.io/GymApp/images/exercises/ARNOLD_DB_PRESS','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd4','Жим в тренажере / Press chest','Грудь','', 'https://kosarevPG.github.io/GymApp-frontend/img/press_chest.jpg','https://kosarevPG.github.io/GymApp-frontend/img/press_chest.jpg', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd23','Жим вверх (MB Barbell) / Machine Shoulder Press','Плечи','', 'https://kosarevPG.github.io/GymApp-frontend/img/photo_2025-11-24_15-45-12.jpg','', 'Machine', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd6','Жим гантелей (Скамья 30°) / Incline Dumbbell Press','Грудь','', 'https://kosarevPG.github.io/GymApp/images/exercises/INC_DB_TWIST_PRESS.gif','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd5','Жим гантелей вверх (Скамья 90°)','Грудь','', '','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd15','Жим гантели на лавке','Грудь','', '','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd16','Жим ногами (блины) / Leg Press (Plate Loaded)','Ноги','', 'https://kosarevPG.github.io/GymApp/images/exercises/LEG_PRESS.gif','', 'Plate_Loaded', 40, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd17','Жим ногами (блок) / Leg Press (Selectorized)','Ноги','', 'https://kosarevPG.github.io/GymApp-frontend/img/Leg_press_2.jpg','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd9','Жим штанги (наклон 30°)','Грудь','', '','', 'Barbell', 15, 1),
  ('0806f934-092e-4757-97ac-aa1cc6cce991','Жим штанги / Bench Press','Грудь','', 'https://kosarevPG.github.io/GymApp/images/exercises/BB_BP.gif','', 'Barbell', 20, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd7','Жим штанги в смите (Скамья 40°)','Грудь','', '','', 'Barbell', 15, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd24','Жим штанги в смите сидя / Smith Machine Overhead Press','Плечи','', 'https://kosarevPG.github.io/GymApp/images/exercises/SM_PRESS.gif','https://kosarevPG.github.io/GymApp-frontend/img/photo_2025-11-24_15-44-45.jpg', 'Barbell', 15, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd18','Икры (в Гакке) / Calf Raise (Hack Squat)','Ноги','', '','', 'Plate_Loaded', 40, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd29','Махи в сторону одной рукой / One Arm Cable Lateral Raise','Плечи','', 'https://kosarevPG.github.io/GymApp/images/exercises/OA_CABLE_LAT_RAISE.gif','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd26','Махи в стороны (сидя) / Seated Lateral Raise','Плечи','', 'https://res.cloudinary.com/dzhbor5oj/image/upload/v1764368358/gymapp/exercises/qovtsxhx0t2uy5e3zti3.jpg','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd25','Махи в стороны (стоя) / Standing Lateral Raise','Плечи','', '','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd27','Отведение руки в сторону на нижнем блоке','Плечи','', '','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68ddb4','Отжимания','Трицепс','', 'https://kosarevPG.github.io/GymApp/images/exercises/BENCH_DIPS.png','', 'Bodyweight', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd28','Отжимания на брусьях / Assisted Dip','Плечи','', '','', 'Assisted', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd2','Поднятие штанги на бицепс (Barbell Bicep Curl)','Бицепс','', 'https://kosarevPG.github.io/GymApp/images/exercises/BB_BC_CURL.gif','', 'Barbell', 20, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd34','Подтягивания в гравитроне / Assisted Pull-Up','Спина','', 'https://kosarevPG.github.io/GymApp/images/exercises/ASS_PULLUP_MC.gif','', 'Machine', 0, 1),
  ('a4b82e80-3871-4b14-8061-0f042db2ed0d','Подъем гантелей перед собой сидя (по одной руке)','Плечи','', '','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd30','Подъём рук перед собой в кроссовере','Плечи','', '','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd19','Приседания в Гакк / Hack Squat','Ноги','', 'https://kosarevPG.github.io/GymApp/images/exercises/HACK_SQT.gif','', 'Plate_Loaded', 40, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd35','Пуловер в блочном тренажере стоя / Standing Cable Pullover','Спина','', '','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd10','Разводка гантелей (наклон 40°)','Грудь','', '','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd11','Разводка гантелей (Скамья 0°) / Dumbbell Fly','Грудь','', 'https://kosarevPG.github.io/GymApp/images/exercises/DB_FLY.gif','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd20','Разгибания ног / Leg Extension','Ноги','', 'https://kosarevPG.github.io/GymApp/images/exercises/LGE_EXT.gif','', 'Machine', 0, 1),
  ('82ae5831-31db-4690-b8f8-2551e9c66a6d','Разогрев спины длинная косичка','Спина','', '','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd21','Сгибание ног лежа / Prone leg curl','Ноги','', 'https://kosarevPG.github.io/GymApp/images/exercises/LEG_CURL.gif','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd1','Сгибание рук с гантелями (Скамья 30°) / Incline Dumbbell Curl','Бицепс','', '','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68ndb4','Сгибатель на скамье Скотта (Preacher Curl Machine)','Бицепс','', 'https://kosarevPG.github.io/GymApp/images/exercises/PREA_CURL_MAC.gif','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd45','Трицепс (косичка) / Triceps Rope Pushdown','Трицепс','', '','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd46','Трицепс (прямая ручка) / Triceps Bar Pushdown','Трицепс','', 'https://kosarevPG.github.io/GymApp/images/exercises/CABLE_PUSH_DOWN.gif','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd38','Тяга верхнего блока (независимые рукоятки)','Спина','', 'https://kosarevPG.github.io/GymApp-frontend/img/photo_2025-11-24_15-45-17.jpg','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd37','Тяга верхнего блока / Lat Pull Down','Спина','', 'https://kosarevPG.github.io/GymApp/images/exercises/LAT_PULL_DOWN.gif','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd36','Тяга верхнего блока, краб','Спина','', '','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd3x','Тяга верхнего блока, краб малый','Спина','', 'https://res.cloudinary.com/dzhbor5oj/image/upload/v1764196973/gymapp/exercises/dppjupuslvk0uomilyxp.jpg','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd39','Тяга гантелей к поясу','Спина','', '','', 'Dumbbell', 0, 2),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd33','Тяга гантелей на наклонной скамье 30°','Спина','', 'https://kosarevPG.github.io/GymApp-frontend/img/photo_2025-11-24_15-59-02.jpg','', 'Dumbbell', 0, 2),
  ('a94d9620-b9dc-4668-8822-57f541c955ea','Тяга нижнего блока','Спина','', '','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd40','Тяга нижнего блока / Seated Cable Row','Спина','', 'https://kosarevPG.github.io/GymApp/images/exercises/SEATED_CABLE_ROW.gif','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd4d','Тяга нижнего блока (Seated Cable Row), прямая ручка с круглыми захватами','Спина','', 'https://res.cloudinary.com/dzhbor5oj/image/upload/v1764196582/gymapp/exercises/vidmxexm10y325gyizyc.png','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd4x','Тяга нижнего блока (Seated Cable Row), V-образная ручка','Спина','', 'https://res.cloudinary.com/dzhbor5oj/image/upload/v1764197468/gymapp/exercises/rczl93wtg0cnjtsiannt.webp','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd41','Тяга с упором в грудь (MB 4.11)','Спина','', 'https://res.cloudinary.com/dzhbor5oj/image/upload/v1764368669/gymapp/exercises/boxnotoxprjkytk3m0zp.jpg','', 'Machine', 0, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd42','Тяга штанги к поясу (Barbell Row)','Спина','', 'https://kosarevPG.github.io/GymApp/images/exercises/BB_LOW.gif','', 'Barbell', 20, 1),
  ('6d50c565-e5f6-4895-bdf5-a2562ba68dd47','Французский жим, гантели (Скамья 0°)','Трицепс','', 'https://kosarevPG.github.io/GymApp-frontend/img/photo_2025-11-24_15-45-04.jpg','', 'Dumbbell', 0, 2),
  ('68cc15c3-72a3-42e2-aade-0a0b369200f5','Отжимания от грифа','Грудь','', '','', 'barbell', 0, 1),
  ('145a99a9-bb3c-427a-b4cc-20745a1c0262','Отжимания от грифа','Грудь','', '','', 'Bodyweight', 0, 1)
),
mapped AS (
  SELECT
    source_id,
    CASE
      WHEN source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN source_id::uuid
      ELSE gen_random_uuid()
    END AS id,
    trim(CASE WHEN position('/' in name_raw) > 0 THEN split_part(name_raw, '/', 1) ELSE name_raw END) AS name_ru_raw,
    trim(CASE WHEN position('/' in name_raw) > 0 THEN split_part(name_raw, '/', 2) ELSE '' END) AS name_en,
    NULLIF(trim(description_raw), '') AS description,
    ARRAY_REMOVE(ARRAY[NULLIF(trim(image_url), ''), NULLIF(trim(image_url2), '')], NULL) AS media_urls,
    CASE muscle_group_ru
      WHEN 'Грудь' THEN 'chest'
      WHEN 'Спина' THEN 'back'
      WHEN 'Ноги' THEN 'legs'
      WHEN 'Плечи' THEN 'shoulders'
      WHEN 'Трицепс' THEN 'triceps'
      WHEN 'Бицепс' THEN 'biceps'
      WHEN 'Пресс' THEN 'abs'
      WHEN 'Кардио' THEN 'cardio'
      ELSE 'back'
    END AS category,
    CASE muscle_group_ru
      WHEN 'Грудь' THEN 'CHEST'::body_part_enum
      WHEN 'Спина' THEN 'BACK'::body_part_enum
      WHEN 'Ноги' THEN 'LEGS'::body_part_enum
      WHEN 'Плечи' THEN 'SHOULDERS'::body_part_enum
      WHEN 'Трицепс' THEN 'TRICEPS'::body_part_enum
      WHEN 'Бицепс' THEN 'BICEPS'::body_part_enum
      WHEN 'Пресс' THEN 'ABS'::body_part_enum
      WHEN 'Кардио' THEN 'CARDIO'::body_part_enum
      ELSE 'OTHER'::body_part_enum
    END AS body_part,
    CASE lower(trim(weight_type_raw))
      WHEN 'barbell' THEN 'barbell'
      WHEN 'dumbbell' THEN 'dumbbell'
      WHEN 'machine' THEN 'machine'
      WHEN 'bodyweight' THEN 'bodyweight'
      WHEN 'plate_loaded' THEN 'machine'
      WHEN 'assisted' THEN 'bodyweight'
      ELSE 'standard'
    END AS weight_type,
    CASE
      WHEN lower(trim(weight_type_raw)) = 'assisted' THEN 'ASSISTED'::bodyweight_type_enum
      WHEN lower(trim(weight_type_raw)) = 'bodyweight' THEN 'NONE'::bodyweight_type_enum
      ELSE 'NONE'::bodyweight_type_enum
    END AS bodyweight_type,
    CASE
      WHEN lower(trim(weight_type_raw)) = 'barbell' THEN 'BARBELL'
      WHEN lower(trim(weight_type_raw)) = 'dumbbell' THEN 'DUMBBELL'
      WHEN lower(trim(weight_type_raw)) = 'bodyweight' THEN 'BODYWEIGHT'
      WHEN lower(trim(weight_type_raw)) = 'assisted' THEN 'BODYWEIGHT'
      ELSE 'MACHINE'
    END AS equipment_code,
    COALESCE(base_wt, 0)::numeric AS base_weight,
    COALESCE(multiplier, 1) AS multiplier
  FROM raw_data
),
dedup AS (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY category, name_ru_raw ORDER BY source_id) AS dup_n
  FROM mapped
),
prepared AS (
  SELECT
    source_id,
    id,
    CASE WHEN dup_n = 1 THEN name_ru_raw ELSE name_ru_raw || ' [' || source_id || ']' END AS name_ru,
    name_en,
    description,
    media_urls,
    category,
    body_part,
    (SELECT id FROM equipment e WHERE e.code = dedup.equipment_code LIMIT 1) AS equipment_id,
    'WEIGHT_REPS'::input_mode_enum AS input_mode,
    bodyweight_type,
    false AS is_unilateral,
    (multiplier = 2) AS simultaneous,
    NULL::numeric AS weight_step,
    120 AS default_rest_seconds,
    true AS is_compound,
    false AS hidden_from_stats,
    weight_type,
    base_weight,
    NULL::numeric AS target_weight_kg
  FROM dedup
)
INSERT INTO exercises (
  id,
  external_id,
  name_ru,
  name_en,
  description,
  media_urls,
  body_part,
  equipment_id,
  input_mode,
  bodyweight_type,
  is_unilateral,
  simultaneous,
  weight_step,
  default_rest_seconds,
  is_compound,
  hidden_from_stats,
  category,
  weight_type,
  base_weight,
  target_weight_kg
)
SELECT
  p.id,
  p.source_id,
  p.name_ru,
  p.name_en,
  p.description,
  p.media_urls,
  p.body_part,
  p.equipment_id,
  p.input_mode,
  p.bodyweight_type,
  p.is_unilateral,
  p.simultaneous,
  p.weight_step,
  p.default_rest_seconds,
  p.is_compound,
  p.hidden_from_stats,
  p.category,
  p.weight_type,
  p.base_weight,
  p.target_weight_kg
FROM prepared p
ON CONFLICT (external_id) DO UPDATE
SET
  name_ru = EXCLUDED.name_ru,
  name_en = EXCLUDED.name_en,
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
  category = EXCLUDED.category,
  weight_type = EXCLUDED.weight_type,
  base_weight = EXCLUDED.base_weight,
  target_weight_kg = EXCLUDED.target_weight_kg,
  updated_at = now();

-- Если после миграции фронт продолжит ругаться на кэш схемы:
-- NOTIFY pgrst, 'reload schema';
