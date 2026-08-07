/**
 * The payload the prose call receives.
 *
 * Split out from prose.ts deliberately: this module has no SDK dependency, so the browser
 * bundle can build the same payload the server sends without pulling in the Anthropic
 * client. Both paths therefore hand the model an identical shape.
 */

import type { Analysis } from '../engine/pipeline.js';
import { isAsk, type Tagged } from '../types/tagged.js';
import { AREA_NAME, isScored, LEVEL_NAME, TRACK, type AreaId } from '../engine/scoring.js';

const val = (t: Tagged<number> | undefined): number | null => {
  if (t === undefined || isAsk(t)) return null;
  return t.value;
};

export interface Payload {
  readonly clientCode: string;
  readonly period: { start: string; end: string; days: number; campaignInflated: boolean };
  readonly category: string;
  readonly blendedGmv: number | null;
  readonly platforms: readonly Record<string, unknown>[];
  readonly benchmark: {
    cvr: number | null;
    origin?: string;
    internal: boolean;
    sourcePlatform?: string;
    note: string;
  };
  readonly pressure: readonly Record<string, unknown>[];
  readonly blocker: { blocked: string; title: string; message: string };
  readonly gps: readonly Record<string, unknown>[];
  readonly track: {
    name: string | null;
    platform: string | null;
    constraint: string | null;
    metric: string | null;
  };
  readonly sizing: Record<string, unknown> | null;
  readonly runnerUp: Record<string, unknown> | null;
  readonly gaps: readonly string[];
}

export function buildPayload(a: Analysis): Payload {
  const target = a.targetPlatform;
  const areaIds: AreaId[] = ['traffic', 'conversion', 'basket', 'campaign', 'operations', 'profitability'];

  return {
    clientCode: a.engagement.clientCode,
    period: {
      start: a.engagement.periodStart.toISOString().slice(0, 10),
      end: a.engagement.periodEnd.toISOString().slice(0, 10),
      days: a.periodDays,
      campaignInflated: a.sanity.campaignInflated,
    },
    category: a.engagement.category,
    blendedGmv: val(a.blendedGmv),
    platforms: a.platforms.map((p) => ({
      platform: p.data.platform,
      gmv: val(p.data.gmv),
      revenueSharePct: val(p.revenueSharePct),
      sessions: val(p.data.sessions),
      buyers: val(p.data.buyers),
      orders: val(p.data.orders),
      normalisedCvrPct: val(p.cvr.cvr),
      platformHeadlineCvrPct: val(p.cvr.headline),
      aov: val(p.data.aov),
      revenuePerVisitor: val(p.revenuePerVisitor),
      revenuePerBuyer: val(p.revenuePerBuyer),
      organicSharePct: val(p.data.organicSharePct),
      promoRevenuePct: val(p.data.promoRevenuePct),
      adSpend: val(p.data.adSpend),
      roas: val(p.data.roas),
      grossMarginPct: val(p.data.grossMarginPct),
      cancellationRatePct: val(p.cancellationRate),
      leakageRm: val(p.leakage.value),
      leakagePct: val(p.leakage.sharePct),
      addToCartUsers: val(p.data.addToCartUsers),
      // Buyers subtracted from add-to-cart users: people who chose the product and
      // stopped. This is the list the Run directive should target.
      addToCartMinusBuyers:
        val(p.data.addToCartUsers) !== null && val(p.data.buyers) !== null
          ? val(p.data.addToCartUsers)! - val(p.data.buyers)!
          : null,
      wishlistUsers: val(p.data.wishlistUsers),
      topSkus: p.data.topSkus ?? [],
      cvrRatioAgainstBenchmark: p.scores.cvrRatio ?? null,
    })),
    benchmark: {
      cvr: val(target?.scores.benchmark.cvr),
      ...(target?.scores.benchmark.origin !== undefined ? { origin: target.scores.benchmark.origin } : {}),
      internal: target?.scores.benchmark.internalBenchmark ?? false,
      ...(target?.scores.benchmark.sourcePlatform !== undefined
        ? { sourcePlatform: target.scores.benchmark.sourcePlatform }
        : {}),
      note: target?.scores.benchmark.note ?? 'no benchmark resolved',
    },
    pressure: areaIds.map((id) => {
      const b = a.business[id]!;
      return {
        area: AREA_NAME[id],
        businessLevel: isScored(b.level) ? LEVEL_NAME[b.level.level] : 'Unscored',
        reason: b.level.reason,
        perPlatform: b.perPlatform.map((x) => ({
          platform: x.platform,
          level: isScored(x.score) ? LEVEL_NAME[x.score.level] : 'Unscored',
          steppedLevel: x.steppedLevel === undefined ? null : LEVEL_NAME[x.steppedLevel],
          revenueSharePct: x.sharePct ?? null,
        })),
      };
    }),
    blocker: {
      blocked: String(a.blockers.blocked),
      title: a.blockers.title,
      message: a.blockers.message,
    },
    gps: a.track.rows.map((r) => ({
      area: r.areaName,
      level: r.levelName,
      impact: r.impact,
      score: r.score ?? null,
    })),
    track: {
      name: a.track.activeTrack ? TRACK[a.track.activeTrack].name : null,
      platform: a.track.platform ?? null,
      constraint: a.track.activeTrack ? TRACK[a.track.activeTrack].constraint : null,
      metric: a.track.activeTrack ? TRACK[a.track.activeTrack].metric : null,
    },
    sizing:
      a.sizing === undefined
        ? null
        : {
            metric: a.sizing.metricName,
            targetMultiplier: a.sizing.targetMultiplier,
            targetMetricValue: val(a.sizing.target.targetMetric),
            targetUpliftRmPerMonth: val(a.sizing.target.uplift),
            parityMetricValue: val(a.sizing.fullGap.targetMetric),
            fullGapUpliftRmPerMonth: val(a.sizing.fullGap.uplift),
          },
    runnerUp:
      a.track.runnerUp === undefined
        ? null
        : {
            track: TRACK[a.track.runnerUp.track].name,
            platform: a.track.runnerUp.platform ?? null,
            score: a.track.runnerUp.score,
            targetUpliftRmPerMonth: a.runnerUpSizing ? val(a.runnerUpSizing.target.uplift) : null,
          },
    gaps: a.gaps.map((g) => g.question),
  };
}

