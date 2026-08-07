/**
 * Screenshot intake.
 *
 * A vision call reads figures off Seller Centre screenshots. It is the one place in the
 * codebase where a model produces numbers, and it is fenced accordingly:
 *
 *  - Every figure comes back with the label the model saw beside it, so the read can be
 *    checked against the image rather than trusted.
 *  - A figure that is blurred, cropped, or partially covered comes back null with a stated
 *    reason. Never a best guess — a misread digit in a conversion rate changes which track
 *    activates.
 *  - The result is a PendingIntake. Nothing reaches the engine until confirm() is called.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { data, type Tagged } from '../types/tagged.js';
import type { Engagement, PlatformData, PlatformName } from '../types/datasheet.js';
import type { PendingIntake, Question, ReadField } from './pending.js';
import { renderEcho } from './pending.js';

const MODEL = 'claude-opus-5';

const READ_FIELDS = [
  'sessions',
  'buyers',
  'orders',
  'headlineCvr',
  'aov',
  'gmv',
  'organicSharePct',
  'promoRevenuePct',
  'adSpend',
  'roas',
  'grossMarginPct',
  'cancelledOrders',
  'cancelledValue',
  'refundedOrders',
  'refundedValue',
  'addToCartUsers',
  'wishlistUsers',
] as const;

type ReadFieldName = (typeof READ_FIELDS)[number];

const SYSTEM = `
You read figures off e-commerce Seller Centre screenshots. You do not analyse, interpret, or
compute — you transcribe.

Rules, in order of importance:

1. **Never guess a digit.** If a figure is blurred, cropped, cut off at an edge, overlapped by
   a cursor or tooltip, or ambiguous for any reason, return it with "value": null and say why
   in "illegible". A wrong digit in a conversion rate changes which growth track a consultancy
   recommends to a paying client. An admitted gap costs one question; a wrong number costs the
   engagement.

2. **Transcribe, do not convert.** Report the number as shown. Strip only thousands separators
   and currency symbols. If a figure reads "6.33%", the value is 6.33. If it reads "RM310,654.62",
   the value is 310654.62.

3. **Quote the on-screen label** for every figure in "labelSeen", exactly as it appears. That is
   how a human checks your read against the image.

4. **Do not compute a field that is not shown.** If AOV is not on screen, do not divide revenue
   by orders. Omit it.

5. **Do not report a figure you are inferring from a chart** unless the value is printed as text.
   A bar you are estimating the height of is not a figure.

Return a single JSON object and nothing else:

{
  "platform": "Shopee" | "Lazada" | "TikTok" | "Own site" | null,
  "periodStart": "YYYY-MM-DD" | null,
  "periodEnd": "YYYY-MM-DD" | null,
  "figures": [
    { "field": "<one of the field names given>", "value": <number> | null,
      "labelSeen": "<the on-screen label, verbatim>", "illegible": "<why, if value is null>" }
  ],
  "notes": "<anything a reader should know — a filter applied on screen, a date range that does not match, a currency other than MYR>"
}
`.trim();

const MEDIA: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function mediaType(path: string): string {
  const m = MEDIA[extname(path).toLowerCase()];
  if (m === undefined) {
    throw new Error(`unsupported image type: ${extname(path)} (use png, jpg, gif, or webp)`);
  }
  return m;
}

export interface RawFigure {
  readonly field: string;
  readonly value: number | null;
  readonly labelSeen: string;
  readonly illegible?: string;
}

export interface RawRead {
  readonly platform: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly figures: readonly RawFigure[];
  readonly notes?: string;
}

export interface VisionClient {
  read(images: readonly { data: string; mediaType: string }[], system: string): Promise<string>;
}

export function anthropicVisionClient(client = new Anthropic()): VisionClient {
  return {
    async read(images, system) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system,
        output_config: { effort: 'high' },
        messages: [
          {
            role: 'user',
            content: [
              ...images.map((img) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: img.mediaType as 'image/png', data: img.data },
              })),
              {
                type: 'text' as const,
                text:
                  `Transcribe every figure you can read from these screenshots. Field names to use: ` +
                  `${READ_FIELDS.join(', ')}. Omit fields that are not shown.`,
              },
            ],
          },
        ],
      });
      if (response.stop_reason === 'refusal') throw new Error('vision read declined');
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
      if (!text) throw new Error('no text block in vision response');
      return text.text;
    },
  };
}

function parseRead(raw: string): RawRead {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned) as RawRead;
  if (!Array.isArray(parsed?.figures)) throw new Error('vision response has no figures array');
  return parsed;
}

export interface ScreenshotIntakeOptions {
  readonly clientCode: string;
  readonly category: string;
  /** Overrides what the model read, when a human has already told us. */
  readonly platform?: PlatformName;
  readonly periodStart?: string;
  readonly periodEnd?: string;
}

