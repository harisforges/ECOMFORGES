# ecomforges-analyst

Generates an EcomForges growth brief from one engagement's platform figures: what is
actually wrong, which Forge Track activates, and the 30-day sprint the client's own team
executes.

```bash
npm install
npm test
npx tsx src/cli generate fixtures/my-bty-09.json --no-llm
```

`--no-llm` renders everything except the two prose sections, so the engine can be checked
without an API key or a network call. Without it, set `ANTHROPIC_API_KEY` (or run
`ant auth login`) and sections 6 and 8 are written by one model call.

## The split that matters

**`src/engine/` computes. `src/llm/` writes.** Every number in a brief is computed in the
engine or came from the input. There is exactly one model call in the codebase, it receives
figures rather than deriving them, and a post-call validator rejects any number in its
output that was not in its input payload.

That validator has a known limit, which is documented in a test: it is a value-set
membership check, so a fabricated figure that happens to equal an unrelated payload number
— a ROAS of 5.20 quoted as a 5.20% conversion benchmark — passes. It catches figures that
were never computed, not figures used in the wrong place.

## Provenance

Every figure carries a tag: `DATA`, `CALC` (with the arithmetic), `BM` (with the row id),
`EST` (with a mandatory basis), or `ASK`. **`ASK` carries no `value` field at all**, so
calling code has to handle a missing input rather than defaulting it to zero. `map()` in
`src/types/tagged.ts` propagates `ASK` through arithmetic, carrying the root cause forward
so a gap two levels deep still explains itself in the client-facing list.

`Unscored` is likewise a distinct kind from level 0. A missing benchmark means "we do not
know", not "this area is fine".

## Where a benchmark may come from

Three places, in precedence order:

1. A figure supplied for this run
2. A usable row from the benchmark file — `n >= 3`, not stale, not struck through
3. **The client's own strongest platform**, when one catalogue runs on two or more
   platforms

Nothing else. No default, no category average, no hardcoded fallback — a test scans
`src/engine/` to keep it that way. With none of the three available, Conversion comes back
`Unscored`, the brief says so, and the other five areas still score.

An internal benchmark (case 3) is marked `comparableAcrossClients: false`.
`assertAggregatable()` throws rather than letting one seller's figure become a market
number.

## Layout

```
src/types/tagged.ts              provenance-carrying numbers
src/types/datasheet.ts           the Standard Data Sheet + period validator
src/types/load.ts                intake JSON → Engagement
src/engine/normalise.ts          cross-platform CVR normalisation, leakage
src/engine/sanity.ts             reconciliation checks
src/engine/benchmark-resolution  the three-source rule
src/engine/scoring.ts            six areas, revenue-share step-down
src/engine/blockers.ts           operations / margin / cannot-be-checked
src/engine/track.ts              Growth Pressure Score, platform selection
src/engine/sizing.ts             target and full gap, always together
src/engine/pipeline.ts           orchestration
src/benchmarks/parse.ts          benchmark file parser
src/render/brief.ts              sections 1-5, 7, 9, 10
src/llm/prose.ts                 the one model call + validator
prompts/analyst-v1.md            versioned system prompt
```

## What the golden test pins

`fixtures/my-bty-09.json` — three platforms, one catalogue, empty benchmark file:

| | |
|---|---|
| Normalised CVR | Shopee 6.10% · Lazada 3.87% · TikTok 2.78% |
| Benchmark | Shopee 6.10%, internal, not cross-client comparable |
| Ratios | Lazada 0.634 → Critical · TikTok 0.456 → Critical |
| Business-level Conversion | **High**, not Critical — Lazada is 24.0% of revenue |
| Lazada leakage | 13.9% of GMV · cancellation rate 10.8% |
| Blocker | `unknown` on Operations, stock-out question first in GAPS |
| Track | Conversion at 2.00, on **Lazada** — not the worse TikTok |
| Sizing | target RM18,230/mo · full gap RM42,010/mo · target < gap |
| Benchmark rows read | 0 |

`fixtures/my-solo-01.json` — one platform, empty benchmark file: Conversion comes back
unscored with the exact `[ASK]` text, the other five areas still score, the margin blocker
fires (22% margin with ROAS 1.70), and the brief still generates with no conversion figure
invented anywhere in it.

## Two figures that differ from the build spec

The spec quoted the target uplift as ≈RM18,297/month and the full gap as ≈RM42,036/month.
The engine computes **RM18,230.25** and **RM42,010.19**:

```
revenue per buyer = 72,921 ÷ 1,072            = RM68.0233
target  = 27,700 × 4.8375% = 1,340.0 buyers  → (1,340.0 − 1,072) × 68.0233 = RM18,230.25
parity  = 27,700 × 6.0996% = 1,689.6 buyers  → (1,689.6 − 1,072) × 68.0233 = RM42,010.19
```

The arithmetic is shown so the difference can be checked rather than taken on trust. The
invariant the spec actually asked for — target strictly below the full gap — is asserted.

## Data

Real client data goes in `fixtures/real/` and is **never committed**. Neither is the filled
benchmark file — see `.gitignore`. Client codes (`MY-BTY-09`), never client names: a row
that survives into a public place must not identify anyone.
