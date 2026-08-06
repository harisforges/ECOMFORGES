/**
 * Benchmark file parser.
 *
 * The discard rules below are the entire point of this module. The shipped template
 * contains a struck-through example row (Shopee / skincare / 2.4% CVR) that exists to
 * show the format and would be a fabricated benchmark if it were ever returned. Two
 * other categories of row must also never reach a brief: figures at n < 3, because one
 * client is not a category, and figures older than 18 months, because a 2024 conversion
 * rate is not a 2026 one.
 *
 * The internal decision thresholds live in a separate return field. They are EcomForges'
 * own scoring rules, not market figures, and must not be reachable by benchmark lookup.
 */

export interface BenchmarkRow {
  readonly rowId: string;
  readonly platform: string;
  readonly category: string;
  readonly metric: string;
  readonly rawValue: string;
  readonly value: number | undefined;
  readonly n: number | undefined;
  readonly periodType: string;
  readonly lastObserved: string;
  readonly clientCodes: readonly string[];
  readonly usable: boolean;
  /** Why a row is not usable. Surfaced in the brief so the gap is actionable. */
  readonly unusableReason?: string;
}

export interface Thresholds {
  readonly cvrRatio: { stable: number; medium: number; high: number };
  readonly organicThinBelowPct: number;
  readonly promoDependency: { stable: number; medium: number; high: number };
  readonly grossMargin: { stable: number; medium: number; high: number };
  readonly roasStepUpBelow: number;
  readonly impact: { conversion: number; traffic: number; campaign: number; basket: number };
  readonly minReadablePeriodDays: number;
  readonly minNForBenchmark: number;
  readonly staleAfterMonths: number;
}

/** The model's defaults. Overridden by the file's thresholds table when present. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  cvrRatio: { stable: 1.0, medium: 0.85, high: 0.65 },
  organicThinBelowPct: 30,
  promoDependency: { stable: 40, medium: 60, high: 75 },
  grossMargin: { stable: 35, medium: 25, high: 20 },
  roasStepUpBelow: 2.0,
  impact: { conversion: 1.0, traffic: 0.85, campaign: 0.8, basket: 0.7 },
  minReadablePeriodDays: 14,
  minNForBenchmark: 3,
  staleAfterMonths: 18,
};

export interface ParsedBenchmarks {
  readonly rows: readonly BenchmarkRow[];
  /** Rows that parsed but cannot be used, with reasons. Kept for reporting. */
  readonly rejected: readonly BenchmarkRow[];
  readonly thresholds: Thresholds;
}

