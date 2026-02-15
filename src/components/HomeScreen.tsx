import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Dumbbell,
  Flame,
  History,
  Plus,
  Pencil,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  createWorkoutSession,
  fetchAllExercises,
  fetchLatestBodyWeight,
  fetchTrainingLogsWindow,
  getActiveWorkoutSession,
  completeWorkoutSession,
  saveBodyWeight,
} from '../lib/api';
import {
  buildTrainingMetricRows,
  computeHomeInsights,
  getTodaySessionStatus,
} from '../lib/analytics';
import { toLocalDateStr } from '../utils';
import { CalendarWidget } from './CalendarWidget';
import type { WorkoutSessionRow } from '../lib/api';

interface HomeScreenProps {
  onOpenExercises: () => void;
  onOpenAnalytics: () => void;
  onOpenHistory: () => void;
  onSessionStarted: (sessionId: string) => void;
  onWorkoutFinished: (sessionId: string) => void;
}

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function HomeScreen({
  onOpenExercises,
  onOpenAnalytics,
  onOpenHistory,
  onSessionStarted,
  onWorkoutFinished,
}: HomeScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReturnType<typeof buildTrainingMetricRows>>([]);
  const [insights, setInsights] = useState<ReturnType<typeof computeHomeInsights> | null>(null);
  const [viewMode, setViewMode] = useState<'today' | 'week'>('today');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [daySheetDate, setDaySheetDate] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<WorkoutSessionRow | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [bodyWeight, setBodyWeight] = useState<number | null>(null);
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightDate, setWeightDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [savingWeight, setSavingWeight] = useState(false);

  // Активная сессия (тренировка в процессе)
  useEffect(() => {
    let cancelled = false;
    getActiveWorkoutSession()
      .then((s) => {
        if (!cancelled) setActiveSession(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Таймер «Идёт тренировка» — для backdated-сессии считаем от openedAt, иначе от started_at из БД
  useEffect(() => {
    if (!activeSession) return;
    let started: number;
    try {
      const raw = sessionStorage.getItem(`gym-backdated-${activeSession.id}`);
      if (raw) {
        const { openedAt } = JSON.parse(raw) as { openedAt?: number };
        started = typeof openedAt === 'number' ? openedAt : new Date(activeSession.started_at).getTime();
      } else {
        started = new Date(activeSession.started_at).getTime();
      }
    } catch (_) {
      started = new Date(activeSession.started_at).getTime();
    }
    const tick = () => setElapsedMs(Math.max(0, Date.now() - started));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      // Для глубокой истории календаря (полгода и больше) в будущем можно добавить
      // отдельный лёгкий запрос (только даты без деталей упражнений).
      const [logs, exercises] = await Promise.all([
        fetchTrainingLogsWindow(90),
        fetchAllExercises(),
      ]);
      if (cancelled) return;
      const metricRows = buildTrainingMetricRows(logs, exercises);
      setRows(metricRows);
      setInsights(computeHomeInsights(metricRows, exercises));
      setLoading(false);
    })().catch((e) => {
      if (cancelled) return;
      setLoading(false);
      setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchLatestBodyWeight().then((kg) => {
      if (!cancelled) setBodyWeight(kg);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [loading]);

  const datesWithLogs = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(toLocalDateStr(new Date(r.ts))));
    return set;
  }, [rows]);

  const todayStatus = useMemo(() => getTodaySessionStatus(rows), [rows]);

  const weeklyTarget = 3;
  const currentWeekCount = insights?.currentWeekCount ?? 0;
  const weeklyRatio = Math.min(1, currentWeekCount / Math.max(1, weeklyTarget));

  const weeklyArrow = useMemo(() => {
    if (!insights) return <Activity className="w-5 h-5 text-zinc-400" />;
    if (insights.weeklyLoadState === 'up') return <TrendingUp className="w-5 h-5 text-emerald-400" />;
    if (insights.weeklyLoadState === 'down') return <TrendingDown className="w-5 h-5 text-amber-400" />;
    return <Activity className="w-5 h-5 text-zinc-400" />;
  }, [insights]);

  const alertStyles = useMemo(() => {
    if (!insights) return '';
    const { status } = insights.alert;
    if (status === 'ERROR') return 'border-red-500/50 bg-red-950/30 text-red-200';
    if (status === 'WARNING') return 'border-amber-500/50 bg-amber-950/30 text-amber-200';
    return 'border-zinc-700 bg-zinc-900/50 text-zinc-300';
  }, [insights]);

  const handleDayClick = (date: string) => {
    setDaySheetDate(date);
  };

  const closeDaySheet = () => setDaySheetDate(null);

  const handleStartWorkout = async () => {
    setError(null);
    setStarting(true);
    const result = await createWorkoutSession();
    setStarting(false);
    if ('error' in result) {
      setError(result.error.message);
      return;
    }
    setActiveSession({
      id: result.id,
      started_at: new Date().toISOString(),
      ended_at: null,
      name: null,
      status: 'active',
    });
    setElapsedMs(0);
    onSessionStarted(result.id);
  };

  /** Старт тренировки на выбранную в календаре дату — сессия в БД будет с этой датой. */
  const handleStartWorkoutOnDate = async (dateYyyyMmDd: string) => {
    setError(null);
    setStarting(true);
    const startedAt = `${dateYyyyMmDd}T12:00:00.000Z`;
    const result = await createWorkoutSession({ startedAt });
    setStarting(false);
    if ('error' in result) {
      setError(result.error.message);
      return;
    }
    const openedAt = Date.now();
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'HomeScreen.tsx:handleStartWorkoutOnDate', message: 'backdated session created', data: { sessionId: result.id, startedAt, openedAt }, timestamp: Date.now(), hypothesisId: 'H1,H5' }) }).catch(() => {});
    // #endregion
    try {
      sessionStorage.setItem(
        `gym-backdated-${result.id}`,
        JSON.stringify({ startedAt, openedAt })
      );
    } catch (_) {}
    setActiveSession({
      id: result.id,
      started_at: new Date().toISOString(),
      ended_at: null,
      name: null,
      status: 'active',
    });
    setElapsedMs(0);
    closeDaySheet();
    setIsCalendarOpen(false);
    onSessionStarted(result.id);
  };

  const handleFinishWorkout = async () => {
    if (!activeSession) return;
    setError(null);
    setFinishing(true);
    let backdated: { startedAt: string; openedAt: number } | null = null;
    try {
      const raw = sessionStorage.getItem(`gym-backdated-${activeSession.id}`);
      if (raw) backdated = JSON.parse(raw);
    } catch (_) {}
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'HomeScreen.tsx:handleFinishWorkout', message: 'completing session', data: { activeSessionId: activeSession.id, hasBackdated: !!backdated, backdatedStartedAt: backdated?.startedAt }, timestamp: Date.now(), hypothesisId: 'H2' }) }).catch(() => {});
    // #endregion
    const { error: err } = await completeWorkoutSession(activeSession.id, backdated ?? undefined);
    if (backdated) {
      try {
        sessionStorage.removeItem(`gym-backdated-${activeSession.id}`);
      } catch (_) {}
    }
    setFinishing(false);
    if (err) {
      setError(err.message);
      return;
    }
    setActiveSession(null);
    onWorkoutFinished(activeSession.id);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header & Nav */}
      <div className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-xl bg-zinc-900 border border-zinc-800 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('today')}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  viewMode === 'today' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-300'
                }`}
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  viewMode === 'week' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-300'
                }`}
              >
                Неделя
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenHistory}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium flex items-center gap-1.5"
                aria-label="История"
              >
                <History className="w-4 h-4 shrink-0" />
                История
              </button>
              <button
                type="button"
                onClick={onOpenAnalytics}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium flex items-center gap-1.5"
                aria-label="Аналитика"
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                Аналитика
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-lg mx-auto p-4 space-y-3 pb-24">
        {loading && <p className="text-zinc-400">Загрузка...</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {!loading && insights && (
          <>
            {/* CTA: активная сессия или старт */}
            {activeSession ? (
              <section className="space-y-2">
                <div className="px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                  <span className="text-zinc-400">Идёт тренировка</span>
                  <span className="font-mono text-emerald-400">{formatElapsed(elapsedMs)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onOpenExercises}
                    className="flex-1 py-4 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center justify-center gap-2"
                  >
                    <Dumbbell className="w-5 h-5" />
                    Продолжить
                  </button>
                  <button
                    type="button"
                    onClick={handleFinishWorkout}
                    disabled={finishing}
                    className="px-4 py-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium disabled:opacity-50"
                  >
                    {finishing ? '…' : 'Завершить'}
                  </button>
                </div>
              </section>
            ) : (
              <section>
                <button
                  type="button"
                  onClick={handleStartWorkout}
                  disabled={starting}
                  className="w-full py-4 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Dumbbell className="w-5 h-5" />
                  {starting ? 'Создаём тренировку…' : 'Начать тренировку'}
                </button>
              </section>
            )}

            {/* Вес тела */}
            <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-zinc-400 text-sm">Мой вес</p>
                  <p className="text-2xl font-semibold">
                    {bodyWeight != null ? `${bodyWeight} кг` : '—'}
                  </p>
                  <p className="text-xs text-zinc-500">для effective load (гравитрон и др.)</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWeightInput(bodyWeight != null ? String(bodyWeight) : '');
                    setWeightDate(new Date().toISOString().slice(0, 10));
                    setWeightModalOpen(true);
                  }}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium"
                >
                  {bodyWeight != null ? 'Изменить' : 'Ввести'}
                </button>
              </div>
            </section>

            {/* Attendance Card */}
            <section
              className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900 cursor-pointer hover:bg-zinc-800/50 transition-colors"
              onClick={() => setIsCalendarOpen(true)}
              onKeyDown={(e) => e.key === 'Enter' && setIsCalendarOpen(true)}
              role="button"
              tabIndex={0}
              aria-label="Открыть календарь"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-zinc-400 text-sm">Посещения</p>
                  <p className="text-2xl font-semibold">
                    {currentWeekCount} / {weeklyTarget}
                  </p>
                  <p className="text-xs text-zinc-500">Серия недель ≥3: {insights.streakWeeks}</p>
                </div>
                <CalendarDays className="w-7 h-7 text-zinc-500 shrink-0" />
              </div>
              <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${weeklyRatio * 100}%` }}
                />
              </div>
            </section>

            {/* Нагрузка: по выбранному периоду (Сегодня / Неделя) */}
            <section
              className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900 cursor-pointer hover:bg-zinc-800/50 transition-colors"
              onClick={onOpenAnalytics}
              onKeyDown={(e) => e.key === 'Enter' && onOpenAnalytics()}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-center justify-between">
                <p className="text-zinc-400 text-sm">
                  {viewMode === 'today' ? 'Объём за сегодня' : 'Объём за неделю'}
                </p>
                {viewMode === 'week' && weeklyArrow}
              </div>
              <p className="text-sm mt-1">
                {viewMode === 'today'
                  ? `${Math.round(insights.currentDayVolume).toLocaleString('ru-RU')} кг·повт`
                  : `${Math.round(insights.currentWeekVolume || insights.currentWeekVolumeRaw).toLocaleString('ru-RU')} кг·повт`}
                {viewMode === 'week' && insights.baselineWeekVolume != null && (
                  <span className="text-zinc-500"> / baseline {Math.round(insights.baselineWeekVolume).toLocaleString('ru-RU')}</span>
                )}
              </p>
            </section>

            {/* Alerts */}
            <section className={`p-4 rounded-2xl border ${alertStyles} flex items-center justify-between gap-3`}>
              <div className="min-w-0">
                <p className="text-zinc-400 text-sm">Статус</p>
                <p className="text-sm font-medium mt-0.5">{insights.alert.title}</p>
                {insights.alert.description && (
                  <p className="text-xs opacity-90 mt-0.5">{insights.alert.description}</p>
                )}
              </div>
              <Flame className="w-6 h-6 shrink-0 opacity-70" />
            </section>
          </>
        )}
      </main>

      {/* Calendar overlay */}
      {isCalendarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-end p-4"
          onClick={() => setIsCalendarOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsCalendarOpen(false)}
          role="dialog"
          aria-label="Календарь"
        >
          <div
            className="w-full max-w-lg bg-zinc-900 rounded-t-2xl border border-zinc-800 border-b-0 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Календарь</h2>
              <button
                type="button"
                onClick={() => setIsCalendarOpen(false)}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <CalendarWidget
              datesWithLogs={datesWithLogs}
              onDayClick={handleDayClick}
              selectedDate={daySheetDate}
            />
          </div>
        </div>
      )}

      {/* Bottom Sheet: день выбран */}
      {daySheetDate && (
        <div
          className="fixed inset-0 z-40 bg-black/60 flex flex-col items-center justify-end p-4"
          onClick={closeDaySheet}
          onKeyDown={(e) => e.key === 'Escape' && closeDaySheet()}
          role="dialog"
          aria-label="Действия для даты"
        >
          <div
            className="w-full max-w-lg bg-zinc-900 rounded-t-2xl border border-zinc-800 border-b-0 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-zinc-400 text-sm">
                {daySheetDate.replace(/-/g, '.')}
              </p>
              <button
                type="button"
                onClick={closeDaySheet}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={starting}
                onClick={() => daySheetDate && handleStartWorkoutOnDate(daySheetDate)}
                className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center gap-3 text-left disabled:opacity-50"
              >
                <Plus className="w-5 h-5 text-blue-400" />
                {starting ? 'Создание…' : 'Добавить тренировку'}
              </button>
              <button
                type="button"
                onClick={() => {
                  closeDaySheet();
                  onOpenHistory();
                }}
                className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center gap-3 text-left"
              >
                <Pencil className="w-5 h-5 text-zinc-400" />
                Редактировать / История
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка: ввод веса тела с датой */}
      {weightModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-end p-4"
          onClick={() => setWeightModalOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setWeightModalOpen(false)}
          role="dialog"
          aria-label="Вес тела"
        >
          <div
            className="w-full max-w-lg bg-zinc-900 rounded-t-2xl border border-zinc-800 border-b-0 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Вес тела</h2>
              <button
                type="button"
                onClick={() => setWeightModalOpen(false)}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Вес, кг</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Дата</label>
                <input
                  type="date"
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                disabled={savingWeight || !weightInput.trim()}
                onClick={async () => {
                  const kg = parseFloat(weightInput.replace(',', '.'));
                  if (Number.isNaN(kg)) return;
                  setSavingWeight(true);
                  const { error: err } = await saveBodyWeight(kg, weightDate);
                  setSavingWeight(false);
                  if (err) {
                    setError(err.message);
                    return;
                  }
                  const latest = await fetchLatestBodyWeight();
                  setBodyWeight(latest);
                  setWeightModalOpen(false);
                }}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
              >
                {savingWeight ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
