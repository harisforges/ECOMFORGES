/**
 * Build the two outreach template PDFs.
 *
 * Uses the calculator's own PDF writer rather than a library, so these documents come out in
 * the same navy-and-cyan document language as the briefs and the client decks. They are
 * internal working documents — the consultant has one open while sending — so they carry the
 * internal chrome, not the client-deck chrome.
 *
 * Separate files on purpose: the email rules and the WhatsApp rules are different enough that
 * one combined document would have people reading the wrong half.
 *
 *   node scripts/build-outreach-pdfs.mjs [outDir]
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

/* ── Content ──────────────────────────────────────────────────────────────────
   Kept as data so the layout code stays readable and the copy stays editable by
   someone who is not reading the drawing calls. */

const EMAIL = {
  file: 'EcomForges_Cold_Email_Templates.pdf',
  title: 'Cold Email',
  sub: 'Templates and send rules — Malaysian SME sellers',
  intro:
    'Every template below opens with the one thing competitors cannot say: that the same ' +
    'catalogue converts at different rates on two channels, and the seller has never compared ' +
    'them because the dashboards calculate conversion differently. It is specific, and the ' +
    'reader can check it in their own account in two minutes.',
  rules: [
    ['Sending domain', 'A separate domain, never @ecomforges.com. Cold volume damages the domain your client briefs and invoices go out on.'],
    ['Warm-up', 'Two to three weeks of low volume before real sending.'],
    ['Daily cap', '30 to 50 per inbox per day. More than that looks like a blast to the filters.'],
    ['First email', 'No links, no attachments, no images. All three hurt deliverability and read as a template.'],
    ['Signature', 'Plain text. A name and the company. No banner, no logo.'],
    ['Opt-out', 'One line in every email. Required, and it protects the domain.'],
    ['Follow-ups', 'Two, in the same thread, then stop.'],
    ['Before each send', 'Open their store. Thirty seconds on the listings is the difference between a reply and a spam report.'],
  ],
  subjects: [
    'your Shopee vs Lazada numbers',
    '{{brand}} on Lazada',
    'a question about {{brand}}',
    '{{category}} conversion on Lazada',
  ],
  avoid: 'Nothing with "free", "boost", "10x", or a currency figure. Those are filter bait and they read like every other blast.',
  templates: [
    {
      n: 'Email 1',
      when: 'First contact. Seller is on two or more channels.',
      subject: 'your Shopee vs Lazada numbers',
      body: [
        'Hi {{first_name}},',
        'You sell {{category}} on both Shopee and Lazada. Same products, same prices, same month.',
        'In most Malaysian stores we look at, one of those channels converts at close to half the rate of the other, and the seller has never compared them side by side because the two dashboards calculate conversion differently.',
        'Where that gap exists, it is usually the cheapest revenue in the business. No extra traffic, no extra ad spend, same catalogue.',
        'Worth checking in your account? Send me 30 days from both dashboards and I will tell you which way the gap runs and roughly what it is worth. No charge, and no obligation to work with us afterwards.',
        '{{sender_name}}',
        'EcomForges',
        'Reply STOP and I will not contact you again.',
      ],
    },
    {
      n: 'Email 1b',
      when: 'First contact. Seller is on one channel only — the gap hook does not apply.',
      subject: '{{brand}} on {{platform}}',
      body: [
        'Hi {{first_name}},',
        'You are selling {{category}} on {{platform}} and, from the outside, doing it properly. The listings are tidy and the reviews are there.',
        'The question I would ask in your position is which single number is holding the rest back this month. Traffic, conversion, basket size and campaign dependency all look like problems at once, so most sellers work on all four and move none of them.',
        'We read 30 days of your dashboard and name the one that is actually costing you money, with the arithmetic shown.',
        'Want me to run it? No charge, and no obligation afterwards.',
        '{{sender_name}}',
        'EcomForges',
        'Reply STOP and I will not contact you again.',
      ],
    },
    {
      n: 'Email 2',
      when: 'Three working days after Email 1. Same thread, no new subject.',
      subject: '(reply in thread)',
      body: [
        'Hi {{first_name}},',
        'One thing I should have said in the first email: we do not touch your account.',
        'We are advisers, not an agency. You keep your logins, your budget and your team. We read the data, name the constraint, and give your team three moves to run over 30 days. Then we check whether the number moved.',
        'That matters because an agency that logs in and changes things leaves you dependent on it. A team that knows why a change worked can repeat it without us.',
        'Still happy to read your 30 days if you want a second opinion.',
        '{{sender_name}}',
      ],
    },
    {
      n: 'Email 3',
      when: 'One week after Email 2. Closes the loop and stops.',
      subject: '(reply in thread)',
      body: [
        'Hi {{first_name}},',
        'I will leave it here so I am not cluttering your inbox.',
        'If it is useful later: the fastest thing you can do yourself is open your conversion rate on each channel for the same 30 days and compare them. If one is far behind the other on the same catalogue, the gap is the listings or the pricing on that channel, not the market.',
        'Good luck with {{brand}}.',
        '{{sender_name}}',
      ],
    },
  ],
  after: [
    {
      n: 'After 1',
      when: 'Same day as the 15-minute call, within two hours. The single most important email in the sequence.',
      subject: 'what we said we would do',
      body: [
        'Hi {{first_name}},',
        'Thanks for the fifteen minutes.',
        'What I took away: {{their_constraint}}. If that is wrong, tell me now rather than later, because it changes what I look at.',
        'Next step is yours and it is small: 30 days of screenshots from every channel you sell on. Send them whenever, and I will come back within two working days with which channel is underperforming, what it is worth in ringgit, and what I would work on first.',
        'No charge for that, and no obligation afterwards.',
        '{{sender_name}}',
      ],
    },
    {
      n: 'After 2',
      when: 'Three days later, if no data has arrived. Gives value instead of chasing.',
      subject: '(reply in thread)',
      body: [
        'Hi {{first_name}},',
        'No pressure on the screenshots.',
        'One thing you can do without me, in about five minutes: open your conversion rate on each channel for the same 30 days, side by side. If one is far behind the other on the same catalogue, the gap is the listings or the pricing on that channel, not the market. That alone usually tells you where to look.',
        'If you want the full read, the offer stands.',
        '{{sender_name}}',
      ],
    },
    {
      n: 'After 3',
      when: 'Ten days after the call. Asks for the truth, and converts a dead lead into a subscriber.',
      subject: '(reply in thread)',
      body: [
        'Hi {{first_name}},',
        'Last one from me, and it is a question rather than a pitch: was the call useful? One line is plenty, and an honest "not really" is more use to me than silence.',
        'If the timing is simply wrong, I send one email a month on what we are seeing across Malaysian stores. The conversion gaps, what is working in campaigns, what is not. No pitch in it. Reply with the word monthly and I will add you.',
        'Either way, thanks for the time.',
        '{{sender_name}}',
      ],
    },
  ],
};

