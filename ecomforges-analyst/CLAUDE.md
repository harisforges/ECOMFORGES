# ecomforges-analyst

An advisory brief generator for EcomForges, a Malaysian e-commerce consultancy working
with SME sellers on Shopee, Lazada, TikTok Shop, and their own web stores.

Input: one engagement's platform figures for a period. Output: a session brief — what is
actually wrong, which Forge Track activates, and a 30-day sprint the client's own team
executes.

## The rule the whole design rests on

**`src/engine/` is pure and deterministic. No LLM calls in that directory, ever.**

Every number in a brief is either computed in `src/engine/` or came from the input. An
LLM never produces a figure. There is exactly one model call in the codebase
(`src/llm/prose.ts`) and it writes two prose sections from figures the engine already
computed — it is told not to compute, and a post-call validator rejects any number in
its output that was not in its input payload.

The reason is commercial, not aesthetic. These briefs go to clients paying a monthly
retainer. A confident wrong number is worse than an admitted gap.

## Provenance

Every number carries a tag. **Untagged numbers are a bug, not a style issue.**

| Tag | Means |
|---|---|
| `DATA` | Straight from the input |
| `CALC` | Computed — carries the arithmetic as `workings` |
| `BM` | From a benchmark file row — carries the `rowId` |
| `EST` | An estimate — carries a mandatory `basis` |
| `ASK` | Not known. **Carries no value at all** |

`ASK` deliberately has no `value` field. Code that wants a number from a `Tagged` must
handle the `ASK` case explicitly; it cannot default to zero or coerce. A missing input
propagates to the output as an honest gap rather than a silent zero. `map()` in
`src/types/tagged.ts` does that propagation.

## Never invent a benchmark

There is no public authoritative dataset of Shopee/Lazada/TikTok Malaysia category
benchmarks. A conversion benchmark may come from exactly three places, in precedence
order:

1. A figure supplied for this run by the consultant
2. A usable row from the benchmark file (`n >= 3`, not stale)
3. **The client's own strongest platform**, when one catalogue runs on two or more
   platforms — observed data, same products, same brand, same period, every variable
   held constant except the platform

If none is available, Conversion comes back `Unscored`, the brief says so, and the other
five areas still score. There is **no default, no average, and no hardcoded fallback
figure** anywhere in `src/engine/`. A test asserts that.

An internal benchmark (case 3) scores that client only. It is marked
`comparableAcrossClients: false`, and anything that would aggregate it across
engagements must refuse.

## `Unscored` is not zero

`Unscored` is a distinct value from level 0. A missing benchmark means "we do not know",
not "this area is fine". The types make it impossible to accidentally arithmetic on it.

## Intake never bypasses confirmation

`analyse()` takes an `Engagement`. CSV and screenshot intake produce a `PendingIntake`, and
the only way to get an `Engagement` out of one is `confirm(pending, true)` — which throws
if any question is open. A misread digit in a conversion rate changes which track
activates, and a silently wrong column mapping produces a confident wrong analysis, so
neither may reach the engine unchecked.

`src/intake/screenshot.ts` is the one place besides `src/llm/` where a model produces
numbers. It is fenced: every figure carries the on-screen label it was read from, and an
illegible figure comes back `null` with a stated reason rather than a best guess.

## Benchmarks are promoted by a human, never by the tool

A brief's observed figures go to the candidate queue. `approve()` refuses below n=3
(counting distinct client codes, not rows) and refuses a candidate produced by the
engagement currently being analysed. Nothing writes to the benchmark file automatically —
otherwise the tool's own output becomes its own evidence.

## Data

Real client data goes in `fixtures/real/` and is **never committed**. Neither is the
filled benchmark file — see `.gitignore`, which explains why. Client codes
(`MY-BTY-09`) rather than client names are mandatory: a row that survives into a public
place must not identify anyone.

## A client deck is a different document, not a filtered brief

The brief is the working document: provenance tags, `[ASK]` gaps, benchmark origins, the Growth
Pressure arithmetic. That is how we know the finding is sound and none of it is what a client
needs. The deck (`analyst.html` → Client deck) carries the finding, the money, the sprint their
team executes, and the gaps as requests.

Three things are deliberately absent. The **internal client code**, because a document a client
opens carries their own business name. The **benchmark's origin**, because when the benchmark is
the client's own strongest platform, naming it invites a debate about the comparison instead of
the gap. And the **scoring consequence** trailing most gap questions — "Basket cannot be scored"
is our machinery. That clause is trimmed and the request in front of it kept, at clause level
rather than sentence level, so "Shopee: AOV trend not supplied — Basket cannot be scored" does
not lose the word Shopee on its way out.

The PDF writer itself is **not in this project**. It is extracted from `index.html` at build
time between the `SHARED-PDF` sentinels, along with the stylesheet — one document language, no
second copy to drift. A test asserts the block in `analyst.html` is byte-identical to the
calculator's.

**The deck will not build from unchecked prose.** A browser cannot hold an API key, so the
consultant carries the two prose sections across by hand — and that paste faces the same
`validateProse` the API path runs (`src/llm/validate.ts`, split out of `prose.ts` so the page
bundle does not pull in the SDK). Any figure not in the payload is named and the deck is
refused. The manual route must not be the unguarded one.

## Movement is computed, not remembered by the page

`src/engine/movement.ts` compares one analysis against a `PeriodSnapshot` of an earlier one.
It is in `src/engine/` for the usual reason: it produces numbers, so it is deterministic and
its deltas carry their arithmetic.

It **throws** rather than returning an empty result when the snapshot is not comparable —
different client, or a period that is not strictly earlier. An empty result reads exactly like
a genuinely flat cycle, and "nothing moved" is a sentence someone says out loud to a client.

The browser supplies the snapshot; the engine never goes looking for storage. Leakage is the
one metric where *down* is the win, and `verdict()` knows that — the alternative is
congratulating a client for losing revenue.

## Output voice

British spelling. RM for currency, with thousands separators. Short sentences. No
hedging, no emoji, no exclamation marks.

Never "we will implement", "we'll set this up", or "let us handle". The consultancy
advises; the client executes. The correct form is *"you set the free shipping threshold
to RM89"*.

## Layout

```
src/types/        domain types — Tagged, the Standard Data Sheet
src/engine/       deterministic scoring. NO LLM CALLS.
src/benchmarks/   benchmark file parser
src/render/       brief rendering
src/llm/          the single Anthropic call
src/cli/          entry point
prompts/          versioned analyst system prompt
fixtures/         test client data (fixtures/real/ untracked)
tests/
```

## Commands

```
npm test                                        # vitest
npm run typecheck
npx tsx src/cli generate <fixture.json> --benchmarks <path>
npx tsx src/cli generate <fixture.json> --no-llm # engine only, no API call
npx tsx src/cli csv <file.csv> --platform Lazada --code MY-XXX-00 --category "..."
npx tsx src/cli shots <image...> --code MY-XXX-00 --category "..."
npx tsx src/cli queue --queue benchmarks.queue.jsonl
npx tsx src/cli approve <platform> <category> <metric> --queue ... --benchmarks ...
npx tsx src/cli serve --port 4173
```
