/**
 * The number check: every figure in the model's prose must appear in the payload it was given.
 *
 * A model asked to write about figures will helpfully produce adjacent ones — a rounded
 * total, an implied percentage, a plausible benchmark — and a fabricated number inside a paid
 * advisory deliverable is the failure this whole architecture exists to prevent.
 *
 * This lives apart from `prose.ts` for one reason: the browser needs it. `analyst.html` cannot
 * hold an API key, so the consultant pastes the payload into the Claude Project by hand and
 * pastes the answer back — and that answer must face exactly the same check the API path
 * applies, or the manual route becomes the unguarded one. Importing it from `prose.ts` would
 * drag the Anthropic SDK into the page bundle, so the check moved here and `prose.ts`
 * re-exports it.
 *
 * The limit worth knowing: this is set membership, not provenance. A fabricated figure that
 * happens to equal an unrelated number already in the payload passes. A test pins that.
 */

import type { Prose } from '../render/brief.js';

/** Every number that appears anywhere in the payload, as a set of canonical strings. */
function allowedNumbers(payload: unknown): Set<string> {
  const out = new Set<string>();
  const add = (n: number): void => {
    if (!Number.isFinite(n)) return;
    // A figure may legitimately be written rounded, truncated, or with the cents
    // dropped, so every plausible rendering of the same value is allowed.
    out.add(canon(n));
    out.add(canon(Math.round(n)));
    out.add(canon(Math.trunc(n)));
    out.add(canon(Number(n.toFixed(1))));
    out.add(canon(Number(n.toFixed(2))));
    // Round to 2 significant-ish places for large money figures written as "RM30,400".
    if (Math.abs(n) >= 1000) {
      out.add(canon(Math.round(n / 100) * 100));
      out.add(canon(Math.round(n / 1000) * 1000));
    }
    // A ratio quoted as a percentage, e.g. 0.634 written as "42%" of the benchmark.
    if (Math.abs(n) < 10) {
      out.add(canon(Math.round(n * 100)));
      out.add(canon(Number((n * 100).toFixed(1))));
    }
  };
  const walk = (v: unknown): void => {
    if (typeof v === 'number') add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk);
    else if (typeof v === 'string') {
      // Numbers embedded in payload strings — reasons, notes, gap questions — count
      // as given. They came out of the engine.
      for (const m of v.matchAll(/-?\d[\d,]*(\.\d+)?/g)) {
        const n = Number(m[0].replace(/,/g, ''));
        if (Number.isFinite(n)) add(n);
      }
    }
  };
  walk(payload);
  return out;
}

function canon(n: number): string {
  // -0 and 0 must compare equal; trailing zeros must not create a distinct key.
  const r = Object.is(n, -0) ? 0 : n;
  return String(Number(r.toFixed(4)));
}

/**
 * Ordinals, small counts, and calendar figures a directive needs in order to be a
 * sentence ("the top 5 listings", "a 7-day voucher", "within 30 days"). Excluding these
 * is what keeps the check from rejecting every usable response.
 */
const PROSE_NUMBERS = new Set(
  [
    0, 1, 2, 3, 4, 5, 6, 7, 10, 12, 14, 20, 21, 24, 25, 28, 30, 31, 48, 60, 72, 90, 100,
  ].map(canon),
);

export interface ValidationProblem {
  readonly kind: 'invented-number' | 'wrong-directive-count' | 'forbidden-phrase';
  readonly detail: string;
}

export function validateProse(prose: Prose, payload: unknown): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  const allowed = allowedNumbers(payload);

  const texts = [
    prose.finding,
    prose.sprint.fix.directive,
    prose.sprint.fix.hypothesis ?? '',
    prose.sprint.fix.falsifiedBy ?? '',
    prose.sprint.run.directive,
    prose.sprint.run.startsIn ?? '',
    prose.sprint.run.endsIn ?? '',
    prose.sprint.optimise.directive,
  ];
  const joined = texts.join('\n');

  for (const m of joined.matchAll(/-?\d[\d,]*(\.\d+)?/g)) {
    const raw = m[0];
    const n = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const key = canon(n);
    if (allowed.has(key) || PROSE_NUMBERS.has(key)) continue;
    problems.push({
      kind: 'invented-number',
      detail: `the figure ${raw} does not appear in the supplied data`,
    });
  }

  const directives = [
    prose.sprint.fix.directive,
    prose.sprint.run.directive,
    prose.sprint.optimise.directive,
  ].filter((d) => typeof d === 'string' && d.trim() !== '');
  if (directives.length !== 3) {
    problems.push({
      kind: 'wrong-directive-count',
      detail: `expected exactly three directives, got ${directives.length}`,
    });
  }

  // The consultancy advises; the client executes. First person plural in a directive
  // inverts the entire commercial relationship.
  const forbidden: readonly [RegExp, string][] = [
    [/\bwe will\b/i, '"we will"'],
    [/\bwe'll\b/i, '"we\'ll"'],
    [/\bwe can handle\b/i, '"we can handle"'],
    [/\blet us handle\b/i, '"let us handle"'],
    [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'an emoji'],
    [/!/, 'an exclamation mark'],
  ];
  for (const [re, label] of forbidden) {
    if (re.test(joined)) {
      problems.push({ kind: 'forbidden-phrase', detail: `output contains ${label}` });
    }
  }

  return problems;
}

