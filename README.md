# ECOMFORGES

Internal client decision tools.

## Client Qualification & Forge Track Selector

`index.html` — a single self-contained page, no build step and no external
requests. Open it directly, or use the published GitHub Pages URL.

Three stages:

| Stage | When it runs | What it decides |
|---|---|---|
| Qualify | Before you accept a seller | 100-point score → Tier A / B / C |
| Forge Track | Before each session | Which single Forge Track activates this cycle |
| Status Review | Every three cycles | Continue / Coach / Downgrade / Pause / Exit |

State lives only in the page. Nothing is written to the browser or sent
anywhere, so use **Save** to export an engagement file before closing the tab.

### Note on visibility

This repository is public so that GitHub Pages can serve the tool. The page
contains scoring weights, thresholds, pricing and client-facing scripts —
treat the URL as shareable-by-accident and review before adding anything
further. `robots.txt` asks search engines not to index it; that is a request,
not access control.

## Growth Analyst

`analyst.html` — type a client's platform figures in, get the full growth brief. Runs
entirely in the page: no install, no sign-in, no API key, and nothing is uploaded anywhere.
Add it to your home screen like the calculator.

The two prose sections (the finding and the 30-day sprint) are the only part that needs a
model. Press **Copy for Claude** and paste into the EcomForges Growth Analyst Project — the
figures are computed in the page, so the Project only writes about them.
