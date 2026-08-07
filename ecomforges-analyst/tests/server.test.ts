import { describe, expect, it, afterAll } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { createAnalystServer } from '../src/server/index.js';
import { load } from '../src/benchmarks/queue.js';

const dir = mkdtempSync(join(tmpdir(), 'ecomforges-server-'));
const queuePath = join(dir, 'queue.jsonl');

const server = createAnalystServer({ port: 0, queuePath });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

afterAll(() => {
  server.close();
});

const ENGAGEMENT = {
  clientCode: 'MY-BTY-09',
  category: 'Beauty — skincare',
  periodStart: '2026-04-01',
  periodEnd: '2026-04-30',
  platforms: [
    { platform: 'Shopee', sessions: 48200, buyers: 2940, orders: 3020, gmv: 206870, aov: 68.5, organicSharePct: 55, sessionTrendPct: 12, promoRevenuePct: 32, grossMarginPct: 41, roas: 5.2, fulfilment: 'clean' },
    { platform: 'Lazada', sessions: 27700, buyers: 1072, orders: 1090, gmv: 72921, aov: 66.9, organicSharePct: 48, sessionTrendPct: 4, promoRevenuePct: 38, grossMarginPct: 40, roas: 4.1, fulfilment: 'minor-delays', cancelledOrders: 118, cancelledValue: 7900, refundedOrders: 33, refundedValue: 2210, addToCartUsers: 3850 },
  ],
};

const post = (body: unknown) =>
  fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('the form server', () => {
  it('serves a self-contained page with a closed content-security policy', async () => {
    const r = await fetch(base);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('EcomForges Growth Analyst');
    // No external anything, so the CSP can stay closed and the page works offline.
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href="https?:/);
    const csp = r.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('runs the same engine the CLI uses and returns the brief', async () => {
    const r = await post({ engagement: ENGAGEMENT, withProse: false });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { brief: string; track: string; platform: string; gaps: string[] };
    expect(j.brief).toContain('# GROWTH BRIEF — MY-BTY-09');
    expect(j.track).toBe('conversion-forge');
    expect(j.platform).toBe('Lazada');
    expect(j.gaps.length).toBeGreaterThan(0);
  });

  it('never sends the API key to the browser', async () => {
    const html = await (await fetch(base)).text();
    expect(html).not.toMatch(/sk-ant/);
    expect(html).not.toMatch(/ANTHROPIC_API_KEY/);
    // The page's only network call is to this server's own endpoint.
    expect(html).toContain("fetch('/api/generate'");
    expect(html).not.toMatch(/api\.anthropic\.com/);
  });

  it('queues benchmark candidates from a generated brief', async () => {
    await post({ engagement: ENGAGEMENT, withProse: false });
    const queued = load(queuePath);
    expect(queued.length).toBeGreaterThan(0);
    expect(queued.every((q) => q.clientCode === 'MY-BTY-09')).toBe(true);
    // Every queued row carries the engagement that produced it, which is what blocks
    // same-brief promotion later.
    expect(queued.every((q) => q.engagementId === 'MY-BTY-09-2026-04-01')).toBe(true);
  });

  it('does not double-count candidates when the same brief is generated twice', async () => {
    const before = load(queuePath).length;
    await post({ engagement: ENGAGEMENT, withProse: false });
    expect(load(queuePath).length).toBe(before);
  });

  it('rejects a malformed body with 400, not 500', async () => {
    const r = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/not valid JSON/);
  });

  it('rejects an unreadable engagement with 400 and says what was wrong', async () => {
    const r = await post({ engagement: { platforms: [{ platform: 'Amazon' }] } });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/unknown platform/);
  });

  it('404s an unknown path', async () => {
    expect((await fetch(`${base}/admin`)).status).toBe(404);
  });

  it('the page keeps blank inputs out of the payload', () => {
    // A blank field must be absent, not zero: absent becomes a stated gap, zero becomes a
    // claim the client never made.
    const page = readFileSync('src/server/page.ts', 'utf8');
    expect(page).toContain("if (v === '') return;");
  });
});
