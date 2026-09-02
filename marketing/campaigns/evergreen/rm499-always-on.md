# Evergreen Campaign — RM499 Always-On

The one campaign that runs continuously. Everything else is seasonal and
archives; this does not.

It exists to give every asset in this repository a place to sit, so that copy is
written into a sequence rather than one piece at a time.

## Assets, in the order a lead meets them

| Stage | Asset | Language |
|---|---|---|
| 1. Cold reach | `ads/facebook-instagram/primary-text-{en,bm}.md` | Both |
| 1. Cold reach | `ads/tiktok/scripts-{en,bm}.md` | Both |
| 2. Landing | `landing-pages/{en,bm}/core.md` | Both |
| 3. Did not convert | `ads/retargeting/copy-en-bm.md` | Both |
| 4. Enquired | `content/outreach-templates.md` (A/B/C) · `whatsapp/bm/outreach-templates.md` | EN · BM |
| 5. Went quiet | `whatsapp/{en,bm}/education-followups.md` | Both |
| 6. Nurture | `email/{en,bm}/evergreen-rm499.md` | Both |
| 7. Objections | `copy/objections.md` | BM, EN answers inline |

## The sequence

**Cold → landing.** Ads run on the four angles in the primary-text files: stuck
store, cost of the wrong decision, anti-guru, multi-channel benchmark. Each
points at the core landing page in the matching language. Do not mix — a BM ad
landing on English copy is the cheapest way to lose a click you paid for.

**Landing → enquiry.** The page asks for a WhatsApp conversation, not a purchase.
The offer is a read on their numbers; the RM499 decision comes after it.

**Enquiry → session.** Handled by the outreach templates. Their compliance rules
apply — opt-in, template approval, PDPA — and they are not optional.

**Quiet → nurture.** The education follow-ups, at most one per fortnight, and the
evergreen email. No new offer, no discount, no deadline.

## Rules for this campaign

- **No seasonal urgency.** This campaign has no deadline because the offer has
  none. Seasonal pushes belong in `campaigns/active/` and archive when they end.
- **One language end to end.** A lead who arrives in BM stays in BM.
- **One CTA per asset.** Every piece ends in a single next step.
- **Price wording is `from RM499 a month`** until `../../RECONCILIATION.md` § 1
  is settled.
- **Scope wording is advisory** — we read, the client's team executes — until
  `../../RECONCILIATION.md` § 2 is settled.

## What is measured

Because there is no proof to point at yet, the campaign's own numbers are the
first honest data this repository will have:

| Stage | Question |
|---|---|
| Ad → landing | Which of the four angles earns the cheapest qualified click? |
| Landing → enquiry | Do BM and EN convert differently? |
| Enquiry → data sent | How many actually send 30 days of numbers? |
| Data sent → paid | How many convert after the free read? |

<!--
PROOF SLOT — intentionally empty.

This is the slot most likely to be fillable first, because campaign performance
is EcomForges' own data and needs no client consent to record.

Note the distinction: EcomForges' own funnel numbers can be used internally for
decisions immediately. They only become *published* proof if they are about
client outcomes, and that still needs consent, dates and sources.

Never publish a campaign metric as if it were a client result.
-->
