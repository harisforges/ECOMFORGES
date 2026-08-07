/**
 * The form page. Self-contained — no CDN, no fonts, no external anything, so the CSP in
 * the server can stay closed.
 *
 * Every numeric input is deliberately allowed to stay blank. A blank field becomes a gap in
 * the brief; a zero would become a claim.
 */

const FIELDS: readonly { key: string; label: string; hint?: string; step?: string }[] = [
  { key: 'sessions', label: 'Sessions / visitors' },
  { key: 'buyers', label: 'Buyers', hint: 'people who bought, not orders' },
  { key: 'orders', label: 'Orders' },
  { key: 'headlineCvr', label: 'Conversion rate shown on the dashboard (%)', step: '0.01' },
  { key: 'gmv', label: 'Revenue / GMV (RM)', step: '0.01' },
  { key: 'aov', label: 'AOV (RM)', step: '0.01' },
  { key: 'organicSharePct', label: 'Organic share of traffic (%)', step: '0.1' },
  { key: 'sessionTrendPct', label: 'Session change vs last period (%)', hint: 'negative if down', step: '0.1' },
  { key: 'promoRevenuePct', label: 'Revenue from campaign days (%)', step: '0.1' },
  { key: 'adSpend', label: 'Ad spend (RM)', step: '0.01' },
  { key: 'roas', label: 'ROAS', step: '0.01' },
  { key: 'grossMarginPct', label: 'Gross margin (%)', step: '0.1' },
  { key: 'cancelledOrders', label: 'Cancelled orders' },
  { key: 'cancelledValue', label: 'Cancelled value (RM)', step: '0.01' },
  { key: 'refundedOrders', label: 'Refunded orders' },
  { key: 'refundedValue', label: 'Refunded value (RM)', step: '0.01' },
  { key: 'addToCartUsers', label: 'Add-to-cart users' },
  { key: 'wishlistUsers', label: 'Wishlist users' },
];

