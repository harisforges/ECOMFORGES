# Homepage FAQ — approved replacement copy

Status: **applied.** Live on the Homepage (Breakdance post 18), in the section
now headed "Wondering how we work?". The eight answers below are what the page
serves today — verified against the rendered front end, not just the builder.

The old placeholder questions still sit in the element's stored data under a
legacy key that nothing renders. Harmless, but if a future Breakdance version
starts reading that key again, the magazine copy would reappear; worth clearing
next time the element is edited by hand.

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

## Homepage copy fixes — all applied

1. **"We Execute"** → **"You Execute"**. Applied. Only an invisible HTML comment
   and some CSS class names still carry the old wording; nothing a visitor sees.

2. **"performace"** → **"performance"**. Applied.

3. **"Trusted by 900+ brands…"** → **"We help you think better about ecommerce."**
   The 900+ figure was unevidenced, and an unevidenceable social-proof claim is
   a misleading representation in trade. Replaced with the canonical positioning
   rather than a smaller number nobody can evidence either.

4. **"Clear Strategy. Immediate Action. Guaranteed."** → **"…Every cycle."**
   A guarantee in an h1, directly against the decision table above, which says
   the copy promises the process and never a result. "Every cycle" promises the
   cadence, which is true.

5. **"a lot of ecommerce store owner wasting"** → **"store owners"**. The same
   sentence appears four times on the page; all four were corrected.

## "You Execute" heading on phones — fixed

The animated "You Execute" block pinned its heading at `top: 50px` with a fixed
`30.738px` font, over an SVG that scales with its container. On desktop that put
the label 13% down the artwork. By 360px the artwork had shrunk to 209px tall
while the label stayed at 50px, so it sat **24% down — on top of the animated
paths** — and wrapped onto two lines.

Fixed by making the **offset** proportional: `top: 13.09%` is the desktop ratio
(50/382), and `white-space: nowrap` stops the two-word label ever splitting.

**The font size is deliberately left at 30.738px.** An earlier attempt also
scaled the font down with the artwork, which fixed the collision but made the
label visibly smaller than the "We Diagnose" and "We Monitor" headings beside
it — the three stopped reading as one set. Those two sit in normal flow above
their artwork and so never collide; only this one is absolutely positioned over
its SVG, which is why it alone needed the offset fixed. Matching their size and
moving only the offset gets both.

Measured 1200px down to 320px: the label stays on one line at full size, and the
gap between it and the Deploy button stays between 94px and 26px. Desktop is
unchanged.

### Two things worth knowing before editing this

**The override lives in the site stylesheet, not the block.** It is in the
Breakdance selectors under the "Homepage fixes" collection, as
`.we-execute-container .we-execute-wrapper h1`. That two-class-plus-tag selector
outranks the block's own `.we-execute-wrapper h1`, which is what makes it win
despite the block's `<style>` loading later. It was done this way deliberately:
editing the block means re-sending 14KB of SVG path data to a live page, and a
single wrong digit there breaks the artwork. Overriding never touches the SVG.

**Breakdance's CSS importer does not understand container-query units.** An
attempt at `font-size: 5.123cqw` was stored as the number `"5.123 cqw"` and
emitted as `font-size:5.123 cqw` — a space inside the value, so invalid, so
silently ignored. The import reported success, and only reading the emitted
`selectors.css` back showed the declaration had not landed. Check the emitted
CSS after importing anything with an unusual unit. Plain px, `%` and `clamp()`
with `vw` all survive intact.

## Still open on the homepage

- **The stats band.** Eight animated counters — 92% achieve measurable growth,
  up to 200% growth, and so on. Confirmed by Haris as real internal figures, so
  they stay. They must be evidenceable if a prospect or a regulator asks.

  The one wording problem is fixed: "driven by strategy, **delivered by
  execution**" now reads "delivered by **your team**", which names who does the
  executing and agrees with advisory-only. The other two mentions of execution
  in that band already refer to the client's own execution and were left alone.
- **Heading levels.** Several sections use `h1`, so the page has multiple
  top-level headings. Bad for SEO and screen readers, but changing the tags
  would change their styling, so it needs a design pass rather than a find and
  replace.

## Applying it

Needs the Breakdance connection attached to the session. The FAQ is a Breakdance
element on post 18; read the tree first to find the FAQ element and replace its
question/answer pairs rather than rebuilding the section, so the existing styling
survives.

**LiteSpeed Cache is active and serves stale HTML.** Purge after applying, or the
old answers keep showing.
