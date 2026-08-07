import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadEngagement } from '../src/types/load.js';
import { DEFAULT_THRESHOLDS, parseBenchmarks } from '../src/benchmarks/parse.js';
import { analyse, type Analysis } from '../src/engine/pipeline.js';
import { renderBrief } from '../src/render/brief.js';
import { isAsk, type Tagged } from '../src/types/tagged.js';
import { isScored, LEVEL_NAME, TRACK } from '../src/engine/scoring.js';
import { targetIsBelowGap } from '../src/engine/sizing.js';

/** An empty benchmark file — the honest day-one state. */
const EMPTY = { rows: [], rejected: [], thresholds: DEFAULT_THRESHOLDS };

const v = (t: Tagged<number> | undefined): number => {
  if (t === undefined || isAsk(t)) throw new Error('expected a known figure');
  return t.value;
};

function run(path: string): Analysis {
  return analyse(loadEngagement(readFileSync(path, 'utf8')), EMPTY);
}

describe('golden — MY-BTY-09, three platforms, empty benchmark file', () => {
  const a = run('fixtures/my-bty-09.json');
  const by = (name: string) => a.platforms.find((p) => p.data.platform === name)!;

  it('reads zero benchmark rows from the empty template', () => {
    expect(EMPTY.rows).toHaveLength(0);
  });

  it('normalises conversion as buyers ÷ sessions on every platform', () => {
    expect(v(by('Shopee').cvr.cvr)).toBeCloseTo(6.0996, 3);
    expect(v(by('Lazada').cvr.cvr)).toBeCloseTo(3.87, 2);
    expect(v(by('TikTok').cvr.cvr)).toBeCloseTo(2.7835, 3);
  });

  it('keeps each platform’s own headline figure alongside', () => {
    expect(v(by('Shopee').cvr.headline)).toBe(8.4);
    expect(by('Shopee').cvr.headlineBasis).toBe('product-card clicks');
  });

  it('resolves the benchmark to Shopee, flagged as internal and not cross-client comparable', () => {
    const lz = by('Lazada').scores.benchmark;
    expect(v(lz.cvr)).toBeCloseTo(6.0996, 3);
    expect(lz.internalBenchmark).toBe(true);
    expect(lz.origin).toBe('internal');
    expect(lz.sourcePlatform).toBe('Shopee');
    expect(lz.comparableAcrossClients).toBe(false);
    expect(lz.note).toMatch(/Same catalogue/);
  });

  it('scores Lazada and TikTok Critical on conversion', () => {
    expect(by('Lazada').scores.cvrRatio).toBeCloseTo(0.634, 3);
    expect(by('TikTok').scores.cvrRatio).toBeCloseTo(0.456, 3);
    for (const name of ['Lazada', 'TikTok']) {
      const s = by(name).scores.areas.conversion;
      expect(isScored(s) && s.level).toBe(3);
    }
  });

  it('holds business-level Conversion at High because Lazada is 24.0% of revenue', () => {
    const c = a.business.conversion;
    expect(isScored(c.level) && c.level.level).toBe(2);
    expect(v(by('Lazada').revenueSharePct)).toBeCloseTo(24.03, 2);
    expect(c.sentence).toMatch(/Critical on Lazada/);
    expect(c.sentence).toMatch(/scored High at business level/);
    expect(c.sentence).toMatch(/24\.0%/);
  });

  it('computes Lazada leakage and cancellation rate', () => {
    expect(v(by('Lazada').leakage.sharePct)).toBeCloseTo(13.86, 2);
    expect(v(by('Lazada').cancellationRate)).toBeCloseTo(10.83, 2);
  });

  it('returns blocked=unknown on operations with the stock-out question first in GAPS', () => {
    expect(a.blockers.blocked).toBe('unknown');
    expect(a.blockers.message).toMatch(/Lazada cancelled/);
    expect(a.blockers.wouldChange).toMatch(/no track activates/);

    const first = a.gaps[0]!;
    expect(first.question).toMatch(/Why did 118 Lazada orders cancel/);
    expect(first.question).toMatch(/stock-out/);
    expect(first.question).toMatch(/no track activates this cycle/);
  });

  it('selects Conversion at 2.00, running on Lazada rather than the worse TikTok', () => {
    expect(a.track.activeArea).toBe('conversion');
    expect(a.track.activeTrack).toBe('conversion-forge');
    expect(a.track.topScore).toBeCloseTo(2.0, 6);
    expect(a.track.platform).toBe('Lazada');
    expect(TRACK[a.track.activeTrack!].name).toBe('Conversion Forge™');

    const row = a.track.rows.find((r) => r.area === 'conversion')!;
    expect(row.workings).toBe('2 × 1.00 = 2.00');
  });

  it('leaves Basket unscored rather than treating a missing AOV trend as Stable', () => {
    const b = a.track.rows.find((r) => r.area === 'basket')!;
    expect(b.score).toBeUndefined();
    expect(b.levelName).toBe('Unscored');
    expect(a.gaps.some((g) => /AOV trend not supplied/.test(g.question))).toBe(true);
  });

  it('sizes the target below the full gap, and shows both', () => {
    const s = a.sizing!;
    const target = v(s.target.uplift);
    const gap = v(s.fullGap.uplift);
    expect(target).toBeCloseTo(18230.25, 1);
    expect(gap).toBeCloseTo(42010.19, 1);
    expect(target).toBeLessThan(gap);
    expect(targetIsBelowGap(s)).toBe(true);
    expect(v(s.target.targetMetric)).toBeCloseTo(4.8375, 4);
  });

  it('renders a brief with every section and no raw untagged figure in the data table', () => {
    const md = renderBrief(a);
    for (const h of [
      '## 1. DATA CONFIRMED',
      '## 2. SANITY CHECKS',
      '## 3. PRESSURE SCORING',
      '## 4. BLOCKER CHECK',
      '## 5. GROWTH PRESSURE SCORE',
      '## 6. THE FINDING',
      '## 7. ACTIVE TRACK',
      '## 8. THE 30-DAY SPRINT',
      '## 9. WHAT WE ARE NOT DOING THIS CYCLE',
      '## 10. GAPS',
      '## BENCHMARK CANDIDATES FROM THIS ENGAGEMENT',
    ]) {
      expect(md).toContain(h);
    }
    expect(md).toContain('MY-BTY-09');
    expect(md).toContain('Conversion Forge™ — on Lazada');
    expect(md).toContain('the size of the hole');
    expect(md).toContain('n=1');
    expect(md).toContain('One client is not a category');
    // Section 6 and 8 are placeholders without the LLM.
    expect(md).toContain('_(not generated');
  });

  it('marks the leading gap as able to invalidate the recommendation', () => {
    const md = renderBrief(a);
    expect(md).toMatch(/1\. Why did 118 Lazada orders cancel.*could invalidate the recommendation/s);
  });

  it('reports no runner-up, because every other track-bearing area is Stable or unscored', () => {
    // Traffic and Campaign both roll up to Stable here: TikTok's 55% promo dependency is
    // Medium on a channel worth 7.8% of revenue, which steps down to Stable. Basket is
    // unscored for want of an AOV trend. So there is genuinely nothing in contention.
    expect(a.track.runnerUp).toBeUndefined();
    const md = renderBrief(a);
    expect(md).toContain('No second track is in contention');
    expect(md).toContain('One track, one platform, one cycle.');
  });
});

