/**
 * CSV / spreadsheet-export intake.
 *
 * Platform exports rename their columns constantly, and a silently wrong mapping produces
 * a confident wrong analysis — so the mapping is stated back and confirmed before anything
 * is computed. Where two columns compete for one field, this asks rather than choosing.
 *
 * The alias table below is built from real Shopee, Lazada, and TikTok Shop exports. The
 * traps are real too: Shopee ships two different sales columns, and TikTok's "Items
 * refunded" holds a ringgit value despite its name.
 */

import { data, type Tagged } from '../types/tagged.js';
import type { Engagement, PlatformData, PlatformName } from '../types/datasheet.js';
import { PLATFORM_NAMES } from '../types/datasheet.js';
import type { PendingIntake, Question, ReadField } from './pending.js';
import { renderEcho } from './pending.js';

export type FieldName =
  | 'sessions'
  | 'buyers'
  | 'orders'
  | 'headlineCvr'
  | 'aov'
  | 'gmv'
  | 'organicSharePct'
  | 'promoRevenuePct'
  | 'adSpend'
  | 'roas'
  | 'grossMarginPct'
  | 'cancelledOrders'
  | 'cancelledValue'
  | 'refundedOrders'
  | 'refundedValue'
  | 'addToCartUsers'
  | 'wishlistUsers';

/** Summed across daily rows. Rates are never summed. */
const ADDITIVE: ReadonlySet<FieldName> = new Set<FieldName>([
  'sessions',
  'buyers',
  'orders',
  'gmv',
  'adSpend',
  'cancelledOrders',
  'cancelledValue',
  'refundedOrders',
  'refundedValue',
  'addToCartUsers',
  'wishlistUsers',
]);

interface Alias {
  readonly re: RegExp;
  readonly field: FieldName;
  /** A weaker match loses to a stronger one for the same field, without an ambiguity question. */
  readonly strength: 1 | 2 | 3;
  readonly note?: string;
}