const fieldHtml = (key: string, label: string, hint?: string, step?: string): string => `
        <label class="f">
          <span>${label}${hint ? `<em>${hint}</em>` : ''}</span>
          <input type="number" step="${step ?? '1'}" data-k="${key}" placeholder="—">
        </label>`;

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>EcomForges Growth Analyst</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #fff; --ink: #16202c; --muted: #5b6b7c;
    --line: #dfe4ea; --navy: #162840; --cyan: #0b7fa8; --amber: #b26a00; --red: #b3261e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #10151c; --card: #161d26; --ink: #e6ecf2; --muted: #9aa9b8;
      --line: #26303c; --navy: #dbe6f2; --cyan: #4fc3e8; --amber: #e0a44a; --red: #ef7a70;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: var(--muted); margin: 0 0 24px; font-size: 13.5px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 18px; margin-bottom: 16px; }
  .card > h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 0 0 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px 16px; }
  .f { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .f span { color: var(--muted); }
  .f em { display: block; font-style: normal; font-size: 11.5px; opacity: .75; }
  input, select, textarea {
    font: inherit; font-size: 16px; padding: 8px 10px; border-radius: 7px;
    border: 1px solid var(--line); background: var(--bg); color: var(--ink); width: 100%;
  }
  input:focus, select:focus { outline: 2px solid var(--cyan); outline-offset: 1px; }
  .plat { border-top: 1px dashed var(--line); padding-top: 16px; margin-top: 16px; }
  .plat:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
  .plat h3 { font-size: 14px; margin: 0 0 12px; display: flex; align-items: center; gap: 10px; }
  .rm { margin-left: auto; font-size: 12px; color: var(--red); background: none; border: 0; cursor: pointer; padding: 4px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  button.b {
    font: inherit; font-weight: 600; border: 0; border-radius: 8px; cursor: pointer;
    padding: 11px 18px; min-height: 44px; background: var(--navy); color: var(--bg);
  }
  button.g { background: transparent; color: var(--ink); border: 1px solid var(--line); }
  button:disabled { opacity: .5; cursor: progress; }
  .note { font-size: 12.5px; color: var(--muted); margin-top: 10px; }
  .warn { color: var(--amber); }
  pre {
    white-space: pre-wrap; word-break: break-word; background: var(--bg);
    border: 1px solid var(--line); border-radius: 8px; padding: 14px; font-size: 12.5px;
    max-height: 70vh; overflow: auto;
  }
  .err { color: var(--red); font-size: 13px; }
  @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>EcomForges Growth Analyst</h1>
  <p class="sub">Leave anything you do not have blank. A blank field becomes a stated gap in the brief; a zero would become a claim.</p>

  <div class="card">
    <h2>Engagement</h2>
    <div class="grid">
      <label class="f"><span>Client code<em>never a brand name — MY-BTY-09</em></span><input id="code" value="MY-" placeholder="MY-BTY-09"></label>
      <label class="f"><span>Category</span><input id="cat" placeholder="Beauty — skincare"></label>
      <label class="f"><span>Period start</span><input id="ps" type="date"></label>
      <label class="f"><span>Period end</span><input id="pe" type="date"></label>
    </div>
  </div>

  <div class="card">
    <h2>Platforms</h2>
    <div id="plats"></div>
    <div class="row" style="margin-top:16px">
      <button class="b g" id="add" type="button">Add a platform</button>
      <span class="note">Two or more platforms on one catalogue lets the strongest channel act as the benchmark.</span>
    </div>
  </div>

  <div class="card">
    <h2>Generate</h2>
    <div class="row">
      <button class="b" id="go" type="button">Generate brief</button>
      <label class="row" style="gap:6px;font-size:13px">
        <input type="checkbox" id="prose" style="width:auto;min-height:0" checked>
        Write the finding and sprint
      </label>
      <button class="b g" id="copy" type="button" hidden>Copy brief</button>
      <button class="b g" id="dl" type="button" hidden>Download</button>
    </div>
    <p class="note" id="status"></p>
  </div>

  <div class="card" id="out" hidden><h2>Brief</h2><pre id="brief"></pre></div>
</div>

<script>
(function () {
  var FIELDS = ${JSON.stringify(FIELDS)};
  var PLATFORMS = ['Shopee', 'Lazada', 'TikTok', 'Own site'];
  var TRENDS = ['', 'up', 'flat', 'down'];
  var FULFIL = ['', 'clean', 'minor-delays', 'sla-breaches', 'out-of-stock'];
  var plats = document.getElementById('plats');
  var n = 0;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function addPlatform(preset) {
    var id = 'p' + (n++);
    var d = document.createElement('div');
    d.className = 'plat';
    d.dataset.id = id;
    var opts = PLATFORMS.map(function (p) {
      return '<option' + (p === preset ? ' selected' : '') + '>' + p + '</option>';
    }).join('');
    var inputs = FIELDS.map(function (f) {
      return '<label class="f"><span>' + esc(f.label) +
        (f.hint ? '<em>' + esc(f.hint) + '</em>' : '') + '</span>' +
        '<input type="number" step="' + (f.step || '1') + '" data-k="' + f.key + '" placeholder="—"></label>';
    }).join('');
    d.innerHTML =
      '<h3><select data-k="platform" style="width:auto">' + opts + '</select>' +
      '<button class="rm" type="button">remove</button></h3>' +
      '<div class="grid">' + inputs +
      '<label class="f"><span>AOV trend vs last period</span><select data-k="aovTrend">' +
        TRENDS.map(function (t) { return '<option value="' + t + '">' + (t || '—') + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="f"><span>Fulfilment</span><select data-k="fulfilment">' +
        FULFIL.map(function (t) { return '<option value="' + t + '">' + (t || '—') + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="f"><span>Conversion-rate basis<em>how the platform defines it</em></span>' +
        '<input data-k="headlineCvrBasis" type="text" placeholder="product-card clicks"></label>' +
      '</div>';
    d.querySelector('.rm').addEventListener('click', function () {
      if (plats.children.length > 1) d.remove();
    });
    plats.appendChild(d);
  }

  addPlatform('Shopee');
  document.getElementById('add').addEventListener('click', function () { addPlatform(); });

  function collect() {
    var out = [];
    Array.prototype.forEach.call(plats.children, function (d) {
      var p = {};
      Array.prototype.forEach.call(d.querySelectorAll('[data-k]'), function (el) {
        var k = el.dataset.k;
        var v = el.value.trim();
        // Blank stays out of the payload entirely: absent means "nobody supplied it",
        // which the engine reports as a gap rather than treating as zero.
        if (v === '') return;
        if (el.type === 'number') {
          var num = Number(v);
          if (isFinite(num)) p[k] = num;
        } else p[k] = v;
      });
      if (p.platform) out.push(p);
    });
    return out;
  }

  var briefText = '';
  var statusEl = document.getElementById('status');

  document.getElementById('go').addEventListener('click', function () {
    var btn = this;
    var code = document.getElementById('code').value.trim();
    var cat = document.getElementById('cat').value.trim();
    var ps = document.getElementById('ps').value;
    var pe = document.getElementById('pe').value;
    var platforms = collect();

    if (!code || !cat || !ps || !pe || platforms.length === 0) {
      statusEl.className = 'note err';
      statusEl.textContent = 'Client code, category, both dates, and at least one platform are required.';
      return;
    }

    btn.disabled = true;
    statusEl.className = 'note';
    statusEl.textContent = 'Computing…';

    fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        withProse: document.getElementById('prose').checked,
        engagement: { clientCode: code, category: cat, periodStart: ps, periodEnd: pe, platforms: platforms }
      })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) {
          statusEl.className = 'note err';
          statusEl.textContent = res.j.error || 'Something went wrong.';
          return;
        }
        briefText = res.j.brief;
        document.getElementById('brief').textContent = briefText;
        document.getElementById('out').hidden = false;
        document.getElementById('copy').hidden = false;
        document.getElementById('dl').hidden = false;
        var bits = [];
        if (res.j.blocked === true) bits.push('A blocker fired — no track activates this cycle.');
        else if (res.j.platform) bits.push('Track runs on ' + res.j.platform + '.');
        if (res.j.gaps && res.j.gaps.length) bits.push(res.j.gaps.length + ' gap(s) to send the client.');
        if (res.j.queued) bits.push(res.j.queued + ' benchmark candidate(s) queued for review.');
        statusEl.className = res.j.proseError ? 'note warn' : 'note';
        if (res.j.proseError) {
          bits.push('The finding and sprint were not written: ' + res.j.proseError +
            ' Everything the engine computed is above.');
        }
        statusEl.textContent = bits.join(' ');
      })
      .catch(function (e) {
        btn.disabled = false;
        statusEl.className = 'note err';
        statusEl.textContent = String(e);
      });
  });

  document.getElementById('copy').addEventListener('click', function () {
    navigator.clipboard.writeText(briefText).then(function () {
      statusEl.className = 'note';
      statusEl.textContent = 'Copied.';
    });
  });

  document.getElementById('dl').addEventListener('click', function () {
    var code = document.getElementById('code').value.trim() || 'brief';
    var blob = new Blob([briefText], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'brief-' + code + '.md';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1500);
  });
})();
</script>
</body>
</html>`;

export { FIELDS, fieldHtml };
