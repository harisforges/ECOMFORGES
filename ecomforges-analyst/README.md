# ecomforges-analyst

Generates an EcomForges growth brief from one engagement's platform figures: what is
actually wrong, which Forge Track activates, and the 30-day sprint the client's own team
executes.

```bash
npm install
npm test
npx tsx src/cli generate fixtures/my-bty-09.json --no-llm
npx tsx src/cli serve --port 4173          # the form, on loopback
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

## What has and has not been tested against the API

`tests/wire.test.ts` points the real `Anthropic` client at a local server speaking the
Messages API wire format, captures what actually goes out, and asserts the shape. That
covers serialisation, transport, response parsing, and error handling — the layer a stubbed
client skips entirely, and where a parameter in the wrong place hides.

It pins the request this model requires:

```json
{
  "model": "claude-opus-5",
  "max_tokens": 16000,
  "system": "<prompts/analyst-v1.md + the per-call hard rule>",
  "output_config": { "effort": "high", "format": { "type": "json_schema", "schema": {...} } },
  "messages": [{ "role": "user", "content": "<engine-computed JSON>" }]
}
```

and asserts the absences that matter, because each one is a 400 on Opus 5: no
`temperature`, `top_p`, or `top_k`; no `thinking` block (thinking is on by default, so the
parameter is omitted rather than configured); no trailing assistant turn; `effort` inside
`output_config` rather than top-level; and no deprecated `output_format`. It also asserts
`stop_reason: "refusal"` throws instead of reading an empty `content` array, and that a 401
and a 400 surface as typed SDK errors carrying the API's own message.

**No authenticated call has been made.** `api.anthropic.com` is reachable from this
environment — it returns a well-formed `401 authentication_error` with a request id — but
there is no key here, so Anthropic's own inference is the one thing still unexercised. To
close that:

```bash
export ANTHROPIC_API_KEY=...        # or: ant auth login
npx tsx src/cli generate fixtures/my-bty-09.json          # sections 6 and 8, for real
npx tsx src/cli shots screenshot.png --code MY-XXX-00 --category "..."
```

If the first draft cites a figure that was not in the payload, the CLI prints what it
rejected and that the retry passed. If both drafts fail, the run fails rather than emitting
the brief — that is the validator working, not a fault.

## The four ways figures get in

| Route | Command | Gate |
|---|---|---|
| Manual JSON | `generate <file.json>` | none — you typed it |
| Platform export | `csv <file.csv>` | the column mapping is stated back and confirmed |
| Screenshots | `shots <image...>` | every figure is echoed with the label it was read from |
| Web form | `serve` | blank inputs stay out of the payload |

**The confirmation gate is a type, not a convention.** `analyse()` takes an `Engagement`;
CSV and screenshot intake produce a `PendingIntake`, and the only way to get an
`Engagement` out of one is `confirm(pending, true)`. Code that forgets the step does not
compile, and a pending read with an open question throws rather than proceeding.

### What the CSV path knows about real exports

The alias table is built from actual Shopee, Lazada, and TikTok Shop exports, and so are
the traps:

- **`Visitors` beats `Pageviews`** for sessions without asking. A pageview is not a session.
- **Shopee ships two revenue columns** — `Sales (MYR)` (gross) and
  `Sales (Shopee Rebate and Coins excluded)` (net). Equal-strength candidates for the same
  field, so it asks rather than picking.
- **TikTok's `Items refunded` holds a ringgit value** despite its name. Asked about — but
  only when no unambiguous refunded-value column exists.
- **`Units Sold` and `SKU orders` are not orders.** Asked about only when `orders` is
  otherwise unmapped, so a real Lazada export carrying both `Orders` and `Units Sold`
  passes clean.
- **Rates are never summed.** A period-total row is used when present; otherwise additive
  columns are summed and rates come back as gaps with the reason stated. AOV is derived from
  GMV ÷ orders when the export omits it, and says so.

**A platform export alone is not enough to pick a track**, and the tool says so rather than
guessing. A full Lazada Business Advisor export yields conversion, basket, and leakage
inputs — but no organic share, session trend, AOV trend, promo dependency, fulfilment
state, or margin. The brief comes back with every area unscored, `No area scoreable.`, and
seven named gaps. That is the correct output, not a failure: the CSV covers what the
platform measures, and the rest has to be asked.

## The benchmark candidate queue

A brief ends with figures observed in one client's account. Those are candidates. They land
in `benchmarks.queue.jsonl` (gitignored), and promotion is a human decision:

```bash
npx tsx src/cli generate eng.json --queue benchmarks.queue.jsonl   # queue candidates
npx tsx src/cli queue --queue benchmarks.queue.jsonl               # review
npx tsx src/cli approve Lazada "Beauty — skincare" "buyer CVR" \
    --queue benchmarks.queue.jsonl --benchmarks benchmarks.md      # promote
```

Three things are enforced rather than trusted:

- **n counts distinct client codes, not rows.** Six months of one seller is one client; a
  row count would read as six. Each client contributes its most recent figure to the median.
- **Below n=3, `approve()` throws.** One client is not a category.
- **A candidate cannot be promoted for the brief that produced it.** Passing
  `--current-engagement` makes it refuse — approving mid-engagement and re-running would
  score the client against itself and always return Stable.

`approve()` also reconciles vocabularies: the queue records `buyer CVR`, the benchmark
file's table means `CVR`. Writing the candidate's own label under that heading produced a
row the parser read as `CVR`, so a later lookup for `buyer CVR` never found it — silently,
forever. The approved row now carries both names and the heading it belongs under.

## The form

`serve` runs a single self-contained page on loopback. **The API key stays server-side** —
the page's only network call is to this server's own `/api/generate`, and a test asserts the
HTML contains no key, no `api.anthropic.com`, and no external script or stylesheet, so the
CSP can stay at `default-src 'none'`.

It imports the engine unchanged. There is no second copy of the scoring rules in the server
or the page, which is why the form was built last.

A blank input is left out of the payload entirely rather than sent as zero: absent becomes a
stated gap, zero becomes a claim the client never made. If the prose call fails — including
a validator rejection, which is the system working — the brief is still returned with
everything the engine computed, and the reason is shown.

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
src/intake/pending.ts            the confirmation gate
src/intake/csv.ts                platform-export reader + column mapping
src/intake/screenshot.ts         vision read, echoed and blocking
src/benchmarks/queue.ts          candidate queue, n>=3, same-brief guard
src/server/index.ts              the form server — holds the API key
src/server/page.ts               the page — self-contained, no external anything
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
