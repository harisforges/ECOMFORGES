/**
 * The deterministic pipeline. Everything a brief asserts is computed here.
 *
 * No LLM call in this file or anywhere else under src/engine/.
 */

import type { Engagement, PlatformData, PlatformName } from '../types/datasheet.js';
import { periodDays } from '../types/datasheet.js';
import { isAsk, type Tagged, type TaggedAsk } from '../types/tagged.js';
import type { ParsedBenchmarks, Thresholds } from '../benchmarks/parse.js';
import {
  blendedLeakage,
  cancellationRate,
  leakage,
  normaliseCvr,
  revenuePerBuyer,
  revenuePerVisitor,
  revenueShare,
  totalGmv,
  type Leakage,
  type NormalisedCvr,
} from './normalise.js';
import { runSanityChecks, type SanityReport } from './sanity.js';
import { rollUpAll, scorePlatform, isScored, type AreaId, type BusinessArea, type PlatformScores } from './scoring.js';
import { checkBlockers, type BlockerResult } from './blockers.js';
import { selectTrack, platformRationale, type TrackSelection } from './track.js';
import {
  bestAovAcross,
  sizeBasket,
  sizeConversion,
  sizeTraffic,
  type Sizing,
} from './sizing.js';

export interface PlatformView {
  readonly data: PlatformData;
  readonly cvr: NormalisedCvr;
  readonly revenuePerVisitor: Tagged<number>;
  readonly revenuePerBuyer: Tagged<number>;
  readonly cancellationRate: Tagged<number>;
  readonly leakage: Leakage;
  readonly revenueSharePct: Tagged<number>;
  readonly scores: PlatformScores;
}

export interface Analysis {
  readonly engagement: Engagement;
  readonly periodDays: number;
  readonly thresholds: Thresholds;
  readonly platforms: readonly PlatformView[];
  readonly blendedGmv: Tagged<number>;
  readonly blendedLeakage: Leakage;
  readonly sanity: SanityReport;
  readonly business: Record<AreaId, BusinessArea>;
  readonly blockers: BlockerResult;
  readonly track: TrackSelection;
  readonly sizing?: Sizing;
  readonly runnerUpSizing?: Sizing;
  /** Ordered for the Gaps section: blocker gaps lead. */
  readonly gaps: readonly TaggedAsk[];
  readonly benchmarkCandidates: readonly BenchmarkCandidate[];
  /** The platform the active track runs on, resolved to its data. */
  readonly targetPlatform?: PlatformView;
  readonly platformRationale?: string;
}

export interface BenchmarkCandidate {
  readonly platform: string;
  readonly category: string;
  readonly metric: string;
  readonly value: string;
  readonly observed: string;
  readonly clientCode: string;
}

function view(p: PlatformData, all: readonly PlatformData[], scores: PlatformScores): PlatformView {
  return {
    data: p,
    cvr: normaliseCvr(p),
    revenuePerVisitor: revenuePerVisitor(p),
    revenuePerBuyer: revenuePerBuyer(p),
    cancellationRate: cancellationRate(p),
    leakage: leakage(p),
    revenueSharePct: revenueShare(p, all),
    scores,
  };
}

/** Deduplicate by question text — the same missing field surfaces from several scorers. */
function dedupeAsks(asks: readonly TaggedAsk[]): TaggedAsk[] {
  const seen = new Set<string>();
  const out: TaggedAsk[] = [];
  for (const a of asks) {
    if (seen.has(a.question)) continue;
    seen.add(a.question);
    out.push(a);
  }
  return out;
}

function fmtValue(t: Tagged<number>, kind: 'pct' | 'rm' | 'ratio'): string | undefined {
  if (isAsk(t)) return undefined;
  const v = t.value;
  if (kind === 'pct') return `${v.toFixed(2)}%`;
  if (kind === 'rm') return `RM${v.toFixed(2)}`;
  return v.toFixed(2);
}

