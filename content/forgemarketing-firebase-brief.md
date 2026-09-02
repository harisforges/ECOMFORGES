# ForgeMarketing — Firebase brief for Daniel

Copy the block under **The email** into a mail to Daniel. Everything after it is
the technical detail he will ask for; send it as the rest of the same mail, or
point him at this file in the repository.

Written to be handed over as-is. Nothing in it has been run against a live
Firebase project — the code is written against ForgeMarketing's actual
internals, but Daniel should expect to debug the wiring, not paste and ship.

---

## The email

> Hi Daniel,
>
> We've built a fourth internal tool — **ForgeMarketing**. It's the marketing
> knowledge base as a working page: you pick a platform, an audience, a language
> and an angle, press Generate, and it writes copy you can paste straight into
> the channel.
>
> https://harisforges.github.io/ECOMFORGES/forgemarketing.html
>
> Right now it runs entirely in the browser, same as the calculator and the
> analyst. Nothing is stored. That gives us three problems:
>
> 1. **Nothing is kept.** Copy we generate and like is gone on refresh, and
>    there's no record of what we've already sent to whom.
> 2. **It repeats across devices.** The page avoids repeating itself within one
>    session, but open it on a second phone and it starts from scratch — so two
>    of us can send near-identical copy to different leads in the same week.
> 3. **It doesn't know the current situation.** Every generation is the same
>    regardless of what season we're in or what we're pushing this month.
>
> Could you wire it to Firebase to fix those three? We'd like to reuse the
> existing **leadforge-ffeef** project rather than start a new one, so it sits
> alongside LeadForge and uses the same login.
>
> What we want out of it:
>
> - Every generation stored, so we can look back at what was written and when
> - The generator biased away from fragments already used recently, across all
>   devices — so the copy genuinely differs per use, not just per session
> - A "current condition" record we can set (season, what we're pushing, which
>   angle to favour) that shapes what it generates
> - A way to mark a generation as actually used or discarded, so over time we
>   learn which angles get sent and which never do
>
> Full spec, data model, the code and the security rules are in the repo at
> `content/forgemarketing-firebase-brief.md`. The tool itself is
> `forgemarketing.html` at the root — one self-contained file, no build step.
>
> Two things to flag before you start:
>
> - The repository is **public**, so the security rules do the real work. Please
>   require auth on every path rather than relying on the config being obscure.
> - Adding the Firebase SDK means the page stops being request-free. LeadForge
>   already made that trade, so we're fine with it — just noting it's a change.
>
> No rush on this, but let us know roughly when you could pick it up.
>
> Thanks,
> Haris

---

## Spec

### Goal

Three behaviours, in priority order.

| # | Behaviour | Why |
|---|---|---|
| 1 | Persist every generation | A record of what was written, when, by whom |
| 2 | Bias picks away from recently-used fragments, globally | Copy that differs per use across devices, not just per session |
| 3 | Let a stored "condition" shape generation | Copy that suits the month rather than being timeless |

Behaviour 2 is the one the tool cannot do on its own. Everything else is
storage.

### How the page currently picks copy

`forgemarketing.html` holds a `BANK` object keyed by language, then by slot
(`hook`, `problem`, `agitate`, `solution`, `wiifm`, `philosophy`, `cta`,
`audienceOpen`, `audienceClose`). `hook`, `problem` and `agitate` are keyed by
angle underneath that.

Selection goes through one function:

```js
function pick(key, arr) { ... }   // shuffle bag, in-memory, per session
```

`key` is a string like `hook.stuck.en`. The bag reshuffles when exhausted and
avoids repeating the last item. It is memory-only, so it resets on reload — that
is the whole of problem 2.

**Everything below hangs off replacing that one function.** The templates,
the tabs and the rendering do not need to change.

### Data model — Realtime Database

RTDB rather than Firestore, to match LeadForge. Region `asia-southeast1`, same
as the existing database.

```
forgemarketing/
  generations/
    {pushId}/
      platform      "meta" | "tiktok" | "whatsapp" | "email" | "landing" | "retargeting"
      audience      "cold" | "problem" | "comparing" | "quiet" | "past"
      language      "en" | "bm"
      angle         "stuck" | "money" | "guru" | "education" | "overload"
      fragments/    { hook: <fragId>, problem: <fragId>, ... }
      text          the full generated block
      chars         number
      words         number
      createdAt     server timestamp
      createdBy     auth uid
      status        "generated" | "used" | "discarded"    (see feedback)

  usage/
    {language}/
      {slot}/                          e.g. "hook.stuck"
        {fragId}/
          count       number, incremented per use
          lastUsedAt  server timestamp

  conditions/
    current/
      season        free text, e.g. "Raya build-up"
      pushing       free text, e.g. "conversion before traffic"
      favourAngle   one of the angle ids, or "" for no bias
      note          free text shown in the page header
      updatedAt     server timestamp
      updatedBy     auth uid
```

