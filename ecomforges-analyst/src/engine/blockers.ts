/**
 * Blockers, run before any track selection.
 *
 * The third state matters as much as the two obvious ones. A double-digit cancellation
 * rate cannot distinguish a buyer changing their mind from a stock-out, and that
 * distinction decides whether Operations is High or Critical — which decides whether any
 * track activates at all. So "cannot be checked" is a first-class result carrying the
 * question, not a footnote.
 */

import type { PlatformData } from '../types/datasheet.js';
import { isAsk, num, pct, type Tagged, type TaggedAsk, ask } from '../types/tagged.js';
import { isScored, LEVEL_NAME, type AreaId, type BusinessArea } from './scoring.js';

export type BlockerKind = 'operations' | 'margin';
export type BlockedState = true | false | 'unknown';

export interface BlockerResult {
  readonly blocked: BlockedState;
  readonly kind?: BlockerKind;
  readonly title: string;
  /** Rendered into section 4 verbatim. */
  readonly message: string;
  /** What the missing answer would change. Only set when blocked === 'unknown'. */
  readonly wouldChange?: string;
  /** Gaps that must lead the Gaps section. */
  readonly gaps: readonly TaggedAsk[];
  /** Both blockers, reported even when only one is acted on. */
  readonly alsoNoted: readonly string[];
}

/** Threshold at which a cancellation rate is itself a finding rather than a footnote. */
const DOUBLE_DIGIT = 10;

function read(t: Tagged<number> | undefined): number | undefined {
  if (t === undefined || isAsk(t)) return undefined;
  return t.value;
}

interface CancellationConcern {
  readonly platform: string;
  readonly ratePct: number;
  readonly cancelled: number;
  readonly orders: number;
}

function cancellationConcerns(platforms: readonly PlatformData[]): CancellationConcern[] {
  const out: CancellationConcern[] = [];
  for (const p of platforms) {
    const c = read(p.cancelledOrders);
    const o = read(p.orders);
    if (c === undefined || o === undefined || o === 0) continue;
    const rate = (c / o) * 100;
    if (rate >= DOUBLE_DIGIT) out.push({ platform: p.platform, ratePct: rate, cancelled: c, orders: o });
  }
  return out;
}

export function checkBlockers(
  business: Record<AreaId, BusinessArea>,
  platforms: readonly PlatformData[],
): BlockerResult {
  const ops = business.operations.level;
  const profit = business.profitability.level;
  const alsoNoted: string[] = [];
  const gaps: TaggedAsk[] = [];

  const opsCritical = isScored(ops) && ops.level === 3;
  const profitCritical = isScored(profit) && profit.level === 3;

  if (opsCritical) alsoNoted.push(`Operations is Critical: ${ops.reason}`);
  if (profitCritical) alsoNoted.push(`Profitability is Critical: ${profit.reason}`);

  // Operations outranks margin. Report both, act on Operations.
  if (opsCritical) {
    return {
      blocked: true,
      kind: 'operations',
      title: 'Resolve operations first',
      message:
        'Operations is at Critical. No Forge Track activates this cycle. The session runs an ' +
        'operational stabilisation directive instead — fulfilment SLA, stock reliability, and ' +
        'internal approval speed. Re-score once operations clears Critical. Unresolved operations ' +
        'blocks every other growth lever, so nothing else is worth issuing.',
      gaps,
      alsoNoted,
    };
  }

  if (profitCritical) {
    return {
      blocked: true,
      kind: 'margin',
      title: 'Margin fix before any scaling',
      message:
        'Profitability is at Critical. Traffic and campaign scaling stay locked this cycle. The ' +
        'session runs a margin review: COGS structure, discount depth, and CAC. Sales Forge™ ' +
        'follows once margin clears Critical.',
      gaps,
      alsoNoted,
    };
  }

  // ─── Cannot-be-checked cases ───

  const concerns = cancellationConcerns(platforms);
  const profitUnscored = !isScored(profit);

  if (concerns.length > 0) {
    const worst = concerns.reduce((a, b) => (b.ratePct > a.ratePct ? b : a));
    const q =
      `Why did ${num(worst.cancelled)} ${worst.platform} orders cancel — buyer-initiated, ` +
      `stock-out, or courier? At ${pct(worst.ratePct)} this is a finding in its own right. If it is ` +
      `stock on the top SKUs, Operations is Critical and no track activates this cycle.`;
    gaps.push(ask(q));
  }

  if (profitUnscored) {
    gaps.push(
      ask(
        'Gross margin by platform, and COGS on the top SKUs. Profitability could not be scored, ' +
          'so the margin blocker was never checked. If margin on the target platform is thin, ' +
          'driving volume there is the wrong instruction and this brief’s conclusion flips.',
      ),
    );
  }

  if (gaps.length > 0) {
    const parts: string[] = [];
    if (concerns.length > 0) {
      // Level name, not the area's full reason sentence — the reason reads as prose and
      // produced "clean. Stable, driven by Shopee., but Lazada cancelled..." mid-clause.
      parts.push(
        `Operations rolls up to ${isScored(ops) ? LEVEL_NAME[ops.level] : 'unscored'}, but ` +
          concerns
            .map((c) => `${c.platform} cancelled ${pct(c.ratePct)} of orders`)
            .join(' and ') +
          '. The data says the rate, not the cause, and Critical requires a stock-out on top SKUs.',
      );
    }
    if (profitUnscored) {
      parts.push('Profitability could not be checked at all — no margin figure was supplied.');
    }
    return {
      blocked: 'unknown',
      title: 'No blocker fires — with a caveat that can reverse it',
      message: parts.join(' '),
      wouldChange:
        concerns.length > 0
          ? 'If the cancellations are stock-driven, Operations becomes Critical, no track activates, and the directive becomes stock reliability instead.'
          : 'Without a margin figure, a Critical margin cannot be ruled out. Absence of evidence is not evidence.',
      gaps,
      alsoNoted,
    };
  }

  return {
    blocked: false,
    title: 'Clear',
    message:
      `Operations rolls up to ${isScored(ops) ? LEVEL_NAME[ops.level] : 'unscored'}. ` +
      `Profitability rolls up to ${isScored(profit) ? LEVEL_NAME[profit.level] : 'unscored'}. ` +
      `Neither is Critical, so track selection proceeds.`,
    gaps,
    alsoNoted,
  };
}
