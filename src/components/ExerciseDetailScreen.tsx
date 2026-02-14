import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, Trophy, Calendar, MoreVertical, Plus, Check, Timer, History, X, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import {
  saveTrainingLogs,
  fetchExerciseHistory,
  fetchLastExerciseSnapshot,
  fetchLastExerciseSessionSets,
  fetchPersonalBestWeight,
  fetchLatestBodyWeight,
  searchExercises,
  type ExerciseHistoryRow,
} from '../lib/api';
import { WEIGHT_FORMULAS, getWeightInputType, allows1rm } from '../exerciseConfig';
import { calc1RM } from '../utils';
import type { Exercise as ExerciseType, WorkoutSet } from '../types';
import type { WeightInputType } from '../exerciseConfig';
import { calcSideMult, median } from '../lib/metrics';

interface ExerciseDetailScreenProps {
  exercise: ExerciseType;
  sessionId: string;
  onBack: () => void;
  onComplete: () => void;
  onEditExercise?: (exercise: ExerciseType) => void;
  onDeleteExercise?: (exercise: ExerciseType) => void;
}

// Утилиты для расчетов (без изменений)
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

export interface ExerciseBlock {
  id: string;
  exercise: ExerciseType;
  sets: WorkoutSet[];
}

function createSetForExercise(ex: ExerciseType, order: number): WorkoutSet {
  return {
    id: crypto.randomUUID(),
    exerciseId: ex.id,
    inputWeight: '',
    reps: '',
    restMin: String(Math.round((ex.defaultRestSeconds ?? 120) / 60)),
    rpe: '',
    completed: false,
    order,
    side: 'both',
    supersetExerciseId: null,
  };
}

