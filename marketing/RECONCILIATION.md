# Resolved Conflicts

Three places where the marketing playbook and the client-facing copy in
`content/` said different things. **All three are now resolved** and the
playbook has been aligned.

The record is kept rather than deleted, because the reasoning matters: anyone
who later finds a flat price or an ads-execution claim in old copy needs to
know it was decided, not overlooked.

## The authority

`content/homepage-faq.md` opens with a decision table marked **approved**:

| Decision | Answer |
|---|---|
| What we sell publicly | Advisory only — the client's team executes |
| Pricing shown | "From RM499 a month" — no full ladder |
| Guarantee | None. The copy promises the process, never a result |
| Commitment | Month to month, no lock-in |

That record settles both open questions. It is an approved company decision, not
an inference — so the playbook was wrong and has been corrected to match, exactly
as the brand spelling was.

Note what it also says about the live site: those FAQ answers are **approved, not
yet applied**. The homepage still carries placeholder text from a magazine
subscription store. So the approved decisions are the authority here; the live
page is neither.

---

## 1. Pricing — resolved

**Decision: "from RM499 a month". The full ladder is not published.**

| Source | Said | Now |
|---|---|---|
| `brand/positioning.md` | "RM499/month", flat | From RM499 a month, entry tier named |
| `prompts/ecomforges-copywriter.md` | "RM499/month" | From RM499 a month |
| `landing-pages/{en,bm}/core.md` | "RM499/month" | From RM499 a month |
| `email/{en,bm}/evergreen-rm499.md` | "RM499/month" | From RM499 a month |
| `content/homepage-faq.md` | "From RM499 a month" | unchanged — it was right |
| `content/outreach-templates.md` | "From RM499 a month" | unchanged — it was right |

RM499 is the entry point, not the whole offer: the price tracks how many
sessions a client needs. The ladder exists and is quoted per client; publishing
it is a deliberate no.

**Why it had to go this way.** A flat price in public copy, against a real
ladder, is a misleading representation in trade — a risk
`content/outreach-templates.md` already flags in its own "Do not say" list. The
two client-facing files were already correct; only the playbook was wrong.

Hooks and headlines that mention the figure comparatively — "one wrong decision
can cost more than RM499" — are untouched. They compare against a number, they
do not state the offer's price structure.

---

## 2. Scope — resolved

**Decision: advisory only. The client's team executes.**

| Source | Said | Now |
|---|---|---|
| `brand/positioning.md` | "Basic ads optimisation" | "Ads review and recommendations", plus an explicit Scope section |
| `prompts/ecomforges-copywriter.md` | "Basic ads optimisation" | Ads review and recommendations; never imply execution |
| `landing-pages/{en,bm}/core.md` | "Basic ads optimisation" | Advisory wording, and who executes stated on the page |
| `email/{en,bm}/evergreen-rm499.md` | "Basic ads optimisation" | Same |
| `content/homepage-faq.md` | "We are advisers, not an agency" | unchanged — it was right |
| `content/outreach-templates.md` | "We do not run your ads" | unchanged — it was right |

EcomForges does not run ads, log into accounts or edit listings. Ads work is
review and recommendation.

**Why it had to go this way.** Three things pointed the same direction: the
approved decision record, and both client-facing files independently. Against
that, one line in a newly-supplied playbook. The advisory framing is also
load-bearing rather than incidental — the FAQ argues that not touching the
account is what keeps a client independent, which is the same argument the
philosophy makes. Reading "basic ads optimisation" as advising on ads keeps the
playbook coherent; reading it as execution contradicts the philosophy it sits
next to.

**Still outstanding, on the live site and not fixable from this repository:**
the homepage carries a **"We Execute"** heading that contradicts the advisory
position. `content/homepage-faq.md` already flags it and suggests "You Execute"
or "We Direct". It needs applying in Breakdance.

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
