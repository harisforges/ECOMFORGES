/**
 * Brief rendering. Every number goes through the Tagged formatter — nothing is
 * interpolated raw, so a figure cannot reach the page without its provenance.
 *
 * Sections 6 (THE FINDING) and 8 (THE 30-DAY SPRINT) are prose and come from the single
 * model call. Everything else is rendered here from computed values.
 */

import type { Analysis, PlatformView } from '../engine/pipeline.js';
import {
  fmt,
  fmtNum,
  fmtPct,
  fmtRm,
  isAsk,
  num,
  pct,
  ratio,
  rm,
  rmRound,
  type Tagged,
} from '../types/tagged.js';
import { isScored, LEVEL_NAME, TRACK, AREA_NAME, type AreaId } from '../engine/scoring.js';
import type { Sizing } from '../engine/sizing.js';

/** How to fill sections 6 and 8, phrased for wherever the brief is being read. */
export interface RenderOptions {
  readonly proseHint?: string;
}

const DEFAULT_HINT = 'this section is written by the model';

export interface Prose {
  readonly finding: string;
  readonly sprint: {
    readonly fix: { directive: string; hypothesis?: string; falsifiedBy?: string };
    readonly run: { directive: string; startsIn?: string; endsIn?: string };
    readonly optimise: { directive: string };
  };
  readonly highestRoiClaim: boolean;
}

const ISO = (d: Date): string => d.toISOString().slice(0, 10);

function cell(t: Tagged<number> | undefined, render: (t: Tagged<number>) => string): string {
  if (t === undefined) return '`[ASK]` not supplied';
  return isAsk(t) ? '`[ASK]` not supplied' : render(t);
}

function tag(t: Tagged<unknown>): string {
  return t.tag === 'ASK' ? '`[ASK]`' : `\`[${t.tag}]\``;
}

/** Table cell: value plus a short tag, without the full workings that would bloat a row. */
function tCell(t: Tagged<number> | undefined, render: (v: number) => string): string {
  if (t === undefined) return '`[ASK]`';
  if (isAsk(t)) return '`[ASK]`';
  return `${render(t.value)} ${tag(t)}`;
}

function header(a: Analysis): string {
  const names = a.platforms.map((p) => p.data.platform).join(', ');
  return [
    `# GROWTH BRIEF — ${a.engagement.clientCode}`,
    '',
    `**Period** ${ISO(a.engagement.periodStart)} to ${ISO(a.engagement.periodEnd)} (${a.periodDays} days) · ` +
      `**Platforms** ${names}`,
    `**Category** ${a.engagement.category} · **Blended revenue** ${cell(a.blendedGmv, fmtRm)}`,
  ].join('\n');
}