const PLATFORMS: readonly string[] = ['Shopee', 'Lazada', 'TikTok', 'Own site'];

export async function readScreenshots(
  paths: readonly string[],
  client: VisionClient,
  opts: ScreenshotIntakeOptions,
): Promise<PendingIntake> {
  if (paths.length === 0) throw new Error('no screenshots supplied');
  const images = paths.map((p) => ({
    data: readFileSync(p).toString('base64'),
    mediaType: mediaType(p),
  }));

  const read = parseRead(await client.read(images, SYSTEM));

  const platform = opts.platform ?? (PLATFORMS.includes(read.platform ?? '') ? (read.platform as PlatformName) : undefined);
  const start = opts.periodStart ?? read.periodStart ?? undefined;
  const end = opts.periodEnd ?? read.periodEnd ?? undefined;

  const fields: ReadField[] = [];
  const values: Partial<Record<ReadFieldName, number>> = {};

  for (const f of read.figures) {
    const known = (READ_FIELDS as readonly string[]).includes(f.field);
    if (!known) continue; // a field name we do not model is not silently coerced into one we do
    const name = f.field as ReadFieldName;
    if (f.value === null || typeof f.value !== 'number' || !Number.isFinite(f.value)) {
      fields.push({
        field: name,
        ...(platform !== undefined ? { platform } : {}),
        value: null,
        source: `read as "${f.labelSeen}"`,
        illegible: f.illegible ?? 'the model returned no value and no reason',
      });
      continue;
    }
    values[name] = f.value;
    fields.push({
      field: name,
      ...(platform !== undefined ? { platform } : {}),
      value: f.value,
      source: `read as "${f.labelSeen}"`,
    });
  }

  const questions: Question[] = [];
  if (platform === undefined) {
    questions.push({
      about: 'platform',
      question: 'Which platform are these screenshots from? It could not be read reliably.',
      options: PLATFORMS,
    });
  }
  if (start === undefined || end === undefined) {
    questions.push({
      about: 'period',
      question: 'What period do these screenshots cover? No date range was legible.',
    });
  }
  if (read.notes !== undefined && read.notes.trim() !== '') {
    questions.push({
      about: 'note from the read',
      question: `${read.notes} — confirm this does not change how the figures should be used.`,
    });
  }

  /*
   * A screenshot read is always echoed and always blocks, even when nothing was illegible.
   * The confirmation is the control: it is the only thing standing between a transcription
   * error and a client-facing brief.
   */
  const engagement =
    platform !== undefined && start !== undefined && end !== undefined && questions.length === 0
      ? buildEngagement(opts, platform, values, start, end)
      : undefined;

  const pending: PendingIntake = {
    kind: 'screenshot',
    fields,
    questions,
    echo: '',
    ...(engagement !== undefined ? { engagement } : {}),
  };
  return { ...pending, echo: renderScreenshotEcho(pending, paths, read.notes) };
}

function buildEngagement(
  opts: ScreenshotIntakeOptions,
  platform: PlatformName,
  values: Partial<Record<ReadFieldName, number>>,
  start: string,
  end: string,
): Engagement {
  const p: Record<string, unknown> = { platform };
  for (const [field, value] of Object.entries(values) as [ReadFieldName, number][]) {
    p[field] = data(value, 'read from screenshot') as Tagged<number>;
  }
  return {
    clientCode: opts.clientCode,
    periodStart: new Date(start),
    periodEnd: new Date(end),
    category: opts.category,
    platforms: [p as unknown as PlatformData],
  };
}

function renderScreenshotEcho(
  pending: PendingIntake,
  paths: readonly string[],
  notes?: string,
): string {
  const lines: string[] = [
    `Read ${paths.length} screenshot(s): ${paths.join(', ')}`,
    '',
    renderEcho(pending),
  ];
  if (notes !== undefined && notes.trim() !== '') {
    lines.push('', `**Note from the read:** ${notes}`);
  }
  lines.push(
    '',
    '**Every figure above came out of an image.** Check each one against the screenshot before ' +
      'confirming. This step is not a formality — it is the only check between a transcription ' +
      'error and a brief a client acts on.',
  );
  return lines.join('\n');
}

export { READ_FIELDS, SYSTEM as SCREENSHOT_SYSTEM_PROMPT };
