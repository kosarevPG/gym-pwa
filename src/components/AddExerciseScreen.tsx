import { useEffect, useState } from 'react';
import { ScreenHeader } from './ScreenHeader';
import { addExercise, updateExercise, fetchEquipmentOptions } from '../lib/api';
import { getCategoryBySlug } from '../data/categories';
import type { BodyPart, BodyweightType, Category, Equipment, Exercise, InputMode } from '../types';

const WEIGHT_TYPES: { value: Exercise['weightType']; label: string }[] = [
  { value: 'barbell', label: 'Штанга (×1 блин)' },
  { value: 'dumbbell', label: 'Гантели (кг)' },
  { value: 'machine', label: 'Тренажёр (кг)' },
  { value: 'bodyweight', label: 'Свой вес' },
  { value: 'standard', label: 'Кг' },
];

const INPUT_MODE_OPTIONS: { value: InputMode; label: string }[] = [
  { value: 'WEIGHT_REPS', label: 'Вес + Повт' },
  { value: 'DISTANCE_TIME', label: 'Дистанция + Время' },
  { value: 'TIME_ONLY', label: 'Только время' },
  { value: 'REPS_ONLY', label: 'Только повторы' },
];

const BODYWEIGHT_TYPE_OPTIONS: { value: BodyweightType; label: string }[] = [
  { value: 'NONE', label: 'Обычный вес' },
  { value: 'WEIGHTED', label: 'С дополнительным весом' },
  { value: 'ASSISTED', label: 'С ассистом (гравитрон)' },
];

const BODY_PART_OPTIONS: { value: BodyPart; label: string }[] = [
  { value: 'CHEST', label: 'Грудь' },
  { value: 'BACK', label: 'Спина' },
  { value: 'LEGS', label: 'Ноги' },
  { value: 'SHOULDERS', label: 'Плечи' },
  { value: 'TRICEPS', label: 'Трицепс' },
  { value: 'BICEPS', label: 'Бицепс' },
  { value: 'ABS', label: 'Пресс' },
  { value: 'CARDIO', label: 'Кардио' },
  { value: 'FULL_BODY', label: 'Full Body' },
  { value: 'OTHER', label: 'Другое' },
];

function mapCategoryToBodyPart(category: Category['slug']): BodyPart {
  const map: Record<Category['slug'], BodyPart> = {
    chest: 'CHEST',
    back: 'BACK',
    legs: 'LEGS',
    shoulders: 'SHOULDERS',
    triceps: 'TRICEPS',
    biceps: 'BICEPS',
    abs: 'ABS',
    cardio: 'CARDIO',
    calves: 'OTHER',
  };
  return map[category] ?? 'OTHER';
}

interface AddExerciseScreenProps {
  category: Category;
  onBack: () => void;
  onSuccess: (exercise: Exercise) => void;
  /** Режим редактирования: предзаполнить форму и вызывать updateExercise вместо addExercise */
  initialExercise?: Exercise;
}

