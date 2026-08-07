/**
 * Pressure scoring. Pure. No LLM.
 *
 * Thresholds come from the Thresholds object parsed out of the benchmark file, not from
 * literals here, so editing that markdown changes the model.
 *
 * `Unscored` is a distinct kind from level 0. A missing benchmark means "we do not know",
 * not "this area is fine", and the shapes below make it impossible to arithmetic on an
 * unscored area by accident.
 */

import type { PlatformData, PlatformName } from '../types/datasheet.js';
import { isAsk, num, pct, ratio, type Tagged, type TaggedAsk, ask } from '../types/tagged.js';
import type { Thresholds } from '../benchmarks/parse.js';
import { normaliseCvr, revenueShare, trendFromPct } from './normalise.js';
import { resolveConversionBenchmark, type ResolvedBenchmark } from './benchmark-resolution.js';
import type { ParsedBenchmarks } from '../benchmarks/parse.js';

export type Level = 0 | 1 | 2 | 3;

export const LEVEL_NAME: Record<Level, string> = {
  0: 'Stable',
  1: 'Medium',
  2: 'High',
  3: 'Critical',
};

export interface Scored {
  readonly kind: 'scored';
  readonly level: Level;
  readonly reason: string;
}

export interface Unscored {
  readonly kind: 'unscored';
  readonly reason: string;
  readonly gap: TaggedAsk;
}

export type AreaScore = Scored | Unscored;

export const scored = (level: Level, reason: string): Scored => ({ kind: 'scored', level, reason });
export const unscored = (reason: string, question: string): Unscored => ({
  kind: 'unscored',
  reason,
  gap: ask(question),
});
export const isScored = (a: AreaScore): a is Scored => a.kind === 'scored';

export type AreaId = 'conversion' | 'traffic' | 'basket' | 'campaign' | 'operations' | 'profitability';

export const AREA_NAME: Record<AreaId, string> = {
  conversion: 'Conversion Rate',
  traffic: 'Traffic',
  basket: 'Basket / AOV',
  campaign: 'Campaign Execution',
  operations: 'Operations',
  profitability: 'Profitability',
};

/** The four track-bearing areas, in impact order. Operations and Profitability block. */
export const TRACK_AREAS: readonly AreaId[] = ['conversion', 'traffic', 'campaign', 'basket'];

export type TrackId = 'conversion-forge' | 'traffic-forge' | 'basket-forge' | 'sales-forge';

export const TRACK: Record<TrackId, { name: string; constraint: string; metric: string }> = {
  'conversion-forge': { name: 'Conversion Forge™', constraint: 'Buying efficiency', metric: 'CVR' },
  'traffic-forge': {
    name: 'Traffic Forge™',
    constraint: 'Volume acquisition',
    metric: 'Sessions / organic share',
  },
  'basket-forge': { name: 'Basket Forge™', constraint: 'Revenue per transaction', metric: 'AOV' },
  'sales-forge': {
    name: 'Sales Forge™',
    constraint: 'GMV structure and mechanics',
    metric: 'GMV / repeat rate',
  },
};

export const AREA_TO_TRACK: Record<'conversion' | 'traffic' | 'basket' | 'campaign', TrackId> = {
  conversion: 'conversion-forge',
  traffic: 'traffic-forge',
  basket: 'basket-forge',
  campaign: 'sales-forge',
};

// ─── Per-area scorers ──────────────────────────────────────────────────────────

function read(t: Tagged<number> | undefined): number | undefined {
  if (t === undefined || isAsk(t)) return undefined;
  return t.value;
}

export function scoreConversion(
  p: PlatformData,
  benchmark: ResolvedBenchmark,
  th: Thresholds,
): { score: AreaScore; cvr: Tagged<number>; ratio: number | undefined } {
  const { cvr } = normaliseCvr(p);
  const own = read(cvr);
  const bench = read(benchmark.cvr);

  if (own === undefined) {
    return {
      score: unscored(
        'conversion not computable',
        `${p.platform}: neither buyers nor orders supplied — Conversion cannot be scored`,
      ),
      cvr,
      ratio: undefined,
    };
  }
  if (bench === undefined || bench === 0) {
    return {
      score: unscored(
        'no benchmark available',
        isAsk(benchmark.cvr) ? benchmark.cvr.question : 'no usable conversion benchmark',
      ),
      cvr,
      ratio: undefined,
    };
  }

  const r = own / bench;
  const level: Level =
    r >= th.cvrRatio.stable ? 0 : r >= th.cvrRatio.medium ? 1 : r >= th.cvrRatio.high ? 2 : 3;
  return {
    score: scored(
      level,
      `${pct(own)} against a benchmark of ${pct(bench)} — ratio ${ratio(r)}`,
    ),
    cvr,
    ratio: r,
  };
}

