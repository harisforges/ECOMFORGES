/**
 * Wire-level tests for the two model calls.
 *
 * The other tests stub `ProseClient` and `VisionClient`, which skips the SDK entirely — so
 * they cannot catch a parameter in the wrong place, a response field read by the wrong name,
 * or a `stop_reason` nobody handles. These point the real `Anthropic` client at a local
 * server that speaks the Messages API wire format, capture what actually goes out, and
 * assert the shape against what the API accepts.
 *
 * What this does not cover is Anthropic's inference. Everything up to and including
 * serialisation, transport, response parsing, and error handling is exercised here.
 */

import { describe, expect, it, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { analyse } from '../src/engine/pipeline.js';
import { loadEngagement } from '../src/types/load.js';
import { DEFAULT_THRESHOLDS } from '../src/benchmarks/parse.js';
import { anthropicClient, writeProse, buildPayload } from '../src/llm/prose.js';
import { anthropicVisionClient, readScreenshots } from '../src/intake/screenshot.js';

const EMPTY = { rows: [], rejected: [], thresholds: DEFAULT_THRESHOLDS };
const analysis = analyse(loadEngagement(readFileSync('fixtures/my-bty-09.json', 'utf8')), EMPTY);

/** Figures drawn from the payload, so the validator passes and does not mask a wire bug. */
const payload = buildPayload(analysis);
const lz = payload.platforms.find((p) => p['platform'] === 'Lazada')!;
const GOOD = {
  finding:
    `Traffic is not the problem. Lazada takes ${lz['sessions'] as number} sessions and converts ` +
    `them at 3.87%, against 6.10% on Shopee for the same catalogue.`,
  sprint: {
    fix: { directive: 'Copy the Shopee listing for Glow Serum 30ml onto Lazada, unchanged.' },
    run: { directive: `Send a 7-day voucher to the ${lz['addToCartMinusBuyers'] as number} shoppers who added to cart and did not buy.` },
    optimise: { directive: 'Move RM6,200 of Lazada ad budget onto those listings.' },
  },
  highestRoiClaim: false,
};

interface Captured {
  readonly path: string;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, unknown>;
}

let captured: Captured[] = [];
let respond: () => { status: number; body: unknown } = () => ({
  status: 200,
  body: messageWith(JSON.stringify(GOOD)),
});

/** A response in the real Messages API shape. */
function messageWith(text: string, stopReason = 'end_turn'): unknown {
  return {
    id: 'msg_01WIRETEST',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [{ type: 'text', text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 340, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  };
}

const server: Server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    captured.push({
      path: req.url ?? '',
      headers: req.headers as Record<string, string | undefined>,
      body: raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>),
    });
    const { status, body } = respond();
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const sdk = new Anthropic({ apiKey: 'sk-ant-test-not-a-real-key', baseURL, maxRetries: 0 });

afterAll(() => server.close());
beforeEach(() => {
  captured = [];
  respond = () => ({ status: 200, body: messageWith(JSON.stringify(GOOD)) });
});

describe('the prose call, over the wire', () => {
  it('reaches /v1/messages and returns parsed prose', async () => {
    const r = await writeProse(analysis, anthropicClient(sdk), 'system prompt for the wire test');
    expect(r.attempts).toBe(1);
    expect(r.prose.sprint.fix.directive).toContain('Glow Serum');
    expect(captured).toHaveLength(1);
    expect(captured[0]!.path).toBe('/v1/messages');
    expect(captured[0]!.headers['anthropic-version']).toBe('2023-06-01');
    expect(captured[0]!.headers['x-api-key']).toBe('sk-ant-test-not-a-real-key');
  });

  it('sends the model, max_tokens, system, and a single user turn', async () => {
    await writeProse(analysis, anthropicClient(sdk), 'system prompt for the wire test');
    const b = captured[0]!.body;
    expect(b['model']).toBe('claude-opus-5');
    expect(b['max_tokens']).toBe(16000);
    expect(typeof b['system']).toBe('string');
    expect(b['system']).toContain('system prompt for the wire test');
    // The hard rule is appended to the versioned prompt, not sent as a separate turn.
    expect(b['system']).toContain('Do not compute');
    const messages = b['messages'] as { role: string }[];
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe('user');
  });

  it('puts effort and the JSON schema inside output_config, not top-level', async () => {
    await writeProse(analysis, anthropicClient(sdk), 'sys');
    const b = captured[0]!.body;
    // effort is a field of output_config; top-level would be silently ignored.
    expect(b['effort']).toBeUndefined();
    expect(b['output_format']).toBeUndefined(); // the deprecated parameter
    const oc = b['output_config'] as Record<string, unknown>;
    expect(oc).toBeDefined();
    expect(oc['effort']).toBe('high');
    const format = oc['format'] as Record<string, unknown>;
    expect(format['type']).toBe('json_schema');
    const schema = format['schema'] as Record<string, unknown>;
    expect(schema['required']).toEqual(['finding', 'sprint', 'highestRoiClaim']);
    expect(schema['additionalProperties']).toBe(false);
  });

  it('sends nothing that this model rejects with a 400', async () => {
    await writeProse(analysis, anthropicClient(sdk), 'sys');
    const b = captured[0]!.body;
    // Sampling parameters were removed on Opus 4.7 and later — any of them is a 400.
    expect(b['temperature']).toBeUndefined();
    expect(b['top_p']).toBeUndefined();
    expect(b['top_k']).toBeUndefined();
    // budget_tokens was removed too. Thinking is on by default on this model, so the
    // parameter is omitted entirely rather than configured.
    expect(b['thinking']).toBeUndefined();
    // A trailing assistant turn (prefill) is a 400 on this model.
    const messages = b['messages'] as { role: string }[];
    expect(messages[messages.length - 1]!.role).not.toBe('assistant');
  });

  it('retries over the wire when the first response invents a figure', async () => {
    let call = 0;
    respond = () => {
      call++;
      return {
        status: 200,
        body: messageWith(
          JSON.stringify(
            call === 1
              ? { ...GOOD, finding: 'Lazada converts at 3.87% against a category average of 7.45%.' }
              : GOOD,
          ),
        ),
      };
    };
    const r = await writeProse(analysis, anthropicClient(sdk), 'sys');
    expect(r.attempts).toBe(2);
    expect(captured).toHaveLength(2);
    // The complaint quotes the offending figure back and re-sends the data.
    const second = (captured[1]!.body['messages'] as { content: string }[])[0]!.content;
    expect(second).toContain('7.45');
    expect(second).toContain('rejected');
  });

  it('throws on stop_reason: refusal rather than reading an empty content array', async () => {
    respond = () => ({
      status: 200,
      body: {
        ...(messageWith('') as Record<string, unknown>),
        content: [],
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber', explanation: null },
      },
    });
    await expect(writeProse(analysis, anthropicClient(sdk), 'sys')).rejects.toThrow(/declined/);
  });

  it('surfaces a real API error as a typed SDK exception', async () => {
    respond = () => ({
      status: 401,
      body: { type: 'error', error: { type: 'authentication_error', message: 'x-api-key header is required' } },
    });
    await expect(writeProse(analysis, anthropicClient(sdk), 'sys')).rejects.toBeInstanceOf(
      Anthropic.AuthenticationError,
    );
  });

  it('surfaces a 400 with the API’s own message, not a generic failure', async () => {
    respond = () => ({
      status: 400,
      body: {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'output_config.effort: unexpected value' },
      },
    });
    await expect(writeProse(analysis, anthropicClient(sdk), 'sys')).rejects.toThrow(
      /output_config\.effort/,
    );
  });
});

describe('the vision call, over the wire', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
  );
  const shotPath = '/tmp/ecomforges-wire-shot.png';
  const READ = {
    platform: 'Shopee',
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    figures: [{ field: 'sessions', value: 48200, labelSeen: 'Visitors' }],
  };

  beforeEach(() => {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(shotPath, PNG);
    respond = () => ({ status: 200, body: messageWith(JSON.stringify(READ)) });
  });

  it('sends the image as a base64 block with the right media type, before the text', async () => {
    await readScreenshots([shotPath], anthropicVisionClient(sdk), {
      clientCode: 'MY-BTY-09',
      category: 'Beauty — skincare',
    });
    const b = captured[0]!.body;
    expect(b['model']).toBe('claude-opus-5');
    const content = (b['messages'] as { content: Record<string, unknown>[] }[])[0]!.content;
    // Image first, then the instruction — the documented ordering for document/image input.
    expect(content[0]!['type']).toBe('image');
    const source = content[0]!['source'] as Record<string, unknown>;
    expect(source['type']).toBe('base64');
    expect(source['media_type']).toBe('image/png');
    expect(typeof source['data']).toBe('string');
    // Base64 must carry no newlines.
    expect(source['data'] as string).not.toContain('\n');
    expect(content[1]!['type']).toBe('text');
    expect(content[1]!['text']).toContain('Transcribe');
  });

  it('sends no sampling parameters and no thinking config', async () => {
    await readScreenshots([shotPath], anthropicVisionClient(sdk), {
      clientCode: 'MY-BTY-09',
      category: 'Beauty — skincare',
    });
    const b = captured[0]!.body;
    expect(b['temperature']).toBeUndefined();
    expect(b['top_p']).toBeUndefined();
    expect(b['thinking']).toBeUndefined();
    expect((b['output_config'] as Record<string, unknown>)['effort']).toBe('high');
  });

  it('parses the read and keeps the on-screen label', async () => {
    const p = await readScreenshots([shotPath], anthropicVisionClient(sdk), {
      clientCode: 'MY-BTY-09',
      category: 'Beauty — skincare',
    });
    expect(p.fields.find((f) => f.field === 'sessions')?.value).toBe(48200);
    expect(p.fields.find((f) => f.field === 'sessions')?.source).toBe('read as "Visitors"');
  });

  it('throws rather than transcribing when the read is declined', async () => {
    respond = () => ({
      status: 200,
      body: { ...(messageWith('') as Record<string, unknown>), content: [], stop_reason: 'refusal' },
    });
    await expect(
      readScreenshots([shotPath], anthropicVisionClient(sdk), {
        clientCode: 'MY-BTY-09',
        category: 'Beauty — skincare',
      }),
    ).rejects.toThrow(/declined/);
  });
});
