# EcomForges Benchmark File

**Upload this file to the Claude Project's knowledge files.** The analyst is
instructed to treat it as the *only* source of benchmark figures. If a number is not
in here, the analyst must say it does not know rather than produce one.

This file starts nearly empty. That is correct and intentional. It fills up from real
client data, one engagement at a time, and it is the part of the system a competitor
cannot copy.

> ### Keep the filled version out of this repository
>
> This repo is **public**. The empty template here is harmless, but a benchmark file
> with two years of observed Malaysian category figures in it is the most valuable
> thing EcomForges owns, and committing it publishes it.
>
> The filled file's home is the **Claude Project's knowledge files** — it does not need
> to be in git at all. If you want a local copy tracked, name it `benchmarks.local.md`;
> `.gitignore` already excludes that name. Do not commit it, and do not paste the filled
> contents into a PR description or an issue.
>
> Client codes (`MY-PHARMA-01`) rather than client names are mandatory for the same
> reason: a row that survives into a public place should not identify anyone.

---

## How to add a row

After an engagement, take a figure you actually observed in a client's Seller Centre
and add one line to the right table. Rules:

1. **Only observed figures.** Never a number from a blog post, a webinar slide, a
   platform's marketing page, or an AI. Those are how wrong numbers enter a system and
   never leave.
2. **One client is not a benchmark.** Record it, but mark `n=1`. It becomes usable at
   `n=3`. At `n=3` or more, record the **median**, not the average — one outlier
   client distorts an average badly at small n.
3. **Always record the date.** A 2026 Shopee CVR is not a 2024 Shopee CVR. Anything
   older than 18 months should be re-checked or retired.
4. **Use a client code, not a client name.** `MY-BTY-04`, not the brand. This file
   will end up pasted into places you did not plan for.
5. **Note the period type.** A figure from an 11.11 week is not a baseline figure.

---

## Conversion rate (CVR)

The single most important table here — Conversion Forge™ cannot be scored without it.

| Platform | Category | Median CVR | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| _(empty)_ | | | | | | |

## Average order value (AOV)

| Platform | Category | Median AOV (RM) | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| _(empty)_ | | | | | | |

## Organic share of traffic

| Platform | Category | Median organic % | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| _(empty)_ | | | | | | |

## Promo dependency (% of revenue from campaign days)

| Platform | Category | Median promo % | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| _(empty)_ | | | | | | |

## Gross margin

| Platform | Category | Median margin % | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| _(empty)_ | | | | | | |

## ROAS

| Platform | Category | Median ROAS | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| _(empty)_ | | | | | | |

---

## Example row — for format only, NOT a real benchmark

Delete this section once the tables have real rows in them.

| Platform | Category | Median CVR | n | Period type | Last observed | Client codes |
|---|---|---|---|---|---|---|
| ~~Shopee~~ | ~~Beauty — skincare~~ | ~~2.4%~~ | ~~4~~ | ~~non-campaign, 30d~~ | ~~2026-07~~ | ~~MY-BTY-01/03/04/07~~ |

---

## Internal decision thresholds — these are NOT benchmarks

These are EcomForges' own scoring rules, already encoded in the analyst's
instructions. They are recorded here so there is one place to change them. They
describe how EcomForges decides, not how the market performs — the analyst must never
present one of these as a market figure.

| Rule | Threshold |
|---|---|
| CVR ratio → Stable / Medium / High / Critical | ≥1.00 / ≥0.85 / ≥0.65 / below 0.65 |
| Organic share counted as "thin" | below 30% |
| Promo dependency → Stable / Medium / High / Critical | <40% / <60% / <75% / ≥75% |
| Gross margin → Stable / Medium / High / Critical | ≥35% / ≥25% / ≥20% / below 20% |
| ROAS that raises Profitability pressure by one level | below 2.0 |
| Revenue impact weights | Conversion 1.00 · Traffic 0.85 · Campaign 0.80 · Basket 0.70 |
| Minimum readable period | 14 days, excluding campaign spikes |
| n required before a recorded figure is usable as a benchmark | 3 |

---

## Platform mechanics — verified, dated

Fee structures, campaign dates, and programme requirements are *published* by the
platforms, so unlike benchmarks they can be looked up. Record them here anyway, with
the date checked, because they change without notice.

| Platform | Item | Value | Source | Date checked |
|---|---|---|---|---|
| _(empty)_ | | | | |

## Retired figures

Move rows here instead of deleting them, so an old brief can still be explained.

| Platform | Category | Metric | Value | Retired on | Why |
|---|---|---|---|---|---|
| _(empty)_ | | | | | |
