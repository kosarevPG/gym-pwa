import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchLastExerciseSnapshot,
  fetchLastExerciseSessionSets,
  saveTrainingLogs,
  type SaveTrainingLogRow,
} from './api';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const fromMock = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  const { supabase } = await import('./supabase');
  (supabase as any).from = fromMock;
  fromMock.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn(),
  });
});

describe('fetchLastExerciseSnapshot', () => {
  it('returns null when no data', async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const result = await fetchLastExerciseSnapshot('ex-id');
    expect(result).toBeNull();
  });

  it('returns last set of last session by completed_at and order_index', async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          { set_group_id: 'g1', order_index: 2, completed_at: '2025-01-15T10:00:00Z', created_at: '2025-01-15T10:00:00Z', weight: 60, reps: 8 },
          { set_group_id: 'g1', order_index: 1, completed_at: '2025-01-15T09:00:00Z', created_at: '2025-01-15T09:00:00Z', weight: 50, reps: 10 },
        ],
        error: null,
      }),
    });
    const result = await fetchLastExerciseSnapshot('ex-id');
    expect(result).not.toBeNull();
    expect(result!.createdAt).toBe('2025-01-15T10:00:00Z');
    expect(result!.weight).toBe(60);
    expect(result!.reps).toBe(8);
  });
});

describe('fetchLastExerciseSessionSets', () => {
  it('returns weight from weight, rest in minutes', async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          { set_group_id: 'g1', order_index: 0, weight: 40, reps: 10, rest_seconds: 120, completed_at: '2025-01-15T10:00:00Z' },
        ],
        error: null,
      }),
    });
    const result = await fetchLastExerciseSessionSets('ex-id');
    expect(result).toHaveLength(1);
    expect(result[0].inputWeight).toBe('40');
    expect(result[0].reps).toBe('10');
    expect(result[0].restMin).toBe('2');
  });
});

describe('saveTrainingLogs', () => {
  const validUuid = 'a1b2c3d4-e5f6-4789-a012-345678901234';

  it('returns null error when rows empty', async () => {
    const result = await saveTrainingLogs([]);
    expect(result.error).toBeNull();
  });

  it('returns error when exercise_id is not UUID', async () => {
    const rows: SaveTrainingLogRow[] = [
      {
        exercise_id: 'not-uuid',
        weight: 60,
        reps: 8,
        set_group_id: 'sg1',
        order_index: 0,
      },
    ];
    const result = await saveTrainingLogs(rows);
    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain('не из базы');
  });

  it('calls insert with v2 payload when exercise_id is UUID', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });

    const rows: SaveTrainingLogRow[] = [
      {
        exercise_id: validUuid,
        weight: 60,
        reps: 8,
        set_group_id: 'sg1',
        order_index: 0,
      },
    ];
    await saveTrainingLogs(rows);
    expect(insertMock).toHaveBeenCalled();
    const payload = insertMock.mock.calls[0][0];
    expect(payload[0].exercise_id).toBe(validUuid);
    expect(payload[0].weight).toBe(60);
    expect(payload[0].reps).toBe(8);
    expect(payload[0].set_group_id).toBe('sg1');
    expect(payload[0].order_index).toBe(0);
  });
});
