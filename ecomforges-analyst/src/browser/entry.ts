/**
 * Browser entry point.
 *
 * The engine is pure, so it runs in a page with no server and no API key. This exposes it
 * on `window.Forge` and the page's script calls it.
 *
 * The two prose sections are the only part that needs a model, and a browser cannot hold an
 * API key safely — anyone can View Source. So instead of calling anything, this hands back
 * the computed payload for pasting into the Claude Project, which already has the
 * methodology and the benchmark file. The figures are computed here; the Project only
 * writes about them, which is the same split the server version enforces.
 */

import { loadEngagement } from '../types/load.js';
import { DEFAULT_THRESHOLDS, parseBenchmarks } from '../benchmarks/parse.js';
import { analyse } from '../engine/pipeline.js';
import { renderBrief } from '../render/brief.js';
import { TRACK } from '../engine/scoring.js';
import { buildPayload } from '../llm/payload.js';
import type { Engagement } from '../types/datasheet.js';

export interface RunInput {
  readonly engagement: unknown;
  /** Contents of a benchmark markdown file, if the user pasted one. */
  readonly benchmarksMarkdown?: string;
}

export interface RunOutput {
  readonly brief: string;
  /** Paste this into the Claude Project to get sections 6 and 8. */
  readonly payload: string;
  readonly gaps: readonly string[];
  /** The track's display name, e.g. "Conversion Forge™" — not its internal id. */
  readonly track: string | null;
  readonly platform: string | null;
  readonly blocked: string;
  /** The blocker's title, for the panel when one fires. */
  readonly blockerTitle: string;
  /** The winning Growth Pressure Score, or null when nothing scored. */
  readonly topScore: number | null;
  readonly candidates: readonly string[];
  readonly benchmarkRowsRead: number;
}

function engagementFrom(input: unknown): Engagement {
  return loadEngagement(JSON.stringify(input));
}

export function run(input: RunInput): RunOutput {
  const engagement = engagementFrom(input.engagement);
  const asOf = engagement.periodStart.toISOString().slice(0, 7);
  const benchmarks =
    input.benchmarksMarkdown !== undefined && input.benchmarksMarkdown.trim() !== ''
      ? parseBenchmarks(input.benchmarksMarkdown, { asOf })
      : { rows: [], rejected: [], thresholds: DEFAULT_THRESHOLDS };

  const analysis = analyse(engagement, benchmarks);

  return {
    brief: renderBrief(analysis, undefined, {
      // The CLI's phrasing names a flag that does not exist in a browser.
      proseHint: 'press Copy for Claude below, then paste what the Project writes back here',
    }),
    payload: JSON.stringify(buildPayload(analysis), null, 2),
    gaps: analysis.gaps.map((g) => g.question),
    track: analysis.track.activeTrack ? TRACK[analysis.track.activeTrack].name : null,
    platform: analysis.track.platform ?? null,
    blocked: String(analysis.blockers.blocked),
    blockerTitle: analysis.blockers.title,
    topScore: analysis.track.noPressure ? null : analysis.track.topScore,
    candidates: analysis.benchmarkCandidates.map(
      (c) =>
        `${c.platform} / ${c.category} / ${c.metric} / ${c.value} / observed ${c.observed} / ${c.clientCode} / n=1`,
    ),
    benchmarkRowsRead: benchmarks.rows.length,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var Forge: { run: typeof run };
}

globalThis.Forge = { run };
