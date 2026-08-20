/**
 * Movement between periods.
 *
 * The failure this guards against is not a wrong percentage — it is a confident comparison
 * between two things that were never comparable, or a missing figure rendered as "no change".
 * Both would be read in a client meeting as fact.
 */

import { describe, expect, it } from 'vitest';
import { analyse } from '../src/engine/pipeline.js';
import { loadEngagement } from '../src/types/load.js';
import { DEFAULT_THRESHOLDS } from '../src/benchmarks/parse.js';
import {
  movementSince,
  snapshot,
  SnapshotMismatchError,
  type PeriodSnapshot,
} from '../src/engine/movement.js';
import { renderBrief } from '../src/render/brief.js';

const EMPTY = { rows: [], rejected: [], thresholds: DEFAULT_THRESHOLDS };

const engagement = (over: Record<string, unknown> = {}) =>
  loadEngagement(
    JSON.stringify({
      clientCode: 'MY-BTY-09',
      category: 'Beauty — skincare',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      platforms: [
        { platform: 'Shopee', sessions: 48200, buyers: 2940, orders: 3020, gmv: 206870, aov: 68.5,
          organicSharePct: 55, sessionTrendPct: 12, promoRevenuePct: 32, grossMarginPct: 41,
          roas: 5.2, fulfilment: 'clean' },
        { platform: 'Lazada', sessions: 27700, buyers: 1200, orders: 1220, gmv: 81600, aov: 66.9,
          organicSharePct: 48, sessionTrendPct: 4, promoRevenuePct: 38, grossMarginPct: 40,
          roas: 4.1, fulfilment: 'minor-delays', cancelledOrders: 90, cancelledValue: 5900,
          refundedOrders: 20, refundedValue: 1500, addToCartUsers: 3850 },
      ],
      ...over,
    }),
  );

/** April: Lazada converting worse than it does in May, so the target metric has room to move. */
const APRIL: PeriodSnapshot = {
  clientCode: 'MY-BTY-09',
  periodStart: '2026-04-01',
  periodEnd: '2026-04-30',
  category: 'Beauty — skincare',
  track: 'Conversion Forge™',
  trackPlatform: 'Lazada',
  trackMetric: 'CVR',
  platforms: [
    { platform: 'Shopee', gmv: 206870, sessions: 48200, cvrPct: 6.1, aov: 68.5, leakageRm: 0 },
    { platform: 'Lazada', gmv: 72921, sessions: 27700, cvrPct: 3.87, aov: 66.9, leakageRm: 10110 },
  ],
};

