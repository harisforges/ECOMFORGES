/**
 * Growth Pressure Score and track selection.
 *
 * Four track-bearing areas. score = level × revenue impact. Highest wins; a tie goes to
 * the higher impact weight. All zero means no track activates, which is a real outcome
 * and not an error.
 *
 * The platform the track runs on is the one carrying the pressure that won — the platform
 * whose stepped-down level set the business level — not simply the worst performer. A
 * channel at 8% of revenue can be the worst and still be the wrong place to spend the
 * client's only 30 days.
 */

import type { PlatformName } from '../types/datasheet.js';
import { pct } from '../types/tagged.js';
import type { Thresholds } from '../benchmarks/parse.js';
import {
  AREA_NAME,
  AREA_TO_TRACK,
  isScored,
  LEVEL_NAME,
  TRACK,
  TRACK_AREAS,
  type AreaId,
  type BusinessArea,
  type Level,
  type TrackId,
} from './scoring.js';

export interface GpsRow {
  readonly area: AreaId;
  readonly areaName: string;
  readonly level: Level | undefined;
  readonly levelName: string;
  readonly impact: number;
  readonly score: number | undefined;
  /** "2 × 1.00 = 2.00", ready to render. */
  readonly workings: string;
  readonly unscoredReason?: string;
}

export interface TrackSelection {
  readonly rows: readonly GpsRow[];
  readonly activeTrack?: TrackId;
  readonly activeArea?: AreaId;
  readonly platform?: PlatformName;
  readonly topScore: number;
  readonly runnerUp?: { track: TrackId; area: AreaId; score: number; platform?: PlatformName };
  /** Set when every score is zero. */
  readonly noPressure: boolean;
  readonly whatToWatch?: string;
  readonly note: string;
}

function impactFor(area: AreaId, th: Thresholds): number {
  switch (area) {
    case 'conversion':
      return th.impact.conversion;
    case 'traffic':
      return th.impact.traffic;
    case 'campaign':
      return th.impact.campaign;
    case 'basket':
      return th.impact.basket;
    default:
      return 0;
  }
}

/**
 * The platform whose stepped level equals the business level, tie-broken by revenue
 * share. That platform is what the business level is made of, so it is where the track
 * runs.
 */
function drivingPlatform(b: BusinessArea): PlatformName | undefined {
  if (!isScored(b.level)) return undefined;
  const target = b.level.level;
  const matching = b.perPlatform.filter((x) => x.steppedLevel === target);
  if (matching.length === 0) return b.drivingPlatform;
  const best = matching.reduce((a, x) => ((x.sharePct ?? 0) > (a.sharePct ?? 0) ? x : a));
  return best.platform;
}

export function selectTrack(
  business: Record<AreaId, BusinessArea>,
  th: Thresholds,
): TrackSelection {
  const rows: GpsRow[] = TRACK_AREAS.map((area) => {
    const b = business[area]!;
    const impact = impactFor(area, th);
    if (!isScored(b.level)) {
      return {
        area,
        areaName: AREA_NAME[area],
        level: undefined,
        levelName: 'Unscored',
        impact,
        score: undefined,
        workings: `unscored × ${impact.toFixed(2)} = —`,
        unscoredReason: b.level.reason,
      };
    }
    const level = b.level.level;
    const score = level * impact;
    return {
      area,
      areaName: AREA_NAME[area],
      level,
      levelName: LEVEL_NAME[level],
      impact,
      score,
      workings: `${level} × ${impact.toFixed(2)} = ${score.toFixed(2)}`,
    };
  });

  const scoredRows = rows.filter((r): r is GpsRow & { score: number } => r.score !== undefined);

  if (scoredRows.length === 0) {
    return {
      rows,
      topScore: 0,
      noPressure: true,
      whatToWatch:
        'No track-bearing area could be scored. Nothing activates. The missing inputs in the Gaps ' +
        'section are the whole of this cycle’s work.',
      note: 'No area scoreable.',
    };
  }

  const ranked = [...scoredRows].sort((a, b) => b.score - a.score || b.impact - a.impact);
  const top = ranked[0]!;

  if (top.score === 0) {
    return {
      rows,
      topScore: 0,
      noPressure: true,
      whatToWatch:
        'Every track-bearing area is Stable. No track activates this cycle. Hold the current structure ' +
        'and watch the two areas closest to moving: Conversion against the benchmark, and campaign ' +
        'dependency on the strongest platform. Re-score after the next cycle.',
      note: 'All four areas Stable — no pressure to act on.',
    };
  }

  const activeArea = top.area as keyof typeof AREA_TO_TRACK;
  const activeTrack = AREA_TO_TRACK[activeArea];
  const platform = drivingPlatform(business[top.area]!);

  const next = ranked.find((r) => r.area !== top.area && r.score > 0);
  const runnerUp = next
    ? {
        track: AREA_TO_TRACK[next.area as keyof typeof AREA_TO_TRACK],
        area: next.area,
        score: next.score,
        ...(drivingPlatform(business[next.area]!) !== undefined
          ? { platform: drivingPlatform(business[next.area]!)! }
          : {}),
      }
    : undefined;

  const tieBroken = ranked.length > 1 && ranked[1]!.score === top.score;
  const note = tieBroken
    ? `${TRACK[activeTrack].name} and ${TRACK[AREA_TO_TRACK[ranked[1]!.area as keyof typeof AREA_TO_TRACK]].name} tied at ${top.score.toFixed(2)}; the higher revenue impact weight decided it.`
    : `${TRACK[activeTrack].name} selected at ${top.score.toFixed(2)}.`;

  return {
    rows,
    activeTrack,
    activeArea: top.area,
    ...(platform !== undefined ? { platform } : {}),
    topScore: top.score,
    ...(runnerUp !== undefined ? { runnerUp } : {}),
    noPressure: false,
    note,
  };
}

/** Human sentence explaining why the track landed on this platform and not the worst one. */
export function platformRationale(business: Record<AreaId, BusinessArea>, area: AreaId): string {
  const b = business[area]!;
  const parts = b.perPlatform
    .filter((x) => isScored(x.score))
    .map((x) => {
      const raw = isScored(x.score) ? LEVEL_NAME[x.score.level] : '—';
      const share = x.sharePct === undefined ? 'share unknown' : pct(x.sharePct, 1);
      const stepped = x.steppedLevel === undefined ? '—' : LEVEL_NAME[x.steppedLevel];
      return `${x.platform} ${raw} at ${share} of revenue → ${stepped}`;
    });
  return parts.join(' · ');
}
