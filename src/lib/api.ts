import { supabase } from './supabase';
import type { BodyPart, BodyweightType, Equipment, Exercise, ExerciseWeightType, InputMode, SetSide } from '../types';

const EXERCISES_TABLE = 'exercises';
const EQUIPMENT_TABLE = 'equipment';
const BIOMETRICS_TABLE = 'biometrics';
const TRAINING_LOGS_TABLE = import.meta.env.VITE_TRAINING_LOGS_TABLE || 'training_logs';
const WORKOUT_SESSIONS_TABLE = 'workout_sessions';

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
    calves: 'OTHER',
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

export interface ExerciseHistoryRow {
  id: string;
  createdAt: string;
  weight: number;
  reps: number;
  rpe?: number;
  restSeconds?: number;
  oneRm?: number;
  volume?: number;
  effectiveLoad?: number;
}

export interface LastExerciseSnapshot {
  createdAt: string;
  weight: number;
  reps: number;
}

export interface TrainingLogRaw {
  id: string;
  ts: string;
  session_id: string;
  exercise_id: string;
  set_no: number;
  reps: number;
  input_wt: number;
  side: SetSide;
  rpe: number;
  rest_s: number;
  body_wt_snapshot: number | null;
  effective_load: number | null;
  side_mult: number | null;
  set_volume: number | null;
}

