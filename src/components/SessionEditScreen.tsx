import { useState, useEffect, useMemo } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus, Link2, Unlink } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import {
  fetchLogsBySessionId,
  fetchAllExercises,
  updateTrainingLog,
  deleteTrainingLog,
  saveTrainingLogs,
  batchUpdateTrainingLogs,
} from '../lib/api';
import type { TrainingLogRaw } from '../lib/api';
import { calcEffectiveLoadKg } from '../lib/metrics';
import type { Exercise } from '../types';

export interface SessionEditScreenProps {
  sessionId: string;
  sessionDate?: string;
  onBack: () => void;
  onSaved?: () => void;
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
  const exerciseOrder = [...byExercise.keys()].sort((a, b) => {
    const orderA = byExercise.get(a)![0].exercise_order ?? 0;
    const orderB = byExercise.get(b)![0].exercise_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(byExercise.get(a)![0].ts).getTime() - new Date(byExercise.get(b)![0].ts).getTime();
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

export function SessionEditScreen({ sessionId, sessionDate, onBack, onSaved }: SessionEditScreenProps) {
  const [rows, setRows] = useState<TrainingLogRaw[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);

  const loadSession = () => {
    setLoading(true);
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

  const exerciseMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const { runs, byExercise } = useMemo(() => buildRuns(rows), [rows]);

  const handleUpdateSet = async (
    id: string,
    patch: { input_wt?: number; reps?: number; rest_seconds?: number }
  ) => {
    const row = rows.find((r) => r.id === id);
    const ex = row ? exerciseMap.get(row.exercise_id) : null;
    const inputWt = patch.input_wt ?? row?.input_wt ?? 0;
    const repsNum = patch.reps ?? row?.reps ?? 0;
    const type = ex?.weightType ?? 'standard';
    const multiplier = ex?.simultaneous ? 2 : 1;
    const effective =
      ex != null
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
  };

  const orderedExIds = useMemo(() => runs.flatMap((r) => r.exIds), [runs]);

  const handleMoveExerciseUp = async (exId: string) => {
    const idx = orderedExIds.indexOf(exId);
    if (idx <= 0) return;
    const prevId = orderedExIds[idx - 1];
    const prevOrder = byExercise.get(prevId)![0].exercise_order;
    const curOrder = byExercise.get(exId)![0].exercise_order;
    const updates: { id: string; payload: { exercise_order: number } }[] = [];
    byExercise.get(prevId)!.forEach((r) => updates.push({ id: r.id, payload: { exercise_order: curOrder } }));
    byExercise.get(exId)!.forEach((r) => updates.push({ id: r.id, payload: { exercise_order: prevOrder } }));
    const { error } = await batchUpdateTrainingLogs(updates);
    if (error) alert(error.message);
    else loadSession();
  };

  const handleMoveExerciseDown = async (exId: string) => {
    const idx = orderedExIds.indexOf(exId);
    if (idx < 0 || idx >= orderedExIds.length - 1) return;
    const nextId = orderedExIds[idx + 1];
    const nextOrder = byExercise.get(nextId)![0].exercise_order;
    const curOrder = byExercise.get(exId)![0].exercise_order;
    const updates: { id: string; payload: { exercise_order: number } }[] = [];
    byExercise.get(nextId)!.forEach((r) => updates.push({ id: r.id, payload: { exercise_order: curOrder } }));
    byExercise.get(exId)!.forEach((r) => updates.push({ id: r.id, payload: { exercise_order: nextOrder } }));
    const { error } = await batchUpdateTrainingLogs(updates);
    if (error) alert(error.message);
    else loadSession();
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
    else loadSession();
  };

  const handleSplitFromSuperset = async (exId: string) => {
    const newGroupId = crypto.randomUUID();
    const toUpdate = rows.filter((r) => r.exercise_id === exId && r.session_id === sessionId);
    const updates = toUpdate.map((r) => ({ id: r.id, payload: { set_group_id: newGroupId } }));
    const { error } = await batchUpdateTrainingLogs(updates);
    if (error) alert(error.message);
    else loadSession();
  };

  const handleMoveSetUp = async (rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row || row.set_no <= 1) return;
    const sameExercise = rows.filter(
      (r) => r.exercise_id === row.exercise_id && r.session_id === sessionId
    );
    const prev = sameExercise.find((r) => r.set_no === row.set_no - 1);
    if (!prev) return;
    const { error: e1 } = await updateTrainingLog(rowId, { set_no: row.set_no - 1 });
    if (e1) {
      alert(e1.message);
      return;
    }
    const { error: e2 } = await updateTrainingLog(prev.id, { set_no: row.set_no });
    if (e2) alert(e2.message);
    else loadSession();
  };

  const handleMoveSetDown = async (rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const sameExercise = rows.filter(
      (r) => r.exercise_id === row.exercise_id && r.session_id === sessionId
    );
    const next = sameExercise.find((r) => r.set_no === row.set_no + 1);
    if (!next) return;
    const { error: e1 } = await updateTrainingLog(rowId, { set_no: row.set_no + 1 });
    if (e1) {
      alert(e1.message);
      return;
    }
    const { error: e2 } = await updateTrainingLog(next.id, { set_no: row.set_no });
    if (e2) alert(e2.message);
    else loadSession();
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
        {runs.length === 0 ? (
          <p className="text-zinc-500">Нет подходов в этой тренировке.</p>
        ) : (
          runs.map((run, runIdx) => (
            <div key={run.superset ? `superset-${runIdx}` : `solo-${runIdx}`} className="space-y-2">
              {run.superset ? (
                <div className="rounded-xl border-l-4 border-blue-500 bg-blue-500/5 pl-3 pr-2 py-2 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wider">
                      <Link2 className="w-4 h-4 flex-shrink-0" />
                      СУПЕРСЕТ
                    </div>
                    {runIdx < runs.length - 1 && (
                      <button
                        type="button"
                        onClick={() => handleMergeWithNext(runIdx)}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        Объединить со следующим
                      </button>
                    )}
                  </div>
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
                      onSplitFromSuperset={
                        run.superset && run.exIds.length > 1
                          ? () => handleSplitFromSuperset(exId)
                          : undefined
                      }
                      canMoveUp={orderedExIds.indexOf(exId) > 0}
                      canMoveDown={orderedExIds.indexOf(exId) < orderedExIds.length - 1}
                      onMoveSetUp={handleMoveSetUp}
                      onMoveSetDown={handleMoveSetDown}
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
  onUpdateSet: (id: string, patch: { input_wt?: number; reps?: number; rest_seconds?: number }) => void;
  onDeleteSet: (id: string) => void;
  onAddSet: (exerciseId: string, setGroupId: string, exerciseOrder: number) => void;
  onDeleteExercise: (exerciseId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSplitFromSuperset?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveSetUp: (rowId: string) => void;
  onMoveSetDown: (rowId: string) => void;
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
  canMoveUp,
  canMoveDown,
  onMoveSetUp,
  onMoveSetDown,
}: ExerciseBlockProps) {
  const ex = exerciseMap.get(exerciseId);
  const nameRu = ex?.nameRu ?? exerciseId;
  const setGroupId = sets[0]?.set_group_id ?? '';
  const exerciseOrder = sets[0]?.exercise_order ?? 0;
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="font-medium text-white text-sm">{nameRu}</p>
        <div className="flex items-center gap-1">
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
              title="Разъединить из суперсета"
            >
              <Unlink className="w-4 h-4" />
              <span className="text-xs">Разъединить</span>
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
      <div className="space-y-1.5 pl-2">
        {sets.map((row) => (
          <SetRowEdit
            key={row.id}
            row={row}
            setsCount={sets.length}
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
      </div>
    </div>
  );
}

interface SetRowEditProps {
  row: TrainingLogRaw;
  setsCount: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onBlur: () => void;
  onUpdate: (patch: { input_wt?: number; reps?: number; rest_seconds?: number }) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SetRowEdit({
  row,
  setsCount,
  isEditing,
  onStartEdit,
  onBlur,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: SetRowEditProps) {
  const [weight, setWeight] = useState(String(row.input_wt));
  const [reps, setReps] = useState(String(row.reps));
  const [rest, setRest] = useState(restSecToMin(row.rest_s));

  const flush = () => {
    const inputWt = parseFloat(weight.replace(',', '.')) || 0;
    const repsNum = Math.floor(parseFloat(reps) || 0);
    const restSec = parseRestMin(rest);
    if (inputWt !== row.input_wt || repsNum !== row.reps || restSec !== row.rest_s) {
      onUpdate({ input_wt: inputWt, reps: repsNum, rest_seconds: restSec });
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
          className="w-16 px-2 py-1 rounded bg-zinc-800 border border-zinc-600 text-white text-right"
          placeholder="кг"
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
        {row.set_no > 1 && (
          <button type="button" onClick={onMoveUp} className="p-1 rounded hover:bg-zinc-700 text-zinc-500" aria-label="Поднять подход">
            <ChevronUp className="w-4 h-4" />
          </button>
        )}
        {row.set_no < setsCount && (
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

  return (
    <div
      className="flex justify-between items-center gap-2 py-1 text-sm text-zinc-300 cursor-pointer hover:bg-zinc-800/50 rounded px-2 -mx-2"
      onClick={onStartEdit}
    >
      <span>
        <span className="text-zinc-400">{formatKg(inputKg)} кг (ввод)</span>
        <span className="text-zinc-500 mx-1">→</span>
        <span>{formatKg(effectiveKg)} кг (эфф.)</span>
        {' × '}{row.reps} повторений
        <span className="text-zinc-500 ml-2">отдых {restSecToMin(row.rest_s)}м</span>
      </span>
      <div className="flex items-center gap-0.5">
        {row.set_no > 1 && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} className="p-1 rounded hover:bg-zinc-700 text-zinc-500" aria-label="Поднять подход">
            <ChevronUp className="w-4 h-4" />
          </button>
        )}
        {row.set_no < setsCount && (
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
      </div>
    </div>
  );
}
