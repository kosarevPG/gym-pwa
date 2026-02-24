import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronUp, ChevronDown, ChevronRight, Trash2, Plus, Link2, Unlink } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import {
  fetchLogsBySessionId,
  fetchAllExercises,
  updateTrainingLog,
  deleteTrainingLog,
  saveTrainingLogs,
  batchUpdateTrainingLogs,
  deleteWorkoutSession,
} from '../lib/api';
import type { TrainingLogRaw } from '../lib/api';
import { calcEffectiveLoadKg } from '../lib/metrics';
import type { Exercise } from '../types';
import { getCategoryBySlug } from '../data/categories';

export interface SessionEditScreenProps {
  sessionId: string;
  sessionDate?: string;
  onBack: () => void;
  onSaved?: () => void;
  /** При монтировании открыть окно выбора упражнения (после «Завершить упражнение» с экрана упражнения). */
  openAddExerciseOnMount?: boolean;
  /** Вызвать после открытия окна выбора (чтобы сбросить флаг в родителе). */
  onAddExerciseOpenConsumed?: () => void;
  /** После добавления упражнения в сессию (например чтобы открыть экран этого упражнения для ввода подходов). */
  onAfterAddExercise?: (exercise: Exercise) => void;
}

function restSecToMin(restS: number): string {
  if (restS <= 0) return '0';
  const m = restS / 60;
  return m % 1 === 0 ? String(Math.round(m)) : m.toFixed(1);
}

function parseRestMin(value: string): number {
  const n = parseFloat(value.replace(',', '.')) || 0;
  return Math.round(n * 60);
}

