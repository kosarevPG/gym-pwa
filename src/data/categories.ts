import type { Category, CategorySlug } from '../types';

export const CATEGORIES: Category[] = [
  { slug: 'back', name: 'Спина' },
  { slug: 'legs', name: 'Ноги' },
  { slug: 'chest', name: 'Грудь' },
  { slug: 'shoulders', name: 'Плечи' },
  { slug: 'triceps', name: 'Трицепс' },
  { slug: 'biceps', name: 'Бицепс' },
  { slug: 'abs', name: 'Пресс' },
  { slug: 'cardio', name: 'Кардио' },
];

export function getCategoryBySlug(slug: CategorySlug): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
