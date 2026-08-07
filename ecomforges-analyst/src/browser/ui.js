/**
 * Page script for the single-file analyst.
 *
 * Plain ES5-flavoured JS on purpose — it is inlined verbatim into the built HTML rather than
 * compiled, so it stays readable in View Source and has no build step of its own.
 */
(function () {
  var FIELDS = [
    { k: 'sessions', l: 'Sessions / visitors' },
    { k: 'buyers', l: 'Buyers', h: 'people who bought, not orders' },
    { k: 'orders', l: 'Orders' },
    { k: 'headlineCvr', l: 'Conversion rate on the dashboard (%)', s: '0.01' },
    { k: 'gmv', l: 'Revenue / GMV (RM)', s: '0.01' },
    { k: 'aov', l: 'AOV (RM)', s: '0.01' },
    { k: 'organicSharePct', l: 'Organic share of traffic (%)', s: '0.1' },
    { k: 'sessionTrendPct', l: 'Session change vs last period (%)', h: 'negative if down', s: '0.1' },
    { k: 'promoRevenuePct', l: 'Revenue from campaign days (%)', s: '0.1' },
    { k: 'adSpend', l: 'Ad spend (RM)', s: '0.01' },
    { k: 'roas', l: 'ROAS', s: '0.01' },
    { k: 'grossMarginPct', l: 'Gross margin (%)', s: '0.1' },
    { k: 'cancelledOrders', l: 'Cancelled orders' },
    { k: 'cancelledValue', l: 'Cancelled value (RM)', s: '0.01' },
    { k: 'refundedOrders', l: 'Refunded orders' },
    { k: 'refundedValue', l: 'Refunded value (RM)', s: '0.01' },
    { k: 'addToCartUsers', l: 'Add-to-cart users' },
    { k: 'wishlistUsers', l: 'Wishlist users' }
  ];
  var PLATFORMS = ['Shopee', 'Lazada', 'TikTok', 'Own site'];
  var TRENDS = ['', 'up', 'flat', 'down'];
  var FULFIL = ['', 'clean', 'minor-delays', 'sla-breaches', 'out-of-stock'];
  var STORE = 'ecomforges-analyst-inputs-v1';

  var plats = document.getElementById('plats');
  var statusEl = document.getElementById('status');
  var briefText = '';
  var payloadText = '';
  var candsText = '';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function opts(list, selected) {
    return list
      .map(function (v) {
        return '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(v || '—') + '</option>';
      })
      .join('');
  }

  function addPlatform(preset) {
    var d = document.createElement('div');
    d.className = 'plat';
    d.innerHTML =
      '<div class="ph"><select data-k="platform">' + opts(PLATFORMS, preset || 'Shopee') + '</select>' +
      '<button class="rm" type="button">remove</button></div><div class="grid">' +
      FIELDS.map(function (f) {
        return '<label class="f"><span>' + esc(f.l) + (f.h ? '<em>' + esc(f.h) + '</em>' : '') +
          '</span><input type="number" inputmode="decimal" step="' + (f.s || '1') +
          '" data-k="' + f.k + '" placeholder="—"></label>';
      }).join('') +
      '<label class="f"><span>AOV trend vs last period</span><select data-k="aovTrend">' + opts(TRENDS, '') + '</select></label>' +
      '<label class="f"><span>Fulfilment</span><select data-k="fulfilment">' + opts(FULFIL, '') + '</select></label>' +
      '<label class="f"><span>Conversion-rate basis<em>how the platform defines it</em></span>' +
      '<input type="text" data-k="headlineCvrBasis" placeholder="product-card clicks"></label></div>';
    d.querySelector('.rm').addEventListener('click', function () {
      if (plats.children.length > 1) d.remove();
      else statusEl.textContent = 'At least one platform is needed.';
    });
    plats.appendChild(d);
    return d;
  }

  function collect() {
    var out = [];
    Array.prototype.forEach.call(plats.children, function (d) {
      var p = {};
      Array.prototype.forEach.call(d.querySelectorAll('[data-k]'), function (el) {
        var v = el.value.trim();
        // A blank field is left out of the payload entirely. Absent means "nobody supplied
        // it", which the engine reports as a gap; zero would be a claim.
        if (v === '') return;
        if (el.type === 'number') {
          var n = Number(v);
          if (isFinite(n)) p[el.dataset.k] = n;
        } else p[el.dataset.k] = v;
      });
      if (p.platform) out.push(p);
    });
    return out;
  }

  function readForm() {
    return {
      clientCode: document.getElementById('code').value.trim(),
      category: document.getElementById('cat').value.trim(),
      periodStart: document.getElementById('ps').value,
      periodEnd: document.getElementById('pe').value,
      platforms: collect()
    };
  }

  function say(msg, cls) {
    statusEl.className = 'note' + (cls ? ' ' + cls : '');
    statusEl.textContent = msg;
  }

  function copy(text, label) {
    function done() { say(label + ' copied.', 'ok'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      // Older iOS Safari and any non-secure context: select a temporary textarea instead.
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      try { document.execCommand('copy'); done(); }
      catch (e) { say('Could not copy automatically — select the text and copy it manually.', 'err'); }
      ta.remove();
    }
  }

  document.getElementById('add').addEventListener('click', function () { addPlatform(); });

  document.getElementById('go').addEventListener('click', function () {
    var form = readForm();
    var missing = [];
    if (!form.clientCode || form.clientCode === 'MY-') missing.push('client code');
    if (!form.category) missing.push('category');
    if (!form.periodStart || !form.periodEnd) missing.push('both dates');
    if (form.platforms.length === 0) missing.push('at least one platform');
    if (missing.length) { say('Still needed: ' + missing.join(', ') + '.', 'err'); return; }

    var res;
    try {
      res = window.Forge.run({
        engagement: form,
        benchmarksMarkdown: document.getElementById('bm').value
      });
    } catch (e) {
      say(e && e.message ? e.message : String(e), 'err');
      return;
    }

    briefText = res.brief;
    payloadText = res.payload;
    candsText = res.candidates.join('\n');

    document.getElementById('brief').textContent = briefText;
    document.getElementById('cands').textContent = candsText || 'None.';
    document.getElementById('out').hidden = false;
    document.getElementById('copy').hidden = false;
    document.getElementById('dl').hidden = false;

    var bits = [];
    if (res.blocked === 'true') bits.push('A blocker fired — no track activates this cycle.');
    else if (res.track && res.platform) bits.push('Track: ' + res.track + ' on ' + res.platform + '.');
    else if (!res.track) bits.push('No track activates — see section 5.');
    if (res.benchmarkRowsRead) bits.push(res.benchmarkRowsRead + ' usable benchmark row(s) read.');
    if (res.gaps.length) bits.push(res.gaps.length + ' gap(s) to send the client.');
    say(bits.join(' '), 'ok');
    document.getElementById('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('copy').addEventListener('click', function () { copy(briefText, 'Brief'); });
  document.getElementById('copypayload').addEventListener('click', function () {
    copy(
      'Write sections 6 (THE FINDING) and 8 (THE 30-DAY SPRINT) from the computed figures ' +
      'below. Do not introduce any number that is not in this data.\n\n' + payloadText,
      'Payload'
    );
  });
  document.getElementById('copycands').addEventListener('click', function () { copy(candsText, 'Candidates'); });

  document.getElementById('dl').addEventListener('click', function () {
    var name = 'brief-' + (document.getElementById('code').value.trim() || 'engagement') + '.md';
    var blob = new Blob([briefText], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1500);
  });

  document.getElementById('save').addEventListener('click', function () {
    try {
      localStorage.setItem(STORE, JSON.stringify({ form: readForm(), bm: document.getElementById('bm').value }));
      say('Inputs saved on this device. They reload next time you open the page.', 'ok');
    } catch (e) {
      say('Could not save — private browsing blocks local storage.', 'err');
    }
  });

  function restore() {
    var raw;
    try { raw = localStorage.getItem(STORE); } catch (e) { return false; }
    if (!raw) return false;
    var saved;
    try { saved = JSON.parse(raw); } catch (e) { return false; }
    var f = saved.form || {};
    if (f.clientCode) document.getElementById('code').value = f.clientCode;
    if (f.category) document.getElementById('cat').value = f.category;
    if (f.periodStart) document.getElementById('ps').value = f.periodStart;
    if (f.periodEnd) document.getElementById('pe').value = f.periodEnd;
    if (saved.bm) document.getElementById('bm').value = saved.bm;
    var list = f.platforms && f.platforms.length ? f.platforms : null;
    if (!list) return false;
    list.forEach(function (p) {
      var d = addPlatform(p.platform);
      Object.keys(p).forEach(function (k) {
        var el = d.querySelector('[data-k="' + k + '"]');
        if (el) el.value = p[k];
      });
    });
    return true;
  }

  if (!restore()) addPlatform('Shopee');
})();