function candidates(e: Engagement, views: readonly PlatformView[]): BenchmarkCandidate[] {
  const observed = e.periodEnd.toISOString().slice(0, 7);
  const out: BenchmarkCandidate[] = [];
  for (const v of views) {
    const push = (metric: string, value: string | undefined): void => {
      if (value === undefined) return;
      out.push({
        platform: v.data.platform,
        category: e.category,
        metric,
        value,
        observed,
        clientCode: e.clientCode,
      });
    };
    push('buyer CVR', fmtValue(v.cvr.cvr, 'pct'));
    if (v.data.aov !== undefined) push('AOV', fmtValue(v.data.aov, 'rm'));
    if (v.data.organicSharePct !== undefined) push('organic share', fmtValue(v.data.organicSharePct, 'pct'));
    if (v.data.promoRevenuePct !== undefined) push('promo dependency', fmtValue(v.data.promoRevenuePct, 'pct'));
    if (v.data.grossMarginPct !== undefined) push('gross margin', fmtValue(v.data.grossMarginPct, 'pct'));
    if (v.data.roas !== undefined) push('ROAS', fmtValue(v.data.roas, 'ratio'));
    push('revenue per visitor', fmtValue(v.revenuePerVisitor, 'rm'));
    push('cancellation rate', fmtValue(v.cancellationRate, 'pct'));
    push('leakage', fmtValue(v.leakage.sharePct, 'pct'));
  }
  return out;
}

export function analyse(
  engagement: Engagement,
  benchmarks: ParsedBenchmarks,
): Analysis {
  const th = benchmarks.thresholds;
  const all = engagement.platforms;

  const platformScores = all.map((p) =>
    scorePlatform(p, all, engagement.category, benchmarks, th, engagement.suppliedBenchmarkCvr),
  );
  const views = all.map((p, i) => view(p, all, platformScores[i]!));

  const business = rollUpAll(platformScores);
  const sanity = runSanityChecks(engagement);
  const blockers = checkBlockers(business, all);
  const track = selectTrack(business, th);

  const targetPlatform =
    track.platform !== undefined ? views.find((v) => v.data.platform === track.platform) : undefined;

  let sizing: Sizing | undefined;
  if (!blockers.blocked || blockers.blocked === 'unknown') {
    sizing = sizeFor(track.activeArea, targetPlatform, views);
  }

  const runnerUpPlatform =
    track.runnerUp?.platform !== undefined
      ? views.find((v) => v.data.platform === track.runnerUp!.platform)
      : undefined;
  const runnerUpSizing = sizeFor(track.runnerUp?.area, runnerUpPlatform, views);

  // Gap ordering: anything blocker-related leads, because it can invalidate the
  // recommendation rather than merely weaken it.
  const areaGaps: TaggedAsk[] = [];
  for (const id of Object.keys(business) as AreaId[]) {
    const b = business[id]!;
    if (!isScored(b.level)) areaGaps.push(b.level.gap);
  }
  const cvrGaps = views.map((v) => v.cvr.cvr).filter(isAsk);
  const gaps = dedupeAsks([...blockers.gaps, ...areaGaps, ...cvrGaps]);

  return {
    engagement,
    periodDays: periodDays(engagement),
    thresholds: th,
    platforms: views,
    blendedGmv: totalGmv(all),
    blendedLeakage: blendedLeakage(all),
    sanity,
    business,
    blockers,
    track,
    ...(sizing !== undefined ? { sizing } : {}),
    ...(runnerUpSizing !== undefined ? { runnerUpSizing } : {}),
    gaps,
    benchmarkCandidates: candidates(engagement, views),
    ...(targetPlatform !== undefined ? { targetPlatform } : {}),
    ...(track.activeArea !== undefined
      ? { platformRationale: platformRationale(business, track.activeArea) }
      : {}),
  };
}

function sizeFor(
  area: AreaId | undefined,
  target: PlatformView | undefined,
  views: readonly PlatformView[],
): Sizing | undefined {
  if (area === undefined || target === undefined) return undefined;
  const all = views.map((v) => v.data);
  switch (area) {
    case 'conversion':
      return sizeConversion(target.data, target.scores.benchmark);
    case 'basket':
      return sizeBasket(target.data, bestAovAcross(all));
    case 'traffic':
      return sizeTraffic(target.data);
    case 'campaign':
      // Sales Forge's constraint is GMV structure. The measurable 30-day proxy is the
      // conversion of the promo-dependent channel's baseline days, so it is sized the
      // same way rather than invented.
      return sizeConversion(target.data, target.scores.benchmark);
    default:
      return undefined;
  }
}

export type { PlatformName };
