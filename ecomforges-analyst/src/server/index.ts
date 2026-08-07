/**
 * The Haris-facing form.
 *
 * A local HTTP server: the browser posts figures, the server runs the same engine the CLI
 * uses and returns the brief. The engine is imported unchanged — there is no second copy of
 * the scoring rules here, which is the whole reason the form was left until last.
 *
 * The API key stays on this side. Nothing in the page can read it, which is the point: a key
 * in a browser is a key on a screen, and anything served publicly gets scraped.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { loadEngagement } from '../types/load.js';
import { DEFAULT_THRESHOLDS, parseBenchmarks, type ParsedBenchmarks } from '../benchmarks/parse.js';
import { analyse } from '../engine/pipeline.js';
import { renderBrief, type Prose } from '../render/brief.js';
import { enqueue } from '../benchmarks/queue.js';
import { PAGE } from './page.js';

export interface ServerOptions {
  readonly port: number;
  readonly benchmarksPath?: string;
  readonly queuePath?: string;
  /** Bind address. Defaults to loopback — this holds an API key. */
  readonly host?: string;
}

function benchmarksFor(path: string | undefined, asOf: string): ParsedBenchmarks {
  if (path === undefined || !existsSync(path)) {
    return { rows: [], rejected: [], thresholds: DEFAULT_THRESHOLDS };
  }
  return parseBenchmarks(readFileSync(path, 'utf8'), { asOf });
}

const MAX_BODY = 2_000_000;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY) throw new Error('request body too large');
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    // The page is entirely self-contained; nothing should be loading from anywhere else.
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  });
  res.end(text);
}

export function createAnalystServer(opts: ServerOptions) {
  return createServer((req, res) => {
    void handle(req, res, opts).catch((err: unknown) => {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, opts: ServerOptions): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      // A brief holds a client's commercial figures. It should not be cached to disk.
      'cache-control': 'no-store',
    });
    res.end(PAGE);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/generate') {
    const raw = await readBody(req);
    let payload: { engagement?: unknown; withProse?: boolean };
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      json(res, 400, { error: 'request body is not valid JSON' });
      return;
    }

    let analysis;
    try {
      const engagement = loadEngagement(JSON.stringify(payload.engagement));
      const asOf = engagement.periodStart.toISOString().slice(0, 7);
      analysis = analyse(engagement, benchmarksFor(opts.benchmarksPath, asOf));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : 'could not read the figures' });
      return;
    }

    let prose: Prose | undefined;
    let proseError: string | undefined;
    if (payload.withProse === true) {
      try {
        const { writeProse, anthropicClient } = await import('../llm/prose.js');
        prose = (await writeProse(analysis, anthropicClient())).prose;
      } catch (err) {
        /*
         * A failed prose call must not lose the engine's work. The brief is returned
         * without sections 6 and 8, and the reason is shown — a validator rejection here
         * is the system working, not an outage.
         */
        proseError = err instanceof Error ? err.message : String(err);
      }
    }

    const brief = renderBrief(analysis, prose, {
      proseHint: 'tick "Write the finding and sprint" and generate again',
    });

    let queued = 0;
    if (opts.queuePath !== undefined) {
      const id = `${analysis.engagement.clientCode}-${analysis.engagement.periodStart
        .toISOString()
        .slice(0, 10)}`;
      queued = enqueue(opts.queuePath, analysis.benchmarkCandidates, id);
    }

    json(res, 200, {
      brief,
      queued,
      ...(proseError !== undefined ? { proseError } : {}),
      gaps: analysis.gaps.map((g) => g.question),
      track: analysis.track.activeTrack ?? null,
      platform: analysis.track.platform ?? null,
      blocked: analysis.blockers.blocked,
    });
    return;
  }

  json(res, 404, { error: 'not found' });
}

export function startServer(opts: ServerOptions): void {
  const host = opts.host ?? '127.0.0.1';
  createAnalystServer(opts).listen(opts.port, host, () => {
    console.error(`ecomforges-analyst form → http://${host}:${opts.port}`);
    if (host !== '127.0.0.1') {
      console.error(
        'WARNING: bound beyond loopback. This process holds an Anthropic API key and has no ' +
          'authentication — do not expose it to a network you do not control.',
      );
    }
  });
}
