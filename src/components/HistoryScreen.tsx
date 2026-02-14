import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronDown, ChevronRight, Calendar, Link2 } from 'lucide-react';
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

/** Одна дата = одна тренировка. Все подходы за день объединяются в один блок. */
function buildSessions(logs: TrainingLogRaw[], exercises: Exercise[]): SessionGroup[] {
  const byDate = new Map<string, TrainingLogRaw[]>();
  logs.forEach((r) => {
    const dateStr = formatDate(r.ts);
    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    byDate.get(dateStr)!.push(r);
  });

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  const sessions: SessionGroup[] = [];
  byDate.forEach((rows, dateStr) => {
    const sorted = [...rows].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
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
      sessionId: dateStr,
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
  const m = restS / 60;
  const fmt = (x: number) => (x % 1 === 0 ? String(Math.round(x)) : String(Number(x.toFixed(1))));
  if (m < 60) return `${fmt(m)}м`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}ч ${fmt(rem)}м` : `${h}ч`;
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
                      // Суперсет: один set_group_id (одно нажатие «Завершить») и один set_no у нескольких упражнений
                      const supersetExerciseIds = new Set<string>();
                      const bySetGroupId = new Map<string, TrainingLogRaw[]>();
                      session.rows.forEach((r) => {
                        const gid = r.set_group_id;
                        if (!bySetGroupId.has(gid)) bySetGroupId.set(gid, []);
                        bySetGroupId.get(gid)!.push(r);
                      });
                      bySetGroupId.forEach((rows) => {
                        const bySetNo = new Map<number, TrainingLogRaw[]>();
                        rows.forEach((r) => {
                          const no = r.set_no;
                          if (!bySetNo.has(no)) bySetNo.set(no, []);
                          bySetNo.get(no)!.push(r);
                        });
                        bySetNo.forEach((setRows) => {
                          if (setRows.length > 1)
                            setRows.forEach((r) => supersetExerciseIds.add(r.exercise_id));
                        });
                      });
                      const byExercise = new Map<string, TrainingLogRaw[]>();
                      session.rows.forEach((r) => {
                        if (!byExercise.has(r.exercise_id)) byExercise.set(r.exercise_id, []);
                        byExercise.get(r.exercise_id)!.push(r);
                      });
                      const exerciseOrder = [...byExercise.keys()].sort(
                        (a, b) =>
                          new Date(byExercise.get(a)![0].ts).getTime() - new Date(byExercise.get(b)![0].ts).getTime()
                      );
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
                      const renderExercise = (exId: string) => {
                        const sets = byExercise.get(exId)!;
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
                              {sortedSets.map((row) => {
                                const kg = row.effective_load ?? row.input_wt;
                                const rest = restMin(row.rest_s);
                                return (
                                  <div
                                    key={row.id}
                                    className="flex justify-between items-baseline text-sm text-zinc-300 gap-2"
                                  >
                                    <span className="min-w-0">
                                      {kg} кг × {row.reps} повторений
                                    </span>
                                    <span className="text-zinc-500 flex-shrink-0">отдых {rest}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      };
                      return runs.map((run, runIdx) =>
                        run.superset ? (
                          <div
                            key={`superset-${runIdx}`}
                            className="rounded-xl border-l-4 border-blue-500 bg-blue-500/5 pl-3 pr-2 py-2 space-y-3"
                          >
                            <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wider">
                              <Link2 className="w-4 h-4 flex-shrink-0" />
                              СУПЕРСЕТ
                            </div>
                            {run.exIds.map(renderExercise)}
                          </div>
                        ) : (
                          <div key={`solo-${runIdx}`} className="space-y-4">
                            {run.exIds.map(renderExercise)}
                          </div>
                        )
                      );
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
