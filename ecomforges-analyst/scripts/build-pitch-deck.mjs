/**
 * The 15-minute pitch deck.
 *
 * Landscape, because it is screen-shared on a call rather than read on paper, and typed large
 * for the same reason — a prospect is looking at it in a Zoom window on a laptop, sometimes on
 * a phone. Nothing on a slide is smaller than 13pt.
 *
 * Every slide carries a running time marker. Fifteen minutes is not long, and the failure mode
 * of a founder pitch is spending nine minutes on "who we are" and ninety seconds on the offer.
 * The markers are the script's pacing, printed where the presenter can see it.
 *
 *   node scripts/build-pitch-deck.mjs [outDir]
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function serve() {
  return createServer((req, res) => {
    const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).slice(1);
    const p = join(REPO, rel);
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': p.endsWith('.png') ? 'image/png' : 'text/html' });
    res.end(readFileSync(p));
  });
}

/**
 * The deck, as data.
 *
 * `say` is the presenter note printed under the slide title in grey — what to actually say,
 * not a caption for the prospect. It is on the slide rather than in a separate notes document
 * because a separate notes document does not get read.
 */
const SLIDES = [
  {
    kind: 'cover',
    kicker: 'For Malaysian sellers on Shopee, Lazada and TikTok Shop',
    title: 'Same products.\nSame price.\nHalf the conversion.',
    sub: 'One of your channels is quietly costing you money every month. Most sellers have never worked out which one, because no dashboard puts them side by side.',
  },
  {
    at: '0:00', for: '3 min',
    kicker: 'Start here',
    title: 'Does any of this\nsound like you?',
    checklist: [
      'Ad cost keeps climbing. Orders do not.',
      '9.9, 11.11 and 12.12 carry the year, and the quiet months barely pay for themselves.',
      'One channel works. Another never took off, and nobody can say why.',
      'Free shipping and vouchers eat whatever margin was left.',
      'You have more dashboards than you have answers.',
    ],
    foot: 'Three or more is normal. It is also fixable, and usually cheaper than you think.',
    say: 'Stop talking. Let them read it and tell you which ones they ticked. This slide is where they describe their own business to you.',
  },
  {
    at: '3:00', for: '3 min',
    kicker: 'What we find',
    title: 'The gap nobody\nhas measured',
    stats: [
      ['0.43x', 'One channel converting at less than half the rate of the other. Same catalogue, same prices, same month.'],
      ['RM130 vs RM114', 'And the weaker channel had the HIGHER average order value. The buyers were better. The listings were not.'],
      ['RM40,177', 'Cancelled and refunded in a single period. 8.3% of revenue, showing on no dashboard as a number anyone was tracking.'],
    ],
    foot: 'Real figures from a Malaysian seller we work with, anonymised.',
    say: 'Let the middle one land. Higher AOV on the worse channel is the detail that proves it is not the market, it is the listings.',
  },
  {
    at: '6:00', for: '2 min',
    kicker: 'Why it stays broken',
    title: 'Five problems,\none cause',
    body: [
      'Traffic, conversion, basket size, campaign dependency, margin. They all look broken at the same time.',
      'So most sellers work on all five at once, move none of them, and decide e-commerce is just harder now.',
      'It is not five problems. It is one constraint and four symptoms of it. Fix the constraint and three of the others move on their own.',
    ],
  },
  {
    at: '8:00', for: '2 min',
    kicker: 'How it works',
    title: 'One cycle, every month',
    steps: [
      ['Diagnose', 'We read 30 days from every channel you sell on and score six areas. One is named the constraint for this cycle.'],
      ['Sprint', 'Three moves, in order, with one number to move and a date. Your team runs them.'],
      ['Measure', 'Next session we check whether that number moved, and say which of two reasons it was if it did not.'],
    ],
  },
  {
    at: '10:00', for: '2 min',
    kicker: 'The part most people do not expect',
    title: 'We never touch\nyour account',
    body: [
      'We do not run your ads, log into Seller Centre, or edit your listings. You keep every login, every ringgit of budget, and your team.',
      'An agency that logs in and changes things leaves you dependent on it forever. You never find out which change worked.',
      'A team that understands why a change worked can repeat it next month without paying anyone.',
    ],
    say: 'Most of them have been burned by an agency. Pause here and let them say so.',
  },
  {
    at: '12:00', for: '1 min',
    kicker: 'What you get',
    title: 'Every month',
    body: [
      'A written brief where every figure shows where it came from and how it was worked out.',
      'One constraint named. Not a list of ten things to think about.',
      'A 30-day sprint in plain language that your own team runs.',
      'An honest answer on last month: the number moved, or it did not and here is exactly why.',
    ],
  },
  {
    at: '13:00', for: '1 min',
    kicker: 'Cost',
    title: 'From RM499\na month',
    body: [
      'Month to month. No lock-in and no notice period. If the work stops earning its place, you stop.',
      'The price tracks how many sessions you need, not how many hours we spend.',
    ],
    note: 'We do not promise a result. We promise the method, and an honest answer every single cycle.',
  },
  {
    at: '14:00', for: '1 min',
    kicker: 'Fit',
    title: 'We turn\npeople down',
    body: [
      'If the real problem is margin or operations, growth work is not worth paying for yet. We will say so and point you at what to fix first.',
      'We would rather lose the sale than take a retainer we cannot move.',
    ],
    say: 'Say this one plainly and without softening it. It is the slide that makes everything before it believable.',
  },
  {
    kind: 'cta',
    at: '15:00', for: '1 min',
    kicker: 'Next step',
    title: 'Send us 30 days',
    body: [
      'Screenshots of your analytics pages from every channel you sell on. That is the entire ask.',
      'Within two working days you get: which channel is underperforming, what the gap is worth in ringgit, and what we would work on first.',
      'No charge, and no obligation afterwards.',
    ],
  },
];