export function scoreTraffic(p: PlatformData, th: Thresholds): AreaScore {
  const organic = read(p.organicSharePct);
  const trendTagged = p.sessionTrendPct !== undefined ? trendFromPct(p.sessionTrendPct) : undefined;
  const trend = trendTagged !== undefined && !isAsk(trendTagged) ? trendTagged.value : undefined;

  if (organic === undefined && trend === undefined) {
    return unscored(
      'no traffic inputs',
      `${p.platform}: organic share and session trend both missing — Traffic cannot be scored`,
    );
  }

  const thin = organic !== undefined && organic < th.organicThinBelowPct;
  let level: Level;
  let reason: string;
  if (thin && trend === 'down') {
    level = 3;
    reason = `organic share ${pct(organic!)} is thin and sessions are falling`;
  } else if (thin || trend === 'down') {
    level = 2;
    reason = thin
      ? `organic share ${pct(organic!)} is below ${th.organicThinBelowPct}%`
      : 'sessions are falling';
  } else if (trend === 'up' && (organic === undefined || organic >= th.organicThinBelowPct)) {
    level = 0;
    reason =
      organic === undefined
        ? 'sessions rising'
        : `sessions rising with organic share at ${pct(organic)}`;
  } else {
    level = 1;
    reason = `sessions ${trend ?? 'trend unknown'}, organic share ${organic === undefined ? 'unknown' : pct(organic)}`;
  }
  return scored(level, reason);
}

export function scoreBasket(p: PlatformData): AreaScore {
  const trendTagged = p.aovTrend;
  if (trendTagged === undefined || isAsk(trendTagged)) {
    return unscored(
      'no AOV trend',
      `${p.platform}: AOV trend not supplied — Basket cannot be scored. Period-on-period AOV is needed.`,
    );
  }
  const aovTrend = trendTagged.value;
  const sessTagged = p.sessionTrendPct !== undefined ? trendFromPct(p.sessionTrendPct) : undefined;
  const sessTrend = sessTagged !== undefined && !isAsk(sessTagged) ? sessTagged.value : undefined;

  if (aovTrend === 'up') return scored(0, 'AOV rising');
  if (aovTrend === 'flat') return scored(1, 'AOV flat');
  // AOV falling while traffic holds or grows means buyers are arriving and spending
  // less — a basket problem, not a traffic one.
  if (sessTrend === 'up' || sessTrend === 'flat') {
    return scored(3, `AOV falling while sessions are ${sessTrend} — buyers arriving and spending less`);
  }
  return scored(2, 'AOV falling');
}

export function scoreCampaign(p: PlatformData, th: Thresholds): AreaScore {
  const promo = read(p.promoRevenuePct);
  if (promo === undefined) {
    return unscored(
      'no promo dependency figure',
      `${p.platform}: share of revenue from campaign days not supplied — Campaign Execution cannot be scored`,
    );
  }
  const level: Level =
    promo < th.promoDependency.stable
      ? 0
      : promo < th.promoDependency.medium
        ? 1
        : promo < th.promoDependency.high
          ? 2
          : 3;
  return scored(level, `${pct(promo)} of revenue from campaign days`);
}

export function scoreOperations(p: PlatformData): AreaScore {
  const f = p.fulfilment;
  if (f === undefined || isAsk(f)) {
    return unscored(
      'no fulfilment state',
      `${p.platform}: fulfilment state not supplied — Operations cannot be scored`,
    );
  }
  const map: Record<string, Level> = {
    clean: 0,
    'minor-delays': 1,
    'sla-breaches': 2,
    'out-of-stock': 3,
  };
  const level = map[f.value] ?? 1;
  return scored(level, `fulfilment reported as ${f.value.replace(/-/g, ' ')}`);
}

export function scoreProfitability(p: PlatformData, th: Thresholds): AreaScore {
  const margin = read(p.grossMarginPct);
  const roas = read(p.roas);
  if (margin === undefined && roas === undefined) {
    return unscored(
      'no margin or ROAS',
      `${p.platform}: gross margin and ROAS both missing — Profitability cannot be scored, so the margin blocker cannot be checked`,
    );
  }
  let level: Level = 1;
  let reason: string;
  if (margin !== undefined) {
    level =
      margin >= th.grossMargin.stable
        ? 0
        : margin >= th.grossMargin.medium
          ? 1
          : margin >= th.grossMargin.high
            ? 2
            : 3;
    reason = `gross margin ${pct(margin)}`;
  } else {
    reason = 'margin unknown, scored from ROAS alone';
  }
  if (roas !== undefined && roas < th.roasStepUpBelow) {
    const raised = Math.min(3, level + 1) as Level;
    reason += `, raised one level because ROAS is ${roas.toFixed(2)} (below ${th.roasStepUpBelow})`;
    level = raised;
  } else if (roas !== undefined) {
    reason += `, ROAS ${roas.toFixed(2)}`;
  }
  return scored(level, reason);
}

// ─── Per-platform bundle ───────────────────────────────────────────────────────

export interface PlatformScores {
  readonly platform: PlatformName;
  readonly revenueSharePct: Tagged<number>;
  readonly benchmark: ResolvedBenchmark;
  readonly cvr: Tagged<number>;
  readonly cvrRatio: number | undefined;
  readonly areas: Readonly<Record<AreaId, AreaScore>>;
}