function section1(a: Analysis): string {
  const ps = a.platforms;
  const cols = ps.map((p) => p.data.platform);
  const row = (label: string, get: (p: PlatformView) => string): string =>
    `| ${label} | ${ps.map(get).join(' | ')} |`;

  const lines: string[] = [
    '## 1. DATA CONFIRMED',
    '',
    `| Field | ${cols.join(' | ')} |`,
    `|---|${cols.map(() => '---').join('|')}|`,
    row('Revenue / GMV', (p) => tCell(p.data.gmv, rm)),
    row('Share of blended revenue', (p) => tCell(p.revenueSharePct, (v) => pct(v, 1))),
    row('Sessions', (p) => tCell(p.data.sessions, num)),
    row('Buyers', (p) => tCell(p.data.buyers, num)),
    row('Orders', (p) => tCell(p.data.orders, num)),
    row('**Buyer CVR (normalised)**', (p) => `**${tCell(p.cvr.cvr, (v) => pct(v))}**`),
    row('Platform headline CVR', (p) =>
      p.cvr.headline === undefined
        ? '—'
        : `${tCell(p.cvr.headline, (v) => pct(v))}${p.cvr.headlineBasis ? ` (${p.cvr.headlineBasis})` : ''}`,
    ),
    row('AOV', (p) => tCell(p.data.aov, rm)),
    row('Revenue per visitor', (p) => tCell(p.revenuePerVisitor, rm)),
    row('Revenue per buyer', (p) => tCell(p.revenuePerBuyer, rm)),
    row('Organic share', (p) => tCell(p.data.organicSharePct, (v) => pct(v, 1))),
    row('Promo revenue share', (p) => tCell(p.data.promoRevenuePct, (v) => pct(v, 1))),
    row('Ad spend', (p) => tCell(p.data.adSpend, rm)),
    row('ROAS', (p) => tCell(p.data.roas, (v) => v.toFixed(2))),
    row('Gross margin', (p) => tCell(p.data.grossMarginPct, (v) => pct(v, 1))),
    row('Fulfilment', (p) =>
      p.data.fulfilment === undefined || isAsk(p.data.fulfilment)
        ? '`[ASK]`'
        : `${p.data.fulfilment.value.replace(/-/g, ' ')} ${tag(p.data.fulfilment)}`,
    ),
    row('Cancellation rate', (p) => tCell(p.cancellationRate, (v) => pct(v))),
    row('**Leakage (RM)**', (p) => tCell(p.leakage.value, rm)),
    row('**Leakage (% of GMV)**', (p) => `**${tCell(p.leakage.sharePct, (v) => pct(v, 1))}**`),
    row('Add-to-cart users', (p) => tCell(p.data.addToCartUsers, num)),
    '',
    `Blended leakage ${cell(a.blendedLeakage.value, fmtRm)} — ${cell(a.blendedLeakage.sharePct, (t) => fmtPct(t, 1))}`,
    '',
  ];

  const missing = a.gaps.length;
  lines.push(
    `**Missing:** ${
      missing === 0
        ? 'nothing material.'
        : `${missing} field${missing === 1 ? '' : 's'} — see section 10.`
    }`,
    '',
    '**On conversion rate.** The platforms do not define it the same way, so every figure above ' +
      'was recomputed as buyers ÷ sessions and only that recomputed figure is used for comparison. ' +
      'Each platform’s own headline number is shown alongside, because that is what the client sees ' +
      'on their dashboard and it will not match.',
  );

  const fromOrders = ps.filter((p) => p.cvr.fromOrders);
  if (fromOrders.length > 0) {
    lines.push(
      '',
      `On ${fromOrders.map((p) => p.data.platform).join(' and ')}, buyers were not supplied and orders ` +
        'were substituted. Orders and buyers are not interchangeable — a repeat buyer inflates the figure.',
    );
  }
  return lines.join('\n');
}

function section2(a: Analysis): string {
  const lines: string[] = ['## 2. SANITY CHECKS', ''];
  for (const c of a.sanity.checks) {
    const mark = c.status === 'pass' ? '✓' : c.status === 'discrepancy' ? '✗' : '·';
    lines.push(`- ${mark} ${c.message}`);
  }
  if (a.sanity.periodProblems.length === 0) {
    lines.push('', `- ✓ Period is ${a.periodDays} days with no campaign day inside it. Readable as a baseline.`);
  } else {
    lines.push('');
    for (const p of a.sanity.periodProblems) lines.push(`- ✗ ${p.message}`);
  }
  if (a.sanity.campaignInflated) {
    lines.push(
      '',
      '**Every per-day figure in this brief is a month average over a campaign-inflated period.** ' +
        'Ask the client for the non-spike daily baseline before treating any of it as a run rate.',
    );
  }
  if (a.sanity.anyBlocking) {
    lines.push(
      '',
      '**One or more discrepancies above need an answer before this brief is acted on.** They are ' +
        'listed in section 10.',
    );
  }
  return lines.join('\n');
}