const ALIASES: readonly Alias[] = [
  // Sessions. "Visitors" beats "Pageviews" — a pageview is not a session.
  { re: /^visitors?$/i, field: 'sessions', strength: 3 },
  { re: /^(unique )?(shop )?visitors?$/i, field: 'sessions', strength: 3 },
  { re: /^sessions?$/i, field: 'sessions', strength: 3 },
  { re: /^page ?views?$/i, field: 'sessions', strength: 1, note: 'pageviews are not sessions' },

  // Buyers. TikTok calls them Customers; Shopee prefixes with #.
  { re: /^#? ?of buyers$/i, field: 'buyers', strength: 3 },
  { re: /^buyers$/i, field: 'buyers', strength: 3 },
  { re: /^customers$/i, field: 'buyers', strength: 2 },
  { re: /^unique buyers$/i, field: 'buyers', strength: 3 },

  // Orders. "SKU orders" and "Units sold" are different quantities.
  { re: /^orders$/i, field: 'orders', strength: 3 },
  { re: /^(placed|paid|confirmed) orders$/i, field: 'orders', strength: 2 },

  // Revenue.
  { re: /^gmv$/i, field: 'gmv', strength: 3 },
  { re: /^revenue$/i, field: 'gmv', strength: 3 },
  { re: /^sales \(myr\)$/i, field: 'gmv', strength: 3 },
  { re: /^gross revenue$/i, field: 'gmv', strength: 2 },
  { re: /^sales$/i, field: 'gmv', strength: 2 },
  {
    re: /^sales \(shopee rebate and coins excluded\)$/i,
    field: 'gmv',
    strength: 2,
    note: 'net of Shopee-funded rebate — a different figure from gross Sales (MYR)',
  },

  // Rates.
  { re: /^(order )?conversion rate$/i, field: 'headlineCvr', strength: 3 },
  { re: /^cvr$/i, field: 'headlineCvr', strength: 3 },
  { re: /^aov$/i, field: 'aov', strength: 3 },
  { re: /^average order value$/i, field: 'aov', strength: 3 },
  { re: /^sales per order$/i, field: 'aov', strength: 3 },
  { re: /^roas$/i, field: 'roas', strength: 3 },
  { re: /^ads? roas$/i, field: 'roas', strength: 2 },
  { re: /^gross margin( %| pct)?$/i, field: 'grossMarginPct', strength: 3 },
  { re: /^organic (share|traffic)( %)?$/i, field: 'organicSharePct', strength: 3 },
  { re: /^promo (revenue |dependency )?(share|%)$/i, field: 'promoRevenuePct', strength: 3 },

  // Spend.
  { re: /^ad(s)? (spend|expense|cost)$/i, field: 'adSpend', strength: 3 },
  { re: /^marketing spend$/i, field: 'adSpend', strength: 2 },

  // Leakage.
  { re: /^cancell?ed orders$/i, field: 'cancelledOrders', strength: 3 },
  { re: /^cancell?ed (sales|amount|value)$/i, field: 'cancelledValue', strength: 3 },
  { re: /^returned\/refunded orders$/i, field: 'refundedOrders', strength: 3 },
  { re: /^refunded orders$/i, field: 'refundedOrders', strength: 3 },
  { re: /^returned\/refunded sales$/i, field: 'refundedValue', strength: 3 },
  { re: /^return\/refund amount$/i, field: 'refundedValue', strength: 3 },
  { re: /^refunded (value|amount)$/i, field: 'refundedValue', strength: 3 },

  // Funnel.
  { re: /^add to cart users$/i, field: 'addToCartUsers', strength: 3 },
  { re: /^atc users$/i, field: 'addToCartUsers', strength: 2 },
  { re: /^wishlist users$/i, field: 'wishlistUsers', strength: 3 },
];

/**
 * Columns whose name misleads. Each one is asked about rather than mapped, because getting
 * it wrong is silent: the figure lands in the right slot with the wrong meaning.
 */
const TRAPS: readonly {
  re: RegExp;
  /** Only asked when this field has no unambiguous mapping of its own. */
  concerns: FieldName;
  question: string;
  options: readonly string[];
}[] = [
  {
    re: /^items refunded$/i,
    concerns: 'refundedValue',
    question:
      'TikTok\'s "Items refunded" holds a ringgit value in some exports and a unit count in ' +
      'others. Which is it here?',
    options: ['refunded value (RM)', 'refunded item count', 'leave it out'],
  },
  {
    re: /^units sold$/i,
    concerns: 'orders',
    question:
      '"Units sold" counts items, not orders. Map it to orders only if this shop sells one ' +
      'item per order.',
    options: ['not orders — leave it out', 'map to orders'],
  },
  {
    re: /^sku orders$/i,
    concerns: 'orders',
    question: '"SKU orders" counts order lines, not orders. Map it to orders?',
    options: ['not orders — leave it out', 'map to orders'],
  },
];

// ─── CSV parsing ───────────────────────────────────────────────────────────────

/** Minimal RFC-4180 reader: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/** "1,234.56", "6.33%", "RM 89.00" → number. Anything unparseable → null, never zero. */
export function parseCell(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, '').replace(/^RM/i, '').replace(/%$/, '');
  if (s === '' || s === '-' || s === '—') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const DATE_RANGE = /(\d{2,4}[-/]\d{2}[-/]\d{2,4})\s*[-~to]{1,2}\s*(\d{2,4}[-/]\d{2}[-/]\d{2,4})/i;

function toIso(d: string): string | null {
  const dmy = d.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const ymd = d.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return null;
}

// ─── Mapping ───────────────────────────────────────────────────────────────────

export interface ColumnMapping {
  readonly column: string;
  readonly index: number;
  readonly field: FieldName;
  readonly note?: string;
}

export interface MappingProposal {
  readonly mappings: readonly ColumnMapping[];
  readonly ignored: readonly string[];
  readonly questions: readonly Question[];
}

export function proposeMapping(header: readonly string[]): MappingProposal {
  const mappings: ColumnMapping[] = [];
  const questions: Question[] = [];
  const ignored: string[] = [];

  // Every column's candidate fields, strongest first.
  const candidates = header.map((h, index) => {
    const name = h.trim();
    const hits = ALIASES.filter((a) => a.re.test(name)).sort((x, y) => y.strength - x.strength);
    return { name, index, hits };
  });

  const byField = new Map<FieldName, typeof candidates>();
  for (const c of candidates) {
    if (c.hits.length === 0) {
      if (!TRAPS.some((t) => t.re.test(c.name))) ignored.push(c.name);
      continue;
    }
    const field = c.hits[0]!.field;
    const list = byField.get(field) ?? [];
    list.push(c);
    byField.set(field, list);
  }

  for (const [field, cols] of byField) {
    if (cols.length === 1) {
      const only = cols[0]!;
      const alias = only.hits[0]!;
      mappings.push({
        column: only.name,
        index: only.index,
        field,
        ...(alias.note !== undefined ? { note: alias.note } : {}),
      });
      continue;
    }

    // Several columns want the same field. A clear strength winner takes it; a tie is a
    // genuine ambiguity and gets asked about rather than guessed.
    const strengths = cols.map((c) => c.hits[0]!.strength);
    const top = Math.max(...strengths);
    const winners = cols.filter((c) => c.hits[0]!.strength === top);

    if (winners.length === 1) {
      const w = winners[0]!;
      mappings.push({ column: w.name, index: w.index, field });
      for (const loser of cols.filter((c) => c !== w)) ignored.push(loser.name);
      continue;
    }

    questions.push({
      about: field,
      question:
        `${winners.length} columns could be "${field}": ${winners.map((w) => `"${w.name}"`).join(', ')}. ` +
        `Which one? These are different figures and picking the wrong one changes the analysis.`,
      options: winners.map((w) => w.name),
    });
  }

  /*
   * Traps are evaluated last, and only where the ambiguity is still live. A real Lazada
   * export carries both "Orders" and "Units Sold"; once "Orders" is mapped there is
   * nothing to ask, and asking anyway would block a read that was never ambiguous.
   */
  const mappedFields = new Set(mappings.map((m) => m.field));
  const askedFields = new Set(questions.map((q) => q.about));
  for (const t of TRAPS) {
    const hit = candidates.find((c) => t.re.test(c.name));
    if (hit === undefined) continue;
    if (mappedFields.has(t.concerns) || askedFields.has(t.concerns)) {
      ignored.push(hit.name);
      continue;
    }
    questions.push({ about: hit.name, question: t.question, options: t.options });
  }

  return { mappings, ignored, questions };
}

// ─── Reading a platform's rows ─────────────────────────────────────────────────

export interface CsvIntakeOptions {
  readonly platform: PlatformName;
  readonly clientCode: string;
  readonly category: string;
  /** Answers to the mapping questions, keyed by the question's `about`. */
  readonly answers?: Readonly<Record<string, string>>;
}

export interface CsvReadResult {
  readonly pending: PendingIntake;
  readonly proposal: MappingProposal;
}

export function readCsv(text: string, opts: CsvIntakeOptions): CsvReadResult {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV has no data rows');

  const header = rows[0]!.map((h) => h.trim());
  const proposal = proposeMapping(header);

  // Answers close questions. An answer naming a column resolves the mapping for that field.
  const answers = opts.answers ?? {};
  const open = proposal.questions.filter((q) => answers[q.about] === undefined);
  const resolved: ColumnMapping[] = [...proposal.mappings];
  for (const q of proposal.questions) {
    const a = answers[q.about];
    if (a === undefined) continue;
    const idx = header.findIndex((h) => h.toLowerCase() === a.toLowerCase());
    if (idx >= 0 && (FIELD_NAMES as readonly string[]).includes(q.about)) {
      resolved.push({ column: header[idx]!, index: idx, field: q.about as FieldName });
    }
  }

  const body = rows.slice(1);
  const dateIdx = header.findIndex((h) => /^date$/i.test(h.trim()));

  // Platform exports often carry a period-total row alongside the daily rows. Using it
  // avoids summing rates, which would be meaningless.
  const totalRow = dateIdx >= 0 ? body.find((r) => DATE_RANGE.test(r[dateIdx] ?? '')) : undefined;
  const dailyRows = body.filter((r) => r !== totalRow);

  const fields: ReadField[] = [];
  const values: Partial<Record<FieldName, number>> = {};
  const sourceOf: Partial<Record<FieldName, string>> = {};

  for (const m of resolved) {
    if (totalRow) {
      const n = parseCell(totalRow[m.index] ?? '');
      if (n !== null) {
        values[m.field] = n;
        sourceOf[m.field] = `column "${m.column}", period-total row`;
        continue;
      }
    }
    if (ADDITIVE.has(m.field)) {
      const nums = dailyRows.map((r) => parseCell(r[m.index] ?? '')).filter((n): n is number => n !== null);
      if (nums.length > 0) {
        values[m.field] = nums.reduce((a, b) => a + b, 0);
        sourceOf[m.field] = `column "${m.column}", summed over ${nums.length} rows`;
        continue;
      }
    }
    // A rate with no total row cannot be summed and must not be averaged blindly.
    fields.push({
      field: m.field,
      platform: opts.platform,
      value: null,
      source: `column "${m.column}"`,
      illegible: ADDITIVE.has(m.field)
        ? 'no parseable values in this column'
        : 'a rate cannot be summed across daily rows, and this export has no period-total row',
    });
  }

  // AOV is derivable when it was not exported, and saying so beats leaving a hole.
  if (values.aov === undefined && values.gmv !== undefined && values.orders !== undefined && values.orders > 0) {
    values.aov = values.gmv / values.orders;
    sourceOf.aov = 'computed as GMV ÷ orders (not present in the export)';
  }

  for (const [field, value] of Object.entries(values) as [FieldName, number][]) {
    fields.push({
      field,
      platform: opts.platform,
      value: Number(value.toFixed(4)),
      source: sourceOf[field] ?? 'mapped column',
    });
  }

  const dates = dateIdx >= 0 ? dailyRows.map((r) => toIso((r[dateIdx] ?? '').trim())).filter((d): d is string => d !== null) : [];
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  if (totalRow && dateIdx >= 0) {
    const m = (totalRow[dateIdx] ?? '').match(DATE_RANGE);
    if (m) {
      periodStart = toIso(m[1]!) ?? undefined;
      periodEnd = toIso(m[2]!) ?? undefined;
    }
  }
  if (periodStart === undefined && dates.length > 0) {
    const sorted = [...dates].sort();
    periodStart = sorted[0];
    periodEnd = sorted[sorted.length - 1];
  }

  const questions: Question[] = [...open];
  if (periodStart === undefined || periodEnd === undefined) {
    questions.push({
      about: 'period',
      question:
        'No date column or period-total row was found, so the period cannot be read from the ' +
        'export. What dates does this cover?',
    });
  }

  const engagement =
    periodStart !== undefined && periodEnd !== undefined && questions.length === 0
      ? buildEngagement(opts, values, periodStart, periodEnd)
      : undefined;

  const pending: PendingIntake = {
    kind: 'csv',
    fields,
    questions,
    echo: '',
    ...(engagement !== undefined ? { engagement } : {}),
  };
  return { pending: { ...pending, echo: renderMappingEcho(pending, resolved, proposal.ignored) }, proposal };
}

const FIELD_NAMES: readonly FieldName[] = [
  'sessions',
  'buyers',
  'orders',
  'headlineCvr',
  'aov',
  'gmv',
  'organicSharePct',
  'promoRevenuePct',
  'adSpend',
  'roas',
  'grossMarginPct',
  'cancelledOrders',
  'cancelledValue',
  'refundedOrders',
  'refundedValue',
  'addToCartUsers',
  'wishlistUsers',
];

function buildEngagement(
  opts: CsvIntakeOptions,
  values: Partial<Record<FieldName, number>>,
  start: string,
  end: string,
): Engagement {
  const p: Record<string, unknown> = { platform: opts.platform };
  for (const [field, value] of Object.entries(values) as [FieldName, number][]) {
    p[field] = data(value, 'CSV export') as Tagged<number>;
  }
  return {
    clientCode: opts.clientCode,
    periodStart: new Date(start),
    periodEnd: new Date(end),
    category: opts.category,
    platforms: [p as unknown as PlatformData],
  };
}

/** The mapping stated back, one line per column — the step that makes a wrong map visible. */
function renderMappingEcho(
  pending: PendingIntake,
  mappings: readonly ColumnMapping[],
  ignored: readonly string[],
): string {
  const lines: string[] = ['## COLUMN MAPPING — check this before analysis runs', ''];
  for (const m of mappings) {
    lines.push(`- "${m.column}" → **${m.field}**${m.note ? `  ⚠ ${m.note}` : ''}`);
  }
  if (ignored.length > 0) {
    lines.push('', `Ignored: ${ignored.map((c) => `"${c}"`).join(', ')}`);
  }
  lines.push('', renderEcho(pending));
  return lines.join('\n');
}

export function mergePlatforms(engagements: readonly Engagement[]): Engagement {
  if (engagements.length === 0) throw new Error('nothing to merge');
  const first = engagements[0]!;
  const seen = new Set<string>();
  const platforms: PlatformData[] = [];
  for (const e of engagements) {
    for (const p of e.platforms) {
      if (seen.has(p.platform)) throw new Error(`platform ${p.platform} supplied twice`);
      seen.add(p.platform);
      platforms.push(p);
    }
  }
  return { ...first, platforms };
}

export { PLATFORM_NAMES };
