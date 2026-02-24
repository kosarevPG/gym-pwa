import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, Plus, Timer, Check, MoreHorizontal, ArrowUp, ArrowDown, Trash2, Unlink, Link2, Play } from 'lucide-react';
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
  const didOpenAddExerciseOnMount = useRef(false);

  const [restEndAt, setRestEndAt] = useState<number | null>(null);
  const [restRemainingMs, setRestRemainingMs] = useState(0);
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState<number | null>(null);
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState(0);

  const [doneSets, setDoneSets] = useState<Set<string>>(new Set());

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
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-zinc-800 transition-colors flex-shrink-0">
            <ChevronLeft className="w-6 h-6 text-zinc-300" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-lg leading-tight break-words">{title}</h1>
            {runs.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>{sessionHeader.durationMin} мин</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            className={`flex items-center gap-2 px-3 py-2 rounded-xl font-mono text-base font-semibold transition-all min-w-[5rem] justify-center ${
              restEndAt !== null && restRemainingMs > 0
                ? 'bg-emerald-600/80 text-white border-2 border-emerald-400 shadow-lg shadow-emerald-900/40'
                : stopwatchStartedAt !== null || stopwatchElapsedMs > 0
                  ? 'bg-emerald-600/70 text-white border border-emerald-500/50'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-600 hover:bg-zinc-700 hover:text-zinc-300'
            }`}
          >
            <Timer className="w-5 h-5 flex-shrink-0" />
            <span>{restEndAt !== null && restRemainingMs > 0 ? formatCountdownMs(restRemainingMs) : formatElapsedMs(stopwatchElapsedMs)}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-2 sm:p-4 space-y-4 max-w-lg mx-auto w-full">
        {runs.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-zinc-500 mb-4">Тренировка пуста.</p>
          </div>
        ) : (
          runs.map((run, runIdx) => (
            <div key={run.superset ? `superset-${runIdx}` : `solo-${runIdx}`} className="relative">
              {run.superset && (
                <div className="absolute left-2 sm:left-3 top-8 bottom-8 w-1 bg-blue-500 rounded-full z-0" />
              )}

              <div className={run.superset ? 'pl-5 sm:pl-7 space-y-4' : 'space-y-4'}>
                {run.exIds.map((exId) => (
                  <ExerciseBlock
                    key={exId}
                    exerciseId={exId}
                    sets={byExercise.get(exId)!.sort((a, b) => a.set_no - b.set_no)}
                    exerciseMap={exerciseMap}
                    sessionId={sessionId}
                    onUpdateSet={handleUpdateSet}
                    onDeleteSet={handleDeleteSet}
                    onAddSet={handleAddSet}
                    onDeleteExercise={handleDeleteExercise}
                    onMoveUp={() => handleMoveExerciseUp(exId)}
                    onMoveDown={() => handleMoveExerciseDown(exId)}
                    onSplitFromSuperset={run.superset ? () => handleSplitFromSuperset(exId) : undefined}
                    onMergeWithNext={!run.superset && runIdx < runs.length - 1 ? () => handleMergeWithNext(runIdx) : undefined}
                    canMoveUp={orderedExIds.indexOf(exId) > 0}
                    canMoveDown={orderedExIds.indexOf(exId) < orderedExIds.length - 1}
                    doneSets={doneSets}
                    onToggleSetDone={handleToggleSetDone}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        <button
          type="button"
          onClick={() => setAddExerciseOpen(true)}
          className="w-full py-4 rounded-2xl bg-zinc-800/50 text-blue-400 font-bold text-lg hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 mb-20"
        >
          <Plus className="w-6 h-6" />
          Добавить упражнение
        </button>
      </main>

      {addExerciseOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-end p-4"
          onClick={() => setAddExerciseOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] bg-zinc-900 rounded-t-3xl p-4 shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4 text-center">Выберите упражнение</h2>
            <div className="overflow-y-auto flex-1 space-y-1">
              {exercises.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => handleAddExercise(ex.id)}
                  className="w-full text-left px-4 py-4 rounded-2xl hover:bg-zinc-800 transition-colors flex items-center gap-3 border border-transparent hover:border-zinc-700"
                >
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Play className="w-5 h-5 text-zinc-400 ml-1" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">{ex.nameRu}</div>
                    {ex.nameEn && <div className="text-zinc-500 text-xs">{ex.nameEn}</div>}
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAddExerciseOpen(false)}
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
  const [menuOpen, setMenuOpen] = useState(false);
  const ex = exerciseMap.get(exerciseId);
  const nameRu = ex?.nameRu ?? exerciseId;
  const setGroupId = sets[0]?.set_group_id ?? '';
  const exerciseOrder = sets[0]?.exercise_order ?? 0;

  return (
    <div className="bg-zinc-900 rounded-2xl shadow-xl border border-zinc-800/80 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/30 border-b border-zinc-800/50">
        <h2 className="font-bold text-lg text-white truncate pr-4">{nameRu}</h2>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="p-1.5 -mr-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          >
            <MoreHorizontal className="w-6 h-6" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-40 py-1 overflow-hidden">
                {canMoveUp && (
                  <button onClick={() => { onMoveUp(); setMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white hover:bg-zinc-700 flex items-center gap-3">
                    <ArrowUp className="w-4 h-4 text-zinc-400" /> Переместить выше
                  </button>
                )}
                {canMoveDown && (
                  <button onClick={() => { onMoveDown(); setMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white hover:bg-zinc-700 flex items-center gap-3 border-b border-zinc-700/50">
                    <ArrowDown className="w-4 h-4 text-zinc-400" /> Переместить ниже
                  </button>
                )}
                {onSplitFromSuperset && (
                  <button onClick={() => { onSplitFromSuperset(); setMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white hover:bg-zinc-700 flex items-center gap-3 border-b border-zinc-700/50">
                    <Unlink className="w-4 h-4 text-blue-400" /> Убрать из суперсета
                  </button>
                )}
                {onMergeWithNext && (
                  <button onClick={() => { onMergeWithNext(); setMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white hover:bg-zinc-700 flex items-center gap-3 border-b border-zinc-700/50">
                    <Link2 className="w-4 h-4 text-blue-400" /> В суперсет со след.
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm('Удалить упражнение из тренировки?')) onDeleteExercise(exerciseId);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-900/30 flex items-center gap-3"
                >
                  <Trash2 className="w-4 h-4" /> Удалить упражнение
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[28px_1fr_1fr_1fr_44px] gap-2 px-3 py-2 text-[11px] font-semibold text-zinc-500 text-center uppercase tracking-wider">
        <div>Сет</div>
        <div>кг</div>
        <div>Повт</div>
        <div>Отдых</div>
        <div><Check className="w-4 h-4 mx-auto" /></div>
      </div>

      <div className="px-2 pb-3 space-y-1.5">
        {sets.map((row) => (
          <SetRowEdit
            key={row.id}
            row={row}
            isDone={doneSets.has(row.id)}
            onToggleDone={() => onToggleSetDone(row.id, row.rest_s)}
            onUpdate={(patch) => onUpdateSet(row.id, patch)}
            onDelete={() => onDeleteSet(row.id)}
          />
        ))}

        <button
          type="button"
          onClick={() => onAddSet(exerciseId, setGroupId, exerciseOrder)}
          className="w-full py-2.5 mt-2 rounded-xl bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-white font-medium text-sm flex items-center justify-center gap-1.5 transition-colors"
        >
          <Plus className="w-4 h-4" /> Добавить подход
        </button>
      </div>
    </div>
  );
}

interface SetRowEditProps {
  row: TrainingLogRaw;
  isDone: boolean;
  onToggleDone: () => void;
  onUpdate: (patch: { input_wt?: number; effective_load?: number; reps?: number; rest_seconds?: number }) => void;
  onDelete: () => void;
}

function SetRowEdit({ row, isDone, onToggleDone, onUpdate, onDelete }: SetRowEditProps) {
  const [weight, setWeight] = useState(row.input_wt ? String(row.input_wt) : '');
  const [reps, setReps] = useState(row.reps ? String(row.reps) : '');
  const [rest, setRest] = useState(restSecToMin(row.rest_s ?? 0));

  const [swipeOffset, setSwipeOffset] = useState(0);
  const startX = useRef<number | null>(null);

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

  const selectAll = (e: React.FocusEvent<HTMLInputElement>) => e.target.select();

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
    startX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) {
      setSwipeOffset(Math.max(-80, dx));
    } else {
      setSwipeOffset(0);
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset < -50) {
      onDelete();
    }
    setSwipeOffset(0);
    startX.current = null;
  };

  const inputClass = `w-full h-10 text-center font-bold text-lg outline-none rounded-xl transition-colors ${
    isDone ? 'bg-transparent text-zinc-500' : 'bg-zinc-800 text-white focus:bg-zinc-700 focus:ring-1 focus:ring-blue-500'
  }`;

  return (
    <div className="relative overflow-hidden rounded-xl bg-red-500/20">
      <div className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center">
        <Trash2 className="text-red-500 w-5 h-5" />
      </div>

      <div
        className="grid grid-cols-[28px_1fr_1fr_1fr_44px] gap-1.5 items-center px-1 py-0.5 bg-zinc-900 transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="text-center font-bold text-sm text-zinc-500">
          {row.set_no}
        </div>

        <input
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={flush}
          onFocus={selectAll}
          placeholder="0"
          className={inputClass}
        />

        <input
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={flush}
          onFocus={selectAll}
          placeholder="0"
          className={inputClass}
        />

        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={rest}
            onChange={(e) => setRest(e.target.value)}
            onBlur={flush}
            onFocus={selectAll}
            placeholder="0"
            className={inputClass}
          />
          {rest && (
            <span className={`absolute right-1 top-2.5 text-[10px] font-medium pointer-events-none ${isDone ? 'text-zinc-600' : 'text-zinc-500'}`}>
              м
            </span>
          )}
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onToggleDone}
            className={`w-10 h-10 rounded-[14px] flex items-center justify-center transition-all ${
              isDone ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            <Check className="w-6 h-6" strokeWidth={isDone ? 3 : 2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
