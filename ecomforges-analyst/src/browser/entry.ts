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
import { validateProse } from '../llm/validate.js';
import type { Engagement } from '../types/datasheet.js';
import type { Prose } from '../render/brief.js';

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

export interface CheckedProse {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly prose?: Prose;
}

/**
 * Check what the Claude Project wrote before it can reach a client deck.
 *
 * On the API path this check is automatic and a failure triggers a retry. Here a human is
 * carrying the text across, which is the same trust boundary with a longer wire — so the
 * paste gets the identical validator. Anything it rejects is reported by figure and the deck
 * is not built. A confident wrong number in a document a client acts on is the one failure
 * this whole codebase is arranged to prevent, and it does not stop mattering because the
 * transport was a clipboard.
 */
export function checkProse(raw: string, payloadJson: string): CheckedProse {
  let parsed: unknown;
  try {
    // The Project is asked for bare JSON, but a fenced block is the common slip.
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    return { ok: false, problems: ['That is not valid JSON. Copy the whole object the Project replied with, including both braces.'] };
  }
  const p = parsed as Partial<Prose>;
  if (typeof p.finding !== 'string' || p.sprint === undefined) {
    return { ok: false, problems: ['The JSON parsed but has no "finding" and "sprint" — that is not the Project’s reply.'] };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { ok: false, problems: ['Generate the brief again first — the payload this is checked against is missing.'] };
  }
  const problems = validateProse(p as Prose, payload);
  return problems.length === 0
    ? { ok: true, problems: [], prose: p as Prose }
    : { ok: false, problems: problems.map((x) => x.detail) };
}

declare global {
  // eslint-disable-next-line no-var
  var Forge: { run: typeof run; checkProse: typeof checkProse };
}

globalThis.Forge = { run, checkProse };
