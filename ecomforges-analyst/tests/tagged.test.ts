import { describe, expect, it } from 'vitest';
import { ask, calc, data, est, fmt, isAsk, map, num, valueOr } from '../src/types/tagged.js';

describe('Tagged', () => {
  it('ASK carries no value field at all', () => {
    const a = ask('sessions not supplied');
    expect('value' in a).toBe(false);
  });

  it('EST rejects an empty basis at runtime', () => {
    expect(() => est(5, '')).toThrow(/non-empty basis/);
    expect(() => est(5, '   ')).toThrow(/non-empty basis/);
    expect(est(5, 'from last cycle').basis).toBe('from last cycle');
  });

  it('propagates ASK through one level of arithmetic', () => {
    const r = map(
      [data(100), ask('sessions not supplied')] as const,
      ['GMV', 'sessions'],
      (g, s) => g / s,
      (g, s) => `${g} ÷ ${s}`,
    );
    expect(isAsk(r)).toBe(true);
    if (isAsk(r)) {
      expect(r.question).toContain('sessions');
      expect(r.question).toContain('not supplied');
    }
  });

  it('propagates ASK through two levels, carrying the original question forward', () => {
    const level1 = map(
      [data(50), ask('Lazada: buyers not supplied')] as const,
      ['GMV', 'buyers'],
      (a, b) => a / b,
      () => '',
    );
    const level2 = map(
      [level1, data(2)] as const,
      ['revenue per buyer', 'multiplier'],
      (a, b) => a * b,
      () => '',
    );
    expect(isAsk(level2)).toBe(true);
    if (isAsk(level2)) {
      expect(level2.question).toContain('revenue per buyer');
      // The root cause survives to the top so the gap list stays actionable.
      expect(level2.question).toContain('buyers not supplied');
    }
  });

  it('does not coerce a missing figure to zero', () => {
    const a = ask('missing');
    expect(valueOr(a, Number.NaN)).toBeNaN();
    // There is deliberately no valueOrZero helper to reach for.
    expect(Object.keys({ ask, calc, data, est })).not.toContain('valueOrZero');
  });

  it('formats each tag with its provenance', () => {
    expect(fmt(calc(6.1, '2,940 ÷ 48,200'), { render: (v) => `${v}%` })).toBe(
      '6.1% [CALC 2,940 ÷ 48,200]',
    );
    expect(fmt(ask('no benchmark on file for Lazada / Beauty — skincare'))).toBe(
      '[ASK] no benchmark on file for Lazada / Beauty — skincare',
    );
    expect(fmt(data(5), { bare: true })).toBe('5');
  });

  it('groups thousands', () => {
    expect(num(48200)).toBe('48,200');
  });
});