`fragId` is a stable hash of the fragment text — see `fmHash` below. It must be
derived from the text rather than an index, so that editing the bank does not
silently re-point usage history at different copy.

### Code

Four changes to `forgemarketing.html`. Line references are approximate; search
for the anchors quoted.

---

**1 · Load the SDK.** Immediately before the existing `<script>` that opens with
the `ForgeMarketing — the marketing masterbase` comment:

```html
<!-- ─── Firebase SDKs ─── -->
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
```

Same version LeadForge pins, so both tools cache the same files.

---

**2 · Init, auth and the stable hash.** Add near the top of the main script,
after the `BANK` declaration:

```js
/* ── Firebase ────────────────────────────────────────────────────────────
   Config is deliberately not duplicated here: copy the firebaseConfig object
   from lead.html so there is one place to change it. Same project, same auth.
   ──────────────────────────────────────────────────────────────────────── */
const firebaseConfig = { /* paste from lead.html */ };

let fmDB = null, fmUser = null, fmReady = false;
let usageMap = {};        // { "en": { "hook.stuck": { fragId: {count,lastUsedAt} } } }
let condition = null;     // conditions/current

/* Stable 32-bit hash (FNV-1a) of the fragment text. Used as the fragment id so
   usage history survives reordering the bank, and breaks — correctly — when the
   text itself is edited. */
function fmHash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
}

async function fmInit() {
    try {
        firebase.initializeApp(firebaseConfig);
    } catch (e) {
        // Already initialised — fine, LeadForge does the same guard.
    }
    firebase.auth().onAuthStateChanged(async user => {
        fmUser = user;
        if (!user) { fmReady = false; fmSetBadge('Local'); return; }
        fmDB = firebase.database();

        // Usage and conditions are kept live, so a generation on one device
        // immediately biases the next generation on another.
        fmDB.ref('forgemarketing/usage').on('value', s => { usageMap = s.val() || {}; });
        fmDB.ref('forgemarketing/conditions/current').on('value', s => {
            condition = s.val() || null;
            fmRenderCondition();
        });

        fmReady = true;
        fmSetBadge('Live');
    });
}
```

Auth: reuse LeadForge's login. If you would rather not build a second login
screen, calling `firebase.auth().signInWithEmailAndPassword` from the same
credentials LeadForge uses is enough — the point is that the rules can require
`auth != null`.

---

**3 · Replace `pick` with a usage-aware version.** This is the change that
makes copy differ per use. Keep the existing function's signature so nothing
else needs touching:

```js
/* ── Variation, now global ───────────────────────────────────────────────
   Offline behaviour is unchanged: without Firebase this falls through to the
   original in-memory shuffle bag, so the page still works signed out.

   With Firebase, fragments are scored by how often and how recently they have
   been used across every device, and the least-worn one wins. A little jitter
   stops it becoming a strict rotation, which would be its own kind of
   predictable.
   ──────────────────────────────────────────────────────────────────────── */
const bags = {};

function pick(key, arr) {
    if (!arr || !arr.length) return '';

    // key looks like "hook.stuck.en" — split the language off the end.
    const parts = key.split('.');
    const lang = parts.pop();
    const slot = parts.join('.');

    if (!fmReady || !usageMap[lang] || !usageMap[lang][slot]) {
        return pickLocal(key, arr);          // original behaviour
    }

    const stats = usageMap[lang][slot] || {};
    const now = Date.now();

    let best = null, bestScore = Infinity;
    arr.forEach(text => {
        const id = fmHash(text);
        const s = stats[id] || { count: 0, lastUsedAt: 0 };
        const ageDays = s.lastUsedAt ? (now - s.lastUsedAt) / 86400000 : 999;

        // Lower is fresher. Recency decays over about a fortnight, so a
        // fragment used once a month ago is treated as effectively unused.
        const score = s.count * 2 + Math.max(0, 14 - ageDays) + Math.random() * 1.5;
        if (score < bestScore) { bestScore = score; best = text; }
    });

    return best || pickLocal(key, arr);
}

function pickLocal(key, arr) {
    if (!bags[key] || !bags[key].length) {
        const shuffled = arr.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        if (bags[key + ':last'] && shuffled.length > 1 &&
            shuffled[shuffled.length - 1] === bags[key + ':last']) {
            [shuffled[0], shuffled[shuffled.length - 1]] =
                [shuffled[shuffled.length - 1], shuffled[0]];
        }
        bags[key] = shuffled;
    }
    const out = bags[key].pop();
    bags[key + ':last'] = out;
    return out;
}
```

---

**4 · Record the generation.** At the end of the existing `generate()` function,
after `generateCount++`:

```js
    fmRecord({
        platform: platform, audience: audience, language: language, angle: angle,
        text: plain, chars: plain.length,
        words: plain.trim().split(/\s+/).filter(Boolean).length
    });
```

And the writer:

