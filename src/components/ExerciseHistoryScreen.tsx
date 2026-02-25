import { useState, useEffect } from 'react';
import { ChevronDown, Calendar } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import { fetchExerciseHistory, type ExerciseHistoryRow } from '../lib/api';
import type { Exercise } from '../types';

interface ExerciseHistoryScreenProps {
  exercise: Exercise;
  onBack: () => void;
}

function formatDate(createdAt: string): string {
  const d = new Date(createdAt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function formatKg(kg: number): string {
  return kg % 1 === 0 ? String(Math.round(kg)) : kg.toFixed(1);
}

function formatRest(sec?: number): string {
  if (sec == null || sec <= 0) return '0м';
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}ч ${m % 60}м` : `${m}м`;
}

export function ExerciseHistoryScreen({ exercise, onBack }: ExerciseHistoryScreenProps) {
  const [rows, setRows] = useState<ExerciseHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchExerciseHistory(exercise.id, 50).then((list) => {
      if (!cancelled) {
        setRows(list);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [exercise.id]);

  const byDate = new Map<string, ExerciseHistoryRow[]>();
  rows.forEach((row) => {
    const dateStr = formatDate(row.createdAt);
    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    byDate.get(dateStr)!.push(row);
  });
  const sortedDates = Array.from(byDate.keys()).sort(
    (a, b) => new Date(b.replace(/\./g, '-')).getTime() - new Date(a.replace(/\./g, '-')).getTime()
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ScreenHeader title="История" onBack={onBack} />

      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        {/* Карточка с названием упражнения */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-zinc-100 break-words flex-1 min-w-0">
            {exercise.nameRu}
            {exercise.nameEn && (
              <span className="text-zinc-500 font-normal ml-2 text-sm">/ {exercise.nameEn}</span>
            )}
          </h2>
          <ChevronDown className="w-5 h-5 text-zinc-500 flex-shrink-0" aria-hidden />
        </div>

        {loading && (
          <p className="text-zinc-500 py-8 text-center">Загрузка…</p>
        )}
        {!loading && sortedDates.length === 0 && (
          <p className="text-zinc-500 py-8 text-center">Нет записей по этому упражнению</p>
        )}
        {!loading && sortedDates.length > 0 && (
          <div className="space-y-4">
            {sortedDates.map((dateStr) => (
              <div key={dateStr}>
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  <span>{dateStr}</span>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                  {(byDate.get(dateStr) ?? []).map((row) => {
                    const kg = row.effectiveLoad ?? row.weight ?? 0;
                    const rest = formatRest(row.restSeconds);
                    return (
                      <div
                        key={row.id}
                        className="px-3 py-2.5 border-b border-zinc-800/50 last:border-b-0 text-sm text-zinc-300"
                      >
                        {formatKg(kg)} кг × {row.reps} повт, {rest}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
