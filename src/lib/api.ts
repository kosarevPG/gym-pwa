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
  /** ID тренировки из workout_sessions */
  session_id: string;
  /** Группа подходов (один «Завершить» / суперсет) */
  set_group_id: string;
  exercise_id: string;
  /** Порядок упражнения в тренировке (0, 1, 2, …) */
  exercise_order: number;
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
  /** ID активной тренировки из workout_sessions */
  session_id: string;
  /** ID группы подходов (сет/суперсет), генерируется фронтом */
  set_group_id: string;
  exercise_id: string;
  weight: number;
  reps: number;
  order_index: number;
  /** Номер подхода внутри упражнения/суперсета (для отображения и сортировки) */
  set_no?: number;
  /** Порядок упражнения в тренировке (0, 1, 2, …) */
  exercise_order?: number;
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

/** Сохранить вес тела с привязкой к дате (для effective load и др.). */
export async function saveBodyWeight(weightKg: number, dateYyyyMmDd?: string): Promise<{ error: Error | null }> {
  const createdAt = dateYyyyMmDd
    ? new Date(dateYyyyMmDd + 'T12:00:00.000Z').toISOString()
    : new Date().toISOString();
  const { error } = await supabase.from(BIOMETRICS_TABLE).insert({ weight_kg: weightKg, created_at: createdAt });
  return { error: error ?? null };
}

export async function fetchTrainingLogsWindow(days = 84): Promise<TrainingLogRaw[]> {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const v2Select = [
    'id',
    'completed_at',
    'created_at',
    'session_id',
    'set_group_id',
    'exercise_id',
    'exercise_order',
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

  // #region agent log
  if (typeof fetch !== 'undefined' && !v2.error) {
    const raw = (v2.data ?? []) as Array<{ completed_at?: string; created_at?: string }>;
    const first = raw[0];
    const last = raw[raw.length - 1];
    fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'api.ts:fetchTrainingLogsWindow',
        message: 'v2 logs loaded',
        data: { logsCount: raw.length, firstTs: first?.completed_at ?? first?.created_at, lastTs: last?.completed_at ?? last?.created_at, sinceIso },
        timestamp: Date.now(),
        hypothesisId: 'H1,H5',
      }),
    }).catch(() => {});
  }
  if (typeof fetch !== 'undefined' && v2.error) {
    fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'api.ts:fetchTrainingLogsWindow',
        message: 'v2 error fallback to legacy',
        data: { error: v2.error?.message, sinceIso },
        timestamp: Date.now(),
        hypothesisId: 'H1',
      }),
    }).catch(() => {});
  }
  // #endregion

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
    const legacyOut = (legacy.data ?? []).map((r) => ({
      id: String(r.id),
      ts: String(r.created_at),
      session_id: String((r as { session_id?: string }).session_id ?? r.set_group_id),
      set_group_id: String(r.set_group_id),
      exercise_id: String(r.exercise_id),
      exercise_order: 0,
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
    // #region agent log
    if (typeof fetch !== 'undefined' && legacyOut.length > 0) {
      const first = legacyOut[0];
      const last = legacyOut[legacyOut.length - 1];
      fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'api.ts:fetchTrainingLogsWindow',
          message: 'legacy path',
          data: { logsCount: legacyOut.length, firstTs: first?.ts, lastTs: last?.ts, usedLegacy: true },
          timestamp: Date.now(),
          hypothesisId: 'H1,H5',
        }),
      }).catch(() => {});
    }
    // #endregion
    return legacyOut;
  }

  return (v2.data ?? []).map((r) => ({
    id: String(r.id),
    ts: String(r.completed_at ?? r.created_at),
    session_id: String((r as { session_id?: string }).session_id ?? r.set_group_id),
    set_group_id: String(r.set_group_id),
    exercise_id: String(r.exercise_id),
    exercise_order: Number((r as { exercise_order?: number }).exercise_order ?? 0),
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
    effective_load: (r.effective_load != null ? Number(r.effective_load) : null) ?? (r.weight != null ? Number(r.weight) : null),
    side_mult: r.side_mult != null ? Number(r.side_mult) : null,
    set_volume: r.set_volume != null ? Number(r.set_volume) : null,
  }));
}

