#!/usr/bin/env tsx
/**
 * Commands:
 *   generate <engagement.json>   render a brief
 *   csv      <file.csv>          read a platform export, state the mapping back
 *   shots    <image...>          read screenshots, echo the figures back
 *   queue                        show the benchmark candidate queue
 *   approve  <platform> <category> <metric>   promote a group into the benchmark file
 *   serve                        the form, on localhost
 *
 * `--no-llm` on generate renders everything except the two prose sections, so the engine
 * can be checked without an API key or a network call.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEngagement } from '../types/load.js';
import { parseBenchmarks, DEFAULT_THRESHOLDS, type ParsedBenchmarks } from '../benchmarks/parse.js';
import { analyse } from '../engine/pipeline.js';
import { renderBrief, type Prose } from '../render/brief.js';
import { confirm, renderEcho } from '../intake/pending.js';
import { readCsv } from '../intake/csv.js';
import { approve, enqueue, group, load, renderQueue, writeToBenchmarkFile } from '../benchmarks/queue.js';
import type { PlatformName } from '../types/datasheet.js';

interface Args {
  readonly command: string;
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string | true>>;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else {
      flags[key] = next;
      i++;
    }
  }
  return { command: positional[0] ?? '', positional: positional.slice(1), flags };
}

const USAGE = `
ecomforges-analyst

  generate <engagement.json>     Render a brief.
      --benchmarks <path>        Benchmark file. Omitted means none on file, which is valid.
      --no-llm                   Engine only; sections 6 and 8 stay as placeholders.
      --out <path>               Also write the brief to a file.
      --queue <path>             Append this brief's benchmark candidates to the queue.

  csv <file.csv> --platform <name> --code <MY-XXX-00> --category <text>
      Read a platform export. Prints the column mapping and the figures for checking.
      --answer <about=column>    Resolve an ambiguous mapping. Repeatable.
      --confirm                  Assert you have checked the echo, and write the engagement.
      --out <path>               Where to write the confirmed engagement JSON.

  shots <image...> --code <MY-XXX-00> --category <text>
      Read Seller Centre screenshots. Prints every figure with the label it was read from.
      --platform <name> --start <YYYY-MM-DD> --end <YYYY-MM-DD>
      --confirm --out <path>     As above. Check every figure against the image first.

  queue --queue <path>           Show the benchmark candidate queue.

  approve <platform> <category> <metric> --queue <path> --benchmarks <path>
      Promote a group into the benchmark file. Refuses below n=3.
      --heading <text>           Target table. Defaults to the metric's own standard table.

  serve --port 4173              The form, on loopback. Holds the API key server-side.
      --benchmarks <path> --queue <path>
`.trim();

function benchmarksFor(path: string | undefined, asOf: string): ParsedBenchmarks {
  if (path === undefined) return { rows: [], rejected: [], thresholds: DEFAULT_THRESHOLDS };
  if (!existsSync(path)) throw new Error(`benchmark file not found: ${path}`);
  return parseBenchmarks(readFileSync(path, 'utf8'), { asOf });
}

const str = (v: string | true | undefined): string | undefined =>
  typeof v === 'string' ? v : undefined;

async function cmdGenerate(args: Args): Promise<number> {
  const file = args.positional[0];
  if (file === undefined) {
    console.error(USAGE);
    return 1;
  }
  const engagement = loadEngagement(readFileSync(file, 'utf8'));
  const asOf = engagement.periodStart.toISOString().slice(0, 7);
  const analysis = analyse(engagement, benchmarksFor(str(args.flags['benchmarks']), asOf));

  let prose: Prose | undefined;
  if (args.flags['no-llm'] !== true) {
    // Imported lazily so --no-llm needs neither the SDK nor an API key.
    const { writeProse, anthropicClient } = await import('../llm/prose.js');
    const result = await writeProse(analysis, anthropicClient());
    prose = result.prose;
    if (result.attempts > 1) {
      console.error(
        `note: first draft rejected (${result.correctedProblems.map((p) => p.detail).join('; ')}); ` +
          `the retry passed.`,
      );
    }
  }

  const brief = renderBrief(analysis, prose, {
    proseHint: 'run without `--no-llm` to fill this section',
  });
  process.stdout.write(brief);

  const out = str(args.flags['out']);
  if (out !== undefined) {
    writeFileSync(out, brief);
    console.error(`\nwritten to ${out}`);
  }

  const queuePath = str(args.flags['queue']);
  if (queuePath !== undefined) {
    const id = `${engagement.clientCode}-${engagement.periodStart.toISOString().slice(0, 10)}`;
    const added = enqueue(queuePath, analysis.benchmarkCandidates, id);
    console.error(
      `${added} benchmark candidate(s) queued in ${queuePath}. Nothing is promoted automatically — ` +
        `run \`queue\` to review.`,
    );
  }
  return 0;
}

function cmdCsv(args: Args): number {
  const file = args.positional[0];
  const platform = str(args.flags['platform']) as PlatformName | undefined;
  const code = str(args.flags['code']);
  const category = str(args.flags['category']);
  if (file === undefined || platform === undefined || code === undefined || category === undefined) {
    console.error(USAGE);
    return 1;
  }

  // --answer about=column, repeatable. A single flag arrives as a string, several as an array.
  const rawAnswers = args.flags['answer'];
  const answerList = Array.isArray(rawAnswers) ? rawAnswers : typeof rawAnswers === 'string' ? [rawAnswers] : [];
  const answers: Record<string, string> = {};
  for (const a of answerList) {
    const eq = a.indexOf('=');
    if (eq > 0) answers[a.slice(0, eq).trim()] = a.slice(eq + 1).trim();
  }

  const { pending } = readCsv(readFileSync(file, 'utf8'), {
    platform,
    clientCode: code,
    category,
    answers,
  });

  process.stdout.write(pending.echo + '\n');

  if (args.flags['confirm'] !== true) {
    console.error(
      '\nNothing was analysed. Check the mapping and the figures above, then re-run with ' +
        '--confirm --out <engagement.json>.',
    );
    return pending.questions.length > 0 ? 2 : 0;
  }

  const engagement = confirm(pending, true);
  const out = str(args.flags['out']) ?? 'engagement.json';
  writeFileSync(out, JSON.stringify(serialise(engagement), null, 2));
  console.error(`\nconfirmed → ${out}`);
  return 0;
}

async function cmdShots(args: Args): Promise<number> {
  const paths = args.positional;
  const code = str(args.flags['code']);
  const category = str(args.flags['category']);
  if (paths.length === 0 || code === undefined || category === undefined) {
    console.error(USAGE);
    return 1;
  }
  const { readScreenshots, anthropicVisionClient } = await import('../intake/screenshot.js');
  const pending = await readScreenshots(paths, anthropicVisionClient(), {
    clientCode: code,
    category,
    ...(str(args.flags['platform']) !== undefined
      ? { platform: str(args.flags['platform']) as PlatformName }
      : {}),
    ...(str(args.flags['start']) !== undefined ? { periodStart: str(args.flags['start'])! } : {}),
    ...(str(args.flags['end']) !== undefined ? { periodEnd: str(args.flags['end'])! } : {}),
  });

  process.stdout.write(pending.echo + '\n');

  if (args.flags['confirm'] !== true) {
    console.error(
      '\nNothing was analysed. Check every figure against the screenshots, then re-run with ' +
        '--confirm --out <engagement.json>.',
    );
    return pending.questions.length > 0 ? 2 : 0;
  }
  const engagement = confirm(pending, true);
  const out = str(args.flags['out']) ?? 'engagement.json';
  writeFileSync(out, JSON.stringify(serialise(engagement), null, 2));
  console.error(`\nconfirmed → ${out}`);
  return 0;
}

function cmdQueue(args: Args): number {
  const path = str(args.flags['queue']) ?? 'benchmarks.queue.jsonl';
  process.stdout.write(renderQueue(group(load(path))) + '\n');
  return 0;
}

function cmdApprove(args: Args): number {
  const [platform, category, metric] = args.positional;
  const queuePath = str(args.flags['queue']) ?? 'benchmarks.queue.jsonl';
  const benchPath = str(args.flags['benchmarks']);
  if (platform === undefined || category === undefined || metric === undefined) {
    console.error(USAGE);
    return 1;
  }
  const groups = group(load(queuePath));
  const g = groups.find(
    (x) =>
      x.platform.toLowerCase() === platform.toLowerCase() &&
      x.category.toLowerCase() === category.toLowerCase() &&
      x.metric.toLowerCase() === metric.toLowerCase(),
  );
  if (g === undefined) {
    console.error(`no queued group for ${platform} / ${category} / ${metric}`);
    return 1;
  }

  const row = approve(g, {
    ...(str(args.flags['current-engagement']) !== undefined
      ? { currentEngagementId: str(args.flags['current-engagement'])! }
      : {}),
  });
  process.stdout.write(row.markdown + '\n');

  if (benchPath !== undefined) {
    const heading = str(args.flags['heading']) ?? row.heading ?? undefined;
    writeToBenchmarkFile(benchPath, row, heading);
    console.error(
      `\nappended under "${heading ?? row.heading}" in ${benchPath} as metric ` +
        `"${row.canonicalMetric}" (n=${row.n})`,
    );
  } else {
    console.error('\nNo --benchmarks path given; the row above was not written anywhere.');
  }
  return 0;
}

async function cmdServe(args: Args): Promise<number> {
  const { startServer } = await import('../server/index.js');
  startServer({
    port: Number(str(args.flags['port']) ?? 4173),
    ...(str(args.flags['benchmarks']) !== undefined ? { benchmarksPath: str(args.flags['benchmarks'])! } : {}),
    ...(str(args.flags['queue']) !== undefined ? { queuePath: str(args.flags['queue'])! } : {}),
    ...(str(args.flags['host']) !== undefined ? { host: str(args.flags['host'])! } : {}),
  });
  return new Promise<number>(() => {}); // runs until interrupted
}

/** Engagement → the JSON shape `loadEngagement` reads back. */
function serialise(e: ReturnType<typeof loadEngagement>): unknown {
  const plain = (v: unknown): unknown => {
    if (v !== null && typeof v === 'object' && 'tag' in v) {
      const t = v as { tag: string; value?: unknown };
      return t.tag === 'ASK' ? null : (t.value ?? null);
    }
    return v;
  };
  return {
    clientCode: e.clientCode,
    periodStart: e.periodStart.toISOString().slice(0, 10),
    periodEnd: e.periodEnd.toISOString().slice(0, 10),
    category: e.category,
    platforms: e.platforms.map((p) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(p)) {
        if (k === 'platform' || k === 'headlineCvrBasis' || k === 'topSkus') out[k] = v;
        else out[k] = plain(v);
      }
      return out;
    }),
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case 'generate':
      return cmdGenerate(args);
    case 'csv':
      return cmdCsv(args);
    case 'shots':
      return cmdShots(args);
    case 'queue':
      return cmdQueue(args);
    case 'approve':
      return cmdApprove(args);
    case 'serve':
      return cmdServe(args);
    default:
      console.error(USAGE);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });

export { renderEcho };
