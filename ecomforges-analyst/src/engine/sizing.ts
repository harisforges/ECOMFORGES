/**
 * Sizing the prize in ringgit.
 *
 * A track is not chosen because a score is highest in the abstract. Show the money, and
 * show it twice: the 30-day target, set deliberately below the full gap, and the full gap
 * labelled as the size of the hole.
 *
 * Both come back in one object because they must be rendered together. Quoting parity
 * with the best channel as a 30-day target is how a brief loses credibility in month two,
 * and the surest way to stop that is to make the target unavailable without the caveat
 * attached to it.
 */

import type { PlatformData } from '../types/datasheet.js';
import { calc, isAsk, num, pct, rm, rmRound, type Tagged, ask } from '../types/tagged.js';
import { normaliseCvr, revenuePerBuyer, revenuePerVisitor } from './normalise.js';
import type { ResolvedBenchmark } from './benchmark-resolution.js';

export interface SizedFigure {
  readonly uplift: Tagged<number>;
  /** The metric value this uplift assumes. */
  readonly targetMetric: Tagged<number>;
  readonly label: string;
}

export interface Sizing {
  /** Deliberately below the full gap. This is the directive's target. */
  readonly target: SizedFigure;
  /**
   * Parity with the benchmark. Labelled as the size of the hole, never as the target —
   * a cycle-three ambition.
   */
  readonly fullGap: SizedFigure;
  readonly targetMultiplier: number;
  readonly metricName: string;
  /** Rendered under the table. */
  readonly caveat: string;
}

const DEFAULT_MULTIPLIER = 1.25;

function read(t: Tagged<number>): number | undefined {
  return isAsk(t) ? undefined : t.value;
}

function unavailable(metricName: string, why: string): Sizing {
  const a = ask(`sizing not computable — ${why}`);
  return {
    target: { uplift: a, targetMetric: a, label: '30-day target' },
    fullGap: { uplift: a, targetMetric: a, label: 'the size of the hole' },
    targetMultiplier: DEFAULT_MULTIPLIER,
    metricName,
    caveat: `Cannot size this track: ${why}.`,
  };
}

/** Conversion track. Uplift = extra buyers × revenue per buyer. */
export function sizeConversion(
  p: PlatformData,
  benchmark: ResolvedBenchmark,
  targetMultiplier = DEFAULT_MULTIPLIER,
): Sizing {
  const { cvr } = normaliseCvr(p);
  const rpb = revenuePerBuyer(p);
  const now = read(cvr);
  const bench = read(benchmark.cvr);
  const perBuyer = read(rpb);
  const sessions = p.sessions !== undefined ? read(p.sessions) : undefined;
  const buyers = p.buyers !== undefined ? read(p.buyers) : undefined;

  if (now === undefined || perBuyer === undefined || sessions === undefined || buyers === undefined) {
    return unavailable('CVR', 'sessions, buyers, GMV, or conversion rate missing');
  }

  const targetCvr = now * targetMultiplier;
  const targetBuyers = sessions * (targetCvr / 100);
  const targetUplift = (targetBuyers - buyers) * perBuyer;

  const parityCvr = bench;
  const parityBuyers = parityCvr === undefined ? undefined : sessions * (parityCvr / 100);
  const parityUplift = parityBuyers === undefined ? undefined : (parityBuyers - buyers) * perBuyer;

  return {
    metricName: 'buyer conversion rate',
    targetMultiplier,
    target: {
      label: '30-day target',
      targetMetric: calc(targetCvr, `${pct(now)} × ${targetMultiplier.toFixed(2)}`),
      uplift: calc(
        targetUplift,
        `${num(sessions)} sessions × ${pct(targetCvr)} = ${targetBuyers.toFixed(0)} buyers, up ` +
          `${(targetBuyers - buyers).toFixed(0)} × ${rm(perBuyer)} revenue per buyer`,
      ),
    },
    fullGap: {
      label: 'the size of the hole',
      targetMetric:
        parityCvr === undefined
          ? ask('parity target not computable — no benchmark')
          : calc(parityCvr, 'parity with the benchmark'),
      uplift:
        parityUplift === undefined || parityBuyers === undefined
          ? ask('full gap not computable — no benchmark to reach parity with')
          : calc(
              parityUplift,
              `${num(sessions)} × ${pct(parityCvr!)} = ${parityBuyers.toFixed(0)} buyers, up ` +
                `${(parityBuyers - buyers).toFixed(0)} × ${rm(perBuyer)}`,
            ),
    },
    caveat:
      `The ${((targetMultiplier - 1) * 100).toFixed(0)}% target is deliberately conservative. ` +
      `Parity with the benchmark is the size of the hole, not a 30-day instruction — that is a ` +
      `cycle-three ambition.`,
  };
}