export interface FetchExerciseHistoryOptions {
  bodyweightType?: BodyweightType;
  baseWeight?: number;
}

export async function fetchExerciseHistory(
  exerciseId: string,
  limit = 30,
  options?: FetchExerciseHistoryOptions
): Promise<ExerciseHistoryRow[]> {
  const v2Select = 'id, created_at, weight, reps, rpe, rest_seconds, one_rm, volume, effective_load, input_wt, body_wt_snapshot';
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

  const { bodyweightType, baseWeight } = options ?? {};

  return (v2.data ?? []).map((row: any) => {
    const effectiveFromDb = row.effective_load != null ? Number(row.effective_load) : null;
    const inputWt = row.input_wt != null ? Number(row.input_wt) : null;
    const bodyWt = row.body_wt_snapshot != null ? Number(row.body_wt_snapshot) : null;
    const weightCol = row.weight != null ? Number(row.weight) : null;

    let displayWeight: number;
    if (effectiveFromDb != null) {
      displayWeight = effectiveFromDb;
    } else if (bodyweightType === 'ASSISTED' && inputWt != null && inputWt > 0) {
      const bw = bodyWt ?? baseWeight ?? 80;
      displayWeight = Math.max(0, bw - inputWt);
    } else {
      displayWeight = weightCol ?? 0;
    }

    return {
      id: String(row.id),
      createdAt: String(row.created_at),
      weight: displayWeight,
      reps: Number(row.reps ?? 0),
      rpe: row.rpe != null ? Number(row.rpe) : undefined,
      restSeconds: row.rest_seconds != null ? Number(row.rest_seconds) : undefined,
      oneRm: row.one_rm != null ? Number(row.one_rm) : undefined,
      volume: row.volume != null ? Number(row.volume) : undefined,
      effectiveLoad: displayWeight,
    };
  });
}

