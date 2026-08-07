/**
 * Where a conversion benchmark is allowed to come from.
 *
 * Exactly three places, in precedence order. There is no fourth, and in particular there
 * is no default, category average, or hardcoded figure anywhere in this directory — a
 * test asserts that by scanning the source. If none of the three is available, Conversion
 * comes back unscored and the brief says so.
 */

import type { PlatformData, PlatformName } from '../types/datasheet.js';
import { ask, bm, calc, data, isAsk, pct, type Tagged } from '../types/tagged.js';
import { lookup, type ParsedBenchmarks } from '../benchmarks/parse.js';
import { normaliseCvr } from './normalise.js';

export type BenchmarkOrigin = 'supplied' | 'file' | 'internal';

export interface ResolvedBenchmark {
  /** The benchmark conversion rate as a percentage. ASK when none is available. */
  readonly cvr: Tagged<number>;
  readonly origin?: BenchmarkOrigin;
  /** True when the client's own strongest platform was used. */
  readonly internalBenchmark: boolean;
  /** The platform the internal benchmark came from. */
  readonly sourcePlatform?: PlatformName;
  /**
   * False for an internal benchmark. An internal figure scores this client only —
   * anything that would aggregate it across engagements must refuse.
   */
  readonly comparableAcrossClients: boolean;
  /** Written into the brief so the reader knows which of the three routes was taken. */
  readonly note: string;
}

export interface ResolveInput {
  readonly platforms: readonly PlatformData[];
  readonly category: string;
  readonly benchmarks: ParsedBenchmarks;
  /** A figure typed in for this run by the consultant. Highest precedence. */
  readonly suppliedCvr?: number;
  /** The platform being scored. Its own CVR never becomes its own benchmark. */
  readonly forPlatform: PlatformName;
}

const ASK_TEXT = (platform: string, category: string): string =>
  `no benchmark on file for ${platform} / ${category} — need one to score Conversion`;

export function resolveConversionBenchmark(input: ResolveInput): ResolvedBenchmark {
  const { platforms, category, benchmarks, suppliedCvr, forPlatform } = input;

  // 1 — supplied for this run.
  if (suppliedCvr !== undefined) {
    return {
      cvr: data(suppliedCvr, 'supplied by Haris'),
      origin: 'supplied',
      internalBenchmark: false,
      comparableAcrossClients: true,
      note: `Conversion benchmark of ${pct(suppliedCvr)} supplied for this run.`,
    };
  }

  // 2 — a usable row from the benchmark file.
  const hit = lookup(benchmarks, forPlatform, category, 'CVR');
  if (hit.found && hit.row.value !== undefined) {
    return {
      cvr: bm(hit.row.value, hit.row.rowId),
      origin: 'file',
      internalBenchmark: false,
      comparableAcrossClients: true,
      note:
        `Conversion benchmark of ${pct(hit.row.value)} from the benchmark file ` +
        `(${hit.row.rowId}, n=${hit.row.n ?? '?'}).`,
    };
  }

  // 3 — the client's own strongest platform.
  //
  // This is observed data, not an invented figure: same products, same brand, same
  // period, same pricing team. Every variable is held constant except the platform and
  // the listing, which makes it stronger evidence for this decision than an external
  // category average would be.
  const scored = platforms
    .map((p) => ({ platform: p.platform, cvr: normaliseCvr(p).cvr }))
    .filter((x): x is { platform: PlatformName; cvr: Tagged<number> } => !isAsk(x.cvr));

  // Needs at least two platforms with a computable CVR — otherwise there is nothing to
  // compare against and a single platform would become its own benchmark, which is
  // circular and would always score Stable.
  if (scored.length >= 2) {
    const best = scored.reduce((a, b) =>
      (b.cvr as { value: number }).value > (a.cvr as { value: number }).value ? b : a,
    );
    if (best.platform !== forPlatform) {
      const v = (best.cvr as { value: number }).value;
      return {
        cvr: calc(v, `${best.platform} normalised buyer conversion — the client's strongest platform`),
        origin: 'internal',
        internalBenchmark: true,
        sourcePlatform: best.platform,
        comparableAcrossClients: false,
        note:
          `No benchmark on file, so ${best.platform}'s own conversion of ${pct(v)} is the benchmark. ` +
          `Same catalogue, same brand, same period — every variable held constant except the platform ` +
          `and the listing. This scores ${forPlatform} against the client's own best channel; it is not ` +
          `comparable across clients until the same figure reaches n=3 in the benchmark file.`,
      };
    }
    // The strongest platform is the one being scored: by definition at or above the
    // internal benchmark, so it is Stable and needs no external figure.
    return {
      cvr: calc(
        (best.cvr as { value: number }).value,
        `${forPlatform} is the client's strongest platform — scored against itself, therefore Stable`,
      ),
      origin: 'internal',
      internalBenchmark: true,
      sourcePlatform: best.platform,
      comparableAcrossClients: false,
      note: `${forPlatform} is the client's strongest channel at ${pct((best.cvr as { value: number }).value)}. Nothing in this engagement converts better, so Conversion is Stable here by construction.`,
    };
  }

  return {
    cvr: ask(ASK_TEXT(forPlatform, category)),
    internalBenchmark: false,
    comparableAcrossClients: false,
    note:
      `${ASK_TEXT(forPlatform, category)}. Only one platform has a computable conversion rate, ` +
      `so there is no internal benchmark either. Conversion is unscored; the other five areas still score.`,
  };
}

/**
 * Guard for anything that would aggregate a benchmark across engagements.
 *
 * An internal benchmark is valid for its own client and meaningless as a market figure.
 * This refuses rather than warns.
 */
export function assertAggregatable(b: ResolvedBenchmark): void {
  if (!b.comparableAcrossClients) {
    throw new Error(
      'refusing to aggregate an internal benchmark across clients: it describes one seller, ' +
        'not a category. Record it as a candidate at n=1 instead.',
    );
  }
}
