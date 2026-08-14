/**
 * Types for the two browser probes.
 *
 * The probes stay plain `.mjs` deliberately. They are almost entirely code that runs *inside*
 * the page — `document`, `PDFKit`, the calculator's own module-level state — and typechecking
 * that would mean adding "DOM" to `lib`, which would then let engine code reach for `window`
 * and `document` and still compile. The engine's isolation from the browser is worth more than
 * types on two test harnesses.
 *
 * So the contract the tests rely on is stated here instead. It is narrow on purpose: only what
 * `tests/deck.test.ts` reads. A mismatch surfaces as a type error in the test, which is where
 * it would be acted on anyway.
 */

declare module '*/deck-probe.mjs' {
  /** One scenario's output: the client deck, and the internal report from identical state. */
  interface DeckResult {
    /** False when the stage had no data to render — the section declines rather than guessing. */
    readonly drew: boolean;
    readonly pages: number;
    /** 'passed', or the message `assertClientSafe` threw. */
    readonly guard: string;
    readonly bytes: number[];
    readonly internalBytes: number[];
  }

  export const SCENARIOS: Record<string, Record<string, unknown>>;

  /** The strings a PDF viewer would show, recovered from the content streams. */
  export function pdfText(bytes: readonly number[]): string;

  export function collectDecks(): Promise<{
    readonly results: Record<string, DeckResult>;
    readonly errors: string[];
  }>;
}

declare module '*/analyst-deck-probe.mjs' {
  /** The text of an on-page status line, and whether it is showing at all. */
  interface Status {
    readonly hidden: boolean;
    readonly text: string;
  }
  interface Captured {
    readonly name: string;
    readonly bytes: number[];
    readonly pages: number;
  }

  export const ENGAGEMENT: Record<string, unknown>;

  export function runAnalystDeck(): Promise<{
    readonly results: {
      readonly deckWithoutProse: Status;
      readonly capturedWithoutProse: Captured | null;
      readonly badProse: Status;
      readonly deckAfterBadProse: Status;
      readonly capturedAfterBadProse: Captured | null;
      readonly goodProse: Status;
      readonly deckStatus: Status;
      readonly deck: Captured | null;
      readonly deckWithoutName: Status;
    };
    readonly errors: string[];
    readonly payload: Record<string, unknown>;
    readonly goodReply: Record<string, unknown>;
  }>;
}