/** «Last» — последний подход последней по дате сессии. weight = input_wt (то, что вводил пользователь). */
export async function fetchLastExerciseSnapshot(exerciseId: string): Promise<LastExerciseSnapshot | null> {
  const select = 'set_group_id, order_index, completed_at, created_at, input_wt, weight, reps';
  const { data, error } = await supabase
    .from(TRAINING_LOGS_TABLE)
    .select(select)
    .eq('exercise_id', exerciseId)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(100);

  if (error || !data?.length) return null;

  const rows = data as Array<{ set_group_id: string; order_index: number; completed_at: string | null; created_at: string; input_wt?: number | null; weight: number; reps: number }>;
  const lastGroupId = rows[0].set_group_id;
  const sessionRows = rows.filter((r) => r.set_group_id === lastGroupId);
  const lastSet = sessionRows.reduce((best, r) => ((r.order_index ?? 0) > (best.order_index ?? 0) ? r : best), sessionRows[0]);
  const ts = lastSet.completed_at || lastSet.created_at;
  const inputWt = lastSet.input_wt != null && lastSet.input_wt > 0 ? lastSet.input_wt : lastSet.weight ?? 0;
  return {
    createdAt: String(ts),
    weight: Number(inputWt),
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
 * Для подстановки в поля используем input_wt (то, что пользователь вводил руками).
 */
export async function fetchLastExerciseSessionSets(exerciseId: string): Promise<LastSessionSetRow[]> {
  const select = 'set_group_id, order_index, input_wt, weight, reps, rest_seconds, completed_at';
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
    input_wt?: number | null;
    weight: number;
    reps: number;
    rest_seconds?: number | null;
    completed_at: string | null;
  }>;

  const lastGroupId = rows[0].set_group_id;
  const sessionRows = rows.filter((r) => r.set_group_id === lastGroupId);
  sessionRows.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  return sessionRows.map((r) => {
    const wt = r.input_wt != null && r.input_wt > 0 ? r.input_wt : r.weight ?? 0;
    return {
      inputWeight: String(wt),
      reps: String(r.reps ?? 0),
      restMin: r.rest_seconds != null ? String(Math.round(r.rest_seconds / 60)) : '2',
    };
  });
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
    session_id: String(r.session_id),
    set_group_id: String(r.set_group_id),
    exercise_id: String(r.exercise_id).trim(),
    weight: Number(r.weight),
    reps: Math.floor(Number(r.reps)) || 0,
    order_index: Math.floor(Number(r.order_index)) || 0,
    set_no: r.set_no != null ? Math.floor(Number(r.set_no)) : Math.floor(Number(r.order_index)) || 0,
    exercise_order: r.exercise_order != null ? Math.floor(Number(r.exercise_order)) : 0,
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
  // #region agent log
  if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:saveTrainingLogs',message:v2.error?'insert failed':'insert ok',data:{rowsCount:rows.length,firstSessionId:rows[0]?.session_id,firstSetNo:rows[0]?.set_no,error:v2.error?.message},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
  if (!v2.error) {
    return { error: null };
  }

  console.warn('saveTrainingLogs v2 failed, fallback to legacy schema:', v2.error.message);
  const legacyPayload = rows.map((r) => ({
    session_id: String(r.session_id),
    set_group_id: String(r.set_group_id),
    exercise_id: String(r.exercise_id).trim(),
    weight: Number(r.weight),
    reps: Math.floor(Number(r.reps)) || 0,
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

// --- Редактирование прошедших тренировок (update/delete logs) ---

const V2_LOG_SELECT = [
  'id',
  'completed_at',
  'created_at',
  'session_id',
  'set_group_id',
  'exercise_id',
  'exercise_order',
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

function mapRowToTrainingLogRaw(r: any): TrainingLogRaw {
  return {
    id: String(r.id),
    ts: String(r.completed_at ?? r.created_at),
    session_id: String(r.session_id ?? r.set_group_id),
    set_group_id: String(r.set_group_id),
    exercise_id: String(r.exercise_id),
    exercise_order: Number(r.exercise_order ?? 0),
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
    effective_load: (r.effective_load != null ? Number(r.effective_load) : null) ?? (r.weight != null ? Number(r.weight) : null),
    side_mult: r.side_mult != null ? Number(r.side_mult) : null,
    set_volume: r.set_volume != null ? Number(r.set_volume) : null,
  };
}

/** Загрузить все логи одной сессии для экрана редактирования. */
export async function fetchLogsBySessionId(sessionId: string): Promise<TrainingLogRaw[]> {
  const { data, error } = await supabase
    .from(TRAINING_LOGS_TABLE)
    .select(V2_LOG_SELECT)
    .eq('session_id', sessionId)
    .order('exercise_order')
    .order('order_index');
  // #region agent log
  if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:fetchLogsBySessionId',message:'session logs loaded',data:{sessionId,rowsCount:(data??[]).length,error:error?.message},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  if (error) {
    console.error('fetchLogsBySessionId error:', error);
    return [];
  }
  return (data ?? []).map(mapRowToTrainingLogRaw);
}

export interface UpdateTrainingLogPayload {
  input_wt?: number;
  weight?: number;
  reps?: number;
  rest_seconds?: number;
  rpe?: number | null;
  set_no?: number;
  order_index?: number;
  exercise_order?: number;
  set_group_id?: string;
  exercise_id?: string;
  set_volume?: number | null;
  effective_load?: number | null;
}

/** Обновить одну запись training_logs. */
export async function updateTrainingLog(
  id: string,
  payload: UpdateTrainingLogPayload
): Promise<{ error: { message: string } | null }> {
  const body: Record<string, unknown> = {};
  if (payload.input_wt !== undefined) body.input_wt = payload.input_wt;
  if (payload.weight !== undefined) body.weight = payload.weight;
  if (payload.reps !== undefined) body.reps = Math.floor(payload.reps);
  if (payload.rest_seconds !== undefined) body.rest_seconds = Math.floor(payload.rest_seconds);
  if (payload.rpe !== undefined) body.rpe = payload.rpe;
  if (payload.set_no !== undefined) {
    body.set_no = payload.set_no;
    body.order_index = payload.set_no;
  }
  if (payload.order_index !== undefined) body.order_index = Math.floor(payload.order_index);
  if (payload.exercise_order !== undefined) body.exercise_order = Math.floor(payload.exercise_order);
  if (payload.set_group_id !== undefined) body.set_group_id = payload.set_group_id;
  if (payload.exercise_id !== undefined) body.exercise_id = payload.exercise_id;
  if (payload.set_volume !== undefined) body.set_volume = payload.set_volume;
  if (payload.effective_load !== undefined) body.effective_load = payload.effective_load;
  if (Object.keys(body).length === 0) return { error: null };
  const { error } = await supabase.from(TRAINING_LOGS_TABLE).update(body).eq('id', id);
  // #region agent log
  if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:updateTrainingLog',message:error?'update failed':'update ok',data:{id,keys:Object.keys(body),error:error?.message},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  if (error) return { error: { message: error.message } };
  return { error: null };
}

/** Удалить одну запись training_logs. */
export async function deleteTrainingLog(id: string): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from(TRAINING_LOGS_TABLE).delete().eq('id', id);
  // #region agent log
  if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:deleteTrainingLog',message:error?'delete failed':'delete ok',data:{id,error:error?.message},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  if (error) return { error: { message: error.message } };
  return { error: null };
}

/** Пакетное обновление записей (для смены порядка, объединения/разъединения суперсетов). */
export async function batchUpdateTrainingLogs(
  updates: { id: string; payload: UpdateTrainingLogPayload }[]
): Promise<{ error: { message: string } | null }> {
  for (const { id, payload } of updates) {
    const result = await updateTrainingLog(id, payload);
    if (result.error) {
      // #region agent log
      if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:batchUpdateTrainingLogs',message:'batch failed',data:{updatesCount:updates.length,failedId:id,error:result.error?.message},timestamp:Date.now(),hypothesisId:'H2,H5'})}).catch(()=>{});
      // #endregion
      return result;
    }
  }
  // #region agent log
  if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:batchUpdateTrainingLogs',message:'batch ok',data:{updatesCount:updates.length},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
  // #endregion
  return { error: null };
}

// --- Workout sessions (сессионный подход: одна тренировка = одна запись) ---

export interface WorkoutSessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  name: string | null;
  status: string;
}

/** Создать сессию. startedAt — опционально для тренировки «на выбранную дату» (календарь). */
export async function createWorkoutSession(opts?: {
  startedAt?: string;
}): Promise<{ id: string } | { error: { message: string } }> {
  const started_at = opts?.startedAt ?? new Date().toISOString();
  const { data, error } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .insert({ status: 'active', started_at })
    .select('id')
    .single();
  if (error) return { error: { message: error.message } };
  return { id: String(data.id) };
}

/** Завершить сессию. Для «тренировки на дату» передать startedAt + openedAt — ended_at будет на ту же дату. */
export async function completeWorkoutSession(
  id: string,
  opts?: { startedAt: string; openedAt: number }
): Promise<{ error: { message: string } | null }> {
  let ended_at: string;
  if (opts?.startedAt != null && opts?.openedAt != null) {
    const startedMs = new Date(opts.startedAt).getTime();
    const durationMs = Date.now() - opts.openedAt;
    ended_at = new Date(startedMs + durationMs).toISOString();
  } else {
    ended_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .update({ ended_at, status: 'completed' })
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

/** Взять сессию по id (нужно для даты логов при сохранении, если sessionStorage пуст). */
export async function getWorkoutSessionById(sessionId: string): Promise<{ started_at: string; ended_at: string | null } | null> {
  const { data, error } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .select('started_at, ended_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    started_at: String(data.started_at),
    ended_at: data.ended_at != null ? String(data.ended_at) : null,
  };
}

/** Логи сессии (id + completed_at) для переноса даты. */
export async function getTrainingLogsBySessionId(sessionId: string): Promise<{ id: string; completed_at: string }[]> {
  const { data, error } = await supabase
    .from(TRAINING_LOGS_TABLE)
    .select('id, completed_at')
    .eq('session_id', sessionId);
  if (error || !data) return [];
  return (data as Array<{ id: string; completed_at: string | null }>)
    .filter((r) => r.completed_at != null)
    .map((r) => ({ id: String(r.id), completed_at: String(r.completed_at) }));
}

/** Перенести дату тренировки и всех её логов на новую дату (БД). */
export async function updateWorkoutSessionDate(
  sessionId: string,
  newDateYyyyMmDd: string
): Promise<{ error: { message: string } | null }> {
  const session = await getWorkoutSessionById(sessionId);
  if (!session) return { error: { message: 'Сессия не найдена' } };

  const oldStartedMs = new Date(session.started_at).getTime();
  const newStartedAt = `${newDateYyyyMmDd}T12:00:00.000Z`;
  const newStartedMs = new Date(newStartedAt).getTime();

  let newEndedAt: string;
  if (session.ended_at) {
    const oldEndedMs = new Date(session.ended_at).getTime();
    const durationMs = oldEndedMs - oldStartedMs;
    newEndedAt = new Date(newStartedMs + durationMs).toISOString();
  } else {
    newEndedAt = new Date(newStartedMs + 3600000).toISOString();
  }

  const { error: sessionErr } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .update({ started_at: newStartedAt, ended_at: newEndedAt })
    .eq('id', sessionId);
  if (sessionErr) return { error: { message: sessionErr.message } };

  const logs = await getTrainingLogsBySessionId(sessionId);
  for (const log of logs) {
    const oldCompletedMs = new Date(log.completed_at).getTime();
    const offsetFromStart = oldCompletedMs - oldStartedMs;
    const newCompletedAt = new Date(newStartedMs + offsetFromStart).toISOString();
    const { error: logErr } = await supabase
      .from(TRAINING_LOGS_TABLE)
      .update({ completed_at: newCompletedAt })
      .eq('id', log.id);
    if (logErr) return { error: { message: `Лог: ${logErr.message}` } };
  }
  return { error: null };
}

export interface WorkoutSummaryData {
  durationSec: number;
  tonnageKg: number;
  setsCount: number;
  avgRpe: number | null;
}

export async function getWorkoutSummary(sessionId: string): Promise<WorkoutSummaryData | null> {
  const sessionRes = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .select('started_at, ended_at')
    .eq('id', sessionId)
    .single();
  if (sessionRes.error || !sessionRes.data) return null;
  const started = new Date(sessionRes.data.started_at).toISOString();
  const ended = sessionRes.data.ended_at
    ? new Date(sessionRes.data.ended_at).toISOString()
    : new Date().toISOString();
  const durationSec = Math.max(
    0,
    Math.floor((new Date(ended).getTime() - new Date(started).getTime()) / 1000)
  );

  // Логи по session_id (для backdated-тренировок логи имеют created_at=now, но session_id совпадает)
  const logsRes = await supabase
    .from(TRAINING_LOGS_TABLE)
    .select('set_volume, rpe, created_at')
    .eq('session_id', sessionId);
  if (logsRes.error) return null;

  const rows = (logsRes.data ?? []) as Array<{
    set_volume?: number | null;
    rpe?: number | null;
    completed_at?: string | null;
    created_at?: string;
  }>;
  // #region agent log
  if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'api.ts:getWorkoutSummary', message: 'logs in session window', data: { sessionId, started, ended, logsCount: rows.length }, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => {});
  // #endregion
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

// --- Экспорт / Импорт данных ---

export const EXPORT_FORMAT_VERSION = 1;

export interface ExportWorkoutPayload {
  version: number;
  exportedAt: string;
  workoutSessions: WorkoutSessionRow[];
  trainingLogs: TrainingLogRaw[];
  exercises: Exercise[];
}

/** Все завершённые сессии за период (для экспорта). */
export async function getAllWorkoutSessions(days = 730): Promise<WorkoutSessionRow[]> {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .select('id, started_at, ended_at, name, status')
    .gte('started_at', sinceIso)
    .order('started_at', { ascending: false })
    .limit(5000);
  if (error) {
    console.error('getAllWorkoutSessions error:', error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    started_at: String(r.started_at),
    ended_at: r.ended_at != null ? String(r.ended_at) : null,
    name: r.name != null ? String(r.name) : null,
    status: String(r.status),
  }));
}

/** Собрать данные для экспорта: сессии, логи, упражнения (используемые в логах). */
export async function exportWorkoutData(days = 730): Promise<ExportWorkoutPayload> {
  const [sessions, logs, allExercises] = await Promise.all([
    getAllWorkoutSessions(days),
    fetchTrainingLogsWindow(days),
    fetchAllExercises(),
  ]);
  const exerciseIds = new Set(logs.map((r) => r.exercise_id));
  const exercises = allExercises.filter((e) => exerciseIds.has(e.id));
  return {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    workoutSessions: sessions,
    trainingLogs: logs,
    exercises,
  };
}

export interface ImportWorkoutResult {
  success: boolean;
  error?: string;
  sessionsCreated?: number;
  logsCreated?: number;
}

/** Импорт: создаём сессии и логи. exercise_id в логах должны существовать в БД. */
export async function importWorkoutData(
  payload: ExportWorkoutPayload
): Promise<ImportWorkoutResult> {
  if (payload.version !== EXPORT_FORMAT_VERSION || !Array.isArray(payload.workoutSessions) || !Array.isArray(payload.trainingLogs)) {
    return { success: false, error: 'Неверный формат файла (версия или поля).' };
  }
  const sessionIdMap = new Map<string, string>();
  const completedSessions = payload.workoutSessions.filter((s) => s.status === 'completed' && s.ended_at);
  for (const s of completedSessions) {
    const { data, error } = await supabase
      .from(WORKOUT_SESSIONS_TABLE)
      .insert({
        started_at: s.started_at,
        ended_at: s.ended_at,
        name: s.name,
        status: 'completed',
      })
      .select('id')
      .single();
    if (error) {
      return { success: false, error: `Ошибка создания сессии: ${error.message}` };
    }
    sessionIdMap.set(s.id, String(data.id));
  }
  let logsCreated = 0;
  const logsToImport = payload.trainingLogs.filter((r) => sessionIdMap.has(r.session_id));
  const batchSize = 100;
  for (let i = 0; i < logsToImport.length; i += batchSize) {
    const chunk = logsToImport.slice(i, i + batchSize);
    const rows: SaveTrainingLogRow[] = chunk.map((r) => {
      const effective = r.effective_load != null ? r.effective_load : r.input_wt;
      return {
        session_id: sessionIdMap.get(r.session_id)!,
        set_group_id: r.set_group_id,
        exercise_id: r.exercise_id,
        weight: effective,
        reps: r.reps,
        order_index: r.set_no,
        exercise_order: r.exercise_order ?? 0,
        input_wt: r.input_wt,
        effective_load: effective,
        side: r.side,
        body_wt_snapshot: r.body_wt_snapshot ?? undefined,
        side_mult: r.side_mult ?? undefined,
        set_volume: r.set_volume ?? undefined,
        rpe: r.rpe || undefined,
        rest_seconds: r.rest_s || undefined,
        completed_at: r.ts,
      };
    });
    const { error } = await saveTrainingLogs(rows);
    if (error) {
      return { success: false, error: `Ошибка сохранения логов: ${error.message}` };
    }
    logsCreated += rows.length;
  }
  return {
    success: true,
    sessionsCreated: sessionIdMap.size,
    logsCreated,
  };
}