async function build() {
  const server = serve();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });

  const doc = await page.evaluate((SLIDES) => {
    // A4 landscape. Shared with the client decks in palette and mark, not in geometry.
    const W = 841.89, H = 595.28;

    function slideChrome(d, n) {
      d.rect(0, 0, W, H, P.navy);
      if (d.img) {
        const h = 13, w = d.img.w * h / d.img.h;
        d.image(d.margin, 26, w, h);
      } else {
        d.text('ECOMFORGES', d.margin, 27, { size: 10, font: 1, color: P.white });
      }
      // Slide 1 is the cover; it gets no running furniture.
      if (n > 1) {
        d.text(String(n - 1), W - d.margin - 40, H - 34, { size: 9, color: P.grey, align: 'right', width: 40 });
      }
      d.y = 70;
    }

    const doc = new PDFKit.Doc({ width: W, height: H, margin: 54, onNewPage: (d, n) => slideChrome(d, n) });
    if (typeof LOGO_CACHE === 'object' && LOGO_CACHE) { doc.img = LOGO_CACHE; doc.pages = []; doc.newPage(); }

    /** Timing marker, top right. The presenter's pacing, not the prospect's information. */
    function timing(d, at, dur) {
      if (!at) return;
      d.text(`${at}  ·  ${dur}`, W - d.margin - 150, 28, { size: 8.5, color: P.dcyan, align: 'right', width: 150 });
    }

    function heading(d, kicker, title) {
      d.rect(d.margin, d.y, 34, 2.5, P.cyan);
      d.y += 14;
      d.text(String(kicker).toUpperCase(), d.margin, d.y, { size: 9, font: 1, color: P.cyan });
      d.y += 20;
      for (const line of String(title).split('\n')) {
        d.text(line, d.margin, d.y, { size: 30, font: 1, color: P.white });
        d.y += 36;
      }
      d.y += 12;
    }

    /** Body copy, set large. This is read across a room on a shared screen. */
    function body(d, items, width) {
      const w = width || d.innerW * 0.72;
      for (const t of items) {
        d.rect(d.margin, d.y + 7, 4, 4, P.dcyan);
        d.y = d.para(t, d.margin + 18, d.y, w - 18, { size: 14, color: P.white, leading: 21 }) + 15;
      }
    }

    /** Numbered steps across the slide — the cycle, and the two asks. */
    function steps(d, list) {
      const gap = 22, colW = (d.innerW - gap * (list.length - 1)) / list.length;
      const top = d.y;
      let maxH = 0;
      list.forEach(([head, text], i) => {
        const x = d.margin + i * (colW + gap);
        d.rect(x, top, colW, 3, P.dark_cyan || P.dcyan);
        let yy = top + 20;
        d.text(String(i + 1).padStart(2, '0'), x, yy, { size: 11, font: 1, color: P.dcyan });
        yy += 18;
        d.text(head, x, yy, { size: 17, font: 1, color: P.cyan });
        yy += 26;
        yy = d.para(text, x, yy, colW, { size: 12.5, color: P.white, leading: 18 });
        maxH = Math.max(maxH, yy - top);
      });
      d.y = top + maxH + 20;
    }

    /**
     * The checklist. This is the slide that sells before anyone speaks: the reader ticks items
     * in their head and concludes we already understand their business. Set large and widely
     * spaced so it is read rather than skimmed.
     */
    function checklist(d, items) {
      for (const t of items) {
        const boxY = d.y + 1;
        d.rect(d.margin, boxY, 13, 13, P.main);
        d.rect(d.margin + 3.5, boxY + 3.5, 6, 6, P.cyan);
        d.y = d.para(t, d.margin + 26, d.y, d.innerW * 0.76 - 26,
          { size: 15, color: P.white, leading: 22 }) + 16;
      }
    }

    /** Three figures across the slide. Numbers stop a reader; prose does not. */
    function stats(d, list) {
      const gap = 26, colW = (d.innerW - gap * (list.length - 1)) / list.length;
      const top = d.y;
      let maxH = 0;
      list.forEach(([fig, text], i) => {
        const x = d.margin + i * (colW + gap);
        let yy = top;
        d.text(fig, x, yy, { size: 27, font: 1, color: P.cyan });
        yy += 38;
        d.rect(x, yy - 8, 26, 2, P.dcyan);
        yy = d.para(text, x, yy + 4, colW, { size: 12, color: P.white, leading: 17.5 });
        maxH = Math.max(maxH, yy - top);
      });
      d.y = top + maxH + 16;
    }

    /** A quiet line under the content — the source note, or the reassurance. */
    function foot(d, text) {
      d.para(text, d.margin, d.y + 4, d.innerW * 0.72, { size: 10.5, color: P.grey, leading: 15 });
    }

    function presenterNote(d, text) {
      const pad = 12, w = d.innerW - pad * 2 - 4;
      const h = d.paraHeight(text, w, 10, 14, false) + pad * 2 - 4;
      const y = H - d.margin - h;
      d.rect(d.margin, y, d.innerW, h, P.alt);
      d.rect(d.margin, y, 2.5, h, P.amber);
      d.text('SAY', d.margin + pad + 4, y + pad - 2, { size: 7.5, font: 1, color: P.amber });
      d.para(text, d.margin + pad + 30, y + pad - 3, w - 30, { size: 10, color: P.grey, leading: 14 });
    }

    SLIDES.forEach((s, i) => {
      if (i > 0) doc.newPage();
      timing(doc, s.at, s.for);

      if (s.kind === 'cover') {
        doc.y = H * 0.30;
        doc.rect(doc.margin, doc.y - 26, 34, 2.5, P.cyan);
        doc.text(String(s.kicker).toUpperCase(), doc.margin, doc.y - 14, { size: 9, font: 1, color: P.cyan });
        doc.y += 10;
        // The cover is three lines now; drop a size so it still clears the standfirst.
        const lines = s.title.split('\n');
        const size = lines.length > 2 ? 36 : 40;
        for (const line of lines) {
          doc.text(line, doc.margin, doc.y, { size, font: 1, color: P.white });
          doc.y += size * 1.17;
        }
        doc.y += 10;
        doc.para(s.sub, doc.margin, doc.y, doc.innerW * 0.6, { size: 13, color: P.grey, leading: 19 });
        return;
      }

      heading(doc, s.kicker, s.title);
      if (s.checklist) checklist(doc, s.checklist);
      if (s.stats) stats(doc, s.stats);
      if (s.steps) steps(doc, s.steps);
      if (s.body) body(doc, s.body, s.kind === 'cta' ? doc.innerW * 0.66 : undefined);
      if (s.foot) foot(doc, s.foot);

      if (s.note) {
        doc.y += 4;
        const w = doc.innerW * 0.72;
        const h = doc.paraHeight(s.note, w - 26, 12.5, 18, false) + 24;
        doc.rect(doc.margin, doc.y, w, h, P.main);
        doc.rect(doc.margin, doc.y, 3, h, P.green);
        doc.para(s.note, doc.margin + 16, doc.y + 12, w - 26, { size: 12.5, color: P.white, leading: 18 });
        doc.y += h + 12;
      }

      if (s.kind === 'cta') {
        const bw = 300, bh = 56, bx = W - doc.margin - bw, by = H - doc.margin - bh - 10;
        doc.rect(bx, by, bw, bh, P.cyan, 8);
        doc.text('www.ecomforges.com', bx, by + 14, { size: 15, font: 1, color: P.navy, align: 'center', width: bw });
        doc.text('Book the read, or reply to this email', bx, by + 34, { size: 9.5, color: P.navy, align: 'center', width: bw });
      }

      if (s.say) presenterNote(doc, s.say);
    });

    return { bytes: Array.from(doc.build()), pages: doc.pages.length };
  }, SLIDES);

  await browser.close();
  server.close();
  return { doc, errors };
}

const outDir = process.argv[2] || '/tmp/outreach';
mkdirSync(outDir, { recursive: true });
const { doc, errors } = await build();
if (errors.length) console.error('page errors:', errors);
const name = 'EcomForges_15min_Pitch_Deck.pdf';
writeFileSync(join(outDir, name), Buffer.from(doc.bytes));
console.log(`${name}  ${doc.pages} slides  ${doc.bytes.length.toLocaleString()} bytes`);
