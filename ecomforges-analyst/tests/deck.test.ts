/**
 * The client-deck redaction boundary.
 *
 * These decks are emailed to paying clients and to prospects who have not signed yet. The
 * internal reports built from the very same state contain a 100-point score, a tier letter,
 * red flags, retention decisions, and the scripts we read off on a call — so "does the client
 * deck leak" is not a question that can be settled by reading source. It has to be settled by
 * reading the finished PDF.
 *
 * So every scenario is generated in a real browser, the text is pulled back out of the PDF
 * bytes, and each assertion runs against what a client's PDF viewer would show. The paired
 * internal report is generated from the identical state and checked for the *presence* of the
 * same tokens — otherwise a deck that leaked nothing because the data never reached it would
 * pass just as happily as one that redacted correctly.
 *
 * Requires `npm run build:page` for the analyst half. Slow by test standards, because it is
 * a browser: budget a few seconds.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectDecks, pdfText } from '../scripts/deck-probe.mjs';
import { runAnalystDeck } from '../scripts/analyst-deck-probe.mjs';

/* Anchored to this file, not the working directory: the suite is run both from the project
   and from the repository root, and a cwd-relative path silently fails in one of them. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/*
 * The list is duplicated from index.html rather than imported, on purpose. The page's own
 * DECK_FORBIDDEN is a runtime guard; this is an independent statement of the same policy. If
 * someone loosens a pattern in the page to get a build through, importing it would loosen the
 * test in the same commit and nothing would fail.
 */
const FORBIDDEN: readonly [RegExp, string][] = [
  [/internal use only/i, 'internal chrome'],
  [/\btier\s*[ABC]\b/i, 'the qualification tier'],
  [/\d\s*\/\s*100\b/, 'a score out of 100'],
  [/red flag/i, 'red flags'],
  [/\bdowngrade\b/i, 'the retention decision'],
  [/\bback-?test\b/i, 'the model back-test'],
  [/founder mindset/i, 'a category that grades the reader'],
  [/say this (exactly|on the call)/i, 'the call scripts'],
  [/\bon the call\b/i, 'instructions to the consultant'],
  [/\bprobe\b/i, 'what we interrogate pre-sale'],
  [/\bweighted\b/i, 'the scoring internals'],
  [/dependency load/i, 'how much they lean on us'],
  [/\bpayment\b/i, 'whether they pay on time'],
  [/\bassessed by\b/i, 'the internal assessor'],
  [/\bMY-[A-Z]{2,6}-\d{2}\b/, 'the internal client code'],
];

let decks: Awaited<ReturnType<typeof collectDecks>>;

beforeAll(async () => {
  decks = await collectDecks();
}, 90_000);

