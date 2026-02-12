import { useState, useEffect } from 'react';
import { ChevronRight, Plus, Loader2 } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import { getCategoryBySlug } from '../data/categories';
import { fetchExercises } from '../lib/api';
import type { Category, Exercise } from '../types';

interface ExerciseListScreenProps {
  category: Category;
  refreshTrigger?: number;
  onBack: () => void;
  onSelectExercise: (exercise: Exercise) => void;
  onAddExercise: () => void;
}

export function ExerciseListScreen({
  category,
  refreshTrigger = 0,
  onBack,
  onSelectExercise,
  onAddExercise,
}: ExerciseListScreenProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchExercises(category.slug).then((list) => {
      if (!cancelled) {
        setExercises(list);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [category.slug, refreshTrigger]);

  const categoryName = getCategoryBySlug(category.slug)?.name ?? category.name;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ScreenHeader
        title={categoryName}
        onBack={onBack}
        rightAction={(
          <button
            type="button"
            onClick={onAddExercise}
            className="p-2 text-zinc-300 hover:text-white rounded-lg border border-zinc-700/60 bg-zinc-900/60"
            aria-label="Добавить упражнение"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      />
      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
          </div>
        ) : (
          <>
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
            <button
              type="button"
              onClick={onAddExercise}
              className="mt-4 w-full flex items-center justify-center gap-2 p-4 bg-zinc-800/60 hover:bg-zinc-800 border border-dashed border-zinc-600 rounded-2xl text-zinc-400 hover:text-white transition-colors"
            >
              <Plus className="w-5 h-5" />
              Добавить своё упражнение
            </button>
            {!loading && exercises.length === 0 && (
              <p className="text-center text-zinc-500 py-4">Пока нет упражнений. Добавьте первое выше.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
