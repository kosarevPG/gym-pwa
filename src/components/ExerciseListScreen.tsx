import { ChevronRight } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import { getCategoryBySlug } from '../data/categories';
import { getExercisesForCategory } from '../data/exercises';
import type { Category, Exercise } from '../types';

interface ExerciseListScreenProps {
  category: Category;
  onBack: () => void;
  onSelectExercise: (exercise: Exercise) => void;
}

export function ExerciseListScreen({ category, onBack, onSelectExercise }: ExerciseListScreenProps) {
  const exercises = getExercisesForCategory(category.slug);
  const categoryName = getCategoryBySlug(category.slug)?.name ?? category.name;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ScreenHeader title={categoryName} onBack={onBack} />
      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        <ul className="space-y-2">
          {exercises.map((ex) => (
            <li key={ex.id}>
              <button
                onClick={() => onSelectExercise(ex)}
                className="w-full flex items-center gap-4 p-4 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 rounded-2xl text-left transition-colors active:scale-[0.99]"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zinc-700/80 flex items-center justify-center">
                  <span className="text-zinc-400 text-lg">🏋️</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-white block truncate">{ex.nameRu}</span>
                  {ex.nameEn && (
                    <span className="text-sm text-zinc-500 block truncate">{ex.nameEn}</span>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-zinc-500 flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
        {exercises.length === 0 && (
          <p className="text-center text-zinc-500 py-8">В этой категории пока нет упражнений</p>
        )}
      </main>
    </div>
  );
}
