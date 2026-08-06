/**
 * The only model call in the codebase.
 *
 * It writes two prose sections from figures the engine already computed. It is told not
 * to compute, and the validator below enforces that: every number in the returned prose
 * must appear in the input payload, or the response is rejected.
 *
 * The check is the point. A model asked to write about figures will helpfully produce
 * adjacent ones — a rounded total, an implied percentage, a plausible benchmark — and a
 * fabricated number inside a paid advisory deliverable is the failure this whole
 * architecture exists to prevent.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Analysis } from '../engine/pipeline.js';
import { isAsk, type Tagged } from '../types/tagged.js';
import { AREA_NAME, isScored, LEVEL_NAME, TRACK, type AreaId } from '../engine/scoring.js';
import type { Prose } from '../render/brief.js';

const MODEL = 'claude-opus-5';
const PROMPT_VERSION = 'analyst-v1.md';

function promptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'prompts', PROMPT_VERSION);
}

export function loadSystemPrompt(): string {
  return readFileSync(promptPath(), 'utf8');
}

/** Appended to the versioned prompt. Kept here because it is about this call, not the method. */
const HARD_RULE = `
---

## For this call

You are given computed figures. Do not compute, adjust, or introduce any number that is
not in the payload below. Respond with a single JSON object and nothing else — no markdown
fences, no preamble, no trailing commentary.

{
  "finding": "two or three sentences, a statement not a hedge",
  "sprint": {
    "fix":      { "directive": "...", "hypothesis": "...", "falsifiedBy": "..." },
    "run":      { "directive": "...", "startsIn": "...", "endsIn": "..." },
    "optimise": { "directive": "..." }
  },
  "highestRoiClaim": false
}

"hypothesis" and "falsifiedBy" on fix, and "startsIn"/"endsIn" on run, may be omitted when
they do not apply. Every other field is required.
`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['finding', 'sprint', 'highestRoiClaim'],
  properties: {
    finding: { type: 'string' },
    sprint: {
      type: 'object',
      additionalProperties: false,
      required: ['fix', 'run', 'optimise'],
      properties: {
        fix: {
          type: 'object',
          additionalProperties: false,
          required: ['directive'],
          properties: {
            directive: { type: 'string' },
            hypothesis: { type: 'string' },
            falsifiedBy: { type: 'string' },
          },
        },
        run: {
          type: 'object',
          additionalProperties: false,
          required: ['directive'],
          properties: {
            directive: { type: 'string' },
            startsIn: { type: 'string' },
            endsIn: { type: 'string' },
          },
        },
        optimise: {
          type: 'object',
          additionalProperties: false,
          required: ['directive'],
          properties: { directive: { type: 'string' } },
        },
      },
    },
    highestRoiClaim: { type: 'boolean' },
  },
} as const;

// ─── Payload ───────────────────────────────────────────────────────────────────

const val = (t: Tagged<number> | undefined): number | null => {
  if (t === undefined || isAsk(t)) return null;
  return t.value;
};

export interface Payload {
  readonly clientCode: string;
  readonly period: { start: string; end: string; days: number; campaignInflated: boolean };
  readonly category: string;
  readonly blendedGmv: number | null;
  readonly platforms: readonly Record<string, unknown>[];
  readonly benchmark: {
    cvr: number | null;
    origin?: string;
    internal: boolean;
    sourcePlatform?: string;
    note: string;
  };
  readonly pressure: readonly Record<string, unknown>[];
  readonly blocker: { blocked: string; title: string; message: string };
  readonly gps: readonly Record<string, unknown>[];
  readonly track: {
    name: string | null;
    platform: string | null;
    constraint: string | null;
    metric: string | null;
  };
  readonly sizing: Record<string, unknown> | null;
  readonly runnerUp: Record<string, unknown> | null;
  readonly gaps: readonly string[];
}

