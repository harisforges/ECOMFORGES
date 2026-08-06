#!/usr/bin/env tsx
/**
 * npx tsx src/cli generate <engagement.json> [--benchmarks <path>] [--no-llm] [--out <path>]
 *
 * --no-llm renders everything except sections 6 and 8, so the engine can be checked
 * without an API key or a network call.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadEngagement } from '../types/load.js';
import { parseBenchmarks, DEFAULT_THRESHOLDS, type ParsedBenchmarks } from '../benchmarks/parse.js';
import { analyse } from '../engine/pipeline.js';
import { renderBrief, type Prose } from '../render/brief.js';

interface Args {
  readonly command: string;
  readonly file?: string;
  readonly benchmarks?: string;
  readonly out?: string;
  readonly noLlm: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let benchmarks: string | undefined;
  let out: string | undefined;
  let noLlm = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--no-llm') noLlm = true;
    else if (a === '--benchmarks') benchmarks = argv[++i];
    else if (a === '--out') out = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else positional.push(a);
  }
  return {
    command: positional[0] ?? '',
    ...(positional[1] !== undefined ? { file: positional[1] } : {}),
    ...(benchmarks !== undefined ? { benchmarks } : {}),
    ...(out !== undefined ? { out } : {}),
    noLlm,
  };
}

const USAGE = `
ecomforges-analyst

  npx tsx src/cli generate <engagement.json> [options]

Options
  --benchmarks <path>   Benchmark markdown file. Omitted means no benchmarks on file,
                        which is a valid state — Conversion then scores against the
                        client's own strongest platform, or comes back unscored.
  --no-llm              Engine only. Sections 6 and 8 are left as placeholders.
  --out <path>          Also write the brief to this file.
`.trim();

/**
 * An empty benchmark file is the honest default. Inventing thresholds here would be the
 * same defect the whole design exists to avoid, so the defaults are the model's own
 * scoring rules and the row list stays empty.
 */
function loadBenchmarks(path: string | undefined, asOf: string): ParsedBenchmarks {
  if (path === undefined) {
    return { rows: [], rejected: [], thresholds: DEFAULT_THRESHOLDS };
  }
  if (!existsSync(path)) throw new Error(`benchmark file not found: ${path}`);
  return parseBenchmarks(readFileSync(path, 'utf8'), { asOf });
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command !== 'generate' || args.file === undefined) {
    console.error(USAGE);
    return 1;
  }

  const engagement = loadEngagement(readFileSync(args.file, 'utf8'));
  const asOf = engagement.periodStart.toISOString().slice(0, 7);
  const benchmarks = loadBenchmarks(args.benchmarks, asOf);
  const analysis = analyse(engagement, benchmarks);

  let prose: Prose | undefined;
  if (!args.noLlm) {
    // Imported lazily so --no-llm needs neither the SDK nor an API key.
    const { writeProse, anthropicClient } = await import('../llm/prose.js');
    const result = await writeProse(analysis, anthropicClient());
    prose = result.prose;
    if (result.attempts > 1) {
      console.error(
        `note: first draft rejected (${result.correctedProblems
          .map((p) => p.detail)
          .join('; ')}); the retry passed.`,
      );
    }
  }

  const brief = renderBrief(analysis, prose);
  process.stdout.write(brief);
  if (args.out !== undefined) {
    writeFileSync(args.out, brief);
    console.error(`\nwritten to ${args.out}`);
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
