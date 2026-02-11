import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import { addExercise } from '../lib/api';
import { getCategoryBySlug } from '../data/categories';
import type { Category, Exercise } from '../types';

const WEIGHT_TYPES: { value: Exercise['weightType']; label: string }[] = [
  { value: 'barbell', label: 'Штанга (×1 блин)' },
  { value: 'dumbbell', label: 'Гантели (кг)' },
  { value: 'machine', label: 'Тренажёр (кг)' },
  { value: 'bodyweight', label: 'Свой вес' },
  { value: 'standard', label: 'Кг' },
];

interface AddExerciseScreenProps {
  category: Category;
  onBack: () => void;
  onSuccess: (exercise: Exercise) => void;
}

export function AddExerciseScreen({ category, onBack, onSuccess }: AddExerciseScreenProps) {
  const [nameRu, setNameRu] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [weightType, setWeightType] = useState<Exercise['weightType']>('barbell');
  const [baseWeight, setBaseWeight] = useState('');
  const [targetWeightKg, setTargetWeightKg] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryName = getCategoryBySlug(category.slug)?.name ?? category.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameRu.trim();
    if (!trimmed) {
      setError('Введите название упражнения');
      return;
    }
    setError(null);
    setSaving(true);
    const { data, error: err } = await addExercise({
      category: category.slug,
      nameRu: trimmed,
      nameEn: nameEn.trim() || undefined,
      weightType,
      baseWeight: baseWeight === '' ? undefined : parseFloat(baseWeight),
      targetWeightKg: targetWeightKg === '' ? undefined : parseFloat(targetWeightKg),
    });
    setSaving(false);
    if (err) {
      setError(err.message || 'Не удалось сохранить. Проверь таблицу exercises и RLS в Supabase.');
      return;
    }
    if (data) onSuccess(data);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ScreenHeader
        title={`Новое упражнение · ${categoryName}`}
        onBack={onBack}
      />
      <form onSubmit={handleSubmit} className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}
        <div>
          <label className="block text-zinc-400 text-sm mb-1">Название (рус) *</label>
          <input
            type="text"
            value={nameRu}
            onChange={(e) => setNameRu(e.target.value)}
            placeholder="Например: Жим штанги лёжа"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-zinc-400 text-sm mb-1">Название (англ)</label>
          <input
            type="text"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="Bench Press"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-zinc-400 text-sm mb-1">Тип веса</label>
          <select
            value={weightType}
            onChange={(e) => setWeightType(e.target.value as Exercise['weightType'])}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {WEIGHT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Базовый вес (кг)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={baseWeight}
              onChange={(e) => setBaseWeight(e.target.value)}
              placeholder="20"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Цель (кг)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={targetWeightKg}
              onChange={(e) => setTargetWeightKg(e.target.value)}
              placeholder="80"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-auto py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-medium text-white"
        >
          {saving ? 'Сохранение…' : 'Добавить упражнение'}
        </button>
      </form>
    </div>
  );
}