export function AddExerciseScreen({ category, onBack, onSuccess, initialExercise }: AddExerciseScreenProps) {
  const isEdit = Boolean(initialExercise);

  const [nameRu, setNameRu] = useState(initialExercise?.nameRu ?? '');
  const [nameEn, setNameEn] = useState(initialExercise?.nameEn ?? '');
  const [description, setDescription] = useState(initialExercise?.description ?? '');
  const [mediaUrlsRaw, setMediaUrlsRaw] = useState(
    (initialExercise?.mediaUrls ?? []).join('\n')
  );
  const [weightType, setWeightType] = useState<Exercise['weightType']>(
    initialExercise?.weightType ?? 'barbell'
  );
  const [bodyPart, setBodyPart] = useState<BodyPart>(
    (initialExercise?.bodyPart as BodyPart) ?? mapCategoryToBodyPart(category.slug)
  );
  const [inputMode, setInputMode] = useState<InputMode>(
    (initialExercise?.inputMode as InputMode) ?? 'WEIGHT_REPS'
  );
  const [bodyweightType, setBodyweightType] = useState<BodyweightType>(
    (initialExercise?.bodyweightType as BodyweightType) ?? 'NONE'
  );
  const [isUnilateral, setIsUnilateral] = useState(initialExercise?.isUnilateral ?? false);
  const [simultaneous, setSimultaneous] = useState(initialExercise?.simultaneous ?? false);
  const [baseWeight, setBaseWeight] = useState(
    initialExercise?.baseWeight != null ? String(initialExercise.baseWeight) : ''
  );
  const [targetWeightKg, setTargetWeightKg] = useState(
    initialExercise?.targetWeightKg != null ? String(initialExercise.targetWeightKg) : ''
  );
  const [weightStep, setWeightStep] = useState(
    initialExercise?.weightStep != null ? String(initialExercise.weightStep) : ''
  );
  const [defaultRestSeconds, setDefaultRestSeconds] = useState(
    initialExercise?.defaultRestSeconds != null
      ? String(initialExercise.defaultRestSeconds)
      : '120'
  );
  const [isCompound, setIsCompound] = useState(initialExercise?.isCompound ?? true);
  const [hiddenFromStats, setHiddenFromStats] = useState(initialExercise?.hiddenFromStats ?? false);
  const [equipmentId, setEquipmentId] = useState(initialExercise?.equipmentId ?? '');
  const [equipmentOptions, setEquipmentOptions] = useState<Equipment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryName = getCategoryBySlug(category.slug)?.name ?? category.name;

  useEffect(() => {
    let cancelled = false;
    fetchEquipmentOptions().then((options) => {
      if (!cancelled) {
        setEquipmentOptions(options);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameRu.trim();
    if (!trimmed) {
      setError('Введите название упражнения');
      return;
    }
    setError(null);
    setSaving(true);

    const mediaUrls = mediaUrlsRaw
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter(Boolean);

    const payload = {
      category: category.slug,
      nameRu: trimmed,
      nameEn: nameEn.trim() || undefined,
      description: description.trim() || undefined,
      mediaUrls: mediaUrls.length ? mediaUrls : undefined,
      bodyPart,
      equipmentId: equipmentId || undefined,
      inputMode,
      bodyweightType,
      isUnilateral,
      simultaneous,
      weightStep: weightStep === '' ? undefined : parseFloat(weightStep),
      defaultRestSeconds: defaultRestSeconds === '' ? undefined : parseInt(defaultRestSeconds, 10),
      isCompound,
      hiddenFromStats,
      weightType,
      baseWeight: baseWeight === '' ? undefined : parseFloat(baseWeight),
      targetWeightKg: targetWeightKg === '' ? undefined : parseFloat(targetWeightKg),
    };

    if (isEdit && initialExercise) {
      const { data, error: err } = await updateExercise(initialExercise.id, payload);
      setSaving(false);
      if (err) {
        setError(err.message || 'Не удалось сохранить изменения.');
        return;
      }
      if (data) onSuccess(data);
    } else {
      const { data, error: err } = await addExercise(payload);
      setSaving(false);
      if (err) {
        setError(err.message || 'Не удалось сохранить. Проверь таблицу exercises и RLS в Supabase.');
        return;
      }
      if (data) onSuccess(data);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ScreenHeader
        title={isEdit ? `Редактировать · ${categoryName}` : `Новое упражнение · ${categoryName}`}
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
          <label className="block text-zinc-400 text-sm mb-1">Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Короткая инструкция по технике"
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-zinc-400 text-sm mb-1">Медиа URL (через запятую или с новой строки)</label>
          <textarea
            value={mediaUrlsRaw}
            onChange={(e) => setMediaUrlsRaw(e.target.value)}
            placeholder="https://.../video.mp4"
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Мышечная группа</label>
            <select
              value={bodyPart}
              onChange={(e) => setBodyPart(e.target.value as BodyPart)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {BODY_PART_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Оборудование</label>
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Не выбрано</option>
              {equipmentOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.nameRu || opt.code}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Режим ввода</label>
            <select
              value={inputMode}
              onChange={(e) => setInputMode(e.target.value as InputMode)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {INPUT_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Тип bodyweight</label>
            <select
              value={bodyweightType}
              onChange={(e) => setBodyweightType(e.target.value as BodyweightType)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {BODYWEIGHT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Шаг веса (кг)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={weightStep}
              onChange={(e) => setWeightStep(e.target.value)}
              placeholder="2.5"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Отдых по умолч. (сек)</label>
            <input
              type="number"
              min="0"
              value={defaultRestSeconds}
              onChange={(e) => setDefaultRestSeconds(e.target.value)}
              placeholder="120"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-800/60 border border-zinc-700 rounded-xl px-3 py-2">
            <input type="checkbox" checked={isUnilateral} onChange={(e) => setIsUnilateral(e.target.checked)} />
            Unilateral (L/R)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-800/60 border border-zinc-700 rounded-xl px-3 py-2">
            <input type="checkbox" checked={simultaneous} onChange={(e) => setSimultaneous(e.target.checked)} />
            Simultaneous (×2)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-800/60 border border-zinc-700 rounded-xl px-3 py-2">
            <input type="checkbox" checked={isCompound} onChange={(e) => setIsCompound(e.target.checked)} />
            Базовое (compound)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-800/60 border border-zinc-700 rounded-xl px-3 py-2">
            <input type="checkbox" checked={hiddenFromStats} onChange={(e) => setHiddenFromStats(e.target.checked)} />
            Скрыть из статистики
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-auto py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-medium text-white"
        >
          {saving ? 'Сохранение…' : isEdit ? 'Сохранить изменения' : 'Добавить упражнение'}
        </button>
      </form>
    </div>
  );
}
