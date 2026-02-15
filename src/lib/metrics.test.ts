import { describe, it, expect } from 'vitest';
import type { TrainingMetricRow } from './metrics';
import {
  calcSideMult,
  calcEffectiveLoadKg,
  calcSetVolumeKg,
  median,
  markWarmupSets,
  computeAttendancePerWeek,
  computeWeeklyVolume,
  computeRampStatus,
  computeExerciseBaseline,
  computeFatigueFlag,
  computeUnderloadFlag,
  computeAttendanceStreak,
} from './metrics';

describe('calcSideMult', () => {
  it('returns 2 for dumbbell both', () => {
    expect(calcSideMult('dumbbell', 'both')).toBe(2);
  });
  it('returns 1 for others', () => {
    expect(calcSideMult('barbell', 'both')).toBe(1);
    expect(calcSideMult('dumbbell', 'left')).toBe(1);
  });
});

describe('calcEffectiveLoadKg', () => {
  it('barbell: inputWt * multiplier + baseWt', () => {
    expect(calcEffectiveLoadKg({ type: 'barbell', inputWt: 20, baseWt: 20, multiplier: 2 })).toBe(60);
    expect(calcEffectiveLoadKg({ type: 'barbell', inputWt: 0, baseWt: 20, multiplier: 2 })).toBe(20);
  });
  it('dumbbell: one hand mult 1, two hands (x2) mult 2', () => {
    expect(calcEffectiveLoadKg({ type: 'dumbbell', inputWt: 12.5, baseWt: 0, multiplier: 1 })).toBe(12.5);
    expect(calcEffectiveLoadKg({ type: 'dumbbell', inputWt: 12.5, baseWt: 0, multiplier: 2 })).toBe(25);
    expect(calcEffectiveLoadKg({ type: 'dumbbell', inputWt: 10, baseWt: 0, multiplier: 2 })).toBe(20);
  });
  it('machine: input + base', () => {
    expect(calcEffectiveLoadKg({ type: 'machine', inputWt: 50, baseWt: 0 })).toBe(50);
    expect(calcEffectiveLoadKg({ type: 'machine', inputWt: 30, baseWt: 10 })).toBe(40);
  });
  it('standard: input + base', () => {
    expect(calcEffectiveLoadKg({ type: 'standard', inputWt: 40, baseWt: 0 })).toBe(40);
  });
  it('bodyweight/assisted use bodyWt when needed', () => {
    expect(calcEffectiveLoadKg({ type: 'bodyweight', inputWt: 10, bodyWt: 80, baseWt: 0 })).toBe(90);
    expect(calcEffectiveLoadKg({ type: 'assisted', inputWt: 20, bodyWt: 80, baseWt: 0 })).toBe(60);
  });
  it('assisted does not go below 0', () => {
    expect(calcEffectiveLoadKg({ type: 'assisted', inputWt: 100, bodyWt: 80 })).toBe(0);
  });
  it('assisted uses bodyWt default 90 when null', () => {
    expect(calcEffectiveLoadKg({ type: 'assisted', inputWt: 40, bodyWt: null, baseWt: 0 })).toBe(50);
  });
});

describe('calcSetVolumeKg', () => {
  it('effectiveLoad * reps * sideMult', () => {
    expect(calcSetVolumeKg({ effectiveLoad: 100, reps: 5, sideMult: 1 })).toBe(500);
    expect(calcSetVolumeKg({ effectiveLoad: 20, reps: 10, sideMult: 2 })).toBe(400);
  });
});

describe('median', () => {
  it('returns null for empty', () => {
    expect(median([])).toBeNull();
  });
  it('returns middle for odd length', () => {
    expect(median([1, 3, 5])).toBe(3);
  });
  it('returns average of two middles for even length', () => {
    expect(median([1, 3, 5, 7])).toBe(4);
  });
  it('ignores non-finite', () => {
    expect(median([1, NaN, 5])).toBe(3);
  });
});

function row(overrides: Partial<TrainingMetricRow> & { ts: string; sessionId: string }): TrainingMetricRow {
  return {
    ts: overrides.ts,
    sessionId: overrides.sessionId,
    exerciseId: 'ex1',
    setNo: 1,
    reps: 8,
    inputWt: 60,
    side: 'both',
    rpe: 8,
    restS: 90,
    bodyWtSnapshot: null,
    type: 'barbell',
    baseWt: 20,
    multiplier: 1,
    allow1rm: true,
    group: 'chest',
    ...overrides,
  };
}

describe('markWarmupSets', () => {
  it('marks low RPE or low effective as warmup', () => {
    const rows: TrainingMetricRow[] = [
      row({ ts: '2025-01-01T10:00:00Z', sessionId: 's1', rpe: 5, effectiveLoad: 40 }),
      row({ ts: '2025-01-01T10:05:00Z', sessionId: 's1', rpe: 8, effectiveLoad: 80 }),
    ];
    const marked = markWarmupSets(rows);
    expect(marked[0].isWarmup).toBe(true);
    expect(marked[1].isWarmup).toBe(false);
  });
});

