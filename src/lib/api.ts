import { supabase } from './supabase';
import type { BodyPart, BodyweightType, Equipment, Exercise, ExerciseWeightType, InputMode } from '../types';

const EXERCISES_TABLE = 'exercises';
const EQUIPMENT_TABLE = 'equipment';
const TRAINING_LOGS_TABLE = import.meta.env.VITE_TRAINING_LOGS_TABLE || 'training_logs';

const LEGACY_EXERCISE_SELECT = 'id, category, name_ru, name_en, weight_type, base_weight, target_weight_kg';
const V2_EXERCISE_SELECT = [
  'id',
  'category',
  'name_ru',
  'name_en',
  'description',
  'media_urls',
  'body_part',
  'equipment_id',
  'input_mode',
  'bodyweight_type',
  'is_unilateral',
  'simultaneous',
  'weight_step',
  'default_rest_seconds',
  'is_compound',
  'hidden_from_stats',
  'weight_type',
  'base_weight',
  'target_weight_kg',
].join(', ');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_REGEX.test(String(s).trim());
}

function mapCategoryToBodyPart(category: string): BodyPart {
  const map: Record<string, BodyPart> = {
    chest: 'CHEST',
    back: 'BACK',
    legs: 'LEGS',
    shoulders: 'SHOULDERS',
    triceps: 'TRICEPS',
    biceps: 'BICEPS',
    abs: 'ABS',
    cardio: 'CARDIO',
  };
  return map[category] ?? 'OTHER';
}

function mapExerciseRow(row: any): Exercise {
  return {
    id: String(row.id),
    category: row.category,
    nameRu: row.name_ru ?? '',
    nameEn: row.name_en ?? '',
    description: row.description ?? undefined,
    mediaUrls: Array.isArray(row.media_urls) ? row.media_urls : undefined,
    bodyPart: row.body_part ?? undefined,
    equipmentId: row.equipment_id ?? undefined,
    inputMode: row.input_mode ?? undefined,
    bodyweightType: row.bodyweight_type ?? undefined,
    isUnilateral: row.is_unilateral ?? undefined,
    simultaneous: row.simultaneous ?? undefined,
    weightStep: row.weight_step != null ? Number(row.weight_step) : undefined,
    defaultRestSeconds: row.default_rest_seconds != null ? Number(row.default_rest_seconds) : undefined,
    isCompound: row.is_compound ?? undefined,
    hiddenFromStats: row.hidden_from_stats ?? undefined,
    weightType: row.weight_type ?? 'barbell',
    baseWeight: row.base_weight != null ? Number(row.base_weight) : undefined,
    targetWeightKg: row.target_weight_kg != null ? Number(row.target_weight_kg) : undefined,
  };
}

/** Загрузить упражнения по категории из Supabase (старые строковые id игнорируются). */
export async function fetchExercises(categorySlug: string): Promise<Exercise[]> {
  const v2 = await supabase
    .from(EXERCISES_TABLE)
    .select(V2_EXERCISE_SELECT)
    .eq('category', categorySlug)
    .order('name_ru');

  if (v2.error) {
    console.warn('fetchExercises v2 failed, fallback to legacy schema:', v2.error.message);
    const legacy = await supabase
      .from(EXERCISES_TABLE)
      .select(LEGACY_EXERCISE_SELECT)
      .eq('category', categorySlug)
      .order('name_ru');
    if (legacy.error) {
      console.error('fetchExercises legacy error:', legacy.error);
      return [];
    }
    return (legacy.data ?? [])
      .filter((row) => isUuid(String(row.id)))
      .map(mapExerciseRow);
  }

  return (v2.data ?? [])
    .filter((row) => isUuid(String(row.id)))
    .map(mapExerciseRow);
}

/** Справочник оборудования (если нет таблицы, вернется пустой массив) */
export async function fetchEquipmentOptions(): Promise<Equipment[]> {
  const { data, error } = await supabase
    .from(EQUIPMENT_TABLE)
    .select('id, code, name_ru, name_en, default_weight_step')
    .order('name_ru');

  if (error) {
    console.warn('fetchEquipmentOptions error:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    code: String(row.code ?? ''),
    nameRu: String(row.name_ru ?? ''),
    nameEn: String(row.name_en ?? ''),
    defaultWeightStep: row.default_weight_step != null ? Number(row.default_weight_step) : undefined,
  }));
}

