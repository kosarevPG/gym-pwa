import { useEffect, useState } from 'react';
import { CheckCircle2, Home, Timer, TrendingUp } from 'lucide-react';
import { getWorkoutSummary } from '../lib/api';

interface WorkoutSummaryScreenProps {
  sessionId: string;
  onGoHome: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h}ч ${rm}м` : `${h}ч`;
  }
  return s ? `${m}м ${s}с` : `${m}м`;
}

export function WorkoutSummaryScreen({ sessionId, onGoHome }: WorkoutSummaryScreenProps) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getWorkoutSummary>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getWorkoutSummary(sessionId).then((summary) => {
      if (!cancelled) {
        setData(summary);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">Загрузка итогов...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
        <p className="text-zinc-400 mb-4">Не удалось загрузить итоги</p>
        <button
          type="button"
          onClick={onGoHome}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white"
        >
          На главную
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Тренировка завершена</h1>
        <p className="text-zinc-400 mb-8">Молодец!</p>

        <div className="w-full max-w-sm space-y-4">
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-4">
            <Timer className="w-8 h-8 text-blue-400 shrink-0" />
            <div className="text-left">
              <p className="text-zinc-400 text-sm">Время</p>
              <p className="text-xl font-semibold">{formatDuration(data.durationSec)}</p>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-4">
            <TrendingUp className="w-8 h-8 text-amber-400 shrink-0" />
            <div className="text-left">
              <p className="text-zinc-400 text-sm">Тоннаж</p>
              <p className="text-xl font-semibold">{data.tonnageKg.toLocaleString('ru-RU')} кг·повт</p>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-400">Подходов</span>
            <span className="text-xl font-semibold">{data.setsCount}</span>
          </div>
          {data.avgRpe != null && data.avgRpe > 0 && (
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-400">Средний RPE</span>
              <span className="text-xl font-semibold">{data.avgRpe}</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 border-t border-zinc-800">
        <button
          type="button"
          onClick={onGoHome}
          className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center justify-center gap-2"
        >
          <Home className="w-5 h-5" />
          На главную
        </button>
      </div>
    </div>
  );
}