/** Разбить логи сессии на runs (суперсет / соло) и по упражнениям. */
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
  // Старый → Новый: первое выполненное сверху (order 0), последнее — снизу
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
  /** При входе после «Завершить упражнение» показываем блоки свернутыми, чтобы было видно список. */
  const defaultCollapseBlocks = useRef(!!openAddExerciseOnMount).current;

  const loadSession = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([fetchLogsBySessionId(sessionId), fetchAllExercises()]).then(([logList, exList]) => {
      setRows(logList);
      setExercises(exList);
      setLoading(false);
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
    const exerciseIds = Array.from(new Set(rows.map((r) => r.exercise_id)));
    const categorySlugs = Array.from(
      new Set(exerciseIds.map((id) => exerciseMap.get(id)?.category).filter(Boolean) as string[])
    );
    const categoryNames = categorySlugs
      .map((slug) => getCategoryBySlug(slug)?.name)
      .filter(Boolean) as string[];
    return { date: dateStr, durationMin, categoryNames };
  }, [rows, sessionDate, exerciseMap]);

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
    const { error } = await updateTrainingLog(id, payload);
    if (error) {
      alert(error.message);
      return;
    }
    // #region agent log
    if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionEditScreen.tsx:handleUpdateSet',message:'update set success',data:{id},timestamp:Date.now(),hypothesisId:'H2,H5'})}).catch(()=>{});
    // #endregion
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
  };

  const handleDeleteSet = async (id: string) => {
    const { error } = await deleteTrainingLog(id);
    if (error) {
      alert(error.message);
      return;
    }
    // #region agent log
    if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionEditScreen.tsx:handleDeleteSet',message:'delete set success',data:{id},timestamp:Date.now(),hypothesisId:'H3,H5'})}).catch(()=>{});
    // #endregion
    setRows((prev) => prev.filter((r) => r.id !== id));
    loadSession(true);
  };

  const handleAddSet = async (exerciseId: string, setGroupId: string, exerciseOrder: number) => {
    const sessionRows = rows.filter((r) => r.session_id === sessionId);
    const exerciseRows = sessionRows.filter((r) => r.exercise_id === exerciseId);
    const maxSetNo = exerciseRows.length ? Math.max(...exerciseRows.map((r) => r.set_no)) + 1 : 1;
    const firstTs = sessionRows[0]?.ts ?? new Date().toISOString();
    const { error } = await saveTrainingLogs([
      {
        session_id: sessionId,
        set_group_id: setGroupId,
        exercise_id: exerciseId,
        weight: 0,
        reps: 0,
        order_index: sessionRows.length,
        set_no: maxSetNo,
        exercise_order: exerciseOrder,
        input_wt: 0,
        effective_load: 0,
        rest_seconds: 0,
        completed_at: firstTs,
      },
    ]);
    if (error) {
      alert(error.message);
      return;
    }
    // #region agent log
    if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionEditScreen.tsx:handleAddSet',message:'add set success',data:{exerciseId,maxSetNo},timestamp:Date.now(),hypothesisId:'H4,H5'})}).catch(()=>{});
    // #endregion
    loadSession();
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    const toDelete = rows.filter((r) => r.exercise_id === exerciseId && r.session_id === sessionId);
    setSaving(true);
    for (const r of toDelete) {
      const { error } = await deleteTrainingLog(r.id);
      if (error) {
        alert(error.message);
        setSaving(false);
        return;
      }
    }
    const remaining = rows.filter((r) => r.exercise_id !== exerciseId);
    const orderedExIds = [...new Set(remaining.map((r) => r.exercise_id))].sort((a, b) => {
      const orderA = remaining.find((r) => r.exercise_id === a)!.exercise_order;
      const orderB = remaining.find((r) => r.exercise_id === b)!.exercise_order;
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
    // #region agent log
    if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionEditScreen.tsx:handleDeleteExercise',message:'delete exercise done',data:{exerciseId,deletedCount:toDelete.length},timestamp:Date.now(),hypothesisId:'H3,H5'})}).catch(()=>{});
    // #endregion
    loadSession();
    onSaved?.();
  };

  const handleAddExercise = async (exerciseId: string) => {
    const sessionRows = rows.filter((r) => r.session_id === sessionId);
    const maxOrder = sessionRows.length ? Math.max(...sessionRows.map((r) => r.exercise_order)) + 1 : 0;
    const newSetGroupId = crypto.randomUUID();
    const firstTs = sessionRows[0]?.ts ?? new Date().toISOString();
    const { error } = await saveTrainingLogs([
      {
        session_id: sessionId,
        set_group_id: newSetGroupId,
        exercise_id: exerciseId,
        weight: 0,
        reps: 0,
        order_index: 0,
        exercise_order: maxOrder,
        input_wt: 0,
        effective_load: 0,
        rest_seconds: 0,
        completed_at: firstTs,
      },
    ]);
    if (error) {
      alert(error.message);
      return;
    }
    // #region agent log
    if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionEditScreen.tsx:handleAddExercise',message:'add exercise success',data:{exerciseId},timestamp:Date.now(),hypothesisId:'H4,H5'})}).catch(()=>{});
    // #endregion
    setAddExerciseOpen(false);
    loadSession();
    const addedEx = exerciseMap.get(exerciseId);
    if (addedEx) onAfterAddExercise?.(addedEx);
  };

  const orderedExIds = useMemo(() => runs.flatMap((r) => r.exIds), [runs]);

  /** Переприсвоить exercise_order по порядку 0,1,2... — устраняет дубли и сбои при смене порядка */
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

  const handleSetExerciseOrder = async (exId: string, newPos1Based: number) => {
    const idx = orderedExIds.indexOf(exId);
    if (idx < 0) return;
    const newIdx = Math.max(0, Math.min(orderedExIds.length - 1, newPos1Based - 1));
    if (newIdx === idx) return;
    const newOrder = orderedExIds.filter((id) => id !== exId);
    newOrder.splice(newIdx, 0, exId);
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

  const handleMoveRunUp = async (runIdx: number) => {
    if (runIdx <= 0) return;
    const newOrder = [...orderedExIds];
    const prevRunExIds = runs[runIdx - 1].exIds;
    const curRunExIds = runs[runIdx].exIds;
    const prevStart = newOrder.indexOf(prevRunExIds[0]);
    const curStart = newOrder.indexOf(curRunExIds[0]);
    const prevBlock = newOrder.slice(prevStart, prevStart + prevRunExIds.length);
    const curBlock = newOrder.slice(curStart, curStart + curRunExIds.length);
    newOrder.splice(prevStart, prevBlock.length + curBlock.length, ...curBlock, ...prevBlock);
    await applyExerciseOrder(newOrder);
  };

  const handleMoveRunDown = async (runIdx: number) => {
    if (runIdx < 0 || runIdx >= runs.length - 1) return;
    const newOrder = [...orderedExIds];
    const curRunExIds = runs[runIdx].exIds;
    const nextRunExIds = runs[runIdx + 1].exIds;
    const curStart = newOrder.indexOf(curRunExIds[0]);
    const nextStart = newOrder.indexOf(nextRunExIds[0]);
    const curBlock = newOrder.slice(curStart, curStart + curRunExIds.length);
    const nextBlock = newOrder.slice(nextStart, nextStart + nextRunExIds.length);
    newOrder.splice(curStart, curBlock.length + nextBlock.length, ...nextBlock, ...curBlock);
    await applyExerciseOrder(newOrder);
  };

  const handleMoveSetUp = async (rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const sameExercise = rows
      .filter((r) => r.exercise_id === row.exercise_id && r.session_id === sessionId)
      .sort((a, b) => a.set_no - b.set_no);
    const idx = sameExercise.findIndex((r) => r.id === rowId);
    if (idx <= 0) return;
    const prev = sameExercise[idx - 1];
    const { error: e1 } = await updateTrainingLog(rowId, { set_no: prev.set_no });
    if (e1) {
      alert(e1.message);
      return;
    }
    const { error: e2 } = await updateTrainingLog(prev.id, { set_no: row.set_no });
    if (e2) {
      alert(e2.message);
      return;
    }
    loadSession(true);
  };

  const handleMoveSetDown = async (rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const sameExercise = rows
      .filter((r) => r.exercise_id === row.exercise_id && r.session_id === sessionId)
      .sort((a, b) => a.set_no - b.set_no);
    const idx = sameExercise.findIndex((r) => r.id === rowId);
    if (idx < 0 || idx >= sameExercise.length - 1) return;
    const next = sameExercise[idx + 1];
    const { error: e1 } = await updateTrainingLog(rowId, { set_no: next.set_no });
    if (e1) {
      alert(e1.message);
      return;
    }
    const { error: e2 } = await updateTrainingLog(next.id, { set_no: row.set_no });
    if (e2) {
      alert(e2.message);
      return;
    }
    loadSession(true);
  };

  const title = sessionDate ? `Редактирование ${sessionDate}` : 'Редактирование тренировки';

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <ScreenHeader title={title} onBack={onBack} />
        <main className="p-4 text-zinc-400">Загрузка…</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-8">
      <ScreenHeader title={title} onBack={onBack} />
      <main className="p-4 space-y-4 max-w-lg mx-auto">
        {runs.length > 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden px-4 py-3">
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <span>{sessionHeader.date}</span>
              <span>•</span>
              <span>{sessionHeader.durationMin}м</span>
            </div>
            <p className="font-semibold text-white mt-0.5">
              {sessionHeader.categoryNames.length ? sessionHeader.categoryNames.join(' • ') : '—'}
            </p>
          </div>
        )}
        {runs.length === 0 ? (
          <p className="text-zinc-500">Нет подходов в этой тренировке.</p>
        ) : (
          runs.map((run, runIdx) => (
            <div key={run.superset ? `superset-${runIdx}` : `solo-${runIdx}`} className="space-y-2">
              {run.superset ? (
                <div className="rounded-xl border-l-4 border-blue-500 bg-blue-500/5 pl-3 pr-2 py-2 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wider">
                      <Link2 className="w-4 h-4 flex-shrink-0" />
                      СУПЕРСЕТ
                    </div>
                    <div className="flex items-center gap-1">
                      {runIdx > 0 && (
                        <button
                          type="button"
                          onClick={() => handleMoveRunUp(runIdx)}
                          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400"
                          aria-label="Поднять блок"
                          title="Поднять блок упражнений"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                      )}
                      {runIdx < runs.length - 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleMoveRunDown(runIdx)}
                            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400"
                            aria-label="Опустить блок"
                            title="Опустить блок упражнений"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMergeWithNext(runIdx)}
                            className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800"
                          >
                            Объединить со следующим
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {run.exIds.map((exId) => (
                    <ExerciseBlock
                      key={exId}
                      exerciseId={exId}
                      sets={byExercise.get(exId)!.sort((a, b) => a.set_no - b.set_no)}
                      exerciseMap={exerciseMap}
                      sessionId={sessionId}
                      orderNum={orderedExIds.indexOf(exId) + 1}
                      orderTotal={orderedExIds.length}
                      onOrderChange={(n) => handleSetExerciseOrder(exId, n)}
                      onUpdateSet={handleUpdateSet}
                      onDeleteSet={handleDeleteSet}
                      onAddSet={handleAddSet}
                      onDeleteExercise={handleDeleteExercise}
                      onMoveUp={() => handleMoveExerciseUp(exId)}
                      onMoveDown={() => handleMoveExerciseDown(exId)}
                      onSplitFromSuperset={
                        run.superset ? () => handleSplitFromSuperset(exId) : undefined
                      }
                      splitLabel={run.exIds.length === 1 ? 'Убрать метку суперсета' : undefined}
                      canMoveUp={orderedExIds.indexOf(exId) > 0}
                      canMoveDown={orderedExIds.indexOf(exId) < orderedExIds.length - 1}
                      onMoveSetUp={handleMoveSetUp}
                      onMoveSetDown={handleMoveSetDown}
                      onFinishExercise={() => setAddExerciseOpen(true)}
                      defaultCollapsed={defaultCollapseBlocks}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {runIdx < runs.length - 1 && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleMergeWithNext(runIdx)}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        Объединить со следующим в суперсет
                      </button>
                    </div>
                  )}
                  {run.exIds.map((exId) => (
                    <ExerciseBlock
                      key={exId}
                      exerciseId={exId}
                      sets={byExercise.get(exId)!.sort((a, b) => a.set_no - b.set_no)}
                      exerciseMap={exerciseMap}
                      sessionId={sessionId}
                      orderNum={orderedExIds.indexOf(exId) + 1}
                      orderTotal={orderedExIds.length}
                      onOrderChange={(n) => handleSetExerciseOrder(exId, n)}
                      onUpdateSet={handleUpdateSet}
                      onDeleteSet={handleDeleteSet}
                      onAddSet={handleAddSet}
                      onDeleteExercise={handleDeleteExercise}
                      onMoveUp={() => handleMoveExerciseUp(exId)}
                      onMoveDown={() => handleMoveExerciseDown(exId)}
                      onSplitFromSuperset={undefined}
                      canMoveUp={orderedExIds.indexOf(exId) > 0}
                      canMoveDown={orderedExIds.indexOf(exId) < orderedExIds.length - 1}
                      onMoveSetUp={handleMoveSetUp}
                      onMoveSetDown={handleMoveSetDown}
                      onFinishExercise={() => setAddExerciseOpen(true)}
                      defaultCollapsed={defaultCollapseBlocks}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        <button
          type="button"
          onClick={() => setAddExerciseOpen(true)}
          className="w-full py-3 rounded-xl border border-dashed border-zinc-600 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Добавить упражнение
        </button>

        <button
          type="button"
          disabled={deleting}
          onClick={async () => {
            if (!confirm('Удалить эту тренировку? Все подходы будут удалены.')) return;
            setDeleting(true);
            const { error } = await deleteWorkoutSession(sessionId);
            setDeleting(false);
            if (error) {
              alert(error.message);
              return;
            }
            onSaved?.();
            onBack();
          }}
          className="w-full py-3 rounded-xl border border-red-500/50 text-red-400 hover:bg-red-500/10 flex items-center justify-center gap-2 disabled:opacity-50 mt-6"
        >
          <Trash2 className="w-5 h-5" />
          {deleting ? 'Удаление…' : 'Удалить тренировку'}
        </button>
      </main>

      {addExerciseOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-end p-4"
          onClick={() => setAddExerciseOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setAddExerciseOpen(false)}
          role="dialog"
          aria-label="Выбор упражнения"
        >
          <div
            className="w-full max-w-lg max-h-[70vh] bg-zinc-900 rounded-t-2xl border border-zinc-800 border-b-0 p-4 shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-3">Выберите упражнение</h2>
            <div className="overflow-y-auto flex-1 space-y-1">
              {exercises.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => handleAddExercise(ex.id)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800 text-white"
                >
                  {ex.nameRu}
                  {ex.nameEn ? ` / ${ex.nameEn}` : ''}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAddExerciseOpen(false)}
              className="mt-3 py-2 rounded-xl bg-zinc-800 text-zinc-300"
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
  orderNum: number;
  orderTotal: number;
  onOrderChange: (newPos1Based: number) => void;
  onUpdateSet: (id: string, patch: { input_wt?: number; effective_load?: number; reps?: number; rest_seconds?: number }) => void;
  onDeleteSet: (id: string) => void;
  onAddSet: (exerciseId: string, setGroupId: string, exerciseOrder: number) => void;
  onDeleteExercise: (exerciseId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSplitFromSuperset?: () => void;
  splitLabel?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveSetUp: (rowId: string) => void;
  onMoveSetDown: (rowId: string) => void;
  onFinishExercise?: () => void;
  /** Показать блок свернутым по умолчанию (после «Завершить упражнение»). */
  defaultCollapsed?: boolean;
}

function ExerciseBlock({
  exerciseId,
  sets,
  exerciseMap,
  sessionId,
  orderNum,
  orderTotal,
  onOrderChange,
  onUpdateSet,
  onDeleteSet,
  onAddSet,
  onDeleteExercise,
  onMoveUp,
  onMoveDown,
  onSplitFromSuperset,
  splitLabel,
  canMoveUp,
  canMoveDown,
  onMoveSetUp,
  onMoveSetDown,
  onFinishExercise,
  defaultCollapsed,
}: ExerciseBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(!!defaultCollapsed);
  const ex = exerciseMap.get(exerciseId);
  const nameRu = ex?.nameRu ?? exerciseId;
  const nameEn = ex?.nameEn;
  const setGroupId = sets[0]?.set_group_id ?? '';
  const exerciseOrder = sets[0]?.exercise_order ?? 0;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [orderInput, setOrderInput] = useState(String(orderNum));

  useEffect(() => {
    setOrderInput(String(orderNum));
  }, [orderNum]);

  return (
    <div className="space-y-2 bg-zinc-900/30 border border-zinc-800/60 rounded-xl p-2 transition-all">
      <div
        className="flex items-center justify-between gap-2 flex-wrap cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-zinc-400 hover:text-white transition-colors p-1 -ml-1">
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
          <span className="text-zinc-500 text-xs shrink-0">№</span>
          <input
            type="number"
            min={1}
            max={orderTotal}
            value={orderInput}
            onChange={(e) => setOrderInput(e.target.value)}
            onBlur={() => {
              const n = parseInt(orderInput, 10);
              if (n >= 1 && n <= orderTotal) onOrderChange(n);
              setOrderInput(String(orderNum));
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            onClick={(e) => e.stopPropagation()}
            className="w-10 text-center text-sm bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 text-white"
          />
          <p className="font-medium text-white text-sm truncate">
            {nameRu}
            {nameEn ? ` / ${nameEn}` : ''}
            {isCollapsed && (
              <span className="ml-2 text-zinc-500 font-normal text-xs">
                ({sets.length} подходов)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400"
              aria-label="Поднять упражнение"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
          {canMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400"
              aria-label="Опустить упражнение"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          {onSplitFromSuperset && (
            <button
              type="button"
              onClick={onSplitFromSuperset}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 flex items-center gap-1"
              title={splitLabel ?? 'Разъединить из суперсета'}
            >
              <Unlink className="w-4 h-4" />
              <span className="text-xs">{splitLabel ?? 'Разъединить'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onAddSet(exerciseId, setGroupId, exerciseOrder)}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400"
            aria-label="Добавить подход"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Удалить все подходы этого упражнения из тренировки?'))
                onDeleteExercise(exerciseId);
            }}
            className="p-1.5 rounded-lg hover:bg-red-900/30 text-zinc-400 hover:text-red-400"
            aria-label="Удалить упражнение"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-1 pl-2 pt-2 border-t border-zinc-800/50 mt-2">
          {sets.map((row, setIndex) => (
            <SetRowEdit
              key={row.id}
              row={row}
              setsCount={sets.length}
              setIndex={setIndex}
              isEditing={editingId === row.id}
              onStartEdit={() => setEditingId(row.id)}
              onBlur={() => setEditingId(null)}
              onUpdate={(patch) => {
                onUpdateSet(row.id, patch);
                setEditingId(null);
              }}
              onDelete={() => onDeleteSet(row.id)}
              onMoveUp={() => onMoveSetUp(row.id)}
              onMoveDown={() => onMoveSetDown(row.id)}
            />
          ))}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setIsCollapsed(true);
                onFinishExercise?.();
              }}
              className="w-full py-2.5 rounded-xl border border-green-500/30 text-green-400 hover:bg-green-500/10 text-sm font-medium transition-colors flex justify-center items-center"
            >
              Завершить упражнение
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SetRowEditProps {
  row: TrainingLogRaw;
  setsCount: number;
  setIndex: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onBlur: () => void;
  onUpdate: (patch: { input_wt?: number; effective_load?: number; reps?: number; rest_seconds?: number }) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SetRowEdit({
  row,
  setsCount,
  setIndex,
  isEditing,
  onStartEdit,
  onBlur,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: SetRowEditProps) {
  const effectiveFromRow = row.effective_load ?? row.input_wt ?? 0;
  const [weight, setWeight] = useState(String(row.input_wt));
  const [effective, setEffective] = useState(String(effectiveFromRow));
  const [reps, setReps] = useState(String(row.reps));
  const [rest, setRest] = useState(restSecToMin(row.rest_s));

  useEffect(() => {
    if (isEditing) {
      setWeight(String(row.input_wt));
      setEffective(String(row.effective_load ?? row.input_wt ?? 0));
      setReps(String(row.reps));
      setRest(restSecToMin(row.rest_s));
    }
  }, [isEditing, row.id, row.input_wt, row.effective_load, row.reps, row.rest_s]);

  const flush = () => {
    const inputWt = parseFloat(weight.replace(',', '.')) || 0;
    const effectiveWt = parseFloat(effective.replace(',', '.')) ?? effectiveFromRow;
    const repsNum = Math.floor(parseFloat(reps) || 0);
    const restSec = parseRestMin(rest);
    const changed =
      inputWt !== row.input_wt ||
      effectiveWt !== effectiveFromRow ||
      repsNum !== row.reps ||
      restSec !== row.rest_s;
    if (changed) {
      onUpdate({
        input_wt: inputWt,
        effective_load: Number.isFinite(effectiveWt) ? effectiveWt : inputWt,
        reps: repsNum,
        rest_seconds: restSec,
      });
    }
  };

  if (isEditing) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-1 text-sm">
        <input
          type="number"
          min={0}
          step={0.5}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={flush}
          className="w-14 px-2 py-1 rounded bg-zinc-800 border border-zinc-600 text-white text-right"
          placeholder="ввод"
          title="Ввод (кг)"
        />
        <span className="text-zinc-500">→</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={effective}
          onChange={(e) => setEffective(e.target.value)}
          onBlur={flush}
          className="w-14 px-2 py-1 rounded bg-zinc-800 border border-zinc-600 text-white text-right"
          placeholder="эфф."
          title="Эффективный (кг)"
        />
        <span className="text-zinc-500">×</span>
        <input
          type="number"
          min={0}
          step={1}
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={flush}
          className="w-14 px-2 py-1 rounded bg-zinc-800 border border-zinc-600 text-white text-right"
        />
        <span className="text-zinc-500">повт.</span>
        <input
          type="text"
          inputMode="decimal"
          value={rest}
          onChange={(e) => setRest(e.target.value)}
          onBlur={flush}
          className="w-14 px-2 py-1 rounded bg-zinc-800 border border-zinc-600 text-white text-right"
          placeholder="мин"
        />
        <span className="text-zinc-500">мин отдых</span>
        {setIndex > 0 && (
          <button type="button" onClick={onMoveUp} className="p-1 rounded hover:bg-zinc-700 text-zinc-500" aria-label="Поднять подход">
            <ChevronUp className="w-4 h-4" />
          </button>
        )}
        {setIndex < setsCount - 1 && (
          <button type="button" onClick={onMoveDown} className="p-1 rounded hover:bg-zinc-700 text-zinc-500" aria-label="Опустить подход">
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onDelete();
            onBlur();
          }}
          className="p-1 rounded hover:bg-red-900/30 text-zinc-500 hover:text-red-400"
          aria-label="Удалить подход"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const inputKg = row.input_wt ?? 0;
  const effectiveKg = row.effective_load ?? row.input_wt ?? 0;
  const formatKg = (n: number) => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));
  const restStr = restSecToMin(row.rest_s) + 'м';

  return (
    <div
      className="flex justify-between items-baseline gap-2 py-1 text-sm text-zinc-300 cursor-pointer hover:bg-zinc-800/50 rounded px-2 -mx-2"
      onClick={onStartEdit}
    >
      <span className="min-w-0">
        {formatKg(effectiveKg)} кг × {row.reps} повт, {restStr}
      </span>
      <span className="flex items-center gap-1 flex-shrink-0">
        <span className="text-zinc-500">Input: {formatKg(inputKg)} кг</span>
        {setIndex > 0 && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} className="p-1 rounded hover:bg-zinc-700 text-zinc-500" aria-label="Поднять подход">
            <ChevronUp className="w-4 h-4" />
          </button>
        )}
        {setIndex < setsCount - 1 && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} className="p-1 rounded hover:bg-zinc-700 text-zinc-500" aria-label="Опустить подход">
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded hover:bg-red-900/30 text-zinc-500 hover:text-red-400"
          aria-label="Удалить подход"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </span>
    </div>
  );
}
