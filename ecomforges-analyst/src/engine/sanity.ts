/**
 * Sanity checks. Every result carries text usable directly in the brief — a boolean
 * alone is no use to a consultant sitting in front of a client.
 */

import { validate, type Engagement, type PlatformData } from '../types/datasheet.js';
import { isAsk, num, pct, rm, type Tagged } from '../types/tagged.js';
import { normaliseCvr } from './normalise.js';

export type CheckStatus = 'pass' | 'discrepancy' | 'not-checkable';

export interface CheckResult {
  readonly id: string;
  readonly platform?: string;
  readonly status: CheckStatus;
  readonly message: string;
  /** Set when the discrepancy must be resolved before the brief can be trusted. */
  readonly blocksAnalysis?: boolean;
}

/** Relative gap between two figures, guarding division by zero. */
function relGap(a: number, b: number): number {
  const d = Math.max(Math.abs(a), Math.abs(b));
  return d === 0 ? 0 : Math.abs(a - b) / d;
}

function read(t: Tagged<number> | undefined): number | undefined {
  if (t === undefined || isAsk(t)) return undefined;
  return t.value;
}

function checkOrdersVsCvr(p: PlatformData): CheckResult {
  const id = 'orders-vs-cvr';
  const sessions = read(p.sessions);
  const orders = read(p.orders);
  const { cvr } = normaliseCvr(p);
  const normalised = read(cvr);

  if (sessions === undefined || orders === undefined || normalised === undefined) {
    return {
      id,
      platform: p.platform,
      status: 'not-checkable',
      message: `${p.platform}: sessions, orders, or normalised conversion not available.`,
    };
  }

  const orderRate = (orders / sessions) * 100;
  const gap = relGap(orderRate, normalised);
  // Repeat buyers make orders ÷ sessions run above buyers ÷ sessions. A small gap is
  // expected and healthy; a large one means the figures describe different things.
  if (gap > 0.1) {
    return {
      id,
      platform: p.platform,
      status: 'discrepancy',
      message:
        `${p.platform}: orders ÷ sessions is ${pct(orderRate)} against a normalised buyer conversion of ${pct(normalised)} — ` +
        `a ${pct(gap * 100, 1)} relative gap. Repeat buyers explain a few points, not this. ` +
        `Confirm which figure covers which period before proceeding.`,
      blocksAnalysis: true,
    };
  }
  return {
    id,
    platform: p.platform,
    status: 'pass',
    message: `${p.platform}: orders ÷ sessions ${pct(orderRate)} reconciles with buyer conversion ${pct(normalised)}.`,
  };
}

function checkOrdersTimesAov(p: PlatformData): CheckResult {
  const id = 'orders-x-aov-vs-gmv';
  const orders = read(p.orders);
  const aov = read(p.aov);
  const gmv = read(p.gmv);
  if (orders === undefined || aov === undefined || gmv === undefined) {
    return {
      id,
      platform: p.platform,
      status: 'not-checkable',
      message: `${p.platform}: orders, AOV, or GMV not available.`,
    };
  }
  const implied = orders * aov;
  const gap = relGap(implied, gmv);
  if (gap > 0.02) {
    return {
      id,
      platform: p.platform,
      status: 'discrepancy',
      message:
        `${p.platform}: ${num(orders)} orders × ${rm(aov)} = ${rm(implied)} against ${rm(gmv)} stated GMV — ` +
        `${pct(gap * 100, 1)} apart. Usually different periods or different platforms in the same export.`,
      blocksAnalysis: true,
    };
  }
  return {
    id,
    platform: p.platform,
    status: 'pass',
    message: `${p.platform}: ${num(orders)} × ${rm(aov)} = ${rm(implied)} against ${rm(gmv)} stated. Consistent.`,
  };
}

function checkHeadlineReconciles(p: PlatformData): CheckResult {
  const id = 'headline-cvr-reconciles';
  const headline = read(p.headlineCvr);
  const sessions = read(p.sessions);
  const buyers = read(p.buyers);
  const orders = read(p.orders);
  if (headline === undefined || sessions === undefined) {
    return {
      id,
      platform: p.platform,
      status: 'not-checkable',
      message: `${p.platform}: no headline conversion rate supplied to reconcile.`,
    };
  }
  const candidates: { label: string; value: number }[] = [];
  if (buyers !== undefined) candidates.push({ label: 'buyers ÷ sessions', value: (buyers / sessions) * 100 });
  if (orders !== undefined) candidates.push({ label: 'orders ÷ sessions', value: (orders / sessions) * 100 });

  const match = candidates.find((c) => relGap(c.value, headline) <= 0.02);
  if (match) {
    return {
      id,
      platform: p.platform,
      status: 'pass',
      message: `${p.platform}: headline ${pct(headline)} matches ${match.label}.`,
    };
  }
  const basis = p.headlineCvrBasis ? ` The platform states it is computed on ${p.headlineCvrBasis}.` : '';
  return {
    id,
    platform: p.platform,
    status: 'discrepancy',
    message:
      `${p.platform}: headline conversion of ${pct(headline)} reconciles to neither ` +
      `${candidates.map((c) => `${c.label} (${pct(c.value)})`).join(' nor ')}.${basis} ` +
      `Not smoothed over — the brief uses the recomputed figure and states both.`,
  };
}

export interface SanityReport {
  readonly checks: readonly CheckResult[];
  /** Period problems from the data sheet validator. */
  readonly periodProblems: readonly { kind: string; message: string }[];
  readonly campaignInflated: boolean;
  readonly readableBaseline: boolean;
  readonly anyBlocking: boolean;
}

export function runSanityChecks(e: Engagement): SanityReport {
  const checks: CheckResult[] = [];
  for (const p of e.platforms) {
    checks.push(checkOrdersVsCvr(p), checkOrdersTimesAov(p), checkHeadlineReconciles(p));
  }
  const periodProblems = validate(e);
  return {
    checks,
    periodProblems,
    campaignInflated: periodProblems.some((x) => x.kind === 'campaign-inflated'),
    readableBaseline: !periodProblems.some((x) => x.kind === 'short-period'),
    anyBlocking: checks.some((c) => c.blocksAnalysis === true),
  };
}
