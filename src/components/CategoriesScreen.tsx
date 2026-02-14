import { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Loader2 } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import { CATEGORIES, getCategoryBySlug } from '../data/categories';
import { searchExercises } from '../lib/api';
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

function CategoryIcon({ slug }: { slug: string }) {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const iconUrl = CATEGORY_ICON_SLUGS.includes(slug as (typeof CATEGORY_ICON_SLUGS)[number])
    ? `${baseUrl}icons/categories/${slug}.svg`
    : null;

  return (
    <div className="w-full h-full rounded-full bg-zinc-700/80 flex items-center justify-center overflow-hidden">
      {iconUrl ? (
        <img src={iconUrl} alt="" className="w-full h-full object-contain p-1" />
      ) : (
        <span className="text-zinc-400 text-3xl opacity-60" aria-hidden>🏋️</span>
      )}
    </div>
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
  const [searchResults, setSearchResults] = useState<Exercise[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!q) return CATEGORIES;
    return CATEGORIES.filter((c) => (c.name ?? '').toLowerCase().includes(q));
  }, [search]);

  const searchQuery = search.trim().replace(/\s+/g, ' ');
  const showExerciseSearch = !addMode && searchQuery.length > 0;

  useEffect(() => {
    if (!showExerciseSearch) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    searchExercises(searchQuery, 50).then((list) => {
      if (!cancelled) {
        setSearchResults(list);
        setSearchLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, showExerciseSearch]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ScreenHeader
        title="Упражнения"
        onBack={onBack}
        rightAction={
          onAddExercise ? (
            <button
              type="button"
              onClick={onAddExercise}
              className="p-2 text-zinc-300 hover:text-white rounded-lg"
              aria-label="Добавить упражнение"
            >
              <Plus className="w-5 h-5" />
            </button>
          ) : undefined
        }
      />
      <div className="px-4 pb-3 pt-1 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              placeholder={addMode ? 'Поиск по категориям...' : 'Поиск по названию упражнения...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>
      </div>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        {addMode && (
          <p className="text-center text-sm text-blue-400 mb-3">Выберите категорию для нового упражнения</p>
        )}

        {showExerciseSearch ? (
          <>
            {searchLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {searchResults.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => onSelectExercise?.(ex)}
                      className="w-full text-left rounded-2xl overflow-hidden bg-zinc-800/80 border border-zinc-700/50 hover:border-zinc-600 active:scale-[0.99] transition-all"
                    >
                      <div className="aspect-[4/3] w-full bg-zinc-700/60 flex items-center justify-center text-zinc-500 text-4xl">
                        <span className="opacity-50">🏋️</span>
                      </div>
                      <div className="p-3">
                        <p className="font-medium text-white truncate">{ex.nameRu}</p>
                        <p className="text-sm text-zinc-500 truncate">
                          {ex.nameEn || getCategoryBySlug(ex.category)?.name}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                {!searchLoading && searchResults.length === 0 && (
                  <p className="text-center text-zinc-500 py-8">Ничего не найдено по запросу «{searchQuery}»</p>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 sm:gap-5">
              {filteredCategories.map((cat) => (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => onSelectCategory(cat)}
                  className="flex flex-col items-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <div className="w-full aspect-square max-w-[120px] sm:max-w-[140px] rounded-full overflow-hidden bg-zinc-800/80 border-2 border-zinc-700/50 hover:border-zinc-600 flex items-center justify-center">
                    <CategoryIcon slug={cat.slug} />
                  </div>
                  <span className="text-sm font-medium text-white text-center leading-tight">{cat.name}</span>
                </button>
              ))}
            </div>
            {filteredCategories.length === 0 && (
              <p className="text-center text-zinc-500 py-8">Ничего не найдено</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
