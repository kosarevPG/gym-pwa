import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Trophy, Calendar, MoreVertical, Plus, Check, Timer, History, X, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import {
  saveTrainingLogs,
  fetchExerciseHistory,
  fetchLastExerciseSnapshot,
  fetchLastExerciseSessionSets,
  fetchPersonalBestWeight,
  fetchLatestBodyWeight,
  getWorkoutSessionById,
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

// Утилиты для расчетов
function getWeightType(ex: ExerciseType): WeightInputType {
  const nameOrEquipment = [ex.nameRu, ex.nameEn].filter(Boolean).join(' ') || undefined;
  return getWeightInputType(nameOrEquipment, ex.weightType ?? 'barbell');
}

/**
 * Рассчитывает итоговую эффективную нагрузку.
 * Принимает userBodyWeight для bodyweight/assisted; weightMultiplier для x2 при simultaneous (штанга/гантели/тренажёр и т.д.).
 */
function calcTotalKg(
  inputStr: string,
  weightType: WeightInputType,
  baseWeight?: number,
  userBodyWeight?: number,
  weightMultiplier?: number
): number | null {
  const input = parseFloat(inputStr);
  if (inputStr === '' || isNaN(input)) return null;
  const formula = WEIGHT_FORMULAS[weightType];
  const base = baseWeight ?? (weightType === 'barbell' ? 20 : 0);
  const mult =
    weightMultiplier ??
    (weightType === 'barbell' || weightType === 'plate_loaded' ? 2 : 1);
  return formula.toEffective(input, userBodyWeight, base, mult);
}

function formatEffectiveKg(kg: number): string {
  return kg % 1 === 0 ? String(Math.round(kg)) : kg.toFixed(1);
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

const DRAFT_KEY_PREFIX = 'gym-draft-';

type DraftBlock = { exerciseId: string; sets: Array<{ inputWeight: string; reps: string; restMin: string; rpe: string; completed: boolean; order: number; side: string }> };

function getDraftKey(sessionId: string, exerciseId: string): string {
  return `${DRAFT_KEY_PREFIX}${sessionId}-${exerciseId}`;
}

function saveDraftToStorage(sessionId: string, exerciseId: string, blocks: ExerciseBlock[]): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const data: { blocks: DraftBlock[] } = {
      blocks: blocks.map((b) => ({
        exerciseId: b.exercise.id,
        sets: b.sets.map((s) => ({
          inputWeight: s.inputWeight,
          reps: s.reps,
          restMin: s.restMin,
          rpe: s.rpe,
          completed: s.completed,
          order: s.order,
          side: String(s.side ?? 'both'),
        })),
      })),
    };
    sessionStorage.setItem(getDraftKey(sessionId, exerciseId), JSON.stringify(data));
  } catch (_) {}
}

function loadDraftFromStorage(sessionId: string, exerciseId: string): DraftBlock[] | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(getDraftKey(sessionId, exerciseId));
    if (!raw) return null;
    const data = JSON.parse(raw) as { blocks?: DraftBlock[] };
    if (!Array.isArray(data?.blocks) || data.blocks.length === 0) return null;
    return data.blocks;
  } catch (_) {
    return null;
  }
}