const STRIKETHROUGH = /~~/;
const PLACEHOLDER = /_\(empty\)_/i;

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Split a markdown table row into trimmed cells, dropping the leading/trailing pipes. */
function cells(line: string): string[] {
  const t = line.trim();
  if (!t.startsWith('|')) return [];
  return t
    .slice(1, t.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((c) => c.trim());
}

function isSeparator(line: string): boolean {
  return /^\|[\s:|-]+\|?$/.test(line.trim());
}

function parseNumber(raw: string): number | undefined {
  // "2.4%", "RM114.21", "6.56 blended (Product Ads GMV Max)", "47.2% from 7 days"
  const m = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

function monthsBetween(from: string, toISO: string): number | undefined {
  // lastObserved is written as YYYY-MM or YYYY-MM-DD.
  const m = from.match(/(\d{4})-(\d{2})/);
  if (!m) return undefined;
  const fy = Number(m[1]);
  const fm = Number(m[2]);
  const t = toISO.match(/(\d{4})-(\d{2})/);
  if (!t) return undefined;
  const ty = Number(t[1]);
  const tm = Number(t[2]);
  return (ty - fy) * 12 + (tm - fm);
}

const METRIC_BY_HEADING: readonly { re: RegExp; metric: string }[] = [
  { re: /^##\s+Conversion rate/i, metric: 'CVR' },
  { re: /^##\s+Average order value/i, metric: 'AOV' },
  { re: /^##\s+Organic share/i, metric: 'organic share' },
  { re: /^##\s+Promo dependency/i, metric: 'promo dependency' },
  { re: /^##\s+Gross margin/i, metric: 'gross margin' },
  { re: /^##\s+ROAS/i, metric: 'ROAS' },
];

/** Sections whose rows must never enter benchmark lookup. */
const EXCLUDED_HEADING = /^##\s+(Retired figures|Internal decision thresholds|Example row|Platform mechanics|How to add)/i;

export interface ParseOptions {
  /** Engagement period start, ISO. Staleness is measured against this, not "now". */
  readonly asOf: string;
  readonly thresholds?: Thresholds;
}

export function parseBenchmarks(markdown: string, opts: ParseOptions): ParsedBenchmarks {
  const thresholds = { ...(opts.thresholds ?? DEFAULT_THRESHOLDS) };
  const rows: BenchmarkRow[] = [];
  const rejected: BenchmarkRow[] = [];

  const lines = markdown.split(/\r?\n/);

  let metric: string | undefined;
  let excluded = false;
  let inThresholdTable = false;
  let header: string[] | undefined;
  const thresholdPairs: { rule: string; value: string }[] = [];
  /** True inside a fenced code block, whose contents are examples, not tables. */
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (/^#{2,}\s/.test(line)) {
      excluded = EXCLUDED_HEADING.test(line);
      inThresholdTable = /^##\s+Internal decision thresholds/i.test(line);
      const hit = METRIC_BY_HEADING.find((h) => h.re.test(line));
      metric = hit?.metric;
      // "Additional observed metrics" tables carry their own metric column.
      if (/^##\s+Additional observed metrics/i.test(line)) metric = '__per-row__';
      header = undefined;
      continue;
    }

    const c = cells(line);
    if (c.length === 0) continue;
    if (isSeparator(line)) continue;

    if (inThresholdTable) {
      if (c[0] === 'Rule') continue;
      if (c.length >= 2 && c[0] && c[1]) thresholdPairs.push({ rule: c[0], value: c[1] });
      continue;
    }

    if (excluded || metric === undefined) continue;

    // First non-separator row of a table is its header.
    if (header === undefined) {
      header = c.map((h) => h.toLowerCase());
      continue;
    }

    // ─── Discard rules ───
    // Struck-through rows are format examples. The template ships one; returning it
    // would put a fabricated benchmark into a client-facing brief.
    if (c.some((x) => STRIKETHROUGH.test(x))) continue;
    if (c.some((x) => PLACEHOLDER.test(x))) continue;

    /*
     * Exact header match first, substring only as a fallback. A plain `includes` finds
     * "n" inside "platform", which silently read the platform name as the sample size —
     * every row then failed the n>=3 gate and the file appeared permanently empty.
     */
    const col = (name: string): string => {
      let i = header!.indexOf(name);
      if (i < 0) i = header!.findIndex((h) => h.includes(name));
      return i >= 0 ? (c[i] ?? '') : '';
    };

    const platform = c[0] ?? '';
    const category = c[1] ?? '';
    if (platform === '' || category === '') continue;

    const rowMetric = metric === '__per-row__' ? (c[2] ?? '') : metric;
    // In the per-row layout the value sits one column further right.
    const rawValue = metric === '__per-row__' ? (c[3] ?? '') : (c[2] ?? '');
    if (rawValue === '') continue;

    const nRaw = col('n');
    const n = nRaw === '' ? undefined : parseNumber(nRaw);
    const lastObserved = col('last observed');
    const periodType = col('period type');
    const clientCodes = col('client code')
      .split(/[\s,/]+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

    const base = {
      rowId: [slug(platform), slug(category), slug(rowMetric), lastObserved || 'undated'].join('-'),
      platform,
      category,
      metric: rowMetric,
      rawValue,
      value: parseNumber(rawValue),
      n,
      periodType,
      lastObserved,
      clientCodes,
    };

    // n < 3: recorded, not usable. One client is not a category.
    if (n === undefined || n < thresholds.minNForBenchmark) {
      rejected.push({
        ...base,
        usable: false,
        unusableReason:
          n === undefined
            ? 'no n recorded — cannot tell how many clients this came from'
            : `n=${n}, below the ${thresholds.minNForBenchmark} required — one client is not a category`,
      });
      continue;
    }

    const age = lastObserved === '' ? undefined : monthsBetween(lastObserved, opts.asOf);
    if (age !== undefined && age > thresholds.staleAfterMonths) {
      rejected.push({
        ...base,
        usable: false,
        unusableReason: `stale, needs re-check or retirement — last observed ${lastObserved}, ${age} months before this period`,
      });
      continue;
    }

    rows.push({ ...base, usable: true });
  }

  return { rows, rejected, thresholds: applyThresholdPairs(thresholds, thresholdPairs) };
}

/**
 * Fold the file's threshold table over the defaults, so editing the markdown changes the
 * model. Only rules we recognise are applied; an unrecognised line is left alone rather
 * than silently mangling the scorer.
 */
function applyThresholdPairs(base: Thresholds, pairs: readonly { rule: string; value: string }[]): Thresholds {
  const out: Thresholds = JSON.parse(JSON.stringify(base)) as Thresholds;
  const mut = out as {
    cvrRatio: { stable: number; medium: number; high: number };
    organicThinBelowPct: number;
    promoDependency: { stable: number; medium: number; high: number };
    grossMargin: { stable: number; medium: number; high: number };
    roasStepUpBelow: number;
    impact: { conversion: number; traffic: number; campaign: number; basket: number };
    minReadablePeriodDays: number;
    minNForBenchmark: number;
  };

  const nums = (s: string): number[] =>
    (s.replace(/,/g, '').match(/\d+(\.\d+)?/g) ?? []).map(Number);

  for (const { rule, value } of pairs) {
    const r = rule.toLowerCase();
    const v = nums(value);
    if (/cvr ratio/.test(r) && v.length >= 3) {
      mut.cvrRatio = { stable: v[0]!, medium: v[1]!, high: v[2]! };
    } else if (/organic share/.test(r) && v.length >= 1) {
      mut.organicThinBelowPct = v[0]!;
    } else if (/promo dependency/.test(r) && v.length >= 3) {
      mut.promoDependency = { stable: v[0]!, medium: v[1]!, high: v[2]! };
    } else if (/gross margin/.test(r) && v.length >= 3) {
      mut.grossMargin = { stable: v[0]!, medium: v[1]!, high: v[2]! };
    } else if (/roas/.test(r) && v.length >= 1) {
      mut.roasStepUpBelow = v[0]!;
    } else if (/impact weight/.test(r) && v.length >= 4) {
      mut.impact = { conversion: v[0]!, traffic: v[1]!, campaign: v[2]!, basket: v[3]! };
    } else if (/minimum readable period/.test(r) && v.length >= 1) {
      mut.minReadablePeriodDays = v[0]!;
    } else if (/\bn\b.*required|required before/.test(r) && v.length >= 1) {
      mut.minNForBenchmark = v[v.length - 1]!;
    }
  }
  return out;
}

export type LookupMissReason = 'none-on-file' | 'n-too-low' | 'stale';

export interface LookupMiss {
  readonly found: false;
  readonly reason: LookupMissReason;
  readonly detail: string;
}

export interface LookupHit {
  readonly found: true;
  readonly row: BenchmarkRow;
}

export type LookupResult = LookupHit | LookupMiss;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function matches(row: BenchmarkRow, platform: string, category: string, metric: string): boolean {
  return (
    norm(row.platform).startsWith(norm(platform)) &&
    norm(row.category) === norm(category) &&
    norm(row.metric) === norm(metric)
  );
}

export function lookup(
  parsed: ParsedBenchmarks,
  platform: string,
  category: string,
  metric: string,
): LookupResult {
  const hit = parsed.rows.find((r) => matches(r, platform, category, metric) && r.value !== undefined);
  if (hit) return { found: true, row: hit };

  const near = parsed.rejected.find((r) => matches(r, platform, category, metric));
  if (near) {
    return {
      found: false,
      reason: /stale/.test(near.unusableReason ?? '') ? 'stale' : 'n-too-low',
      detail: near.unusableReason ?? 'recorded but not usable',
    };
  }
  return {
    found: false,
    reason: 'none-on-file',
    detail: `no benchmark on file for ${platform} / ${category}`,
  };
}
