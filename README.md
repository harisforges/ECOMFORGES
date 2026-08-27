# ECOMFORGES

Internal client decision tools.

| Page | Path | URL |
|---|---|---|
| Client Qualification & Forge Track Selector | `index.html` | [/ECOMFORGES/](https://harisforges.github.io/ECOMFORGES/) |
| Growth Analyst | `analyst.html` | [/ECOMFORGES/analyst.html](https://harisforges.github.io/ECOMFORGES/analyst.html) |
| LeadForge — Acquisition Hub | `lead.html` | [/ECOMFORGES/lead.html](https://harisforges.github.io/ECOMFORGES/lead.html) |
| Client Portal (prototype) | `app/index.html` | [/ECOMFORGES/app/](https://harisforges.github.io/ECOMFORGES/app/) |

Brand assets (logo SVGs and PNG exports) live in [`assets/`](assets/).

## Client Qualification & Forge Track Selector

`index.html` — a single self-contained page, no build step and no external
requests. Open it directly, or use the published GitHub Pages URL.

Three stages:

| Stage | When it runs | What it decides |
|---|---|---|
| Qualify | Before you accept a seller | 100-point score → Tier A / B / C |
| Forge Track | Before each session | Which single Forge Track activates this cycle |
| Status Review | Every three cycles | Continue / Coach / Downgrade / Pause / Exit |

Nothing is sent anywhere. Work is autosaved to this browser's local storage so a
closed tab can be recovered — see [What the tools remember](#what-the-tools-remember) —
and **Save engagement file** is still how you move work between devices.

## Client Portal (prototype)

`app/index.html` — a phone-shaped walkthrough of the client-facing portal:
login, dashboard, meeting booking, to-do list and KPI views. Installable to a
home screen via `app/manifest.webmanifest`.

It is a **prototype, not a product**. There is no backend and no persistence:
the login screen accepts anything and advances, nothing typed into it is
transmitted or stored, and every figure on screen is sample data. Reloading
returns to the login screen.

The page is a bundled export — React and the Inter web font are inlined, so it
makes no network requests once loaded.

## Growth Analyst

`analyst.html` — type a client's platform figures in, get the full growth brief. Runs
entirely in the page: no install, no sign-in, no API key, and nothing is uploaded anywhere.

The two prose sections (the finding and the 30-day sprint) are the only part that needs a
model. Press **Copy for Claude** and paste into the EcomForges Growth Analyst Project — the
figures are computed in the page, so the Project only writes about them.

## LeadForge — Acquisition Hub

`lead.html` — the top of the funnel, before either of the other two tools has anything to
score. Capture a lead, record who owns it, move it through New → Contacted → Meeting →
Qualified → Converted, and see the conversion rate and the overdue follow-ups in the header.

It stores leads in IndexedDB on the device, with an optional Firebase sync, and exports and
imports CSV so a pipeline can move between phones.

It wears the EcomForges logo: the lockup on a wide screen, and the mark alone below 620px,
where the header has to share its row with the sync badge and the action buttons.

### The tools are separate, and stay separate

LeadForge works a prospect who is not a client yet. The calculator qualifies that prospect and
picks the Forge Track *before* an engagement runs. The analyst scores an engagement that is
*already* running. None of them replaces another, and neither the analyst nor LeadForge work
has ever touched `index.html`.

They install as three independent home-screen apps, which is why each has its own manifest and
its own icon:

| | Calculator | Analyst | LeadForge |
|---|---|---|---|
| Page | `index.html` | `analyst.html` | `lead.html` |
| Manifest | `manifest.webmanifest` | `analyst.webmanifest` | `lead.webmanifest` |
| Home-screen label | Forge Tools | Forge Analyst | Forge Leads |
| Icon | cyan hexagon | **amber** hexagon | **neon green** hexagon |

Add all three to your home screen; the colour tells them apart at a glance. Both derived icon
sets are recoloured from the calculator's by
`ecomforges-analyst/scripts/analyst-icons.py` and `scripts/lead-icons.py`, so the mark can
never drift from the brand — only its accent moves.

The theme's own `--green` (#2DD4A0) is not that accent. At 48px on a navy ground it reads as a
duller cyan and collides with the calculator, so the icon ramp tops out at #39FF7E instead.

## Client decks

The two decision tools — the calculator and the analyst — each produce two PDFs from the same
data. LeadForge produces no deck: a lead is not an engagement yet, and there is nothing to
report to them.

| Button | Reader | Answers |
|---|---|---|
| **Internal PDF** | you, or a partner | should we take or keep this client, and what do we work on |
| **Client deck (PDF)** | the client or prospect | here is what we found in your business, and here is what you do about it |

They are **not the same document with fields hidden**. Same data, different reader, so most
sentences are rewritten. What never crosses into a client deck:

| From | Stays internal |
|---|---|
| Qualification | the 100-point score, the Tier letter, red flags, category weights, *"probe this before committing to a package"* |
| Forge Track | impact weights, the track ranking score, and every *"say this exactly"* call script |
| Status Review | the retention decision word (Downgrade / Pause / Exit), attendance, whether they paid, the model back-test |
| Growth Analyst | the internal client code, `[ASK]` tags, benchmark origins |

The qualification model's own category names are also renamed. "Founder Mindset & Execution"
is a fair thing to score privately and an insulting row to hand the founder; the deck calls it
"Speed of decisions and execution".

**Pause and Exit produce a summary, not an announcement.** Ending an engagement is a
conversation. A PDF that lands in an inbox declaring it removes the chance to have that
conversation and states the terms in our words rather than agreed ones — so the deck records
what was issued, what moved, and what stays with them. A person delivers the decision.

### It is enforced, not remembered

A forbidden-content list lives in `index.html` (`DECK_FORBIDDEN`). Every string a deck draws is
recorded as it is drawn, and `assertClientSafe` reads it back **before the download starts**. If
anything internal got in, the deck does not save and the page names what and why. `deck.test.ts`
does the same job at build time, by generating every deck in a real browser, extracting the text
out of the finished PDF bytes, and — this is the load-bearing part — checking the *internal*
report from identical state still contains those tokens. Otherwise a deck that leaked nothing
because the data never arrived would pass just as happily as one that redacted properly.

### The analyst's extra step

The analyst's finding and sprint come from the Claude Project, so the deck needs that text back:

1. **Generate brief** → **Copy for Claude** → paste into the Growth Analyst Project
2. Paste its reply into **"Paste the Project's reply here"** → **Check the reply**
3. Type the business name → **Client deck (PDF)**

Step 2 is not a formality. Every figure in the reply is checked against the numbers the page
computed, and anything that is not in the data is named and refused — the same validator the API
version runs. A clipboard is not a reason to trust the text more. **No checked reply, no deck.**

## What the tools remember

Everything below stays on the device it was typed on. Nothing is uploaded, and the analyst
stores client **codes**, never business names.

**LeadForge is the exception, and it is opt-in.** Leads live in IndexedDB on the device, but
`lead.html` also carries a Firebase config: with it reachable, the pipeline syncs to that
project so the same list opens on a second phone. The header badge says which of the two is
live — **Local** or **Live**.

**Autosave.** Both tools now save as you type. The calculator offers a part-filled scorecard
back after a crash rather than restoring it silently — a silent restore would start the next
client's assessment pre-filled with the last one's answers.

**Movement between periods.** Every deck closes by naming one metric and a date. The analyst
now keeps one snapshot per client per period, and the next brief opens by saying whether that
number actually moved. It refuses to compare across different clients or overlapping periods,
and it says so when a nearer period was skipped for overlapping. A metric missing from either
period is reported as **unknown**, never as "no change".

**The benchmark ledger.** Candidates used to be copied to a clipboard and go nowhere. They now
accumulate across every brief, counted by **distinct client code** — three readings of one
account is still one client. At three, the ledger hands over the finished `benchmarks.md` row,
using the median across clients so one outlier cannot drag a category.

## Note on visibility

This repository is public so that GitHub Pages can serve the tools. The pages
contain scoring weights, thresholds, pricing and client-facing scripts — treat
the URLs as shareable-by-accident and review before adding anything further.
`robots.txt` asks search engines not to index them; that is a request, not
access control.
