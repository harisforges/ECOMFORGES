/**
 * Drive the analyst page end to end and read the client deck back.
 *
 * This covers the whole manual loop the consultancy actually uses: type the figures, generate
 * the brief, paste what the Claude Project replied, let the page check every figure in that
 * reply against the computed data, then build the deck. The interesting cases are the two
 * refusals — a reply carrying an invented number, and a deck asked for before any reply was
 * checked — because those are what protect a document a client acts on.
 *
 *   node scripts/analyst-deck-probe.mjs [outDir]
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pdfText } from './deck-probe.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

/** Two channels of one catalogue: the shape that makes an internal benchmark available. */
export const ENGAGEMENT = {
  clientCode: 'MY-BTY-09',
  category: 'Beauty — skincare',
  periodStart: '2026-04-01',
  periodEnd: '2026-04-30',
  platforms: [
    { platform: 'Shopee', sessions: 48200, buyers: 2940, orders: 3020, gmv: 206870, aov: 68.5,
      organicSharePct: 55, sessionTrendPct: 12, promoRevenuePct: 32, grossMarginPct: 41,
      roas: 5.2, fulfilment: 'clean' },
    { platform: 'Lazada', sessions: 27700, buyers: 1072, orders: 1090, gmv: 72921, aov: 66.9,
      organicSharePct: 48, sessionTrendPct: 4, promoRevenuePct: 38, grossMarginPct: 40,
      roas: 4.1, fulfilment: 'minor-delays', cancelledOrders: 118, cancelledValue: 7900,
      refundedOrders: 33, refundedValue: 2210, addToCartUsers: 3850 },
  ],
};

function serve() {
  return createServer((req, res) => {
    const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).slice(1);
    const p = join(REPO, rel);
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[p.slice(p.lastIndexOf('.'))] ?? 'application/octet-stream' });
    res.end(readFileSync(p));
  });
}

export async function runAnalystDeck() {
  const server = serve();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/analyst.html`, { waitUntil: 'networkidle' });

  /* Type the figures into the real inputs rather than injecting state, so the form's own
     read path — including the rule that a blank field stays out of the payload — is exercised. */
  await page.evaluate((eng) => {
    document.getElementById('code').value = eng.clientCode;
    document.getElementById('cat').value = eng.category;
    document.getElementById('ps').value = eng.periodStart;
    document.getElementById('pe').value = eng.periodEnd;
    const plats = document.getElementById('plats');
    while (plats.children.length < eng.platforms.length) document.getElementById('add').click();
    eng.platforms.forEach((p, i) => {
      const card = plats.children[i];
      Object.keys(p).forEach((k) => {
        const el = card.querySelector('[data-k="' + k + '"]');
        if (el) el.value = String(p[k]);
      });
    });
  }, ENGAGEMENT);
  await page.click('#go');
  await page.waitForFunction(() => !document.getElementById('view-brief').hidden);

  /*
   * The payload the page is holding, obtained through the same public entry point the page
   * itself uses. Building the test's replies out of these figures is the point: a reply whose
   * numbers came from the payload must pass, and one carrying anything else must not.
   */
  const payload = await page.evaluate(
    (eng) => JSON.parse(window.Forge.run({ engagement: eng }).payload), ENGAGEMENT);

  const lz = payload.platforms.find((p) => p.platform === 'Lazada');
  const sh = payload.platforms.find((p) => p.platform === 'Shopee');
  const goodReply = {
    finding:
      `Traffic is not the problem. Lazada takes ${lz.sessions} visitors and converts ` +
      `${lz.normalisedCvrPct.toFixed(2)}% of them, against ${sh.normalisedCvrPct.toFixed(2)}% on ` +
      `Shopee for the same catalogue at a higher average order value.`,
    sprint: {
      fix: { directive: 'Copy the Shopee listing images and copy for your top 10 products onto Lazada, unchanged.',
             hypothesis: 'The Lazada listings are the variable, not the audience.' },
      run: { directive: `Send a 7-day voucher to the ${lz.addToCartMinusBuyers} shoppers who added ` +
             `to cart on Lazada and did not buy.`, startsIn: '3 days' },
      optimise: { directive: 'Move Lazada ad budget onto the listings you have just rewritten.' },
    },
    highestRoiClaim: false,
  };
  // The realistic failure: a category benchmark nobody supplied, stated with confidence.
  const badReply = {
    ...goodReply,
    finding: 'Lazada converts at 3.87% against a category average of 7.45% for Malaysian skincare.',
  };

  const statusOf = (id) => page.evaluate((i) => {
    const el = document.getElementById(i);
    return { hidden: el.hidden, text: el.textContent.trim() };
  }, id);

  // Capture the PDF rather than letting the browser download it.
  await page.evaluate(() => {
    PDFKit.Doc.prototype.save = function (name) {
      window.__captured = { name, bytes: Array.from(this.build()), pages: this.pages.length };
      return true;
    };
  });

  const results = {};

  // 1. A deck asked for before any reply has been checked.
  await page.fill('#bizname', 'Glow Beauty Sdn Bhd');
  await page.click('#deck');
  results.deckWithoutProse = await statusOf('deck-status');
  results.capturedWithoutProse = await page.evaluate(() => window.__captured ?? null);

  // 2. A reply with an invented figure: rejected, named, and still no deck.
  await page.fill('#proseback', JSON.stringify(badReply));
  await page.click('#checkprose');
  results.badProse = await statusOf('prose-status');
  await page.click('#deck');
  results.deckAfterBadProse = await statusOf('deck-status');
  results.capturedAfterBadProse = await page.evaluate(() => window.__captured ?? null);

  // 3. A clean reply passes, and the deck builds.
  await page.fill('#proseback', JSON.stringify(goodReply));
  await page.click('#checkprose');
  results.goodProse = await statusOf('prose-status');
  await page.click('#deck');
  results.deckStatus = await statusOf('deck-status');
  results.deck = await page.evaluate(() => window.__captured ?? null);

  // 4. A deck with no business name on the cover.
  await page.fill('#bizname', '');
  await page.click('#deck');
  results.deckWithoutName = await statusOf('deck-status');

  await browser.close();
  server.close();
  return { results, errors, payload, goodReply };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2];
  const { results, errors } = await runAnalystDeck();
  if (errors.length) console.error('page errors:', errors);
  for (const [k, v] of Object.entries(results)) {
    if (k === 'deck') continue;
    console.log(`\n### ${k}\n`, v);
  }
  if (results.deck) {
    console.log(`\n### deck: ${results.deck.name} (${results.deck.pages} pages)\n`);
    console.log(pdfText(results.deck.bytes));
    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, results.deck.name), Buffer.from(results.deck.bytes));
    }
  } else {
    console.log('\nNO DECK PRODUCED');
  }
}
