import { supabase } from './supabase';
import type { Exercise } from '../types';

const EXERCISES_TABLE = 'exercises';
const TRAINING_LOGS_TABLE = import.meta.env.VITE_TRAINING_LOGS_TABLE || 'training_logs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_REGEX.test(String(s).trim());
}

/** Загрузить упражнения по категории из Supabase (только с UUID id — старые строковые id игнорируются) */
export async function fetchExercises(categorySlug: string): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from(EXERCISES_TABLE)
    .select('id, category, name_ru, name_en, weight_type, base_weight, target_weight_kg')
    .eq('category', categorySlug)
    .order('name_ru');

  if (error) {
    console.error('fetchExercises error:', error);
    return [];
  }

  return (data ?? [])
    .filter((row) => isUuid(String(row.id)))
    .map((row) => ({
    id: row.id,
    category: row.category,
    nameRu: row.name_ru ?? '',
    nameEn: row.name_en ?? '',
    weightType: row.weight_type ?? 'barbell',
    baseWeight: row.base_weight != null ? Number(row.base_weight) : undefined,
    targetWeightKg: row.target_weight_kg != null ? Number(row.target_weight_kg) : undefined,
  }));
}

/** Добавить своё упражнение */
export async function addExercise(exercise: {
  category: string;
  nameRu: string;
  nameEn?: string;
  weightType?: string;
  baseWeight?: number;
  targetWeightKg?: number;
}): Promise<{ data: Exercise | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from(EXERCISES_TABLE)
    .insert({
      category: exercise.category,
      name_ru: exercise.nameRu,
      name_en: exercise.nameEn ?? '',
      weight_type: exercise.weightType ?? 'barbell',
      base_weight: exercise.baseWeight ?? 20,
      target_weight_kg: exercise.targetWeightKg ?? null,
    })
    .select('id, category, name_ru, name_en, weight_type, base_weight, target_weight_kg')
    .single();

  if (error) {
    console.error('addExercise error:', error);
    return { data: null, error };
  }

  return {
    data: {
      id: data.id,
      category: data.category,
      nameRu: data.name_ru ?? '',
      nameEn: data.name_en ?? '',
      weightType: data.weight_type ?? 'barbell',
      baseWeight: data.base_weight != null ? Number(data.base_weight) : undefined,
      targetWeightKg: data.target_weight_kg != null ? Number(data.target_weight_kg) : undefined,
    },
    error: null,
  };
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
