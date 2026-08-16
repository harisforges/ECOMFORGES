/**
 * Did the number move?
 *
 * Every brief closes by naming one metric and a date: "by the next session, conversion rate on
 * Lazada should have moved". Until now nothing ever checked. The advisory sells a monthly
 * retainer on the claim that the sprint changes a figure, and the tool re-derived that figure
 * from scratch each cycle with no memory of what it said last time.
 *
 * This compares one analysis against a snapshot of an earlier one for the same client and
 * reports what actually changed. It lives in `src/engine/` because it produces numbers, and
 * numbers in this codebase are computed deterministically and carry their arithmetic.
 *
 * Two rules it will not bend:
 *
 *   1. **Only against an earlier period for the same client.** A snapshot from a different
 *      client code, or one whose period is not strictly before this one, is refused rather
 *      than compared — a delta between two unrelated engagements is worse than no delta.
 *
 *   2. **A missing figure is `undefined`, never zero.** If last period had no AOV, this period
 *      cannot report that AOV "changed by 0". The same reason `ASK` carries no value.
 */

import type { Analysis } from './pipeline.js';
import { TRACK } from './scoring.js';
import { calc, isAsk, type Tagged, type TaggedCalc } from '../types/tagged.js';

/** The subset of a run worth keeping to compare against later. Stored, so keep it small. */
export interface PeriodSnapshot {
  readonly clientCode: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly category: string;
  /** The track that was active, so we can say whether the work was aimed here. */
  readonly track: string | null;
  readonly trackPlatform: string | null;
  /** The metric the last brief said would move. */
  readonly trackMetric: string | null;
  readonly platforms: readonly PlatformSnapshot[];
}

export interface PlatformSnapshot {
  readonly platform: string;
  readonly gmv: number | null;
  readonly sessions: number | null;
  readonly cvrPct: number | null;
  readonly aov: number | null;
  readonly leakageRm: number | null;
}

export type Direction = 'up' | 'down' | 'flat';

export interface MetricMovement {
  readonly platform: string;
  readonly metric: string;
  readonly label: string;
  readonly before: number;
  readonly after: number;
  /*
   * Both are CALC rather than Tagged: a movement only exists when both periods supplied the
   * figure, so these can never be ASK, and typing them as Tagged would force every caller to
   * handle an absence that cannot occur.
   */
  /** after − before, carrying the arithmetic. */
  readonly change: TaggedCalc<number>;
  /** Percentage change against `before`, absent when `before` is zero. */
  readonly changePct?: TaggedCalc<number>;
  readonly direction: Direction;
  /** True when this is the metric the previous brief said would move. */
  readonly isTargetMetric: boolean;
}

export interface Movement {
  readonly since: PeriodSnapshot;
  readonly daysBetween: number;
  readonly movements: readonly MetricMovement[];
  /**
   * The verdict on the previous cycle's promise. `unknown` when the metric it named cannot be
   * read this period — which is a real outcome and must not be dressed as "no change".
   */
  readonly promise: {
    readonly metric: string | null;
    readonly platform: string | null;
    readonly outcome: 'moved' | 'did-not-move' | 'unknown';
    readonly detail: string;
  };
}

/** Below this, a change is noise rather than movement. Percentage points of relative change. */
const FLAT_BAND_PCT = 2;

const val = (t: Tagged<number> | undefined): number | null =>
  t === undefined || isAsk(t) ? null : t.value;

/** Everything worth remembering about a run, for comparison against the next one. */
export function snapshot(a: Analysis): PeriodSnapshot {
  return {
    clientCode: a.engagement.clientCode,
    periodStart: a.engagement.periodStart.toISOString().slice(0, 10),
    periodEnd: a.engagement.periodEnd.toISOString().slice(0, 10),
    category: a.engagement.category,
    track: a.track.activeTrack ? TRACK[a.track.activeTrack].name : null,
    trackPlatform: a.track.platform ?? null,
    trackMetric: a.track.activeTrack ? TRACK[a.track.activeTrack].metric : null,
    platforms: a.platforms.map((p) => ({
      platform: p.data.platform,
      gmv: val(p.data.gmv),
      sessions: val(p.data.sessions),
      cvrPct: val(p.cvr.cvr),
      aov: val(p.data.aov),
      leakageRm: val(p.leakage.value),
    })),
  };
}

export class SnapshotMismatchError extends Error {}

/**
 * Compare this analysis against an earlier snapshot.
 *
 * Throws rather than returning an empty result when the snapshot is not comparable: a silent
 * "nothing moved" from a mismatched pair would read exactly like a genuine flat cycle, and the
 * consultant would carry it into a client meeting.
 */