describe('single platform, empty benchmark file', () => {
  const a = run('fixtures/my-solo-01.json');

  it('returns Conversion unscored with the exact ASK text', () => {
    const c = a.business.conversion;
    expect(isScored(c.level)).toBe(false);
    const gap = a.gaps.find((g) =>
      /no benchmark on file for Shopee \/ Home — kitchenware — need one to score Conversion/.test(
        g.question,
      ),
    );
    expect(gap).toBeDefined();
  });

  it('still scores the other five areas', () => {
    for (const id of ['traffic', 'basket', 'campaign', 'operations', 'profitability'] as const) {
      expect(isScored(a.business[id].level)).toBe(true);
    }
    expect(LEVEL_NAME[3]).toBe('Critical');
  });

  it('still generates a brief, and invents no conversion figure anywhere in it', () => {
    const md = renderBrief(a);
    expect(md).toContain('## 5. GROWTH PRESSURE SCORE');
    expect(md).toContain('no benchmark on file');
    expect(md).toContain('Not treated as zero.');

    // The only conversion percentage permitted in the output is the client's own
    // computed rate (1,240 ÷ 31,000 = 4.00%) and their stated headline (5.1%).
    // Any other CVR-shaped figure would be invented.
    const allowed = new Set(['4.00', '5.10', '4.0', '5.1']);
    const conversionSection = md.slice(md.indexOf('## 1.'), md.indexOf('## 2.'));
    const buyerCvrRow = conversionSection
      .split('\n')
      .find((l) => l.includes('Buyer CVR (normalised)'))!;
    const figures = [...buyerCvrRow.matchAll(/(\d+\.\d+)%/g)].map((m) => m[1]!);
    for (const f of figures) expect(allowed.has(f)).toBe(true);
  });

  it('fires the margin blocker — 22% margin with ROAS 1.7 is Critical', () => {
    const p = a.business.profitability.level;
    expect(isScored(p) && p.level).toBe(3);
    expect(a.blockers.blocked).toBe(true);
    expect(a.blockers.kind).toBe('margin');
    const md = renderBrief(a);
    expect(md).toContain('No track activates this cycle');
  });
});

describe('empty template really is empty', () => {
  it('parses the repo template to zero usable rows', () => {
    const md = `
## Conversion rate (CVR)

| Platform | Category | Median CVR | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| _(empty)_ | | | | | | |

## Example row — for format only, NOT a real benchmark

| Platform | Category | Median CVR | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| ~~Shopee~~ | ~~Beauty — skincare~~ | ~~2.4%~~ | ~~4~~ | ~~non-campaign, 30d~~ | ~~2026-07~~ | ~~MY-BTY-01~~ |
`;
    const parsed = parseBenchmarks(md, { asOf: '2026-04' });
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.rejected).toHaveLength(0);
  });
});
