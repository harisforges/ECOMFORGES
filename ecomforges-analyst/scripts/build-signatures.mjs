/**
 * Build a per-person email signature from the master template.
 *
 * Generated rather than copy-pasted so the two signatures cannot drift: change the layout,
 * the tagline or the SSM line once in content/email-signature.html and rerun this. Adding a
 * third person is one entry in PEOPLE.
 *
 *   node scripts/build-signatures.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = join(REPO, 'content', 'email-signature.html');

/**
 * `phone` omitted means the phone row is removed entirely rather than left as an empty line —
 * a signature with a blank row where a number should be looks unfinished.
 */
const PEOPLE = [
  { slug: 'haris', name: 'Haris Haikal', role: 'Co-Founder', email: 'haris@ecomforges.com',
    phone: '+60 11-5376 7895', phoneE164: '+601153767895' },
  { slug: 'daniel', name: 'Daniel Qayyum', role: 'Founder', email: 'dq@ecomforges.com',
    phone: '+60 11-5357 6265', phoneE164: '+601153576265' },
];

/*
 * The tel: link must be bare digits with the country code and nothing else — a phone dialling
 * "+60 11-5376 7895" verbatim fails. So each person carries both: the readable form for the
 * page and the E.164 form for the link. This check keeps them from disagreeing, which is the
 * kind of fault nobody notices until a prospect taps the number and it does not ring.
 */
for (const p of PEOPLE) {
  if (p.phone === undefined) continue;
  const digits = p.phone.replace(/[^0-9]/g, '');
  if (p.phoneE164 !== `+${digits}`) {
    throw new Error(`${p.slug}: tel link ${p.phoneE164} does not match the printed ${p.phone}`);
  }
}

/** Strip the whole <tr> holding the phone, not just its contents. */
function removePhoneRow(html) {
  const out = html.replace(/\n\s*<tr>(?:(?!<\/tr>)[\s\S])*?\{\{PHONE\}\}[\s\S]*?<\/tr>/, '');
  if (out === html) throw new Error('phone row not found — the template shape changed');
  return out;
}

/*
 * Drop the master template's leading comment. It explains which tokens to replace and how to
 * install, which is right for the template and wrong for a finished signature — the tokens are
 * already filled, and the comment's own "{{TOKENS}}" example trips the unfilled-token check.
 */
const template = readFileSync(TEMPLATE, 'utf8').replace(/^<!--[\s\S]*?-->\n/, '');

/*
 * The tagline is written once, in the HTML template, and lifted out for the plain-text version.
 * It used to be typed in both, which drifts the moment one is edited — and a signature is
 * exactly the kind of file where nobody notices for months.
 */
const ROWS = [...template.matchAll(/mso-line-height-rule:exactly;">\s*\n\s*([^<\n]+?)\s*\n\s*<\/td>/g)]
  .map((m) => m[1].trim());

function pick(label, match) {
  const found = ROWS.find(match);
  if (!found) throw new Error(`${label} not found in the template — its row shape changed`);
  // The template is HTML; the plain-text version needs the entity back as a character.
  return found.replace(/&middot;/g, '·').replace(/&amp;/g, '&');
}

const TAGLINE = pick('tagline', (r) => !r.includes('{{') && !r.includes('SSM'));

/* The company, year, registration and country line. Also written once, in the template. */
const LEGAL = pick('legal line', (r) => r.includes('SSM'));

for (const p of PEOPLE) {
  let html = p.phone === undefined ? removePhoneRow(template) : template;
  html = html
    .replace('{{FULL NAME}}', p.name)
    .replace('{{ROLE}}', p.role)
    .replaceAll('{{EMAIL}}', p.email);
  if (p.phone !== undefined) {
    html = html.replace('{{PHONE_E164}}', p.phoneE164).replace('{{PHONE}}', p.phone);
  }

  const left = [...html.matchAll(/\{\{[A-Z_ ]+\}\}/g)].map((m) => m[0]);
  const expected = p.phone === undefined ? [] : ['{{PHONE_E164}}', '{{PHONE}}'];
  const unexpected = left.filter((t) => !expected.includes(t));
  if (unexpected.length) throw new Error(`${p.slug}: unfilled tokens ${unexpected.join(', ')}`);

  writeFileSync(join(REPO, 'content', `email-signature-${p.slug}.html`), html);

  const txt = [
    p.name,
    `${p.role} · EcomForges`,
    TAGLINE,
    '',
    'www.ecomforges.com',
    p.phone === undefined ? p.email : `${p.email} · ${p.phone}`,
    '',
    LEGAL,
  ].join('\n') + '\n';
  writeFileSync(join(REPO, 'content', `email-signature-${p.slug}.txt`), txt);

  console.log(`${p.slug.padEnd(8)} ${p.name} — ${p.role}${p.phone === undefined ? ', no phone' : ''}`);
}