export function buildPayload(a: Analysis): Payload {
  const target = a.targetPlatform;
  const areaIds: AreaId[] = ['traffic', 'conversion', 'basket', 'campaign', 'operations', 'profitability'];

  return {
    clientCode: a.engagement.clientCode,
    period: {
      start: a.engagement.periodStart.toISOString().slice(0, 10),
      end: a.engagement.periodEnd.toISOString().slice(0, 10),
      days: a.periodDays,
      campaignInflated: a.sanity.campaignInflated,
    },
    category: a.engagement.category,
    blendedGmv: val(a.blendedGmv),
    platforms: a.platforms.map((p) => ({
      platform: p.data.platform,
      gmv: val(p.data.gmv),
      revenueSharePct: val(p.revenueSharePct),
      sessions: val(p.data.sessions),
      buyers: val(p.data.buyers),
      orders: val(p.data.orders),
      normalisedCvrPct: val(p.cvr.cvr),
      platformHeadlineCvrPct: val(p.cvr.headline),
      aov: val(p.data.aov),
      revenuePerVisitor: val(p.revenuePerVisitor),
      revenuePerBuyer: val(p.revenuePerBuyer),
      organicSharePct: val(p.data.organicSharePct),
      promoRevenuePct: val(p.data.promoRevenuePct),
      adSpend: val(p.data.adSpend),
      roas: val(p.data.roas),
      grossMarginPct: val(p.data.grossMarginPct),
      cancellationRatePct: val(p.cancellationRate),
      leakageRm: val(p.leakage.value),
      leakagePct: val(p.leakage.sharePct),
      addToCartUsers: val(p.data.addToCartUsers),
      // Buyers subtracted from add-to-cart users: people who chose the product and
      // stopped. This is the list the Run directive should target.
      addToCartMinusBuyers:
        val(p.data.addToCartUsers) !== null && val(p.data.buyers) !== null
          ? val(p.data.addToCartUsers)! - val(p.data.buyers)!
          : null,
      wishlistUsers: val(p.data.wishlistUsers),
      topSkus: p.data.topSkus ?? [],
      cvrRatioAgainstBenchmark: p.scores.cvrRatio ?? null,
    })),
    benchmark: {
      cvr: val(target?.scores.benchmark.cvr),
      ...(target?.scores.benchmark.origin !== undefined ? { origin: target.scores.benchmark.origin } : {}),
      internal: target?.scores.benchmark.internalBenchmark ?? false,
      ...(target?.scores.benchmark.sourcePlatform !== undefined
        ? { sourcePlatform: target.scores.benchmark.sourcePlatform }
        : {}),
      note: target?.scores.benchmark.note ?? 'no benchmark resolved',
    },
    pressure: areaIds.map((id) => {
      const b = a.business[id]!;
      return {
        area: AREA_NAME[id],
        businessLevel: isScored(b.level) ? LEVEL_NAME[b.level.level] : 'Unscored',
        reason: b.level.reason,
        perPlatform: b.perPlatform.map((x) => ({
          platform: x.platform,
          level: isScored(x.score) ? LEVEL_NAME[x.score.level] : 'Unscored',
          steppedLevel: x.steppedLevel === undefined ? null : LEVEL_NAME[x.steppedLevel],
          revenueSharePct: x.sharePct ?? null,
        })),
      };
    }),
    blocker: {
      blocked: String(a.blockers.blocked),
      title: a.blockers.title,
      message: a.blockers.message,
    },
    gps: a.track.rows.map((r) => ({
      area: r.areaName,
      level: r.levelName,
      impact: r.impact,
      score: r.score ?? null,
    })),
    track: {
      name: a.track.activeTrack ? TRACK[a.track.activeTrack].name : null,
      platform: a.track.platform ?? null,
      constraint: a.track.activeTrack ? TRACK[a.track.activeTrack].constraint : null,
      metric: a.track.activeTrack ? TRACK[a.track.activeTrack].metric : null,
    },
    sizing:
      a.sizing === undefined
        ? null
        : {
            metric: a.sizing.metricName,
            targetMultiplier: a.sizing.targetMultiplier,
            targetMetricValue: val(a.sizing.target.targetMetric),
            targetUpliftRmPerMonth: val(a.sizing.target.uplift),
            parityMetricValue: val(a.sizing.fullGap.targetMetric),
            fullGapUpliftRmPerMonth: val(a.sizing.fullGap.uplift),
          },
    runnerUp:
      a.track.runnerUp === undefined
        ? null
        : {
            track: TRACK[a.track.runnerUp.track].name,
            platform: a.track.runnerUp.platform ?? null,
            score: a.track.runnerUp.score,
            targetUpliftRmPerMonth: a.runnerUpSizing ? val(a.runnerUpSizing.target.uplift) : null,
          },
    gaps: a.gaps.map((g) => g.question),
  };
}

