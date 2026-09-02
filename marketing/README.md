# EcomForges Marketing Knowledge Base

Central marketing repository for EcomForges.

Core positioning: **We help you think better about ecommerce.**

Primary offer: Ecommerce Consultant — **RM499/month**

Target: Malaysian SME ecommerce owners, primarily KL/Selangor.

See [`brand/positioning.md`](brand/positioning.md) and
[`../prompts/ecomforges-copywriter.md`](../prompts/ecomforges-copywriter.md)
for the canonical messaging system.

## Layout

| Path | What lives here |
|---|---|
| `RECONCILIATION.md` | **Open conflicts with `content/` — read before publishing anything** |
| `brand/` | Positioning, voice, messaging, copywriting rules, hyperlocal angles |
| `copy/` | Reusable banks: headlines, hooks, CTAs (EN/BM) and objection handling |
| `landing-pages/` | Core page copy, `en/` and `bm/` |
| `email/` | Evergreen RM499 email, `en/` and `bm/` |
| `ads/` | Facebook/Instagram primary text, TikTok scripts, retargeting copy — EN and BM |
| `whatsapp/` | BM outreach adaptations and education follow-ups, `en/` and `bm/` |
| `campaigns/` | `evergreen/` always-on campaign; `active/` and `archive/` for seasonal |

Every directory README indexes its own files. `campaigns/archive/` is the only
one still carrying a placeholder, because it is genuinely empty.

### Where outreach lives

The five approved WhatsApp outreach templates and the cold email sequence are
**not** in this directory. They live in
[`../content/outreach-templates.md`](../content/outreach-templates.md), which is
the operational source and carries the WhatsApp compliance rules — opt-in,
template approval, PDPA, ban risk. `whatsapp/bm/outreach-templates.md` holds BM
adaptations of those five and inherits those rules rather than restating them.

## Relationship to `content/`

The client-facing copy in [`../content/`](../content/) predates this knowledge
base and remains in force — `outreach-templates.md` (cold email and WhatsApp)
and `homepage-faq.md` (the live homepage FAQ).

Three places where the two disagree are documented in
[`RECONCILIATION.md`](RECONCILIATION.md): **pricing** (flat RM499 vs "from
RM499"), **scope** (whether ads optimisation is advisory or executed), and
**brand spelling** (settled — EcomForges).

The first two are unresolved on purpose, because each changes what a customer
is promised. Nothing in `content/` was edited. New assets here are written to be
safe under either reading: price as *from RM499 a month*, scope as advisory.

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
| `brand/hyperlocal.md` | A verified Klang Valley difference |
| `ads/**` | Verified results — the highest-risk slots; see note below |
| `whatsapp/**` | A verified example in the diagnosis or benchmark message |
| `campaigns/evergreen/rm499-always-on.md` | The campaign's own funnel numbers |

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

Two slots carry extra warnings. The **ads** slots are the highest risk: Meta
rejects guarantee claims, and under Malaysian consumer protection law a
misleading representation in trade is an offence. The **campaign** slot draws a
distinction worth keeping — EcomForges' own funnel numbers can inform internal
decisions immediately, but they are never publishable as a client result.

The unevidenced **"900+ brands"** homepage claim, flagged in
`../content/outreach-templates.md`, is named in several slots as an example of
exactly what not to reuse.

## Using this repository

New copy is generated against
[`../prompts/ecomforges-copywriter.md`](../prompts/ecomforges-copywriter.md),
which encodes the voice, the PAS/WIIFM structure and the claims that must never
be invented — no guaranteed sales or ROAS, no invented statistics, testimonials
or case studies. Fact-check every claim against this repository before it ships.
