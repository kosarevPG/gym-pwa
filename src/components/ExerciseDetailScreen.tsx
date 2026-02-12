import { useState, useCallback, useEffect, useMemo } from 'react';
import { ChevronLeft, Trophy, Calendar, FolderDown, Trash2, Plus, Check, Search, TimerReset } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import {
  saveTrainingLogs,
  fetchExerciseHistory,
  fetchLastExerciseSnapshot,
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
}

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
  const createSet = useCallback((order: number): WorkoutSet => ({
    id: crypto.randomUUID(),
    exerciseId: exercise.id,
    inputWeight: '',
    reps: '',
    restMin: String(Math.round((exercise.defaultRestSeconds ?? 120) / 60)),
    rpe: '8',
    restAfterSeconds: undefined,
    doneAt: undefined,
    supersetExerciseId: null,
    side: 'both',
    completed: false,
    order,
  }), [exercise.id, exercise.defaultRestSeconds]);

  const [sets, setSets] = useState<WorkoutSet[]>(() => [createSet(1)]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restCountdownSec, setRestCountdownSec] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<ExerciseHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<{ createdAt: string; weight: number; reps: number } | null>(null);
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [bodyWeight, setBodyWeight] = useState<number | null>(null);
  const [supersetSearchOpen, setSupersetSearchOpen] = useState(false);
  const [supersetQuery, setSupersetQuery] = useState('');
  const [supersetResults, setSupersetResults] = useState<ExerciseType[]>([]);
  const [supersetLoading, setSupersetLoading] = useState(false);
  const [supersetExercise, setSupersetExercise] = useState<ExerciseType | null>(null);

  const weightType = getWeightType(exercise);
  const weightLabel = WEIGHT_FORMULAS[weightType]?.label ?? '×1 блин';
  const show1rm = allows1rm(weightType);
  const showSideControl = weightType === 'dumbbell' || !!exercise.isUnilateral;

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
    fetchExerciseHistory(exercise.id, 40).then(setHistoryRows);
  }, [exercise.id]);

  useEffect(() => {
    if (restCountdownSec <= 0) return;
    const timer = window.setInterval(() => {
      setRestCountdownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restCountdownSec]);

  useEffect(() => {
    if (!supersetSearchOpen) return;
    const q = supersetQuery.trim();
    if (q.length < 2) {
      setSupersetResults([]);
      return;
    }
    setSupersetLoading(true);
    const t = window.setTimeout(() => {
      searchExercises(q, 15).then((items) => {
        setSupersetResults(items.filter((e) => e.id !== exercise.id));
        setSupersetLoading(false);
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [supersetQuery, supersetSearchOpen, exercise.id]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const data = await fetchExerciseHistory(exercise.id, 50);
    setHistoryRows(data);
    setHistoryLoading(false);
  }, [exercise.id]);

  const updateSet = useCallback(
    (id: string, patch: Partial<WorkoutSet>) => {
      setSets((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
    },
    []
  );

  const addSet = useCallback(() => {
    setSets((prev) => [...prev, createSet(prev.length + 1)]);
  }, [createSet]);

  const removeSet = useCallback((id: string) => {
    setSets((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  }, []);

  const markSetDone = useCallback((setId: string) => {
    const set = sets.find((s) => s.id === setId);
    const restMin = set ? Math.max(0, parseInt(set.restMin, 10) || 0) : 0;
    setSets((prev) => prev.map((s) => {
      if (s.id !== setId) return s;
      const done = !s.completed;
      return {
        ...s,
        completed: done,
        doneAt: done ? new Date().toISOString() : undefined,
        restAfterSeconds: done ? restMin * 60 : undefined,
        supersetExerciseId: done ? (supersetExercise?.id ?? null) : s.supersetExerciseId,
      };
    }));
    if (set && !set.completed) setRestCountdownSec(restMin * 60);
  }, [sets, supersetExercise?.id]);

  const calcSetAnalytics = useCallback((set: WorkoutSet) => {
    const repsNum = parseInt(set.reps, 10) || 0;
    const rpeNum = parseFloat(set.rpe) || 0;
    const totalKg = calcTotalKg(set.inputWeight, weightType, exercise.baseWeight);
    const weightFor1rm = (totalKg != null && totalKg > 0) ? totalKg : (bodyWeight ?? 0);
    const oneRm = repsNum > 0 ? calc1RM(weightFor1rm, repsNum) : 0;
    const sideMult = calcSideMult(exercise.weightType ?? 'standard', set.side ?? 'both');
    const volume = ((totalKg ?? 0) * repsNum * sideMult);
    const effectiveLoad = volume * (rpeNum > 0 ? (rpeNum / 10) : 0);
    return {
      repsNum,
      rpeNum,
      totalKg,
      oneRm,
      sideMult,
      volume,
      effectiveLoad,
    };
  }, [weightType, exercise.baseWeight, bodyWeight, exercise.weightType]);

  const sessionTotals = useMemo(() => {
    return sets.reduce((acc, s) => {
      const a = calcSetAnalytics(s);
      acc.volume += a.volume;
      acc.effective += a.effectiveLoad;
      return acc;
    }, { volume: 0, effective: 0 });
  }, [sets, calcSetAnalytics]);

  const todayMedianSetVolume = useMemo(() => {
    const vols = sets.map((s) => calcSetAnalytics(s).volume).filter((v) => v > 0);
    return median(vols);
  }, [sets, calcSetAnalytics]);

  const baselineMedianSetVolume = useMemo(() => {
    const vols = historyRows
      .map((h) => (h.volume != null ? h.volume : h.weight * h.reps))
      .filter((v) => v > 0);
    return median(vols);
  }, [historyRows]);

  const baselineRatio = useMemo(() => {
    if (!todayMedianSetVolume || !baselineMedianSetVolume) return null;
    return todayMedianSetVolume / baselineMedianSetVolume;
  }, [todayMedianSetVolume, baselineMedianSetVolume]);

  const workingSetRpes = useMemo(() => {
    return sets
      .map((s) => parseFloat(s.rpe) || 0)
      .filter((v) => v > 0);
  }, [sets]);
  const deltaRpe = useMemo(() => {
    if (workingSetRpes.length < 2) return 0;
    return workingSetRpes[workingSetRpes.length - 1] - workingSetRpes[0];
  }, [workingSetRpes]);

  const overloadDot = useMemo(() => {
    if (baselineRatio == null) return false;
    return deltaRpe >= 1 && baselineRatio < 0.95;
  }, [deltaRpe, baselineRatio]);

  const handleComplete = async () => {
    setSaveError(null);
    setSaving(true);
    const toInsert = sets
      .filter((s) => s.inputWeight.trim() !== '' || s.reps.trim() !== '')
      .map((s) => {
        const analytics = calcSetAnalytics(s);
        return {
          exercise_id: exercise.id,
          weight: analytics.totalKg ?? 0,
          reps: analytics.repsNum,
          set_group_id: sessionId,
          order_index: s.order,
          input_wt: parseFloat(s.inputWeight) || 0,
          side: s.side ?? 'both',
          body_wt_snapshot: bodyWeight ?? null,
          side_mult: analytics.sideMult,
          set_volume: analytics.volume,
          rpe: analytics.rpeNum || undefined,
          rest_seconds: s.restAfterSeconds ?? (Math.max(0, parseInt(s.restMin, 10) || 0) * 60),
          superset_exercise_id: s.supersetExerciseId ?? supersetExercise?.id ?? null,
          one_rm: analytics.oneRm > 0 ? analytics.oneRm : undefined,
          volume: analytics.volume,
          effective_load: analytics.effectiveLoad,
          completed_at: s.doneAt ?? new Date().toISOString(),
        };
      });

    if (toInsert.length > 0) {
      const { error } = await saveTrainingLogs(toInsert);
      if (error) {
        setSaveError(
          error.message ||
            'Не удалось сохранить. В Supabase проверь: таблица training_logs, колонки (exercise_id, weight, reps, set_group_id, order_index), RLS — политика INSERT для anon.'
        );
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    onComplete();
  };

  const formatDateShort = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ScreenHeader
        title=""
        onBack={onBack}
        rightAction={(
          <button
            type="button"
            onClick={() => { setHistoryOpen(true); void loadHistory(); }}
            className="p-2 text-zinc-400 hover:text-white"
            aria-label="История"
          >
            <Calendar className="w-5 h-5" />
          </button>
        )}
      />

      <div className="p-4 max-w-lg mx-auto w-full space-y-4">
        {saveError && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300 text-sm">
            {saveError}
          </div>
        )}
        {/* Блок упражнения */}
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-2xl p-4">
          <div className="flex items-start gap-2">
            <span className="font-medium text-white flex-1">
              {exercise.nameRu} / {exercise.nameEn}
            </span>
            {(personalBest ?? exercise.targetWeightKg) != null && (
              <span className="flex items-center gap-1 text-amber-400 text-sm">
                <Trophy className="w-4 h-4" />
                {personalBest ?? exercise.targetWeightKg} кг
              </span>
            )}
            {overloadDot && <span className="w-2 h-2 rounded-full bg-red-500 mt-2" title="Fatigue overload" />}
          </div>
          {lastSnapshot && (
            <div className="mt-2 text-xs text-zinc-400 bg-zinc-900/50 rounded-lg px-2 py-1">
              В прошлый раз ({formatDateShort(lastSnapshot.createdAt)}): {lastSnapshot.weight} кг x {lastSnapshot.reps}
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-zinc-900/50 rounded-lg px-2 py-1">
              ΔRPE: <span className={deltaRpe >= 1 ? 'text-amber-400' : 'text-zinc-300'}>{deltaRpe >= 0 ? '+' : ''}{deltaRpe.toFixed(1)}</span>
            </div>
            <div className="bg-zinc-900/50 rounded-lg px-2 py-1">
              today vs baseline:{' '}
              {baselineRatio == null ? (
                <span className="text-zinc-500">—</span>
              ) : (
                <span className={
                  baselineRatio >= 1.05
                    ? 'text-emerald-400'
                    : baselineRatio >= 0.95
                      ? 'text-zinc-300'
                      : 'text-amber-400'
                }>
                  {(baselineRatio * 100).toFixed(0)}%
                </span>
              )}
            </div>
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

        {/* Таймер отдыха: обратный отсчёт с момента отметки подхода */}
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-2xl p-4 flex items-center justify-center gap-4">
          <TimerReset className="w-6 h-6 text-zinc-500 shrink-0" />
          <div className="text-center">
            <p className="text-sm text-zinc-400">Отдых до следующего подхода</p>
            <p className={`font-mono text-4xl tabular-nums ${restCountdownSec > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
              {String(Math.floor(restCountdownSec / 60)).padStart(2, '0')}:{String(restCountdownSec % 60).padStart(2, '0')}
            </p>
          </div>
        </div>

        {/* Суперсет */}
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-2xl p-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setSupersetSearchOpen(true); setSupersetQuery(''); setSupersetResults([]); }}
            className="px-3 py-2 bg-zinc-700/80 hover:bg-zinc-700 rounded-xl text-sm"
          >
            + Добавить суперсет
          </button>
          {supersetExercise && (
            <div className="text-xs text-zinc-300 truncate">
              Суперсет: <span className="text-white">{supersetExercise.nameRu}</span>
            </div>
          )}
        </div>

        {/* Подходы: вес, повторения, отдых (мин); отметка «выполнено» запускает таймер */}
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] gap-2 px-4 py-2 border-b border-zinc-700 text-zinc-500 text-xs uppercase tracking-wide">
            <span>Вес</span>
            <span>ПОВТ</span>
            <span>Отдых (мин)</span>
            <span>RPE</span>
            <span className="w-12" />
            <span className="w-10" />
          </div>
          <ul className="divide-y divide-zinc-700/50">
            {sets.map((set) => {
              const analytics = calcSetAnalytics(set);
              return (
                <li key={set.id} className="px-4 py-3 grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] gap-2 items-center">
                  <div className="min-w-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={set.inputWeight}
                      onChange={(e) => updateSet(set.id, { inputWeight: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {analytics.totalKg != null && (
                      <p className="text-[10px] text-zinc-500 mt-0.5">Итого: {analytics.totalKg} кг</p>
                    )}
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
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="0"
                    value={set.restMin}
                    onChange={(e) => updateSet(set.id, { restMin: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {[7, 8, 9, 10].map((r) => (
                      <button
                        key={`${set.id}-rpe-${r}`}
                        type="button"
                        onClick={() => updateSet(set.id, { rpe: String(r) })}
                        className={`px-1.5 py-0.5 text-[10px] rounded ${String(set.rpe) === String(r) ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                        title={`RPE ${r}`}
                      >
                        {r}
                      </button>
                    ))}
                    {showSideControl && (
                      <select
                        value={set.side ?? 'both'}
                        onChange={(e) => updateSet(set.id, { side: e.target.value as WorkoutSet['side'] })}
                        className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-300"
                        title="Сторона"
                      >
                        <option value="both">оба</option>
                        <option value="left">L</option>
                        <option value="right">R</option>
                      </select>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => markSetDone(set.id)}
                    className={`shrink-0 p-2.5 rounded-xl transition-colors ${set.completed ? 'text-emerald-400 bg-emerald-500/20' : 'text-zinc-500 hover:text-emerald-300 hover:bg-zinc-700/50'}`}
                    aria-label="Подход выполнен"
                    title="Отметить подход — запустит таймер отдыха"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSet(set.id)}
                    className="shrink-0 p-2 text-zinc-500 hover:text-red-400 rounded-lg"
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
              onClick={() => { setSupersetSearchOpen(true); setSupersetQuery(''); setSupersetResults([]); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-700/80 hover:bg-zinc-700 rounded-xl text-sm font-medium text-zinc-200"
            >
              <Plus className="w-4 h-4" /> Добавить упражнение в сет
            </button>
          </div>
        </div>

        <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-xl p-3 text-sm text-zinc-300">
          <div className="flex justify-between"><span>Общий Volume</span><span>{Math.round(sessionTotals.volume)}</span></div>
          <div className="flex justify-between"><span>Effective Load</span><span>{Math.round(sessionTotals.effective)}</span></div>
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

      {historyOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-zinc-700 flex justify-between items-center">
              <h3 className="font-medium">История упражнения</h3>
              <button onClick={() => setHistoryOpen(false)} className="text-zinc-400 hover:text-white">Закрыть</button>
            </div>
            <div className="p-4 overflow-auto max-h-[65vh]">
              {historyLoading ? (
                <p className="text-zinc-500">Загрузка...</p>
              ) : historyRows.length === 0 ? (
                <p className="text-zinc-500">История пуста</p>
              ) : (
                <ul className="space-y-2">
                  {historyRows.map((row) => (
                    <li key={row.id} className="p-3 rounded-xl bg-zinc-800/60 text-sm">
                      <div className="flex justify-between">
                        <span>{formatDateShort(row.createdAt)}</span>
                        <span>{row.weight} кг x {row.reps}</span>
                      </div>
                      <div className="text-zinc-400 text-xs mt-1">
                        {row.rpe != null && <>RPE: {row.rpe} · </>}
                        {row.restSeconds != null && <>Отдых: {row.restSeconds}s · </>}
                        {row.oneRm != null && <>1RM: {Math.round(row.oneRm)} · </>}
                        {row.effectiveLoad != null && <>Eff: {Math.round(row.effectiveLoad)}</>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {supersetSearchOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-zinc-700 flex justify-between items-center">
              <h3 className="font-medium">Добавить суперсет</h3>
              <button onClick={() => setSupersetSearchOpen(false)} className="text-zinc-400 hover:text-white">Закрыть</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={supersetQuery}
                  onChange={(e) => setSupersetQuery(e.target.value)}
                  placeholder="Найти упражнение..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2.5"
                />
              </div>
              <div className="max-h-[45vh] overflow-auto">
                {supersetLoading ? (
                  <p className="text-zinc-500 text-sm">Поиск...</p>
                ) : supersetResults.length === 0 ? (
                  <p className="text-zinc-500 text-sm">Введите минимум 2 символа</p>
                ) : (
                  <ul className="space-y-2">
                    {supersetResults.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSupersetExercise(item);
                            setSupersetSearchOpen(false);
                            setSets((prev) => prev.map((s) => ({ ...s, supersetExerciseId: item.id })));
                          }}
                          className="w-full text-left p-3 rounded-xl bg-zinc-800/60 hover:bg-zinc-800"
                        >
                          <div className="font-medium">{item.nameRu}</div>
                          {!!item.nameEn && <div className="text-xs text-zinc-400">{item.nameEn}</div>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
