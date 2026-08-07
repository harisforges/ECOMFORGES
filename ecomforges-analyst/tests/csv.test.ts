import { describe, expect, it } from 'vitest';
import { parseCell, parseCsv, proposeMapping, readCsv } from '../src/intake/csv.js';
import { confirm, UnconfirmedIntakeError } from '../src/intake/pending.js';
import { analyse } from '../src/engine/pipeline.js';
import { DEFAULT_THRESHOLDS } from '../src/benchmarks/parse.js';

const EMPTY = { rows: [], rejected: [], thresholds: DEFAULT_THRESHOLDS };
const opts = { platform: 'Lazada' as const, clientCode: 'MY-BTY-09', category: 'Beauty — skincare' };

/** Real Lazada Business Advisor column names. */
const LAZADA = [
  'Date,Revenue,Visitors,Buyers,Orders,Pageviews,Units Sold,Conversion Rate,Average Order Value,Add to Cart Users,Wishlist Users,Cancelled Amount,Return/Refund Amount',
  '2026-04-01~2026-04-30,72921.00,27700,1072,1090,95952,1955,3.87%,66.90,3850,766,7900.00,2210.00',
  '2026-04-01,1536.60,1403,10,10,2484,20,0.71%,153.66,61,8,150.10,176.11',
  '2026-04-02,1801.85,1101,16,16,1918,31,1.45%,112.62,50,10,362.63,0.00',
].join('\n');

describe('csv parsing', () => {
  it('handles quoted fields, escaped quotes, and CRLF', () => {
    const rows = parseCsv('a,b\r\n"1,234","he said ""hi"""\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1,234', 'he said "hi"'],
    ]);
  });

  it('parses thousands separators, currency, and percentages', () => {
    expect(parseCell('1,234.56')).toBe(1234.56);
    expect(parseCell('6.33%')).toBe(6.33);
    expect(parseCell('RM 89.00')).toBe(89);
  });

  it('returns null rather than zero for an unreadable cell', () => {
    expect(parseCell('')).toBeNull();
    expect(parseCell('-')).toBeNull();
    expect(parseCell('n/a')).toBeNull();
  });
});

describe('column mapping', () => {
  it('maps real Lazada column names', () => {
    const p = proposeMapping(LAZADA.split('\n')[0]!.split(','));
    const m = (field: string) => p.mappings.find((x) => x.field === field)?.column;
    expect(m('gmv')).toBe('Revenue');
    expect(m('sessions')).toBe('Visitors');
    expect(m('buyers')).toBe('Buyers');
    expect(m('orders')).toBe('Orders');
    expect(m('headlineCvr')).toBe('Conversion Rate');
    expect(m('aov')).toBe('Average Order Value');
    expect(m('addToCartUsers')).toBe('Add to Cart Users');
    expect(m('cancelledValue')).toBe('Cancelled Amount');
    expect(m('refundedValue')).toBe('Return/Refund Amount');
  });

  it('prefers Visitors over Pageviews for sessions without asking', () => {
    const p = proposeMapping(['Visitors', 'Pageviews']);
    expect(p.mappings.find((m) => m.field === 'sessions')?.column).toBe('Visitors');
    expect(p.ignored).toContain('Pageviews');
    expect(p.questions).toHaveLength(0);
  });

  it('asks when Shopee ships two sales columns of equal strength', () => {
    // Sales (MYR) is gross; the rebate-excluded column is net. Both are strength-3 revenue
    // candidates, and picking the wrong one silently changes every derived figure.
    const p = proposeMapping(['Date', 'Sales (MYR)', 'Revenue', 'Orders']);
    const q = p.questions.find((x) => x.about === 'gmv');
    expect(q).toBeDefined();
    expect(q!.options).toEqual(expect.arrayContaining(['Sales (MYR)', 'Revenue']));
    expect(p.mappings.some((m) => m.field === 'gmv')).toBe(false);
  });

  it('notes the rebate-excluded column rather than mapping it silently', () => {
    const p = proposeMapping(['Sales (Shopee Rebate and Coins excluded)', 'Orders']);
    const gmv = p.mappings.find((m) => m.field === 'gmv');
    expect(gmv?.note).toMatch(/net of Shopee-funded rebate/);
  });

  it('asks about TikTok’s "Items refunded", which holds money despite its name', () => {
    const p = proposeMapping(['GMV', 'Orders', 'Items refunded']);
    const q = p.questions.find((x) => x.about === 'Items refunded');
    expect(q).toBeDefined();
    expect(q!.question).toMatch(/ringgit value/);
  });

  it('refuses to treat Units sold or SKU orders as orders', () => {
    const p = proposeMapping(['GMV', 'Units Sold', 'SKU orders']);
    expect(p.mappings.some((m) => m.field === 'orders')).toBe(false);
    expect(p.questions.map((q) => q.about)).toEqual(
      expect.arrayContaining(['Units Sold', 'SKU orders']),
    );
  });
});