// ─── Validation ────────────────────────────────────────────────────────────────

/** Every number that appears anywhere in the payload, as a set of canonical strings. */
function allowedNumbers(payload: unknown): Set<string> {
  const out = new Set<string>();
  const add = (n: number): void => {
    if (!Number.isFinite(n)) return;
    // A figure may legitimately be written rounded, truncated, or with the cents
    // dropped, so every plausible rendering of the same value is allowed.
    out.add(canon(n));
    out.add(canon(Math.round(n)));
    out.add(canon(Math.trunc(n)));
    out.add(canon(Number(n.toFixed(1))));
    out.add(canon(Number(n.toFixed(2))));
    // Round to 2 significant-ish places for large money figures written as "RM30,400".
    if (Math.abs(n) >= 1000) {
      out.add(canon(Math.round(n / 100) * 100));
      out.add(canon(Math.round(n / 1000) * 1000));
    }
    // A ratio quoted as a percentage, e.g. 0.634 written as "42%" of the benchmark.
    if (Math.abs(n) < 10) {
      out.add(canon(Math.round(n * 100)));
      out.add(canon(Number((n * 100).toFixed(1))));
    }
  };
  const walk = (v: unknown): void => {
    if (typeof v === 'number') add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk);
    else if (typeof v === 'string') {
      // Numbers embedded in payload strings — reasons, notes, gap questions — count
      // as given. They came out of the engine.
      for (const m of v.matchAll(/-?\d[\d,]*(\.\d+)?/g)) {
        const n = Number(m[0].replace(/,/g, ''));
        if (Number.isFinite(n)) add(n);
      }
    }
  };
  walk(payload);
  return out;
}

function canon(n: number): string {
  // -0 and 0 must compare equal; trailing zeros must not create a distinct key.
  const r = Object.is(n, -0) ? 0 : n;
  return String(Number(r.toFixed(4)));
}

/**
 * Ordinals, small counts, and calendar figures a directive needs in order to be a
 * sentence ("the top 5 listings", "a 7-day voucher", "within 30 days"). Excluding these
 * is what keeps the check from rejecting every usable response.
 */
const PROSE_NUMBERS = new Set(
  [
    0, 1, 2, 3, 4, 5, 6, 7, 10, 12, 14, 20, 21, 24, 25, 28, 30, 31, 48, 60, 72, 90, 100,
  ].map(canon),
);

export interface ValidationProblem {
  readonly kind: 'invented-number' | 'wrong-directive-count' | 'forbidden-phrase';
  readonly detail: string;
}

