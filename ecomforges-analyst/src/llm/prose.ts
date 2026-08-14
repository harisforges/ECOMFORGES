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
import type { Prose } from '../render/brief.js';
import { buildPayload, type Payload } from './payload.js';
import { validateProse, type ValidationProblem } from './validate.js';

/* Re-exported so existing callers and tests keep one import site for the call and its
   guard. The guard itself lives in validate.ts because the browser needs it without
   the SDK — see the comment there. */
export { buildPayload, type Payload };
export { validateProse, type ValidationProblem };

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
      });

      const msg = response;
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
