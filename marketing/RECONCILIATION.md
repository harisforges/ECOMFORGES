# Open Conflicts

Three places where the marketing playbook and the client-facing copy already in
`content/` say different things. All three are **unresolved on purpose** — each
changes what a customer is promised, which is a business decision rather than a
copy cleanup.

Nothing in `content/` was edited. New assets in `marketing/` are written to be
**safe under either reading**, so work can continue while these are open. The
workaround chosen for each is noted below.

---

## 1. Pricing — flat or entry tier

| Source | Says |
|---|---|
| `marketing/brand/positioning.md` (playbook) | **RM499/month**, stated flat |
| `content/homepage-faq.md` | "**From RM499 a month.** The price tracks how many sessions you need, not how many hours we spend." |
| `content/outreach-templates.md` | "**From RM499 a month**, month to month." |

The live public copy describes a ladder whose entry point is RM499. The playbook
states a single price.

**Why it matters.** A flat price in an ad, when the real structure is a ladder,
is a misleading representation in trade. `content/outreach-templates.md` already
flags that risk in its own "Do not say" section.

**Workaround in new assets.** All new outward-facing copy says *from RM499 a
month*, which is true under both readings — under the flat reading, "from RM499"
is still accurate.

**To settle:** confirm whether RM499 is the only price or the entry tier. If it
is a ladder, `brand/positioning.md` needs the tiers. If it is flat, the two
`content/` files need "From" removed.

---

## 2. Scope — does EcomForges touch the ads?

| Source | Says |
|---|---|
| `marketing/brand/positioning.md` (playbook) | Offer includes "**Basic ads optimisation**" |
| `content/homepage-faq.md` | "So you don't run my ads or edit my listings? **No. We are advisers, not an agency.** You keep control of your accounts, your budget and your team, and nobody touches your store but you." |
| `content/outreach-templates.md` | "We do not run your ads or touch your account — we read the data, name the one thing costing you money this month, and your team runs it." |

This is the more consequential of the three. The live promise is explicitly
advisory-only, and the FAQ makes a point of it being deliberate. The playbook
lists ads optimisation as a deliverable.

The two are reconcilable if "basic ads optimisation" means *advising on* ads —
reviewing performance and recommending changes the client's team executes. They
are not reconcilable if it means logging in and changing campaigns.

**Why it matters.** It determines what is actually delivered in a paid
engagement, and the advisory framing is load-bearing in the existing copy: the
FAQ argues that not touching the account is what keeps the client independent.
Contradicting it one screen away damages the argument, not just the wording.

**Workaround in new assets.** All new copy says EcomForges reads the data and
the client's team executes — matching the live promise, and true under the
advisory reading of the playbook. No new asset claims EcomForges runs ads.

**To settle:** confirm which it is, then align the other source. If advisory,
`brand/positioning.md` should read "ads review and recommendations" or similar.

**Related, already noted in `content/homepage-faq.md`:** the homepage carries a
**"We Execute"** heading that contradicts the advisory FAQ one screen below it.
That fix is still outstanding and belongs to whichever way this resolves.

---

## 3. Brand spelling — resolved

| Source | Spelling |
|---|---|
| Page titles, logo assets, email signatures, SSM registration | **EcomForges** |
| Playbook as delivered | Ecomforges |

**Settled, not left open.** The live brand is authoritative: `EcomForges` appears
in every page title, the logo lockup, all three email signatures and alongside
the SSM number. The playbook's lowercase *f* was the outlier.

All 31 occurrences across `marketing/` and `prompts/` were normalised to
**EcomForges**. Lowercase `ecomforges` in URLs and email addresses
(`www.ecomforges.com`, `haris@ecomforges.com`) was left untouched, as were the
repository name and its `ECOMFORGES` heading.

---

## Also outstanding, not a conflict

`content/outreach-templates.md` flags the homepage claim **"Trusted by 900+
brands"** as unevidenced, and separately notes *performace* is misspelt in that
same live heading. Both are still on the site. The 900+ figure is named in
several proof slots here as an example of exactly what not to reuse.
