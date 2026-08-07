import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  approve,
  enqueue,
  group,
  InsufficientNError,
  load,
  renderQueue,
  SameEngagementError,
  writeToBenchmarkFile,
} from '../src/benchmarks/queue.js';
import { parseBenchmarks, lookup } from '../src/benchmarks/parse.js';
import type { BenchmarkCandidate } from '../src/engine/pipeline.js';

let dir: string;
let queuePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ecomforges-queue-'));
  queuePath = join(dir, 'benchmarks.queue.jsonl');
});

const cand = (clientCode: string, value: string, observed = '2026-04'): BenchmarkCandidate => ({
  platform: 'Shopee',
  category: 'Beauty — skincare',
  metric: 'buyer CVR',
  value,
  observed,
  clientCode,
});

describe('queueing', () => {
  it('appends candidates and reads them back', () => {
    expect(enqueue(queuePath, [cand('MY-BTY-01', '6.10%')], 'eng-1')).toBe(1);
    const loaded = load(queuePath);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.numeric).toBe(6.1);
    expect(loaded[0]!.engagementId).toBe('eng-1');
  });

  it('does not inflate n when the same engagement is re-run', () => {
    enqueue(queuePath, [cand('MY-BTY-01', '6.10%')], 'eng-1');
    const second = enqueue(queuePath, [cand('MY-BTY-01', '6.10%')], 'eng-1');
    expect(second).toBe(0);
    expect(group(load(queuePath))[0]!.n).toBe(1);
  });

  it('counts distinct clients, not rows', () => {
    // Six months of one seller is still one client. A row count would read as six.
    enqueue(queuePath, [cand('MY-BTY-01', '6.10%', '2026-01')], 'eng-1');
    enqueue(queuePath, [cand('MY-BTY-01', '6.30%', '2026-02')], 'eng-2');
    enqueue(queuePath, [cand('MY-BTY-01', '6.50%', '2026-03')], 'eng-3');
    const g = group(load(queuePath))[0]!;
    expect(g.candidates).toHaveLength(3);
    expect(g.n).toBe(1);
    expect(g.usable).toBe(false);
    expect(g.reason).toMatch(/one client is not a category/);
  });

  it('takes each client’s most recent figure for the median', () => {
    enqueue(queuePath, [cand('MY-BTY-01', '2.00%', '2026-01')], 'e1');
    enqueue(queuePath, [cand('MY-BTY-01', '8.00%', '2026-04')], 'e2'); // this one counts
    enqueue(queuePath, [cand('MY-BTY-02', '4.00%', '2026-04')], 'e3');
    enqueue(queuePath, [cand('MY-BTY-03', '6.00%', '2026-04')], 'e4');
    const g = group(load(queuePath))[0]!;
    expect(g.n).toBe(3);
    expect(g.median).toBe(6); // median of 8, 4, 6 — not of the older 2.00
  });
});

describe('the n>=3 gate', () => {
  it('refuses to approve at n=2', () => {
    enqueue(queuePath, [cand('MY-BTY-01', '6.10%')], 'e1');
    enqueue(queuePath, [cand('MY-BTY-02', '5.90%')], 'e2');
    const g = group(load(queuePath))[0]!;
    expect(g.usable).toBe(false);
    expect(() => approve(g)).toThrow(InsufficientNError);
    expect(() => approve(g)).toThrow(/One client is not a category/);
  });

  it('approves at n=3 and renders a benchmark-file row', () => {
    enqueue(queuePath, [cand('MY-BTY-01', '6.10%')], 'e1');
    enqueue(queuePath, [cand('MY-BTY-02', '5.90%')], 'e2');
    enqueue(queuePath, [cand('MY-BTY-03', '6.30%')], 'e3');
    const g = group(load(queuePath))[0]!;
    expect(g.usable).toBe(true);
    const row = approve(g);
    expect(row.n).toBe(3);
    expect(row.median).toBeCloseTo(6.1, 5);
    expect(row.markdown).toContain('| Shopee | Beauty — skincare | 6.10% | 3 |');
    expect(row.markdown).toContain('MY-BTY-01/MY-BTY-02/MY-BTY-03');
  });

  it('refuses to write a metric that has no standard table', () => {
    enqueue(queuePath, [{ ...cand('MY-BTY-01', '3.3%'), metric: 'leakage' }], 'e1');
    enqueue(queuePath, [{ ...cand('MY-BTY-02', '4.1%'), metric: 'leakage' }], 'e2');
    enqueue(queuePath, [{ ...cand('MY-BTY-03', '2.8%'), metric: 'leakage' }], 'e3');
    const g = group(load(queuePath)).find((x) => x.metric === 'leakage')!;
    const row = approve(g);
    expect(row.heading).toBeNull();
    const path = join(dir, 'b.md');
    writeFileSync(path, '## Conversion rate (CVR)\n\n| a |\n|---|\n| x |\n');
    expect(() => writeToBenchmarkFile(path, row)).toThrow(/no standard table/);
  });
});

