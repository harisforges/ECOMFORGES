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
    expect(html).toContain('analyst.webmanifest');
    expect(html).toMatch(/apple-mobile-web-app-capable/);
  });

  it('sizes inputs at 16px so iOS does not zoom on focus', () => {
    expect(html).toMatch(/input[^{]*\{[^}]*font-size:\s*16px/);
  });

  it('keeps a blank input out of the payload rather than sending zero', () => {
    expect(html).toContain("if (v === '') return;");
  });

  it('paints its own palette rather than borrowing the browser default', () => {
    /*
     * The calculator commits to a single dark look and has no prefers-color-scheme block, so
     * this page inherits that. What matters then is that the colours are defined on bare
     * :root and that body paints an explicit background — a transparent body would show
     * white behind the navy cards in a light-mode browser.
     */
    expect(html).toMatch(/:root\s*\{[^}]*--navy:\s*#162840/);
    expect(html).toMatch(/body\s*\{[^}]*background:\s*var\(--navy\)/);
    expect(html).toMatch(/body\s*\{[^}]*color:\s*var\(--white\)/);
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

  it('renders the brief rather than showing raw markdown', () => {
    // The calculator shows formatted output everywhere; raw pipe tables and ** markers
    // would read as the tool being unfinished.
    expect(html).toContain('renderMarkdown');
    expect(html).toContain('id="brief-rendered"');
    expect(html).toContain('.md table');
  });

  it('escapes cell content before adding markup', () => {
    // A client code or category containing an angle bracket must not become HTML.
    expect(html).toMatch(/function inline\(t\)\s*\{\s*return esc\(t\)/);
  });

  it('lets the [hidden] attribute win over the calculator\u2019s display rules', () => {
    // .btn is inline-flex and .score-block is flex, both of which beat [hidden] — which
    // left "Download brief" and an empty score block on screen before anything was run.
    expect(html).toContain('[hidden] { display: none !important; }');
  });

  it('does not tell a browser user to pass a CLI flag', () => {
    expect(html).not.toContain('--no-llm');
    expect(html).toContain('press Copy for Claude below');
  });

  it('takes its theme from the calculator', () => {
    // Not a copy — extracted at build time, so restyling index.html restyles this too.
    expect(html).toContain('Extracted from index.html at build time');
    for (const token of ['--navy:#162840', '--cyan:#20F6F8', '.site-header', '.brand-logo', '.tier-chip']) {
      expect(html).toContain(token);
    }
  });

  it('is small enough to open over a phone connection', () => {
    const kb = statSync(PAGE).size / 1024;
    expect(kb).toBeLessThan(250);
  });
});

/**
 * The two tools must stay separable on a phone home screen.
 *
 * The calculator qualifies prospects and picks a Forge Track before an engagement starts; the
 * analyst scores an engagement that is already running. They are used at different moments by
 * different people, and they live on the same origin.
 *
 * They originally shared one manifest, whose `start_url` was `"./"` — the calculator. Adding
 * the analyst to an Android home screen therefore produced an icon that opened the calculator,
 * and because both icons were the same cyan hexagon there was no way to tell from the home
 * screen that anything was wrong. That is the failure these tests exist to prevent: not a
 * cosmetic one, but the wrong tool opening silently.
 */
describe('the calculator and the analyst do not converge', () => {
  const ANALYST_HTML = join('..', 'analyst.html');
  const CALC_HTML = join('..', 'index.html');

  const analystHtml = readFileSync(ANALYST_HTML, 'utf8');
  const calcHtml = readFileSync(CALC_HTML, 'utf8');

  const manifest = (name: string) =>
    JSON.parse(readFileSync(join('..', name), 'utf8')) as Record<string, unknown>;
  const analystManifest = manifest('analyst.webmanifest');
  const calcManifest = manifest('manifest.webmanifest');

  const linked = (html: string, rel: string): string => {
    const m = new RegExp(`<link[^>]*rel="${rel}"[^>]*>`).exec(html);
    expect(m, `no rel="${rel}" link found`).not.toBeNull();
    return /href="([^"]+)"/.exec(m![0])?.[1] ?? '';
  };

  it('each page links its own manifest', () => {
    expect(linked(analystHtml, 'manifest')).toBe('analyst.webmanifest');
    expect(linked(calcHtml, 'manifest')).toBe('manifest.webmanifest');
  });

  it('the analyst manifest opens the analyst, not the calculator', () => {
    // The original bug in one assertion. "./" is the calculator.
    expect(analystManifest['start_url']).toBe('./analyst.html');
    expect(calcManifest['start_url']).toBe('./');
    expect(analystManifest['start_url']).not.toBe(calcManifest['start_url']);
  });

  it('the two install names are distinguishable in a home-screen label', () => {
    expect(analystManifest['name']).not.toBe(calcManifest['name']);
    expect(analystManifest['short_name']).not.toBe(calcManifest['short_name']);
    /*
     * A home screen truncates the label to roughly a dozen characters, so a difference that
     * only appears in a long suffix is no difference at all. Both names deliberately keep the
     * "Forge" prefix — they are one product family — which is why the icon colour, not the
     * label, is the primary way to tell them apart. This only checks the label does not stop
     * carrying information altogether.
     */
    const LABEL_WIDTH = 11;
    const a = String(analystManifest['short_name']).slice(0, LABEL_WIDTH);
    const c = String(calcManifest['short_name']).slice(0, LABEL_WIDTH);
    expect(a === c, `both labels truncate to "${a}" on a phone`).toBe(false);
  });

  it('the two manifests share no icon file', () => {
    const srcs = (m: Record<string, unknown>) =>
      (m['icons'] as { src: string }[]).map((i) => i.src);
    const shared = srcs(analystManifest).filter((s) => srcs(calcManifest).includes(s));
    expect(shared, 'a shared icon file means two identical home-screen icons').toEqual([]);
  });

  it('every icon a manifest names actually exists', () => {
    for (const m of [analystManifest, calcManifest]) {
      for (const icon of m['icons'] as { src: string; sizes: string }[]) {
        expect(existsSync(join('..', icon.src)), `${icon.src} is missing`).toBe(true);
      }
    }
    // Both purposes are covered, or the Android install prompt falls back to a screenshot.
    const purposes = (m: Record<string, unknown>) =>
      (m['icons'] as { purpose: string }[]).map((i) => i.purpose);
    expect(purposes(analystManifest)).toContain('maskable');
  });

  it('the iOS home-screen icons are different images, not just different names', () => {
    // iOS ignores the manifest, so apple-touch-icon is the whole story there.
    const a = linked(analystHtml, 'apple-touch-icon');
    const c = linked(calcHtml, 'apple-touch-icon');
    expect(a).not.toBe(c);
    expect(read(join('..', a)).equals(read(join('..', c)))).toBe(false);
  });

  it('the browser-tab favicons differ too', () => {
    // Both are inline data URIs, so comparing the href compares the image.
    expect(linked(analystHtml, 'icon')).not.toBe(linked(calcHtml, 'icon'));
  });

  it('the analyst build did not touch the calculator', () => {
    // The calculator is the qualification tool and predates all of this. It must still be a
    // standalone page that knows nothing about the analyst.
    expect(calcHtml).not.toContain('analyst.html');
    expect(calcHtml).not.toContain('analyst.webmanifest');
    expect(calcHtml).toContain('Forge Tools');
  });
});
