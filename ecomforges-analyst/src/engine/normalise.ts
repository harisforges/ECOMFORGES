/**
 * Cross-platform normalisation. Pure. No LLM.
 *
 * The platforms do not define conversion rate the same way and their headline figures
 * are not comparable. Shopee computes its Order Conversion Rate on product-card clicks;
 * Lazada computes buyers over visitors. Comparing the two dashboard numbers directly
 * gives a wrong answer, and the wrong answer here changes which track activates.
 */

import type { PlatformData } from '../types/datasheet.js';
import { ask, calc, isAsk, map, num, pct, type Tagged } from '../types/tagged.js';

const missing = (platform: string, field: string): Tagged<number> =>
  ask(`${platform}: ${field} not supplied`);

function need(p: PlatformData, key: keyof PlatformData, label: string): Tagged<number> {
  const v = p[key] as Tagged<number> | undefined;
  return v ?? missing(p.platform, label);
}

export interface NormalisedCvr {
  /** buyers ÷ sessions, as a percentage. The only figure used for comparison. */
  readonly cvr: Tagged<number>;
  /** True when buyers was absent and orders was substituted. */
  readonly fromOrders: boolean;
  /** The platform's own dashboard figure, kept so nobody is surprised mid-session. */
  readonly headline?: Tagged<number>;
  readonly headlineBasis?: string;
}

/**
 * Recompute conversion as buyers ÷ sessions for every platform, and use only that.
 *
 * Falling back to orders ÷ sessions is allowed but noted in the workings, because a
 * repeat buyer placing three orders inflates the orders figure and the two are not
 * interchangeable.
 */
export function normaliseCvr(p: PlatformData): NormalisedCvr {
  const sessions = need(p, 'sessions', 'sessions');
  const buyers = p.buyers;
  const orders = p.orders;

  const base: Pick<NormalisedCvr, 'headline' | 'headlineBasis'> = {
    ...(p.headlineCvr !== undefined ? { headline: p.headlineCvr } : {}),
    ...(p.headlineCvrBasis !== undefined ? { headlineBasis: p.headlineCvrBasis } : {}),
  };

  if (buyers !== undefined) {
    return {
      ...base,
      fromOrders: false,
      cvr: map(
        [buyers, sessions] as const,
        ['buyers', 'sessions'],
        (b, s) => (s === 0 ? 0 : (b / s) * 100),
        (b, s) => `${num(b)} ÷ ${num(s)}`,
      ),
    };
  }

  if (orders !== undefined) {
    return {
      ...base,
      fromOrders: true,
      cvr: map(
        [orders, sessions] as const,
        ['orders', 'sessions'],
        (o, s) => (s === 0 ? 0 : (o / s) * 100),
        (o, s) =>
          `${num(o)} ÷ ${num(s)} — orders substituted for buyers, which are not interchangeable: a repeat buyer inflates this figure`,
      ),
    };
  }

  return {
    ...base,
    fromOrders: false,
    cvr: ask(`${p.platform}: neither buyers nor orders supplied — conversion not computable`),
  };
}

export function revenuePerVisitor(p: PlatformData): Tagged<number> {
  return map(
    [need(p, 'gmv', 'GMV'), need(p, 'sessions', 'sessions')] as const,
    ['GMV', 'sessions'],
    (g, s) => (s === 0 ? 0 : g / s),
    (g, s) => `${num(g)} ÷ ${num(s)}`,
  );
}

export function revenuePerBuyer(p: PlatformData): Tagged<number> {
  return map(
    [need(p, 'gmv', 'GMV'), need(p, 'buyers', 'buyers')] as const,
    ['GMV', 'buyers'],
    (g, b) => (b === 0 ? 0 : g / b),
    (g, b) => `${num(g)} ÷ ${num(b)}`,
  );
}

export function cancellationRate(p: PlatformData): Tagged<number> {
  return map(
    [need(p, 'cancelledOrders', 'cancelled orders'), need(p, 'orders', 'orders')] as const,
    ['cancelled orders', 'orders'],
    (c, o) => (o === 0 ? 0 : (c / o) * 100),
    (c, o) => `${num(c)} ÷ ${num(o)}`,
  );
}

export interface Leakage {
  /** Cancelled value plus refunded value, in RM. */
  readonly value: Tagged<number>;
  /** The same as a percentage of GMV. */
  readonly sharePct: Tagged<number>;
}

/**
 * Cancellations and refunds do not appear in a revenue report, so a business can lose a
 * material share of its month without anything on the dashboard turning red.
 */
export function leakage(p: PlatformData): Leakage {
  const cancelled = need(p, 'cancelledValue', 'cancelled value');
  const refunded = need(p, 'refundedValue', 'refunded value');
  const value = map(
    [cancelled, refunded] as const,
    ['cancelled value', 'refunded value'],
    (c, r) => c + r,
    (c, r) => `${num(c)} + ${num(r)}`,
  );
  const sharePct = map(
    [value, need(p, 'gmv', 'GMV')] as const,
    ['leakage value', 'GMV'],
    (l, g) => (g === 0 ? 0 : (l / g) * 100),
    (l, g) => `${num(l)} ÷ ${num(g)}`,
  );
  return { value, sharePct };
}

export function blendedLeakage(platforms: readonly PlatformData[]): Leakage {
  const parts = platforms.map(leakage);
  const gmvs = platforms.map((p) => need(p, 'gmv', 'GMV'));

  const unknownValue = parts.find((x) => isAsk(x.value));
  const unknownGmv = gmvs.find(isAsk);
  if (unknownValue !== undefined || unknownGmv !== undefined) {
    return {
      value: ask('blended leakage not computable — one or more platforms missing cancelled/refunded value or GMV'),
      sharePct: ask('blended leakage share not computable — see per-platform gaps'),
    };
  }

  const totalLeak = parts.reduce((s, x) => s + (x.value as { value: number }).value, 0);
  const totalGmv = gmvs.reduce((s, g) => s + (g as { value: number }).value, 0);
  return {
    value: calc(totalLeak, `${platforms.map((p) => p.platform).join(' + ')}`),
    sharePct: calc(
      totalGmv === 0 ? 0 : (totalLeak / totalGmv) * 100,
      `${num(totalLeak)} ÷ ${num(totalGmv)} blended GMV`,
    ),
  };
}

export function totalGmv(platforms: readonly PlatformData[]): Tagged<number> {
  const gmvs = platforms.map((p) => need(p, 'gmv', 'GMV'));
  if (gmvs.some(isAsk)) return ask('blended GMV not computable — one or more platforms missing GMV');
  const total = gmvs.reduce((s, g) => s + (g as { value: number }).value, 0);
  return calc(total, platforms.map((p) => p.platform).join(' + '));
}

/** A platform's share of blended revenue. Drives the business-level roll-up. */
export function revenueShare(p: PlatformData, all: readonly PlatformData[]): Tagged<number> {
  return map(
    [need(p, 'gmv', 'GMV'), totalGmv(all)] as const,
    [`${p.platform} GMV`, 'blended GMV'],
    (g, t) => (t === 0 ? 0 : (g / t) * 100),
    (g, t) => `${num(g)} ÷ ${num(t)}`,
  );
}

/** Trend from a percentage change. A couple of points either way is flat, not a trend. */
export function trendFromPct(t: Tagged<number> | undefined): Tagged<'up' | 'flat' | 'down'> | undefined {
  if (t === undefined) return undefined;
  if (isAsk(t)) return t;
  const v = t.value;
  const dir = v > 2 ? 'up' : v < -2 ? 'down' : 'flat';
  return calc(dir, `${pct(v, 1)} session change`);
}
