import { describe, it, expect } from 'vitest';
import { calc1RM, createEmptySet, createSetFromHistory } from './utils';

describe('calc1RM', () => {
  it('returns 0 for reps <= 0 or weight <= 0', () => {
    expect(calc1RM(0, 5)).toBe(0);
    expect(calc1RM(100, 0)).toBe(0);
    expect(calc1RM(-1, 5)).toBe(0);
  });

  it('returns weight for 1 rep', () => {
    expect(calc1RM(100, 1)).toBe(100);
  });

  it('estimates 1RM by Epley formula for multiple reps', () => {
    expect(calc1RM(100, 5)).toBe(Math.round(100 * (1 + 5 / 30))); // 116
    expect(calc1RM(80, 10)).toBe(Math.round(80 * (1 + 10 / 30)));
  });
});

describe('createEmptySet', () => {
  it('returns set with uuid, empty strings, completed false', () => {
    const set = createEmptySet();
    expect(set.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(set.weight).toBe('');
    expect(set.reps).toBe('');
    expect(set.rest).toBe('');
    expect(set.completed).toBe(false);
  });

  it('applies overrides', () => {
    const set = createEmptySet({ weight: '60', reps: '8', completed: true });
    expect(set.weight).toBe('60');
    expect(set.reps).toBe('8');
    expect(set.completed).toBe(true);
  });
});

describe('createSetFromHistory', () => {
  it('builds set from history using weight when inputWeight not given', () => {
    const set = createSetFromHistory({ weight: 60, reps: 8, rest: 90 });
    expect(set.weight).toBe('60');
    expect(set.reps).toBe('8');
    expect(set.rest).toBe('90');
    expect(set.prevWeight).toBe(60);
  });

  it('uses inputWeight when provided', () => {
    const set = createSetFromHistory({
      weight: 40,
      inputWeight: 20,
      reps: 10,
      rest: 60,
    });
    expect(set.weight).toBe('20');
    expect(set.prevWeight).toBe(40);
  });

  it('uses prevWeight override when provided', () => {
    const set = createSetFromHistory(
      { weight: 50, reps: 5, rest: 120 },
      55
    );
    expect(set.prevWeight).toBe(55);
  });
});
