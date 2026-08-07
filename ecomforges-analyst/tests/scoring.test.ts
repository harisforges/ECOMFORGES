import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { data, ask } from '../src/types/tagged.js';
import type { PlatformData } from '../src/types/datasheet.js';
import { validate, periodDays } from '../src/types/datasheet.js';
import { DEFAULT_THRESHOLDS as TH } from '../src/benchmarks/parse.js';
import {
  isScored,
  scoreBasket,
  scoreCampaign,
  scoreConversion,
  scoreOperations,
  scoreProfitability,
  scoreTraffic,
  stepDownFor,
  type Level,
} from '../src/engine/scoring.js';
import { calc } from '../src/types/tagged.js';

const base = (over: Partial<PlatformData> = {}): PlatformData =>
  ({ platform: 'Shopee', ...over }) as PlatformData;

const bench = (cvr: number) => ({
  cvr: data(cvr),
  internalBenchmark: false,
  comparableAcrossClients: true,
  note: '',
});

const levelOf = (s: ReturnType<typeof scoreTraffic>): Level | 'unscored' =>
  isScored(s) ? s.level : 'unscored';

describe('conversion thresholds', () => {
  const cases: [number, Level][] = [
    [10, 0], // ratio 1.00 exactly
    [10.5, 0],
    [8.5, 1], // ratio 0.85 exactly
    [9.9, 1],
    [6.5, 2], // ratio 0.65 exactly
    [8.4, 2],
    [6.4, 3],
    [1, 3],
  ];
  for (const [cvr, expected] of cases) {
    it(`${cvr}% against a 10% benchmark → ${expected}`, () => {
      const p = base({ sessions: data(1000), buyers: data(cvr * 10) });
      const r = scoreConversion(p, bench(10), TH);
      expect(levelOf(r.score)).toBe(expected);
    });
  }

  it('is Unscored — not zero — when the benchmark is unavailable', () => {
    const p = base({ sessions: data(1000), buyers: data(61) });
    const r = scoreConversion(
      p,
      { cvr: ask('no benchmark on file'), internalBenchmark: false, comparableAcrossClients: false, note: '' },
      TH,
    );
    expect(r.score.kind).toBe('unscored');
    expect(isScored(r.score)).toBe(false);
    if (!isScored(r.score)) expect(r.score.gap.question).toMatch(/no benchmark/);
  });
});

describe('traffic thresholds', () => {
  it('thin organic and falling sessions → Critical', () => {
    expect(levelOf(scoreTraffic(base({ organicSharePct: data(20), sessionTrendPct: data(-10) }), TH))).toBe(3);
  });
  it('thin organic alone → High', () => {
    expect(levelOf(scoreTraffic(base({ organicSharePct: data(20), sessionTrendPct: data(8) }), TH))).toBe(2);
  });
  it('falling sessions alone → High', () => {
    expect(levelOf(scoreTraffic(base({ organicSharePct: data(55), sessionTrendPct: data(-10) }), TH))).toBe(2);
  });
  it('rising with healthy organic → Stable', () => {
    expect(levelOf(scoreTraffic(base({ organicSharePct: data(55), sessionTrendPct: data(12) }), TH))).toBe(0);
  });
  it('flat sessions with healthy organic → Medium', () => {
    expect(levelOf(scoreTraffic(base({ organicSharePct: data(55), sessionTrendPct: data(1) }), TH))).toBe(1);
  });
  it('29% organic is thin, 30% is not', () => {
    expect(levelOf(scoreTraffic(base({ organicSharePct: data(29), sessionTrendPct: data(12) }), TH))).toBe(2);
    expect(levelOf(scoreTraffic(base({ organicSharePct: data(30), sessionTrendPct: data(12) }), TH))).toBe(0);
  });
});

describe('basket thresholds', () => {
  it('rising AOV → Stable', () => {
    expect(levelOf(scoreBasket(base({ aovTrend: data('up') })))).toBe(0);
  });
  it('flat AOV → Medium', () => {
    expect(levelOf(scoreBasket(base({ aovTrend: data('flat') })))).toBe(1);
  });
  it('falling AOV with falling sessions → High', () => {
    expect(levelOf(scoreBasket(base({ aovTrend: data('down'), sessionTrendPct: data(-9) })))).toBe(2);
  });
  it('falling AOV while sessions rise → Critical', () => {
    expect(levelOf(scoreBasket(base({ aovTrend: data('down'), sessionTrendPct: data(9) })))).toBe(3);
  });
  it('falling AOV while sessions are flat → Critical', () => {
    expect(levelOf(scoreBasket(base({ aovTrend: data('down'), sessionTrendPct: data(0) })))).toBe(3);
  });
  it('no AOV trend → Unscored', () => {
    expect(scoreBasket(base()).kind).toBe('unscored');
  });
});

describe('campaign thresholds', () => {
  const cases: [number, Level][] = [
    [39, 0],
    [40, 1],
    [59, 1],
    [60, 2],
    [74, 2],
    [75, 3],
    [90, 3],
  ];
  for (const [pct, expected] of cases) {
    it(`${pct}% promo revenue → ${expected}`, () => {
      expect(levelOf(scoreCampaign(base({ promoRevenuePct: data(pct) }), TH))).toBe(expected);
    });
  }
});

