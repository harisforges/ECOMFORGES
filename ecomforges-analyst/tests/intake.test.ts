import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readScreenshots, type VisionClient } from '../src/intake/screenshot.js';
import { confirm, renderEcho, UnconfirmedIntakeError, type PendingIntake } from '../src/intake/pending.js';

/** A 1x1 PNG. Content does not matter — the vision client is stubbed. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

const dir = join(tmpdir(), 'ecomforges-shots-test');
mkdirSync(dir, { recursive: true });
const shot = join(dir, 'shot.png');
writeFileSync(shot, PNG);

const stub = (json: unknown): VisionClient => ({
  async read() {
    return JSON.stringify(json);
  },
});

const opts = { clientCode: 'MY-BTY-09', category: 'Beauty — skincare' };

describe('screenshot intake', () => {
  it('reads figures and keeps the on-screen label for each', async () => {
    const p = await readScreenshots(
      [shot],
      stub({
        platform: 'Shopee',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        figures: [
          { field: 'sessions', value: 48200, labelSeen: 'Visitors' },
          { field: 'buyers', value: 2940, labelSeen: '# of buyers' },
          { field: 'gmv', value: 206870, labelSeen: 'Sales (MYR)' },
          { field: 'orders', value: 3020, labelSeen: 'Orders' },
        ],
      }),
      opts,
    );
    const sessions = p.fields.find((f) => f.field === 'sessions');
    expect(sessions?.value).toBe(48200);
    expect(sessions?.source).toBe('read as "Visitors"');
    expect(p.questions).toHaveLength(0);
    expect(p.engagement).toBeDefined();
  });

  it('keeps an illegible figure as a gap, never a best guess', async () => {
    const p = await readScreenshots(
      [shot],
      stub({
        platform: 'Shopee',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        figures: [
          { field: 'sessions', value: 48200, labelSeen: 'Visitors' },
          {
            field: 'headlineCvr',
            value: null,
            labelSeen: 'Conversion Rate',
            illegible: 'the second decimal is covered by a tooltip',
          },
        ],
      }),
      opts,
    );
    const cvr = p.fields.find((f) => f.field === 'headlineCvr');
    expect(cvr?.value).toBeNull();
    expect(cvr?.illegible).toMatch(/tooltip/);
    expect(p.echo).toContain('could not read');
    expect(p.echo).toContain('gaps, not guesses');
    // An illegible figure is not itself a blocker — it becomes [ASK] in the brief.
    expect(p.questions).toHaveLength(0);
  });

  it('asks for the platform when it could not be read', async () => {
    const p = await readScreenshots(
      [shot],
      stub({
        platform: null,
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        figures: [{ field: 'sessions', value: 100, labelSeen: 'Visitors' }],
      }),
      opts,
    );
    expect(p.questions.map((q) => q.about)).toContain('platform');
    expect(p.engagement).toBeUndefined();
    expect(() => confirm(p, true)).toThrow(UnconfirmedIntakeError);
  });

  it('asks for the period when no date range was legible', async () => {
    const p = await readScreenshots(
      [shot],
      stub({
        platform: 'Shopee',
        periodStart: null,
        periodEnd: null,
        figures: [{ field: 'sessions', value: 100, labelSeen: 'Visitors' }],
      }),
      opts,
    );
    expect(p.questions.map((q) => q.about)).toContain('period');
  });

  it('surfaces a note from the read as a question', async () => {
    const p = await readScreenshots(
      [shot],
      stub({
        platform: 'Shopee',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        figures: [{ field: 'sessions', value: 100, labelSeen: 'Visitors' }],
        notes: 'A category filter is applied on screen, so these are not shop totals.',
      }),
      opts,
    );
    expect(p.questions.some((q) => /category filter/.test(q.question))).toBe(true);
    expect(p.engagement).toBeUndefined();
  });

  it('ignores a field name it does not model rather than coercing it', async () => {
    const p = await readScreenshots(
      [shot],
      stub({
        platform: 'Shopee',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        figures: [
          { field: 'sessions', value: 100, labelSeen: 'Visitors' },
          { field: 'repeatPurchaseRate', value: 8.98, labelSeen: 'Repeat Purchase Rate' },
        ],
      }),
      opts,
    );
    expect(p.fields.map((f) => f.field)).not.toContain('repeatPurchaseRate');
    expect(p.fields.map((f) => f.field)).toContain('sessions');
  });

  it('always tells the reader to check every figure against the image', async () => {
    const p = await readScreenshots(
      [shot],
      stub({
        platform: 'Shopee',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        figures: [{ field: 'sessions', value: 100, labelSeen: 'Visitors' }],
      }),
      opts,
    );
    // Even a clean read is echoed. The confirmation is the only control between a
    // transcription error and a brief a client acts on.
    expect(p.echo).toContain('only check between a transcription error');
  });

  it('rejects an unsupported image type before calling anything', async () => {
    const bad = join(dir, 'shot.bmp');
    writeFileSync(bad, PNG);
    await expect(readScreenshots([bad], stub({ figures: [] }), opts)).rejects.toThrow(
      /unsupported image type/,
    );
  });
});

describe('the confirmation gate', () => {
  const clean: PendingIntake = {
    kind: 'manual',
    fields: [{ field: 'sessions', value: 100, source: 'typed' }],
    questions: [],
    echo: '',
    engagement: {
      clientCode: 'MY-BTY-09',
      periodStart: new Date('2026-04-01'),
      periodEnd: new Date('2026-04-30'),
      category: 'x',
      platforms: [{ platform: 'Shopee' }],
    },
  };

  it('returns the engagement when acknowledged and nothing is open', () => {
    expect(confirm(clean, true).clientCode).toBe('MY-BTY-09');
  });

  it('refuses when a question is open, and names it', () => {
    const blocked: PendingIntake = {
      ...clean,
      questions: [{ about: 'period', question: 'What dates does this cover?' }],
    };
    expect(() => confirm(blocked, true)).toThrow(/must be answered before analysis/);
  });

  it('refuses when the read produced no engagement', () => {
    const partial: PendingIntake = { kind: 'csv', fields: [], questions: [], echo: '' };
    expect(() => confirm(partial, true)).toThrow(/did not produce a complete engagement/);
  });

  it('renders unread figures distinctly from read ones', () => {
    const echo = renderEcho({
      kind: 'screenshot',
      fields: [
        { field: 'sessions', value: 48200, source: 'read as "Visitors"' },
        { field: 'aov', value: null, source: 'read as "AOV"', illegible: 'cropped at the edge' },
      ],
      questions: [],
      echo: '',
    });
    expect(echo).toContain('48200');
    expect(echo).toContain('**could not read** — cropped at the edge');
    expect(echo).toContain('1 figure(s) could not be read');
  });
});

// Vitest runs files in isolation; clean up the scratch directory when this one is done.
process.on('exit', () => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* nothing to do — a leftover temp dir is harmless */
  }
});
