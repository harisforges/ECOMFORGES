/**
 * Continuity across visits.
 *
 * Movement and the benchmark ledger only exist to accumulate over time, and time here means
 * separate visits to the page — which is local storage, which unit tests do not have. So this
 * drives the real page: April, then May, then a third and fourth client, in one browser.
 *
 * Requires `npm run build:page`.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { runHistory } from '../scripts/history-probe.mjs';
import { pdfText } from '../scripts/deck-probe.mjs';

let out: Awaited<ReturnType<typeof runHistory>>;

beforeAll(async () => {
  out = await runHistory();
}, 120_000);

describe('movement across periods', () => {
  it('drives both periods without a page error', () => {
    expect(out.errors).toEqual([]);
  });

  it('says nothing on a client’s first ever period', () => {
    // There is no prior period, so there is no claim to make. An empty panel would be a claim.
    expect(out.results.firstRun.hidden).toBe(true);
    expect(out.results.briefHasMovementApril).toBe(false);
  });

  it('survives the tab being closed', () => {
    // The figures come back from storage without pressing Save — the whole point of autosave.
    expect(out.results.restoredAfterReload.code).toBe('MY-BTY-09');
    expect(out.results.restoredAfterReload.periodEnd).toBe('2026-04-30');
  });

  it('reports on the metric the previous brief promised would move', () => {
    const r = out.results.secondRun;
    expect(r.hidden).toBe(false);
    expect(r.pill).toBe('Moved');
    expect(r.sub).toContain('2026-04-01 to 2026-04-30');
    expect(r.body).toContain('Conversion rate on Lazada went up');
    expect(r.body).toContain('(target)');
    expect(out.results.briefHasMovementMay).toBe(true);
  });

  it('prints figures at a readable precision', () => {
    /*
     * Conversion rates arrive as full floats. "3.8700361010830324" beside "4.657039711191336"
     * is unreadable, and it is the table a consultant turns their laptop round to show.
     */
    const b = out.results.secondRun.body;
    expect(b).toContain('3.87');
    expect(b).toContain('4.66');
    expect(b).not.toMatch(/\d\.\d{5,}/);
    expect(b).toContain('206,870'); // money keeps its separators and loses its decimals
  });

  it('says so when a nearer period was skipped for overlapping', () => {
    /*
     * A brief for 15 May to 14 June compares against April, because May overlaps. That is the
     * right comparison — but silently, it reads as a comparison against last month.
     */
    expect(out.results.overlapping.body).toContain('overlaps this period and was skipped');
  });
});

describe('the benchmark ledger', () => {
  const n = (s: string) => /n=(\d)\/3/.exec(s)?.[1];

  it('starts every candidate at one client', () => {
    expect(n(out.results.ledgerOneClient.text)).toBe('1');
    expect(out.results.ledgerOneClient.text).toContain('needs 2 more clients');
  });

  it('does not count the same client twice', () => {
    /*
     * The rule the whole ledger rests on. Three readings of one account is one data point;
     * counting them as three would let the tool manufacture its own evidence.
     */
    expect(n(out.results.ledgerSameClientTwice.text)).toBe('1');
  });

  it('counts a second and third distinct client', () => {
    expect(n(out.results.ledgerTwoClients.text)).toBe('2');
    expect(out.results.ledgerTwoClients.text).toContain('needs 1 more client');
    expect(out.results.ledgerThreeClients.text).toContain('READY');
  });

  it('hands over a benchmarks.md row rather than a figure to retype', () => {
    const t = out.results.ledgerThreeClients.text;
    expect(t).toMatch(/\|\s*Beauty — skincare\s*\|\s*\d+\.\d{2}\s*\|\s*3\s*\|/);
    expect(out.results.ledgerThreeClients.pill).toContain('ready');
  });
});

describe('the client deck', () => {
  it('opens with whether the last cycle’s number moved', () => {
    /*
     * This is the section that makes a monthly retainer defensible: last month we named one
     * number and a date, and here is what happened to it. It goes before the new finding.
     */
    expect(out.results.proseStatus).toMatch(/Every figure in the reply appears/);
    const text = pdfText(out.results.deck!.bytes);
    expect(text).toContain('Since your last review');
    expect(text).toContain('Conversion rate on Lazada went up');
    expect(text.indexOf('Since your last review')).toBeLessThan(text.indexOf('The finding'));
    // Still readable, and still the client's own name rather than the code.
    expect(text).not.toMatch(/\d\.\d{5,}/);
    expect(text).not.toContain('MY-BTY-09');
  });
});
