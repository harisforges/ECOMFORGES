# EcomForges Growth Analyst — setup

Fifteen minutes, no code, nothing to install.

## What this is

You paste a client's numbers in. It gives you back a finished session brief: what is
actually wrong, which Forge Track™ activates, and the 30-day Fix / Run / Optimise
sprint written against that client's real SKUs. You read it, adjust a line or two if
you want, and run the session from it.

It is the calculator's method — same six areas, same weights, same blocker rules — but
with something that can actually read data and write, instead of a fixed list of
if-this-then-that answers.

## Set it up

1. Go to **claude.ai** → left sidebar → **Projects** → **Create project**.
2. Name it **EcomForges Growth Analyst**.
3. Open **`PROJECT-INSTRUCTIONS.md`** in this folder. Copy everything **below the
   horizontal line** (starting at "## 1. What you are") and paste it into the
   project's **Custom instructions** box. Save.
4. Upload **`benchmarks.md`** to the project's knowledge files.
5. Done.

## Use it

Start a new chat inside that project and paste the client's numbers. Any mix works —
typed figures, a CSV export, screenshots of Seller Centre, or all three in one message.

You do not need to format anything. If something is missing it will tell you what is
missing rather than guessing.

**Two behaviours to expect, both deliberate:**

- If you send screenshots, it reads the numbers off and shows them back to you first.
  Confirm them before it analyses. A misread digit changes the recommended track.
- If there is no benchmark on file for that platform and category, it will say it
  cannot score Conversion, instead of inventing a figure. That is the point.

`intake-template.md` in this folder is the list of numbers to request from a client.
Send it as-is if you want; it is written for the client to read.

## Feed the benchmark file

This is the part that matters over time.

Every brief ends with **BENCHMARK CANDIDATES** — real figures observed in that
client's account. When one is worth keeping, add a row to `benchmarks.md` and
re-upload it to the project.

After three clients in a category you have a real benchmark for it. After a year you
have something nobody else in the Malaysian market has, and the analysis stops being
generic. An empty benchmark file is not a defect on day one; a still-empty one in six
months is.

## What it will not do

- Invent a benchmark number.
- Recommend two tracks at once.
- Recommend scaling ads while margin is Critical, or anything at all while operations
  is Critical.
- Call a 9-day period or an 11.11 week a baseline.

Those refusals are what makes the output safe to hand to a paying client. If you want
one overridden, override it yourself in the brief — don't loosen the instructions.

## One limitation, stated plainly

This does not connect to Shopee, Lazada, or TikTok. Nothing here pulls data
automatically. You still export or screenshot, and paste. What it removes is the
analysis time, not the collection time.

If it earns its place over a few engagements, the next step is a real tool — a page
like the calculator, with a small server piece holding the API key so it can accept a
CSV upload directly. That is a build, and it is worth doing only after you know from
use what it actually needs to do.