export function movementSince(a: Analysis, prior: PeriodSnapshot): Movement {
  if (prior.clientCode !== a.engagement.clientCode) {
    throw new SnapshotMismatchError(
      `the saved period is for ${prior.clientCode}, this one is for ${a.engagement.clientCode}`,
    );
  }
  const thisStart = a.engagement.periodStart.toISOString().slice(0, 10);
  if (!(prior.periodEnd < thisStart)) {
    throw new SnapshotMismatchError(
      `the saved period (${prior.periodStart} to ${prior.periodEnd}) is not earlier than this one ` +
        `(starting ${thisStart}); movement needs two periods that do not overlap`,
    );
  }

  const daysBetween = Math.round(
    (a.engagement.periodStart.getTime() - new Date(prior.periodEnd).getTime()) / 86_400_000,
  );

  const metrics: readonly [keyof PlatformSnapshot, string, string][] = [
    ['cvrPct', 'CVR', 'conversion rate'],
    ['gmv', 'GMV', 'revenue'],
    ['sessions', 'Sessions', 'visitors'],
    ['aov', 'AOV', 'average order value'],
    ['leakageRm', 'Leakage', 'cancelled and refunded'],
  ];

  const movements: MetricMovement[] = [];
  for (const p of a.platforms) {
    const was = prior.platforms.find((x) => x.platform === p.data.platform);
    if (was === undefined) continue; // a channel added since last period has nothing to compare
    const now: PlatformSnapshot = {
      platform: p.data.platform,
      gmv: val(p.data.gmv),
      sessions: val(p.data.sessions),
      cvrPct: val(p.cvr.cvr),
      aov: val(p.data.aov),
      leakageRm: val(p.leakage.value),
    };
    for (const [key, metric, label] of metrics) {
      const before = was[key];
      const after = now[key];
      // Absent on either side means we do not know whether it moved. Not zero, not flat.
      if (typeof before !== 'number' || typeof after !== 'number') continue;
      const change = calc(after - before, `${fmtish(after)} − ${fmtish(before)}`);
      const relative = before === 0 ? undefined : ((after - before) / Math.abs(before)) * 100;
      movements.push({
        platform: p.data.platform,
        metric,
        label,
        before,
        after,
        change,
        ...(relative === undefined
          ? {}
          : {
              changePct: calc(
                relative,
                `(${fmtish(after)} − ${fmtish(before)}) ÷ ${fmtish(Math.abs(before))} × 100`,
              ),
            }),
        direction:
          relative === undefined
            ? after === before
              ? 'flat'
              : after > before
                ? 'up'
                : 'down'
            : Math.abs(relative) < FLAT_BAND_PCT
              ? 'flat'
              : relative > 0
                ? 'up'
                : 'down',
        isTargetMetric:
          prior.trackMetric !== null &&
          prior.trackPlatform === p.data.platform &&
          sameMetric(prior.trackMetric, metric),
      });
    }
  }

  return {
    since: prior,
    daysBetween,
    movements,
    promise: verdict(prior, movements),
  };
}

/**
 * The previous brief's metric names are display names ("CVR", "GMV / repeat rate"). A track can
 * name more than one metric, so a match on any part counts.
 */
function sameMetric(trackMetric: string, metric: string): boolean {
  return trackMetric
    .split('/')
    .map((s) => s.trim().toLowerCase())
    .some((s) => s === metric.toLowerCase() || s.startsWith(metric.toLowerCase()));
}

function verdict(prior: PeriodSnapshot, movements: readonly MetricMovement[]): Movement['promise'] {
  const base = { metric: prior.trackMetric, platform: prior.trackPlatform };
  if (prior.trackMetric === null || prior.trackPlatform === null) {
    return {
      ...base,
      outcome: 'unknown',
      detail: 'No track was active last period, so nothing was promised to move.',
    };
  }
  const target = movements.find((m) => m.isTargetMetric);
  if (target === undefined) {
    return {
      ...base,
      outcome: 'unknown',
      detail:
        `${prior.trackMetric} on ${prior.trackPlatform} cannot be read for both periods, so ` +
        `whether it moved is unknown. It is not the same as unchanged.`,
    };
  }
  /*
   * Leakage is the one metric where down is the win. Everything else here is a growth figure.
   * Getting this backwards would congratulate a client for losing revenue.
   */
  const goodDirection: Direction = target.metric === 'Leakage' ? 'down' : 'up';
  if (target.direction === 'flat') {
    return {
      ...base,
      outcome: 'did-not-move',
      detail: `${cap(target.label)} on ${target.platform} is flat against last period.`,
    };
  }
  const moved = target.direction === goodDirection;
  return {
    ...base,
    outcome: moved ? 'moved' : 'did-not-move',
    // Capitalised because this is used as a standalone sentence — it opens the deck's first
    // section, where a lowercase "conversion rate..." reads as a fragment someone forgot.
    detail:
      `${cap(target.label)} on ${target.platform} went ${target.direction} from ` +
      `${fmtish(target.before)} to ${fmtish(target.after)}.`,
  };
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Compact enough for a workings string without pulling in the renderer's formatters. */
function fmtish(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
