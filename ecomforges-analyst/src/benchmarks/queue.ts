/**
 * The benchmark candidate queue.
 *
 * A brief ends with figures observed in one client's account. Those are candidates, not
 * benchmarks. They land in a review queue, a human approves them, and only then does a
 * figure reach the benchmark file — because the alternative is a self-reinforcing loop
 * where the tool's own output becomes its own evidence.
 *
 * Two rules are enforced rather than trusted:
 *
 *  - **n >= 3 before a figure is usable.** One client is not a category. The queue tracks
 *    how many distinct client codes have contributed the same platform/category/metric and
 *    refuses to promote below the threshold.
 *  - **A candidate cannot be used in the brief that produced it.** Approving mid-engagement
 *    and re-running would score a client against itself and always return Stable.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { BenchmarkCandidate } from '../engine/pipeline.js';
import { DEFAULT_THRESHOLDS } from './parse.js';

export interface QueuedCandidate {
  readonly platform: string;
  readonly category: string;
  readonly metric: string;
  readonly value: string;
  readonly numeric: number | null;
  readonly observed: string;
  readonly clientCode: string;
  /** The engagement that produced it — used to refuse same-brief reuse. */
  readonly engagementId: string;
  readonly queuedAt: string;
}

export interface QueueGroup {
  readonly platform: string;
  readonly category: string;
  readonly metric: string;
  readonly candidates: readonly QueuedCandidate[];
  /** Distinct client codes. This, not the row count, is n. */
  readonly n: number;
  readonly median: number | null;
  readonly usable: boolean;
  readonly reason: string;
}

const numericOf = (value: string): number | null => {
  const m = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
};

const keyOf = (c: { platform: string; category: string; metric: string }): string =>
  [c.platform, c.category, c.metric].map((s) => s.trim().toLowerCase()).join(' | ');

/**
 * A candidate's metric label and the benchmark file's table metric are different
 * vocabularies: the queue records "buyer CVR", the file's conversion table means "CVR".
 * Writing the candidate's own label under that heading produces a row the parser reads as
 * metric "CVR" — so a later lookup for "buyer CVR" never finds it, silently, forever.
 *
 * Canonicalising here, and returning the heading alongside, makes the pair impossible to
 * mismatch by hand.
 */
const METRIC_TABLES: readonly { match: RegExp; canonical: string; heading: string }[] = [
  { match: /^(buyer )?cvr$|conversion/i, canonical: 'CVR', heading: '## Conversion rate (CVR)' },
  { match: /^aov$|average order value/i, canonical: 'AOV', heading: '## Average order value (AOV)' },
  { match: /organic/i, canonical: 'organic share', heading: '## Organic share of traffic' },
  {
    match: /promo/i,
    canonical: 'promo dependency',
    heading: '## Promo dependency (% of revenue from campaign days)',
  },
  { match: /margin/i, canonical: 'gross margin', heading: '## Gross margin' },
  { match: /^roas$/i, canonical: 'ROAS', heading: '## ROAS' },
];

export interface MetricTarget {
  readonly canonical: string;
  /** Null when the metric has no standard table — the row needs a home choosing. */
  readonly heading: string | null;
}

export function metricTarget(metric: string): MetricTarget {
  const hit = METRIC_TABLES.find((t) => t.match.test(metric.trim()));
  return hit
    ? { canonical: hit.canonical, heading: hit.heading }
    : { canonical: metric.trim(), heading: null };
}