export interface SaveTrainingLogRow {
  exercise_id: string;
  weight: number;
  reps: number;
  set_group_id: string;
  order_index: number;
  input_wt?: number;
  side?: SetSide;
  body_wt_snapshot?: number | null;
  side_mult?: number;
  set_volume?: number;
  rpe?: number;
  rest_seconds?: number;
  superset_exercise_id?: string | null;
  one_rm?: number;
  volume?: number;
  effective_load?: number;
  completed_at?: string;
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

export async function fetchAllExercises(): Promise<Exercise[]> {
  const v2 = await supabase
    .from(EXERCISES_TABLE)
    .select(V2_EXERCISE_SELECT)
    .order('name_ru');

  if (v2.error) {
    const legacy = await supabase
      .from(EXERCISES_TABLE)
      .select(LEGACY_EXERCISE_SELECT)
      .order('name_ru');
    if (legacy.error) {
      console.error('fetchAllExercises error:', legacy.error);
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

/** Быстрый поиск упражнений по названию (для суперсета). */
export async function searchExercises(query: string, limit = 20): Promise<Exercise[]> {
  const q = query.trim();
  if (!q) return [];

  const escaped = q.replace(/[%_]/g, '\\$&');
  const v2 = await supabase
    .from(EXERCISES_TABLE)
    .select(V2_EXERCISE_SELECT)
    .or(`name_ru.ilike.%${escaped}%,name_en.ilike.%${escaped}%`)
    .order('name_ru')
    .limit(limit);

  if (v2.error) {
    const legacy = await supabase
      .from(EXERCISES_TABLE)
      .select(LEGACY_EXERCISE_SELECT)
      .or(`name_ru.ilike.%${escaped}%,name_en.ilike.%${escaped}%`)
      .order('name_ru')
      .limit(limit);
    if (legacy.error) {
      console.error('searchExercises error:', legacy.error);
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

/** Последний вес из биометрии, если таблица есть. */
export async function fetchLatestBodyWeight(): Promise<number | null> {
  const { data, error } = await supabase
    .from(BIOMETRICS_TABLE)
    .select('weight_kg, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data.weight_kg != null ? Number(data.weight_kg) : null;
}

export async function fetchTrainingLogsWindow(days = 84): Promise<TrainingLogRaw[]> {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const v2Select = [
    'id',
    'completed_at',
    'created_at',
    'set_group_id',
    'exercise_id',
    'order_index',
    'reps',
    'weight',
    'input_wt',
    'side',
    'rpe',
    'rest_seconds',
    'body_wt_snapshot',
    'effective_load',
    'side_mult',
    'set_volume',
  ].join(', ');

  const v2 = await supabase
    .from(TRAINING_LOGS_TABLE)
    .select(v2Select)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (v2.error) {
    const legacy = await supabase
      .from(TRAINING_LOGS_TABLE)
      .select('id, created_at, set_group_id, exercise_id, order_index, reps, weight')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (legacy.error) {
      console.error('fetchTrainingLogsWindow error:', legacy.error);
      return [];
    }
    return (legacy.data ?? []).map((r) => ({
      id: String(r.id),
      ts: String(r.created_at),
      session_id: String(r.set_group_id),
      exercise_id: String(r.exercise_id),
      set_no: Number(r.order_index ?? 0),
      reps: Number(r.reps ?? 0),
      input_wt: Number(r.weight ?? 0),
      side: 'both',
      rpe: 0,
      rest_s: 0,
      body_wt_snapshot: null,
      effective_load: Number(r.weight ?? 0),
      side_mult: 1,
      set_volume: Number(r.weight ?? 0) * Number(r.reps ?? 0),
    }));
  }

  return (v2.data ?? []).map((r) => ({
    // Supabase side может хранить BOTH/LEFT/RIGHT; в UI держим lower-case
    id: String(r.id),
    ts: String(r.completed_at ?? r.created_at),
    session_id: String(r.set_group_id),
    exercise_id: String(r.exercise_id),
    set_no: Number(r.order_index ?? 0),
    reps: Number(r.reps ?? 0),
    input_wt: Number(r.input_wt ?? r.weight ?? 0),
    side: ((): SetSide => {
      const side = String(r.side ?? 'both').toLowerCase();
      if (side === 'left') return 'left';
      if (side === 'right') return 'right';
      return 'both';
    })(),
    rpe: Number(r.rpe ?? 0),
    rest_s: Number(r.rest_seconds ?? 0),
    body_wt_snapshot: r.body_wt_snapshot != null ? Number(r.body_wt_snapshot) : null,
    effective_load: r.effective_load != null ? Number(r.effective_load) : null,
    side_mult: r.side_mult != null ? Number(r.side_mult) : null,
    set_volume: r.set_volume != null ? Number(r.set_volume) : null,
  }));
}

export async function fetchExerciseHistory(exerciseId: string, limit = 30): Promise<ExerciseHistoryRow[]> {
  const v2Select = 'id, created_at, weight, reps, rpe, rest_seconds, one_rm, volume, effective_load';
  const legacySelect = 'id, created_at, weight, reps';

  const v2 = await supabase
    .from(TRAINING_LOGS_TABLE)
    .select(v2Select)
    .eq('exercise_id', exerciseId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (v2.error) {
    const legacy = await supabase
      .from(TRAINING_LOGS_TABLE)
      .select(legacySelect)
      .eq('exercise_id', exerciseId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (legacy.error) {
      console.error('fetchExerciseHistory error:', legacy.error);
      return [];
    }
    return (legacy.data ?? []).map((row) => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      weight: Number(row.weight ?? 0),
      reps: Number(row.reps ?? 0),
    }));
  }

  return (v2.data ?? []).map((row) => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    weight: Number(row.weight ?? 0),
    reps: Number(row.reps ?? 0),
    rpe: row.rpe != null ? Number(row.rpe) : undefined,
    restSeconds: row.rest_seconds != null ? Number(row.rest_seconds) : undefined,
    oneRm: row.one_rm != null ? Number(row.one_rm) : undefined,
    volume: row.volume != null ? Number(row.volume) : undefined,
    effectiveLoad: row.effective_load != null ? Number(row.effective_load) : undefined,
  }));
}

/** «Last» — последний подход последней по дате сессии (по completed_at и order_index). */
export async function fetchLastExerciseSnapshot(exerciseId: string): Promise<LastExerciseSnapshot | null> {
  const select = 'set_group_id, order_index, completed_at, created_at, weight, reps';
  const { data, error } = await supabase
    .from(TRAINING_LOGS_TABLE)
    .select(select)
    .eq('exercise_id', exerciseId)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(100);

  if (error || !data?.length) return null;

  const rows = data as Array<{ set_group_id: string; order_index: number; completed_at: string | null; created_at: string; weight: number; reps: number }>;
  const lastGroupId = rows[0].set_group_id;
  const sessionRows = rows.filter((r) => r.set_group_id === lastGroupId);
  const lastSet = sessionRows.reduce((best, r) => ((r.order_index ?? 0) > (best.order_index ?? 0) ? r : best), sessionRows[0]);
  const ts = lastSet.completed_at || lastSet.created_at;
  return {
    createdAt: String(ts),
    weight: Number(lastSet.weight ?? 0),
    reps: Number(lastSet.reps ?? 0),
  };
}

/** Один подход из последней сессии (для подстановки при открытии упражнения). */
export interface LastSessionSetRow {
  inputWeight: string;
  reps: string;
  restMin: string;
}

/**
 * Подтягивает последнюю по дате сессию подходов по упражнению.
 * Вес для подстановки — эффективный (weight в кг), чтобы в интерфейсе не показывать 0.1 вместо 40.
 */
export async function fetchLastExerciseSessionSets(exerciseId: string): Promise<LastSessionSetRow[]> {
  const select = 'set_group_id, order_index, weight, reps, rest_seconds, completed_at';
  const { data, error } = await supabase
    .from(TRAINING_LOGS_TABLE)
    .select(select)
    .eq('exercise_id', exerciseId)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(50);

  if (error || !data?.length) return [];

  const rows = data as Array<{
    set_group_id: string;
    order_index: number;
    weight: number;
    reps: number;
    rest_seconds?: number | null;
    completed_at: string | null;
  }>;

  const lastGroupId = rows[0].set_group_id;
  const sessionRows = rows.filter((r) => r.set_group_id === lastGroupId);
  sessionRows.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  return sessionRows.map((r) => ({
    inputWeight: String(r.weight != null && r.weight > 0 ? r.weight : 0),
    reps: String(r.reps ?? 0),
    restMin: r.rest_seconds != null ? String(Math.round(r.rest_seconds / 60)) : '2',
  }));
}

export async function fetchPersonalBestWeight(exerciseId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from(TRAINING_LOGS_TABLE)
    .select('weight')
    .eq('exercise_id', exerciseId)
    .order('weight', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.weight != null ? Number(data.weight) : null;
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

export interface UpdateExerciseInput extends Partial<AddExerciseInput> {
  nameRu?: string;
  nameEn?: string;
  category?: string;
  weightType?: ExerciseWeightType;
  baseWeight?: number;
  targetWeightKg?: number;
}

/** Обновить упражнение по id. */
export async function updateExercise(
  id: string,
  exercise: UpdateExerciseInput
): Promise<{ data: Exercise | null; error: { message: string } | null }> {
  const legacyPayload: Record<string, unknown> = {
    category: exercise.category,
    name_ru: exercise.nameRu,
    name_en: exercise.nameEn,
    weight_type: exercise.weightType ?? 'barbell',
    base_weight: exercise.baseWeight,
    target_weight_kg: exercise.targetWeightKg,
  };
  const v2Payload: Record<string, unknown> = {
    ...legacyPayload,
    description: exercise.description,
    media_urls: exercise.mediaUrls,
    body_part: exercise.bodyPart,
    equipment_id: exercise.equipmentId ?? null,
    input_mode: exercise.inputMode,
    bodyweight_type: exercise.bodyweightType,
    is_unilateral: exercise.isUnilateral,
    simultaneous: exercise.simultaneous,
    weight_step: exercise.weightStep,
    default_rest_seconds: exercise.defaultRestSeconds,
    is_compound: exercise.isCompound,
    hidden_from_stats: exercise.hiddenFromStats,
  };
  Object.keys(v2Payload).forEach((k) => {
    if ((v2Payload as any)[k] === undefined) delete (v2Payload as any)[k];
  });

  const v2 = await supabase
    .from(EXERCISES_TABLE)
    .update(v2Payload)
    .eq('id', id)
    .select(V2_EXERCISE_SELECT)
    .single();

  if (!v2.error) {
    return { data: mapExerciseRow(v2.data), error: null };
  }

  const legacy = await supabase
    .from(EXERCISES_TABLE)
    .update(legacyPayload)
    .eq('id', id)
    .select(LEGACY_EXERCISE_SELECT)
    .single();

  if (legacy.error) {
    return { data: null, error: { message: legacy.error.message || v2.error.message } };
  }
  return { data: mapExerciseRow(legacy.data), error: null };
}

/** Удалить упражнение по id. */
export async function deleteExercise(id: string): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from(EXERCISES_TABLE).delete().eq('id', id);
  if (error) return { error: { message: error.message } };
  return { error: null };
}

/** Сохранить подходы в Supabase. Сначала пробуем расширенную v2-схему, затем legacy fallback. */
export async function saveTrainingLogs(
  rows: SaveTrainingLogRow[]
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

  const v2Payload = rows.map((r) => ({
    exercise_id: String(r.exercise_id).trim(),
    weight: Number(r.weight),
    reps: Math.floor(Number(r.reps)) || 0,
    set_group_id: String(r.set_group_id),
    order_index: Math.floor(Number(r.order_index)) || 0,
    input_wt: r.input_wt != null ? Number(r.input_wt) : Number(r.weight),
    side: (r.side ?? 'both').toUpperCase(),
    body_wt_snapshot: r.body_wt_snapshot != null ? Number(r.body_wt_snapshot) : null,
    side_mult: r.side_mult != null ? Number(r.side_mult) : null,
    set_volume: r.set_volume != null ? Number(r.set_volume) : (r.volume != null ? Number(r.volume) : null),
    rpe: r.rpe != null ? Number(r.rpe) : null,
    rest_seconds: r.rest_seconds != null ? Math.floor(Number(r.rest_seconds)) : null,
    superset_exercise_id: r.superset_exercise_id && isUuid(r.superset_exercise_id) ? r.superset_exercise_id : null,
    one_rm: r.one_rm != null ? Number(r.one_rm) : null,
    volume: r.volume != null ? Number(r.volume) : null,
    effective_load: r.effective_load != null ? Number(r.effective_load) : null,
    completed_at: r.completed_at ?? new Date().toISOString(),
  }));

  const v2 = await supabase.from(TRAINING_LOGS_TABLE).insert(v2Payload);
  if (!v2.error) {
    return { error: null };
  }

  console.warn('saveTrainingLogs v2 failed, fallback to legacy schema:', v2.error.message);
  const legacyPayload = rows.map((r) => ({
    exercise_id: String(r.exercise_id).trim(),
    weight: Number(r.weight),
    reps: Math.floor(Number(r.reps)) || 0,
    set_group_id: String(r.set_group_id),
    order_index: Math.floor(Number(r.order_index)) || 0,
  }));
  const legacy = await supabase.from(TRAINING_LOGS_TABLE).insert(legacyPayload);
  if (!legacy.error) {
    return { error: null };
  }

  const errMsg = [
    legacy.error.message || v2.error.message,
    legacy.error.code && `[${legacy.error.code}]`,
    legacy.error.details && String(legacy.error.details),
  ]
    .filter(Boolean)
    .join(' ');

  return {
    error: {
      message: errMsg || 'Ошибка сохранения',
      code: legacy.error.code || v2.error.code,
      details: legacy.error.details != null ? String(legacy.error.details) : undefined,
    },
  };
}

// --- Workout sessions (сессионный подход: одна тренировка = одна запись) ---

export interface WorkoutSessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  name: string | null;
  status: string;
}

export async function createWorkoutSession(): Promise<{ id: string } | { error: { message: string } }> {
  const { data, error } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .insert({ status: 'active' })
    .select('id')
    .single();
  if (error) return { error: { message: error.message } };
  return { id: String(data.id) };
}

export async function completeWorkoutSession(
  id: string
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .update({ ended_at: new Date().toISOString(), status: 'completed' })
    .eq('id', id);
  if (error) return { error: { message: error.message } };
  return { error: null };
}

export async function getActiveWorkoutSession(): Promise<WorkoutSessionRow | null> {
  const { data, error } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .select('id, started_at, ended_at, name, status')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    started_at: String(data.started_at),
    ended_at: data.ended_at != null ? String(data.ended_at) : null,
    name: data.name != null ? String(data.name) : null,
    status: String(data.status),
  };
}

export interface WorkoutSummaryData {
  durationSec: number;
  tonnageKg: number;
  setsCount: number;
  avgRpe: number | null;
}

export async function getWorkoutSummary(sessionId: string): Promise<WorkoutSummaryData | null> {
  const [sessionRes, logsRes] = await Promise.all([
    supabase.from(WORKOUT_SESSIONS_TABLE).select('started_at, ended_at').eq('id', sessionId).single(),
    supabase
      .from(TRAINING_LOGS_TABLE)
      .select('set_volume, rpe, completed_at, created_at')
      .eq('set_group_id', sessionId),
  ]);
  if (sessionRes.error || !sessionRes.data) return null;
  const started = new Date(sessionRes.data.started_at).getTime();
  const ended = sessionRes.data.ended_at
    ? new Date(sessionRes.data.ended_at).getTime()
    : Date.now();
  const durationSec = Math.max(0, Math.floor((ended - started) / 1000));

  const rows = (logsRes.data ?? []) as Array<{
    set_volume?: number | null;
    rpe?: number | null;
    completed_at?: string | null;
    created_at?: string;
  }>;
  let tonnageKg = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  for (const r of rows) {
    const vol = r.set_volume != null ? Number(r.set_volume) : 0;
    tonnageKg += vol;
    if (r.rpe != null && Number(r.rpe) > 0) {
      rpeSum += Number(r.rpe);
      rpeCount += 1;
    }
  }
  const avgRpe = rpeCount > 0 ? rpeSum / rpeCount : null;
  return {
    durationSec,
    tonnageKg: Math.round(tonnageKg * 10) / 10,
    setsCount: rows.length,
    avgRpe: avgRpe != null ? Math.round(avgRpe * 10) / 10 : null,
  };
}