describe('the calculator’s client decks', () => {
  it('produced every scenario without a page error', () => {
    expect(decks.errors).toEqual([]);
    for (const [name, r] of Object.entries(decks.results)) {
      expect(r.drew, `${name} drew nothing`).toBe(true);
      expect(r.guard, `${name} tripped the runtime guard`).toBe('passed');
      expect(r.pages, `${name} has no body page after the cover`).toBeGreaterThanOrEqual(2);
    }
  });

  it('leaks nothing on the forbidden list, in any scenario', () => {
    for (const [name, r] of Object.entries(decks.results)) {
      const text = pdfText(r.bytes);
      for (const [re, why] of FORBIDDEN) {
        const hit = re.exec(text);
        expect(hit === null, `${name} leaked "${hit?.[0]}" — ${why}`).toBe(true);
      }
    }
  });

  it('is redacting rather than starved: the internal report does carry that content', () => {
    /*
     * The load-bearing test. A deck could pass the check above by being empty, or by being
     * built from state that never held the sensitive figures. Pairing each deck with the
     * internal report generated from identical state proves the content existed and was
     * deliberately left out.
     */
    const q = pdfText(decks.results.qualifyWeak!.internalBytes);
    expect(q).toMatch(/\d+\s*\/\s*100/);
    expect(q).toMatch(/Tier C/);
    expect(q).toMatch(/Internal Use Only/i);
    expect(q).toMatch(/Weighted/i);

    const f = pdfText(decks.results.forgeTrack!.internalBytes);
    expect(f).toMatch(/say this exactly/i);

    const r = pdfText(decks.results.reviewDowngrade!.internalBytes);
    expect(r).toMatch(/Downgrade/);
    expect(r).toMatch(/Payment/i);
  });

  it('names the client on every page after the cover, and never the internal mark', () => {
    for (const [name, res] of Object.entries(decks.results)) {
      const text = pdfText(res.bytes);
      expect(text, `${name} is unaddressed`).toContain('Glow Beauty Sdn Bhd');
      expect(text).toContain('Prepared by EcomForges for Glow Beauty Sdn Bhd');
    }
  });

  it('turns a Pause or Exit decision into a summary, not an announcement', () => {
    /*
     * Ending an engagement is a conversation. A PDF that lands in an inbox announcing it
     * removes the chance to have that conversation, and states the terms in our words rather
     * than agreed ones. So the deck for those outcomes records the work instead.
     */
    const text = pdfText(decks.results.reviewExit!.bytes);
    expect(text).toContain('What we did together, and what');
    expect(text).toContain('stays with you');
    expect(text).not.toMatch(/\bexit the engagement\b/i);
    expect(text).not.toMatch(/\bclosing the engagement\b/i);
    expect(text).not.toMatch(/\bwe are pausing\b/i);
    // It still tells the truth about the record — it is a summary, not a soft-focus one.
    expect(text).toMatch(/0 of 9 directives executed/);
  });

  it('states a cadence change as a cadence change', () => {
    const text = pdfText(decks.results.reviewDowngrade!.bytes);
    expect(text).toContain('Matching session cadence to');
    expect(text).toMatch(/you move to Lite/);
    expect(text).toMatch(/44%/); // the real execution rate, not a rounded kindness
  });

  it('gives a prospect the areas and the constraint, never the ranking', () => {
    const text = pdfText(decks.results.qualifyWeak!.bytes);
    expect(text).toContain('What we reviewed');
    expect(text).toContain('What we would work on first');
    expect(text).toMatch(/Holding you back/);
    // The internal category names grade the reader; the deck renames them as subjects.
    expect(text).toContain('Order fulfilment and stock');
    expect(text).not.toContain('Operational Readiness');
    expect(text).not.toContain('Revenue & Commercial Traction');
  });

  it('gives a client the pressure readings without the arithmetic that ranked them', () => {
    const text = pdfText(decks.results.forgeTrack!.bytes);
    expect(text).toContain('Pressure by area');
    expect(text).toContain('Your 30-day sprint');
    // Impact weights and the pressure x impact score are how we choose. Publishing them
    // invites a negotiation about the weights instead of the work.
    expect(text).not.toMatch(/\b1\.00\b|\b0\.85\b|\b0\.80\b|\b0\.70\b/);
    expect(text).not.toMatch(/Track ranking/i);
    expect(text).not.toMatch(/pressure × revenue impact/i);
  });

  it('runs a stabilisation cycle rather than inventing a track', () => {
    const text = pdfText(decks.results.forgeBlocked!.bytes);
    expect(text).toContain('Resolve operations first');
    expect(text).toContain('What unlocks the next cycle');
    expect(text).not.toContain('Your 30-day sprint');
  });
});

