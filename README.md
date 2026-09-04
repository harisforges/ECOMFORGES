# ECOMFORGES

Internal client decision tools.

| Page | Path | URL |
|---|---|---|
| Client Qualification & Forge Track Selector | `index.html` | [/ECOMFORGES/](https://harisforges.github.io/ECOMFORGES/) |
| Growth Analyst | `analyst.html` | [/ECOMFORGES/analyst.html](https://harisforges.github.io/ECOMFORGES/analyst.html) |
| LeadForge — Acquisition Hub | `lead.html` | [/ECOMFORGES/lead.html](https://harisforges.github.io/ECOMFORGES/lead.html) |
| Client Portal (prototype) | `app/index.html` | [/ECOMFORGES/app/](https://harisforges.github.io/ECOMFORGES/app/) |
| ForgeMarketing — Marketing Masterbase | `forgemarketing.html` | [/ECOMFORGES/forgemarketing.html](https://harisforges.github.io/ECOMFORGES/forgemarketing.html) |
| ForgeSprint — Cycle Tracker | `sprint.html` | [/ECOMFORGES/sprint.html](https://harisforges.github.io/ECOMFORGES/sprint.html) |
| ForgeBilling — Invoices | `billing.html` | [/ECOMFORGES/billing.html](https://harisforges.github.io/ECOMFORGES/billing.html) |
| ForgeAgreement — Client Agreements | `agreement.html` | [/ECOMFORGES/agreement.html](https://harisforges.github.io/ECOMFORGES/agreement.html) |

Brand assets (logo SVGs and PNG exports) live in [`assets/`](assets/).

Where the toolset is going — the planned super app, and the one gap worth filling
before it — is in [`ROADMAP.md`](ROADMAP.md).

Marketing guidelines — positioning, voice, copywriting rules and the EN/BM copy
banks — live in [`marketing/`](marketing/), with the copywriter system prompt in
[`prompts/ecomforges-copywriter.md`](prompts/ecomforges-copywriter.md). Treat those
as canonical before writing anything client-facing.

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

### The fields are a list, not a text box

Industry, Lead Source and Assigned To were free text, which is how one pipeline ends up with
`Haris`, `haris` and `Haris ` as three different owners and `F&B`, `FnB` and `Food` as three
different categories. All three are now dropdowns built from one table in the page:

| Field | Values |
|---|---|
| Assigned to | Haris, DQ (or unassigned) |
| Lead source | Cold lead, Warm lead, Referral |
| Industry | the 17 categories a Malaysian SME seller lists under — Beauty & personal care, Health & supplements, Fashion & apparel, Jewellery & accessories, Home & living, Furniture & decor, Electronics & gadgets, Mobile & computer accessories, Baby & kids, Toys/games & hobby, Sports & outdoor, Pet supplies, Food & beverage, Automotive & accessories, Books & stationery, Digital products & services, Other |
| Sells on | Shopee, Lazada, TikTok Shop, own web store, Instagram / Facebook |

The industry list is deliberately the **same vocabulary as the analyst's category field** —
`Beauty — skincare` and `Home — kitchenware` are a LeadForge industry plus a sub-category — so
a lead that converts hands its category to the brief instead of being retyped into it.

A lead stores the value, not the label, so renaming a label later re-renders old leads instead
of stranding them. Leads typed before the lists existed are matched back onto them when they
load (`Referral` → Referral, `Haris` → Haris); anything that matches nothing is kept exactly as
typed and shown in the form as *(imported)*, because the point is to stop the drift, not to
throw away the record.

### Three things the lists made possible

**The opener picks itself.** *Sells on* is the hook, not an attribute. Two or more channels
means the cross-platform conversion gap is available and the form says to open with it and
names the two platforms (Email 1). One channel means it is not available, and the form says so
(Email 1b) — using the multi-channel hook on a single-channel seller is exactly what reads as a
blast. Both come from `content/outreach-templates.md`; the tool does not invent a third.

**The follow-up date is the house cadence.** Picking a source fills an empty follow-up date
with what the templates already say: cold gets Email 2 three working days after the first send,
an inbound warm lead is answered the same day, a referral introduction goes out the day it
lands. Working days only, it never overwrites a date someone typed, and **Use cadence** re-fills
it on demand.

**Owner row.** A second chip row filters by owner and counts the *open* pipeline — converted
and not-interested leads are not work either of them still has to do. **Assign** is a picker
now, not a text prompt.

### Quick Add

Typing a lead out of a Facebook or Google Maps listing is the slow part, so **Quick Add** takes
a paste and fills the form from it. It reads two kinds of paste:

**A link** gets a partial fill from the shape of the URL alone. `facebook.com/acmebeauty`,
`tiktok.com/@acme.my`, `shopee.com.my/acme_beauty` and `lazada.com.my/shop/acme-my` each give a
company name and set *Sells on* to that channel; a full Google Maps place URL carries the
business name outright (`/maps/place/Acme+Beauty+Sdn+Bhd/`). Shortened links —
`maps.app.goo.gl`, `bit.ly`, `vt.tiktok.com` — hold nothing to read, and the preview says so
rather than failing quietly.

**The page text** gets a much fuller one. Open the About tab or the Maps panel, select all,
paste. Phone numbers are found and normalised to `+60 12 345 6789` (mobile and landline
grouping differ, and `011`/`015` carry an extra digit), emails and websites are picked out,
*Industry* is guessed from keywords against the same seventeen options the form offers, and a
`PIC:` or `Contact person -` label yields the name. The address line and any extra phones or
emails go to *Notes* along with the source link, so nothing found is thrown away.

Names are ranked rather than taken first-come: a real account handle beats pasted text, pasted
text beats a stem squeezed out of a domain, and a multi-word name from the page ("Acme Home &
Living") beats a squashed marketplace handle ("acmehome").

Nothing is fetched. Facebook, TikTok and Google all refuse cross-origin reads, so a tool that
pulled those pages itself would need a server, a headless browser and a willingness to breach
their terms — the paste is the part that legitimately works, and it works offline. What comes
back is a preview showing which of the seven fields filled and which did not, and **Fill the
form** hands it to the normal Add Lead form for a human to confirm. It prefills; it never saves
a lead on its own, and the missing required fields are named in a toast.

### CSV

The export writes labels (`Food & beverage`, `Shopee | Lazada`) and the import maps them back
onto the stored values, so a file that leaves the tool can come back into it. Dates go out as
`YYYY-MM-DD` for the same reason: the old export wrote `01 Sept 2026`, which the importer read
as no date at all.

### The tools are separate, and stay separate

LeadForge works a prospect who is not a client yet. The calculator qualifies that prospect and
picks the Forge Track *before* an engagement runs. The analyst scores an engagement that is
*already* running. None of them replaces another, and neither the analyst nor LeadForge work
has ever touched `index.html`.

They install as independent home-screen apps, which is why each has its own manifest and its
own icon:

| Tool | Page | Manifest | Icon |
|---|---|---|---|
| Client Decision Tools | `index.html` | `manifest.webmanifest` | cyan hexagon |
| Growth Analyst | `analyst.html` | `analyst.webmanifest` | **amber** hexagon |
| LeadForge | `lead.html` | `lead.webmanifest` | **neon green** hexagon |
| ForgeMarketing | `forgemarketing.html` | `marketing.webmanifest` | **red** hexagon |
| ForgeSprint | `sprint.html` | `sprint.webmanifest` | **violet** hexagon |
| ForgeBilling | `billing.html` | `billing.webmanifest` | **blue** hexagon |
| ForgeAgreement | `agreement.html` | `agreement.webmanifest` | **magenta** hexagon |

Add the ones you use to your home screen; the colour tells them apart at a glance. Every
derived icon set is recoloured from the calculator's by the scripts in `scripts/` (and
`ecomforges-analyst/scripts/analyst-icons.py`), so the mark can never drift from the brand —
only its accent moves.

### Getting from one to another

Separate does not have to mean unreachable. Every tool carries the same **Tools** button in
its header: one menu, all seven, the colour dot matching that tool's icon and the current
page marked rather than linked. It works on a keyboard — down-arrow to open, arrows to walk,
Escape to close — and the menu is nudged back on screen when the button sits near an edge.

It is deliberately the smallest thing that solves the problem. When the tools merge into one
app (see `ROADMAP.md`) this becomes the app's own navigation and the links go away; until
then nobody has to remember seven file names.

The theme's own `--green` (#2DD4A0) is not that accent. At 48px on a navy ground it reads as a
duller cyan and collides with the calculator, so the icon ramp tops out at #39FF7E instead.

## ForgeMarketing — Marketing Masterbase

`forgemarketing.html` — the marketing knowledge base as a tool rather than a folder of
Markdown. Same shape as the others: one self-contained page, no build step, no external
requests, nothing uploaded.

**Generate** takes four choices — platform, audience, language and angle — and assembles
copy you can paste straight into the channel. Six platforms (Facebook/Instagram, TikTok,
WhatsApp, email, landing page, retargeting), five audiences from cold to past client, five
angles, English or BM. Each platform has its own shape: TikTok comes out as a timed script,
email as a subject plus body, WhatsApp as a single short message.

Pressing **Generate** again gives different copy. Fragments are drawn from a shuffle bag per
slot, so repeated presses walk the whole bank instead of landing on the same line twice. Leave
the angle on **Auto** and it picks a different one each press.

**Saved** keeps copy you want to keep. It lives in that browser only — not synced between
devices, and gone if you clear site data — so it is a stopgap, not the Firebase work described
in [`content/forgemarketing-firebase-brief.md`](content/forgemarketing-firebase-brief.md). The
page still works with storage blocked entirely; saving reports that it could not, rather than
silently dropping the copy.

Your last selection and tab are remembered, each tab is linkable
(`forgemarketing.html#conflicts`), and **Ctrl/Cmd+Enter** generates from anywhere in the page.
Changing any setting clears the copy on screen rather than leaving it attached to the previous
selection. Each platform carries its own length guide, and the meta row says whether the block
is inside it.

**Generated by** names whoever is writing — Haris or Daniel. It defaults to the signed-in
account, stamps the generation so the Saved list shows who wrote it, and closes email drafts
with that person's real signature from [`content/`](content/), so a draft is ready to send
rather than ready to edit. Only email gets a signature; the other platforms don't take one.

**Collaborators** is the contact book for paid reviewers, creators and freelancers: rate and
what it's per, status, platform handle, when they were last contacted, and notes. It totals
what the active monthly commitments come to, and flags any paid arrangement where disclosure
hasn't been agreed in writing — a paid review is an advertisement, and presenting one as an
ordinary customer opinion is the same misrepresentation the copy rules already forbid. The
list syncs to Firebase for everyone signed in, and falls back to this browser when offline.
Sort by name, rate or last contact, search across it, and export the whole thing to CSV —
phone numbers starting `+` are escaped so a spreadsheet reads them as text, not a formula.

The remaining seven tabs are the masterbase itself — positioning, voice and rules, messaging,
hyperlocal angles, the copy banks, objection handling, and the open conflicts — so the
reasoning is one tap away from the copy rather than in another repository.

### What it will not write

The generator carries no proof, because none is verified yet: no case studies, testimonials,
statistics, guarantees or performance claims. Every fragment is written to stand without them,
and each generated block ends with the checks to run before it ships.

Two live contradictions are handled rather than hidden. Price is written **from RM499 a
month**, true whether the offer is flat or an entry tier, and scope is written as advisory —
we read the data, the client's team executes — matching the promise on the live FAQ. Both are
documented in [`marketing/RECONCILIATION.md`](marketing/RECONCILIATION.md) and in the tool's
own Conflicts tab. Settle them before publishing anything.

The written masterbase lives in [`marketing/`](marketing/); the tool mirrors it. When the
Markdown changes, the tool's banks need the same change.

## ForgeSprint — Cycle Tracker

`sprint.html` — the thirty days between sessions. The calculator picks the Forge Track, the
analyst reads the numbers, and this holds what happens next: one constraint, three moves in
order, one owner, one number, thirty days.

It exists because of a promise the other two tools already make. Both close their client deck
with the same sentence:

> By the next session, [metric] should have moved. If it has not, either the sprint was not
> executed or the reading was wrong — and we will say which.

Answering *which* needs a record of whether the three moves were done. Nothing held that, so
at the next session it was reconstructed from memory — which is exactly when a client
remembers it differently.

### The part that matters

Closing a cycle asks for the number now. If it moved, nothing else is asked. If it did not,
the tool offers the two reasons the promise allows — **and will not let "our reading was
wrong" be picked below 67% executed.** A diagnosis is only wrong if it was tested, and it is
only tested if the sprint was run. The tool decides that from the move states rather than
leaving it to whoever is filling in the form at the end of a long day.

That record is what makes **Continue**, **Coach** and **Pause** an argument rather than an
impression: sprints run and the number moves, sprints run and it doesn't, or sprints that
don't run.

Client codes only, never business names — the same rule the analyst keeps. Each track's
constraint, metric and three moves are the calculator's own, so a cycle opened here is the
sprint the client was actually handed. One open cycle per client, because two means neither
number is attributable. History exports to CSV.

## ForgeBilling — Invoices

`billing.html` — who is on the retainer, who has paid, who has not.

Month to month with no lock-in is a good promise and a quiet failure mode: a client who
stops is a client who simply does not pay again, and nothing announces it. The overview is
the announcement — recurring revenue, outstanding, overdue, and who has not been invoiced
yet this month.

Raise a whole month in one press: one invoice per active client per period, numbered
`PREFIX-YYYYMM-NNN`. Raising the same period twice is refused rather than silently
duplicated, and numbers are derived from the invoices that exist rather than a stored
counter, so two devices raising at once cannot take the same number.

An invoice prints or saves to PDF from the browser, and copies as plain text for a WhatsApp
or email that does not need an attachment.

### It invents nothing

No bank account, no tier prices beyond the RM499 entry that is already public, no tax rate.
Those live in Settings, empty until filled, and the overview says so until they are. A
plausible-looking wrong account number on an invoice is worse than a blank one.

Malaysian service tax applies only to a registered business, so the tax line is off until
switched on, and it applies to invoices raised after that — not retrospectively.

### Real names live here

The analyst keeps client codes and never business names, deliberately. An invoice cannot
work that way: it needs the registered name to be a valid document. So this is the one tool
holding identifying client data, behind the same sign-in as the rest, and a `clientCode`
field ties each row back to the coded tools.

## ForgeAgreement — Client Agreements

`agreement.html` — the engagement letter, drafted from the billing roster so a client typed
once is not typed twice.

The clauses were written from what EcomForges already promises in public: advisory scope,
month to month, no lock-in, no guaranteed result. The point is that the paperwork says the
same thing as the pitch — a contract that lets EcomForges touch accounts, or implies a
result, contradicts the homepage.

**It is not legal advice and nobody who wrote it is a lawyer.** The tool says so on the
Template tab and again in "Before you send", which names the three clauses most in need of a
Malaysian lawyer's eye: liability, ownership, and personal data.

### Wording is versioned by copy, not reference

Clause text is copied into an agreement when it is created. Editing the template afterwards
does not touch agreements that already exist — someone who signed a document keeps the words
they signed. A new agreement picks up the current template. Editing one that has already been
sent changes your record, not the copy in their inbox, and the form says so.

An unsigned document carries a **DRAFT — NOT YET SIGNED** marker that clears when it is marked
signed. There is no e-signature: print or save to PDF, send it, mark it signed when it returns.

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
