import { useState, useEffect } from 'react';
import { Plus, Loader2 } from 'lucide-react';
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

/** Крупная карточка с областью под изображение (картинку вставишь в mediaUrls или через img) */
function ExerciseCard({
  exercise,
  onClick,
}: {
  exercise: Exercise;
  onClick: () => void;
}) {
  const imageUrl = exercise.mediaUrls?.[0];

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl overflow-hidden bg-zinc-800/80 border border-zinc-700/50 hover:border-zinc-600 active:scale-[0.99] transition-all"
    >
      {/* Крупная область под картинку — ~75% карточки */}
      <div className="aspect-[4/3] w-full bg-zinc-700/60 relative overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-4xl">
            {/* Плейсхолдер: подставь свою иконку/иллюстрацию */}
            <span className="opacity-50">🏋️</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-medium text-white truncate">{exercise.nameRu}</p>
        <p className="text-sm text-zinc-500 truncate">{exercise.nameEn || getCategoryBySlug(exercise.category)?.name}</p>
      </div>
    </button>
  );
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
            {/* Сетка 2 колонки с крупными карточками (как в примере «Все упражнения») */}
            <div className="grid grid-cols-2 gap-4">
              {exercises.map((ex) => (
                <ExerciseCard key={ex.id} exercise={ex} onClick={() => onSelectExercise(ex)} />
              ))}
            </div>
            <button
              type="button"
              onClick={onAddExercise}
              className="mt-6 w-full flex items-center justify-center gap-2 py-4 bg-zinc-800/60 hover:bg-zinc-800 border border-dashed border-zinc-600 rounded-2xl text-zinc-400 hover:text-white transition-colors"
            >
              <Plus className="w-5 h-5" />
              Добавить своё упражнение
            </button>
            {!loading && exercises.length === 0 && (
              <p className="text-center text-zinc-500 py-8">Пока нет упражнений. Добавьте первое выше.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