describe('operations', () => {
  it('maps each fulfilment state', () => {
    expect(levelOf(scoreOperations(base({ fulfilment: data('clean') })))).toBe(0);
    expect(levelOf(scoreOperations(base({ fulfilment: data('minor-delays') })))).toBe(1);
    expect(levelOf(scoreOperations(base({ fulfilment: data('sla-breaches') })))).toBe(2);
    expect(levelOf(scoreOperations(base({ fulfilment: data('out-of-stock') })))).toBe(3);
  });
});

describe('profitability', () => {
  const cases: [number, Level][] = [
    [41, 0],
    [35, 0],
    [34, 1],
    [25, 1],
    [24, 2],
    [20, 2],
    [19, 3],
  ];
  for (const [margin, expected] of cases) {
    it(`${margin}% margin → ${expected}`, () => {
      expect(levelOf(scoreProfitability(base({ grossMarginPct: data(margin) }), TH))).toBe(expected);
    });
  }

  it('raises one level when ROAS is below 2, capped at Critical', () => {
    expect(levelOf(scoreProfitability(base({ grossMarginPct: data(41), roas: data(1.7) }), TH))).toBe(1);
    expect(levelOf(scoreProfitability(base({ grossMarginPct: data(19), roas: data(1.7) }), TH))).toBe(3);
  });

  it('does not raise at ROAS exactly 2.0', () => {
    expect(levelOf(scoreProfitability(base({ grossMarginPct: data(41), roas: data(2.0) }), TH))).toBe(0);
  });

  it('is Unscored with neither margin nor ROAS, and names the blocker consequence', () => {
    const s = scoreProfitability(base(), TH);
    expect(s.kind).toBe('unscored');
    if (!isScored(s)) expect(s.gap.question).toMatch(/margin blocker cannot be checked/);
  });
});

describe('revenue-share step-down', () => {
  it('holds a majority platform at its own level', () => {
    expect(stepDownFor(68)).toBe(0);
    expect(stepDownFor(50)).toBe(0);
  });
  it('steps a mid-share platform down one', () => {
    expect(stepDownFor(49)).toBe(1);
    expect(stepDownFor(24)).toBe(1);
    expect(stepDownFor(20)).toBe(1);
  });
  it('steps a small platform down two', () => {
    expect(stepDownFor(19)).toBe(2);
    expect(stepDownFor(7.8)).toBe(2);
  });
});

describe('period validation', () => {
  const eng = (start: string, end: string) => ({
    clientCode: 'MY-BTY-09',
    periodStart: new Date(start),
    periodEnd: new Date(end),
    category: 'Beauty — skincare',
    platforms: [base()],
  });

  it('flags a 10-day period', () => {
    const problems = validate(eng('2026-04-01', '2026-04-10'));
    expect(periodDays(eng('2026-04-01', '2026-04-10'))).toBe(10);
    expect(problems.map((p) => p.kind)).toContain('short-period');
  });

  it('flags a period spanning 11 November', () => {
    const problems = validate(eng('2026-11-01', '2026-11-30'));
    expect(problems.map((p) => p.kind)).toContain('campaign-inflated');
    expect(problems.find((p) => p.kind === 'campaign-inflated')!.message).toContain('11.11');
  });

  it('passes a clean 30-day period', () => {
    expect(validate(eng('2026-04-01', '2026-04-30'))).toHaveLength(0);
  });

  it('rejects a brand name used as a client code', () => {
    const problems = validate({ ...eng('2026-04-01', '2026-04-30'), clientCode: 'Glow Beauty Sdn Bhd' });
    expect(problems.map((p) => p.kind)).toContain('bad-client-code');
  });
});

describe('no hardcoded conversion fallback in the engine', () => {
  /**
   * The engine must never carry a default benchmark. A plausible-looking rate sitting in
   * a fallback branch is exactly the failure R1 exists to prevent, and it would be
   * invisible in the output — the brief would simply score Conversion against a number
   * nobody chose.
   */
  it('contains no bare numeric literal that could serve as a CVR default', () => {
    const dir = 'src/engine';
    const offenders: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      const src = readFileSync(join(dir, f), 'utf8');
      src.split(/\r?\n/).forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        // A CVR-shaped literal being assigned or returned, e.g. `?? 2.4` or `= 3.1`.
        if (/(?:\?\?|=|return|:)\s*\d\.\d\b/.test(code) && !/toFixed|\bversion\b/.test(code)) {
          // The impact weights (1.00 / 0.85 / 0.80 / 0.70) live in the thresholds object,
          // not here, so any match in this directory is a real finding.
          offenders.push(`${f}:${i + 1} ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('unscored cannot be arithmetic', () => {
  it('the shape has no level to multiply', () => {
    const s = scoreBasket(base());
    expect(isScored(s)).toBe(false);
    // @ts-expect-error — Unscored has no `level`, which is the whole point.
    const _ = s.level;
    expect(_).toBeUndefined();
    expect(calc(0, '').value).toBe(0); // sanity: calc still works
  });
});
