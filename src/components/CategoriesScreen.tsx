import { useState, useMemo } from 'react';
import { ChevronRight, Search, BarChart3, RotateCw, X } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import { CATEGORIES } from '../data/categories';
import type { Category } from '../types';

interface CategoriesScreenProps {
  onClose: () => void;
  onSelectCategory: (category: Category) => void;
}

export function CategoriesScreen({ onClose, onSelectCategory }: CategoriesScreenProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800">
        <div className="p-4 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-zinc-300 hover:text-white active:opacity-80"
          >
            <X className="w-5 h-5" />
            <span>Закрыть</span>
          </button>
          <div className="flex items-center gap-2">
            <button className="p-2 text-zinc-400 hover:text-white rounded-lg" aria-label="Фильтр">
              <BarChart3 className="w-5 h-5" />
            </button>
            <button className="p-2 text-zinc-400 hover:text-white rounded-lg" aria-label="Обновить">
              <RotateCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              type="text"
              placeholder="Найти..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-zinc-600"
            />
          </div>
          <button className="p-2 text-zinc-400 hover:text-white rounded-lg" aria-label="Фильтр">
            <BarChart3 className="w-5 h-5" />
          </button>
          <button className="p-2 text-zinc-400 hover:text-white rounded-lg" aria-label="Обновить">
            <RotateCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        <ul className="space-y-2">
          {filtered.map((cat) => (
            <li key={cat.slug}>
              <button
                onClick={() => onSelectCategory(cat)}
                className="w-full flex items-center gap-4 p-4 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 rounded-2xl text-left transition-colors active:scale-[0.99]"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zinc-700/80 flex items-center justify-center">
                  <span className="text-zinc-400 text-lg">🏋️</span>
                </div>
                <span className="flex-1 font-medium text-white">{cat.name}</span>
                <ChevronRight className="w-5 h-5 text-zinc-500 flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
        {filtered.length === 0 && (
          <p className="text-center text-zinc-500 py-8">Ничего не найдено</p>
        )}
      </main>
    </div>
  );
}
