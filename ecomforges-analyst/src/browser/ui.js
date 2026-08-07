/**
 * Page script for the analyst.
 *
 * Plain ES5-flavoured JS on purpose — it is inlined verbatim rather than compiled, so it
 * stays readable in View Source and has no build step of its own.
 *
 * Every element it creates uses the calculator's class names. There are no styles here; the
 * theme comes from the calculator's own stylesheet, extracted at build time.
 */
(function () {
  var FIELDS = [
    { k: 'sessions', l: 'Sessions / visitors' },
    { k: 'buyers', l: 'Buyers — people, not orders' },
    { k: 'orders', l: 'Orders' },
    { k: 'headlineCvr', l: 'Conversion rate on the dashboard (%)', s: '0.01' },
    { k: 'gmv', l: 'Revenue / GMV (RM)', s: '0.01' },
    { k: 'aov', l: 'AOV (RM)', s: '0.01' },
    { k: 'organicSharePct', l: 'Organic share of traffic (%)', s: '0.1' },
    { k: 'sessionTrendPct', l: 'Session change vs last period (%)', s: '0.1' },
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

  var $ = function (id) { return document.getElementById(id); };
  var plats = $('plats');
  var tabs = $('plat-tabs');
  var statusEl = $('status');
  var active = 0;
  var briefText = '';
  var payloadText = '';
  var candsText = '';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function opts(list, selected) {
    return list.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') +
        '>' + esc(v || '—') + '</option>';
    }).join('');
  }


  // ── markdown → HTML ──────────────────────────────────────────────────────────
  /*
   * Covers exactly what renderBrief emits: headings, bold, code spans, pipe tables,
   * bullet and numbered lists, and horizontal rules. Not a general markdown parser — a
   * narrow one is auditable, and the brief is the only input it will ever see.
   *
   * Everything is escaped before any markup is added, so a client name or a category with
   * an angle bracket in it cannot inject HTML into the page.
   */
  function inline(t) {
    return esc(t)
      .replace(/`\[ASK\]`/g, '<code class="tag tag-ask">[ASK]</code>')
      .replace(/`\[(DATA|CALC|BM|EST)([^\]]*)\]`/g, '<code class="tag">[$1$2]</code>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])_([^_]+)_(?=[\s.,)]|$)/g, '$1<em>$2</em>');
  }

  function isTableRow(l) { return /^\s*\|/.test(l); }
  function isSeparator(l) { return /^\s*\|[\s:|-]+\|?\s*$/.test(l); }
  function cells(l) {
    var t = l.trim();
    return t.slice(1, t.charAt(t.length - 1) === '|' ? -1 : undefined).split('|').map(function (c) {
      return c.trim();
    });
  }

  function renderMarkdown(md) {
    var lines = md.split(/\r?\n/);
    var out = [];
    var i = 0;
    var listType = null;

    function closeList() { if (listType) { out.push('</' + listType + '>'); listType = null; } }

    while (i < lines.length) {
      var l = lines[i];

      if (l.trim() === '') { closeList(); i++; continue; }

      if (/^---+\s*$/.test(l.trim())) { closeList(); out.push('<hr>'); i++; continue; }

      var h = /^(#{1,4})\s+(.*)$/.exec(l);
      if (h) {
        closeList();
        var lvl = Math.min(h[1].length, 3);
        out.push('<h' + lvl + '>' + inline(h[2]) + '</h' + lvl + '>');
        i++;
        continue;
      }

      // A table: a header row, a separator, then body rows.
      if (isTableRow(l) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
        closeList();
        var head = cells(l);
        i += 2;
        var body = [];
        while (i < lines.length && isTableRow(lines[i])) { body.push(cells(lines[i])); i++; }
        // A header row of empty cells renders as a bare dark bar, so drop it. renderBrief
        // emits one for the two-column key/value tables in section 7.
        var hasHead = head.some(function (c) { return c !== ''; });
        // Five or more columns will not fit a phone whatever we do; let those scroll.
        var wide = head.length >= 5 ? ' wide' : '';
        out.push('<div class="tw' + wide + '"><table>' +
          (hasHead
            ? '<thead><tr>' + head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead>'
            : '') +
          '<tbody>' +
          body.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
          }).join('') +
          '</tbody></table></div>');
        continue;
      }

      var ul = /^\s*[-*]\s+(.*)$/.exec(l);
      var ol = /^\s*\d+\.\s+(.*)$/.exec(l);
      if (ul || ol) {
        var want = ul ? 'ul' : 'ol';
        if (listType !== want) { closeList(); out.push('<' + want + '>'); listType = want; }
        out.push('<li>' + inline((ul || ol)[1]) + '</li>');
        i++;
        continue;
      }

      // A paragraph runs until a blank line or the start of any other block.
      var para = [l];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|---+$|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]) && !isTableRow(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      closeList();
      out.push('<p>' + inline(para.join(' ')) + '</p>');
    }
    closeList();
    return out.join('\n');
  }

  // ── platform cards ───────────────────────────────────────────────────────────
  function addPlatform(preset) {
    var i = plats.children.length;
    var d = document.createElement('div');
    d.className = 'card';
    d.innerHTML =
      '<div class="card-head">' +
        '<div class="cat-num num">' + (i + 1) + '</div>' +
        '<div class="cat-title"><h3><span class="pname">' + esc(preset || 'Shopee') + '</span></h3>' +
        '<p>Leave anything you do not have blank. A blank field becomes a stated gap in the brief; a zero would become a claim.</p></div>' +
        '<div class="weight-pill">Platform</div>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="details" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">' +
          '<div class="field"><label>Platform</label><select data-k="platform">' + opts(PLATFORMS, preset || 'Shopee') + '</select></div>' +
          FIELDS.map(function (f) {
            return '<div class="field"><label>' + esc(f.l) + '</label>' +
              '<input type="number" inputmode="decimal" step="' + (f.s || '1') +
              '" data-k="' + f.k + '" placeholder="—" /></div>';
          }).join('') +
          '<div class="field"><label>AOV trend vs last period</label><select data-k="aovTrend">' + opts(TRENDS, '') + '</select></div>' +
          '<div class="field"><label>Fulfilment</label><select data-k="fulfilment">' + opts(FULFIL, '') + '</select></div>' +
          '<div class="field"><label>Conversion-rate basis — how the platform defines it</label>' +
            '<input type="text" data-k="headlineCvrBasis" placeholder="product-card clicks" /></div>' +
        '</div>' +
      '</div>';
    d.querySelector('[data-k="platform"]').addEventListener('change', function () {
      d.querySelector('.pname').textContent = this.value;
      renderTabs();
    });
    plats.appendChild(d);
    active = i;
    renderTabs();
    return d;
  }

  /** One tab per platform, so a phone shows a single card at a time instead of a long scroll. */
  function renderTabs() {
    tabs.innerHTML = '';
    Array.prototype.forEach.call(plats.children, function (d, i) {
      var sel = d.querySelector('[data-k="platform"]');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab' + (i === active ? ' active' : '');
      b.textContent = sel ? sel.value : 'Platform ' + (i + 1);
      b.addEventListener('click', function () { active = i; renderTabs(); });
      tabs.appendChild(b);
      d.hidden = i !== active;
    });
    tabs.hidden = plats.children.length < 2;
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
      clientCode: $('code').value.trim(),
      category: $('cat').value.trim(),
      periodStart: $('ps').value,
      periodEnd: $('pe').value,
      platforms: collect()
    };
  }

  function say(msg, tone) {
    statusEl.textContent = msg;
    statusEl.style.color = tone === 'err' ? 'var(--red)' : tone === 'ok' ? 'var(--green)' : 'var(--blue-grey)';
  }

  function setView(v) {
    $('view-input').hidden = v !== 'input';
    $('view-brief').hidden = v !== 'brief';
    $('sb-input').className = 'stage-btn' + (v === 'input' ? ' active' : '');
    $('sb-brief').className = 'stage-btn' + (v === 'brief' ? ' active' : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('sb-input').addEventListener('click', function () { setView('input'); });
  $('sb-brief').addEventListener('click', function () {
    if (!briefText) { say('Generate a brief first.', 'err'); return; }
    setView('brief');
  });

  function copy(text, label) {
    function done() { say(label + ' copied.', 'ok'); }
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
      catch (e) { say('Could not copy automatically — select the text and copy it by hand.', 'err'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }

  function download() {
    var name = 'brief-' + ($('code').value.trim() || 'engagement') + '.md';
    var blob = new Blob([briefText], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1500);
  }

  // ── generate ─────────────────────────────────────────────────────────────────
  $('go').addEventListener('click', function () {
    var form = readForm();
    var missing = [];
    if (!form.clientCode || form.clientCode === 'MY-') missing.push('client code');
    if (!form.category) missing.push('category');
    if (!form.periodStart || !form.periodEnd) missing.push('both dates');
    if (form.platforms.length === 0) missing.push('at least one platform');
    if (missing.length) { setView('input'); say('Still needed: ' + missing.join(', ') + '.', 'err'); return; }

    var res;
    try {
      res = window.Forge.run({ engagement: form, benchmarksMarkdown: $('bm').value });
    } catch (e) {
      setView('input');
      say(e && e.message ? e.message : String(e), 'err');
      return;
    }

    briefText = res.brief;
    payloadText = res.payload;
    candsText = res.candidates.join('\n');

    $('brief').textContent = briefText;
    $('brief-rendered').innerHTML = renderMarkdown(briefText);
    $('cands').textContent = candsText || 'None.';
    $('cand-pill').textContent = res.candidates.length ? res.candidates.length + ' × n=1' : 'none';
    $('dl').hidden = false;

    // The sticky panel carries the conclusion, the way the calculator's verdict does.
    // Shown only once there is a score: 0.00 is a real result (every area Stable), so an
    // empty-state number would be indistinguishable from a genuine one.
    $('gps-block').hidden = res.topScore === null;
    if (res.topScore !== null) $('gps-val').textContent = res.topScore.toFixed(2);
    var chip = $('track-chip');
    if (res.blocked === 'true') {
      $('track-text').textContent = 'Blocked — ' + res.blockerTitle;
      chip.className = 'tier-chip t-c';
      $('v-note').textContent = 'No track activates this cycle. Section 4 says which blocker fired.';
    } else if (res.track) {
      $('track-text').textContent = res.track + (res.platform ? ' · ' + res.platform : '');
      chip.className = 'tier-chip t-a';
      $('v-note').textContent = res.gaps.length
        ? res.gaps.length + ' gap(s) to send the client before the session.'
        : 'No open gaps.';
    } else {
      $('track-text').textContent = 'No track activates';
      chip.className = 'tier-chip t-b';
      $('v-note').textContent = 'Nothing scored high enough to act on. Section 10 names what would unlock it.';
    }

    var bits = [];
    if (res.benchmarkRowsRead) bits.push(res.benchmarkRowsRead + ' usable benchmark row(s) read.');
    else bits.push('No benchmark file — scored against the strongest platform.');
    if (res.gaps.length) bits.push(res.gaps.length + ' gap(s).');
    $('brief-pill').textContent = res.blocked === 'true' ? 'Blocked' : (res.track || 'No track');
    say(bits.join(' '), 'ok');
    setView('brief');
  });

  $('copy').addEventListener('click', function () { copy(briefText, 'Brief'); });
  $('toggleraw').addEventListener('click', function () {
    // Copy and download always hand over the markdown; this only changes what is on screen.
    var showingRaw = !$('brief').hidden;
    $('brief').hidden = showingRaw;
    $('brief-rendered').hidden = !showingRaw;
    this.textContent = showingRaw ? 'Show markdown' : 'Show formatted';
  });
  $('dl').addEventListener('click', download);
  $('dl2').addEventListener('click', download);
  $('copycands').addEventListener('click', function () { copy(candsText, 'Candidates'); });
  $('copypayload').addEventListener('click', function () {
    copy(
      'Write sections 6 (THE FINDING) and 8 (THE 30-DAY SPRINT) from the computed figures ' +
      'below. Do not introduce any number that is not in this data.\n\n' + payloadText,
      'Payload'
    );
  });

  $('add').addEventListener('click', function () { addPlatform(); });
  $('rm').addEventListener('click', function () {
    if (plats.children.length < 2) { say('At least one platform is needed.', 'err'); return; }
    plats.children[active].remove();
    active = Math.max(0, active - 1);
    Array.prototype.forEach.call(plats.children, function (d, i) {
      d.querySelector('.cat-num').textContent = String(i + 1);
    });
    renderTabs();
  });

  $('save').addEventListener('click', function () {
    try {
      localStorage.setItem(STORE, JSON.stringify({ form: readForm(), bm: $('bm').value }));
      say('Saved on this device. The figures reload next time you open the page.', 'ok');
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
    if (f.clientCode) $('code').value = f.clientCode;
    if (f.category) $('cat').value = f.category;
    if (f.periodStart) $('ps').value = f.periodStart;
    if (f.periodEnd) $('pe').value = f.periodEnd;
    if (saved.bm) $('bm').value = saved.bm;
    if (!f.platforms || !f.platforms.length) return false;
    f.platforms.forEach(function (p) {
      var d = addPlatform(p.platform);
      Object.keys(p).forEach(function (k) {
        var el = d.querySelector('[data-k="' + k + '"]');
        if (el) el.value = p[k];
      });
      var sel = d.querySelector('[data-k="platform"]');
      if (sel) d.querySelector('.pname').textContent = sel.value;
    });
    active = 0;
    renderTabs();
    say('Loaded the figures saved on this device.');
    return true;
  }

  if (!restore()) addPlatform('Shopee');
})();