describe('computeAttendancePerWeek', () => {
  it('counts unique days (YYYY-MM-DD) per week', () => {
    const rows: TrainingMetricRow[] = [
      row({ ts: '2025-01-06T10:00:00Z', sessionId: 's1' }),
      row({ ts: '2025-01-06T11:00:00Z', sessionId: 's2' }), // тот же день — 1 день
      row({ ts: '2025-01-07T10:00:00Z', sessionId: 's3' }), // другой день той же недели
    ];
    const m = computeAttendancePerWeek(rows);
    expect(m.size).toBeGreaterThanOrEqual(1);
    const week1 = m.get('2025-01-06') ?? m.get('2025-01-05');
    expect(week1).toBe(2); // два уникальных дня: 06 и 07
  });
});

describe('computeWeeklyVolume', () => {
  it('sums non-warmup volume per week', () => {
    const rows: TrainingMetricRow[] = [
      row({ ts: '2025-01-06T10:00:00Z', sessionId: 's1', setVolume: 400, rpe: 8 }),
      row({ ts: '2025-01-06T10:05:00Z', sessionId: 's1', setVolume: 300, rpe: 8 }),
    ];
    const m = computeWeeklyVolume(rows);
    expect(m.size).toBeGreaterThanOrEqual(1);
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0);
    expect(total).toBe(700);
  });
});

describe('computeRampStatus', () => {
  it('inactive when fewer than 2 sessions', () => {
    const rows: TrainingMetricRow[] = [row({ ts: '2025-01-01T10:00:00Z', sessionId: 's1' })];
    expect(computeRampStatus(rows).active).toBe(false);
  });

  it('active when gap >= 7 days and sessions after gap <= 2', () => {
    const rows: TrainingMetricRow[] = [
      row({ ts: '2025-01-01T10:00:00Z', sessionId: 's1' }),
      row({ ts: '2025-01-02T10:00:00Z', sessionId: 's1' }),
      row({ ts: '2025-01-15T10:00:00Z', sessionId: 's2' }),
    ];
    const r = computeRampStatus(rows);
    expect(r.active).toBe(true);
    expect(r.sessionsRemaining).toBeGreaterThanOrEqual(0);
  });
});

describe('computeExerciseBaseline', () => {
  it('returns nulls when attendanceOk false', () => {
    const result = computeExerciseBaseline([], { attendanceOk: false });
    expect(result.baselineVolumePerSet).toBeNull();
    expect(result.baselineWeeklyVolume).toBeNull();
  });

  it('returns nulls when fewer than 6 sessions in selected window', () => {
    const few = Array.from({ length: 4 }, (_, i) =>
      row({ ts: `2025-01-0${i + 1}T10:00:00Z`, sessionId: `s${i}` })
    );
    const result = computeExerciseBaseline(few);
    expect(result.baselineVolumePerSet).toBeNull();
  });
});

describe('computeFatigueFlag', () => {
  it('none when baseline missing', () => {
    expect(
      computeFatigueFlag({
        weeklyVolume: 1000,
        baselineWeeklyVolume: null,
        medianRpe: 8,
        baselineRpe: 7,
        medianReps: 8,
        baselineReps: 8,
      })
    ).toEqual({ level: 'none', triggered: false, conditionsMet: 0 });
  });

  it('overload when all 3 conditions', () => {
    const r = computeFatigueFlag({
      weeklyVolume: 1200,
      baselineWeeklyVolume: 1000,
      medianRpe: 9,
      baselineRpe: 7,
      medianReps: 6,
      baselineReps: 8,
    });
    expect(r.level).toBe('overload');
    expect(r.triggered).toBe(true);
    expect(r.conditionsMet).toBe(3);
  });
});

describe('computeUnderloadFlag', () => {
  it('inactive when baseline missing or attendance not ok', () => {
    expect(
      computeUnderloadFlag({
        currentWeekVolume: 500,
        prevWeekVolume: 500,
        baselineWeeklyVolume: null,
        attendanceOk: true,
      })
    ).toEqual({ active: false });
    expect(
      computeUnderloadFlag({
        currentWeekVolume: 500,
        prevWeekVolume: 500,
        baselineWeeklyVolume: 1000,
        attendanceOk: false,
      })
    ).toEqual({ active: false });
  });

  it('active when both weeks below 85% baseline', () => {
    const r = computeUnderloadFlag({
      currentWeekVolume: 800,
      prevWeekVolume: 800,
      baselineWeeklyVolume: 1000,
      attendanceOk: true,
    });
    expect(r.active).toBe(true);
    expect(r.reason).toContain('85%');
  });
});

describe('computeAttendanceStreak', () => {
  it('counts consecutive weeks with >= minPerWeek', () => {
    const m = new Map<string, number>([
      ['2025-12-30', 2],
      ['2025-01-13', 2],
      ['2025-01-06', 1],
    ]);
    expect(computeAttendanceStreak(m, 2)).toBe(2);
  });
  it('returns 0 when first week fails', () => {
    const m = new Map<string, number>([['2025-01-13', 1]]);
    expect(computeAttendanceStreak(m, 2)).toBe(0);
  });
});
