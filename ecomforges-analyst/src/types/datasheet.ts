/**
 * The Standard Data Sheet — the normalised intake shape.
 *
 * Every numeric field is Tagged and optional. Missing is the normal case, not the error
 * case: platform exports omit different things, and a field nobody measured must survive
 * to the brief as a gap rather than be defaulted into a claim.
 */

import type { Tagged } from './tagged.js';

export type PlatformName = 'Shopee' | 'Lazada' | 'TikTok' | 'Own site';

export const PLATFORM_NAMES: readonly PlatformName[] = ['Shopee', 'Lazada', 'TikTok', 'Own site'];

export type Trend = 'up' | 'flat' | 'down';
export type Fulfilment = 'clean' | 'minor-delays' | 'sla-breaches' | 'out-of-stock';

export interface TopSku {
  readonly name: string;
  readonly units: number;
  readonly revenue: number;
}

export interface PlatformData {
  readonly platform: PlatformName;

  // Traffic and conversion
  readonly sessions?: Tagged<number>;
  readonly buyers?: Tagged<number>;
  readonly orders?: Tagged<number>;
  /** The platform's own headline conversion rate, as it appears on their dashboard. */
  readonly headlineCvr?: Tagged<number>;
  /** How that platform defines the figure above, e.g. "product-card clicks". */
  readonly headlineCvrBasis?: string;

  // Revenue
  readonly aov?: Tagged<number>;
  readonly aovTrend?: Tagged<Trend>;
  readonly gmv?: Tagged<number>;
  readonly organicSharePct?: Tagged<number>;
  readonly sessionTrendPct?: Tagged<number>;
  readonly promoRevenuePct?: Tagged<number>;

  // Money
  readonly adSpend?: Tagged<number>;
  readonly roas?: Tagged<number>;
  readonly grossMarginPct?: Tagged<number>;

  // Operations
  readonly fulfilment?: Tagged<Fulfilment>;
  readonly cancelledOrders?: Tagged<number>;
  readonly cancelledValue?: Tagged<number>;
  readonly refundedOrders?: Tagged<number>;
  readonly refundedValue?: Tagged<number>;

  // Funnel
  readonly addToCartUsers?: Tagged<number>;
  readonly wishlistUsers?: Tagged<number>;

  readonly topSkus?: readonly TopSku[];
}

export interface Engagement {
  /** A code, never a brand name. See CLIENT_CODE_PATTERN. */
  readonly clientCode: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly category: string;
  readonly platforms: readonly PlatformData[];
  /**
   * Raya dates move every year, so they cannot be hardcoded the way the numeric
   * campaign days can. Supply them when they fall inside the period.
   */
  readonly rayaDates?: readonly Date[];
  /** A conversion benchmark typed in for this run, bypassing the benchmark file. */
  readonly suppliedBenchmarkCvr?: number;
}

/**
 * Uppercase, hyphenated, no spaces — MY-BTY-09.
 *
 * The pattern exists to stop a brand name being used as a client code. Briefs and
 * benchmark rows outlive the engagement and end up in places nobody planned, so nothing
 * that identifies a client should be in them.
 */
export const CLIENT_CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)+$/;

/** Numeric campaign days: 9.9, 10.10, 11.11, 12.12. */
const CAMPAIGN_DAYS: readonly { month: number; day: number; label: string }[] = [
  { month: 9, day: 9, label: '9.9' },
  { month: 10, day: 10, label: '10.10' },
  { month: 11, day: 11, label: '11.11' },
  { month: 12, day: 12, label: '12.12' },
];

export type ProblemKind = 'short-period' | 'campaign-inflated' | 'bad-client-code' | 'no-platforms';

export interface Problem {
  readonly kind: ProblemKind;
  /** Rendered directly into the brief's Sanity Checks section. */
  readonly message: string;
}

const DAY_MS = 86_400_000;

export function periodDays(e: Pick<Engagement, 'periodStart' | 'periodEnd'>): number {
  return Math.round((e.periodEnd.getTime() - e.periodStart.getTime()) / DAY_MS) + 1;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function datesInPeriod(e: Engagement): Date[] {
  const out: Date[] = [];
  for (let t = e.periodStart.getTime(); t <= e.periodEnd.getTime(); t += DAY_MS) {
    out.push(new Date(t));
  }
  return out;
}

/**
 * Returns problems rather than throwing. A short or campaign-inflated period is not a
 * reason to refuse the engagement — it is a caveat that must appear in the brief.
 */
export function validate(e: Engagement): Problem[] {
  const problems: Problem[] = [];

  if (!CLIENT_CODE_PATTERN.test(e.clientCode)) {
    problems.push({
      kind: 'bad-client-code',
      message:
        `Client code "${e.clientCode}" is not code-shaped. Use an uppercase hyphenated ` +
        `code such as MY-BTY-09 — never a brand name, because briefs and benchmark rows ` +
        `outlive the engagement.`,
    });
  }

  if (e.platforms.length === 0) {
    problems.push({ kind: 'no-platforms', message: 'No platform data supplied.' });
  }

  const days = periodDays(e);
  if (days < 14) {
    problems.push({
      kind: 'short-period',
      message: `Period is ${days} days. Under 14 days is not a readable baseline — the figures below describe a fortnight, not a run rate.`,
    });
  }

  const hits: string[] = [];
  const all = datesInPeriod(e);
  for (const c of CAMPAIGN_DAYS) {
    if (all.some((d) => d.getUTCMonth() + 1 === c.month && d.getUTCDate() === c.day)) {
      hits.push(c.label);
    }
  }
  for (const raya of e.rayaDates ?? []) {
    if (all.some((d) => sameDay(d, raya))) {
      hits.push(`Raya (${raya.toISOString().slice(0, 10)})`);
    }
  }
  if (hits.length > 0) {
    problems.push({
      kind: 'campaign-inflated',
      message: `Period contains ${hits.join(', ')}. Campaign-inflated — this is not a baseline, and treating the totals as a run rate will overstate the business.`,
    });
  }

  return problems;
}
