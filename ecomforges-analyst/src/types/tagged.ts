/**
 * Provenance-carrying numbers.
 *
 * Every figure that reaches a brief says where it came from. The type system enforces
 * it rather than a convention, because a convention is a thing people forget under
 * deadline and this output goes to paying clients.
 *
 * The load-bearing detail is that ASK carries no `value` field. There is nothing to
 * read, so calling code cannot quietly treat a missing input as zero — it has to
 * handle the gap, and the gap ends up in the brief where it belongs.
 */

export type Tag = 'DATA' | 'CALC' | 'BM' | 'EST' | 'ASK';

export interface TaggedData<T> {
  readonly tag: 'DATA';
  readonly value: T;
  readonly source?: string;
}

export interface TaggedCalc<T> {
  readonly tag: 'CALC';
  readonly value: T;
  /** The inline arithmetic, e.g. "2,940 ÷ 48,200". Rendered next to the figure. */
  readonly workings: string;
}

export interface TaggedBm<T> {
  readonly tag: 'BM';
  readonly value: T;
  /** Cites the benchmark file row, so a brief can be audited back to its source. */
  readonly rowId: string;
}

export interface TaggedEst<T> {
  readonly tag: 'EST';
  readonly value: T;
  /** Mandatory. An estimate without a stated basis is a guess wearing a tag. */
  readonly basis: string;
}

export interface TaggedAsk {
  readonly tag: 'ASK';
  readonly question: string;
}

export type Tagged<T> =
  | TaggedData<T>
  | TaggedCalc<T>
  | TaggedBm<T>
  | TaggedEst<T>
  | TaggedAsk;

/** Every Tagged variant that actually holds a number. */
export type Known<T> = TaggedData<T> | TaggedCalc<T> | TaggedBm<T> | TaggedEst<T>;

// ─── Constructors ──────────────────────────────────────────────────────────────

export function data<T>(value: T, source?: string): TaggedData<T> {
  return source === undefined ? { tag: 'DATA', value } : { tag: 'DATA', value, source };
}

export function calc<T>(value: T, workings: string): TaggedCalc<T> {
  return { tag: 'CALC', value, workings };
}

export function bm<T>(value: T, rowId: string): TaggedBm<T> {
  return { tag: 'BM', value, rowId };
}

export function est<T>(value: T, basis: string): TaggedEst<T> {
  // Checked at runtime as well as in the type, because an EST arriving from parsed
  // JSON has not been through the compiler.
  if (typeof basis !== 'string' || basis.trim() === '') {
    throw new Error('EST requires a non-empty basis: an estimate without a stated basis is a guess');
  }
  return { tag: 'EST', value, basis };
}

export function ask(question: string): TaggedAsk {
  if (typeof question !== 'string' || question.trim() === '') {
    throw new Error('ASK requires a question describing what is missing');
  }
  return { tag: 'ASK', question };
}

// ─── Inspection ────────────────────────────────────────────────────────────────

export function isKnown<T>(t: Tagged<T>): t is Known<T> {
  return t.tag !== 'ASK';
}

export function isAsk<T>(t: Tagged<T>): t is TaggedAsk {
  return t.tag === 'ASK';
}

/**
 * Read a value, or a caller-supplied fallback if the figure is unknown.
 *
 * Deliberately verbose to call. There is no `valueOrZero`, and there never should be:
 * defaulting a missing figure to zero is how a brief ends up asserting that a client
 * has no ad spend when nobody measured it.
 */
export function valueOr<T>(t: Tagged<T>, fallback: T): T {
  return isKnown(t) ? t.value : fallback;
}

/** Collect every ASK from a set of figures, for the brief's Gaps section. */
export function collectAsks(...items: readonly Tagged<unknown>[]): TaggedAsk[] {
  return items.filter(isAsk);
}

// ─── Combination ───────────────────────────────────────────────────────────────

/**
 * Combine known figures into a new CALC, propagating ASK.
 *
 * If any input is unknown the result is unknown, and the question names which input was
 * missing so the gap is actionable rather than a shrug. This is the mechanism that turns
 * a blank spreadsheet cell into a line in the Gaps section.
 */
export function map<const A extends readonly Tagged<number>[], R>(
  inputs: A,
  labels: { readonly [K in keyof A]: string },
  fn: (...values: { readonly [K in keyof A]: number }) => R,
  workings: (...values: { readonly [K in keyof A]: number }) => string,
): Tagged<R> {
  const missing: string[] = [];
  const values: number[] = [];

  inputs.forEach((input, i) => {
    if (isAsk(input)) missing.push(labels[i] ?? `input ${i + 1}`);
    else values.push(input.value);
  });

  if (missing.length > 0) {
    const inherited = inputs
      .filter(isAsk)
      .map((a) => a.question)
      .filter((q) => q.length > 0);
    // Carry the original question forward where there is one, so a gap two levels deep
    // still explains itself in the client-facing list.
    const detail = inherited.length > 0 ? ` (${inherited.join('; ')})` : '';
    return ask(`not computable — missing ${missing.join(' and ')}${detail}`);
  }

  const tuple = values as unknown as { readonly [K in keyof A]: number };
  return calc(fn(...tuple), workings(...tuple));
}

// ─── Formatting ────────────────────────────────────────────────────────────────

export interface FormatOptions {
  /** How to render the underlying value. Defaults to String(). */
  readonly render?: (v: unknown) => string;
  /** Omit the bracketed provenance suffix. Used inside dense tables. */
  readonly bare?: boolean;
}

export function fmt<T>(t: Tagged<T>, opts: FormatOptions = {}): string {
  const render = opts.render ?? ((v: unknown) => String(v));
  if (t.tag === 'ASK') return `[ASK] ${t.question}`;
  const body = render(t.value);
  if (opts.bare) return body;
  switch (t.tag) {
    case 'DATA':
      return t.source ? `${body} [DATA ${t.source}]` : `${body} [DATA]`;
    case 'CALC':
      return `${body} [CALC ${t.workings}]`;
    case 'BM':
      return `${body} [BM ${t.rowId}]`;
    case 'EST':
      return `${body} [EST ${t.basis}]`;
  }
}

const GROUPED = new Intl.NumberFormat('en-MY', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const GROUPED_INT = new Intl.NumberFormat('en-MY', { maximumFractionDigits: 0 });

/** RM 1,234.56 */
export function rm(n: number): string {
  return `RM${GROUPED.format(n)}`;
}

/** RM1,235 — for uplift figures, where cents are noise. */
export function rmRound(n: number): string {
  return `RM${GROUPED_INT.format(Math.round(n))}`;
}

export function num(n: number): string {
  return GROUPED_INT.format(n);
}

export function pct(n: number, dp = 2): string {
  return `${n.toFixed(dp)}%`;
}

/** A ratio expressed to 3dp, as used for CVR-against-benchmark. */
export function ratio(n: number): string {
  return n.toFixed(3);
}

export const fmtRm = <T extends number>(t: Tagged<T>) => fmt(t, { render: (v) => rm(v as number) });
export const fmtRmRound = <T extends number>(t: Tagged<T>) =>
  fmt(t, { render: (v) => rmRound(v as number) });
export const fmtPct = <T extends number>(t: Tagged<T>, dp = 2) =>
  fmt(t, { render: (v) => pct(v as number, dp) });
export const fmtNum = <T extends number>(t: Tagged<T>) => fmt(t, { render: (v) => num(v as number) });
