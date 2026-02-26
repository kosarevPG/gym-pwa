import { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Loader2, LayoutGrid, List } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import { CATEGORIES, getCategoryBySlug } from '../data/categories';
import { fetchAllExercises } from '../lib/api';
import type { Category, Exercise } from '../types';

interface CategoriesScreenProps {
  onBack: () => void;
  onSelectCategory: (category: Category) => void;
  onSelectExercise?: (exercise: Exercise) => void;
  onAddExercise?: () => void;
  /** Режим «выберите категорию для нового упражнения» после нажатия + */
  addMode?: boolean;
}

/** Слоги категорий, для которых есть SVG в public/icons/categories/ */
const CATEGORY_ICON_SLUGS = ['back', 'chest', 'shoulders', 'biceps', 'legs', 'triceps', 'abs', 'cardio', 'calves'] as const;

function CategoryIcon({ slug, active }: { slug: string; active?: boolean }) {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const iconUrl = CATEGORY_ICON_SLUGS.includes(slug as (typeof CATEGORY_ICON_SLUGS)[number])
    ? `${baseUrl}icons/categories/${slug}.svg`
    : null;

  if (iconUrl) {
    return <img src={iconUrl} alt="" className={`w-full h-full object-contain ${active ? 'brightness-0 invert' : ''}`} />;
  }
  return <span className="text-xl opacity-60">🏋️</span>;
}

function ExerciseGridCard({ exercise, onClick }: { exercise: Exercise; onClick: () => void }) {
  const imageUrl = exercise.mediaUrls?.[0];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-zinc-700 active:scale-[0.98] transition-all flex flex-col"
    >
      <div className="aspect-[4/3] w-full bg-zinc-800/50 relative flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-contain object-center mix-blend-screen" />
        ) : (
          <span className="text-3xl opacity-20">🏋️</span>
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold text-zinc-100 text-sm line-clamp-2 leading-tight">{exercise.nameRu}</p>
        <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{exercise.nameEn || getCategoryBySlug(exercise.category)?.name}</p>
      </div>
    </button>
  );
}

function ExerciseListRow({ exercise, onClick }: { exercise: Exercise; onClick: () => void }) {
  const imageUrl = exercise.mediaUrls?.[0];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-zinc-700 active:scale-[0.98] transition-all p-2 flex items-center gap-3"
    >
      <div className="w-16 h-16 rounded-xl bg-zinc-800/50 flex-shrink-0 flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-contain mix-blend-screen" />
        ) : (
          <span className="text-2xl opacity-20">🏋️</span>
        )}
      </div>
      <div className="flex-1 min-w-0 pr-2">
        <p className="font-semibold text-zinc-100 text-sm truncate">{exercise.nameRu}</p>
        <p className="text-xs text-zinc-500 mt-0.5 truncate">{exercise.nameEn || getCategoryBySlug(exercise.category)?.name}</p>
      </div>
    </button>
  );
}

export function CategoriesScreen({
  onBack,
  onSelectCategory,
  onSelectExercise,
  onAddExercise,
  addMode,
}: CategoriesScreenProps) {
  const [search, setSearch] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Загружаем все упражнения один раз при монтировании
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAllExercises().then((list) => {
      if (!cancelled) {
        setExercises(list);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Фильтрация и сортировка (по алфавиту)
  const filteredExercises = useMemo(() => {
    let list = exercises;

    // Фильтр по категории
    if (selectedCat) {
      list = list.filter((ex) => ex.category === selectedCat);
    }

    // Фильтр по поиску
    const q = search.trim().toLowerCase().replace(/\s+/g, ' ');
    if (q) {
      list = list.filter(
        (ex) =>
          (ex.nameRu || '').toLowerCase().includes(q) ||
          (ex.nameEn || '').toLowerCase().includes(q)
      );
    }

    // Сортировка по алфавиту
    return list.sort((a, b) => (a.nameRu || '').localeCompare(b.nameRu || ''));
  }, [exercises, selectedCat, search]);

  const handleCategoryClick = (cat: Category) => {
    if (addMode) {
      // Если мы в режиме добавления нового упражнения — переходим на форму
      onSelectCategory(cat);
    } else {
      // Иначе просто переключаем фильтр
      setSelectedCat((prev) => (prev === cat.slug ? null : cat.slug));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ScreenHeader
        title="Упражнения"
        onBack={onBack}
        rightAction={
          onAddExercise && !addMode ? (
            <button
              type="button"
              onClick={onAddExercise}
              className="p-2 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors"
              aria-label="Добавить упражнение"
            >
              <Plus className="w-5 h-5" />
            </button>
          ) : undefined
        }
      />

      {/* Горизонтальная панель категорий */}
      <div className="flex overflow-x-auto gap-3 px-4 py-4 border-b border-zinc-800/80 items-start [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {!addMode && (
          <button
            onClick={() => setSelectedCat(null)}
            className="flex flex-col items-center gap-2 w-[4.5rem] flex-shrink-0"
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all shadow-sm ${!selectedCat ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-zinc-900 border border-zinc-800 text-zinc-500'}`}
            >
              <span className={!selectedCat ? '' : 'opacity-40'}>🏋️</span>
            </div>
            <span className={`text-[11px] font-medium text-center ${!selectedCat ? 'text-emerald-400' : 'text-zinc-500'}`}>Все</span>
          </button>
        )}

        {CATEGORIES.map((cat) => {
          const isActive = selectedCat === cat.slug;
          return (
            <button
              key={cat.slug}
              onClick={() => handleCategoryClick(cat)}
              className={`flex flex-col items-center gap-2 w-[4.5rem] flex-shrink-0 transition-opacity ${addMode ? 'hover:opacity-80' : ''}`}
            >
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center p-3 transition-all shadow-sm ${isActive ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-zinc-900 border border-zinc-800'}`}
              >
                <CategoryIcon slug={cat.slug} active={isActive} />
              </div>
              <span
                className={`text-[11px] font-medium text-center w-full truncate ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`}
              >
                {cat.name}
              </span>
            </button>
          );
        })}
      </div>

      {addMode && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-3 text-center">
          <p className="text-sm font-medium text-blue-400">Выберите группу мышц для нового упражнения</p>
        </div>
      )}

      {/* Панель поиска и переключателя вида */}
      {!addMode && (
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Поиск упражнений..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          <button
            onClick={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}
            className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors flex-shrink-0"
            title="Изменить вид"
          >
            {viewMode === 'grid' ? <List className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
          </button>
        </div>
      )}

      {/* Список упражнений */}
      {!addMode && (
        <main className="flex-1 px-4 pb-8 max-w-lg mx-auto w-full">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-600" />
            </div>
          ) : filteredExercises.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {filteredExercises.map((ex) => (
                  <ExerciseGridCard key={ex.id} exercise={ex} onClick={() => onSelectExercise?.(ex)} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredExercises.map((ex) => (
                  <ExerciseListRow key={ex.id} exercise={ex} onClick={() => onSelectExercise?.(ex)} />
                ))}
              </div>
            )
          ) : (
            <div className="text-center py-12">
              <p className="text-zinc-500 font-medium">Ничего не найдено</p>
              <p className="text-sm text-zinc-600 mt-1">Попробуйте изменить запрос</p>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