const WHATSAPP = {
  file: 'EcomForges_WhatsApp_Templates.pdf',
  title: 'WhatsApp',
  sub: 'Templates and rules — Malaysian SME sellers',
  warning: [
    'WhatsApp is not an email list. Meta requires opt-in before a business messages a person, and business-initiated messages must use a template approved in advance.',
    'Blasting a cold list gets the number banned, usually within days. If that number is also the one your existing clients message you on, a ban takes those conversations with it.',
    'None of the templates below are cold blasts. Each one is for a case where a basis to message already exists.',
  ],
  allowed: [
    ['A', 'Inbound enquiry', 'They enquired, downloaded something, or filled in a form'],
    ['B', 'Referral', 'A mutual client or contact introduced them'],
    ['C', 'Agreed follow-up', 'They agreed on a call or by email that you would send it'],
    ['D', 'Re-engagement', 'A past lead who went quiet, at least 30 days ago'],
    ['E', 'Session logistics', 'Confirming a booked session'],
    ['F', 'Cold', 'No prior contact. Highest risk — read the note below'],
    ['G', 'Introduction', 'A group, event or mutual context where introducing yourself is expected'],
    ['H', 'After the call', 'You have just had the 15-minute meeting'],
    ['I', 'Feedback and nurture', 'A week after the call, still quiet'],
  ],
  cold: [
    'Use a separate number. Never the one your existing clients message you on, because a ban takes those conversations with it.',
    'Twenty to thirty a day, sent by hand. Bulk tools and identical text sent fast are what the spam detection is actually looking for.',
    'No link and no attachment in the first message. A link from an unknown number is the single strongest report trigger.',
    'Open their store first and name something real about it. A message that could have been sent to anyone gets reported; one that clearly was not, rarely does.',
    'Stop at one follow-up. If there is no reply to the second message, remove them.',
    'If someone asks you to stop, stop and delete the number. One report is survivable, a pattern is not.',
  ],
  note:
    'On the Business API, templates A, B and D need submitting for approval in WhatsApp Manager ' +
    'before first use. On a normal WhatsApp Business app sending person by person, approval does ' +
    'not apply, but the ban risk from volume still does.',
  templates: [
    {
      n: 'A', when: 'Inbound enquiry. Reply the same day.',
      body: [
        'Hi {{first_name}}, {{sender_name}} from EcomForges. Thanks for getting in touch about {{brand}}.',
        'Quickest way to make this useful: send me 30 days from your Shopee and Lazada dashboards, screenshots are fine. I will come back with which channel is underperforming and what it is worth.',
        'No charge for that part.',
      ],
    },
    {
      n: 'B', when: 'Referral introduction. Your highest-converting message — always name the referrer.',
      body: [
        'Hi {{first_name}}, {{sender_name}} here. {{referrer_name}} suggested I message you about {{brand}}.',
        'We work with Malaysian sellers on Shopee, Lazada and TikTok. We do not run your ads or touch your account. We read the data, name the one thing costing you money this month, and your team runs it.',
        'Open to me taking a look at 30 days?',
      ],
    },
    {
      n: 'C', when: 'They agreed you would send it. Keep it to the ask.',
      body: [
        'Hi {{first_name}}, as promised.',
        'Send whenever you have them: 30 days of Shopee and Lazada, screenshots of the analytics pages are enough. Revenue, visitors, orders, conversion and ad spend.',
        'I will read them and come back within two working days.',
      ],
    },
    {
      n: 'D', when: 'Re-engagement. At least 30 days since last contact.',
      body: [
        'Hi {{first_name}}, {{sender_name}} from EcomForges. We spoke about {{brand}} back in {{month}}.',
        'No pitch. Campaign season is coming and the sellers who do well in it are the ones who fixed their conversion before the traffic arrived, not during.',
        'If you want that read on your numbers, the offer stands. If not, I will leave you to it.',
      ],
    },
    {
      n: 'F', when: 'Cold. No prior contact. Send from a separate number, never the one clients use.',
      body: [
        'Hi {{first_name}}, {{sender_name}} here from EcomForges, a Malaysian e-commerce advisory.',
        'A question rather than a pitch: have you ever compared your Shopee and Lazada conversion side by side for the same month?',
        'On most stores we look at, one is running at close to half the other on the same catalogue, and nobody has noticed because the two dashboards calculate it differently.',
        'Happy to check yours at no charge if it is useful. If not, no problem at all.',
      ],
    },
    {
      n: 'G', when: 'Introducing yourself. A seller group, an event follow-up, a mutual context.',
      body: [
        'Hi {{first_name}}, I am {{sender_name}} from EcomForges.',
        'We are a Malaysian e-commerce advisory. We work with Shopee, Lazada and TikTok sellers, but we do not run ads or touch your account. We read your numbers, name the one thing costing you money that month, and your team runs the fix.',
        'If it is ever useful, I am glad to read 30 days of your dashboards and tell you what I see. No charge, and no obligation.',
      ],
    },
    {
      n: 'H', when: 'Within an hour of the 15-minute call. Locks in what was agreed while it is fresh.',
      body: [
        'Hi {{first_name}}, thanks for the call earlier.',
        'Recap so we are agreed: {{their_constraint}}. Next step is 30 days of screenshots from each channel, and I come back within two working days.',
        'If I got any of that wrong, tell me now rather than later.',
      ],
    },
    {
      n: 'I', when: 'About a week after the call, still no data. Asks for the truth and offers a way to stay in touch.',
      body: [
        'Hi {{first_name}}, quick one. Was the call last week actually useful? One line is plenty, and an honest no is more use to me than silence.',
        'If the timing is just wrong, I send one short email a month on what we are seeing across Malaysian stores. No pitch in it. Say the word monthly and I will add you.',
      ],
    },
    {
      n: 'E', when: 'Session confirmed. Sets expectations before the hour starts.',
      body: [
        'Hi {{first_name}}, confirmed for {{day}} at {{time}}.',
        'Two things beforehand so we use the hour properly:',
        '1. 30 days of data from every channel you sell on',
        '2. One person from your side who owns execution between sessions',
        'We will name one constraint and three moves. Your team runs them, and we measure whether the number moved next cycle.',
      ],
    },
  ],
};

