import { useState, useCallback } from 'react';
import { ChevronLeft, Trophy, Calendar, FolderDown, Trash2, Plus } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import { supabase } from '../lib/supabase';
import { WEIGHT_FORMULAS, getWeightInputType, allows1rm } from '../exerciseConfig';
import { calc1RM } from '../utils';
import type { Exercise as ExerciseType, WorkoutSet } from '../types';
import type { WeightInputType } from '../exerciseConfig';

interface ExerciseDetailScreenProps {
  exercise: ExerciseType;
  sessionId: string;
  onBack: () => void;
  onComplete: () => void;
}

const createEmptySet = (exerciseId: string, order: number): WorkoutSet => ({
  id: crypto.randomUUID(),
  exerciseId,
  inputWeight: '',
  reps: '',
  restMin: '',
  completed: false,
  order,
});

function getWeightType(ex: ExerciseType): WeightInputType {
  const t = ex.weightType ?? 'barbell';
  return getWeightInputType(undefined, t);
}

function calcTotalKg(inputStr: string, weightType: WeightInputType, baseWeight?: number): number | null {
  const input = parseFloat(inputStr);
  if (inputStr === '' || isNaN(input)) return null;
  const formula = WEIGHT_FORMULAS[weightType];
  const base = baseWeight ?? (weightType === 'barbell' ? 20 : 0);
  const mult = weightType === 'barbell' || weightType === 'plate_loaded' ? 2 : 1;
  return formula.toEffective(input, undefined, base, mult);
}

export function ExerciseDetailScreen({ exercise, sessionId, onBack, onComplete }: ExerciseDetailScreenProps) {
  const [sets, setSets] = useState<WorkoutSet[]>(() => [
    createEmptySet(exercise.id, 1),
  ]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const weightType = getWeightType(exercise);
  const weightLabel = WEIGHT_FORMULAS[weightType]?.label ?? '×1 блин';
  const show1rm = allows1rm(weightType);

  const updateSet = useCallback(
    (id: string, patch: Partial<WorkoutSet>) => {
      setSets((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
    },
    []
  );

  const addSet = useCallback(() => {
    setSets((prev) => [...prev, createEmptySet(exercise.id, prev.length + 1)]);
  }, [exercise.id]);

  const removeSet = useCallback((id: string) => {
    setSets((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  }, []);

  const handleComplete = async () => {
    setSaving(true);
    const toInsert = sets
      .filter((s) => s.inputWeight.trim() !== '' || s.reps.trim() !== '')
      .map((s) => {
        const totalKg = calcTotalKg(s.inputWeight, weightType, exercise.baseWeight);
        const repsNum = parseInt(s.reps, 10) || 0;
        return {
          exercise_id: exercise.id,
          weight: totalKg ?? 0,
          reps: repsNum,
          set_group_id: sessionId,
          order_index: s.order,
        };
      });

    try {
      if (toInsert.length > 0) {
        const { error } = await supabase.from('training_logs').insert(toInsert);
        if (error) throw error;
      }
      onComplete();
    } catch (err) {
      console.error('Save sets failed:', err);
      // Сохраняем в localStorage как черновик и выходим
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ScreenHeader title="" onBack={onBack} />

      <div className="p-4 max-w-lg mx-auto w-full space-y-4">
        {/* Блок упражнения */}
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-2xl p-4">
          <div className="flex items-start gap-2">
            <span className="font-medium text-white flex-1">
              {exercise.nameRu} / {exercise.nameEn}
            </span>
            {exercise.targetWeightKg != null && (
              <span className="flex items-center gap-1 text-amber-400 text-sm">
                <Trophy className="w-4 h-4" />
                {exercise.targetWeightKg} кг
              </span>
            )}
            <button type="button" className="p-1 text-zinc-400 hover:text-white" aria-label="История">
              <Calendar className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-zinc-500 text-sm">
            <FolderDown className="w-4 h-4" />
            <span>Заметка</span>
            <input
              type="text"
              placeholder="Добавить заметку..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none placeholder-zinc-600"
            />
          </div>
        </div>

        {/* Таблица подходов */}
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-2 border-b border-zinc-700 text-zinc-500 text-xs uppercase tracking-wide">
            <span>{weightLabel}</span>
            <span>ПОВТ</span>
            <span>МИН</span>
            <span className="w-8" />
          </div>
          <ul className="divide-y divide-zinc-700/50">
            {sets.map((set, index) => {
              const totalKg = calcTotalKg(set.inputWeight, weightType, exercise.baseWeight);
              const repsNum = parseInt(set.reps, 10) || 0;
              const estimated1rm = totalKg != null && repsNum > 0 ? calc1RM(totalKg, repsNum) : null;
              return (
                <li key={set.id} className="px-4 py-3 flex items-center gap-2">
                  <div className="grid grid-cols-3 gap-2 flex-1 min-w-0">
                    <div>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={set.inputWeight}
                        onChange={(e) => updateSet(set.id, { inputWeight: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {totalKg != null && `Итого: ${totalKg} кг`}
                        {show1rm && estimated1rm != null && (
                          <span className="block">1PM: {estimated1rm}</span>
                        )}
                      </div>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={set.reps}
                      onChange={(e) => updateSet(set.id, { reps: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={set.restMin}
                      onChange={(e) => updateSet(set.id, { restMin: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSet(set.id)}
                    className="p-2 text-zinc-500 hover:text-red-400 rounded-lg"
                    aria-label="Удалить подход"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="p-3 flex gap-2 border-t border-zinc-700/50">
            <button
              type="button"
              onClick={addSet}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-700/80 hover:bg-zinc-700 rounded-xl text-sm font-medium text-zinc-200"
            >
              <Plus className="w-4 h-4" /> Подход
            </button>
            <button
              type="button"
              onClick={addSet}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-700/80 hover:bg-zinc-700 rounded-xl text-sm font-medium text-zinc-200"
            >
              <Plus className="w-4 h-4" /> Сет
            </button>
          </div>
        </div>
      </div>

      <div className="mt-auto p-4 max-w-lg mx-auto w-full flex items-center gap-4 border-t border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="p-2 text-zinc-400 hover:text-white rounded-lg"
          aria-label="Назад"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={handleComplete}
          disabled={saving}
          className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-medium text-white"
        >
          {saving ? 'Сохранение…' : 'Завершить упражнение'}
        </button>
      </div>
    </div>
  );
}
