import { describe, it, expect } from 'vitest';
import {
  allows1rm,
  WEIGHT_FORMULAS,
  getWeightInputType,
  calcEffectiveWeight,
  BODY_WEIGHT_DEFAULT,
} from './exerciseConfig';

describe('allows1rm', () => {
  it('returns false for assisted and bodyweight', () => {
    expect(allows1rm('assisted')).toBe(false);
    expect(allows1rm('bodyweight')).toBe(false);
  });
  it('returns true for barbell, dumbbell, machine, etc.', () => {
    expect(allows1rm('barbell')).toBe(true);
    expect(allows1rm('dumbbell')).toBe(true);
    expect(allows1rm('machine')).toBe(true);
    expect(allows1rm('standard')).toBe(true);
  });
});

describe('WEIGHT_FORMULAS', () => {
  it('barbell toEffective: input * mult + base', () => {
    expect(WEIGHT_FORMULAS.barbell.toEffective(20, undefined, 20, 2)).toBe(60);
  });
  it('barbell toInput inverts toEffective', () => {
    const effective = 60;
    const input = WEIGHT_FORMULAS.barbell.toInput?.(effective, undefined, 20, 2);
    expect(input).toBe(20);
  });
  it('bodyweight toEffective: bw + input + base', () => {
    expect(WEIGHT_FORMULAS.bodyweight.toEffective(5, 80, 0)).toBe(85);
  });
  it('assisted toEffective: max(0, bw - input - base)', () => {
    expect(WEIGHT_FORMULAS.assisted.toEffective(20, 80, 0)).toBe(60);
  });
});

describe('getWeightInputType', () => {
  it('from weightType', () => {
    expect(getWeightInputType(undefined, 'barbell')).toBe('barbell');
    expect(getWeightInputType(undefined, 'Plate_Loaded')).toBe('plate_loaded');
    expect(getWeightInputType(undefined, 'Dumbbell')).toBe('dumbbell');
    expect(getWeightInputType(undefined, 'Bodyweight')).toBe('bodyweight');
  });
  it('from equipmentType when weightType not match', () => {
    expect(getWeightInputType('barbell', '')).toBe('barbell');
    expect(getWeightInputType('dumbbell', '')).toBe('dumbbell');
  });
  it('assisted from equipment containing "гравитрон" or "assist"', () => {
    expect(getWeightInputType('гравитрон', '')).toBe('assisted');
    expect(getWeightInputType('assisted', '')).toBe('assisted');
  });
  it('default standard', () => {
    expect(getWeightInputType('', '')).toBe('standard');
  });
});

describe('calcEffectiveWeight', () => {
  it('returns null for invalid input', () => {
    expect(calcEffectiveWeight('', 'barbell')).toBeNull();
    expect(calcEffectiveWeight('abc', 'barbell')).toBeNull();
    expect(calcEffectiveWeight('-5', 'barbell')).toBeNull();
  });
  it('barbell: input * 2 + 20 by default', () => {
    expect(calcEffectiveWeight('20', 'barbell')).toBe(60);
  });
  it('bodyweight uses BODY_WEIGHT_DEFAULT when no userBodyWeight', () => {
    expect(calcEffectiveWeight('0', 'bodyweight')).toBe(BODY_WEIGHT_DEFAULT);
  });
});
