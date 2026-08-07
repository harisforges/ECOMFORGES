import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadEngagement } from '../src/types/load.js';
import { DEFAULT_THRESHOLDS } from '../src/benchmarks/parse.js';
import { analyse } from '../src/engine/pipeline.js';
import { buildPayload, validateProse, writeProse, type ProseClient } from '../src/llm/prose.js';
import type { Prose } from '../src/render/brief.js';

const EMPTY = { rows: [], rejected: [], thresholds: DEFAULT_THRESHOLDS };
const analysis = analyse(loadEngagement(readFileSync('fixtures/my-bty-09.json', 'utf8')), EMPTY);
const payload = buildPayload(analysis);

const good: Prose = {
  finding:
    'Traffic is not the problem. Lazada takes 27,700 sessions a month and converts them at 3.87%, ' +
    'against 6.10% on Shopee for the same catalogue.',
  sprint: {
    fix: {
      directive:
        'Copy the Shopee image set and title for Glow Serum 30ml onto the Lazada listing, unchanged.',
      hypothesis: 'The Lazada product page, not the traffic, is where buyers leave.',
      falsifiedBy: 'Conversion on those listings does not move within 30 days.',
    },
    run: {
      directive: 'Send a 7-day voucher to the 2,778 Lazada shoppers who added to cart and did not buy.',
      startsIn: 'on the next non-campaign day',
      endsIn: '7 days later',
    },
    optimise: { directive: 'Move RM6,200 of Lazada ad budget onto the five listings above.' },
  },
  highestRoiClaim: false,
};

/** Uses a client with a canned response, so no API key or network is involved. */
const stub = (...responses: string[]): ProseClient => {
  let i = 0;
  return {
    async create() {
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return r!;
    },
  };
};

const SYSTEM = 'test system prompt';

describe('payload', () => {
  it('carries add-to-cart minus buyers, so the Run directive can target existing intent', () => {
    const lz = payload.platforms.find((p) => p['platform'] === 'Lazada')!;
    expect(lz['addToCartUsers']).toBe(3850);
    expect(lz['buyers']).toBe(1072);
    expect(lz['addToCartMinusBuyers']).toBe(2778);
  });

  it('carries the real SKU list so directives can name products', () => {
    const sh = payload.platforms.find((p) => p['platform'] === 'Shopee')!;
    expect(sh['topSkus']).toHaveLength(5);
  });

  it('carries both sizing figures', () => {
    expect(payload.sizing!['targetUpliftRmPerMonth']).toBeCloseTo(18230.25, 1);
    expect(payload.sizing!['fullGapUpliftRmPerMonth']).toBeCloseTo(42010.19, 1);
  });

  it('says the benchmark is internal and where it came from', () => {
    expect(payload.benchmark.internal).toBe(true);
    expect(payload.benchmark.sourcePlatform).toBe('Shopee');
  });
});

describe('validator', () => {
  it('accepts prose whose every figure came from the payload', () => {
    expect(validateProse(good, payload)).toEqual([]);
  });

  it('catches an invented figure', () => {
    const bad: Prose = {
      ...good,
      finding: 'Lazada converts at 3.87% against a category benchmark of 7.45%.',
    };
    const problems = validateProse(bad, payload);
    expect(problems.some((p) => p.kind === 'invented-number')).toBe(true);
    expect(problems.find((p) => p.kind === 'invented-number')!.detail).toContain('7.45');
  });

  it('catches an invented ringgit figure', () => {
    const bad: Prose = {
      ...good,
      sprint: { ...good.sprint, optimise: { directive: 'Shift RM11,450 of ad budget to Lazada.' } },
    };
    expect(validateProse(bad, payload).some((p) => p.detail.includes('11,450'))).toBe(true);
  });

  it('allows a rounded rendering of a real figure', () => {
    const ok: Prose = {
      ...good,
      finding: 'Closing a quarter of the gap is worth RM18,230 a month.',
    };
    expect(validateProse(ok, payload)).toEqual([]);
  });

  it('allows ordinary prose counts a directive needs to be a sentence', () => {
    const ok: Prose = {
      ...good,
      sprint: {
        ...good.sprint,
        fix: { directive: 'Copy the top 5 Shopee listings onto Lazada within 30 days.' },
      },
    };
    expect(validateProse(ok, payload)).toEqual([]);
  });

  it('rejects a missing directive', () => {
    const bad = {
      ...good,
      sprint: { ...good.sprint, optimise: { directive: '   ' } },
    } as Prose;
    expect(validateProse(bad, payload).some((p) => p.kind === 'wrong-directive-count')).toBe(true);
  });

  it('rejects first-person-plural delivery language', () => {
    const bad: Prose = {
      ...good,
      sprint: { ...good.sprint, optimise: { directive: "We'll shift the ad budget for you." } },
    };
    const problems = validateProse(bad, payload);
    expect(problems.some((p) => p.kind === 'forbidden-phrase')).toBe(true);
  });

  it('cannot catch a figure that coincidentally equals an unrelated payload number', () => {
    // 5.20 is Shopee's ROAS. Written as a conversion benchmark it is fabricated, but the
    // check is a value-set membership test and the value is genuinely in the payload, so
    // it passes. This is the known limit of the approach: it catches figures that were
    // never computed, not figures used in the wrong place.
    const collides: Prose = {
      ...good,
      finding: 'Lazada converts at 3.87% against a category benchmark of 5.20%.',
    };
    expect(validateProse(collides, payload)).toEqual([]);
  });

  it('rejects emoji and exclamation marks', () => {
    expect(validateProse({ ...good, finding: 'Big win 🎉' }, payload).length).toBeGreaterThan(0);
    expect(validateProse({ ...good, finding: 'Traffic is fine!' }, payload).length).toBeGreaterThan(0);
  });
});

describe('writeProse', () => {
  it('returns on a clean first draft', async () => {
    const r = await writeProse(analysis, stub(JSON.stringify(good)), SYSTEM);
    expect(r.attempts).toBe(1);
    expect(r.correctedProblems).toEqual([]);
    expect(r.prose.finding).toContain('3.87%');
  });

  it('retries once when the model invents a figure, and reports what it corrected', async () => {
    const invented: Prose = {
      ...good,
      finding: 'Lazada converts at 3.87% against a category average of 7.45% for Malaysian skincare.',
    };
    const r = await writeProse(
      analysis,
      stub(JSON.stringify(invented), JSON.stringify(good)),
      SYSTEM,
    );
    expect(r.attempts).toBe(2);
    expect(r.correctedProblems.some((p) => p.detail.includes('7.45'))).toBe(true);
    expect(r.prose.finding).not.toContain('7.45');
  });

  it('fails the run rather than emitting a brief that cites a figure nobody computed', async () => {
    const invented = JSON.stringify({
      ...good,
      finding: 'The category benchmark is 7.45% and Lazada sits well below it.',
    });
    await expect(writeProse(analysis, stub(invented, invented), SYSTEM)).rejects.toThrow(
      /failed validation twice/,
    );
  });

  it('tolerates a stray code fence', async () => {
    const r = await writeProse(analysis, stub('```json\n' + JSON.stringify(good) + '\n```'), SYSTEM);
    expect(r.prose.sprint.fix.directive).toContain('Glow Serum');
  });

  it('rejects a response of the wrong shape', async () => {
    await expect(writeProse(analysis, stub('{"finding": "x"}'), SYSTEM)).rejects.toThrow(
      /does not match the expected shape/,
    );
  });
});
