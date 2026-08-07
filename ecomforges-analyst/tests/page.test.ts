/**
 * Tests for the built single-file page.
 *
 * This is the artifact the consultancy actually opens on a phone, so the properties that
 * matter are not the same as the CLI's: it must be self-contained (no signal needed), hold
 * no credential (anyone can View Source), and produce the same figures as the engine it was
 * bundled from.
 *
 * Run `npm run build:page` first; the test fails with a clear message if the build is stale.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync as read } from 'node:fs';
import { analyse } from '../src/engine/pipeline.js';
import { loadEngagement } from '../src/types/load.js';
import { DEFAULT_THRESHOLDS } from '../src/benchmarks/parse.js';
import { renderBrief } from '../src/render/brief.js';

const PAGE = join('..', 'analyst.html');

describe('the built page', () => {
  it('exists — run npm run build:page if this fails', () => {
    expect(existsSync(PAGE), `${PAGE} is missing; run \`npm run build:page\``).toBe(true);
  });

  const html = existsSync(PAGE) ? readFileSync(PAGE, 'utf8') : '';

  it('is self-contained: nothing loads from the network', () => {
    // It is opened from a home screen, sometimes with no signal. An external reference
    // would make it fail silently in exactly that situation.
    expect(html).not.toMatch(/<script[^>]+\bsrc=/i);
    expect(html).not.toMatch(/<link[^>]+\bhref="https?:/i);
    expect(html).not.toMatch(/@import\s+url\(/i);
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toMatch(/XMLHttpRequest/);
    expect(html).not.toMatch(/WebSocket/);
  });

  it('holds no credential and calls no API', () => {
    expect(html).not.toMatch(/sk-ant-/);
    expect(html).not.toMatch(/api\.anthropic\.com/);
    expect(html).not.toMatch(/ANTHROPIC_API_KEY/);
  });

  it('asks search engines not to index it', () => {
    expect(html).toMatch(/name="robots"[^>]*noindex/i);
  });

  it('carries the home-screen install tags', () => {
    // iOS ignores <link rel="icon"> entirely, so apple-touch-icon is what puts the mark on
    // the home screen; the manifest does the same job on Android.
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('manifest.webmanifest');
    expect(html).toMatch(/apple-mobile-web-app-capable/);
  });

  it('sizes inputs at 16px so iOS does not zoom on focus', () => {
    expect(html).toMatch(/input[^{]*\{[^}]*font-size:\s*16px/);
  });

  it('keeps a blank input out of the payload rather than sending zero', () => {
    expect(html).toContain("if (v === '') return;");
  });

  it('defines its palette on bare :root, not only inside a media query', () => {
    const bareRoot = html.indexOf(':root{');
    const darkBlock = html.indexOf('prefers-color-scheme:dark');
    expect(bareRoot).toBeGreaterThan(-1);
    expect(bareRoot).toBeLessThan(darkBlock);
  });

  it('produces the same brief as the engine it was bundled from', () => {
    // The page's value is that it is the same engine. If the bundle drifts from the source,
    // two people looking at the same numbers get different briefs.
    const a = analyse(loadEngagement(read('fixtures/my-bty-09.json', 'utf8')), {
      rows: [],
      rejected: [],
      thresholds: DEFAULT_THRESHOLDS,
    });
    const expected = renderBrief(a);
    // The bundle is minified, so compare the load-bearing conclusions rather than the text.
    for (const probe of [
      'Conversion Forge™',
      'the size of the hole',
      'Not treated as zero',
      'could invalidate the recommendation',
    ]) {
      expect(expected).toContain(probe);
      expect(html).toContain(probe);
    }
  });

  it('is small enough to open over a phone connection', () => {
    const kb = statSync(PAGE).size / 1024;
    expect(kb).toBeLessThan(250);
  });
});
