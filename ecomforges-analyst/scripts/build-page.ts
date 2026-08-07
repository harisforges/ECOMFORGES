/**
 * Builds the single-file browser analyst.
 *
 * Bundles the engine with esbuild, inlines it and the page script into one HTML file, and
 * writes it to the repository root so GitHub Pages serves it beside the calculator.
 *
 * The output must be self-contained: no script src, no external stylesheet, no fetch. It is
 * opened from a phone home screen, sometimes with no signal, and it holds no credential
 * because there is nothing it could call.
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const repoRoot = join(projectRoot, '..');

const OUT = join(repoRoot, 'analyst.html');

async function main(): Promise<void> {
  const result = await build({
    entryPoints: [join(projectRoot, 'src/browser/entry.ts')],
    bundle: true,
    format: 'iife',
    target: ['es2019', 'safari14'],
    platform: 'browser',
    minify: true,
    // The page declares UTF-8, so emit literal characters rather than \uXXXX escapes:
    // "Conversion Forge™" stays readable in View Source and greppable in the output.
    charset: 'utf8',
    write: false,
    legalComments: 'none',
    logLevel: 'warning',
  });

  const engine = result.outputFiles?.[0]?.text;
  if (engine === undefined || engine.trim() === '') throw new Error('esbuild produced no output');

  const shell = readFileSync(join(projectRoot, 'src/browser/shell.html'), 'utf8');
  const ui = readFileSync(join(projectRoot, 'src/browser/ui.js'), 'utf8');

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    // The shell carries its own meta and style; keep it verbatim so View Source stays readable.
    shell.trim(),
    '</head>',
    '<body>',
    '<script>' + engine + '</script>',
    '<script>' + ui + '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');

  // A stray external reference would break the offline promise, so fail the build rather
  // than shipping a page that only works with signal.
  const external = [
    [/<script[^>]+\bsrc=/i, 'an external <script src>'],
    [/<link[^>]+\bhref="https?:/i, 'an external stylesheet'],
    [/\bfetch\s*\(/i, 'a fetch() call'],
    [/XMLHttpRequest/i, 'an XMLHttpRequest'],
    [/https:\/\/api\.anthropic\.com/i, 'a call to the Anthropic API'],
    [/sk-ant-/i, 'something that looks like an API key'],
  ] as const;
  for (const [re, what] of external) {
    if (re.test(html)) throw new Error(`built page contains ${what} — it must be self-contained`);
  }

  writeFileSync(OUT, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`built ${OUT} (${kb} KB, self-contained)`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
