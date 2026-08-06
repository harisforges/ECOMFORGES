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

## Data

Real client data goes in `fixtures/real/` and is **never committed**. Neither is the
filled benchmark file — see `.gitignore`, which explains why. Client codes
(`MY-BTY-09`) rather than client names are mandatory: a row that survives into a public
place must not identify anyone.

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
```
