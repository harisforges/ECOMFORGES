import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const dir = '/home/user/ECOMFORGES/content/';
const h = readFileSync(dir + 'email-signature-haris.html', 'utf8');
const d = readFileSync(dir + 'email-signature-daniel.html', 'utf8');
const page = `<body style="margin:0;background:#fff;font-family:Arial">
<div style="display:flex;gap:60px;padding:32px">
<div>${h}</div><div>${d}</div></div></body>`;
const out = '/tmp/claude-0/-home-user-ECOMFORGES/f7bd025e-2a92-5d68-b8bc-d96d241e0db9/scratchpad/sig.html';
writeFileSync(out, page);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 340 } });
await p.goto('file://' + out);
await p.screenshot({ path: '/tmp/claude-0/-home-user-ECOMFORGES/f7bd025e-2a92-5d68-b8bc-d96d241e0db9/scratchpad/sig.png' });
await b.close();