describe('reading a real export', () => {
  const { pending } = readCsv(LAZADA, opts);

  it('uses the period-total row rather than summing rates', () => {
    const gmv = pending.fields.find((f) => f.field === 'gmv');
    expect(gmv?.value).toBe(72921);
    expect(gmv?.source).toMatch(/period-total row/);
    const cvr = pending.fields.find((f) => f.field === 'headlineCvr');
    expect(cvr?.value).toBe(3.87);
  });

  it('reads the period from the total row’s date range', () => {
    expect(pending.engagement?.periodStart.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(pending.engagement?.periodEnd.toISOString().slice(0, 10)).toBe('2026-04-30');
  });

  it('states the mapping back before anything is analysed', () => {
    expect(pending.echo).toContain('COLUMN MAPPING');
    expect(pending.echo).toContain('"Revenue" → **gmv**');
    expect(pending.echo).toContain('check this against the export');
  });

  it('produces an engagement the engine accepts unchanged', () => {
    const e = confirm(pending, true);
    const a = analyse(e, EMPTY);
    expect(a.platforms).toHaveLength(1);
    expect(a.platforms[0]!.data.platform).toBe('Lazada');
  });
});

describe('the confirmation gate', () => {
  it('blocks analysis while a mapping question is open', () => {
    const csv = ['Date,Sales (MYR),Revenue,Orders', '2026-04-01,100,100,2'].join('\n');
    const { pending } = readCsv(csv, opts);
    expect(pending.questions.length).toBeGreaterThan(0);
    expect(pending.engagement).toBeUndefined();
    expect(() => confirm(pending, true)).toThrow(UnconfirmedIntakeError);
  });

  it('lets an answer resolve the ambiguity and then proceeds', () => {
    const csv = ['Date,Sales (MYR),Revenue,Orders', '2026-04-01,100,999,2'].join('\n');
    const { pending } = readCsv(csv, { ...opts, answers: { gmv: 'Sales (MYR)' } });
    expect(pending.questions).toHaveLength(0);
    const gmv = pending.fields.find((f) => f.field === 'gmv');
    expect(gmv?.value).toBe(100); // the answered column, not the other one
    expect(() => confirm(pending, true)).not.toThrow();
  });

  it('sums additive columns when there is no period-total row', () => {
    const csv = [
      'Date,Revenue,Visitors,Buyers,Orders',
      '2026-04-01,100,1000,10,10',
      '2026-04-02,200,2000,20,20',
    ].join('\n');
    const { pending } = readCsv(csv, opts);
    const gmv = pending.fields.find((f) => f.field === 'gmv');
    expect(gmv?.value).toBe(300);
    expect(gmv?.source).toMatch(/summed over 2 rows/);
  });

  it('reports a rate it cannot compute rather than averaging daily rows', () => {
    const csv = [
      'Date,Revenue,Visitors,Buyers,Orders,Conversion Rate',
      '2026-04-01,100,1000,10,10,1.00%',
      '2026-04-02,200,2000,20,20,1.00%',
    ].join('\n');
    const { pending } = readCsv(csv, opts);
    const cvr = pending.fields.find((f) => f.field === 'headlineCvr');
    expect(cvr?.value).toBeNull();
    expect(cvr?.illegible).toMatch(/cannot be summed/);
  });

  it('derives AOV when the export omits it, and says so', () => {
    const csv = ['Date,Revenue,Visitors,Buyers,Orders', '2026-04-01,1000,500,20,20'].join('\n');
    const { pending } = readCsv(csv, opts);
    const aov = pending.fields.find((f) => f.field === 'aov');
    expect(aov?.value).toBe(50);
    expect(aov?.source).toMatch(/computed as GMV ÷ orders/);
  });

  it('asks for the period when there is no date column', () => {
    const csv = ['Revenue,Visitors,Buyers,Orders', '1000,500,20,20'].join('\n');
    const { pending } = readCsv(csv, opts);
    expect(pending.questions.map((q) => q.about)).toContain('period');
    expect(pending.engagement).toBeUndefined();
  });
});