export function ExerciseDetailScreen({
  exercise,
  sessionId,
  onBack,
  onComplete,
  onEditExercise,
  onDeleteExercise,
}: ExerciseDetailScreenProps) {
  const [blocks, setBlocks] = useState<ExerciseBlock[]>(() => [
    { id: crypto.randomUUID(), exercise, sets: [createSetForExercise(exercise, 1)] },
  ]);
  const [saving, setSaving] = useState(false);
  const [restCountdownSec, setRestCountdownSec] = useState(0);

  const [historyRows, setHistoryRows] = useState<ExerciseHistoryRow[]>([]);
  const [lastSnapshot, setLastSnapshot] = useState<{ createdAt: string; weight: number; reps: number } | null>(null);
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [bodyWeight, setBodyWeight] = useState<number | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [swipeState, setSwipeState] = useState<{ setId: string; startX: number; offset: number } | null>(null);
  const [revealedDeleteSetId, setRevealedDeleteSetId] = useState<string | null>(null);
  const [addSetPickerOpen, setAddSetPickerOpen] = useState(false);
  const [addSetSearchQuery, setAddSetSearchQuery] = useState('');
  const [addSetSearchResults, setAddSetSearchResults] = useState<ExerciseType[]>([]);
  const [addSetSearching, setAddSetSearching] = useState(false);
  const setInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const selectAllOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  useEffect(() => {
    Promise.all([
      fetchLastExerciseSnapshot(exercise.id),
      fetchPersonalBestWeight(exercise.id),
      fetchLatestBodyWeight(),
    ]).then(([last, pb, bw]) => {
      setLastSnapshot(last);
      setPersonalBest(pb);
      setBodyWeight(bw);
    });
    fetchExerciseHistory(exercise.id, 10).then(setHistoryRows);

    fetchLastExerciseSessionSets(exercise.id).then((lastSets) => {
      if (lastSets.length === 0) return;
      const newSets: WorkoutSet[] = lastSets.map((row, i) => {
        const set = createSetForExercise(exercise, i + 1);
        return {
          ...set,
          inputWeight: row.inputWeight,
          reps: row.reps,
          restMin: row.restMin,
        };
      });
      setBlocks((prev) => {
        const first = prev[0];
        if (!first || first.exercise.id !== exercise.id) return prev;
        return [{ ...first, sets: newSets }, ...prev.slice(1)];
      });
    });
  }, [exercise.id]);

  useEffect(() => {
    if (restCountdownSec <= 0) return;
    const interval = setInterval(() => setRestCountdownSec(prev => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(interval);
  }, [restCountdownSec]);

  useEffect(() => {
    if (!addSetPickerOpen) return;
    const q = addSetSearchQuery.trim();
    if (!q) {
      setAddSetSearchResults([]);
      return;
    }
    let cancelled = false;
    setAddSetSearching(true);
    const excludeIds = new Set(blocks.map((b) => b.exercise.id));
    searchExercises(q, 15).then((list) => {
      if (!cancelled) {
        setAddSetSearchResults(list.filter((ex) => !excludeIds.has(ex.id)));
        setAddSetSearching(false);
      }
    });
    return () => { cancelled = true; };
  }, [addSetPickerOpen, addSetSearchQuery, blocks]);

  const updateSetInBlock = (blockId: string, setId: string, patch: Partial<WorkoutSet>) => {
    setBlocks(prev =>
      prev.map(b => (b.id !== blockId ? b : { ...b, sets: b.sets.map(s => (s.id === setId ? { ...s, ...patch } : s)) }))
    );
  };

  const addSetToBlock = (blockId: string) => {
    setBlocks(prev =>
      prev.map(b => {
        if (b.id !== blockId) return b;
        const blockSets = b.sets;
        const lastSet = blockSets[blockSets.length - 1];
        const newSet = createSetForExercise(b.exercise, blockSets.length + 1);
        if (lastSet) {
          newSet.inputWeight = lastSet.inputWeight;
          newSet.reps = lastSet.reps;
          newSet.restMin = lastSet.restMin;
        }
        setRevealedDeleteSetId(null);
        setTimeout(() => {
          setInputRefs.current[`${newSet.id}-weight`]?.focus();
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }, 100);
        return { ...b, sets: [...blockSets, newSet] };
      })
    );
  };

  const removeSetFromBlock = (blockId: string, setId: string) => {
    setBlocks(prev =>
      prev.map(b => {
        if (b.id !== blockId) return b;
        if (b.sets.length <= 1) return b;
        const next = b.sets.filter(s => s.id !== setId).map((s, i) => ({ ...s, order: i + 1 }));
        setRevealedDeleteSetId(null);
        return { ...b, sets: next };
      })
    );
  };

  const addBlock = (ex: ExerciseType) => {
    setBlocks(prev => [...prev, { id: crypto.randomUUID(), exercise: ex, sets: [createSetForExercise(ex, 1)] }]);
    setAddSetPickerOpen(false);
    setAddSetSearchQuery('');
    setAddSetSearchResults([]);
  };

  const toggleSetComplete = (blockId: string, setId: string) => {
    const block = blocks.find(b => b.id === blockId);
    const setIndex = block?.sets.findIndex(s => s.id === setId) ?? -1;
    const set = block?.sets[setIndex];
    if (!block || !set) return;

    const isCompleting = !set.completed;
    const now = new Date().toISOString();

    updateSetInBlock(blockId, setId, { completed: isCompleting, doneAt: isCompleting ? now : undefined });

    if (isCompleting) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
      const isLastSet = setIndex === block.sets.length - 1;
      if (isLastSet) {
        setRestCountdownSec(0);
      } else {
        const restSec = (parseFloat(set.restMin) || 0) * 60;
        if (restSec > 0) setRestCountdownSec(restSec);
      }
      const nextSet = block.sets[setIndex + 1];
      if (nextSet) setInputRefs.current[`${nextSet.id}-weight`]?.focus();
    } else {
      setRestCountdownSec(0);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    const maxRounds = Math.max(0, ...blocks.map(b => b.sets.length));
    const hasAnyValid = blocks.some(b => b.sets.some(s => s.completed || (s.inputWeight && s.reps)));
    if (!hasAnyValid || maxRounds === 0) {
      onComplete();
      setSaving(false);
      return;
    }

    // Один set_group_id на одно нажатие «Завершить» — иначе в истории ломается определение суперсетов
    const saveGroupId = crypto.randomUUID();
    const logs: Parameters<typeof saveTrainingLogs>[0] = [];
    for (let round = 1; round <= maxRounds; round++) {
      const orderIndex = round;
      for (const block of blocks) {
        const s = block.sets[round - 1];
        if (!s || (!s.completed && !s.inputWeight && !s.reps)) continue;
        const wtType = getWeightType(block.exercise);
        const totalKg = calcTotalKg(s.inputWeight, wtType, block.exercise.baseWeight) ?? 0;
        const rps = parseInt(s.reps) || 0;
        logs.push({
          exercise_id: block.exercise.id,
          weight: totalKg,
          reps: rps,
          set_group_id: saveGroupId,
          order_index: orderIndex,
          input_wt: parseFloat(s.inputWeight) || 0,
          side: s.side ?? 'both',
          set_volume: totalKg * rps,
          rpe: s.rpe ? parseFloat(s.rpe) : undefined,
          rest_seconds: (parseFloat(s.restMin) || 0) * 60,
          completed_at: s.doneAt ?? new Date().toISOString(),
        });
      }
    }

    await saveTrainingLogs(logs);
    setSaving(false);
    onComplete();
  };

  // --- RENDER HELPERS ---
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Получаем "Пред. результат" для конкретного сета из истории (упрощенно: берем последний снапшот)
  const prevData = lastSnapshot ? `${lastSnapshot.weight} × ${lastSnapshot.reps}` : '—';

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col pb-safe">

      {/* 1. Header: Minimal & Sticky */}
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-zinc-800 transition-colors flex-shrink-0">
            <ChevronLeft className="w-6 h-6 text-zinc-300" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-lg leading-tight break-words">{exercise.nameRu}</h1>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              {personalBest && <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-amber-500" /> PB: {personalBest} кг</span>}
              <span>• Last: {prevData}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Таймер в хедере, если активен */}
          {restCountdownSec > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/30 border border-emerald-500/30 rounded-full">
              <Timer className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="font-mono font-medium text-emerald-400">{formatTime(restCountdownSec)}</span>
            </div>
          )}
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 rounded-full hover:bg-zinc-800">
            <MoreVertical className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
      </header>

      {/* 2. Main Content: Blocks (exercise + sets) */}
      <div className="flex-1 p-4 space-y-6">
        {blocks.map((block) => {
          const isFirstBlock = block.exercise.id === exercise.id;
          const blockLastSnapshot = isFirstBlock ? lastSnapshot : null;

          return (
            <div key={block.id} className="space-y-3">
              {blocks.length > 1 && (
                <h2 className="text-sm font-semibold text-zinc-400 px-1">{block.exercise.nameRu}</h2>
              )}
              {block.sets.map((set) => {
                const isDone = set.completed;
                const setSwipeOffset =
                  swipeState?.setId === set.id ? swipeState.offset : revealedDeleteSetId === set.id ? -80 : 0;
                const canSwipeDelete = block.sets.length > 1;

                return (
                  <div
                    key={set.id}
                    className="overflow-hidden rounded-2xl"
                    onTouchStart={canSwipeDelete ? (e) => {
                      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
                      setRevealedDeleteSetId((prev) => (prev && prev !== set.id ? null : prev));
                      setSwipeState({ setId: set.id, startX: e.touches[0].clientX, offset: 0 });
                    } : undefined}
                    onTouchMove={canSwipeDelete ? (e) => {
                      if (!swipeState || swipeState.setId !== set.id) return;
                      const dx = e.touches[0].clientX - swipeState.startX;
                      setSwipeState((prev) => (prev ? { ...prev, offset: Math.max(-80, Math.min(0, dx)) } : null));
                    } : undefined}
                    onTouchEnd={canSwipeDelete ? () => {
                      if (!swipeState || swipeState.setId !== set.id) return;
                      setRevealedDeleteSetId(swipeState.offset < -40 ? swipeState.setId : null);
                      setSwipeState(null);
                    } : undefined}
                  >
                    <div
                      className="flex transition-transform duration-150 ease-out"
                      style={canSwipeDelete ? { transform: `translateX(${setSwipeOffset}px)` } : undefined}
                    >
                      <div
                        className={`flex-shrink-0 w-full rounded-2xl border transition-all duration-300 ${
                          isDone ? 'bg-zinc-900 border-zinc-800 opacity-60' : 'bg-zinc-900 border-zinc-700 shadow-lg'
                        }`}
                      >
                        <div className="flex items-stretch">
                          <button
                            type="button"
                            onClick={() => toggleSetComplete(block.id, set.id)}
                            className={`w-10 flex items-center justify-center border-r transition-colors flex-shrink-0 ${
                              isDone
                                ? 'bg-emerald-500/20 border-emerald-500/20 text-emerald-500'
                                : 'border-zinc-800 bg-zinc-800/50 text-zinc-500 hover:text-white'
                            }`}
                          >
                            {isDone ? <Check className="w-5 h-5" /> : <span className="text-xs font-medium">{set.order}</span>}
                          </button>
                          <div className="flex-1 grid grid-cols-3 divide-x divide-zinc-800 min-w-0">
                            <div className="relative p-2 sm:p-3">
                              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5 text-center">Вес</label>
                              <input
                                ref={(el) => (setInputRefs.current[`${set.id}-weight`] = el)}
                                type="number"
                                inputMode="decimal"
                                value={set.inputWeight}
                                onChange={(e) => updateSetInBlock(block.id, set.id, { inputWeight: e.target.value })}
                                onFocus={selectAllOnFocus}
                                placeholder={blockLastSnapshot ? String(blockLastSnapshot.weight) : '0'}
                                className={`w-full bg-transparent text-center font-bold text-xl sm:text-2xl focus:outline-none ${isDone ? 'text-zinc-500' : 'text-white'}`}
                              />
                            </div>
                            <div className="relative p-2 sm:p-3">
                              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5 text-center">Повт</label>
                              <input
                                type="number"
                                inputMode="numeric"
                                value={set.reps}
                                onChange={(e) => updateSetInBlock(block.id, set.id, { reps: e.target.value })}
                                onFocus={selectAllOnFocus}
                                placeholder={blockLastSnapshot ? String(blockLastSnapshot.reps) : '0'}
                                className={`w-full bg-transparent text-center font-bold text-xl sm:text-2xl focus:outline-none ${isDone ? 'text-zinc-500' : 'text-white'}`}
                              />
                            </div>
                            <div className="relative p-2 sm:p-3">
                              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5 text-center">Отдых</label>
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  value={set.restMin}
                                  onChange={(e) => updateSetInBlock(block.id, set.id, { restMin: e.target.value })}
                                  onFocus={selectAllOnFocus}
                                  className={`w-10 bg-transparent text-center font-bold text-xl sm:text-2xl focus:outline-none ${isDone ? 'text-zinc-500' : 'text-white'}`}
                                />
                                <span className="text-xs text-zinc-500">м</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {!isDone && (
                          <div className="bg-zinc-950/50 px-3 py-2 flex items-center gap-2 border-t border-zinc-800/50">
                            <span className="text-[10px] text-zinc-600 font-bold uppercase">RPE</span>
                            {[7, 8, 9, 10].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => updateSetInBlock(block.id, set.id, { rpe: String(val) })}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium transition-all ${
                                  set.rpe === String(val) ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                }`}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {block.sets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSetFromBlock(block.id, set.id)}
                          className="flex-shrink-0 w-20 flex items-center justify-center bg-red-600 hover:bg-red-500 text-white text-sm font-medium"
                          aria-label="Удалить подход"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addSetToBlock(block.id)}
                  className="flex-1 py-4 rounded-2xl border-2 border-dashed border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all flex items-center justify-center gap-2 font-medium"
                >
                  <Plus className="w-5 h-5" />
                  Добавить подход
                </button>
                {isFirstBlock && (
                  <button
                    type="button"
                    onClick={() => setAddSetPickerOpen(true)}
                    className="flex-shrink-0 px-4 py-4 rounded-2xl border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all flex items-center justify-center gap-1.5 font-medium text-sm"
                    title="Добавить упражнение в суперсет"
                  >
                    <Plus className="w-4 h-4" />
                    Суперсет
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Spacer for bottom button */}
        <div className="h-24" />
      </div>

      {/* 3. Bottom Action Bar (Fixed) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black to-transparent z-10">
        <button
          onClick={handleFinish}
          disabled={saving}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition-all rounded-2xl font-bold text-lg shadow-xl shadow-blue-900/20 text-white flex items-center justify-center gap-2"
        >
          {saving ? 'Сохранение...' : 'Завершить упражнение'}
        </button>
      </div>

      {/* History Modal (Simple Overlay) */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-30" onClick={() => setMenuOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 rounded-t-3xl z-40 p-6 space-y-4 border-t border-zinc-800 pb-10">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-xl">Меню</h3>
              <button onClick={() => setMenuOpen(false)}><X className="text-zinc-500" /></button>
            </div>

            <button
              onClick={() => { setHistoryOpen(true); setMenuOpen(false); }}
              className="w-full p-4 bg-zinc-800 rounded-xl flex items-center gap-3 hover:bg-zinc-700"
            >
              <History className="w-5 h-5 text-blue-400" />
              <span className="font-medium">История подходов</span>
            </button>

            {onEditExercise && (
              <button
                onClick={() => { onEditExercise(exercise); setMenuOpen(false); }}
                className="w-full p-4 bg-zinc-800 rounded-xl flex items-center gap-3 hover:bg-zinc-700"
              >
                <Pencil className="w-5 h-5 text-amber-400" />
                <span className="font-medium">Редактировать упражнение</span>
              </button>
            )}

            {onDeleteExercise && (
              <button
                onClick={() => {
                  if (window.confirm('Удалить упражнение «' + exercise.nameRu + '»? Логи подходов не удаляются.')) {
                    onDeleteExercise(exercise);
                    setMenuOpen(false);
                  }
                }}
                className="w-full p-4 bg-zinc-800 rounded-xl flex items-center gap-3 hover:bg-red-900/30 text-red-400"
              >
                <Trash2 className="w-5 h-5" />
                <span className="font-medium">Удалить упражнение</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Full Screen History View */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <header className="p-4 border-b border-zinc-800 flex items-center gap-3">
            <button onClick={() => setHistoryOpen(false)}><ChevronLeft /></button>
            <h2 className="font-bold">История</h2>
          </header>
          <div className="flex-1 overflow-auto p-4 no-scrollbar">
            {historyRows.map(row => (
              <div key={row.id} className="mb-3 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                <div className="flex justify-between text-sm text-zinc-400 mb-1">
                  <span>{new Date(row.createdAt).toLocaleDateString()}</span>
                  {row.oneRm != null && <span className="text-emerald-500">1RM: {Math.round(row.oneRm)}</span>}
                </div>
                <div className="text-xl font-bold text-white">
                  {row.weight} кг × {row.reps}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Выбор упражнения для нового блока (+ Сет) */}
      {addSetPickerOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <header className="p-4 border-b border-zinc-800 flex items-center gap-3">
            <button type="button" onClick={() => { setAddSetPickerOpen(false); setAddSetSearchQuery(''); setAddSetSearchResults([]); }}>
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="font-bold">Добавить в суперсет</h2>
          </header>
          <div className="p-4 border-b border-zinc-800">
            <div className="relative flex items-center gap-2">
              <Search className="absolute left-3 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={addSetSearchQuery}
                onChange={(e) => setAddSetSearchQuery(e.target.value)}
                placeholder="Поиск по названию..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {addSetSearching && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
              </div>
            )}
            {!addSetSearching && addSetSearchQuery.trim() && addSetSearchResults.length === 0 && (
              <p className="text-zinc-500 text-center py-6">Ничего не найдено</p>
            )}
            {!addSetSearching && addSetSearchResults.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => addBlock(ex)}
                className="w-full text-left p-4 rounded-xl bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-700 mb-2"
              >
                <span className="font-medium text-white">{ex.nameRu}</span>
                {ex.nameEn && <span className="text-zinc-500 text-sm ml-2">/{ex.nameEn}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
