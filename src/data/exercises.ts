import type { Exercise } from '../types';

/** Стартовый список упражнений по категориям (можно потом грузить из Supabase) */
export const EXERCISES_BY_CATEGORY: Record<string, Exercise[]> = {
  back: [
    { id: 'ex-back-1', category: 'back', nameRu: 'Тяга верхнего блока', nameEn: 'Lat Pulldown', weightType: 'machine', baseWeight: 0, targetWeightKg: 60 },
    { id: 'ex-back-2', category: 'back', nameRu: 'Тяга штанги в наклоне', nameEn: 'Barbell Row', weightType: 'barbell', baseWeight: 20, targetWeightKg: 80 },
    { id: 'ex-back-3', category: 'back', nameRu: 'Подтягивания', nameEn: 'Pull-ups', weightType: 'bodyweight' },
  ],
  legs: [
    { id: 'ex-legs-1', category: 'legs', nameRu: 'Присед со штангой', nameEn: 'Barbell Squat', weightType: 'barbell', baseWeight: 20, targetWeightKg: 100 },
    { id: 'ex-legs-2', category: 'legs', nameRu: 'Жим ногами', nameEn: 'Leg Press', weightType: 'machine', baseWeight: 0, targetWeightKg: 120 },
    { id: 'ex-legs-3', category: 'legs', nameRu: 'Румынская тяга', nameEn: 'Romanian Deadlift', weightType: 'barbell', baseWeight: 20, targetWeightKg: 80 },
  ],
  chest: [
    { id: 'ex-chest-1', category: 'chest', nameRu: 'Жим штанги лёжа', nameEn: 'Bench Press', weightType: 'barbell', baseWeight: 20, targetWeightKg: 80 },
    { id: 'ex-chest-2', category: 'chest', nameRu: 'Разводка гантелей', nameEn: 'Dumbbell Fly', weightType: 'dumbbell', baseWeight: 0, targetWeightKg: 20 },
    { id: 'ex-chest-3', category: 'chest', nameRu: 'Жим гантелей', nameEn: 'Dumbbell Press', weightType: 'dumbbell', baseWeight: 0, targetWeightKg: 30 },
  ],
  shoulders: [
    { id: 'ex-shoulders-1', category: 'shoulders', nameRu: 'Жим стоя', nameEn: 'Overhead Press', weightType: 'barbell', baseWeight: 20, targetWeightKg: 50 },
    { id: 'ex-shoulders-2', category: 'shoulders', nameRu: 'Махи в стороны', nameEn: 'Lateral Raise', weightType: 'dumbbell', baseWeight: 0, targetWeightKg: 12 },
  ],
  triceps: [
    { id: 'ex-triceps-1', category: 'triceps', nameRu: 'Разгибания на блоке', nameEn: 'Triceps Pushdown', weightType: 'machine', baseWeight: 0, targetWeightKg: 40 },
    { id: 'ex-triceps-2', category: 'triceps', nameRu: 'Отжимания на брусьях', nameEn: 'Dips', weightType: 'bodyweight' },
  ],
  biceps: [
    { id: 'ex-biceps-1', category: 'biceps', nameRu: 'Подъём на бицепс', nameEn: 'Bicep Curl', weightType: 'dumbbell', baseWeight: 0, targetWeightKg: 14 },
    { id: 'ex-biceps-2', category: 'biceps', nameRu: 'Молотки', nameEn: 'Hammer Curl', weightType: 'dumbbell', baseWeight: 0, targetWeightKg: 12 },
  ],
  abs: [
    { id: 'ex-abs-1', category: 'abs', nameRu: 'Скручивания', nameEn: 'Crunches', weightType: 'bodyweight' },
    { id: 'ex-abs-2', category: 'abs', nameRu: 'Планка', nameEn: 'Plank', weightType: 'bodyweight' },
  ],
  cardio: [
    { id: 'ex-cardio-1', category: 'cardio', nameRu: 'Бег', nameEn: 'Running', weightType: 'bodyweight' },
    { id: 'ex-cardio-2', category: 'cardio', nameRu: 'Велосипед', nameEn: 'Cycling', weightType: 'bodyweight' },
  ],
};

export function getExercisesForCategory(categorySlug: string): Exercise[] {
  return EXERCISES_BY_CATEGORY[categorySlug] ?? [];
}
