import { useState, useEffect, useMemo } from 'react';
import { Plus, Loader2, Search } from 'lucide-react';
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
      <div className="aspect-[4/3] w-full bg-zinc-700/60 relative flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-contain object-center"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-4xl">
            {/* Плейсхолдер: подставь свою иконку/иллюстрацию */}
            <span className="opacity-50">🏋️</span>
          </div>
        )}
      </div>
      <div className="p-3 min-w-0">
        <p className="font-medium text-white line-clamp-2 break-words">{exercise.nameRu}</p>
        <p className="text-sm text-zinc-500 line-clamp-2 break-words">{exercise.nameEn || getCategoryBySlug(exercise.category)?.name}</p>
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
  const [search, setSearch] = useState('');

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

  const filteredExercises = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!q) return exercises;
    return exercises.filter((ex) => {
      const ru = (ex.nameRu ?? '').toLowerCase();
      const en = (ex.nameEn ?? '').toLowerCase();
      return ru.includes(q) || en.includes(q);
    });
  }, [exercises, search]);

  const categoryName = getCategoryBySlug(category.slug)?.name ?? category.name;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ScreenHeader title={categoryName} onBack={onBack} />
      {/* Поиск по названию (RU/EN) и кнопка добавления в шапке */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 px-4 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Поиск по названию..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <button
            type="button"
            onClick={onAddExercise}
            className="flex-shrink-0 p-2.5 text-zinc-300 hover:text-white rounded-xl border border-zinc-700/60 bg-zinc-900/60"
            aria-label="Добавить упражнение"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              {filteredExercises.map((ex) => (
                <ExerciseCard key={ex.id} exercise={ex} onClick={() => onSelectExercise(ex)} />
              ))}
            </div>
            {!loading && filteredExercises.length === 0 && (
              <p className="text-center text-zinc-500 py-8">
                {exercises.length === 0
                  ? 'Пока нет упражнений. Добавьте первое кнопкой выше.'
                  : 'Ничего не найдено по запросу.'}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
