import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { ScreenHeader } from './ScreenHeader';
import { fetchTrainingLogsWindow, fetchAllExercises } from '../lib/api';
import type { TrainingLogRaw } from '../lib/api';
import type { Exercise } from '../types';
import { getCategoryBySlug } from '../data/categories';

interface HistoryScreenProps {
  onBack: () => void;
}

interface SessionGroup {
  sessionId: string;
  date: string;
  durationMin: number;
  categoryNames: string[];
  rows: TrainingLogRaw[];
  exerciseIds: string[];
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function buildSessions(logs: TrainingLogRaw[], exercises: Exercise[]): SessionGroup[] {
  const bySession = new Map<string, TrainingLogRaw[]>();
  logs.forEach((r) => {
    if (!bySession.has(r.session_id)) bySession.set(r.session_id, []);
    bySession.get(r.session_id)!.push(r);
  });

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  const sessions: SessionGroup[] = [];
  bySession.forEach((rows, sessionId) => {
    const sorted = [...rows].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const dateStr = formatDate(first.ts);
    const durationMs = new Date(last.ts).getTime() - new Date(first.ts).getTime();
    const durationMin = Math.round(durationMs / 60000);

    const exerciseIds = Array.from(new Set(rows.map((r) => r.exercise_id)));
    const categorySlugs = Array.from(
      new Set(
        exerciseIds
          .map((id) => exerciseMap.get(id)?.category)
          .filter(Boolean) as string[]
      )
    );
    const categoryNames = categorySlugs
      .map((slug) => getCategoryBySlug(slug)?.name)
      .filter(Boolean) as string[];

    sessions.push({
      sessionId,
      date: dateStr,
      durationMin,
      categoryNames,
      rows: sorted,
      exerciseIds,
    });
  });

  sessions.sort((a, b) => new Date(b.date.replace(/\./g, '-')).getTime() - new Date(a.date.replace(/\./g, '-')).getTime());
  return sessions;
}

function restMin(restS: number): string {
  if (restS <= 0) return '0м';
  const m = Math.round(restS / 60);
  if (m < 60) return `${m}м`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}ч ${rem}м` : `${h}ч`;
}

export function HistoryScreen({ onBack }: HistoryScreenProps) {
  const [logs, setLogs] = useState<TrainingLogRaw[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTrainingLogsWindow(84), fetchAllExercises()]).then(([logList, exList]) => {
      if (!cancelled) {
        setLogs(logList);
        setExercises(exList);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const sessions = useMemo(() => buildSessions(logs, exercises), [logs, exercises]);
  const exerciseMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const toggleSession = (sessionId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set());
      setAllExpanded(false);
    } else {
      setExpandedIds(new Set(sessions.map((s) => s.sessionId)));
      setAllExpanded(true);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ScreenHeader title="История" onBack={onBack} />

      <div className="px-4 pb-3 pt-1 border-b border-zinc-800">
        <button
          type="button"
          onClick={toggleExpandAll}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm"
        >
          {allExpanded ? 'Свернуть все тренировки' : 'Развернуть все тренировки'}
        </button>
      </div>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-3">
        {loading && (
          <p className="text-zinc-400 py-8 text-center">Загрузка...</p>
        )}
        {!loading && sessions.length === 0 && (
          <p className="text-zinc-500 py-8 text-center">Пока нет тренировок</p>
        )}
        {!loading &&
          sessions.map((session) => {
            const isExpanded = expandedIds.has(session.sessionId);
            return (
              <div
                key={session.sessionId}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleSession(session.sessionId)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-zinc-400 text-sm">
                      <Calendar className="w-4 h-4 flex-shrink-0" />
                      <span>{session.date}</span>
                      <span>•</span>
                      <span>{session.durationMin}м</span>
                    </div>
                    <p className="font-semibold text-white mt-0.5">
                      {session.categoryNames.length ? session.categoryNames.join(' • ') : '—'}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-zinc-800 px-4 pb-4 pt-2 space-y-4">
                    {(() => {
                      const byExercise = new Map<string, TrainingLogRaw[]>();
                      session.rows.forEach((r) => {
                        if (!byExercise.has(r.exercise_id)) byExercise.set(r.exercise_id, []);
                        byExercise.get(r.exercise_id)!.push(r);
                      });
                      return Array.from(byExercise.entries()).map(([exId, sets]) => {
                        const ex = exerciseMap.get(exId);
                        const nameRu = ex?.nameRu ?? exId;
                        const nameEn = ex?.nameEn;
                        const sortedSets = [...sets].sort((a, b) => a.set_no - b.set_no);
                        return (
                          <div key={exId} className="space-y-1.5">
                            <p className="font-medium text-white text-sm">
                              {nameRu}
                              {nameEn ? ` / ${nameEn}` : ''}
                            </p>
                            <div className="space-y-1 pl-2">
                              {sortedSets.map((row, i) => {
                                const kg = row.effective_load ?? row.input_wt;
                                const rest = restMin(row.rest_s);
                                return (
                                  <div
                                    key={row.id}
                                    className="flex justify-between items-baseline text-sm text-zinc-300"
                                  >
                                    <span>
                                      {kg} кг × {row.reps} повторений
                                    </span>
                                    <span className="text-zinc-500">отдых {rest}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            );
          })}
      </main>
    </div>
  );
}
