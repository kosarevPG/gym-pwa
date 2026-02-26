import type { ExerciseWeightType, SetSide } from '../types';

export interface TrainingMetricRow {
  ts: string;
  sessionId: string;
  exerciseId: string;
  setNo: number;
  reps: number;
  inputWt: number;
  side: SetSide;
  rpe: number;
  restS: number;
  bodyWtSnapshot: number | null;
  type: ExerciseWeightType;
  baseWt: number;
  multiplier: number;
  allow1rm: boolean;
  group: string;
  effectiveLoad?: number | null;
  sideMult?: number | null;
  setVolume?: number | null;
}

export interface ExerciseBaseline {
  baselineVolumePerSet: number | null;
  baselineWeeklyVolume: number | null;
  baselineRpe: number | null;
  baselineReps: number | null;
}

export interface FatigueResult {
  level: 'none' | 'warning' | 'overload';
  triggered: boolean;
  conditionsMet: number;
}

export interface UnderloadResult {
  active: boolean;
  reason?: string;
}

export interface RampResult {
  active: boolean;
  sessionsRemaining: number;
  gapDays: number;
  sessionsSinceGap: number;
}

function toNumber(value: number | null | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function calcSideMult(type: ExerciseWeightType, side: SetSide): number {
  return type === 'dumbbell' && side === 'both' ? 2 : 1;
}

export function calcEffectiveLoadKg(params: {
  type: ExerciseWeightType;
  inputWt: number;
  bodyWt?: number | null;
  baseWt?: number | null;
  multiplier?: number | null;
}): number {
  const type = params.type;
  const inputWt = toNumber(params.inputWt);
  // Если в базе записан вес — берём его. Если нет (старая запись) — 90 кг, чтобы график не падал в ноль.
  const bodyWt = toNumber(params.bodyWt, 90);
  const baseWt = toNumber(params.baseWt, 0);
  const multiplier = toNumber(params.multiplier, 1);

  if (type === 'barbell') return inputWt * multiplier + baseWt;
  if (type === 'dumbbell') return inputWt * multiplier + baseWt;
  if (type === 'machine') return inputWt + baseWt;
  if (type === 'bodyweight') return bodyWt + inputWt + baseWt;
  if (type === 'assisted') return Math.max(0, bodyWt - (inputWt + baseWt));
  if (type === 'standard') return inputWt + baseWt;
  return inputWt + baseWt;
}

export function calcSetVolumeKg(params: {
  effectiveLoad: number;
  reps: number;
  sideMult: number;
}): number {
  return toNumber(params.effectiveLoad) * Math.max(0, toNumber(params.reps)) * Math.max(1, toNumber(params.sideMult, 1));
}

export function calcEffectiveVolume(params: { setVolume: number }): number {
  return toNumber(params.setVolume);
}

export function median(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  if (clean.length % 2 === 1) return clean[mid];
  return (clean[mid - 1] + clean[mid]) / 2;
}

function startOfWeekIso(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function bySession(rows: TrainingMetricRow[]): Record<string, TrainingMetricRow[]> {
  return rows.reduce<Record<string, TrainingMetricRow[]>>((acc, row) => {
    if (!acc[row.sessionId]) acc[row.sessionId] = [];
    acc[row.sessionId].push(row);
    return acc;
  }, {});
}

export function markWarmupSets(rows: TrainingMetricRow[]): Array<TrainingMetricRow & { isWarmup: boolean; derivedEffective: number; derivedVolume: number }> {
  const sessions = bySession(rows);
  const out: Array<TrainingMetricRow & { isWarmup: boolean; derivedEffective: number; derivedVolume: number }> = [];

  Object.values(sessions).forEach((sessionRows) => {
    const effectiveLoads = sessionRows.map((r) => (
      r.effectiveLoad != null
        ? Number(r.effectiveLoad)
        : calcEffectiveLoadKg({
            type: r.type,
            inputWt: r.inputWt,
            bodyWt: r.bodyWtSnapshot,
            baseWt: r.baseWt,
            multiplier: r.multiplier,
          })
    ));
    const maxEffectiveToday = Math.max(0, ...effectiveLoads);

    sessionRows.forEach((row, i) => {
      const derivedEffective = effectiveLoads[i];
      const sideMult = row.sideMult != null ? Number(row.sideMult) : calcSideMult(row.type, row.side);
      const derivedVolume = row.setVolume != null ? Number(row.setVolume) : calcSetVolumeKg({
        effectiveLoad: derivedEffective,
        reps: row.reps,
        sideMult,
      });
      const isWarmup = derivedEffective < 0.6 * maxEffectiveToday;
      out.push({ ...row, isWarmup, derivedEffective, derivedVolume });
    });
  });

  // #region agent log
  if (typeof fetch !== 'undefined' && rows.length > 0) {
    const nonWarmup = out.filter((r) => !r.isWarmup).length;
    fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'metrics.ts:markWarmupSets',
        message: 'warmup filter',
        data: { rowsIn: rows.length, nonWarmup },
        timestamp: Date.now(),
        hypothesisId: 'H5',
      }),
    }).catch(() => {});
  }
  // #endregion

  return out;
}