```js
/* Fire-and-forget: a failed write must never block the copy appearing. */
async function fmRecord(gen) {
    if (!fmReady || !fmDB) return;
    try {
        const ref = fmDB.ref('forgemarketing/generations').push();
        await ref.set(Object.assign({}, gen, {
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: fmUser ? fmUser.uid : null,
            status: 'generated'
        }));
        lastGenerationKey = ref.key;

        // Increment usage for each fragment the templates actually drew.
        const updates = {};
        Object.keys(lastPicked).forEach(k => {
            const slot = k.split('.').slice(0, -1).join('.');
            const id = fmHash(lastPicked[k]);
            const base = `forgemarketing/usage/${gen.language}/${slot}/${id}`;
            updates[base + '/lastUsedAt'] = firebase.database.ServerValue.TIMESTAMP;
            updates[base + '/count'] = firebase.database.ServerValue.increment(1);
        });
        if (Object.keys(updates).length) await fmDB.ref().update(updates);
    } catch (e) {
        console.warn('ForgeMarketing: generation not recorded', e);
    }
}
```

`lastPicked` needs populating — add one line inside `pick`, just before it
returns, in both branches:

```js
lastPicked[key] = <the chosen text>;
```

and declare `let lastPicked = {}; let lastGenerationKey = null;` alongside the
other state. Clear `lastPicked = {}` at the top of `generate()`.

---

### Condition bias

`conditions/current` is read into `condition`. Two suggested uses, both small:

```js
// In generate(), before choosing the angle, when the user has left it on the
// default and a condition names a preferred angle:
if (condition && condition.favourAngle && !userTouchedAngle) {
    angle = condition.favourAngle;
}
```

And show it, so nobody is surprised by copy that reflects a setting they cannot
see:

```js
function fmRenderCondition() {
    const el = document.querySelector('.header-note');
    if (!el) return;
    el.textContent = condition && condition.note
        ? `Current: ${condition.note}`
        : 'Runs in the page · nothing is uploaded';
}
```

A small editor for `conditions/current` — four fields and a save button, behind
the same auth — is worth adding as a ninth tab. Only Haris and Daniel need it.

### Feedback

To learn which angles actually get sent, mark the last generation after it is
copied. Hook it to the existing Copy button:

```js
async function fmMark(status) {           // 'used' | 'discarded'
    if (!fmReady || !lastGenerationKey) return;
    await fmDB.ref('forgemarketing/generations/' + lastGenerationKey)
              .update({ status: status, markedAt: firebase.database.ServerValue.TIMESTAMP });
}
```

Copy implies intent to use, so calling `fmMark('used')` from `copyOut()` is a
fair default. A "didn't use it" button next to Copy would be more honest, but
start with the default.

### Security rules

The repository is public, so these rules are the only thing protecting the
data. Auth required everywhere; nothing world-readable.

```json
{
  "rules": {
    "forgemarketing": {
      "generations": {
        ".read": "auth != null",
        "$id": {
          ".write": "auth != null",
          ".validate": "newData.hasChildren(['platform','audience','language','angle','text','createdAt'])",
          "language":  { ".validate": "newData.val().matches(/^(en|bm)$/)" },
          "text":      { ".validate": "newData.isString() && newData.val().length <= 8000" },
          "createdBy": { ".validate": "newData.val() === auth.uid" }
        }
      },
      "usage": {
        ".read": "auth != null",
        ".write": "auth != null",
        "$lang": { ".validate": "$lang.matches(/^(en|bm)$/)" }
      },
      "conditions": {
        ".read": "auth != null",
        "current": {
          ".write": "auth != null",
          ".validate": "newData.hasChildren(['updatedAt'])",
          "note":        { ".validate": "newData.isString() && newData.val().length <= 200" },
          "favourAngle": { ".validate": "newData.val().matches(/^(stuck|money|guru|education|overload|)$/)" }
        }
      }
    }
  }
}
```

Merge these into the existing rules rather than replacing the file — LeadForge's
paths live in the same database.

### Things to get right

- **Never block the UI on Firebase.** Generation must work signed out and
  offline; every write is fire-and-forget. The `pickLocal` fallback exists for
  exactly this.
- **`fmHash` is on the text, not the index.** Editing a fragment resets its
  history, which is correct — it is different copy now.
- **Watch write volume.** Pressing Generate ten times is ten records and up to
  seventy usage increments. Well inside the free tier, but batch the usage
  updates into the single `update()` call as written rather than one write per
  fragment.
- **Do not store lead names or client data here.** This is copy, not CRM.
  Personal data belongs in LeadForge, under its own rules and its PDPA handling.

### What this does not do

It does not make the copy better, and it does not write anything new. The bank
is still the bank: Firebase changes which fragment comes up and remembers what
came up before. Genuinely new angles are a copy job, not a deployment job.

It also adds no proof. The rule stands whatever gets stored — no case studies,
testimonials, statistics or guarantees unless they are real, consented and
dated. See `marketing/RECONCILIATION.md` for the two open questions on pricing
and scope that still need settling before any of this copy goes out.