export interface AddExerciseInput {
  category: string;
  nameRu: string;
  nameEn?: string;
  description?: string;
  mediaUrls?: string[];
  bodyPart?: BodyPart;
  equipmentId?: string | null;
  inputMode?: InputMode;
  bodyweightType?: BodyweightType;
  isUnilateral?: boolean;
  simultaneous?: boolean;
  weightStep?: number;
  defaultRestSeconds?: number;
  isCompound?: boolean;
  hiddenFromStats?: boolean;
  weightType?: ExerciseWeightType;
  baseWeight?: number;
  targetWeightKg?: number;
}

/** Добавить своё упражнение (сначала пробуем v2-схему, затем legacy fallback). */
export async function addExercise(exercise: AddExerciseInput): Promise<{ data: Exercise | null; error: { message: string } | null }> {
  const legacyPayload = {
    category: exercise.category,
    name_ru: exercise.nameRu,
    name_en: exercise.nameEn ?? '',
    weight_type: exercise.weightType ?? 'barbell',
    base_weight: exercise.baseWeight ?? 20,
    target_weight_kg: exercise.targetWeightKg ?? null,
  };

  const v2Payload = {
    ...legacyPayload,
    description: exercise.description ?? null,
    media_urls: exercise.mediaUrls ?? [],
    body_part: exercise.bodyPart ?? mapCategoryToBodyPart(exercise.category),
    equipment_id: exercise.equipmentId ?? null,
    input_mode: exercise.inputMode ?? 'WEIGHT_REPS',
    bodyweight_type: exercise.bodyweightType ?? 'NONE',
    is_unilateral: exercise.isUnilateral ?? false,
    simultaneous: exercise.simultaneous ?? false,
    weight_step: exercise.weightStep ?? null,
    default_rest_seconds: exercise.defaultRestSeconds ?? 120,
    is_compound: exercise.isCompound ?? true,
    hidden_from_stats: exercise.hiddenFromStats ?? false,
  };

  const v2 = await supabase
    .from(EXERCISES_TABLE)
    .insert(v2Payload)
    .select(V2_EXERCISE_SELECT)
    .single();

  if (!v2.error) {
    return { data: mapExerciseRow(v2.data), error: null };
  }

  console.warn('addExercise v2 failed, fallback to legacy schema:', v2.error.message);
  const legacy = await supabase
    .from(EXERCISES_TABLE)
    .insert(legacyPayload)
    .select(LEGACY_EXERCISE_SELECT)
    .single();

  if (legacy.error) {
    console.error('addExercise legacy error:', legacy.error);
    return { data: null, error: { message: legacy.error.message || v2.error.message } };
  }

  return { data: mapExerciseRow(legacy.data), error: null };
}

/** Сохранить подходы в Supabase. exercise_id должен быть UUID из таблицы exercises. */
export async function saveTrainingLogs(
  rows: { exercise_id: string; weight: number; reps: number; set_group_id: string; order_index: number }[]
): Promise<{ error: { message: string; code?: string; details?: string } | null }> {
  if (rows.length === 0) {
    return { error: null };
  }

  const badId = rows.find((r) => !isUuid(r.exercise_id));
  if (badId) {
    return {
      error: {
        message: `Упражнение с id "${badId.exercise_id}" не из базы. Выберите упражнение из списка (загруженного из Supabase) или добавьте новое кнопкой «Добавить своё упражнение».`,
      },
    };
  }

  // Приводим типы под схему: exercise_id — строка UUID, reps и order_index — целые
  const payload = rows.map((r) => ({
    exercise_id: String(r.exercise_id).trim(),
    weight: Number(r.weight),
    reps: Math.floor(Number(r.reps)) || 0,
    set_group_id: String(r.set_group_id),
    order_index: Math.floor(Number(r.order_index)) || 0,
  }));

  console.log('saveTrainingLogs payload:', payload);

  const { error } = await supabase.from(TRAINING_LOGS_TABLE).insert(payload);

  if (error) {
    const errMsg = [
      error.message,
      error.code && `[${error.code}]`,
      error.details && String(error.details),
    ]
      .filter(Boolean)
      .join(' ');
    console.error('saveTrainingLogs error:', error);
    return {
      error: {
        message: errMsg || 'Ошибка сохранения',
        code: error.code,
        details: error.details != null ? String(error.details) : undefined,
      },
    };
  }
  return { error: null };
}