function section3(a: Analysis): string {
  const ids: AreaId[] = ['traffic', 'conversion', 'basket', 'campaign', 'operations', 'profitability'];
  const lines: string[] = [
    '## 3. PRESSURE SCORING',
    '',
    '| Area | Business level | Why |',
    '|---|---|---|',
  ];
  for (const id of ids) {
    const b = a.business[id]!;
    const level = isScored(b.level) ? `**${LEVEL_NAME[b.level.level]}**` : '**Unscored**';
    const why = isScored(b.level) ? b.level.reason : b.level.reason;
    lines.push(`| ${AREA_NAME[id]} | ${level} | ${why} |`);
  }

  lines.push('', '### Per platform', '');
  const cols = a.platforms.map((p) => p.data.platform);
  lines.push(`| Area | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
  for (const id of ids) {
    const b = a.business[id]!;
    const cells = a.platforms.map((p) => {
      const x = b.perPlatform.find((y) => y.platform === p.data.platform);
      if (!x || !isScored(x.score)) return 'Unscored';
      const stepped = x.steppedLevel;
      return stepped !== undefined && stepped !== x.score.level
        ? `${LEVEL_NAME[x.score.level]} → ${LEVEL_NAME[stepped]}`
        : LEVEL_NAME[x.score.level];
    });
    lines.push(`| ${AREA_NAME[id]} | ${cells.join(' | ')} |`);
  }
  lines.push(
    '',
    'Where two levels appear, the second is after the revenue-share step-down: platforms are not ' +
      'averaged, and an area Critical on a channel worth a tenth of revenue is not a Critical business ' +
      'problem.',
  );

  /*
   * Only the note for the platform the track runs on. Every platform resolves its own
   * benchmark, so printing all of them repeated the same paragraph three times with one
   * word changed — noise in a document a consultant reads aloud.
   */
  const primary = a.targetPlatform ?? a.platforms[0];
  if (primary !== undefined) {
    lines.push('', '### Conversion benchmark', '', `- ${primary.scores.benchmark.note}`);
    const others = a.platforms
      .filter((p) => p !== primary && p.scores.benchmark.origin !== primary.scores.benchmark.origin)
      .map((p) => p.scores.benchmark.note);
    for (const n of new Set(others)) lines.push(`- ${n}`);
  }
  return lines.join('\n');
}

function section4(a: Analysis): string {
  const b = a.blockers;
  const lines: string[] = ['## 4. BLOCKER CHECK', '', `**${b.title}**`, '', b.message];
  if (b.wouldChange !== undefined) lines.push('', b.wouldChange);
  if (b.alsoNoted.length > 0) {
    lines.push('', 'Also noted:');
    for (const n of b.alsoNoted) lines.push(`- ${n}`);
  }
  return lines.join('\n');
}

function section5(a: Analysis): string {
  const lines: string[] = [
    '## 5. GROWTH PRESSURE SCORE',
    '',
    '| Area | Level | × Impact | Score |',
    '|---|---|---|---|',
  ];
  const sorted = [...a.track.rows].sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
  for (const r of sorted) {
    const isTop = r.score !== undefined && r.score === a.track.topScore && a.track.topScore > 0;
    const marker = isTop ? ' ←' : '';
    const scoreText = r.score === undefined ? '—' : `**${r.score.toFixed(2)}**${marker}`;
    lines.push(
      `| ${r.areaName} | ${r.levelName} | × ${r.impact.toFixed(2)} | ${scoreText} |`,
    );
  }
  lines.push('', a.track.note);
  const unscoredRows = a.track.rows.filter((r) => r.score === undefined);
  for (const r of unscoredRows) {
    lines.push(`- ${r.areaName} is unscored: ${r.unscoredReason ?? 'inputs missing'}. Not treated as zero.`);
  }
  return lines.join('\n');
}

/** The arithmetic behind a figure, whichever tag carries it. */
function workingsOf(t: Tagged<number>): string {
  switch (t.tag) {
    case 'ASK':
      return t.question;
    case 'CALC':
      return t.workings;
    case 'BM':
      return `benchmark row ${t.rowId}`;
    case 'EST':
      return `estimated — ${t.basis}`;
    case 'DATA':
      return t.source ?? 'supplied';
  }
}

function sizingTable(s: Sizing, metricLabel: string, current: Tagged<number>, unit: 'pct' | 'rm'): string {
  const renderMetric = (t: Tagged<number>): string =>
    isAsk(t) ? '`[ASK]`' : unit === 'pct' ? pct(t.value) : rm(t.value);
  const lines = [
    '| | |',
    '|---|---|',
    `| Now | ${renderMetric(current)} |`,
    `| 30-day target ${metricLabel} | ${renderMetric(s.target.targetMetric)} |`,
    `| **Worth** | **${isAsk(s.target.uplift) ? '`[ASK]`' : `${rmRound(s.target.uplift.value)} per month`}** |`,
    '',
    `Workings: ${workingsOf(s.target.uplift)}`,
    '',
    `**The size of the hole** — parity ${metricLabel} of ${renderMetric(s.fullGap.targetMetric)} would be ` +
      `${isAsk(s.fullGap.uplift) ? '`[ASK]`' : `${rmRound(s.fullGap.uplift.value)} per month`}. ` +
      `That is the gap, not the target.`,
    '',
    s.caveat,
  ];
  return lines.join('\n');
}

function section7(a: Analysis): string {
  const lines: string[] = ['## 7. ACTIVE TRACK', ''];
  if (a.blockers.blocked === true) {
    lines.push(
      `**No track activates this cycle — ${a.blockers.title.toLowerCase()}.**`,
      '',
      a.blockers.message,
    );
    return lines.join('\n');
  }
  if (a.track.activeTrack === undefined) {
    lines.push('**No track activates this cycle.**', '', a.track.whatToWatch ?? a.track.note);
    return lines.join('\n');
  }

  const t = TRACK[a.track.activeTrack];
  lines.push(
    `### ${t.name}${a.track.platform ? ` — on ${a.track.platform}` : ''}`,
    '',
    `**Constraint** ${t.constraint} · **Metric that must move** ${t.metric}`,
    '',
  );

  if (a.sizing !== undefined && a.targetPlatform !== undefined) {
    const area = a.track.activeArea;
    const current =
      area === 'basket'
        ? (a.targetPlatform.data.aov ?? a.targetPlatform.cvr.cvr)
        : area === 'traffic'
          ? (a.targetPlatform.data.sessions ?? a.targetPlatform.cvr.cvr)
          : a.targetPlatform.cvr.cvr;
    const unit = area === 'basket' ? 'rm' : area === 'traffic' ? 'rm' : 'pct';
    lines.push(sizingTable(a.sizing, a.sizing.metricName, current, unit as 'pct' | 'rm'));
  }

  if (a.platformRationale !== undefined) {
    lines.push(
      '',
      `**Why this platform.** ${a.platformRationale}. The track runs where the pressure that won the ` +
        'score actually sits, not simply at the worst performer — a small channel can be the worst and ' +
        'still be the wrong place to spend the client’s only 30 days.',
    );
  }
  return lines.join('\n');
}