export function computeAttendancePerWeek(rows: TrainingMetricRow[]): Map<string, number> {
  const weekDays = new Map<string, Set<string>>(); // уникальные даты (YYYY-MM-DD)

  rows.forEach((r) => {
    const week = startOfWeekIso(new Date(r.ts));
    const dayDate = r.ts.slice(0, 10);

    if (!weekDays.has(week)) weekDays.set(week, new Set());
    weekDays.get(week)!.add(dayDate);
  });

  const counts = new Map<string, number>();
  Array.from(weekDays.entries()).forEach(([week, days]) => counts.set(week, days.size));
  return counts;
}

export function computeWeeklyVolume(rows: TrainingMetricRow[]): Map<string, number> {
  const marked = markWarmupSets(rows).filter((r) => !r.isWarmup);
  const weekly = new Map<string, number>();
  marked.forEach((r) => {
    const week = startOfWeekIso(new Date(r.ts));
    weekly.set(week, (weekly.get(week) ?? 0) + r.derivedVolume);
  });
  return weekly;
}

/** Объём по неделям без исключения разминочных подходов (для отображения, когда рабочий объём = 0). */
export function computeWeeklyVolumeRaw(rows: TrainingMetricRow[]): Map<string, number> {
  const marked = markWarmupSets(rows);
  const weekly = new Map<string, number>();
  marked.forEach((r) => {
    const week = startOfWeekIso(new Date(r.ts));
    weekly.set(week, (weekly.get(week) ?? 0) + r.derivedVolume);
  });
  return weekly;
}

export function computeRampStatus(rows: TrainingMetricRow[]): RampResult {
  const sessionDates = Array.from(
    new Map(
      rows
        .map((r) => [r.sessionId, new Date(r.ts).getTime()])
        .sort((a, b) => a[1] - b[1]),
    ).values(),
  );

  if (sessionDates.length < 2) {
    return { active: false, sessionsRemaining: 0, gapDays: 0, sessionsSinceGap: 0 };
  }

  let lastGapIndex = -1;
  let gapDays = 0;
  for (let i = 1; i < sessionDates.length; i += 1) {
    const days = (sessionDates[i] - sessionDates[i - 1]) / (1000 * 60 * 60 * 24);
    if (days >= 7) {
      lastGapIndex = i;
      gapDays = Math.floor(days);
    }
  }

  if (lastGapIndex === -1) return { active: false, sessionsRemaining: 0, gapDays: 0, sessionsSinceGap: 0 };
  const sessionsAfterGap = sessionDates.length - lastGapIndex;
  return {
    active: sessionsAfterGap <= 2,
    sessionsRemaining: Math.max(0, 2 - sessionsAfterGap),
    gapDays,
    sessionsSinceGap: sessionsAfterGap,
  };
}