describe('the analyst’s client deck', () => {
  let out: Awaited<ReturnType<typeof runAnalystDeck>>;

  beforeAll(async () => {
    out = await runAnalystDeck();
  }, 90_000);

  it('drives the whole paste-back loop without a page error', () => {
    expect(out.errors).toEqual([]);
  });

  it('refuses to build a deck before the model’s reply has been checked', () => {
    expect(out.results.deckWithoutProse.text).toMatch(/Check the reply/);
    expect(out.results.capturedWithoutProse).toBeNull();
  });

  it('rejects a reply that invented a figure, and names the figure', () => {
    /*
     * The manual route exists because a browser cannot hold an API key. It must not therefore
     * become the unguarded route: the same validator the API path runs is applied to what the
     * consultant pastes.
     */
    expect(out.results.badProse.text).toMatch(/7\.45 does not appear in the supplied data/);
    expect(out.results.capturedAfterBadProse).toBeNull();
  });

  it('accepts a reply whose figures all came from the computed payload', () => {
    expect(out.results.goodProse.text).toMatch(/Every figure in the reply appears/);
    expect(out.results.deckStatus.text).toMatch(/downloaded/);
    expect(out.results.deck).not.toBeNull();
  });

  it('will not put an unaddressed deck on the clipboard either', () => {
    expect(out.results.deckWithoutName.text).toMatch(/business name/);
  });

  it('carries the finding, the three directives and the money', () => {
    const text = pdfText(out.results.deck!.bytes);
    expect(text).toContain('The finding');
    expect(text).toContain('Traffic is not the problem');
    expect(text).toContain('Your 30-day sprint');
    for (const phase of ['FIX', 'RUN', 'OPTIMISE']) expect(text).toContain(phase);
    expect(text).toMatch(/ON THE TABLE/);
    // Money reads as money: separators throughout, cents kept below RM1,000.
    expect(text).toMatch(/RM206,870/);
    expect(text).toMatch(/RM68\.50/);
    expect(text).not.toMatch(/RM68\.5\b/);
  });

  it('uses the business name and never the internal client code', () => {
    const text = pdfText(out.results.deck!.bytes);
    expect(text).toContain('Glow Beauty Sdn Bhd');
    expect(text).not.toContain('MY-BTY-09');
    for (const [re, why] of FORBIDDEN) {
      const hit = re.exec(text);
      expect(hit === null, `analyst deck leaked "${hit?.[0]}" — ${why}`).toBe(true);
    }
  });

  it('names the metric for its reader instead of using our shorthand', () => {
    const text = pdfText(out.results.deck!.bytes);
    expect(text).toContain('The one number that matters: conversion rate');
  });

  it('drops the scoring consequence from a gap but keeps the channel it is about', () => {
    /*
     * The engine writes gaps for the consultant, so most end in a clause about what cannot be
     * scored. That clause is jargon in a client document — but dropping the whole sentence
     * takes the channel name with it and leaves an ask that does not say which store it means.
     */
    const text = pdfText(out.results.deck!.bytes);
    expect(text).toContain('What we need from you');
    expect(text).toContain('Shopee: AOV trend not supplied');
    expect(text).not.toMatch(/cannot be scored/i);
    expect(text).not.toMatch(/no track activates/i);
    // The genuinely client-facing half of the same gap survives intact.
    expect(text).toMatch(/Why did 118 Lazada orders cancel/);
  });
});

describe('the two tools share one PDF implementation', () => {
  it('the shared block in analyst.html is byte-identical to the calculator’s', () => {
    /*
     * The block is extracted at build time rather than copied, so the document language cannot
     * fork. This asserts the extraction actually landed: a stale analyst.html would otherwise
     * keep writing decks in an older layout, and nothing else would notice.
     */
    const START = '/* ══ SHARED-PDF-START ══';
    const END = '/* ══ SHARED-PDF-END ══ */';
    const cut = (s: string) => {
      const a = s.indexOf(START), b = s.indexOf(END);
      expect(a, 'START sentinel missing').toBeGreaterThan(-1);
      expect(b, 'END sentinel missing').toBeGreaterThan(a);
      return s.slice(a, b + END.length);
    };
    const calc = cut(readFileSync(join(REPO, 'index.html'), 'utf8'));
    const analyst = cut(readFileSync(join(REPO, 'analyst.html'), 'utf8'));
    expect(analyst).toBe(calc);
    expect(calc).toContain('function assertClientSafe');
    expect(calc).toContain('DECK_FORBIDDEN');
  });

  it('the shared block reads no calculator state', () => {
    // It receives a `doc` and its arguments. A getElementById in there would work in the
    // calculator and throw in the analyst, on a click, in front of a client.
    const calc = readFileSync(join(REPO, 'index.html'), 'utf8');
    const START = '/* ══ SHARED-PDF-START ══';
    const END = '/* ══ SHARED-PDF-END ══ */';
    const block = calc.slice(calc.indexOf(START), calc.indexOf(END));
    const offenders = block
      .split(/\r?\n/)
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /getElementById|querySelector\(/.test(line))
      // prepareLogo reads the header image by class, which both pages have; that is the one
      // DOM read the block is allowed and the reason it is named here rather than excluded.
      .filter(([, line]) => !line.includes(".brand-logo"));
    expect(offenders).toEqual([]);
  });
});
