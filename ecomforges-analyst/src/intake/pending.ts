/**
 * The confirmation gate.
 *
 * CSV exports and screenshots both produce figures nobody has checked yet. A misread digit
 * in a conversion rate changes which track activates, and a silently wrong column mapping
 * produces a confident wrong analysis — so neither may reach the engine until a human has
 * looked at what was read.
 *
 * The gate is a type, not a convention. `analyse()` takes an `Engagement`; intake produces
 * a `PendingIntake`, and the only way to get an `Engagement` out of one is `confirm()`.
 * Code that forgets the step does not compile.
 */

import type { Engagement } from '../types/datasheet.js';

/** A figure read from an untrusted source, with what the reader could and could not see. */
export interface ReadField {
  readonly field: string;
  readonly platform?: string;
  /** Null when the source was unreadable. Never a best guess. */
  readonly value: number | string | null;
  /** Where it came from — a column name, a screen region, a cell reference. */
  readonly source: string;
  /** Why it could not be read. Set only when value is null. */
  readonly illegible?: string;
}

export interface Question {
  readonly about: string;
  readonly question: string;
  /** Options where the answer is a choice rather than free text. */
  readonly options?: readonly string[];
}

export type IntakeKind = 'csv' | 'screenshot' | 'manual';

export interface PendingIntake {
  readonly kind: IntakeKind;
  /** Everything read, for the echo-back table. */
  readonly fields: readonly ReadField[];
  /** Must be empty before confirm() will succeed. */
  readonly questions: readonly Question[];
  /** Rendered for the human to check against the source. */
  readonly echo: string;
  /** Built only when the read is unambiguous. */
  readonly engagement?: Engagement;
}

export class UnconfirmedIntakeError extends Error {
  constructor(
    message: string,
    readonly questions: readonly Question[],
  ) {
    super(message);
    this.name = 'UnconfirmedIntakeError';
  }
}

/**
 * Turn a checked read into an Engagement.
 *
 * `acknowledged` is the caller asserting a human has compared the echo table against the
 * source. It is deliberately awkward to pass by accident.
 */
export function confirm(pending: PendingIntake, acknowledged: true): Engagement {
  if (acknowledged !== true) {
    throw new UnconfirmedIntakeError('intake was not acknowledged', pending.questions);
  }
  if (pending.questions.length > 0) {
    throw new UnconfirmedIntakeError(
      `${pending.questions.length} question(s) must be answered before analysis: ` +
        pending.questions.map((q) => q.question).join(' | '),
      pending.questions,
    );
  }
  if (pending.engagement === undefined) {
    throw new UnconfirmedIntakeError(
      'the read did not produce a complete engagement',
      pending.questions,
    );
  }
  return pending.engagement;
}

/** The table a human checks against the source before anything is analysed. */
export function renderEcho(pending: PendingIntake): string {
  const lines: string[] = [];
  const label =
    pending.kind === 'csv'
      ? 'READ FROM CSV — check this against the export before continuing'
      : pending.kind === 'screenshot'
        ? 'READ FROM SCREENSHOTS — check every figure against the image before continuing'
        : 'READ FROM MANUAL ENTRY';

  lines.push(`## ${label}`, '');
  lines.push('| Platform | Field | Value | Source |', '|---|---|---|---|');
  for (const f of pending.fields) {
    const v =
      f.value === null
        ? `**could not read** — ${f.illegible ?? 'no reason recorded'}`
        : String(f.value);
    lines.push(`| ${f.platform ?? '—'} | ${f.field} | ${v} | ${f.source} |`);
  }

  const unread = pending.fields.filter((f) => f.value === null);
  if (unread.length > 0) {
    lines.push(
      '',
      `${unread.length} figure(s) could not be read. They are gaps, not guesses — they will ` +
        'appear in the brief as [ASK] unless you supply them.',
    );
  }

  if (pending.questions.length > 0) {
    lines.push('', '### Answer these before analysis runs', '');
    pending.questions.forEach((q, i) => {
      lines.push(
        `${i + 1}. **${q.about}** — ${q.question}` +
          (q.options ? `\n   Options: ${q.options.join(' · ')}` : ''),
      );
    });
    lines.push(
      '',
      '**Analysis is blocked until these are resolved.** A wrong column mapping or a misread ' +
        'digit produces a confident wrong brief, which is worse than no brief.',
    );
  } else {
    lines.push('', '**No open questions.** Confirm the table above and analysis can run.');
  }
  return lines.join('\n');
}