/** Basket track. Uplift = (best AOV − this AOV) × orders. */
export function sizeBasket(
  p: PlatformData,
  bestAov: Tagged<number>,
  targetMultiplier = DEFAULT_MULTIPLIER,
): Sizing {
  const aov = p.aov !== undefined ? read(p.aov) : undefined;
  const orders = p.orders !== undefined ? read(p.orders) : undefined;
  const best = read(bestAov);
  if (aov === undefined || orders === undefined) {
    return unavailable('AOV', 'AOV or orders missing');
  }

  // The target is a fraction of the way to the best channel's AOV, not a flat multiplier,
  // so it cannot overshoot parity when the gap is small.
  const parityAov = best !== undefined && best > aov ? best : undefined;
  const stretch = parityAov === undefined ? aov * targetMultiplier : aov + (parityAov - aov) * 0.5;
  const targetAov = parityAov === undefined ? stretch : Math.min(stretch, parityAov);

  return {
    metricName: 'AOV',
    targetMultiplier,
    target: {
      label: '30-day target',
      targetMetric: calc(
        targetAov,
        parityAov === undefined
          ? `${rmRound(aov)} × ${targetMultiplier.toFixed(2)}`
          : `halfway from ${rmRound(aov)} to ${rmRound(parityAov)}`,
      ),
      uplift: calc(
        (targetAov - aov) * orders,
        `(${rmRound(targetAov)} − ${rmRound(aov)}) × ${num(orders)} orders`,
      ),
    },
    fullGap: {
      label: 'the size of the hole',
      targetMetric:
        parityAov === undefined
          ? ask('no stronger channel AOV to reach parity with')
          : calc(parityAov, 'the strongest channel’s AOV'),
      uplift:
        parityAov === undefined
          ? ask('full gap not computable — no stronger channel AOV on file')
          : calc(
              (parityAov - aov) * orders,
              `(${rmRound(parityAov)} − ${rmRound(aov)}) × ${num(orders)} orders`,
            ),
    },
    caveat: 'AOV parity with the strongest channel is the ceiling, not the 30-day instruction.',
  };
}

/** Traffic track. Uplift = extra sessions × revenue per visitor. */
export function sizeTraffic(p: PlatformData, targetMultiplier = DEFAULT_MULTIPLIER): Sizing {
  const rpv = revenuePerVisitor(p);
  const sessions = p.sessions !== undefined ? read(p.sessions) : undefined;
  const perVisitor = read(rpv);
  if (sessions === undefined || perVisitor === undefined) {
    return unavailable('sessions', 'sessions or GMV missing');
  }
  const targetSessions = sessions * targetMultiplier;
  // Full gap for traffic has no external ceiling, so it is set at double the target's
  // stretch rather than invented from a benchmark that does not exist.
  const stretchSessions = sessions * (1 + (targetMultiplier - 1) * 2);
  return {
    metricName: 'sessions',
    targetMultiplier,
    target: {
      label: '30-day target',
      targetMetric: calc(targetSessions, `${num(sessions)} × ${targetMultiplier.toFixed(2)}`),
      uplift: calc(
        (targetSessions - sessions) * perVisitor,
        `${num(targetSessions - sessions)} extra sessions × ${rm(perVisitor)} revenue per visitor`,
      ),
    },
    fullGap: {
      label: 'the size of the hole',
      targetMetric: calc(stretchSessions, `${num(sessions)} × ${(1 + (targetMultiplier - 1) * 2).toFixed(2)}`),
      uplift: calc(
        (stretchSessions - sessions) * perVisitor,
        `${num(stretchSessions - sessions)} extra sessions × ${rm(perVisitor)}`,
      ),
    },
    caveat:
      'Traffic has no benchmark ceiling, so the wider figure is a stretch on the same rate rather ' +
      'than parity with anything. Treat it as directional.',
  };
}

/** Highest AOV across the engagement, for basket sizing. */
export function bestAovAcross(platforms: readonly PlatformData[]): Tagged<number> {
  const values = platforms
    .map((p) => (p.aov !== undefined ? read(p.aov) : undefined))
    .filter((v): v is number => v !== undefined);
  if (values.length === 0) return ask('no AOV supplied on any platform');
  return calc(Math.max(...values), 'highest AOV across the engagement');
}

/** Sanity invariant: the target must always be strictly below the full gap. */
export function targetIsBelowGap(s: Sizing): boolean {
  const t = read(s.target.uplift);
  const g = read(s.fullGap.uplift);
  if (t === undefined || g === undefined) return true;
  return t < g;
}
