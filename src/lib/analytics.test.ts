import { describe, it, expect } from 'vitest';
import type { TrainingLogRaw } from './api';
import type { Exercise } from '../types';
import {
  buildTrainingMetricRows,
  computeHomeInsights,
  buildWeeklySeries,
  buildRampGaps,
} from './analytics';
import type { TrainingMetricRow } from './metrics';

const defaultExercise: Exercise = {
  id: 'ex-uuid-1',
  category: 'chest',
  nameRu: 'Жим',
  nameEn: 'Press',
  weightType: 'barbell',
  baseWeight: 20,
};

function log(overrides: Partial<TrainingLogRaw>): TrainingLogRaw {
  return {
    id: 'log1',
    ts: '2025-01-15T10:00:00Z',
    session_id: 's1',
    set_group_id: 'g1',
    exercise_id: 'ex-uuid-1',
    exercise_order: 0,
    set_no: 1,
    reps: 8,
    input_wt: 20,
    side: 'both',
    rpe: 8,
    rest_s: 90,
    body_wt_snapshot: null,
    effective_load: null,
    side_mult: null,
    set_volume: null,
    ...overrides,
  };
}

describe('buildTrainingMetricRows', () => {
  it('maps logs to TrainingMetricRow and filters unknown exercise', () => {
    const logs: TrainingLogRaw[] = [
      log({ exercise_id: 'ex-uuid-1' }),
      log({ exercise_id: 'unknown-id', set_no: 2 }),
    ];
    const exercises: Exercise[] = [defaultExercise];
    const rows = buildTrainingMetricRows(logs, exercises);
    expect(rows).toHaveLength(1);
    expect(rows[0].exerciseId).toBe('ex-uuid-1');
    expect(rows[0].reps).toBe(8);
    expect(rows[0].type).toBe('barbell');
  });

  it('uses log effective_load and set_volume when present', () => {
    const logs: TrainingLogRaw[] = [
      log({ effective_load: 60, set_volume: 480 }),
    ];
    const rows = buildTrainingMetricRows(logs, [defaultExercise]);
    expect(rows[0].effectiveLoad).toBe(60);
    expect(rows[0].setVolume).toBe(480);
  });
});

describe('computeHomeInsights', () => {
  it('returns structure with currentWeekCount, streakWeeks, ramp, alert', () => {
    const rows: TrainingMetricRow[] = [];
    const insights = computeHomeInsights(rows, [defaultExercise]);
    expect(insights).toHaveProperty('currentWeekCount');
    expect(insights).toHaveProperty('streakWeeks');
    expect(insights).toHaveProperty('currentWeekVolume');
    expect(insights).toHaveProperty('baselineWeekVolume');
    expect(insights).toHaveProperty('ramp');
    expect(insights).toHaveProperty('alert');
    expect(insights).toHaveProperty('weeklyLoadState');
    expect(insights.alert).toMatchObject({
      status: expect.stringMatching(/^(OK|WARNING|ERROR)$/),
      title: expect.any(String),
      description: expect.any(String),
    });
  });
});

describe('buildWeeklySeries', () => {
  it('returns array of length weeks with weekKey, label, sessions, volume', () => {
    const rows: TrainingMetricRow[] = [];
    const series = buildWeeklySeries(rows, 5);
    expect(series).toHaveLength(5);
    expect(series[0]).toHaveProperty('weekKey');
    expect(series[0]).toHaveProperty('label');
    expect(series[0]).toHaveProperty('sessions');
    expect(series[0]).toHaveProperty('volume');
  });
});

describe('buildRampGaps', () => {
  it('returns gaps >= 7 days between sessions', () => {
    const rows: TrainingMetricRow[] = [
      { sessionId: 's1', ts: '2025-01-01T10:00:00Z' } as TrainingMetricRow,
      { sessionId: 's2', ts: '2025-01-10T10:00:00Z' } as TrainingMetricRow,
    ];
    const gaps = buildRampGaps(rows);
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(gaps[0].days).toBeGreaterThanOrEqual(7);
  });
  it('returns empty when no gaps', () => {
    const rows: TrainingMetricRow[] = [
      { sessionId: 's1', ts: '2025-01-01T10:00:00Z' } as TrainingMetricRow,
      { sessionId: 's2', ts: '2025-01-02T10:00:00Z' } as TrainingMetricRow,
    ];
    expect(buildRampGaps(rows)).toHaveLength(0);
  });
});
