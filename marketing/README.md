# Ecomforges Marketing Knowledge Base

Central marketing repository for Ecomforges.

Core positioning: **We help you think better about ecommerce.**

Primary offer: Ecommerce Consultant — **RM499/month**

Target: Malaysian SME ecommerce owners, primarily KL/Selangor.

See [`brand/positioning.md`](brand/positioning.md) and
[`../prompts/ecomforges-copywriter.md`](../prompts/ecomforges-copywriter.md)
for the canonical messaging system.

## Layout

| Path | What lives here |
|---|---|
| `brand/` | Positioning, voice, messaging and copywriting rules — read these first |
| `copy/` | Reusable banks: headlines, hooks, CTAs (EN/BM) and objection handling |
| `landing-pages/` | Core page copy, `en/` and `bm/` |
| `email/` | Campaign email copy, `en/` and `bm/` |
| `ads/` | Approved ad assets by channel — Facebook/Instagram, TikTok, retargeting |
| `whatsapp/` | Approved WhatsApp copy, `en/` and `bm/` |
| `campaigns/` | `active/`, `evergreen/` and `archive/` campaign assets |

Directories carrying only a placeholder README have no approved assets yet.

## Relationship to `content/`

The client-facing copy already in [`../content/`](../content/) predates this
knowledge base and remains in force — in particular
[`outreach-templates.md`](../content/outreach-templates.md) (cold email and
WhatsApp) and [`homepage-faq.md`](../content/homepage-faq.md). Those files
describe pricing as "from RM499 a month" against a session ladder, where the
canonical offer here is stated flat at RM499/month; reconcile deliberately
rather than assuming either one is stale.

## Proof slots

Several files carry a `PROOF SLOT` comment — an HTML comment marking where
verified proof belongs once it exists. They render as nothing, so an unfilled
slot never reaches a reader.

They currently sit in:

| File | What goes in |
|---|---|
| `brand/positioning.md` | The canonical proof section for the whole brand |
| `copy/objections.md` | A real cost-of-a-wrong-decision example; measured outcomes |
| `landing-pages/en/core.md`, `landing-pages/bm/core.md` | On-page social proof |
| `email/en/evergreen-rm499.md`, `email/bm/evergreen-rm499.md` | One proof point in the body |

A slot may only be filled with proof that is **real, verified, consented and
dated**: case studies the client agreed to, testimonials in the client's own
words, or performance figures that were actually measured, carrying their
source and date range.

Never fill one with projections, illustrative or composite examples, "typical
client" figures, or numbers carried over from a pitch deck. An empty slot is
the correct state until real proof exists — it is not a gap to paper over, and
all copy here is written to stand without it.

Adding proof never converts an answer into a promise. The answer to "can you
guarantee sales?" stays no, however much data accumulates.

## Using this repository

New copy is generated against
[`../prompts/ecomforges-copywriter.md`](../prompts/ecomforges-copywriter.md),
which encodes the voice, the PAS/WIIFM structure and the claims that must never
be invented — no guaranteed sales or ROAS, no invented statistics, testimonials
or case studies. Fact-check every claim against this repository before it ships.
