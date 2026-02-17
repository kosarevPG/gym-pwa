export type CategorySlug = 'back' | 'legs' | 'chest' | 'shoulders' | 'triceps' | 'biceps' | 'abs' | 'cardio' | 'calves';
export type BodyPart = 'CHEST' | 'BACK' | 'LEGS' | 'SHOULDERS' | 'TRICEPS' | 'BICEPS' | 'ABS' | 'CARDIO' | 'FULL_BODY' | 'OTHER';
export type InputMode = 'WEIGHT_REPS' | 'DISTANCE_TIME' | 'TIME_ONLY' | 'REPS_ONLY';
export type BodyweightType = 'NONE' | 'WEIGHTED' | 'ASSISTED';
export type ExerciseWeightType = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'standard';
export type SetSide = 'left' | 'right' | 'both';

export interface Category {
  slug: CategorySlug;
  name: string;
}

export interface Equipment {
  id: string;
  code: string;
  nameRu: string;
  nameEn: string;
  defaultWeightStep?: number;
}

export interface Exercise {
  id: string;
  category: CategorySlug;
  nameRu: string;
  nameEn: string;
  weightType?: ExerciseWeightType;
  baseWeight?: number;
  targetWeightKg?: number;
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
}

export interface WorkoutSet {
  id: string;
  exerciseId: string;
  /** вес «×1 блин» (или кг для других типов) */
  inputWeight: string;
  reps: string;
  restMin: string;
  restAfterSeconds?: number;
  doneAt?: string;
  supersetExerciseId?: string | null;
  side?: SetSide;
  inputWtNumeric?: number;
  bodyWtSnapshot?: number | null;
  sideMult?: number;
  completed: boolean;
  order: number;
  /** рассчитанный итого кг */
  totalWeightKg?: number;
  /** рассчитанный 1PM */
  estimated1Rm?: number;
  volume?: number;
  effectiveLoad?: number;
  /** Второе упражнение в сете (суперсет): данные для отображения и расчёта */
  supersetExercise?: Pick<Exercise, 'id' | 'nameRu' | 'weightType' | 'baseWeight'>;
  supersetInputWeight?: string;
  supersetReps?: string;
  supersetRestMin?: string;
}

export interface WorkoutSession {
  id: string;
  startedAt: string;
}
