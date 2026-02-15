import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  Flame,
  History,
  MoreHorizontal,
  Plus,
  Pencil,
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
import { buildTrainingMetricRows, computeHomeInsights } from '../lib/analytics';
import { CalendarWidget } from './CalendarWidget';
import type { WorkoutSessionRow } from '../lib/api';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

interface HomeScreenBentoProps {
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

/** Текущая неделя Пн–Вс: массив { day, date, dateStr, status }. */
function getCurrentWeekDays(datesWithLogs: Set<string>): Array<{ day: string; date: number; dateStr: string; status: 'done' | 'missed' | 'today' | 'future' }> {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const todayStr = now.toISOString().slice(0, 10);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const isToday = dateStr === todayStr;
    const hasLog = datesWithLogs.has(dateStr);
    const isFuture = d > now && !isToday;
    let status: 'done' | 'missed' | 'today' | 'future' = 'missed';
    if (isToday) status = 'today';
    else if (isFuture) status = 'future';
    else if (hasLog) status = 'done';

    return {
      day: WEEKDAY_LABELS[i],
      date: d.getDate(),
      dateStr,
      status,
    };
  });
}

function NavButton({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 transition-colors ${isActive ? 'text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}
    >
      <Icon className={`w-6 h-6 ${isActive ? 'fill-current' : ''}`} />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

export function HomeScreenBento({
  onOpenExercises,
  onOpenAnalytics,
  onOpenHistory,
  onSessionStarted,
  onWorkoutFinished,
}: HomeScreenBentoProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReturnType<typeof buildTrainingMetricRows>>([]);
  const [insights, setInsights] = useState<ReturnType<typeof computeHomeInsights> | null>(null);
  const [activeSession, setActiveSession] = useState<WorkoutSessionRow | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [bodyWeight, setBodyWeight] = useState<number | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [daySheetDate, setDaySheetDate] = useState<string | null>(null);
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightDate, setWeightDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [savingWeight, setSavingWeight] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getActiveWorkoutSession().then((s) => {
      if (!cancelled) setActiveSession(s);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
      if (!cancelled) {
        setLoading(false);
        setError(String(e));
      }
    });
    return () => { cancelled = true; };
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
    rows.forEach((r) => set.add(r.ts.slice(0, 10)));
    return set;
  }, [rows]);

  const weekDays = useMemo(() => getCurrentWeekDays(datesWithLogs), [datesWithLogs]);

  const monthlyLabel = useMemo(() => {
    const now = new Date();
    const months = 'Январь Февраль Март Апрель Май Июнь Июль Август Сентябрь Октябрь Ноябрь Декабрь'.split(' ');
    return `${months[now.getMonth()]} ${now.getFullYear()}`;
  }, []);

  const weeklyTarget = 3;
  const currentWeekCount = insights?.currentWeekCount ?? 0;
  const weeklyRatio = Math.min(1, currentWeekCount / Math.max(1, weeklyTarget));
  const weekVolumeKg = insights?.currentWeekVolume ?? insights?.currentWeekVolumeRaw ?? 0;
  const weekVolumeTons = (weekVolumeKg / 1000).toFixed(1);
  const weeklyLoadState = insights?.weeklyLoadState;
  const volumeTrend = weeklyLoadState === 'up' ? '+ к прошлой нед.' : weeklyLoadState === 'down' ? '− к прошлой нед.' : 'как прошлая нед.';

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
    try {
      sessionStorage.setItem(`gym-backdated-${result.id}`, JSON.stringify({ startedAt, openedAt }));
    } catch (_) {}
    setActiveSession({
      id: result.id,
      started_at: new Date().toISOString(),
      ended_at: null,
      name: null,
      status: 'active',
    });
    setElapsedMs(0);
    setDaySheetDate(null);
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

  const closeDaySheet = () => setDaySheetDate(null);

  const alert = insights?.alert ?? { title: 'Загрузка…', description: '', status: 'INFO' as const };
  const statusBarWidth = alert.status === 'ERROR' ? 1 : alert.status === 'WARNING' ? 0.6 : 0.75;

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24 font-sans selection:bg-blue-500/30">
      {/* 1. WEEK STRIP */}
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/50 pt-4 pb-2 px-4">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-lg font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {monthlyLabel}
          </h1>
          <button
            type="button"
            onClick={() => setIsCalendarOpen(true)}
            className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400"
            aria-label="Календарь"
          >
            <CalendarDays className="w-4 h-4" />
          </button>
        </div>

        <div className="max-w-lg mx-auto flex gap-1">
          {weekDays.map((item) => {
            const isToday = item.status === 'today';
            const isDone = item.status === 'done';
            return (
              <button
                key={item.dateStr}
                type="button"
                onClick={() => setDaySheetDate(item.dateStr)}
                className="flex flex-col items-center gap-1.5 flex-1 min-w-0 cursor-pointer group"
              >
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide ${isToday ? 'text-blue-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}
                >
                  {item.day}
                </span>
                <div
                  className={`
                    w-full max-w-12 h-12 rounded-xl flex items-center justify-center text-sm font-semibold transition-all relative
                    ${isToday
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 scale-105'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:border-zinc-700'}
                  `}
                >
                  {item.date}
                  {isDone && (
                    <div className="absolute -bottom-1.5 w-1 h-1 rounded-full bg-emerald-400 ring-2 ring-zinc-950" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </header>

      <main className="px-4 mt-6 space-y-6 max-w-lg mx-auto">
        {loading && <p className="text-zinc-400">Загрузка…</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {!loading && (
          <>
            {/* 2. HERO ACTION */}
            <section className="relative overflow-hidden rounded-3xl p-6 shadow-2xl shadow-blue-900/20 group cursor-pointer transition-transform active:scale-[0.98]">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700" />
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/20 to-transparent" />

              <div className="relative z-10">
                {activeSession ? (
                  <>
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h2 className="text-2xl font-bold text-white leading-tight">Идёт тренировка</h2>
                        <p className="text-blue-100/80 text-sm mt-1 font-mono">{formatElapsed(elapsedMs)}</p>
                      </div>
                      <div className="bg-white/20 backdrop-blur-md p-2 rounded-xl text-white">
                        <Dumbbell className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={onOpenExercises}
                        className="flex-1 bg-white text-blue-700 font-bold py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors"
                      >
                        Продолжить
                        <ChevronRight className="w-4 h-4 opacity-60" />
                      </button>
                      <button
                        type="button"
                        onClick={handleFinishWorkout}
                        disabled={finishing}
                        className="px-4 py-3.5 rounded-xl bg-white/20 text-white font-medium disabled:opacity-50"
                      >
                        {finishing ? '…' : 'Завершить'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <h2 className="text-3xl font-bold text-white leading-tight">Начать<br />тренировку</h2>
                        <p className="text-blue-100/80 text-sm mt-1 font-medium">Выбери категорию и упражнения</p>
                      </div>
                      <div className="bg-white/20 backdrop-blur-md p-2 rounded-xl text-white">
                        <Dumbbell className="w-6 h-6" />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartWorkout}
                      disabled={starting}
                      className="w-full bg-white text-blue-700 font-bold py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                      {starting ? 'Создаём…' : 'Начать тренировку'}
                      <ChevronRight className="w-4 h-4 opacity-60" />
                    </button>
                  </>
                )}
              </div>
            </section>

            {/* 3. BENTO GRID */}
            <section className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onOpenAnalytics}
                className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-2xl flex flex-col justify-between h-36 relative overflow-hidden text-left"
              >
                <div className="absolute top-0 right-0 p-3 opacity-10">
                  <Activity className="w-16 h-16 text-white" />
                </div>
                <div className="flex items-center gap-2 text-zinc-400 mb-2">
                  <Activity className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase">Тоннаж</span>
                </div>
                <div>
                  <span className="text-2xl font-mono font-bold text-white">{weekVolumeTons}</span>
                  <span className="text-sm text-zinc-500 ml-1">т</span>
                </div>
                <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {volumeTrend}
                </div>
              </button>

              <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-2xl flex flex-col justify-between h-36">
                <div className="flex items-center gap-2 text-zinc-400 mb-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span className="text-xs font-medium uppercase">Статус</span>
                </div>
                <div>
                  <div className="text-lg font-bold text-white leading-tight">{alert.title}</div>
                  <div className="text-xs text-zinc-500 mt-1">{alert.description || 'Готов к нагрузке'}</div>
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-orange-400 to-red-500 h-full rounded-full transition-all"
                    style={{ width: `${statusBarWidth * 100}%` }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCalendarOpen(true)}
                className="col-span-2 bg-zinc-900 border border-zinc-800/60 p-4 rounded-2xl flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Цель: {weeklyTarget} тренировки</div>
                    <div className="text-xs text-zinc-500">Выполнено {currentWeekCount} из {weeklyTarget}</div>
                  </div>
                </div>
                <div
                  className="relative w-10 h-10 rounded-full flex-shrink-0"
                  style={{
                    background: `conic-gradient(from -90deg, rgb(59 130 246) 0deg, rgb(59 130 246) ${weeklyRatio * 360}deg, rgb(39 39 42) ${weeklyRatio * 360}deg, rgb(39 39 42) 360deg)`,
                  }}
                  aria-hidden
                >
                  <div className="absolute inset-1 rounded-full bg-zinc-900" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setWeightInput(bodyWeight != null ? String(bodyWeight) : '');
                  setWeightDate(new Date().toISOString().slice(0, 10));
                  setWeightModalOpen(true);
                }}
                className="col-span-2 bg-zinc-900 border border-zinc-800/60 p-4 rounded-2xl flex items-center justify-between text-left"
              >
                <div>
                  <div className="text-xs font-medium uppercase text-zinc-400">Мой вес</div>
                  <div className="text-xl font-semibold text-white mt-0.5">
                    {bodyWeight != null ? `${bodyWeight} кг` : '—'}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">для effective load (гравитрон и др.)</div>
                </div>
                <span className="text-zinc-500 text-sm">Изменить</span>
              </button>
            </section>
          </>
        )}
      </main>

      {/* 4. BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-lg border-t border-zinc-800 pb-safe pt-2 px-6">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <NavButton icon={Dumbbell} label="Тренировка" isActive onClick={onOpenExercises} />
          <NavButton icon={History} label="История" onClick={onOpenHistory} />
          <NavButton icon={BarChart3} label="Аналитика" onClick={onOpenAnalytics} />
          <NavButton
            icon={MoreHorizontal}
            label="Меню"
            onClick={() => setIsCalendarOpen(true)}
          />
        </div>
      </nav>

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
              onDayClick={(date) => {
                setDaySheetDate(date);
                setIsCalendarOpen(false);
              }}
              selectedDate={daySheetDate}
            />
          </div>
        </div>
      )}

      {/* Day sheet */}
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
              <p className="text-zinc-400 text-sm">{daySheetDate.replace(/-/g, '.')}</p>
              <button type="button" onClick={closeDaySheet} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400" aria-label="Закрыть">
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

      {/* Weight modal */}
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
                <label className="block text-zinc-400 text-sm mb-2">Дата</label>
                <CalendarWidget
                  datesWithLogs={new Set()}
                  selectedDate={weightDate}
                  onDayClick={(date) => setWeightDate(date)}
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
