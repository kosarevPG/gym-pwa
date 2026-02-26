import type { Exercise } from '../types';
import type { TrainingLogRaw } from './api';
import {
  calcEffectiveLoadKg,
  calcSetVolumeKg,
  calcSideMult,
  computeAttendancePerWeek,
  computeAttendanceStreak,
  computeExerciseBaseline,
  computeFatigueFlag,
  computeRampStatus,
  computeUnderloadFlag,
  computeWeeklyVolume,
  computeWeeklyVolumeRaw,
  markWarmupSets,
  median,
  type TrainingMetricRow,
} from './metrics';

function weekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function prevWeekKey(current: string): string {
  const d = new Date(`${current}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekKey: string): string {
  return weekKey.replace(/-/g, '.');
}

function getTypeFromExercise(exercise: Exercise): TrainingMetricRow['type'] {
  const t = exercise.weightType ?? 'standard';
  if (t === 'bodyweight' && exercise.bodyweightType === 'ASSISTED') return 'assisted';
  if (t === 'barbell' || t === 'dumbbell' || t === 'machine' || t === 'bodyweight' || t === 'assisted') return t;
  return 'standard';
}

function getMultiplierFromExercise(exercise: Exercise): number {
  return exercise.simultaneous ? 2 : 1;
}

export function buildTrainingMetricRows(logs: TrainingLogRaw[], exercises: Exercise[]): TrainingMetricRow[] {
  const map = new Map(exercises.map((e) => [e.id, e]));
  const result = logs
    .map<TrainingMetricRow | null>((log) => {
      const ex = map.get(log.exercise_id);
      if (!ex) return null;
      const type = getTypeFromExercise(ex);
      const sideMult = log.side_mult ?? calcSideMult(type, log.side);
      const effective =
        log.effective_load ??
        calcEffectiveLoadKg({
          type,
          inputWt: log.input_wt,
          bodyWt: log.body_wt_snapshot,
          baseWt: ex.baseWeight ?? 0,
          multiplier: getMultiplierFromExercise(ex),
        });
      const setVolume =
        log.set_volume ??
        calcSetVolumeKg({
          effectiveLoad: effective,
          reps: log.reps,
          sideMult,
        });
      return {
        ts: log.ts,
        sessionId: log.session_id,
        exerciseId: log.exercise_id,
        setNo: log.set_no,
        reps: log.reps,
        inputWt: log.input_wt,
        side: log.side,
        rpe: log.rpe,
        restS: log.rest_s,
        bodyWtSnapshot: log.body_wt_snapshot,
        type,
        baseWt: ex.baseWeight ?? 0,
        multiplier: getMultiplierFromExercise(ex),
        allow1rm: type !== 'bodyweight' && type !== 'assisted',
        group: ex.category,
        effectiveLoad: effective,
        sideMult,
        setVolume,
      };
    })
    .filter((r): r is TrainingMetricRow => r !== null);

  // #region agent log
  if (typeof fetch !== 'undefined') {
    const dropped = logs.length - result.length;
    fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'analytics.ts:buildTrainingMetricRows',
        message: 'metric rows',
        data: { logsIn: logs.length, exercisesCount: exercises.length, rowsOut: result.length, dropped },
        timestamp: Date.now(),
        hypothesisId: 'H2',
      }),
    }).catch(() => {});
  }
  // #endregion

  return result;
}

export type AlertStatus = 'OK' | 'WARNING' | 'ERROR';

export interface AlertItem {
  status: AlertStatus;
  title: string;
  description: string;
}

export interface HomeInsights {
  currentWeekCount: number;
  streakWeeks: number;
  currentWeekVolume: number;
  /** Объём за неделю без исключения разминки (для отображения при 0 рабочего объёма). */
  currentWeekVolumeRaw: number;
  /** Объём за сегодня (все подходы). */
  currentDayVolume: number;
  baselineWeekVolume: number | null;
  ramp: { active: boolean; sessionsRemaining: number; gapDays: number };
  alert: AlertItem;
  weeklyLoadState: 'up' | 'neutral' | 'down';
}

/** Неделя считается Пн–Вс (UTC). currentWeekCount — уникальные сессии за неделю. */
export interface TodaySessionStatus {
  hasLogs: boolean;
}

export function getTodaySessionStatus(rows: TrainingMetricRow[]): TodaySessionStatus {
  const today = new Date().toISOString().slice(0, 10);
  const hasLogs = rows.some((r) => r.ts.slice(0, 10) === today);
  return { hasLogs };
}

export function computeHomeInsights(rows: TrainingMetricRow[], exercises: Exercise[]): HomeInsights {
  const attendance = computeAttendancePerWeek(rows);
  const weeklyVolume = computeWeeklyVolume(rows);
  const weeklyVolumeRaw = computeWeeklyVolumeRaw(rows);
  const week = weekStart(new Date());
  const prevWeek = prevWeekKey(week);
  const currentWeekCount = attendance.get(week) ?? 0;
  const streakWeeks = computeAttendanceStreak(attendance, 3);
  const currentWeekVolume = weeklyVolume.get(week) ?? 0;
  const currentWeekVolumeRaw = weeklyVolumeRaw.get(week) ?? 0;

  const todayIso = new Date().toISOString().slice(0, 10);
  const marked = markWarmupSets(rows);
  const currentDayVolume = marked
    .filter((r) => r.ts.slice(0, 10) === todayIso)
    .reduce((sum, r) => sum + r.derivedVolume, 0);

  const baselineCandidates = Array.from(weeklyVolume.entries())
    .filter(([key]) => key !== week)
    .map(([, v]) => v);
  const baselineWeekVolume = median(baselineCandidates);

  const ramp = computeRampStatus(rows);
  const attendanceOk = currentWeekCount >= 3;
  const attendanceRecentAvg = (() => {
    const recent = Array.from(attendance.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 4)
      .map(([, count]) => count);
    if (recent.length === 0) return 0;
    return recent.reduce((acc, n) => acc + n, 0) / recent.length;
  })();
  const baselineAttendanceOk = attendanceRecentAvg >= 3;
  const prevWeekVolume = weeklyVolume.get(prevWeek) ?? 0;

  let overloadExercise: string | null = null;
  let warningExercise: string | null = null;
  let underloadExercise: string | null = null;

  const byExercise = new Map<string, TrainingMetricRow[]>();
  rows.forEach((r) => {
    if (!byExercise.has(r.exerciseId)) byExercise.set(r.exerciseId, []);
    byExercise.get(r.exerciseId)!.push(r);
  });
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  for (const [exerciseId, exRows] of byExercise.entries()) {
    const exWeekRows = exRows.filter((r) => weekStart(new Date(r.ts)) === week);
    const exPrevRows = exRows.filter((r) => weekStart(new Date(r.ts)) === prevWeek);
    if (exWeekRows.length === 0) continue;

    const baseline = computeExerciseBaseline(exRows, { attendanceOk: baselineAttendanceOk });
    const weekly = exWeekRows.reduce((acc, r) => acc + (r.setVolume ?? 0), 0);
    const medReps = median(exWeekRows.map((r) => r.reps)) ?? 0;
    const fatigue = computeFatigueFlag({
      weeklyVolume: weekly,
      baselineWeeklyVolume: baseline.baselineWeeklyVolume,
      baselineReps: baseline.baselineReps,
      medianReps: medReps,
    });
    const underload = computeUnderloadFlag({
      currentWeekVolume: weekly,
      prevWeekVolume: exPrevRows.reduce((acc, r) => acc + (r.setVolume ?? 0), 0),
      baselineWeeklyVolume: baseline.baselineWeeklyVolume,
      attendanceOk,
    });
    const exName = exerciseMap.get(exerciseId)?.nameRu ?? exerciseId;
    if (fatigue.level === 'overload' && !overloadExercise) overloadExercise = exName;
    if (fatigue.level === 'warning' && !warningExercise) warningExercise = exName;
    if (underload.active && !underloadExercise) underloadExercise = exName;
  }

  let alert: AlertItem;
  if (ramp.active) {
    alert = { status: 'OK', title: 'Ramp week', description: 'Сравнение выключено' };
  } else if (overloadExercise) {
    alert = { status: 'ERROR', title: 'Перегруз', description: overloadExercise };
  } else if (warningExercise) {
    alert = { status: 'WARNING', title: 'Риск перегруза', description: warningExercise };
  } else if (underloadExercise) {
    alert = { status: 'WARNING', title: 'Недогруз', description: underloadExercise };
  } else {
    alert = { status: 'OK', title: 'Всё в порядке', description: '' };
  }

  let weeklyLoadState: 'up' | 'neutral' | 'down' = 'neutral';
  if (baselineWeekVolume && currentWeekVolume >= baselineWeekVolume * 1.05) weeklyLoadState = 'up';
  if (baselineWeekVolume && currentWeekVolume < baselineWeekVolume * 0.85) weeklyLoadState = 'down';

  return {
    currentWeekCount,
    streakWeeks,
    currentWeekVolume,
    currentWeekVolumeRaw,
    currentDayVolume,
    baselineWeekVolume,
    ramp,
    alert,
    weeklyLoadState,
  };
}

export interface WeeklySeriesPoint {
  weekKey: string;
  label: string;
  sessions: number;
  volume: number;
}

export function buildWeeklySeries(rows: TrainingMetricRow[], weeks = 12): WeeklySeriesPoint[] {
  const attendance = computeAttendancePerWeek(rows);
  const volume = computeWeeklyVolume(rows);
  const now = new Date();
  const list: WeeklySeriesPoint[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() - i * 7);
    const w = weekStart(d);
    list.push({
      weekKey: w,
      label: formatWeekLabel(w),
      sessions: attendance.get(w) ?? 0,
      volume: volume.get(w) ?? 0,
    });
  }
  return list;
}

export interface ExerciseTrendPoint {
  exerciseId: string;
  exerciseName: string;
  progressPct: number;
  riskScore: number;
}

export function buildExerciseProgressAndRisk(rows: TrainingMetricRow[], exercises: Exercise[]): ExerciseTrendPoint[] {
  const map = new Map<string, TrainingMetricRow[]>();
  rows.forEach((r) => {
    if (!map.has(r.exerciseId)) map.set(r.exerciseId, []);
    map.get(r.exerciseId)!.push(r);
  });
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  const points: ExerciseTrendPoint[] = [];
  let exercisesWith8PlusSessions = 0;
  map.forEach((exRows, exerciseId) => {
    const sessions = Array.from(new Set(exRows.map((r) => r.sessionId)));
    if (sessions.length >= 8) exercisesWith8PlusSessions += 1;
    if (sessions.length < 8) return;
    const sorted = [...exRows].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    const recent = computeExerciseBaseline(sorted.slice(0, Math.ceil(sorted.length / 2)));
    const older = computeExerciseBaseline(sorted.slice(Math.ceil(sorted.length / 2)));
    if (!recent.baselineVolumePerSet || !older.baselineVolumePerSet) return;
    const progressPct = ((recent.baselineVolumePerSet - older.baselineVolumePerSet) / older.baselineVolumePerSet) * 100;

    const week = weekStart(new Date());
    const exWeekRows = exRows.filter((r) => weekStart(new Date(r.ts)) === week);
    const weekly = exWeekRows.reduce((acc, r) => acc + (r.setVolume ?? 0), 0);
    const medReps = median(exWeekRows.map((r) => r.reps)) ?? 0;
    const fatigue = computeFatigueFlag({
      weeklyVolume: weekly,
      baselineWeeklyVolume: recent.baselineWeeklyVolume,
      baselineReps: recent.baselineReps,
      medianReps: medReps,
    });
    const riskScore = fatigue.level === 'overload' ? 3 : fatigue.level === 'warning' ? 2 : 0;

    points.push({
      exerciseId,
      exerciseName: exerciseMap.get(exerciseId)?.nameRu ?? exerciseId,
      progressPct,
      riskScore,
    });
  });

  // #region agent log
  if (typeof fetch !== 'undefined') {
    fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'analytics.ts:buildExerciseProgressAndRisk',
        message: 'trend points',
        data: { exercisesInMap: map.size, exercisesWith8PlusSessions, pointsLength: points.length },
        timestamp: Date.now(),
        hypothesisId: 'H3',
      }),
    }).catch(() => {});
  }
  // #endregion

  return points;
}

export interface GapPoint {
  from: string;
  to: string;
  days: number;
}

export function buildRampGaps(rows: TrainingMetricRow[]): GapPoint[] {
  const sessions = Array.from(
    new Map(rows.map((r) => [r.sessionId, r.ts])).values(),
  )
    .map((ts) => new Date(ts))
    .sort((a, b) => a.getTime() - b.getTime());
  const gaps: GapPoint[] = [];
  for (let i = 1; i < sessions.length; i += 1) {
    const days = Math.floor((sessions[i].getTime() - sessions[i - 1].getTime()) / (1000 * 60 * 60 * 24));
    if (days >= 7) {
      gaps.push({
        from: sessions[i - 1].toISOString(),
        to: sessions[i].toISOString(),
        days,
      });
    }
  }
  return gaps.reverse();
}