export function scorePlatform(
  p: PlatformData,
  all: readonly PlatformData[],
  category: string,
  benchmarks: ParsedBenchmarks,
  th: Thresholds,
  suppliedCvr?: number,
): PlatformScores {
  const benchmark = resolveConversionBenchmark({
    platforms: all,
    category,
    benchmarks,
    forPlatform: p.platform,
    ...(suppliedCvr !== undefined ? { suppliedCvr } : {}),
  });
  const conv = scoreConversion(p, benchmark, th);
  return {
    platform: p.platform,
    revenueSharePct: revenueShare(p, all),
    benchmark,
    cvr: conv.cvr,
    cvrRatio: conv.ratio,
    areas: {
      conversion: conv.score,
      traffic: scoreTraffic(p, th),
      basket: scoreBasket(p),
      campaign: scoreCampaign(p, th),
      operations: scoreOperations(p),
      profitability: scoreProfitability(p, th),
    },
  };
}

// ─── Business-level roll-up ────────────────────────────────────────────────────

/**
 * How many levels a platform's score steps down at business level, by revenue share.
 *
 * Platforms are not averaged. An area Critical on a channel worth 8% of revenue is not a
 * Critical business problem, and treating it as one sends a client's only 30 days at
 * their smallest channel.
 */
export function stepDownFor(sharePct: number): number {
  if (sharePct >= 50) return 0;
  if (sharePct >= 20) return 1;
  return 2;
}

export interface BusinessArea {
  readonly area: AreaId;
  readonly level: AreaScore;
  /** Per-platform detail, for the brief's scoring table. */
  readonly perPlatform: readonly {
    platform: PlatformName;
    score: AreaScore;
    sharePct: number | undefined;
    steppedLevel: Level | undefined;
  }[];
  /** Names the platform and its revenue share. Rendered verbatim. */
  readonly sentence: string;
  /** The platform whose stepped level set the business level. */
  readonly drivingPlatform?: PlatformName;
}

export function rollUpArea(area: AreaId, scores: readonly PlatformScores[]): BusinessArea {
  const perPlatform = scores.map((s) => {
    const score = s.areas[area];
    const share = read(s.revenueSharePct);
    const stepped =
      isScored(score) && share !== undefined
        ? (Math.max(0, score.level - stepDownFor(share)) as Level)
        : isScored(score)
          ? score.level
          : undefined;
    return { platform: s.platform, score, sharePct: share, steppedLevel: stepped };
  });

  const withLevels = perPlatform.filter(
    (x): x is typeof x & { steppedLevel: Level } => x.steppedLevel !== undefined,
  );

  if (withLevels.length === 0) {
    const firstUnscored = perPlatform.find((x) => !isScored(x.score));
    const reason = firstUnscored && !isScored(firstUnscored.score) ? firstUnscored.score.reason : 'no inputs';
    const question =
      firstUnscored && !isScored(firstUnscored.score)
        ? firstUnscored.score.gap.question
        : `${AREA_NAME[area]} cannot be scored on any platform`;
    return {
      area,
      level: unscored(reason, question),
      perPlatform,
      sentence: `${AREA_NAME[area]}: unscored — ${reason}.`,
    };
  }

  const top = withLevels.reduce((a, b) =>
    b.steppedLevel > a.steppedLevel || (b.steppedLevel === a.steppedLevel && (b.sharePct ?? 0) > (a.sharePct ?? 0))
      ? b
      : a,
  );
  const raw = isScored(top.score) ? top.score.level : top.steppedLevel;

  let sentence: string;
  if (raw !== top.steppedLevel && top.sharePct !== undefined) {
    sentence =
      `${LEVEL_NAME[raw]} on ${top.platform}, scored ${LEVEL_NAME[top.steppedLevel]} at business level ` +
      `because ${top.platform} is ${pct(top.sharePct, 1)} of revenue.`;
  } else {
    sentence = `${LEVEL_NAME[top.steppedLevel]}, driven by ${top.platform}${
      top.sharePct !== undefined ? ` (${pct(top.sharePct, 1)} of revenue)` : ''
    }.`;
  }
  const detail = isScored(top.score) ? top.score.reason : '';

  return {
    area,
    level: scored(top.steppedLevel, detail === '' ? sentence : `${detail}. ${sentence}`),
    perPlatform,
    sentence,
    drivingPlatform: top.platform,
  };
}

export function rollUpAll(scores: readonly PlatformScores[]): Record<AreaId, BusinessArea> {
  const ids: AreaId[] = ['conversion', 'traffic', 'basket', 'campaign', 'operations', 'profitability'];
  const out = {} as Record<AreaId, BusinessArea>;
  for (const id of ids) out[id] = rollUpArea(id, scores);
  return out;
}

export function summariseCancellation(p: PlatformData): string | undefined {
  const c = read(p.cancelledOrders);
  const o = read(p.orders);
  if (c === undefined || o === undefined || o === 0) return undefined;
  const r = (c / o) * 100;
  return `${p.platform} cancelled ${num(c)} of ${num(o)} orders — ${pct(r)}`;
}