export function validateProse(prose: Prose, payload: unknown): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  const allowed = allowedNumbers(payload);

  const texts = [
    prose.finding,
    prose.sprint.fix.directive,
    prose.sprint.fix.hypothesis ?? '',
    prose.sprint.fix.falsifiedBy ?? '',
    prose.sprint.run.directive,
    prose.sprint.run.startsIn ?? '',
    prose.sprint.run.endsIn ?? '',
    prose.sprint.optimise.directive,
  ];
  const joined = texts.join('\n');

  for (const m of joined.matchAll(/-?\d[\d,]*(\.\d+)?/g)) {
    const raw = m[0];
    const n = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const key = canon(n);
    if (allowed.has(key) || PROSE_NUMBERS.has(key)) continue;
    problems.push({
      kind: 'invented-number',
      detail: `the figure ${raw} does not appear in the supplied data`,
    });
  }

  const directives = [
    prose.sprint.fix.directive,
    prose.sprint.run.directive,
    prose.sprint.optimise.directive,
  ].filter((d) => typeof d === 'string' && d.trim() !== '');
  if (directives.length !== 3) {
    problems.push({
      kind: 'wrong-directive-count',
      detail: `expected exactly three directives, got ${directives.length}`,
    });
  }

  // The consultancy advises; the client executes. First person plural in a directive
  // inverts the entire commercial relationship.
  const forbidden: readonly [RegExp, string][] = [
    [/\bwe will\b/i, '"we will"'],
    [/\bwe'll\b/i, '"we\'ll"'],
    [/\bwe can handle\b/i, '"we can handle"'],
    [/\blet us handle\b/i, '"let us handle"'],
    [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'an emoji'],
    [/!/, 'an exclamation mark'],
  ];
  for (const [re, label] of forbidden) {
    if (re.test(joined)) {
      problems.push({ kind: 'forbidden-phrase', detail: `output contains ${label}` });
    }
  }

  return problems;
}

// ─── The call ──────────────────────────────────────────────────────────────────

export interface ProseClient {
  create(args: {
    system: string;
    userJson: string;
  }): Promise<string>;
}

/** Real client. Adaptive thinking is on by default on this model; effort is set high. */
export function anthropicClient(client = new Anthropic()): ProseClient {
  return {
    async create({ system, userJson }) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system,
        output_config: {
          effort: 'high',
          format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
        },
        messages: [{ role: 'user', content: userJson }],
      } as Parameters<typeof client.messages.create>[0]);

      const msg = response as Anthropic.Message;
      if (msg.stop_reason === 'refusal') {
        throw new Error('model declined the request; nothing written');
      }
      const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
      if (!text) throw new Error('no text block in response');
      return text.text;
    },
  };
}

function parseProse(raw: string): Prose {
  // Structured outputs should make fences impossible, but a stray fence would be a
  // parse failure rather than a bad brief, so it is cheap to tolerate.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned) as Prose;
  if (
    typeof parsed?.finding !== 'string' ||
    typeof parsed?.sprint?.fix?.directive !== 'string' ||
    typeof parsed?.sprint?.run?.directive !== 'string' ||
    typeof parsed?.sprint?.optimise?.directive !== 'string'
  ) {
    throw new Error('response JSON does not match the expected shape');
  }
  return parsed;
}

export interface WriteResult {
  readonly prose: Prose;
  readonly attempts: number;
  /** Problems found on the first attempt and corrected on the retry. */
  readonly correctedProblems: readonly ValidationProblem[];
}

/**
 * One retry, with the offending figures quoted back. A second failure fails the run —
 * emitting prose that cites a number nobody computed would defeat the point of every
 * other file in this repository.
 */
export async function writeProse(
  analysis: Analysis,
  client: ProseClient,
  systemPrompt = loadSystemPrompt(),
): Promise<WriteResult> {
  const payload = buildPayload(analysis);
  const userJson = JSON.stringify(payload, null, 2);
  const system = systemPrompt + HARD_RULE;

  const first = parseProse(await client.create({ system, userJson }));
  const problems = validateProse(first, payload);
  if (problems.length === 0) return { prose: first, attempts: 1, correctedProblems: [] };

  const complaint =
    `Your previous response was rejected:\n` +
    problems.map((p) => `- ${p.detail}`).join('\n') +
    `\n\nRewrite it. Use only figures present in the data below, and keep to exactly three ` +
    `directives.\n\n${userJson}`;

  const second = parseProse(await client.create({ system, userJson: complaint }));
  const stillWrong = validateProse(second, payload);
  if (stillWrong.length > 0) {
    throw new Error(
      'prose failed validation twice; refusing to emit a brief citing figures nobody computed: ' +
        stillWrong.map((p) => p.detail).join('; '),
    );
  }
  return { prose: second, attempts: 2, correctedProblems: problems };
}
