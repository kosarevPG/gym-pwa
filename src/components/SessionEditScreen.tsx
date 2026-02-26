import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, Plus, Minus, Timer, Check, MoreHorizontal, ArrowUp, ArrowDown, Trash2, Unlink, Link2, X, Flag, Pencil, History } from 'lucide-react';
import {
  fetchLogsBySessionId,
  fetchAllExercises,
  updateTrainingLog,
  deleteTrainingLog,
  saveTrainingLogs,
  batchUpdateTrainingLogs,
  fetchLastExerciseSessionSetsForPrefill,
} from '../lib/api';
import type { TrainingLogRaw } from '../lib/api';
import { calcEffectiveLoadKg } from '../lib/metrics';
import type { Exercise } from '../types';

export interface SessionEditScreenProps {
  sessionId: string;
  sessionDate?: string;
  onBack: () => void;
  onSaved?: () => void;
  openAddExerciseOnMount?: boolean;
  onAddExerciseOpenConsumed?: () => void;
  onAfterAddExercise?: (exercise: Exercise) => void;
  onEditExercise?: (exercise: Exercise) => void;
  onOpenExerciseHistory?: (exercise: Exercise) => void;
  exerciseToAddOnMount?: Exercise | null;
  onExerciseAddedToSession?: () => void;
  /** Открыть экран «Упражнения» (категории/поиск/сетка) для выбора упражнения вместо модального списка. */
  onOpenExercisePicker?: () => void;
}

function restSecToMin(restS: number): string {
  if (restS <= 0) return '';
  const m = restS / 60;
  return m % 1 === 0 ? String(Math.round(m)) : m.toFixed(1);
}

function parseRestMin(value: string): number {
  const n = parseFloat(value.replace(',', '.')) || 0;
  return Math.round(n * 60);
}

