import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronLeft, LineChart } from 'lucide-react';
import { fetchAllExercises, fetchTrainingLogsWindow } from '../lib/api';
import {
  buildExerciseProgressAndRisk,
  buildRampGaps,
  buildTrainingMetricRows,
  buildWeeklySeries,
} from '../lib/analytics';
import { computeExerciseBaseline, median } from '../lib/metrics';
import type { Exercise } from '../types';

interface AnalyticsScreenProps {
  onBack: () => void;
}

type Tab = 'overview' | 'exercise' | 'ramp';

function formatInt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}
function formatDecimal(n: number, frac = 1): string {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

export function AnalyticsScreen({ onBack }: AnalyticsScreenProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [rows, setRows] = useState<ReturnType<typeof buildTrainingMetricRows>>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [logs, ex] = await Promise.all([
        fetchTrainingLogsWindow(120),
        fetchAllExercises(),
      ]);
      if (cancelled) return;
      const metricRows = buildTrainingMetricRows(logs, ex);
      setRows(metricRows);
      setExercises(ex);
      // #region agent log
      if (typeof fetch !== 'undefined') {
        const weeklySeries = buildWeeklySeries(metricRows, 12);
        const totalSessions = weeklySeries.reduce((s, w) => s + w.sessions, 0);
        const totalVolume = weeklySeries.reduce((s, w) => s + w.volume, 0);
        const trendRows = buildExerciseProgressAndRisk(metricRows, ex);
        fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'AnalyticsScreen.tsx:useEffect',
            message: 'analytics loaded',
            data: { logsCount: logs.length, metricRowsCount: metricRows.length, totalSessions12w: totalSessions, totalVolume12w: totalVolume, trendRowsCount: trendRows.length },
            timestamp: Date.now(),
            hypothesisId: 'H3,H4',
          }),
        }).catch(() => {});
      }
      // #endregion
      const idsWithData = new Set(metricRows.map((r) => r.exerciseId));
      const firstWithData = ex.find((e) => idsWithData.has(e.id))?.id ?? '';
      setSelectedExerciseId((prev) => (idsWithData.has(prev) ? prev : firstWithData));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const weeklySeries = useMemo(() => buildWeeklySeries(rows, 12), [rows]);
  const trendRows = useMemo(() => buildExerciseProgressAndRisk(rows, exercises), [rows, exercises]);
  const topProgress = useMemo(
    () => [...trendRows].sort((a, b) => b.progressPct - a.progressPct).slice(0, 5),
    [trendRows],
  );
  const topRisk = useMemo(
    () => [...trendRows].sort((a, b) => b.riskScore - a.riskScore).filter((x) => x.riskScore > 0).slice(0, 5),
    [trendRows],
  );

  const exercisesWithData = useMemo(() => {
    const ids = new Set(rows.map((r) => r.exerciseId));
    return exercises.filter((e) => ids.has(e.id));
  }, [rows, exercises]);

  const selectedExerciseRows = useMemo(
    () => rows.filter((r) => r.exerciseId === selectedExerciseId),
    [rows, selectedExerciseId],
  );
  const selectedExercise = useMemo(
    () => exercises.find((e) => e.id === selectedExerciseId) ?? null,
    [exercises, selectedExerciseId],
  );
  const selectedBaseline = useMemo(
    () => computeExerciseBaseline(selectedExerciseRows),
    [selectedExerciseRows],
  );
  // #region agent log
  if (typeof fetch !== 'undefined' && selectedExerciseRows.length >= 0) {
    const base = selectedBaseline;
    fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'AnalyticsScreen.tsx:selectedExercise',
        message: 'exercise tab data',
        data: { selectedExerciseId, selectedExerciseRowsCount: selectedExerciseRows.length, baselineVolumePerSet: base?.baselineVolumePerSet ?? null, baselineWeeklyVolume: base?.baselineWeeklyVolume ?? null },
        timestamp: Date.now(),
        hypothesisId: 'H1,H2',
      }),
    }).catch(() => {});
  }
  // #endregion
  const selectedWeekly = useMemo(
    () => buildWeeklySeries(selectedExerciseRows, 12),
    [selectedExerciseRows],
  );
  const selectedRampCount = useMemo(
    () => buildRampGaps(selectedExerciseRows).length,
    [selectedExerciseRows],
  );
  const gaps = useMemo(() => buildRampGaps(rows), [rows]);

  const maxSessions = Math.max(1, ...weeklySeries.map((x) => x.sessions));
  const maxVolume = Math.max(1, ...weeklySeries.map((x) => x.volume));
  const maxSelectedVolume = Math.max(1, ...selectedWeekly.map((x) => x.volume));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="p-2 text-zinc-400 hover:text-white">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl font-bold">Аналитика</h1>
              <p className="text-xs text-zinc-400">горизонт 4–12 недель</p>
            </div>
          </div>
          <div className="text-xs text-zinc-500">логи: {rows.length}</div>
        </div>
        <div className="max-w-lg mx-auto px-4 pb-3 flex gap-2">
          {(['overview', 'exercise', 'ramp'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                tab === t ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              {t === 'overview' ? 'Обзор' : t === 'exercise' ? 'Упражнение' : 'Вкат/пропуски'}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {loading && <p className="text-zinc-400">Загрузка...</p>}

        {!loading && tab === 'overview' && (
          <>
            <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2 mb-3"><LineChart className="w-4 h-4" /><h2>Sessions / Week</h2></div>
              <ul className="space-y-2">
                {weeklySeries.map((p) => (
                  <li key={p.weekKey} className="text-sm">
                    <div className="flex justify-between"><span>{p.label}</span><span>{formatInt(p.sessions)}</span></div>
                    <div className="h-1.5 bg-zinc-800 rounded overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${(p.sessions / maxSessions) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2 mb-3"><BarChart3 className="w-4 h-4" /><h2>Weekly Total Volume (кг)</h2></div>
              <ul className="space-y-2">
                {weeklySeries.map((p) => (
                  <li key={`${p.weekKey}-v`} className="text-sm">
                    <div className="flex justify-between"><span>{p.label}</span><span>{formatInt(Math.round(p.volume))}</span></div>
                    <div className="h-1.5 bg-zinc-800 rounded overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${(p.volume / maxVolume) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <h3 className="text-sm text-zinc-400 mb-2">Top 5 прогресс baseline</h3>
              <ul className="space-y-2 text-sm">
                {topProgress.length === 0 && <li className="text-zinc-500">Недостаточно данных</li>}
                {topProgress.map((x) => (
                  <li key={`p-${x.exerciseId}`} className="flex justify-between">
                    <span className="truncate max-w-[70%]">{x.exerciseName}</span>
                    <span className={x.progressPct >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                      {x.progressPct >= 0 ? '+' : ''}{formatDecimal(x.progressPct)}%
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <h3 className="text-sm text-zinc-400 mb-2">Top 5 риск перегруза</h3>
              <ul className="space-y-2 text-sm">
                {topRisk.length === 0 && <li className="text-zinc-500">Нет активных рисков</li>}
                {topRisk.map((x) => (
                  <li key={`r-${x.exerciseId}`} className="flex justify-between">
                    <span className="truncate max-w-[70%]">{x.exerciseName}</span>
                    <span className={x.riskScore >= 3 ? 'text-red-400' : 'text-amber-400'}>
                      {x.riskScore >= 3 ? '🔴 overload' : '🟡 warning'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {!loading && tab === 'exercise' && (
          <>
            <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <label className="text-sm text-zinc-400">Упражнение</label>
              <select
                value={selectedExerciseId}
                onChange={(e) => setSelectedExerciseId(e.target.value)}
                className="w-full mt-2 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2"
              >
                {exercisesWithData.length === 0 ? (
                  <option value="">Нет данных за период</option>
                ) : (
                  exercisesWithData.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.nameRu}</option>
                  ))
                )}
              </select>
            </section>

            {selectedExercise && (
              <>
                <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
                  <h3 className="font-medium mb-2">{selectedExercise.nameRu}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-zinc-800/60 rounded-lg p-2">
                      <p className="text-zinc-400 text-xs">baseline median set volume (кг)</p>
                      <p>{selectedBaseline.baselineVolumePerSet != null ? formatInt(Math.round(selectedBaseline.baselineVolumePerSet)) : '—'}</p>
                    </div>
                    <div className="bg-zinc-800/60 rounded-lg p-2">
                      <p className="text-zinc-400 text-xs">baseline weekly volume (кг)</p>
                      <p>{selectedBaseline.baselineWeeklyVolume != null ? formatInt(Math.round(selectedBaseline.baselineWeeklyVolume)) : '—'}</p>
                    </div>
                    <div className="bg-zinc-800/60 rounded-lg p-2">
                      <p className="text-zinc-400 text-xs">ramp flags count</p>
                      <p>{formatInt(selectedRampCount)}</p>
                    </div>
                  </div>
                </section>

                <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
                  <h4 className="text-sm text-zinc-400 mb-2">Weekly volume trend (кг)</h4>
                  <ul className="space-y-2">
                    {selectedWeekly.map((p) => (
                      <li key={`sv-${p.weekKey}`} className="text-sm">
                        <div className="flex justify-between"><span>{p.label}</span><span>{formatInt(Math.round(p.volume))}</span></div>
                        <div className="h-1.5 bg-zinc-800 rounded overflow-hidden">
                          <div className="h-full bg-violet-500" style={{ width: `${(p.volume / maxSelectedVolume) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </>
        )}

        {!loading && tab === 'ramp' && (
          <section className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4" />
              <h2>Разрывы ≥7 дней</h2>
            </div>
            {gaps.length === 0 ? (
              <p className="text-zinc-500 text-sm">Разрывов не найдено</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {gaps.map((g, idx) => (
                  <li key={`${g.from}-${idx}`} className="p-2 rounded-lg bg-zinc-800/60">
                    <div>{new Date(g.from).toISOString().slice(0, 10).replace(/-/g, '.')} → {new Date(g.to).toISOString().slice(0, 10).replace(/-/g, '.')}</div>
                    <div className="text-zinc-400 text-xs">разрыв: {g.days} дней</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