export function computeExerciseBaseline(
  rows: TrainingMetricRow[],
  options?: { attendanceOk?: boolean }
): ExerciseBaseline {
  if (options?.attendanceOk === false) {
    return {
      baselineVolumePerSet: null,
      baselineWeeklyVolume: null,
      baselineRpe: null,
      baselineReps: null,
    };
  }

  const marked = markWarmupSets(rows).filter((r) => !r.isWarmup);
  const sessions = bySession(marked);
  const sessionIdsDesc = Array.from(Object.keys(sessions)).sort((a, b) => {
    const ta = Math.max(...sessions[a].map((r) => new Date(r.ts).getTime()));
    const tb = Math.max(...sessions[b].map((r) => new Date(r.ts).getTime()));
    return tb - ta;
  });

  const ramp = computeRampStatus(rows);
  const excludeSessions = ramp.active ? Math.min(2, ramp.sessionsSinceGap) : 0;
  const selectedSessionIds = sessionIdsDesc.slice(excludeSessions, excludeSessions + 9);
  // #region agent log
  if (typeof fetch !== 'undefined') {
    fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'metrics.ts:computeExerciseBaseline',
        message: 'baseline gate',
        data: { rowsIn: rows.length, markedLen: marked.length, sessionCount: selectedSessionIds.length, excludeSessions },
        timestamp: Date.now(),
        hypothesisId: 'H2,H5',
      }),
    }).catch(() => {});
  }
  // #endregion
  if (selectedSessionIds.length < 3) {
    return {
      baselineVolumePerSet: null,
      baselineWeeklyVolume: null,
      baselineRpe: null,
      baselineReps: null,
    };
  }

  const selectedRows = selectedSessionIds.flatMap((sid) => sessions[sid] ?? []);
  const setVolumes = selectedRows.map((r) => r.derivedVolume);
  const repsValues = selectedRows.map((r) => r.reps);

  const weeklyMap = computeWeeklyVolume(selectedRows);
  const weeklyVolumes = Array.from(weeklyMap.values());

  return {
    baselineVolumePerSet: median(setVolumes),
    baselineWeeklyVolume: median(weeklyVolumes),
    baselineRpe: null,
    baselineReps: median(repsValues),
  };
}

export function computeFatigueFlag(params: {
  weeklyVolume: number;
  baselineWeeklyVolume: number | null;
  medianReps: number;
  baselineReps: number | null;
}): FatigueResult {
  if (!params.baselineWeeklyVolume || !params.baselineReps) {
    return { level: 'none', triggered: false, conditionsMet: 0 };
  }

  const c1 = params.weeklyVolume >= params.baselineWeeklyVolume * 1.1;
  const c2 = params.medianReps <= params.baselineReps - 1;
  const conditionsMet = [c1, c2].filter(Boolean).length;

  if (conditionsMet === 2) return { level: 'overload', triggered: true, conditionsMet };
  if (conditionsMet === 1) return { level: 'warning', triggered: true, conditionsMet };
  return { level: 'none', triggered: false, conditionsMet };
}

export function computeUnderloadFlag(params: {
  currentWeekVolume: number;
  prevWeekVolume: number;
  baselineWeeklyVolume: number | null;
  attendanceOk: boolean;
}): UnderloadResult {
  if (!params.baselineWeeklyVolume || !params.attendanceOk) {
    return { active: false };
  }
  const threshold = params.baselineWeeklyVolume * 0.85;
  const active = params.currentWeekVolume < threshold && params.prevWeekVolume < threshold;
  return active
    ? { active: true, reason: '2 недели подряд ниже 85% baseline weekly volume' }
    : { active: false };
}

export function computeAttendanceStreak(weeklyAttendance: Map<string, number>, minPerWeek = 2): number {
  const weeks = Array.from(weeklyAttendance.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));
  let streak = 0;
  for (const [, count] of weeks) {
    if (count >= minPerWeek) streak += 1;
    else break;
  }
  return streak;
}
