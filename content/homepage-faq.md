# Homepage FAQ — approved replacement copy

Status: **applied 2026-08-19.** Live on the Homepage (Breakdance post 18), in the
section headed "Wondering how we works?". LiteSpeed cache purged after applying.

## Why this exists

The live FAQ answers are placeholder demo content from a magazine subscription
store — not stale copy, someone else's sample text. A prospect clicking "What
services do you offer?" currently reads *"we're unable to offer free samples. As
a retailer, we buy all magazines from their publishers at the regular trade
price."* All five answers are wrong in the same way.

## Decisions this copy encodes

| Decision | Answer |
|---|---|
| What we sell publicly | Advisory only — the client's team executes |
| Pricing shown | "From RM499 a month" — no full ladder |
| Guarantee | None. It is a confidence statement, so the copy promises the process, never a result |
| Commitment | Month to month, no lock-in |

Voice follows the house rules: British spelling, short sentences, no hedging,
no emoji, no exclamation marks, and never "we will implement" — the consultancy
advises, the client executes.

---

## The eight questions

### What do you actually do?

We find the one thing holding your store back this month and tell you exactly
what to do about it. Each cycle you get a diagnosis from your own platform data
and a 30-day sprint: three moves, in order, with one number to move. Your team
runs the sprint. At the next session we check whether the number moved.

### So you don't run my ads or edit my listings?

No. We are advisers, not an agency. You keep control of your accounts, your
budget and your team, and nobody touches your store but you. That is deliberate.
An agency that logs in and changes things leaves you dependent on it. A team that
knows why a change worked can repeat it without us.

### What does it cost?

From RM499 a month, month to month. The price tracks how many sessions you need,
not how many hours we spend. No lock-in and no notice period — if the work stops
earning its place, you stop.

### Which platforms do you work with?

Shopee, Lazada, TikTok Shop, and your own web store. Most clients sell on more
than one, and that is an advantage: when the same catalogue runs on two
platforms, the stronger one becomes the benchmark for the weaker one. Same
products, same prices, same month — so the gap is the platform, not the market.

### How long before I see something change?

One cycle is 30 days. Every sprint names a single metric and a date, so the next
session has a yes or no answer rather than a discussion. Some cycles move a
number sharply; some clear a blocker that was stopping everything else. Both
count.

### What if the number doesn't move?

We say so, and we say which of the two reasons it was: the sprint was not
executed, or our reading was wrong. Then we change the approach. We do not
promise a result we cannot control — your team's execution is half of it. What we
do promise is that you will never be told something worked when it did not.

### What do you need from me?

Thirty days of platform data for every channel you sell on. Screenshots of the
analytics pages are enough. And one person who owns execution between sessions —
not necessarily you, but one name. A sprint that belongs to everyone gets run by
nobody.

### Do you take every seller who applies?

No. We assess fit before quoting, and we turn down stores we don't think we can
move. Usually that's a margin or operations problem that has to be fixed before
any growth work is worth paying for. If that's where you are, we'll say so and
point you at what to do instead.

---

## Two other homepage fixes, same pass

1. **"We Execute"** — a heading in the four-step band. Now that the public
   promise is advisory-only, it contradicted the FAQ one screen below it.
   Applied as **"You Execute"**. It lives in the `<h1>` of the animated SVG code
   block, not a Heading element; the `we-execute-*` CSS classes and JS ids were
   deliberately left alone so the animation keeps working.

2. **"Trusted by 900+ brands to scale their e-commerce performace"** — missing an
   `r` in *performance*. Corrected.

## Applying it

Needs the Breakdance connection attached to the session. The FAQ is a Breakdance
element on post 18; read the tree first to find the FAQ element and replace its
question/answer pairs rather than rebuilding the section, so the existing styling
survives.

**LiteSpeed Cache is active and serves stale HTML.** Purge after applying, or the
old answers keep showing.

### What was done

The eight question/answer pairs replaced the five placeholder items in place on
the existing FAQ element, so its styling and accordion behaviour are untouched.
The element also carries a stale three-item `questions` array left over from an
older version of the block; it renders nothing and was left as found.