describe('same-brief reuse', () => {
  it('refuses a candidate produced by the engagement currently being analysed', () => {
    enqueue(queuePath, [cand('MY-BTY-01', '6.10%')], 'eng-current');
    enqueue(queuePath, [cand('MY-BTY-02', '5.90%')], 'e2');
    enqueue(queuePath, [cand('MY-BTY-03', '6.30%')], 'e3');
    const g = group(load(queuePath))[0]!;
    expect(() => approve(g, { currentEngagementId: 'eng-current' })).toThrow(SameEngagementError);
    expect(() => approve(g, { currentEngagementId: 'eng-current' })).toThrow(
      /score the client against itself/,
    );
  });

  it('allows approval for an unrelated engagement', () => {
    enqueue(queuePath, [cand('MY-BTY-01', '6.10%')], 'e1');
    enqueue(queuePath, [cand('MY-BTY-02', '5.90%')], 'e2');
    enqueue(queuePath, [cand('MY-BTY-03', '6.30%')], 'e3');
    const g = group(load(queuePath))[0]!;
    expect(() => approve(g, { currentEngagementId: 'some-other-engagement' })).not.toThrow();
  });
});

describe('writing into the benchmark file', () => {
  const TEMPLATE = [
    '# EcomForges Benchmark File',
    '',
    '## Conversion rate (CVR)',
    '',
    '| Platform | Category | Median CVR | n | Period type | Last observed | Client codes |',
    '|---|---|---|---|---|---|---|',
    '| _(empty)_ | | | | | | |',
    '',
    '## Average order value (AOV)',
    '',
    '| Platform | Category | Median AOV (RM) | n | Period type | Last observed | Client codes |',
    '|---|---|---|---|---|---|---|',
    '| _(empty)_ | | | | | | |',
    '',
  ].join('\n');

  it('appends under the right heading, removes the placeholder, and the parser then reads it', () => {
    const path = join(dir, 'benchmarks.md');
    writeFileSync(path, TEMPLATE);

    enqueue(queuePath, [cand('MY-BTY-01', '6.10%')], 'e1');
    enqueue(queuePath, [cand('MY-BTY-02', '5.90%')], 'e2');
    enqueue(queuePath, [cand('MY-BTY-03', '6.30%')], 'e3');
    const row = approve(group(load(queuePath))[0]!);
    // The candidate said "buyer CVR"; the file's table means "CVR". approve() reconciles
    // the two and names the heading, so the pair cannot be mismatched by hand.
    expect(row.metric).toBe('buyer CVR');
    expect(row.canonicalMetric).toBe('CVR');
    expect(row.heading).toBe('## Conversion rate (CVR)');
    writeToBenchmarkFile(path, row);

    const written = readFileSync(path, 'utf8');
    expect(written).toContain('| Shopee | Beauty — skincare | 6.10% | 3 |');
    // The CVR table's placeholder is gone; the untouched AOV table keeps its own.
    const cvrSection = written.slice(
      written.indexOf('## Conversion rate'),
      written.indexOf('## Average order value'),
    );
    expect(cvrSection).not.toContain('_(empty)_');
    expect(written.slice(written.indexOf('## Average order value'))).toContain('_(empty)_');

    // The round trip is what matters: an approved row must become a usable benchmark.
    const parsed = parseBenchmarks(written, { asOf: '2026-05' });
    expect(parsed.rows).toHaveLength(1);
    const hit = lookup(parsed, 'Shopee', 'Beauty — skincare', 'CVR');
    expect(hit.found).toBe(true);
    if (hit.found) expect(hit.row.value).toBe(6.1);
  });

  it('refuses a heading that is not in the file', () => {
    const path = join(dir, 'benchmarks.md');
    writeFileSync(path, TEMPLATE);
    enqueue(queuePath, [cand('MY-BTY-01', '6.10%')], 'e1');
    enqueue(queuePath, [cand('MY-BTY-02', '5.90%')], 'e2');
    enqueue(queuePath, [cand('MY-BTY-03', '6.30%')], 'e3');
    const row = approve(group(load(queuePath))[0]!);
    expect(() => writeToBenchmarkFile(path, row, '## Nonexistent')).toThrow(/heading not found/);
  });
});

describe('queue rendering', () => {
  it('says the queue is empty rather than showing a bare table', () => {
    expect(renderQueue([])).toMatch(/queue is empty/);
  });

  it('marks nothing ready when every group is below the threshold', () => {
    enqueue(queuePath, [cand('MY-BTY-01', '6.10%')], 'e1');
    const out = renderQueue(group(load(queuePath)));
    expect(out).toMatch(/one client is not a category/);
    expect(out).toMatch(/Nothing is ready to promote/);
  });

  it('says promotion is a human decision when something is ready', () => {
    enqueue(queuePath, [cand('MY-BTY-01', '6.10%')], 'e1');
    enqueue(queuePath, [cand('MY-BTY-02', '5.90%')], 'e2');
    enqueue(queuePath, [cand('MY-BTY-03', '6.30%')], 'e3');
    const out = renderQueue(group(load(queuePath)));
    expect(out).toContain('**ready**');
    expect(out).toMatch(/nothing is promoted automatically/);
  });
});
