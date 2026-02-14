import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, CalendarDays, Dumbbell, Flame, History, TrendingDown, TrendingUp } from 'lucide-react';
import { fetchAllExercises, fetchTrainingLogsWindow } from '../lib/api';
import { buildTrainingMetricRows, computeHomeInsights } from '../lib/analytics';

interface HomeScreenProps {
  onOpenExercises: () => void;
  onOpenAnalytics: () => void;
  onOpenHistory: () => void;
}

export function HomeScreen({ onOpenExercises, onOpenAnalytics, onOpenHistory }: HomeScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReturnType<typeof buildTrainingMetricRows>>([]);
  const [insights, setInsights] = useState<ReturnType<typeof computeHomeInsights> | null>(null);

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
      if (cancelled) return;
      setLoading(false);
      setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const weeklyTarget = 3;
  const currentWeekCount = insights?.currentWeekCount ?? 0;
  const weeklyRatio = Math.min(1, currentWeekCount / weeklyTarget);

  const weeklyArrow = useMemo(() => {
    if (!insights) return <Activity className="w-5 h-5 text-zinc-400" />;
    if (insights.weeklyLoadState === 'up') return <TrendingUp className="w-5 h-5 text-emerald-400" />;
    if (insights.weeklyLoadState === 'down') return <TrendingDown className="w-5 h-5 text-amber-400" />;
    return <Activity className="w-5 h-5 text-zinc-400" />;
  }, [insights]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Gym Dashboard</h1>
            <p className="text-xs text-zinc-400">Сегодня/неделя</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenHistory}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm flex items-center gap-2"
            >
              <History className="w-4 h-4" /> История
            </button>
            <button
              type="button"
              onClick={onOpenAnalytics}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" /> Аналитика
            </button>
            <button
              type="button"
              onClick={onOpenExercises}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm flex items-center gap-2"
            >
              <Dumbbell className="w-4 h-4" /> Тренировка
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-lg mx-auto p-4 space-y-3">
        {loading && <p className="text-zinc-400">Загрузка...</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {!loading && insights && (
          <>
            <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-zinc-400 text-sm">Attendance</p>
                  <p className="text-2xl font-semibold">{currentWeekCount} / {weeklyTarget}</p>
                  <p className="text-xs text-zinc-500">Серия недель ≥2: {insights.streakWeeks}</p>
                </div>
                <CalendarDays className="w-7 h-7 text-zinc-500" />
              </div>
              <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: `${weeklyRatio * 100}%` }} />
              </div>
            </section>

            <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <p className="text-zinc-400 text-sm">Today plan / status</p>
              <p className="mt-1 text-sm">
                Сегодня: тренировка №{Math.min(currentWeekCount + 1, weeklyTarget)} · Ramp: {insights.ramp.active ? 'да' : 'нет'}
              </p>
              {insights.ramp.active && (
                <p className="text-xs text-zinc-500 mt-1">
                  Разрыв: {insights.ramp.gapDays} дн., сессий ramp осталось: {insights.ramp.sessionsRemaining}
                </p>
              )}
            </section>

            <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between">
                <p className="text-zinc-400 text-sm">Weekly Load</p>
                {weeklyArrow}
              </div>
              <p className="text-sm mt-1">
                {Math.round(insights.currentWeekVolume)} кг·повт
                {insights.baselineWeekVolume != null && (
                  <span className="text-zinc-500"> / baseline {Math.round(insights.baselineWeekVolume)}</span>
                )}
              </p>
            </section>

            <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-sm">Alerts</p>
                <p className="text-sm mt-1">{insights.alert}</p>
              </div>
              <Flame className="w-6 h-6 text-zinc-500" />
            </section>

            <p className="text-[11px] text-zinc-600">Логов в расчете: {rows.length}</p>
          </>
        )}
      </main>
    </div>
  );
}
