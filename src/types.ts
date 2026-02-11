export type CategorySlug = 'back' | 'legs' | 'chest' | 'shoulders' | 'triceps' | 'biceps' | 'abs' | 'cardio';

export interface Category {
  slug: CategorySlug;
  name: string;
}

export interface Exercise {
  id: string;
  category: CategorySlug;
  nameRu: string;
  nameEn: string;
  weightType?: 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'standard';
  baseWeight?: number;
  targetWeightKg?: number;
}

export interface WorkoutSet {
  id: string;
  exerciseId: string;
  /** вес «×1 блин» (или кг для других типов) */
  inputWeight: string;
  reps: string;
  restMin: string;
  completed: boolean;
  order: number;
  /** рассчитанный итого кг */
  totalWeightKg?: number;
  /** рассчитанный 1PM */
  estimated1Rm?: number;
}

export interface WorkoutSession {
  id: string;
  startedAt: string;
}
