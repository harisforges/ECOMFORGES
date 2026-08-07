import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { lookup, parseBenchmarks } from '../src/benchmarks/parse.js';

/**
 * The shipped template's struck-through example row (Shopee / skincare / 2.4% CVR) is the
 * single most dangerous string in the repository: returned once, it becomes a fabricated
 * benchmark inside a client deliverable. These tests exist to keep it out.
 */
const TEMPLATE_PATH = '../analyst/benchmarks.md';

describe('benchmark parser', () => {
  it('yields zero usable benchmarks from the shipped empty template', () => {
    if (!existsSync(TEMPLATE_PATH)) return; // repo layout differs; the synthetic tests still cover it
    const parsed = parseBenchmarks(readFileSync(TEMPLATE_PATH, 'utf8'), { asOf: '2026-08' });
    expect(parsed.rows).toHaveLength(0);
    // Specifically: the struck-through example must not appear anywhere in the results.
    const all = [...parsed.rows, ...parsed.rejected];
    expect(all.some((r) => r.rawValue.includes('2.4'))).toBe(false);
    expect(lookup(parsed, 'Shopee', 'Beauty — skincare', 'CVR').found).toBe(false);
  });

  it('discards a struck-through row even when it is otherwise valid', () => {
    const md = `
## Conversion rate (CVR)

| Platform | Category | Median CVR | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| ~~Shopee~~ | ~~Beauty — skincare~~ | ~~2.4%~~ | ~~4~~ | ~~30d~~ | ~~2026-07~~ | ~~MY-BTY-01~~ |
`;
    const parsed = parseBenchmarks(md, { asOf: '2026-08' });
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.rejected).toHaveLength(0);
  });

  it('discards placeholder rows', () => {
    const md = `
## Conversion rate (CVR)

| Platform | Category | Median CVR | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| _(empty)_ | | | | | | |
`;
    expect(parseBenchmarks(md, { asOf: '2026-08' }).rows).toHaveLength(0);
  });

  it('records n=2 but refuses to make it usable', () => {
    const md = `
## Conversion rate (CVR)

| Platform | Category | Median CVR | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| Shopee | Beauty — skincare | 2.9% | 2 | 30d | 2026-07 | MY-BTY-01/03 |
`;
    const parsed = parseBenchmarks(md, { asOf: '2026-08' });
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.rejected).toHaveLength(1);
    expect(parsed.rejected[0]!.unusableReason).toMatch(/n=2/);
    expect(parsed.rejected[0]!.unusableReason).toMatch(/one client is not a category/);

    const miss = lookup(parsed, 'Shopee', 'Beauty — skincare', 'CVR');
    expect(miss.found).toBe(false);
    if (!miss.found) expect(miss.reason).toBe('n-too-low');
  });

  it('marks a 2023 row stale against a 2026 period', () => {
    const md = `
## Conversion rate (CVR)

| Platform | Category | Median CVR | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| Shopee | Beauty — skincare | 2.9% | 5 | 30d | 2023-11 | MY-BTY-01/02/03/04/05 |
`;
    const parsed = parseBenchmarks(md, { asOf: '2026-04' });
    expect(parsed.rows).toHaveLength(0);
    const miss = lookup(parsed, 'Shopee', 'Beauty — skincare', 'CVR');
    if (!miss.found) {
      expect(miss.reason).toBe('stale');
      expect(miss.detail).toMatch(/stale/);
    }
  });

  it('accepts a usable row and cites it by rowId', () => {
    const md = `
## Conversion rate (CVR)

| Platform | Category | Median CVR | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| Shopee | Beauty — skincare | 2.9% | 4 | 30d | 2026-03 | MY-BTY-01/02/03/04 |
`;
    const parsed = parseBenchmarks(md, { asOf: '2026-04' });
    expect(parsed.rows).toHaveLength(1);
    const hit = lookup(parsed, 'Shopee', 'Beauty — skincare', 'CVR');
    expect(hit.found).toBe(true);
    if (hit.found) {
      expect(hit.row.value).toBe(2.9);
      expect(hit.row.rowId).toContain('shopee');
      expect(hit.row.rowId).toContain('2026-03');
    }
  });

  it('keeps internal thresholds out of benchmark lookup', () => {
    const md = `
## Conversion rate (CVR)

| Platform | Category | Median CVR | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| _(empty)_ | | | | | | |

## Internal decision thresholds — these are NOT benchmarks

| Rule | Threshold |
|---|---|
| CVR ratio → Stable / Medium / High / Critical | ≥1.00 / ≥0.85 / ≥0.65 / below 0.65 |
| Organic share counted as "thin" | below 30% |
| Promo dependency → Stable / Medium / High / Critical | <40% / <60% / <75% / ≥75% |
| Gross margin → Stable / Medium / High / Critical | ≥35% / ≥25% / ≥20% / below 20% |
| ROAS that raises Profitability pressure by one level | below 2.0 |
| Revenue impact weights | Conversion 1.00 · Traffic 0.85 · Campaign 0.80 · Basket 0.70 |
`;
    const parsed = parseBenchmarks(md, { asOf: '2026-04' });
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.rejected).toHaveLength(0);
    // Parsed into thresholds, not into rows.
    expect(parsed.thresholds.cvrRatio).toEqual({ stable: 1.0, medium: 0.85, high: 0.65 });
    expect(parsed.thresholds.organicThinBelowPct).toBe(30);
    expect(parsed.thresholds.promoDependency).toEqual({ stable: 40, medium: 60, high: 75 });
    expect(parsed.thresholds.grossMargin).toEqual({ stable: 35, medium: 25, high: 20 });
    expect(parsed.thresholds.roasStepUpBelow).toBe(2.0);
    expect(parsed.thresholds.impact).toEqual({
      conversion: 1.0,
      traffic: 0.85,
      campaign: 0.8,
      basket: 0.7,
    });
  });

  it('ignores the retired-figures table', () => {
    const md = `
## Retired figures

| Platform | Category | Metric | Value | Retired on | Why |
|---|---|---|---|---|---|
| Shopee | Beauty — skincare | CVR | 4.4% | 2026-01 | superseded |
`;
    const parsed = parseBenchmarks(md, { asOf: '2026-04' });
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.rejected).toHaveLength(0);
  });
});