export function enqueue(
  path: string,
  candidates: readonly BenchmarkCandidate[],
  engagementId: string,
): number {
  const now = new Date().toISOString();
  const existing = load(path);
  // Re-running the same engagement must not inflate n. Dedupe on the full identity.
  const seen = new Set(
    existing.map((c) => `${keyOf(c)} | ${c.clientCode} | ${c.engagementId} | ${c.value}`),
  );

  const lines: string[] = [];
  for (const c of candidates) {
    const q: QueuedCandidate = {
      platform: c.platform,
      category: c.category,
      metric: c.metric,
      value: c.value,
      numeric: numericOf(c.value),
      observed: c.observed,
      clientCode: c.clientCode,
      engagementId,
      queuedAt: now,
    };
    const id = `${keyOf(q)} | ${q.clientCode} | ${q.engagementId} | ${q.value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    lines.push(JSON.stringify(q));
  }
  if (lines.length > 0) appendFileSync(path, lines.join('\n') + '\n');
  return lines.length;
}

export function load(path: string): QueuedCandidate[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as QueuedCandidate);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Group the queue by platform/category/metric.
 *
 * n counts distinct client codes, not rows. Twelve months of one seller is still one
 * client, and a row count would make it look like twelve.
 */
export function group(
  candidates: readonly QueuedCandidate[],
  minN = DEFAULT_THRESHOLDS.minNForBenchmark,
): QueueGroup[] {
  const byKey = new Map<string, QueuedCandidate[]>();
  for (const c of candidates) {
    const k = keyOf(c);
    byKey.set(k, [...(byKey.get(k) ?? []), c]);
  }

  const out: QueueGroup[] = [];
  for (const list of byKey.values()) {
    const first = list[0]!;
    const clients = new Set(list.map((c) => c.clientCode));
    const n = clients.size;

    // One figure per client — the most recent — so a client with six months of history
    // does not drag the median toward itself.
    const perClient = [...clients].map((code) => {
      const theirs = list
        .filter((c) => c.clientCode === code && c.numeric !== null)
        .sort((a, b) => a.observed.localeCompare(b.observed));
      return theirs[theirs.length - 1]?.numeric ?? null;
    });
    const usableValues = perClient.filter((v): v is number => v !== null);

    const enough = n >= minN;
    out.push({
      platform: first.platform,
      category: first.category,
      metric: first.metric,
      candidates: list,
      n,
      median: median(usableValues),
      usable: enough && usableValues.length > 0,
      reason: !enough
        ? `n=${n}, below the ${minN} required — one client is not a category`
        : usableValues.length === 0
          ? 'no numeric values recorded'
          : `n=${n} distinct clients`,
    });
  }
  return out.sort((a, b) => b.n - a.n || a.metric.localeCompare(b.metric));
}

export class SameEngagementError extends Error {
  constructor(readonly engagementId: string) {
    super(
      `refusing to approve a candidate produced by engagement ${engagementId}: a figure cannot ` +
        `become a benchmark for the brief that produced it. It would score the client against ` +
        `itself and always come back Stable.`,
    );
    this.name = 'SameEngagementError';
  }
}

export class InsufficientNError extends Error {
  constructor(readonly n: number, readonly required: number) {
    super(
      `refusing to approve at n=${n}: ${required} distinct clients are required before a figure ` +
        `is a benchmark. One client is not a category.`,
    );
    this.name = 'InsufficientNError';
  }
}

export interface ApprovalOptions {
  /** The engagement currently being analysed, if any. Guards same-brief reuse. */
  readonly currentEngagementId?: string;
  readonly minN?: number;
}

export interface ApprovedRow {
  readonly platform: string;
  readonly category: string;
  /** The candidate's own label, kept for reporting. */
  readonly metric: string;
  /** The benchmark file's name for the same metric — what the row is written as. */
  readonly canonicalMetric: string;
  /** The table this row belongs under. Null when the metric has no standard table. */
  readonly heading: string | null;
  readonly median: number;
  readonly n: number;
  readonly periodType: string;
  readonly lastObserved: string;
  readonly clientCodes: readonly string[];
  /** Ready to paste into the benchmark file. */
  readonly markdown: string;
}

export function approve(g: QueueGroup, opts: ApprovalOptions = {}): ApprovedRow {
  const minN = opts.minN ?? DEFAULT_THRESHOLDS.minNForBenchmark;

  if (opts.currentEngagementId !== undefined) {
    const fromThis = g.candidates.find((c) => c.engagementId === opts.currentEngagementId);
    if (fromThis) throw new SameEngagementError(opts.currentEngagementId);
  }
  if (g.n < minN) throw new InsufficientNError(g.n, minN);
  if (g.median === null) throw new Error('cannot approve a group with no numeric values');

  const codes = [...new Set(g.candidates.map((c) => c.clientCode))].sort();
  const lastObserved = [...g.candidates.map((c) => c.observed)].sort().reverse()[0] ?? 'undated';
  const unit = g.candidates[0]!.value.trim().startsWith('RM') ? 'RM' : /%$/.test(g.candidates[0]!.value) ? '%' : '';
  const rendered = unit === 'RM' ? `RM${g.median.toFixed(2)}` : unit === '%' ? `${g.median.toFixed(2)}%` : g.median.toFixed(2);

  const target = metricTarget(g.metric);

  return {
    platform: g.platform,
    category: g.category,
    metric: g.metric,
    canonicalMetric: target.canonical,
    heading: target.heading,
    median: g.median,
    n: g.n,
    periodType: '30d',
    lastObserved,
    clientCodes: codes,
    markdown: `| ${g.platform} | ${g.category} | ${rendered} | ${g.n} | 30d | ${lastObserved} | ${codes.join('/')} |`,
  };
}

/**
 * Append an approved row under the matching heading in the benchmark file.
 *
 * The placeholder row for that table is removed, so a file with one real row no longer
 * carries `_(empty)_` alongside it.
 */
export function writeToBenchmarkFile(path: string, row: ApprovedRow, heading?: string): void {
  const target = heading ?? row.heading;
  if (target === null || target === undefined) {
    throw new Error(
      `"${row.metric}" has no standard table in the benchmark file. Pass an explicit heading, ` +
        `or add a table for it first.`,
    );
  }
  if (!existsSync(path)) throw new Error(`benchmark file not found: ${path}`);
  const src = readFileSync(path, 'utf8');
  const lines = src.split(/\r?\n/);

  const start = lines.findIndex((l) => l.trim().toLowerCase() === target.trim().toLowerCase());
  if (start < 0) throw new Error(`heading not found in benchmark file: ${target}`);

  let insertAt = -1;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^#{2,}\s/.test(l)) break;
    if (/^\|/.test(l)) insertAt = i;
  }
  if (insertAt < 0) throw new Error(`no table found under ${target}`);

  const out = [...lines];
  out.splice(insertAt + 1, 0, row.markdown);
  const cleaned = out.filter((l, i) => !(i > start && i <= insertAt + 1 && /_\(empty\)_/.test(l)));
  writeFileSync(path, cleaned.join('\n'));
}

export function renderQueue(groups: readonly QueueGroup[]): string {
  if (groups.length === 0) {
    return 'The candidate queue is empty. Run a brief to populate it.';
  }
  const lines: string[] = [
    '## BENCHMARK CANDIDATE QUEUE',
    '',
    '| Platform | Category | Metric | n | Median | Status |',
    '|---|---|---|---|---|---|',
  ];
  for (const g of groups) {
    lines.push(
      `| ${g.platform} | ${g.category} | ${g.metric} | ${g.n} | ` +
        `${g.median === null ? '—' : g.median.toFixed(2)} | ${g.usable ? '**ready**' : g.reason} |`,
    );
  }
  const ready = groups.filter((g) => g.usable);
  lines.push(
    '',
    ready.length === 0
      ? 'Nothing is ready to promote. Every group is below the required number of distinct clients.'
      : `${ready.length} group(s) ready. Approving is a human decision — nothing is promoted automatically.`,
  );
  return lines.join('\n');
}