function section9(a: Analysis): string {
  const lines: string[] = ['## 9. WHAT WE ARE NOT DOING THIS CYCLE', ''];
  const r = a.track.runnerUp;
  if (r === undefined) {
    lines.push(
      'No second track is in contention — every other track-bearing area is Stable or unscored. ' +
        'One track, one platform, one cycle.',
    );
    return lines.join('\n');
  }
  const t = TRACK[r.track];
  const worth =
    a.runnerUpSizing !== undefined && !isAsk(a.runnerUpSizing.target.uplift)
      ? `${rmRound(a.runnerUpSizing.target.uplift.value)} per month`
      : 'not sizeable from the data supplied';
  const activeWorth =
    a.sizing !== undefined && !isAsk(a.sizing.target.uplift)
      ? rmRound(a.sizing.target.uplift.value)
      : undefined;
  lines.push(
    `**${t.name}${r.platform ? ` on ${r.platform}` : ''}** — scored ${r.score.toFixed(2)}, worth ${worth}.`,
    '',
    activeWorth !== undefined
      ? `It waits because the active track is worth ${activeWorth} per month for the same 30 days of the ` +
        `client’s attention. One track per cycle: a second priority is a way of having none.`
      : 'It waits because the model activates one track per cycle. A second priority is a way of having none.',
  );
  return lines.join('\n');
}

