import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, Plus, Minus, Timer, Check, MoreHorizontal, ArrowUp, ArrowDown, Trash2, Unlink, Link2, Play, X } from 'lucide-react';
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
      if (setRows.length > 1) setRows.forEach((r) => supersetExerciseIds.add(r.exercise_id));
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
    if (current && current.superset === isSuperset) {
      current.exIds.push(exId);
    } else {
      current = { superset: isSuperset, exIds: [exId] };
      runs.push(current);
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
}: SessionEditScreenProps) {
  const [rows, setRows] = useState<TrainingLogRaw[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  /** 'superset' = следующий выбранный упражнение добавится в суперсет с последним */
  const [addExerciseMode, setAddExerciseMode] = useState<'normal' | 'superset'>('normal');
  const didOpenAddExerciseOnMount = useRef(false);

  const [restEndAt, setRestEndAt] = useState<number | null>(null);
  const [restRemainingMs, setRestRemainingMs] = useState(0);
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState<number | null>(null);
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState(0);

  const [doneSets, setDoneSets] = useState<Set<string>>(new Set());
  /** После добавления подхода — фокус на поле «Вес» нового сета этого упражнения */
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
        // сохраняем только те галочки, для которых ещё есть строки
        prev.forEach((id) => {
          if (rowIds.has(id)) next.add(id);
        });

        // для прошедших тренировок (есть дата) можно автопометить «сделанными» старые подходы
        if (sessionDate) {
          logList.forEach((r) => {
            const hasLoad = (r.effective_load ?? r.input_wt ?? 0) > 0;
            if (r.reps > 0 && hasLoad) next.add(r.id);
          });
        }

        return next;
      });

      // #region agent log
      if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionEditScreen.tsx:loadSession',message:'session state set',data:{sessionId,rowsCount:logList.length},timestamp:Date.now(),hypothesisId:'H1,H5'})}).catch(()=>{});
      // #endregion
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
          ? calcEffectiveLoadKg({
              type,
              inputWt,
              bodyWt: row?.body_wt_snapshot ?? null,
              baseWt: ex.baseWeight ?? 0,
              multiplier,
            })
          : inputWt;
    const payload: Parameters<typeof updateTrainingLog>[1] = {
      ...patch,
      weight: effective,
      effective_load: effective,
      set_volume: effective * Math.max(0, repsNum),
    };

    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          ...(patch.input_wt !== undefined && { input_wt: patch.input_wt }),
          ...(patch.effective_load !== undefined && { effective_load: patch.effective_load }),
          ...(patch.reps !== undefined && { reps: patch.reps }),
          ...(patch.rest_seconds !== undefined && { rest_s: patch.rest_seconds }),
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
    const maxSetNo = exerciseRows.length ? Math.max(...exerciseRows.map((r) => r.set_no)) + 1 : 1;
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
        order_index: maxSetNo - 1,
        set_no: maxSetNo,
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
              completed_at: firstTs,
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

  /** Добавить упражнение следующим в суперсет (после последнего в списке). */
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
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}:${hundredths.toString().padStart(2, '0')}`;
  };

  const formatElapsedMs = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}:${hundredths.toString().padStart(2, '0')}`;
  };

  const title = sessionDate ? `Редактирование ${sessionDate}` : 'Текущая тренировка';

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <main className="p-4 text-zinc-400">Загрузка…</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-safe flex flex-col">
      <header className="sticky top-0 z-20 bg-black/95 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors flex-shrink-0">
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
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : stopwatchStartedAt !== null || stopwatchElapsedMs > 0
                ? 'bg-white/10 text-white border border-white/10'
                : 'bg-white/5 border border-white/10 text-zinc-400 hover:text-zinc-300'
          }`}
        >
          <Timer className="w-4 h-4 flex-shrink-0" />
          <span>{restEndAt !== null && restRemainingMs > 0 ? formatCountdownMs(restRemainingMs) : formatElapsedMs(stopwatchElapsedMs)}</span>
        </button>
      </header>

      <main className="flex-1 px-4 pt-4 pb-32 space-y-6 max-w-lg mx-auto w-full">
        {runs.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">Тренировка пуста.</div>
        ) : (
          runs.map((run, runIdx) => (
            <div key={run.superset ? `superset-${runIdx}` : `solo-${runIdx}`} className="relative">
              {run.superset && (
                <div className="absolute -left-1 top-2 bottom-2 w-0.5 bg-blue-500/50 rounded-full z-0" />
              )}

              <div className={run.superset ? 'pl-4 space-y-8' : 'space-y-8'}>
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
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => { setAddExerciseMode('normal'); setAddExerciseOpen(true); }}
            className="flex-1 py-3.5 rounded-xl border-2 border-dashed border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-300 font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Добавить упражнение
          </button>
          {orderedExIds.length > 0 && (
            <button
              type="button"
              onClick={() => { setAddExerciseMode('superset'); setAddExerciseOpen(true); }}
              className="flex-1 py-3.5 rounded-xl border border-blue-500/40 text-blue-400/90 hover:bg-blue-500/10 font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Link2 className="w-5 h-5" />
              Добавить в суперсет
            </button>
          )}
        </div>
      </main>

      {addExerciseOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-end p-4"
          onClick={() => { setAddExerciseOpen(false); setAddExerciseMode('normal'); }}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] bg-zinc-900 rounded-t-3xl p-4 shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-2 text-center">
              {addExerciseMode === 'superset' ? 'Добавить следующим в суперсет' : 'Выберите упражнение'}
            </h2>
            {addExerciseMode === 'superset' && orderedExIds.length > 0 && (
              <p className="text-zinc-500 text-sm text-center mb-4">
                После: {exerciseMap.get(orderedExIds[orderedExIds.length - 1])?.nameRu ?? ''}
              </p>
            )}
            <div className="overflow-y-auto flex-1 space-y-1">
              {exercises.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => addExerciseMode === 'superset' ? handleAddExerciseToSuperset(ex.id) : handleAddExercise(ex.id)}
                  className="w-full text-left px-4 py-4 rounded-2xl hover:bg-zinc-800 transition-colors flex items-center gap-3 border border-transparent hover:border-zinc-700"
                >
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Play className="w-5 h-5 text-zinc-400 ml-1" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white">{ex.nameRu}</div>
                    {ex.nameEn && <div className="text-zinc-500 text-xs truncate">{ex.nameEn}</div>}
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setAddExerciseOpen(false); setAddExerciseMode('normal'); }}
              className="mt-4 py-4 rounded-2xl bg-zinc-800 text-white font-bold w-full"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
}: ExerciseBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const ex = exerciseMap.get(exerciseId);
  const nameRu = ex?.nameRu ?? exerciseId;
  const nameEn = ex?.nameEn ?? '';
  const setGroupId = sets[0]?.set_group_id ?? '';
  const exerciseOrder = sets[0]?.exercise_order ?? 0;

  const handleDeleteLastSet = () => {
    if (sets.length === 0) return;
    const lastSet = sets[sets.length - 1];
    onDeleteSet(lastSet.id);
  };

  if (isCollapsed) {
    return (
      <div
        onClick={() => setIsCollapsed(false)}
        className="flex items-center justify-between px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl cursor-pointer hover:bg-emerald-500/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Check className="w-5 h-5 text-emerald-500" />
          <h3 className="font-semibold text-zinc-300">{nameRu}</h3>
        </div>
        <div className="text-zinc-500 text-sm font-medium">
          {sets.length} подходов
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-6 border-b border-white/5 last:border-b-0">
      <div className="flex items-center justify-between px-1">
        <div className="min-w-0 flex-1 pr-2">
          <h3 className="font-bold text-base text-zinc-100 leading-tight">{nameRu}</h3>
          {nameEn && <div className="text-zinc-500 text-sm truncate mt-0.5">{nameEn}</div>}
        </div>
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="p-1.5 -mr-1.5 rounded-lg text-zinc-500 hover:bg-white/10 hover:text-white transition-colors"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-40 py-1 overflow-hidden">
                {canMoveUp && (
                  <button onClick={() => { onMoveUp(); setMenuOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 flex items-center gap-3">
                    <ArrowUp className="w-4 h-4 text-zinc-400" /> Выше
                  </button>
                )}
                {canMoveDown && (
                  <button onClick={() => { onMoveDown(); setMenuOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 flex items-center gap-3 border-b border-white/5">
                    <ArrowDown className="w-4 h-4 text-zinc-400" /> Ниже
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm('Удалить упражнение из тренировки?')) onDeleteExercise(exerciseId);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-3"
                >
                  <Trash2 className="w-4 h-4" /> Удалить упражнение
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="grid grid-cols-[24px_1fr_1fr_1fr_40px] gap-3 px-2 text-[10px] uppercase tracking-wider text-zinc-500 font-medium text-center">
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
            setDisplayNo={index + 1}
            isDone={doneSets.has(row.id)}
            shouldFocus={focusNewSetExerciseId === exerciseId && index === sets.length - 1}
            onClearFocus={onClearFocusNewSet}
            onUpdate={(patch) => onUpdateSet(row.id, patch)}
            onToggleDone={() => onToggleSetDone(row.id, row.rest_s)}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2 px-1">
        <button
          type="button"
          onClick={handleDeleteLastSet}
          disabled={sets.length === 0}
          className="w-[3.25rem] h-11 bg-zinc-900/50 text-red-400 hover:bg-red-500/20 border border-zinc-800/80 rounded-xl flex items-center justify-center transition-colors disabled:opacity-30"
          title="Удалить последний подход"
        >
          <Minus className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => onAddSet(exerciseId, setGroupId, exerciseOrder)}
          className="w-[3.25rem] h-11 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 rounded-xl flex items-center justify-center transition-colors"
          title="Добавить подход"
        >
          <Plus className="w-5 h-5" />
        </button>

        {onSplitFromSuperset ? (
          <button
            type="button"
            onClick={onSplitFromSuperset}
            className="w-[3.25rem] h-11 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl flex items-center justify-center transition-colors"
            title="Убрать из суперсета"
          >
            <Unlink className="w-4 h-4" />
          </button>
        ) : onMergeWithNext ? (
          <button
            type="button"
            onClick={onMergeWithNext}
            className="w-[3.25rem] h-11 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-zinc-800/80 rounded-xl flex items-center justify-center transition-colors"
            title="Объединить в суперсет со следующим"
          >
            <Link2 className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-[3.25rem] h-11 bg-zinc-900/20 text-zinc-600 border border-zinc-800/30 rounded-xl flex items-center justify-center pointer-events-none">
            <Link2 className="w-4 h-4 opacity-50" />
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="flex-1 h-11 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl flex items-center justify-center gap-2 font-medium transition-colors"
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
  setDisplayNo: number;
  isDone: boolean;
  shouldFocus?: boolean;
  onClearFocus?: () => void;
  onToggleDone: () => void;
  onUpdate: (patch: { input_wt?: number; effective_load?: number; reps?: number; rest_seconds?: number }) => void;
}

function SetRow({ row, setDisplayNo, isDone, shouldFocus, onClearFocus, onToggleDone, onUpdate }: SetRowProps) {
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

  const baseInput = 'w-full bg-transparent text-center outline-none text-base font-medium placeholder-zinc-600 transition-colors py-1.5';
  const activeText = 'text-white';
  const doneText = 'text-zinc-500';

  return (
    <div className={`group grid grid-cols-[24px_1fr_1fr_1fr_40px] gap-3 items-center px-2 py-1.5 rounded-xl transition-colors ${isDone ? 'bg-zinc-900/30' : ''}`}>
      <div className={`text-xs text-center font-medium ${isDone ? 'text-zinc-600' : 'text-zinc-400'}`}>
        {setDisplayNo}
      </div>

      <div className="relative">
        <input
          ref={weightRef}
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={flush}
          onFocus={(e) => e.target.select()}
          placeholder="—"
          className={`${baseInput} ${isDone ? doneText : activeText}`}
        />
        <div className="absolute bottom-0 left-2 right-2 h-px bg-zinc-800 transition-colors" />
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
          className={`${baseInput} ${isDone ? doneText : activeText}`}
        />
        <div className="absolute bottom-0 left-2 right-2 h-px bg-zinc-800 transition-colors" />
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
          className={`${baseInput} ${isDone ? doneText : activeText}`}
        />
        {rest && <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[9px] text-zinc-600 pointer-events-none">м</span>}
        <div className="absolute bottom-0 left-2 right-2 h-px bg-zinc-800 transition-colors" />
      </div>

      <button
        type="button"
        onClick={() => onToggleDone()}
        className={`w-10 h-8 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
          isDone ? 'bg-emerald-500/20 text-emerald-500' : 'bg-zinc-800/50 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400'
        }`}
      >
        <Check className="w-5 h-5" strokeWidth={isDone ? 3 : 2} />
      </button>
    </div>
  );
}