function formatKg(n: number): string {
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

function buildRuns(rows: TrainingLogRaw[]) {
  const supersetExerciseIds = new Set<string>();
  const bySetGroupId = new Map<string, TrainingLogRaw[]>();
  rows.forEach((r) => {
    const gid = r.set_group_id;
    if (!bySetGroupId.has(gid)) bySetGroupId.set(gid, []);
    bySetGroupId.get(gid)!.push(r);
  });
  bySetGroupId.forEach((groupRows) => {
    const bySetNo = new Map<number, TrainingLogRaw[]>();
    groupRows.forEach((r) => {
      if (!bySetNo.has(r.set_no)) bySetNo.set(r.set_no, []);
      bySetNo.get(r.set_no)!.push(r);
    });
    bySetNo.forEach((setRows) => {
      const distinctExercises = new Set(setRows.map((r) => r.exercise_id));
      if (distinctExercises.size > 1) setRows.forEach((r) => supersetExerciseIds.add(r.exercise_id));
    });
  });

  const byExercise = new Map<string, TrainingLogRaw[]>();
  rows.forEach((r) => {
    if (!byExercise.has(r.exercise_id)) byExercise.set(r.exercise_id, []);
    byExercise.get(r.exercise_id)!.push(r);
  });

  const exerciseOrder = [...byExercise.keys()].sort((a, b) => {
    const orderA = byExercise.get(a)![0].exercise_order ?? 0;
    const orderB = byExercise.get(b)![0].exercise_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    const tsA = Math.min(...byExercise.get(a)!.map((r) => new Date(r.ts).getTime()));
    const tsB = Math.min(...byExercise.get(b)!.map((r) => new Date(r.ts).getTime()));
    return tsA - tsB;
  });

  const runs: { superset: boolean; exIds: string[] }[] = [];
  let current: { superset: boolean; exIds: string[] } | null = null;
  for (const exId of exerciseOrder) {
    const isSuperset = supersetExerciseIds.has(exId);
    // Нормальный режим: каждое обычное упражнение — отдельный ран.
    // Для суперсета группируем подряд идущие упражнения.
    if (!current || current.superset !== isSuperset || !isSuperset) {
      current = { superset: isSuperset, exIds: [exId] };
      runs.push(current);
    } else {
      current.exIds.push(exId);
    }
  }
  return { runs, byExercise };
}

export function SessionEditScreen({
  sessionId,
  sessionDate,
  onBack,
  onSaved,
  openAddExerciseOnMount,
  onAddExerciseOpenConsumed,
  onAfterAddExercise,
  onEditExercise,
  onOpenExerciseHistory,
  exerciseToAddOnMount,
  onExerciseAddedToSession,
  onOpenExercisePicker,
}: SessionEditScreenProps) {
  const [rows, setRows] = useState<TrainingLogRaw[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [addExerciseMode, setAddExerciseMode] = useState<'normal' | 'superset'>('normal');
  const didOpenAddExerciseOnMount = useRef(false);
  const addedExerciseIdOnMountRef = useRef<string | null>(null);

  const [restEndAt, setRestEndAt] = useState<number | null>(null);
  const [restRemainingMs, setRestRemainingMs] = useState(0);
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState<number | null>(null);
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState(0);

  const [doneSets, setDoneSets] = useState<Set<string>>(new Set());
  const [focusNewSetExerciseId, setFocusNewSetExerciseId] = useState<string | null>(null);

  const loadSession = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([fetchLogsBySessionId(sessionId), fetchAllExercises()]).then(([logList, exList]) => {
      setRows(logList);
      setExercises(exList);
      setLoading(false);

      const rowIds = new Set(logList.map((r) => r.id));
      setDoneSets((prev) => {
        const next = new Set<string>();
        prev.forEach((id) => {
          if (rowIds.has(id)) next.add(id);
        });

        if (sessionDate) {
          logList.forEach((r) => {
            const hasLoad = (r.effective_load ?? r.input_wt ?? 0) > 0;
            if (r.reps > 0 && hasLoad) next.add(r.id);
          });
        }

        return next;
      });
    });
  };

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  useEffect(() => {
    if (openAddExerciseOnMount && !loading && !didOpenAddExerciseOnMount.current && onAddExerciseOpenConsumed) {
      didOpenAddExerciseOnMount.current = true;
      setAddExerciseOpen(true);
      onAddExerciseOpenConsumed();
    }
  }, [openAddExerciseOnMount, loading, onAddExerciseOpenConsumed]);

  useEffect(() => {
    if (restEndAt === null) {
      setRestRemainingMs(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, restEndAt - Date.now());
      setRestRemainingMs(remaining);
      if (remaining <= 0) setRestEndAt(null);
    };
    tick();
    const interval = setInterval(tick, 50);
    return () => clearInterval(interval);
  }, [restEndAt]);

  useEffect(() => {
    if (!stopwatchStartedAt) {
      setStopwatchElapsedMs(0);
      return;
    }
    const tick = () => setStopwatchElapsedMs(Math.max(0, Date.now() - stopwatchStartedAt));
    tick();
    const interval = setInterval(tick, 50);
    return () => clearInterval(interval);
  }, [stopwatchStartedAt]);

  const exerciseMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const { runs, byExercise } = useMemo(() => buildRuns(rows), [rows]);

  const sessionHeader = useMemo(() => {
    if (rows.length === 0) return { date: sessionDate ?? '—', durationMin: 0, categoryNames: [] as string[] };
    const sorted = [...rows].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const durationMs = new Date(last.ts).getTime() - new Date(first.ts).getTime();
    const durationMin = Math.round(durationMs / 60000);
    const dateStr =
      sessionDate ??
      (() => {
        const d = new Date(first.ts);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
      })();
    return { date: dateStr, durationMin };
  }, [rows, sessionDate]);

  const handleToggleSetDone = (setId: string, restSec: number) => {
    setDoneSets((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) {
        next.delete(setId);
        setRestEndAt(null);
      } else {
        next.add(setId);
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
        if (restSec > 0) {
          setRestEndAt(Date.now() + restSec * 1000);
          setRestRemainingMs(restSec * 1000);
        }
      }
      return next;
    });
  };

  const handleUpdateSet = async (
    id: string,
    patch: { input_wt?: number; effective_load?: number; reps?: number; rest_seconds?: number }
  ) => {
    const row = rows.find((r) => r.id === id);
    const ex = row ? exerciseMap.get(row.exercise_id) : null;
    const inputWt = patch.input_wt ?? row?.input_wt ?? 0;
    const repsNum = patch.reps ?? row?.reps ?? 0;
    const type = ex?.weightType ?? 'standard';
    const multiplier = ex?.simultaneous ? 2 : 1;
    const effective =
      patch.effective_load !== undefined
        ? patch.effective_load
        : ex != null
          ? calcEffectiveLoadKg({ type, inputWt, bodyWt: row?.body_wt_snapshot ?? null, baseWt: ex.baseWeight ?? 0, multiplier })
          : inputWt;
    const isDraft = row?.completed_at == null;
    const finalizeDraft = isDraft && (patch.reps !== undefined || patch.input_wt !== undefined);
    const payload: Parameters<typeof updateTrainingLog>[1] = {
      ...patch,
      weight: effective,
      effective_load: effective,
      set_volume: effective * Math.max(0, repsNum),
      ...(finalizeDraft && { completed_at: new Date().toISOString() }),
    };

    const nowIso = finalizeDraft ? new Date().toISOString() : null;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          ...(patch.input_wt !== undefined && { input_wt: patch.input_wt }),
          ...(patch.effective_load !== undefined && { effective_load: patch.effective_load }),
          ...(patch.reps !== undefined && { reps: patch.reps }),
          ...(patch.rest_seconds !== undefined && { rest_s: patch.rest_seconds }),
          ...(nowIso && { completed_at: nowIso, ts: nowIso }),
          effective_load: effective,
        };
      })
    );

    const { error } = await updateTrainingLog(id, payload);
    if (error) {
      alert(error.message);
      loadSession(true);
      return;
    }
  };

  const handleDeleteSet = async (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    const { error } = await deleteTrainingLog(id);
    if (error) {
      alert(error.message);
      loadSession(true);
      return;
    }
    loadSession(true);
  };

  const handleAddSet = async (exerciseId: string, setGroupId: string, exerciseOrder: number) => {
    const sessionRows = rows.filter((r) => r.session_id === sessionId);
    const exerciseRows = sessionRows.filter((r) => r.exercise_id === exerciseId);
    // order_index в БД — канонический порядок внутри группы; на фронте отображается как set_no. Должен быть уникален в рамках (set_group_id, exercise_id), иначе один подход окажется в одном «сете» с другим и упражнение покажется суперсетом с самим собой.
    const maxOrderInGroup = exerciseRows.length ? Math.max(...exerciseRows.map((r) => r.set_no)) : 0;
    const nextOrderIndex = maxOrderInGroup + 1;
    const firstTs = sessionRows[0]?.ts ?? new Date().toISOString();

    let defaultWeight = 0;
    let defaultReps = 0;
    let defaultRest = 0;
    let defaultEffective = 0;

    if (exerciseRows.length > 0) {
      const lastSet = exerciseRows.reduce((prev, current) => (prev.set_no > current.set_no ? prev : current));
      defaultWeight = lastSet.input_wt ?? 0;
      defaultReps = lastSet.reps ?? 0;
      defaultRest = lastSet.rest_s ?? 0;
      defaultEffective = lastSet.effective_load ?? 0;
    }

    const { error } = await saveTrainingLogs([
      {
        session_id: sessionId,
        set_group_id: setGroupId,
        exercise_id: exerciseId,
        weight: defaultEffective,
        reps: defaultReps,
        order_index: nextOrderIndex,
        set_no: nextOrderIndex,
        exercise_order: exerciseOrder,
        input_wt: defaultWeight,
        effective_load: defaultEffective,
        rest_seconds: defaultRest,
        completed_at: firstTs,
      },
    ]);
    if (error) {
      alert(error.message);
      return;
    }
    setFocusNewSetExerciseId(exerciseId);
    loadSession(true);
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    const toDelete = rows.filter((r) => r.exercise_id === exerciseId && r.session_id === sessionId);
    setRows((prev) => prev.filter((r) => r.exercise_id !== exerciseId));
    setSaving(true);

    let hasError = false;
    for (const r of toDelete) {
      const { error } = await deleteTrainingLog(r.id);
      if (error) {
        alert(error.message);
        hasError = true;
        break;
      }
    }

    if (hasError) {
      setSaving(false);
      loadSession(true);
      return;
    }

    const remaining = rows.filter((r) => r.exercise_id !== exerciseId);
    const orderedExIds = [...new Set(remaining.map((r) => r.exercise_id))].sort((a, b) => {
      const orderA = remaining.find((r) => r.exercise_id === a)?.exercise_order ?? 0;
      const orderB = remaining.find((r) => r.exercise_id === b)?.exercise_order ?? 0;
      return orderA - orderB;
    });

    const updates: { id: string; payload: { exercise_order: number } }[] = [];
    remaining.forEach((r) => {
      const newOrder = orderedExIds.indexOf(r.exercise_id);
      if (newOrder >= 0 && r.exercise_order !== newOrder) {
        updates.push({ id: r.id, payload: { exercise_order: newOrder } });
      }
    });

    if (updates.length > 0) {
      const { error } = await batchUpdateTrainingLogs(updates);
      if (error) alert(error.message);
    }

    setSaving(false);
    loadSession(true);
    onSaved?.();
  };

  const handleAddExercise = async (exerciseId: string) => {
    const sessionRows = rows.filter((r) => r.session_id === sessionId);
    const maxOrder = sessionRows.length ? Math.max(...sessionRows.map((r) => r.exercise_order)) + 1 : 0;
    const newSetGroupId = crypto.randomUUID();
    const firstTs = sessionRows[0]?.ts ?? new Date().toISOString();

    const prefilledSets = await fetchLastExerciseSessionSetsForPrefill(exerciseId);
    const toInsert =
      prefilledSets.length > 0
        ? prefilledSets.map((set, i) => ({
            session_id: sessionId,
            set_group_id: newSetGroupId,
            exercise_id: exerciseId,
            weight: set.effective_load,
            reps: set.reps,
            order_index: i,
            set_no: i + 1,
            exercise_order: maxOrder,
            input_wt: set.input_wt,
            effective_load: set.effective_load,
            rest_seconds: set.rest_seconds,
            completed_at: firstTs,
          }))
        : [
            {
              session_id: sessionId,
              set_group_id: newSetGroupId,
              exercise_id: exerciseId,
              weight: 0,
              reps: 0,
              order_index: 0,
              set_no: 1,
              exercise_order: maxOrder,
              input_wt: 0,
              effective_load: 0,
              rest_seconds: 0,
              completed_at: null,
            },
          ];

    const { error } = await saveTrainingLogs(toInsert);
    if (error) {
      alert(error.message);
      return;
    }
    setAddExerciseOpen(false);
    setAddExerciseMode('normal');
    loadSession(true);
    const addedEx = exerciseMap.get(exerciseId);
    if (addedEx) onAfterAddExercise?.(addedEx);
  };

  useEffect(() => {
    if (!exerciseToAddOnMount) {
      addedExerciseIdOnMountRef.current = null;
      return;
    }
    if (loading) return;
    if (addedExerciseIdOnMountRef.current === exerciseToAddOnMount.id) return;
    addedExerciseIdOnMountRef.current = exerciseToAddOnMount.id;
    handleAddExercise(exerciseToAddOnMount.id).then(() => {
      onExerciseAddedToSession?.();
    });
  }, [exerciseToAddOnMount, loading]);

  const handleAddExerciseToSuperset = async (exerciseId: string) => {
    if (orderedExIds.length === 0) return;
    const afterExId = orderedExIds[orderedExIds.length - 1];
    const afterSets = byExercise.get(afterExId)!;
    const setGroupId = afterSets[0].set_group_id;
    const afterOrder = afterSets[0].exercise_order;
    const numSets = afterSets.length;
    const sessionRows = rows.filter((r) => r.session_id === sessionId);
    const firstTs = sessionRows[0]?.ts ?? new Date().toISOString();

    const prefilled = await fetchLastExerciseSessionSetsForPrefill(exerciseId);
    const toInsert = Array.from({ length: numSets }, (_, i) => {
      const set = i < prefilled.length ? prefilled[i] : prefilled[prefilled.length - 1] ?? { input_wt: 0, effective_load: 0, reps: 0, rest_seconds: 0 };
      return {
        session_id: sessionId,
        set_group_id: setGroupId,
        exercise_id: exerciseId,
        weight: set.effective_load,
        reps: set.reps,
        order_index: i,
        set_no: i + 1,
        exercise_order: afterOrder + 1,
        input_wt: set.input_wt,
        effective_load: set.effective_load,
        rest_seconds: set.rest_seconds,
        completed_at: firstTs,
      };
    });

    const shiftUpdates = rows
      .filter((r) => r.session_id === sessionId && r.exercise_order > afterOrder)
      .map((r) => ({ id: r.id, payload: { exercise_order: r.exercise_order + 1 } as { exercise_order: number } }));
    if (shiftUpdates.length > 0) {
      const { error: err } = await batchUpdateTrainingLogs(shiftUpdates);
      if (err) {
        alert(err.message);
        return;
      }
    }

    const { error } = await saveTrainingLogs(toInsert);
    if (error) {
      alert(error.message);
      return;
    }
    setAddExerciseOpen(false);
    setAddExerciseMode('normal');
    loadSession(true);
    const addedEx = exerciseMap.get(exerciseId);
    if (addedEx) onAfterAddExercise?.(addedEx);
  };

  const orderedExIds = useMemo(() => runs.flatMap((r) => r.exIds), [runs]);

  const applyExerciseOrder = async (newOrderedIds: string[]) => {
    const updates: { id: string; payload: { exercise_order: number } }[] = [];
    newOrderedIds.forEach((exId, idx) => {
      byExercise.get(exId)?.forEach((r) => updates.push({ id: r.id, payload: { exercise_order: idx } }));
    });
    if (updates.length === 0) return;
    const { error } = await batchUpdateTrainingLogs(updates);
    if (error) alert(error.message);
    else loadSession(true);
  };

  const handleMoveExerciseUp = async (exId: string) => {
    const idx = orderedExIds.indexOf(exId);
    if (idx <= 0) return;
    const newOrder = [...orderedExIds];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    await applyExerciseOrder(newOrder);
  };

  const handleMoveExerciseDown = async (exId: string) => {
    const idx = orderedExIds.indexOf(exId);
    if (idx < 0 || idx >= orderedExIds.length - 1) return;
    const newOrder = [...orderedExIds];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    await applyExerciseOrder(newOrder);
  };

  const handleMergeWithNext = async (runIdx: number) => {
    if (runIdx >= runs.length - 1) return;
    const runA = runs[runIdx];
    const runB = runs[runIdx + 1];
    const groupIdA = byExercise.get(runA.exIds[0])![0].set_group_id;
    const updates: { id: string; payload: { set_group_id: string; set_no: number } }[] = [];
    for (const exId of runB.exIds) {
      const sets = byExercise.get(exId)!.sort((a, b) => a.set_no - b.set_no);
      sets.forEach((r, i) => {
        updates.push({ id: r.id, payload: { set_group_id: groupIdA, set_no: i + 1 } });
      });
    }
    const { error } = await batchUpdateTrainingLogs(updates);
    if (error) alert(error.message);
    else loadSession(true);
  };

  const handleSplitFromSuperset = async (exId: string) => {
    const newGroupId = crypto.randomUUID();
    const toUpdate = rows.filter((r) => r.exercise_id === exId && r.session_id === sessionId);
    const updates = toUpdate.map((r) => ({ id: r.id, payload: { set_group_id: newGroupId } }));
    const { error } = await batchUpdateTrainingLogs(updates);
    if (error) alert(error.message);
    else loadSession(true);
  };

  const formatCountdownMs = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatElapsedMs = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const title = sessionDate ? `Редактирование ${sessionDate}` : 'Текущая тренировка';

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center">
        <main className="p-4">Загрузка…</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 pb-safe flex flex-col">
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors flex-shrink-0">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-base leading-tight break-words text-zinc-100">{title}</h1>
            {runs.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>{sessionHeader.durationMin} мин</span>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (restEndAt !== null && restRemainingMs > 0) {
              setRestEndAt(null);
              setRestRemainingMs(0);
              return;
            }
            if (stopwatchStartedAt !== null) {
              setStopwatchStartedAt(null);
              setStopwatchElapsedMs(0);
            } else {
              setStopwatchStartedAt(Date.now());
            }
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-sm font-medium transition-all ${
            restEndAt !== null && restRemainingMs > 0
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          <Timer className="w-4 h-4 flex-shrink-0" />
          <span>{restEndAt !== null && restRemainingMs > 0 ? formatCountdownMs(restRemainingMs) : formatElapsedMs(stopwatchElapsedMs)}</span>
        </button>
      </header>

      <main className="flex-1 px-3 sm:px-4 pt-4 space-y-6 max-w-lg mx-auto w-full">
        {runs.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">Пустая тренировка</div>
        ) : (
          runs.map((run, runIdx) => (
            <div key={run.superset ? `superset-${runIdx}` : `solo-${runIdx}`} className="relative">
              {run.superset && (
                <div className="absolute -left-1 top-2 bottom-2 w-0.5 bg-blue-500/50 rounded-full z-0" />
              )}

              <div className={run.superset ? 'pl-4 space-y-6' : 'space-y-6'}>
                {run.exIds.map((exId, idx) => {
                  const isLastInRun = idx === run.exIds.length - 1;
                  const hasNextRun = runIdx < runs.length - 1;
                  const canMerge = isLastInRun && hasNextRun;
                  return (
                    <ExerciseBlock
                      key={exId}
                      exerciseId={exId}
                      sets={byExercise.get(exId)!.sort((a, b) => a.set_no - b.set_no)}
                      exerciseMap={exerciseMap}
                      sessionId={sessionId}
                      focusNewSetExerciseId={focusNewSetExerciseId}
                      onClearFocusNewSet={() => setFocusNewSetExerciseId(null)}
                      onUpdateSet={handleUpdateSet}
                      onDeleteSet={handleDeleteSet}
                      onAddSet={handleAddSet}
                      onDeleteExercise={handleDeleteExercise}
                      onMoveUp={() => handleMoveExerciseUp(exId)}
                      onMoveDown={() => handleMoveExerciseDown(exId)}
                      onSplitFromSuperset={run.superset ? () => handleSplitFromSuperset(exId) : undefined}
                      onMergeWithNext={canMerge ? () => handleMergeWithNext(runIdx) : undefined}
                      canMoveUp={orderedExIds.indexOf(exId) > 0}
                      canMoveDown={orderedExIds.indexOf(exId) < orderedExIds.length - 1}
                      doneSets={doneSets}
                      onToggleSetDone={handleToggleSetDone}
                      onEditExercise={onEditExercise ? () => { const ex = exerciseMap.get(exId); if (ex) onEditExercise(ex); } : undefined}
                      onOpenHistory={onOpenExerciseHistory ? () => { const ex = exerciseMap.get(exId); if (ex) onOpenExerciseHistory(ex); } : undefined}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}

        <div className="flex gap-3 pb-20 pt-4">
          <button
            type="button"
            onClick={() => {
              if (onOpenExercisePicker) {
                setAddExerciseMode('normal');
                onOpenExercisePicker();
              } else {
                setAddExerciseMode('normal');
                setAddExerciseOpen(true);
              }
            }}
            className="flex-1 py-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Добавить упражнение
          </button>
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
          >
            <Flag className="w-5 h-5 fill-current" />
            Закончить
          </button>
        </div>
      </main>

      {addExerciseOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col pt-12 backdrop-blur-sm">
          <div className="px-4 pb-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              {addExerciseMode === 'superset' ? 'Добавить в суперсет' : 'Выбор упражнения'}
            </h2>
            <button type="button" onClick={() => { setAddExerciseOpen(false); setAddExerciseMode('normal'); }} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          {addExerciseMode === 'superset' && orderedExIds.length > 0 && (
            <p className="px-4 py-2 text-zinc-500 text-sm">
              После: {exerciseMap.get(orderedExIds[orderedExIds.length - 1])?.nameRu ?? ''}
            </p>
          )}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {exercises.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => addExerciseMode === 'superset' ? handleAddExerciseToSuperset(ex.id) : handleAddExercise(ex.id)}
                className="w-full text-left p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800 transition-all"
              >
                <div className="font-medium text-zinc-200">{ex.nameRu}</div>
                {ex.nameEn && <div className="text-xs text-zinc-500">{ex.nameEn}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Интерфейс соответствует передаваемым пропсам из SessionEditScreen
interface ExerciseBlockProps {
  exerciseId: string;
  sets: TrainingLogRaw[];
  exerciseMap: Map<string, Exercise>;
  sessionId: string;
  focusNewSetExerciseId: string | null;
  onClearFocusNewSet: () => void;
  onUpdateSet: (id: string, patch: { input_wt?: number; effective_load?: number; reps?: number; rest_seconds?: number }) => void;
  onDeleteSet: (id: string) => void;
  onAddSet: (exerciseId: string, setGroupId: string, exerciseOrder: number) => void;
  onDeleteExercise: (exerciseId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSplitFromSuperset?: () => void;
  onMergeWithNext?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  doneSets: Set<string>;
  onToggleSetDone: (setId: string, restSec: number) => void;
  onEditExercise?: () => void;
  onOpenHistory?: () => void;
}

function ExerciseBlock({
  exerciseId,
  sets,
  exerciseMap,
  sessionId,
  focusNewSetExerciseId,
  onClearFocusNewSet,
  onUpdateSet,
  onDeleteSet,
  onAddSet,
  onDeleteExercise,
  onMoveUp,
  onMoveDown,
  onSplitFromSuperset,
  onMergeWithNext,
  canMoveUp,
  canMoveDown,
  doneSets,
  onToggleSetDone,
  onEditExercise,
  onOpenHistory,
}: ExerciseBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const ex = exerciseMap.get(exerciseId);
  const nameRu = ex?.nameRu ?? exerciseId;
  const nameEn = ex?.nameEn ?? '';
  const setGroupId = sets[0]?.set_group_id ?? '';
  const exerciseOrder = sets[0]?.exercise_order ?? 0;

  const bestKg = sets.length
    ? Math.max(...sets.map((s) => (s.effective_load ?? s.input_wt ?? 0) || 0))
    : 0;

  const maxE1RM = sets.length
    ? Math.max(
        ...sets.map((s) => {
          const w = (s.effective_load ?? s.input_wt ?? 0) || 0;
          const r = s.reps || 0;
          return w > 0 && r > 0 ? Math.round(w * (1 + r / 30)) : 0;
        }),
      )
    : 0;

  const handleDeleteLastSet = () => {
    if (sets.length === 0) return;
    const lastSet = sets[sets.length - 1];
    onDeleteSet(lastSet.id);
  };

  if (isCollapsed) {
    return (
      <div
        onClick={() => setIsCollapsed(false)}
        className="flex items-center justify-between gap-3 px-4 py-4 bg-zinc-900 border border-zinc-800 rounded-2xl cursor-pointer hover:border-zinc-700 transition-all"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-emerald-500" />
          </div>
          <h3 className="font-semibold text-zinc-300 break-words">
            {nameRu}
            {nameEn && <span className="text-zinc-500 font-normal ml-1.5 text-sm">/ {nameEn}</span>}
          </h3>
        </div>
        <div className="text-zinc-500 text-sm font-medium bg-zinc-950 px-2 py-1 rounded-md border border-zinc-800 flex-shrink-0">
          {sets.length} подх.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 bg-zinc-900/50 p-2 sm:p-3 rounded-3xl border border-zinc-800/50">
      <div className="flex items-start justify-between gap-2 px-2 pt-1">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg text-zinc-100 break-words">
            {nameRu}
            {nameEn && (
              <span className="text-zinc-500 font-normal ml-2 text-sm">/ {nameEn}</span>
            )}
          </h3>
          {(bestKg > 0 || maxE1RM > 0) && (
            <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
              {bestKg > 0 && <span className="text-zinc-400">Max: {formatKg(bestKg)} кг</span>}
              {bestKg > 0 && maxE1RM > 0 && <span className="opacity-30">•</span>}
              {maxE1RM > 0 && <span className="text-blue-400/80">1RM: {formatKg(maxE1RM)} кг</span>}
            </p>
          )}
        </div>
        <div className="relative flex-shrink-0 pt-0.5">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="p-1.5 -mr-1.5 rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          >
            <MoreHorizontal className="w-6 h-6" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-40 py-1 overflow-hidden">
                {onOpenHistory && (
                  <button type="button" onClick={() => { onOpenHistory(); setMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 border-b border-zinc-800">
                    <History className="w-4 h-4 text-zinc-500" /> История
                  </button>
                )}
                {onEditExercise && (
                  <button type="button" onClick={() => { onEditExercise(); setMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 border-b border-zinc-800">
                    <Pencil className="w-4 h-4 text-zinc-500" /> Редактировать
                  </button>
                )}
                {canMoveUp && (
                  <button onClick={() => { onMoveUp(); setMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3">
                    <ArrowUp className="w-4 h-4 text-zinc-500" /> Выше
                  </button>
                )}
                {canMoveDown && (
                  <button onClick={() => { onMoveDown(); setMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 border-b border-zinc-800">
                    <ArrowDown className="w-4 h-4 text-zinc-500" /> Ниже
                  </button>
                )}
                {onSplitFromSuperset && (
                  <button onClick={() => { onSplitFromSuperset(); setMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 border-b border-zinc-800">
                    <Unlink className="w-4 h-4 text-blue-500" /> Разбить суперсет
                  </button>
                )}
                {onMergeWithNext && (
                  <button onClick={() => { onMergeWithNext(); setMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 border-b border-zinc-800">
                    <Link2 className="w-4 h-4 text-blue-500" /> В суперсет
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm('Удалить упражнение из тренировки?')) onDeleteExercise(exerciseId);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-900/10 flex items-center gap-3"
                >
                  <Trash2 className="w-4 h-4" /> Удалить
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="grid grid-cols-[24px_1fr_1fr_1fr_40px] gap-3 px-2 text-[10px] uppercase tracking-wider text-zinc-500 font-medium text-center pb-1">
          <div>№</div>
          <div>кг</div>
          <div>повт</div>
          <div>отд</div>
          <div><Check className="w-3 h-3 mx-auto" /></div>
        </div>

        {sets.map((row, index) => (
          <SetRow
            key={row.id}
            row={row}
            exercise={ex}
            setDisplayNo={index + 1}
            isDone={doneSets.has(row.id)}
            shouldFocus={focusNewSetExerciseId === exerciseId && index === sets.length - 1}
            onClearFocus={onClearFocusNewSet}
            onUpdate={(patch) => onUpdateSet(row.id, patch)}
            onToggleDone={() => onToggleSetDone(row.id, row.rest_s)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 pt-3 px-1">
        <div className="flex items-center bg-zinc-800 rounded-xl overflow-hidden h-12 border border-zinc-700/50">
          <button
            type="button"
            onClick={handleDeleteLastSet}
            disabled={sets.length === 0}
            className="w-12 h-full flex items-center justify-center text-zinc-400 hover:text-red-400 hover:bg-zinc-700 disabled:opacity-30 transition-colors"
            title="Удалить последний подход"
          >
            <Minus className="w-5 h-5" />
          </button>
          <div className="px-1 text-xs font-medium text-zinc-500 uppercase tracking-wide select-none">
            сет
          </div>
          <button
            type="button"
            onClick={() => onAddSet(exerciseId, setGroupId, exerciseOrder)}
            className="w-12 h-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
            title="Добавить подход"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (onSplitFromSuperset) onSplitFromSuperset();
            else if (onMergeWithNext) onMergeWithNext();
          }}
          disabled={!onSplitFromSuperset && !onMergeWithNext}
          className={`h-12 w-12 rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
            onSplitFromSuperset
              ? 'border-blue-500/60 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
              : onMergeWithNext
                ? 'border-zinc-700/50 bg-zinc-800 text-zinc-400 hover:border-blue-500/60 hover:text-blue-400'
                : 'border-zinc-700/50 bg-zinc-800/80 text-zinc-600 cursor-default'
          }`}
          title={
            onSplitFromSuperset
              ? 'Исключить из суперсета'
              : onMergeWithNext
                ? 'Добавить в суперсет'
                : 'Добавить в суперсет (добавьте следующее упражнение)'
          }
        >
          {onSplitFromSuperset ? <Unlink className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="flex-1 h-12 bg-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 border border-zinc-700/50 rounded-xl flex items-center justify-center gap-2 font-medium transition-all"
        >
          <Check className="w-5 h-5" />
          <span>Готово</span>
        </button>
      </div>
    </div>
  );
}

interface SetRowProps {
  row: TrainingLogRaw;
  exercise?: Exercise;
  setDisplayNo: number;
  isDone: boolean;
  shouldFocus?: boolean;
  onClearFocus?: () => void;
  onToggleDone: () => void;
  onUpdate: (patch: { input_wt?: number; effective_load?: number; reps?: number; rest_seconds?: number }) => void;
}

function SetRow({ row, exercise, setDisplayNo, isDone, shouldFocus, onClearFocus, onToggleDone, onUpdate }: SetRowProps) {
  const [weight, setWeight] = useState(row.input_wt ? String(row.input_wt) : '');
  const [reps, setReps] = useState(row.reps ? String(row.reps) : '');
  const [rest, setRest] = useState(restSecToMin(row.rest_s ?? 0));
  const weightRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (shouldFocus && weightRef.current && onClearFocus) {
      weightRef.current.focus();
      onClearFocus();
    }
  }, [shouldFocus, onClearFocus]);

  useEffect(() => {
    setWeight(row.input_wt ? String(row.input_wt) : '');
    setReps(row.reps ? String(row.reps) : '');
    setRest(restSecToMin(row.rest_s ?? 0));
  }, [row.input_wt, row.reps, row.rest_s]);

  const flush = () => {
    const inputWt = parseFloat(weight.replace(',', '.')) || 0;
    const repsNum = Math.floor(parseFloat(reps)) || 0;
    const restSec = parseRestMin(rest);
    if (inputWt !== row.input_wt || repsNum !== row.reps || restSec !== row.rest_s) {
      onUpdate({ input_wt: inputWt, reps: repsNum, rest_seconds: restSec });
    }
  };

  const baseInput = 'w-full bg-transparent text-center outline-none text-lg font-medium placeholder-zinc-700 transition-colors';
  const activeText = 'text-zinc-200';
  const doneText = 'text-zinc-600';

  const inputWtNum = parseFloat(weight.replace(',', '.')) || 0;
  const type = exercise?.weightType ?? 'standard';
  const multiplier = exercise?.simultaneous ? 2 : 1;
  const effectiveKg =
    exercise != null && inputWtNum > 0
      ? calcEffectiveLoadKg({
          type,
          inputWt: inputWtNum,
          bodyWt: row.body_wt_snapshot ?? null,
          baseWt: exercise.baseWeight ?? 0,
          multiplier,
        })
      : inputWtNum;
  const showEffective = inputWtNum > 0 && effectiveKg !== inputWtNum;

  return (
    <div className={`group grid grid-cols-[24px_1fr_1fr_1fr_40px] gap-3 items-center px-2 py-2 rounded-xl transition-colors ${isDone ? 'bg-zinc-900/50' : 'bg-transparent'}`}>
      <div className={`text-xs text-center font-medium ${isDone ? 'text-zinc-700' : 'text-zinc-500'}`}>
        {setDisplayNo}
      </div>

      <div className="relative flex flex-col justify-center h-full">
        <input
          ref={weightRef}
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={flush}
          onFocus={(e) => e.target.select()}
          placeholder="—"
          className={`${baseInput} ${showEffective ? 'pt-1 pb-4' : 'py-1.5'} ${isDone ? doneText : activeText}`}
        />
        {showEffective && (
          <div className="absolute bottom-1.5 left-0 right-0 text-center pointer-events-none">
            <span className="text-[10px] font-medium text-emerald-500/80">= {formatKg(effectiveKg)}</span>
          </div>
        )}
        <div className={`absolute bottom-0 left-2 right-2 h-px transition-colors ${isDone ? 'bg-transparent' : 'bg-zinc-800'}`} />
      </div>

      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={flush}
          onFocus={(e) => e.target.select()}
          placeholder="—"
          className={`${baseInput} py-1.5 ${isDone ? doneText : activeText}`}
        />
        <div className={`absolute bottom-0 left-2 right-2 h-px transition-colors ${isDone ? 'bg-transparent' : 'bg-zinc-800'}`} />
      </div>

      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={rest}
          onChange={(e) => setRest(e.target.value)}
          onBlur={flush}
          onFocus={(e) => e.target.select()}
          placeholder="—"
          className={`${baseInput} py-1.5 ${isDone ? doneText : activeText}`}
        />
        {rest && <span className={`absolute right-0 top-1.5 text-[9px] pointer-events-none ${isDone ? 'text-zinc-700' : 'text-zinc-600'}`}>м</span>}
        <div className={`absolute bottom-0 left-2 right-2 h-px transition-colors ${isDone ? 'bg-transparent' : 'bg-zinc-800'}`} />
      </div>

      <button
        type="button"
        onClick={() => onToggleDone()}
        className={`w-10 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
          isDone ? 'bg-emerald-500/10 text-emerald-600' : 'bg-zinc-800 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-400'
        }`}
      >
        <Check className="w-5 h-5" strokeWidth={isDone ? 3 : 2} />
      </button>
    </div>
  );
}