function section10(a: Analysis): string {
  const lines: string[] = ['## 10. GAPS', '', 'Send these to the client before the session.', ''];
  if (a.gaps.length === 0) {
    lines.push('None. Every field the model needs was supplied.');
    return lines.join('\n');
  }
  a.gaps.forEach((g, i) => {
    const lead = i === 0 && a.blockers.gaps.length > 0;
    lines.push(
      `${i + 1}. ${g.question}${lead ? ' **← this gap could invalidate the recommendation above.**' : ''}`,
    );
  });
  const blocking = a.sanity.checks.filter((c) => c.blocksAnalysis === true);
  if (blocking.length > 0) {
    lines.push('');
    for (const c of blocking) lines.push(`${a.gaps.length + 1}. ${c.message}`);
  }
  return lines.join('\n');
}

function candidatesBlock(a: Analysis): string {
  const lines: string[] = [
    '## BENCHMARK CANDIDATES FROM THIS ENGAGEMENT',
    '',
    'Real observed figures, n=1 each. **One client is not a category** — these are not usable as ' +
      'benchmarks until the same figure reaches n=3. This tool never writes to the benchmark file; a ' +
      'human decides what goes in.',
    '',
    '```',
  ];
  for (const c of a.benchmarkCandidates) {
    lines.push(
      `${c.platform} / ${c.category} / ${c.metric} / ${c.value} / observed ${c.observed} / ${c.clientCode} / n=1`,
    );
  }
  lines.push('```');
  return lines.join('\n');
}

function section6(prose?: Prose, hint = DEFAULT_HINT): string {
  if (prose === undefined) {
    return ['## 6. THE FINDING', '', `_(not generated — ${hint})_`].join('\n');
  }
  return ['## 6. THE FINDING', '', prose.finding].join('\n');
}

function section8(a: Analysis, prose?: Prose, hint = DEFAULT_HINT): string {
  if (prose === undefined) {
    return ['## 8. THE 30-DAY SPRINT', '', `_(not generated — ${hint})_`].join('\n');
  }
  const s = prose.sprint;
  const lines: string[] = ['## 8. THE 30-DAY SPRINT', ''];
  lines.push(`**Fix** — ${s.fix.directive}`);
  if (s.fix.hypothesis) {
    lines.push('', `_Hypothesis:_ ${s.fix.hypothesis}`);
    if (s.fix.falsifiedBy) lines.push(`_Falsified by:_ ${s.fix.falsifiedBy}`);
  }
  lines.push(
    '',
    `**Run** — ${s.run.directive}${s.run.startsIn ? ` Starts ${s.run.startsIn}.` : ''}${
      s.run.endsIn ? ` Ends ${s.run.endsIn}.` : ''
    }`,
  );
  lines.push('', `**Optimise** — ${s.optimise.directive}`);
  if (prose.highestRoiClaim) {
    lines.push(
      '',
      'This is not a suggestion. It is the highest ROI move available to this business right now.',
    );
  }
  return lines.join('\n');
}

export function renderBrief(a: Analysis, prose?: Prose, opts: RenderOptions = {}): string {
  const hint = opts.proseHint ?? DEFAULT_HINT;
  return [
    header(a),
    '',
    '---',
    '',
    section1(a),
    '',
    section2(a),
    '',
    section3(a),
    '',
    section4(a),
    '',
    section5(a),
    '',
    section6(prose, hint),
    '',
    section7(a),
    '',
    section8(a, prose, hint),
    '',
    section9(a),
    '',
    section10(a),
    '',
    '---',
    '',
    candidatesBlock(a),
    '',
  ].join('\n');
}

export { fmt, fmtNum, ratio };