describe('what it refuses to compare', () => {
  it('refuses a snapshot from a different client', () => {
    expect(() => movementSince(analyse(engagement(), EMPTY), { ...APRIL, clientCode: 'MY-FASH-02' }))
      .toThrow(SnapshotMismatchError);
  });

  it('refuses a period that overlaps this one', () => {
    // Two overlapping windows share days, so any delta double-counts them.
    expect(() =>
      movementSince(analyse(engagement(), EMPTY), { ...APRIL, periodEnd: '2026-05-15' }),
    ).toThrow(/not earlier than this one/);
  });

  it('refuses the same period compared against itself', () => {
    expect(() =>
      movementSince(analyse(engagement(), EMPTY), {
        ...APRIL,
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
      }),
    ).toThrow(SnapshotMismatchError);
  });

  it('throws rather than returning an empty comparison', () => {
    /*
     * The load-bearing distinction. An empty result reads exactly like a genuinely flat cycle,
     * and "nothing moved" is a sentence someone says out loud to a client.
     */
    let threw = false;
    try {
      movementSince(analyse(engagement(), EMPTY), { ...APRIL, clientCode: 'OTHER' });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('what it reports', () => {
  const m = movementSince(analyse(engagement(), EMPTY), APRIL);

  it('computes the change and carries the arithmetic', () => {
    const cvr = m.movements.find((x) => x.platform === 'Lazada' && x.metric === 'CVR')!;
    expect(cvr.before).toBe(3.87);
    expect(cvr.after).toBeCloseTo(4.33, 2);
    expect(cvr.change.tag).toBe('CALC');
    expect(cvr.change.workings).toMatch(/−/);
    expect(cvr.changePct!.value).toBeCloseTo(11.9, 0);
    expect(cvr.direction).toBe('up');
  });

  it('marks the metric the last brief promised would move', () => {
    const target = m.movements.filter((x) => x.isTargetMetric);
    expect(target).toHaveLength(1);
    expect(target[0]!.metric).toBe('CVR');
    expect(target[0]!.platform).toBe('Lazada');
  });

  it('gives the verdict on that promise', () => {
    expect(m.promise.outcome).toBe('moved');
    expect(m.promise.detail).toMatch(/Conversion rate on Lazada went up/);
  });

  it('counts the days between periods', () => {
    expect(m.daysBetween).toBe(1); // 30 April to 1 May
  });
});

describe('the judgements that would be wrong in a client meeting', () => {
  it('treats a change inside the noise band as flat, not as movement', () => {
    // Lazada CVR barely changes: 3.87 → 3.90 is under 1% relative.
    const barely = engagement({
      platforms: [
        { platform: 'Shopee', sessions: 48200, buyers: 2940, orders: 3020, gmv: 206870, aov: 68.5,
          organicSharePct: 55, sessionTrendPct: 12, promoRevenuePct: 32, grossMarginPct: 41,
          roas: 5.2, fulfilment: 'clean' },
        { platform: 'Lazada', sessions: 27700, buyers: 1080, orders: 1090, gmv: 72921, aov: 66.9,
          organicSharePct: 48, sessionTrendPct: 4, promoRevenuePct: 38, grossMarginPct: 40,
          roas: 4.1, fulfilment: 'minor-delays' },
      ],
    });
    const m = movementSince(analyse(barely, EMPTY), APRIL);
    const cvr = m.movements.find((x) => x.platform === 'Lazada' && x.metric === 'CVR')!;
    expect(cvr.direction).toBe('flat');
    expect(m.promise.outcome).toBe('did-not-move');
  });

  it('reads falling leakage as a win, not a loss', () => {
    /*
     * Every other metric here is a growth figure where up is good. Leakage is money lost, so
     * down is the win — getting this backwards would congratulate a client for losing revenue.
     */
    const m = movementSince(analyse(engagement(), EMPTY), {
      ...APRIL,
      trackMetric: 'Leakage',
      trackPlatform: 'Lazada',
    });
    const leak = m.movements.find((x) => x.platform === 'Lazada' && x.metric === 'Leakage')!;
    expect(leak.after).toBeLessThan(leak.before);
    expect(leak.direction).toBe('down');
    expect(m.promise.outcome).toBe('moved');
  });

  it('says unknown — not unchanged — when the promised metric cannot be read', () => {
    const noAov = engagement({
      platforms: [
        { platform: 'Shopee', sessions: 48200, buyers: 2940, orders: 3020, gmv: 206870,
          organicSharePct: 55, sessionTrendPct: 12, promoRevenuePct: 32, grossMarginPct: 41,
          roas: 5.2, fulfilment: 'clean' },
      ],
    });
    const m = movementSince(analyse(noAov, EMPTY), { ...APRIL, trackMetric: 'AOV', trackPlatform: 'Shopee' });
    expect(m.promise.outcome).toBe('unknown');
    expect(m.promise.detail).toMatch(/not the same as unchanged/);
  });

  it('omits a metric entirely when either period lacks it', () => {
    // April has no AOV for Lazada, so no AOV row can be produced for it — not a zero change.
    const m = movementSince(analyse(engagement(), EMPTY), {
      ...APRIL,
      platforms: APRIL.platforms.map((p) => (p.platform === 'Lazada' ? { ...p, aov: null } : p)),
    });
    expect(m.movements.some((x) => x.platform === 'Lazada' && x.metric === 'AOV')).toBe(false);
    expect(m.movements.some((x) => x.platform === 'Shopee' && x.metric === 'AOV')).toBe(true);
  });

  it('skips a channel that did not exist last period', () => {
    const m = movementSince(analyse(engagement(), EMPTY), {
      ...APRIL,
      platforms: APRIL.platforms.filter((p) => p.platform === 'Shopee'),
    });
    expect(m.movements.every((x) => x.platform === 'Shopee')).toBe(true);
  });

  it('says nothing was promised when no track was active last period', () => {
    const m = movementSince(analyse(engagement(), EMPTY), {
      ...APRIL,
      track: null,
      trackMetric: null,
      trackPlatform: null,
    });
    expect(m.promise.outcome).toBe('unknown');
    expect(m.promise.detail).toMatch(/nothing was promised/);
  });
});

describe('the snapshot round-trips', () => {
  it('a run snapshots into something the next run can compare against', () => {
    const first = analyse(
      engagement({ periodStart: '2026-04-01', periodEnd: '2026-04-30' }),
      EMPTY,
    );
    const snap = snapshot(first);
    expect(snap.clientCode).toBe('MY-BTY-09');
    expect(snap.periodEnd).toBe('2026-04-30');
    expect(snap.trackMetric).not.toBeNull();
    // Survives storage, which is JSON and nothing else.
    const stored = JSON.parse(JSON.stringify(snap)) as PeriodSnapshot;
    const m = movementSince(analyse(engagement(), EMPTY), stored);
    expect(m.movements.length).toBeGreaterThan(0);
  });
});

describe('the brief', () => {
  it('opens with what happened to the last cycle before this period’s reading', () => {
    const a = analyse(engagement(), EMPTY);
    const brief = renderBrief(a, undefined, { movement: movementSince(a, APRIL) });
    expect(brief).toContain('## 1a. MOVEMENT SINCE LAST PERIOD');
    expect(brief).toContain('**The number moved.**');
    expect(brief).toContain('**(target)**');
    /*
     * Ordering is the point: the previous sprint is settled before new figures are discussed.
     * Matched on the heading, not on "2." — that substring occurs inside every decimal figure
     * in the brief and the first hit is nowhere near a section boundary.
     */
    expect(brief.indexOf('## 1a. MOVEMENT')).toBeGreaterThan(brief.indexOf('## 1. DATA CONFIRMED'));
    expect(brief.indexOf('## 1a. MOVEMENT')).toBeLessThan(brief.indexOf('## 2.'));
  });

  it('omits the section entirely when there is no earlier period', () => {
    const brief = renderBrief(analyse(engagement(), EMPTY));
    expect(brief).not.toContain('MOVEMENT SINCE LAST PERIOD');
  });
});

describe('the gaps list numbers every item once', () => {
  it('continues counting through the blocking checks instead of repeating one number', () => {
    /*
     * A brief with two gaps and several failed reconciliations used to render the checks as
     * "3." four times over. The list is read aloud to a client — "answer number 4" has to mean
     * exactly one thing.
     */
    const messy = loadEngagement(
      JSON.stringify({
        clientCode: 'MY-BTY-09',
        category: 'Beauty — skincare',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        platforms: [
          // Orders and GMV that cannot both be true, on two channels, so several checks fail.
          { platform: 'Shopee', sessions: 100, buyers: 90, orders: 5000, gmv: 200, aov: 2,
            headlineCvr: 1, organicSharePct: 12, promoRevenuePct: 2, grossMarginPct: 1,
            roas: 1, fulfilment: 'clean' },
          { platform: 'Lazada', sessions: 66, buyers: 60, orders: 9000, gmv: 300, aov: 3,
            headlineCvr: 67, organicSharePct: 48, promoRevenuePct: 67, grossMarginPct: 40,
            roas: 4, fulfilment: 'clean' },
          // No buyers and no orders, so this channel contributes real gaps above the checks.
          { platform: 'TikTok', sessions: 500, gmv: 1000 },
        ],
      }),
    );
    const brief = renderBrief(analyse(messy, EMPTY));
    const section = brief.slice(brief.indexOf('## 10. GAPS'));
    const numbers = [...section.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbers.length).toBeGreaterThan(2);
    // Strictly increasing by one, with no repeats anywhere in the list.
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