function clearDraftFromStorage(sessionId: string, exerciseId: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(getDraftKey(sessionId, exerciseId));
  } catch (_) {}
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

  const NOTE_STORAGE_KEY = `gym-exercise-note-${sessionId}-${exercise.id}`;
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [noteText, setNoteText] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(NOTE_STORAGE_KEY) ?? '' : '';
    } catch (_) {
      return '';
    }
  });
  const saveNote = useCallback((text: string) => {
    setNoteText(text);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(NOTE_STORAGE_KEY, text);
    } catch (_) {}
  }, [NOTE_STORAGE_KEY]);

  const selectAllOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  useEffect(() => {
    Promise.all([
      fetchLastExerciseSnapshot(exercise.id),
      fetchPersonalBestWeight(exercise.id),
      fetchLatestBodyWeight(),
    ]).then(([last, pb, bw]) => {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ExerciseDetailScreen.tsx:useEffect fetchLatestBodyWeight', message: 'bodyWeight loaded', data: { exerciseId: exercise.id, nameRu: exercise.nameRu, bodyWeight: bw }, timestamp: Date.now(), hypothesisId: 'H2' }) }).catch(() => {});
      // #endregion
      setLastSnapshot(last);
      setPersonalBest(pb);
      setBodyWeight(bw);
    });
    fetchExerciseHistory(exercise.id, 10).then(setHistoryRows);

    const draft = loadDraftFromStorage(sessionId, exercise.id);
    if (draft?.length) {
      setBlocks((prev) => {
        const first = prev[0];
        if (!first || first.exercise.id !== exercise.id) return prev;
        const draftFirst = draft[0];
        const sets: WorkoutSet[] = draftFirst.sets.map((s, i) => ({
          ...(first.sets[i] ?? createSetForExercise(first.exercise, i + 1)),
          inputWeight: s.inputWeight,
          reps: s.reps,
          restMin: s.restMin,
          rpe: s.rpe,
          completed: s.completed,
          order: s.order,
          side: (s.side as WorkoutSet['side']) ?? 'both',
        }));
        return [{ ...first, sets }, ...prev.slice(1)];
      });
    } else {
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
    }
  }, [sessionId, exercise.id]);

  const hasDraftData = useMemo(() => blocks.some((b) => b.sets.some((s) => s.completed || s.inputWeight || s.reps)), [blocks]);

  const saveDraftAndBack = useCallback(() => {
    if (hasDraftData) saveDraftToStorage(sessionId, exercise.id, blocks);
    onBack();
  }, [hasDraftData, sessionId, exercise.id, blocks, onBack]);

  useEffect(() => {
    return () => {
      if (hasDraftData) saveDraftToStorage(sessionId, exercise.id, blocks);
    };
  }, [sessionId, exercise.id, hasDraftData, blocks]);

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
    let baseStartedAt: string | null = null;
    try {
      const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`gym-backdated-${sessionId}`) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { startedAt?: string };
        baseStartedAt = parsed?.startedAt ?? null;
      }
    } catch (_) {}
    // Если sessionStorage пуст (перезаход в приложение) — берём дату сессии из БД, чтобы логи не уехали на «сегодня»
    if (!baseStartedAt) {
      const session = await getWorkoutSessionById(sessionId);
      if (session) baseStartedAt = session.started_at;
    }
    const logs: Parameters<typeof saveTrainingLogs>[0] = [];
    let logOrderOffset = 0;
    for (let round = 1; round <= maxRounds; round++) {
      const orderIndex = round;
      blocks.forEach((block, blockIndex) => {
        const s = block.sets[round - 1];
        if (!s || (!s.completed && !s.inputWeight && !s.reps)) return;
        const wtType = getWeightType(block.exercise);
        const logWeightMult =
          (wtType === 'barbell' ||
            wtType === 'plate_loaded' ||
            wtType === 'dumbbell' ||
            wtType === 'machine' ||
            wtType === 'standard') &&
          block.exercise.simultaneous
            ? 2
            : undefined;
        const totalKg = calcTotalKg(s.inputWeight, wtType, block.exercise.baseWeight, bodyWeight ?? undefined, logWeightMult) ?? 0;
        const rps = parseInt(s.reps) || 0;
        let completedAt: string;
        if (baseStartedAt) {
          const baseMs = new Date(baseStartedAt).getTime();
          completedAt = new Date(baseMs + logOrderOffset * 60 * 1000).toISOString();
          logOrderOffset += 1;
        } else {
          completedAt = s.doneAt ?? new Date().toISOString();
        }
        logs.push({
          session_id: sessionId,
          set_group_id: saveGroupId,
          exercise_id: block.exercise.id,
          weight: totalKg,
          reps: rps,
          order_index: orderIndex,
          exercise_order: blockIndex,
          input_wt: parseFloat(s.inputWeight) || 0,
          effective_load: totalKg,
          side: s.side ?? 'both',
          body_wt_snapshot: bodyWeight ?? undefined,
          set_volume: totalKg * rps,
          rpe: s.rpe ? parseFloat(s.rpe) : undefined,
          rest_seconds: (parseFloat(s.restMin) || 0) * 60,
          completed_at: completedAt,
        });
      });
    }

    // #region agent log
    if (logs.length > 0) fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ExerciseDetailScreen.tsx:handleFinish', message: 'saving logs', data: { sessionId, firstCompletedAt: logs[0].completed_at, logsCount: logs.length }, timestamp: Date.now(), hypothesisId: 'H4' }) }).catch(() => {});
    // #endregion
    const { error: saveErr } = await saveTrainingLogs(logs);
    setSaving(false);
    if (saveErr) {
      alert(saveErr.message || 'Не удалось сохранить подходы. Проверьте сеть и попробуйте снова.');
      return;
    }
    clearDraftFromStorage(sessionId, exercise.id);
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
          <button onClick={saveDraftAndBack} className="p-2 -ml-2 rounded-full hover:bg-zinc-800 transition-colors flex-shrink-0">
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
          const weightType = getWeightType(block.exercise);

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

                // Расчет эффективной нагрузки для отображения (x2 при simultaneous: штанга, гантели, тренажёр и т.д.)
                const weightMult =
                  (weightType === 'barbell' ||
                    weightType === 'plate_loaded' ||
                    weightType === 'dumbbell' ||
                    weightType === 'machine' ||
                    weightType === 'standard') &&
                  block.exercise.simultaneous
                    ? 2
                    : undefined;
                const effectiveKg = calcTotalKg(
                  set.inputWeight,
                  weightType,
                  block.exercise.baseWeight,
                  bodyWeight ?? undefined,
                  weightMult
                );
                // #region agent log
                if (block.exercise.nameRu?.toLowerCase().includes('гравитрон') || weightType === 'assisted') {
                  fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ExerciseDetailScreen.tsx:effectiveKg', message: 'gravitron/assisted effective calc', data: { nameRu: block.exercise.nameRu, apiWeightType: block.exercise.weightType, resolvedWeightType: weightType, bodyWeight, inputStr: set.inputWeight, baseWeight: block.exercise.baseWeight, effectiveKg }, timestamp: Date.now(), hypothesisId: 'H1,H3,H4,H5' }) }).catch(() => {});
                }
                // #endregion

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
                          <div className="flex-1 grid grid-cols-3 divide-x divide-zinc-800 min-w-0 items-stretch">
                            <div className="relative p-2 sm:p-3 flex flex-col min-h-0">
                              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5 text-center shrink-0">Вес</label>
                              <div className="flex items-center justify-center min-h-[2.5rem]">
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
                              {effectiveKg !== null && !isNaN(effectiveKg) && (
                                <div className="text-[10px] text-zinc-500 text-center mt-0.5 font-mono leading-none shrink-0">
                                  ≈{formatEffectiveKg(effectiveKg)} кг
                                </div>
                              )}
                            </div>
                            <div className="relative p-2 sm:p-3 flex flex-col min-h-0">
                              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5 text-center shrink-0">Повт</label>
                              <div className="flex items-center justify-center min-h-[2.5rem]">
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
                            </div>
                            <div className="relative p-2 sm:p-3 flex flex-col min-h-0">
                              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5 text-center shrink-0">Отдых</label>
                              <div className="flex items-center justify-center gap-1 min-h-[2.5rem]">
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

        {/* Заметка: сворачивается/разворачивается, сохраняется в localStorage */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <button
            type="button"
            onClick={() => setNoteExpanded((e) => !e)}
            className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-zinc-800/50 transition-colors"
          >
            <span className="text-sm font-medium text-zinc-300">Заметка</span>
            {noteExpanded ? (
              <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
            )}
          </button>
          {noteExpanded && (
            <div className="border-t border-zinc-800 px-4 pb-4 pt-2">
              <textarea
                value={noteText}
                onChange={(e) => saveNote(e.target.value)}
                onBlur={(e) => saveNote(e.target.value)}
                placeholder="Текст заметки к упражнению..."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y min-h-[80px]"
              />
            </div>
          )}
        </section>

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

      {/* Full Screen History View: по дате тренировки, внутри — подходы (вес × повторения · отдых) */}
      {historyOpen && (() => {
        const byDate = new Map<string, ExerciseHistoryRow[]>();
        historyRows.forEach((row) => {
          const dateStr = new Date(row.createdAt).toISOString().slice(0, 10).replace(/-/g, '.');
          if (!byDate.has(dateStr)) byDate.set(dateStr, []);
          byDate.get(dateStr)!.push(row);
        });
        const sortedDates = Array.from(byDate.keys()).sort(
          (a, b) => new Date(b.replace(/\./g, '-')).getTime() - new Date(a.replace(/\./g, '-')).getTime()
        );
        const formatRest = (sec?: number) => {
          if (sec == null || sec <= 0) return '0м';
          const m = Math.round(sec / 60);
          return m >= 60 ? `${Math.floor(m / 60)}ч ${m % 60}м` : `${m}м`;
        };
        return (
          <div className="fixed inset-0 z-50 bg-black flex flex-col">
            <header className="p-4 border-b border-zinc-800 flex items-center gap-3">
              <button onClick={() => setHistoryOpen(false)}><ChevronLeft /></button>
              <h2 className="font-bold">История</h2>
            </header>
            <div className="flex-1 overflow-auto p-4 no-scrollbar">
              {sortedDates.map((dateStr) => (
                <div key={dateStr} className="mb-4">
                  <div className="text-sm font-semibold text-zinc-400 mb-2 px-1">{dateStr}</div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                    {(byDate.get(dateStr) ?? []).map((row) => (
                      <div
                        key={row.id}
                        className="px-3 py-2.5 border-b border-zinc-800/50 last:border-b-0 flex items-center justify-between gap-2"
                      >
                        <span className="font-medium text-white">
                          {row.weight} кг × {row.reps}
                        </span>
                        <span className="text-zinc-500 text-sm">
                          отдых {formatRest(row.restSeconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
