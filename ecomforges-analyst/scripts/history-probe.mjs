/**
 * Two consecutive periods through the real page, in one browser session.
 *
 * The point of the movement feature is continuity across visits, and continuity lives in
 * local storage — which unit tests do not have. This runs April, then May, in the same page
 * the consultancy uses, and checks that the second run knows what the first one promised.
 * It also drives the benchmark ledger to n=3 with three different client codes, because the
 * whole value of that counter is that it refuses to count one client three times.
 *
 *   node scripts/history-probe.mjs
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pdfText } from './deck-probe.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const platforms = (lazadaBuyers, lazadaGmv) => [
  { platform: 'Shopee', sessions: 48200, buyers: 2940, orders: 3020, gmv: 206870, aov: 68.5,
    organicSharePct: 55, sessionTrendPct: 12, promoRevenuePct: 32, grossMarginPct: 41,
    roas: 5.2, fulfilment: 'clean' },
  { platform: 'Lazada', sessions: 27700, buyers: lazadaBuyers, orders: lazadaBuyers + 20,
    gmv: lazadaGmv, aov: 66.9, organicSharePct: 48, sessionTrendPct: 4, promoRevenuePct: 38,
    grossMarginPct: 40, roas: 4.1, fulfilment: 'minor-delays', cancelledOrders: 118,
    cancelledValue: 7900, refundedOrders: 33, refundedValue: 2210, addToCartUsers: 3850 },
];

const APRIL = { clientCode: 'MY-BTY-09', category: 'Beauty — skincare',
  periodStart: '2026-04-01', periodEnd: '2026-04-30', platforms: platforms(1072, 72921) };
// Lazada converts better in May: the metric April's brief promised would move.
const MAY = { clientCode: 'MY-BTY-09', category: 'Beauty — skincare',
  periodStart: '2026-05-01', periodEnd: '2026-05-31', platforms: platforms(1290, 87500) };
// A different client, same category — this is what makes a benchmark candidate count twice.
const OTHER = (code) => ({ clientCode: code, category: 'Beauty — skincare',
  periodStart: '2026-05-01', periodEnd: '2026-05-31', platforms: platforms(1150, 78000) });

function serve() {
  return createServer((req, res) => {
    const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).slice(1);
    const p = join(REPO, rel);
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[p.slice(p.lastIndexOf('.'))] ?? 'application/octet-stream' });
    res.end(readFileSync(p));
  });
}

/** Fill the form and press Generate, exactly as a person would. */
async function generate(page, eng) {
  await page.evaluate((e) => {
    document.getElementById('code').value = e.clientCode;
    document.getElementById('cat').value = e.category;
    document.getElementById('ps').value = e.periodStart;
    document.getElementById('pe').value = e.periodEnd;
    const plats = document.getElementById('plats');
    while (plats.children.length > e.platforms.length) document.getElementById('rm').click();
    while (plats.children.length < e.platforms.length) document.getElementById('add').click();
    e.platforms.forEach((p, i) => {
      const card = plats.children[i];
      Object.keys(p).forEach((k) => {
        const el = card.querySelector('[data-k="' + k + '"]');
        if (el) el.value = String(p[k]);
      });
    });
  }, eng);
  await page.click('#go');
  await page.waitForFunction(() => !document.getElementById('view-brief').hidden);
}

const panel = (page) => page.evaluate(() => ({
  hidden: document.getElementById('movement-card').hidden,
  pill: document.getElementById('movement-pill').textContent.trim(),
  sub: document.getElementById('movement-sub').textContent.trim(),
  body: document.getElementById('movement-body').textContent.replace(/\s+/g, ' ').trim(),
}));

