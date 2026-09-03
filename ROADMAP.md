# Roadmap

Decisions about where the toolset is going, kept here so they survive between
sessions and between people.

## Decided: one super app, later

**All the existing tools become a single application.** Five separate pages,
five sign-ins, five copies of the brand header and five places a client's name
can be spelled differently is friction that grows with every tool added.

**Not now.** More tools are likely first, and merging a moving target costs more
than merging a settled one. The tools stay separate until the set stops growing.

When it happens, the work is mostly:

| Piece | Why it matters at merge time |
|---|---|
| One client record | Today each tool holds its own slice — LeadForge has leads, the analyst has client codes, the portal has nothing. Nothing joins them. This is the real work, and the longer it waits the more reconciling it needs. |
| One sign-in | LeadForge and ForgeMarketing already share the `leadforge-ffeef` Firebase project and its `@ecomforges.com` gate. The calculator and analyst have none. |
| One shell | Header, tabs, theme and the four accent colours already follow one pattern; they were built to converge. |
| One data layer | Firebase for what syncs, `localStorage` for per-device convenience, with the offline fallback each tool already has. |

Nothing here needs doing yet. It is written down so the next tool is built in a
way that does not make the merge harder: same theme tokens, same header pattern,
same auth, and a client identifier that means the same thing everywhere.

## Built: the sprint tracker

**Status: built and live** — `sprint.html`, ForgeSprint. What follows is the reasoning it was
built on, kept because it explains why the tool refuses things.

### The gap it filled**

Five tools cover finding a client, qualifying them, diagnosing them, and writing
the marketing. Nothing covers **delivery between sessions**, which is the part
the client is actually paying for.

The method is one constraint, three moves in order, one metric, thirty days,
then check whether the number moved. The analyst and the calculator both close a
deck with the same sentence:

> By the next session, [metric] should have moved. If it has not, either the
> sprint was not executed or the reading was wrong — and we will say which.

That promise is made to every client and it cannot currently be kept. Saying
*which* of the two it was requires knowing whether the three moves were done.
Nothing records that. At the next session it is reconstructed from memory.

It is not a small gap:

- `content/homepage-faq.md` promises *"one person who owns execution between
  sessions — not necessarily you, but one name."* Nothing stores that name.
- `index.html` can put a client on **Pause**, reasoning that *"continuing to
  issue directives that are not executed produces no output for the client and
  no data for EcomForges."* That decision needs an execution history to rest on,
  and there isn't one.
- The analyst tracks whether the **number** moved, but not whether the **work**
  happened — so a flat number is unattributable, which is exactly the case the
  promise is about.

### What it would be

A tool that holds one cycle per client: the constraint, the three moves in
order, the owner's name, the metric with its reading at the start, and what each
move's state was at the close. Then the next cycle opens with the number, the
execution record, and therefore an answerable question.

Roughly:

- Open a cycle from an analyst brief — constraint, three moves, metric, baseline
- One named owner per cycle, and a state per move: done, part-done, not started
- Close the cycle: the metric now, against the baseline
- The verdict the promise requires — moved / did not move, and if it did not:
  not executed, or reading wrong
- A history per client, which is what makes Continue / Coach / Pause honest
- Same shell, same auth, same offline fallback as the others

## Built: billing and invoicing

**Status: built and live** — `billing.html`, ForgeBilling.

This was originally dismissed here on the assumption it was already handled
elsewhere. That assumption was wrong — it did not exist.

So there is no record of who is on RM499 this month, who has paid, who is
overdue, or who quietly stopped. Month-to-month with no lock-in makes that
harder rather than easier: churn is silent, and the only signal is an invoice
nobody chased.

Worth noting it now sits next to a tool that can answer *why* a client is
leaving. A client who cancels after three cycles the sprints were never run in
is a different story from one who cancels after three executed cycles that did
not move the number, and only the second is a reason to change the method.

Built to hold that information rather than guess it: bank details, the tier
ladder above the RM499 entry, payment terms and tax status are all empty until
someone fills them in, and the overview keeps saying so until they are.

## Also considered, still not tools of their own

Session notes and a client roster both matter, but they are parts of the sprint
tracker and the super app respectively.