const SAY = [
  'One constraint per cycle. A list of ten problems is why nothing gets fixed.',
  'You keep control. We do not log into the account or spend the budget.',
  'From RM499 a month, month to month. No lock-in and no notice period.',
  'We turn people down. If the problem is margin or operations, growth work is not worth paying for yet, and we say so.',
  'The number moves or we say why: either the sprint was not executed, or our reading was wrong.',
];

const DONT = [
  'Any guaranteed result, percentage or timeframe. There is no guarantee, and a loose promise in writing is one a client will hold you to.',
  '"We will grow your sales." Everyone says it, and it commits you to the outcome rather than the method.',
  'The "900+ brands" figure, unless it is literally true and you can evidence it. A misleading representation in trade is an offence.',
  'Anything in a subject line with a currency figure or the word free.',
];

const PDPA =
  'The Personal Data Protection Act governs commercial electronic messages in Malaysia. B2B ' +
  'outreach to a business address published for that purpose is the defensible end of the ' +
  'spectrum; a bought list of personal numbers is the other. Whatever the source, three things ' +
  'are not optional: an opt-out in every email, honouring it immediately, and a record of where ' +
  'each contact came from. Take legal advice before running a large campaign.';

async function build() {
  const server = serve();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });

  const out = await page.evaluate(({ EMAIL, WHATSAPP, SAY, DONT, PDPA }) => {
    /*
     * A template block. Not scriptBox: that renders oblique, which is fine for a one-line
     * call script and punishing to read across a six-paragraph email. This is upright, on the
     * panel ground, with the cyan rule kept so it still reads as "copy this verbatim".
     */
    function templateBlock(doc, paras) {
      const pad = 11, w = doc.innerW - pad * 2 - 4;
      const h = paras.reduce((s, p) => s + doc.paraHeight(p, w, 9.5, 13.5, false) + 7, 0) + pad * 2 - 7;
      doc.need(Math.min(h, doc.bottom - doc.margin));
      doc.rect(doc.margin, doc.y, doc.innerW, h, P.alt);
      doc.rect(doc.margin, doc.y, 2.5, h, P.cyan);
      let yy = doc.y + pad;
      for (const p of paras) {
        yy = doc.para(p, doc.margin + pad + 4, yy, w, { size: 9.5, color: P.white, leading: 13.5 }) + 7;
      }
      doc.y += h + 12;
    }

    /**
     * Heading for one template: its number, when to use it, and the subject if it has one.
     *
     * Reserves room for the heading AND the first two paragraphs of the block that follows.
     * Without that the heading lands at the foot of a page and the email it labels starts on
     * the next one, which is the one layout error that makes a template sheet unusable.
     */
    function templateHead(doc, n, when, subject, body) {
      const w = doc.innerW - 11 * 2 - 4;
      const opening = (body || []).slice(0, 2)
        .reduce((sum, para) => sum + doc.paraHeight(para, w, 9.5, 13.5, false) + 7, 0);
      doc.need(46 + (subject ? 15 : 0) + opening + 22);
      doc.text(n.toUpperCase(), doc.margin, doc.y, { size: 11, font: 1, color: P.cyan });
      doc.y += 15;
      doc.y = doc.para(when, doc.margin, doc.y, doc.innerW, { size: 8.5, color: P.grey, leading: 12 }) + 5;
      if (subject) {
        doc.text('SUBJECT', doc.margin, doc.y, { size: 6.5, font: 1, color: P.grey });
        doc.text(subject, doc.margin + 52, doc.y - 1, { size: 9, font: 1, color: P.white });
        doc.y += 15;
      }
    }

    function makeDoc(cfg, kind) {
      const doc = new PDFKit.Doc({ onNewPage: (d, n) => chrome(d, n) });
      if (typeof LOGO_CACHE === 'object' && LOGO_CACHE) { doc.img = LOGO_CACHE; doc.pages = []; doc.newPage(); }

      docTitle(doc, cfg.title, cfg.sub, [
        ['Audience', 'Malaysian SME sellers'],
        ['Channels', 'Shopee, Lazada, TikTok'],
        ['Offer', 'From RM499 / month'],
      ]);

      if (kind === 'email') {
        doc.y = doc.para(cfg.intro, doc.margin, doc.y, doc.innerW, { size: 9.5, color: P.white, leading: 14 }) + 14;
        label(doc, 'Before you send');
        kvTable(doc, cfg.rules, 104);
        label(doc, 'Subject lines — test in pairs');
        bullets(doc, cfg.subjects);
        alertBox(doc, 'Keep out of the subject line', [cfg.avoid]);
        doc.newPage();
      } else {
        alertBox(doc, 'Read this before sending anything', cfg.warning);
        label(doc, 'When each template is allowed');
        table(doc, ['', 'Template', 'Basis to message'],
          cfg.allowed.map((r) => [r[0], r[1], r[2]]), [7, 26, 67]);
        doc.y = doc.para(cfg.note, doc.margin, doc.y, doc.innerW, { size: 8.5, color: P.grey, leading: 12 }) + 12;
        /* Template F is cold, which was asked for in full knowledge of the risk. Repeating the
           warning would not help; these are the things that actually reduce the chance of a ban. */
        alertBox(doc, 'If you send Template F cold, do it this way', cfg.cold);
        doc.y = doc.para('Keep messages under about 300 characters. Malaysian business WhatsApp is direct, and a wall of text reads as a template.',
          doc.margin, doc.y, doc.innerW, { size: 8.5, color: P.grey, leading: 12 }) + 14;
      }

      label(doc, kind === 'email' ? 'The sequence — first contact' : 'The templates');
      for (const t of cfg.templates) {
        templateHead(doc, kind === 'email' ? t.n : 'Template ' + t.n, t.when, t.subject, t.body);
        templateBlock(doc, t.body);
      }

      /*
       * The post-meeting sequence. Deals do not usually die in the cold email; they die in the
       * silence after a call that went well, so this gets its own page rather than trailing off
       * the end of the first-contact sequence.
       */
      if (cfg.after) {
        doc.newPage();
        label(doc, 'After the 15-minute call');
        doc.y = doc.para(
          'A prospect who goes quiet after a good call has usually not decided against you. They ' +
          'have gone back to work. These three do the remembering for them, and the last one asks ' +
          'for the truth and keeps the relationship alive either way.',
          doc.margin, doc.y, doc.innerW, { size: 9, color: P.grey, leading: 13 }) + 14;
        for (const t of cfg.after) {
          templateHead(doc, t.n, t.when, t.subject, t.body);
          templateBlock(doc, t.body);
        }
      }

      doc.newPage();
      label(doc, 'Say this');
      bullets(doc, SAY);
      label(doc, 'Never say this');
      bullets(doc, DONT);
      label(doc, 'PDPA');
      doc.para(PDPA, doc.margin, doc.y, doc.innerW, { size: 8.5, color: P.grey, leading: 12.5 });

      return { name: cfg.file, bytes: Array.from(doc.build()), pages: doc.pages.length };
    }

    return [makeDoc(EMAIL, 'email'), makeDoc(WHATSAPP, 'whatsapp')];
  }, { EMAIL, WHATSAPP, SAY, DONT, PDPA });

  await browser.close();
  server.close();
  return { docs: out, errors };
}

const outDir = process.argv[2] || '/tmp/outreach';
mkdirSync(outDir, { recursive: true });
const { docs, errors } = await build();
if (errors.length) console.error('page errors:', errors);
for (const d of docs) {
  writeFileSync(join(outDir, d.name), Buffer.from(d.bytes));
  console.log(`${d.name}  ${d.pages} pages  ${d.bytes.length.toLocaleString()} bytes`);
}