export async function runHistory() {
  const server = serve();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/analyst.html`, { waitUntil: 'networkidle' });

  const results = {};

  // 1. First ever period for this client: nothing to compare against.
  await generate(page, APRIL);
  results.firstRun = await panel(page);
  results.briefHasMovementApril = await page.evaluate(() =>
    document.getElementById('brief').textContent.includes('MOVEMENT SINCE LAST PERIOD'));

  // 2. Reload the page entirely — continuity has to survive a closed tab, which is the
  //    whole reason this lives in storage rather than in a variable.
  await page.reload({ waitUntil: 'networkidle' });
  results.restoredAfterReload = await page.evaluate(() => ({
    code: document.getElementById('code').value,
    periodEnd: document.getElementById('pe').value,
  }));

  // 3. The next period. It should know what April promised.
  await generate(page, MAY);
  results.secondRun = await panel(page);
  results.briefHasMovementMay = await page.evaluate(() =>
    document.getElementById('brief').textContent.includes('MOVEMENT SINCE LAST PERIOD'));

  // 4. An overlapping period must be refused, not silently compared.
  await generate(page, { ...MAY, periodStart: '2026-05-15', periodEnd: '2026-06-14' });
  results.overlapping = await panel(page);

  // 5. The ledger: three distinct clients before anything is promotable.
  const ledgerAfter = async () => page.evaluate(() => ({
    pill: document.getElementById('cand-pill').textContent.trim(),
    text: document.getElementById('ledger').textContent.replace(/\s+/g, ' ').trim(),
  }));
  results.ledgerOneClient = await ledgerAfter();
  // Re-running the same client must not make it look like a second one.
  await generate(page, MAY);
  results.ledgerSameClientTwice = await ledgerAfter();
  await generate(page, OTHER('MY-BTY-11'));
  results.ledgerTwoClients = await ledgerAfter();
  await generate(page, OTHER('MY-BTY-12'));
  results.ledgerThreeClients = await ledgerAfter();

  // 6. The deck leads with the movement, when there is one.
  await generate(page, MAY);
  const deck = await page.evaluate(async () => {
    PDFKit.Doc.prototype.save = function (name) {
      window.__captured = { name, bytes: Array.from(this.build()), pages: this.pages.length };
      return true;
    };
    const payload = JSON.parse(document.getElementById('brief').textContent) ?? null;
    return payload;
  }).catch(() => null);
  void deck;

  const reply = await page.evaluate((eng) => {
    const p = JSON.parse(window.Forge.run({ engagement: eng }).payload);
    const lz = p.platforms.find((x) => x.platform === 'Lazada');
    const sh = p.platforms.find((x) => x.platform === 'Shopee');
    return JSON.stringify({
      finding: `Lazada converts ${lz.normalisedCvrPct.toFixed(2)}% against ` +
        `${sh.normalisedCvrPct.toFixed(2)}% on Shopee for the same catalogue.`,
      sprint: {
        fix: { directive: 'Copy the Shopee listing images onto Lazada, unchanged.' },
        run: { directive: `Send a 7-day voucher to the ${lz.addToCartMinusBuyers} shoppers who added to cart and did not buy.` },
        optimise: { directive: 'Move Lazada ad budget onto those listings.' },
      },
      highestRoiClaim: false,
    });
  }, MAY);

  await page.fill('#proseback', reply);
  await page.click('#checkprose');
  results.proseStatus = await page.evaluate(() =>
    document.getElementById('prose-status').textContent.trim());
  await page.fill('#bizname', 'Glow Beauty Sdn Bhd');
  await page.click('#deck');
  results.deck = await page.evaluate(() => window.__captured ?? null);

  await browser.close();
  server.close();
  return { results, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { results, errors } = await runHistory();
  if (errors.length) console.error('page errors:', errors);
  for (const [k, v] of Object.entries(results)) {
    if (k === 'deck') continue;
    console.log(`\n### ${k}\n`, v);
  }
  if (results.deck) {
    console.log(`\n### deck (${results.deck.pages} pages)\n`);
    console.log(pdfText(results.deck.bytes).slice(0, 1800));
  } else {
    console.log('\nNO DECK');
  }
}
