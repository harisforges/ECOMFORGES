/**
 * Generate every client deck in a real browser and read the PDFs back.
 *
 * The redaction boundary is the whole point of the deck layer, and it cannot be checked by
 * reading source: the question is what ended up in the finished file. So this drives the
 * actual page, builds each deck, extracts the text out of the PDF bytes, and hands back both
 * the text and the bytes. `tests/deck.test.ts` asserts against it; run this file directly to
 * eyeball the output or to write sample PDFs out for review.
 *
 *   node scripts/deck-probe.mjs [outDir]
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

/** Enough of a scorecard to produce each verdict we need to test. */
export const SCENARIOS = {
  // A strong prospect and a weak one: the deck must read differently without ever scoring them.
  qualifyStrong: { stage: 'qualify', fill: 'high' },
  qualifyWeak: { stage: 'qualify', fill: 'low' },
  // Conversion pressure, and an operations blocker, which suppresses every track.
  forgeTrack: { stage: 'forge', press: { traffic: 0, cvr: 3, basket: 1, campaign: 1, operations: 0, profit: 0 } },
  forgeBlocked: { stage: 'forge', press: { traffic: 1, cvr: 2, basket: 1, campaign: 1, operations: 3, profit: 0 } },
  // Healthy, and the three outcomes whose language is most dangerous to publish.
  reviewHealthy: { stage: 'review', cycles: [['3', 'above'], ['3', 'on'], ['3', 'above']] },
  reviewCoach: { stage: 'review', cycles: [['2', 'on'], ['1', 'below'], ['2', 'on']] },
  reviewDowngrade: { stage: 'review', cycles: [['1', 'below'], ['1', 'below'], ['2', 'on']] },
  reviewExit: { stage: 'review', cycles: [['0', 'below'], ['0', 'below'], ['0', 'below']] },
};

function serve() {
  const server = createServer((req, res) => {
    const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).slice(1);
    const p = join(REPO, rel);
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[p.slice(p.lastIndexOf('.'))] ?? 'application/octet-stream' });
    res.end(readFileSync(p));
  });
  return server;
}

/**
 * Pull the drawn strings out of a PDF's content streams.
 *
 * PDFKit writes uncompressed streams and every glyph run as `(text) Tj`, so the text can be
 * recovered without a PDF library. That matters: a library would be a second implementation
 * of the same assumptions, and the point here is to read what a client's PDF viewer reads.
 */
export function pdfText(bytes) {
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  const out = [];
  for (const m of raw.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
    out.push(unwinansi(m[1].replace(/\\([()\\])/g, '$1')));
  }
  return out.join('\n');
}

/*
 * Undo the writer's WinAnsi mapping.
 *
 * Without this, "This cycle’s focus" comes back with an invisible 0x92 where the apostrophe
 * was, and any assertion or forbidden-token scan against the extracted text would be reading
 * something no human ever sees. A curly quote must not be a way past a check.
 */
const WINANSI = { 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
                  0x96: '–', 0x97: '—', 0x99: '™', 0xA9: '©', 0xB7: '·', 0xD7: '×' };
function unwinansi(s) {
  return s.replace(/[\u0080-\u00ff]/g, (ch) => WINANSI[ch.charCodeAt(0)] ?? ch);
}

export async function collectDecks() {
  const server = serve();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });

  const results = {};
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    results[name] = await page.evaluate((scenario) => {
      /* Reset shared state between scenarios; these are module-level objects in the page. */
      Object.keys(picks).forEach((k) => delete picks[k]);
      Object.keys(flags).forEach((k) => delete flags[k]);
      Object.keys(press).forEach((k) => delete press[k]);

      if (scenario.stage === 'qualify') {
        // Pick the best or worst option in every group, so every category is complete.
        MODEL.forEach((cat) => cat.groups.forEach((g) => {
          const scores = g.opts.map((o) => o[1]);
          picks[`${cat.id}.${g.id}`] = scenario.fill === 'high' ? Math.max(...scores) : Math.min(...scores);
        }));
        document.getElementById('cl-name').value = 'Glow Beauty Sdn Bhd';
        document.getElementById('cl-date').value = '2026-08-12';
      } else if (scenario.stage === 'forge') {
        Object.assign(press, scenario.press);
        document.getElementById('fk-name').value = 'Glow Beauty Sdn Bhd';
        document.getElementById('fk-date').value = '2026-08-12';
      } else {
        cycles.length = 0;
        scenario.cycles.forEach(([ex, kpi]) => cycles.push({
          exec: ex, kpi, attend: 'yes', dep: '0', pay: 'ontime',
        }));
        document.getElementById('rv-name').value = 'Glow Beauty Sdn Bhd';
        document.getElementById('rv-date').value = '2026-08-12';
      }

      const which = scenario.stage;
      const fn = which === 'qualify' ? cliQualification : which === 'forge' ? cliForge : cliReview;
      const internalFn = which === 'qualify' ? secQualification : which === 'forge' ? secForge : secReview;

      const build = (renderer, audit) => {
        const chromeFn = audit
          ? (d, n) => chromeDeck(d, n, d.deck || { client: '', date: '2026-08-12' })
          : (d, n) => chrome(d, n);
        const doc = new PDFKit.Doc({ onNewPage: chromeFn });
        if (audit) doc.audit = [];
        if (typeof LOGO_CACHE === 'object' && LOGO_CACHE) { doc.img = LOGO_CACHE; doc.pages = []; doc.newPage(); }
        const drew = renderer(doc);
        return { drew, doc };
      };

      let guard = 'passed';
      const { drew, doc } = build(fn, true);
      if (drew) { try { assertClientSafe(doc); } catch (e) { guard = e.message; } }
      const internal = build(internalFn, false);

      return {
        drew,
        pages: doc.pages.length,
        guard,
        bytes: drew ? Array.from(doc.build()) : [],
        internalBytes: internal.drew ? Array.from(internal.doc.build()) : [],
      };
    }, sc);
  }

  await browser.close();
  server.close();
  return { results, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2];
  const { results, errors } = await collectDecks();
  if (errors.length) console.error('page errors:', errors);
  if (outDir) mkdirSync(outDir, { recursive: true });
  for (const [name, r] of Object.entries(results)) {
    const text = pdfText(r.bytes);
    console.log(`\n${'='.repeat(72)}\n${name}  —  drew:${r.drew}  pages:${r.pages}  guard:${r.guard}`);
    console.log(text);
    if (outDir && r.drew) {
      writeFileSync(join(outDir, `${name}.pdf`), Buffer.from(r.bytes));
      writeFileSync(join(outDir, `${name}.internal.pdf`), Buffer.from(r.internalBytes));
    }
  }
}
