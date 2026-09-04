# Firebase database rules

**These are the rules the tools need. Without them the buttons do nothing.**

A Realtime Database denies anything its rules do not explicitly allow. Four of
the tools write to paths that were never added — `forgesprint/`,
`forgebilling/` and `forgeagreement/` — so every write on those pages is
rejected. The tools now say so out loud instead of failing silently, but the fix
is here.

Paste this in the Firebase console under **Realtime Database → Rules**, merged
with whatever LeadForge already has rather than replacing it.

## One thing worth understanding first

Every tool checks `@ecomforges.com` in JavaScript before signing in. **That is
not security.** It runs in a browser the user controls, and anyone with any
account on this Firebase project could otherwise read and write everything —
including the client names, addresses and rates in ForgeBilling and
ForgeAgreement, which is the most sensitive data any of these tools hold.

The domain check below is the one that counts, because the server enforces it.

```json
{
  "rules": {
    "forgesprint": {
      ".read":  "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)",
      ".write": "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)",
      "cycles": {
        "$id": {
          ".validate": "newData.hasChildren(['clientCode','metric','baseline','owner'])",
          "clientCode": { ".validate": "newData.isString() && newData.val().length <= 40" },
          "baseline":   { ".validate": "newData.isNumber()" },
          "status":     { ".validate": "newData.val().matches(/^(open|closed)$/)" },
          "verdict":    { ".validate": "newData.val().matches(/^(moved|notmoved)$/)" },
          "reason":     { ".validate": "newData.val() == null || newData.val().matches(/^(notexecuted|reading)$/)" }
        }
      }
    },

    "forgebilling": {
      ".read":  "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)",
      ".write": "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)",
      "clients": {
        "$id": {
          ".validate": "newData.hasChildren(['name'])",
          "name":   { ".validate": "newData.isString() && newData.val().length <= 200" },
          "rate":   { ".validate": "newData.isNumber() && newData.val() >= 0" },
          "status": { ".validate": "newData.val().matches(/^(active|paused|ended)$/)" }
        }
      },
      "invoices": {
        "$id": {
          ".validate": "newData.hasChildren(['number','period','clientName','amount'])",
          "amount": { ".validate": "newData.isNumber() && newData.val() >= 0" },
          "status": { ".validate": "newData.val().matches(/^(draft|sent|paid)$/)" }
        }
      }
    },

    "forgeagreement": {
      ".read":  "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)",
      ".write": "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)",
      "agreements": {
        "$id": {
          ".validate": "newData.hasChildren(['clientName','fee'])",
          "fee":    { ".validate": "newData.isNumber() && newData.val() >= 0" },
          "status": { ".validate": "newData.val().matches(/^(draft|sent|signed|ended)$/)" }
        }
      }
    },

    "forgemarketing": {
      "generations": {
        ".read": "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)",
        ".indexOn": "createdAt",
        "$id": {
          ".write":    "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)",
          ".validate": "newData.hasChildren(['platform','audience','language','angle','text','createdAt'])",
          "language":  { ".validate": "newData.val().matches(/^(en|bm)$/)" },
          "text":      { ".validate": "newData.isString() && newData.val().length <= 8000" }
        }
      },
      "usage": {
        ".read":  "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)",
        ".write": "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)"
      },
      "conditions": {
        ".read":  "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)",
        ".write": "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)"
      },
      "collaborators": {
        ".read":  "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)",
        ".write": "auth != null && auth.token.email.matches(/.*@ecomforges[.]com$/)"
      }
    }
  }
}
```

## Checking it worked

Sign in and press a button that writes — open a cycle in ForgeSprint, add a
client in ForgeBilling. If the rules are wrong the tool now says so: a message
naming the path, and the header badge changes to **No write access**. Silence
used to be the only symptom; it no longer is.

## What the validation does and does not do

The `.validate` lines reject records missing their required fields or carrying a
status outside the allowed set. They are a guard against a bug writing rubbish,
not against a person: anyone who can write can write valid rubbish.

The `.indexOn` under `generations` matters: ForgeMarketing reads that path with
`orderByChild('createdAt')`. Without the index Firebase still returns the data,
but it downloads the whole node and sorts in the browser, and logs a warning
every time. It costs nothing to declare and it will not be noticed until the
list is large.

`ForgeAgreement` reads `forgebilling/clients` to populate its client picker.
That works because both are readable by the same signed-in people; there is no
separate grant to make.
