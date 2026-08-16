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
      /* The page supplies the earlier period; the engine never goes looking for storage.
         Refusing to compare is the engine's call, and it reports why rather than going quiet. */
      var prior = priorPeriodFor(form.clientCode, form.periodStart);
      skippedPeriods = prior.skipped;
      res = window.Forge.run({
        engagement: form,
        benchmarksMarkdown: $('bm').value,
        priorPeriod: prior.snap
      });
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
    $('dl').hidden = false;

    /* Keep this period, and fold its candidates into the ledger. Both happen after a
       successful run only — a brief that threw has nothing worth remembering. */
    rememberPeriod(res.snapshot);
    recordCandidates(res.candidates, res.snapshot.periodEnd);
    renderLedger();
    renderMovement(res);

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

  /* ══════════════════════════════════════════════════════════════════════════
     THE CLIENT DECK

     The brief above is the working document: provenance tags, [ASK] gaps, benchmark
     origins, the Growth Pressure arithmetic. All of that is how we know the finding is
     sound, and none of it is what a client needs. The deck carries the finding, the money,
     the sprint their team executes, and what we still need from them.

     Two things stay out by construction. The internal client code, because a document a
     client opens should carry their own name. And the benchmark's origin, because when the
     benchmark is the client's own strongest platform, naming it invites a debate about the
     comparison instead of the gap.
     ══════════════════════════════════════════════════════════════════════════ */

  var prose = null;      // set only by a reply that passed the number check

  function proseStatus(html, tone) {
    var el = $('prose-status');
    el.hidden = !html;
    el.className = 'fb-note ' + (tone || '');
    el.style.cssText = 'margin:0 0 12px;font-size:12.5px;line-height:1.6;color:' +
      (tone === 'err' ? 'var(--red)' : tone === 'ok' ? 'var(--green)' : 'var(--blue-grey)');
    el.innerHTML = html;
  }

  $('checkprose').addEventListener('click', function () {
    var raw = $('proseback').value.trim();
    if (!raw) { proseStatus('Nothing pasted yet.', 'err'); prose = null; return; }
    if (!payloadText) { proseStatus('Generate the brief first.', 'err'); prose = null; return; }
    var res = window.Forge.checkProse(raw, payloadText);
    if (res.ok) {
      prose = res.prose;
      proseStatus('Checked. Every figure in the reply appears in the computed data.', 'ok');
    } else {
      prose = null;
      var items = res.problems.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
      proseStatus('Not used. Fix these and paste again:<ul style="margin:6px 0 0 18px">' +
        items + '</ul>', 'err');
    }
  });

  /* ── Movement panel ──────────────────────────────────────
     Shown above the brief because the first thing a session settles is whether the last
     sprint worked. A run with no earlier period on file hides the card entirely; a refused
     comparison says why, rather than looking identical to a first-ever cycle. */

  var lastMovement = null;
  var skippedPeriods = [];

  function renderMovement(res) {
    var card = $('movement-card');
    lastMovement = res.movement || null;

    if (!res.movement) {
      if (res.movementRefused) {
        card.hidden = false;
        $('movement-pill').textContent = 'Not compared';
        $('movement-sub').textContent = 'An earlier period is on file but was not comparable.';
        $('movement-body').innerHTML = '<p style="margin:0;color:var(--amber)">' +
          esc(res.movementRefused) + '</p>';
      } else {
        card.hidden = true;
      }
      return;
    }

    var m = res.movement;
    card.hidden = false;
    $('movement-pill').textContent =
      m.outcome === 'moved' ? 'Moved' : m.outcome === 'did-not-move' ? 'Did not move' : 'Unknown';
    $('movement-sub').textContent = 'Against ' + m.since + '.';

    var warn = skippedPeriods.length
      ? '<p style="margin:0 0 12px;color:var(--amber);font-size:13px">Note: ' +
        skippedPeriods.map(function (s) { return esc(s.periodStart + ' to ' + s.periodEnd); }).join(', ') +
        ' overlaps this period and was skipped, so this compares against an older one.</p>'
      : '';

    var verdictColour = m.outcome === 'moved' ? 'var(--green)'
      : m.outcome === 'did-not-move' ? 'var(--red)' : 'var(--amber)';
    var html = warn + '<p style="margin:0 0 14px;font-size:15px;color:' + verdictColour + '">' +
      esc(m.detail) + '</p>';

    if (m.rows.length) {
      html += '<div class="tw wide"><table><thead><tr>' +
        '<th>Channel</th><th>Metric</th><th>Was</th><th>Now</th><th>Change</th>' +
        '</tr></thead><tbody>' +
        m.rows.map(function (r) {
          /* Leakage is money lost, so down is the win. Every other metric here is a growth
             figure. Colouring them all the same way would paint a falling refund bill red. */
          var good = r.metric === 'Leakage' ? r.direction === 'down' : r.direction === 'up';
          var colour = r.direction === 'flat' ? 'var(--blue-grey)'
            : good ? 'var(--green)' : 'var(--red)';
          var chg = r.changePct === null ? '\u2014'
            : (r.changePct > 0 ? '+' : '') + r.changePct.toFixed(1) + '%';
          return '<tr><td>' + esc(r.platform) + '</td><td>' + esc(r.metric) +
            (r.isTargetMetric ? ' <strong>(target)</strong>' : '') + '</td><td>' +
            esc(movementNum(r.before)) + '</td><td>' + esc(movementNum(r.after)) +
            '</td><td style="color:' + colour + '">' + esc(chg) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    $('movement-body').innerHTML = html;
  }

  /**
   * Money, the way the deck writes it.
   *
   * Thousands separators throughout. Cents are dropped above RM1,000, where they are noise,
   * and forced below it, where dropping them turns an average order value of RM68.50 into
   * "RM68.5" — which reads like a typo in the one document a client scrutinises.
   */
  function rm(n) {
    if (n === null || n === undefined || !isFinite(n)) return null;
    var big = Math.abs(n) >= 1000;
    return 'RM' + n.toLocaleString('en-MY', big
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /*
   * The metric, named for the reader. "CVR" is how we write it to each other; a client deck
   * that turns on one number should not make its reader guess which number that is.
   */
  var METRIC_PLAIN = {
    'CVR': 'conversion rate',
    'AOV': 'average order value',
    'GMV': 'revenue',
    'Sessions': 'visitors',
    'GMV / repeat rate': 'revenue and repeat purchase rate',
    'Sessions / organic share': 'visitors and organic share'
  };
  function metricPlain(m) { return m ? (METRIC_PLAIN[m] || String(m).toLowerCase()) : 'the constraint metric'; }

  /*
   * A gap, rewritten as a request.
   *
   * The engine writes gaps for the consultant, so most carry a trailing clause explaining the
   * scoring consequence — "Basket cannot be scored", "no track activates this cycle",
   * "Operations is Critical". The request in front of it is exactly right for a client; the
   * consequence is our machinery and reads as jargon in their document.
   *
   * Trimming happens at clause level before sentence level, and the order matters. "Shopee:
   * AOV trend not supplied — Basket cannot be scored." must lose only the tail: dropping the
   * whole sentence takes the channel name with it, leaving an ask that does not say which
   * store it is about. A sentence that is internal all the way through goes entirely.
   *
   * If trimming leaves nothing, the original is used unchanged — a slightly technical ask on
   * the page beats silently losing a question we need answered.
   */
  var INTERNAL_CLAUSE = /cannot be scored|no track activates|is Critical\b|Unscored|Growth Pressure|scored as|activates this cycle/i;
  function clientAsk(gap) {
    var kept = String(gap)
      .split(/(?<=[.?])\s+/)
      .map(function (s) {
        // Drop an internal tail after an em-dash, keeping the request in front of it.
        var parts = s.split(/\s+—\s+/);
        if (parts.length > 1 && INTERNAL_CLAUSE.test(parts[parts.length - 1])) {
          var head = parts.slice(0, -1).join(' — ').replace(/[,;:]?\s*$/, '');
          return /[.?!]$/.test(head) ? head : head + '.';
        }
        return s;
      })
      .filter(function (s) { return s.trim() && !INTERNAL_CLAUSE.test(s); });
    return kept.length ? kept.join(' ').trim() : String(gap).trim();
  }
  function pct(n, dp) {
    return n === null || n === undefined || !isFinite(n) ? null : n.toFixed(dp === undefined ? 2 : dp) + '%';
  }

  $('deck').addEventListener('click', function () {
    var el = $('deck-status');
    function fail(msg) {
      el.hidden = false;
      el.style.cssText = 'margin:0 0 12px;font-size:12.5px;line-height:1.6;color:var(--red)';
      el.textContent = msg;
    }
    try {
      if (!payloadText) return fail('Generate a brief first.');
      var name = $('bizname').value.trim();
      if (!name) return fail('Enter the business name — a deck cannot go out unaddressed.');
      if (!prose) return fail('Paste the Project’s reply and press "Check the reply" first. ' +
        'The deck needs the finding and the sprint, and it will only use text that passed the check.');

      var pd = JSON.parse(payloadText);
      buildDeck(pd, prose, name);
      el.hidden = false;
      el.style.cssText = 'margin:0 0 12px;font-size:12.5px;line-height:1.6;color:var(--green)';
      el.textContent = 'Client deck downloaded.';
    } catch (e) {
      fail(e && e.message ? e.message : 'Deck failed.');
    }
  });

  function buildDeck(pd, pr, client) {
    var period = pd.period.start + ' to ' + pd.period.end;
    var ctx = {
      client: client,
      date: pd.period.end,
      period: period,
      kicker: pd.blocker.blocked === 'true' ? 'Stabilisation cycle' : 'Growth brief',
      title: pd.blocker.blocked === 'true' ? pd.blocker.title
           : pd.track.name ? String(pd.track.name).replace(/™/g, '') + ': the constraint this cycle'
           : 'Where the next month of growth comes from',
      standfirst: pd.blocker.blocked === 'true' ? pd.blocker.message
        : 'A reading of your store across every channel you sell on, and the three moves your ' +
          'team runs over the next 30 days.'
    };

    var doc = new PDFKit.Doc({
      onNewPage: function (d, n) { chromeDeck(d, n, d.deck || { client: client, date: ctx.date }); }
    });
    doc.audit = [];
    if (typeof LOGO_CACHE === 'object' && LOGO_CACHE) { doc.img = LOGO_CACHE; doc.pages = []; doc.newPage(); }
    doc.deck = ctx;
    deckCover(doc, ctx);

    var n = 0;

    /*
     * 0 — what happened to the last cycle.
     *
     * Only when there is an earlier period on file. This is the section that makes the
     * retainer defensible: last month we named one number and a date, and here is whether it
     * moved. It goes first, and it reports a miss as plainly as a win — a deck that only
     * appears when the news is good is worth nothing as evidence.
     */
    if (lastMovement) {
      deckHeading(doc, ++n, 'Since your last review',
        'What we said would move, and whether it did. Compared against ' + lastMovement.since + '.');
      deckLead(doc, lastMovement.detail);
      var moved = lastMovement.rows.filter(function (r) { return r.direction !== 'flat'; });
      if (moved.length) {
        table(doc, ['Channel', 'Metric', 'Was', 'Now', 'Change'],
          moved.slice(0, 6).map(function (r) {
            var good = r.metric === 'Leakage' ? r.direction === 'down' : r.direction === 'up';
            var chg = r.changePct === null ? '—'
              : (r.changePct > 0 ? '+' : '') + r.changePct.toFixed(1) + '%';
            var row = [r.platform, r.label, movementNum(r.before), movementNum(r.after), chg];
            row.__colors = [P.white, P.white, P.grey, P.white, good ? P.green : P.red];
            return row;
          }), [20, 28, 17, 17, 18]);
      }
    }

    /* The finding. The model's sentences, over figures the engine computed. */
    deckHeading(doc, ++n, 'The finding', 'What the data says, before any recommendation.');
    deckLead(doc, pr.finding);

    var tp = null;
    for (var i = 0; i < pd.platforms.length; i++) {
      if (pd.platforms[i].platform === pd.track.platform) tp = pd.platforms[i];
    }
    var figures = [];
    /* The target uplift, not the full-parity one. Parity assumes the weaker channel converts
       exactly like the strongest, which is the ceiling rather than the plan — leading with it
       would put a number on the cover the sprint is not designed to hit. Parity goes in the
       note underneath, where it belongs. */
    if (pd.sizing && pd.sizing.targetUpliftRmPerMonth !== null) {
      var parity = rm(pd.sizing.fullGapUpliftRmPerMonth);
      figures.push(['On the table', rm(pd.sizing.targetUpliftRmPerMonth),
        'Per month at the 30-day target' + (parity ? '. ' + parity + ' at full parity' : '')]);
    }
    if (tp && tp.normalisedCvrPct !== null) {
      figures.push([pd.track.platform + ' conversion', pct(tp.normalisedCvrPct),
        pd.benchmark.cvr !== null ? 'Against ' + pct(pd.benchmark.cvr) + ' on your strongest channel' : null]);
    }
    if (tp && tp.leakageRm !== null && tp.leakageRm > 0) {
      figures.push(['Cancelled and refunded', rm(tp.leakageRm),
        tp.leakagePct !== null ? pct(tp.leakagePct, 1) + ' of revenue on that channel' : null]);
    }
    deckFigures(doc, figures.slice(0, 3));

    /* 2 — the channels, side by side. No provenance tags, no [ASK] rows: a blank cell in a
       client deck is a question we ask in section 4, not a symbol to explain. */
    var rows = [];
    for (var j = 0; j < pd.platforms.length; j++) {
      var p = pd.platforms[j];
      var row = [p.platform, rm(p.gmv) || '—', p.sessions === null ? '—' : p.sessions.toLocaleString('en-MY'),
                 pct(p.normalisedCvrPct) || '—', rm(p.aov) || '—'];
      row.__colors = [p.platform === pd.track.platform ? P.cyan : P.white, P.white, P.white, P.white, P.white];
      rows.push(row);
    }
    if (rows.length) {
      deckHeading(doc, ++n, 'Your channels, side by side',
        'Same catalogue, same period. Conversion is calculated the same way on every row so the columns compare.');
      table(doc, ['Channel', 'Revenue', 'Visitors', 'Conversion', 'Average order'], rows, [22, 21, 19, 19, 19]);
    }

    /* 3 — the sprint. Three directives, in order, executed by their team. */
    deckHeading(doc, ++n, 'Your 30-day sprint', 'Three moves, in this order, run by your team.');
    var steps = [['Fix', pr.sprint.fix], ['Run', pr.sprint.run], ['Optimise', pr.sprint.optimise]];
    for (var k = 0; k < steps.length; k++) {
      var s = steps[k][1] || {};
      var note = s.hypothesis || (s.startsIn ? 'Starts ' + s.startsIn + (s.endsIn ? ', ends ' + s.endsIn : '') : '');
      deckAction(doc, k + 1, steps[k][0], s.directive || '', note);
    }

    /* 4 — the gaps, as requests. Every one of these is a figure the next brief is sharper for
       having, and printing them puts the reason a number is missing on the record. */
    var asks = (pd.gaps || []).map(clientAsk).filter(Boolean);
    if (asks.length) {
      deckHeading(doc, ++n, 'What we need from you',
        'Each of these is a figure we could not read from the exports. They make the next brief sharper.');
      deckAsks(doc, asks.slice(0, 6));
    }

    var metric = metricPlain(pd.track.metric);
    deckClose(doc, 'The one number that matters: ' + metric,
      'By the next session, ' + metric + ' on ' + (pd.track.platform || 'the target channel') +
      ' should have moved. If it has not, either the sprint was not executed or the reading was ' +
      'wrong — and we will say which. Nothing else is added until that number is checked.');

    assertClientSafe(doc);
    var slug = client.replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_|_$/g, '') || 'client';
    doc.save('ecomforges_growth_brief_' + slug + '_' + pd.period.end + '.pdf');
  }

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

  /* ══════════════════════════════════════════════════════════════════════════
     WHAT THIS DEVICE REMEMBERS

     Three separate stores, because they have different lifetimes and different risks:

       inputs   — the form, so a closed tab does not cost an hour of typing
       history  — one snapshot per client per period, so the next brief can say whether
                  the number the last one promised actually moved
       ledger   — benchmark candidates across every engagement, so a figure can reach n=3
                  and stop the tool falling back to the client's own strongest channel

     All of it stays on this device. Nothing is uploaded, and the analyst never stores a
     business name — history is keyed by client code, which is what the codes are for.
     ══════════════════════════════════════════════════════════════════════════ */

  var HISTORY = 'ecomforges-analyst-history-v1';
  var LEDGER = 'ecomforges-analyst-ledger-v1';

  function readStore(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }   // private browsing, or the quota is full
  }

  function saveInputs() {
    return writeStore(STORE, { form: readForm(), bm: $('bm').value });
  }

  $('save').addEventListener('click', function () {
    var ok = saveInputs();
    say(ok
      ? 'Saved on this device. The figures reload next time you open the page.'
      : 'Could not save — private browsing blocks local storage.', ok ? 'ok' : 'err');
  });

  /*
   * Autosave.
   *
   * Pressing Save was the only thing that kept a set of figures, and nobody presses Save
   * before their phone reclaims the tab. Debounced so typing a five-digit number is one write
   * rather than five, and it never reports success — a silent background save that announces
   * itself is noise, and one that fails is caught by the explicit Save button anyway.
   */
  var autosaveTimer = null;
  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveInputs, 800);
  }
  document.addEventListener('input', function (e) {
    if (e.target && e.target.closest && e.target.closest('#view-input')) scheduleAutosave();
  });
  document.addEventListener('change', function (e) {
    if (e.target && e.target.closest && e.target.closest('#view-input')) scheduleAutosave();
  });
  // A phone backgrounding the tab may never fire anything else, so take the last chance.
  window.addEventListener('pagehide', saveInputs);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveInputs();
  });

  /* ── History ─────────────────────────────────────────────
     One entry per client per period. Re-running the same period replaces its entry rather
     than stacking, so correcting a typo does not create a second version of the same month
     for the next run to compare against. */

  function loadHistory() {
    var h = readStore(HISTORY, []);
    return Object.prototype.toString.call(h) === '[object Array]' ? h : [];
  }

  function rememberPeriod(snap) {
    var all = loadHistory().filter(function (s) {
      return !(s.clientCode === snap.clientCode && s.periodStart === snap.periodStart &&
               s.periodEnd === snap.periodEnd);
    });
    all.push(snap);
    all.sort(function (a, b) { return a.periodEnd < b.periodEnd ? -1 : 1; });
    // 60 periods is five years of monthly cycles across a dozen clients. Past that, the
    // oldest go — a quota failure would silently lose the newest instead.
    writeStore(HISTORY, all.slice(-60));
  }

  /**
   * The latest period on file for this client that ends before the one being analysed.
   *
   * Also reports any *more recent* stored period that had to be skipped because it overlaps.
   * Without that, a brief for 15 May to 14 June quietly compares against April, skipping May
   * entirely, and reads exactly like a comparison against last month.
   */
  function priorPeriodFor(clientCode, periodStart) {
    var mine = loadHistory().filter(function (s) { return s.clientCode === clientCode; });
    var usable = mine.filter(function (s) { return s.periodEnd < periodStart; });
    var chosen = usable.length ? usable[usable.length - 1] : undefined;
    var skipped = mine.filter(function (s) {
      return s.periodEnd >= periodStart && s.periodStart < periodStart;
    });
    return { snap: chosen, skipped: skipped };
  }

  /**
   * A figure as it should appear next to another figure.
   *
   * Conversion rates arrive as full floats — 3.8700361010830324 — and printing one of those
   * beside its previous value makes a movement table unreadable and the tool look unfinished.
   * Money and counts lose their decimals; rates and ratios keep two.
   */
  function movementNum(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return Math.abs(n) >= 1000
      ? Math.round(n).toLocaleString('en-MY')
      : (Math.round(n * 100) / 100).toFixed(2);
  }

  /* ── Benchmark ledger ────────────────────────────────────
     The engine emits candidates observed in one account, so every one is n=1. A figure only
     becomes a benchmark at n=3 counted by *distinct client codes* — three readings of the
     same client is one client, and promoting it would make the tool its own evidence. */

  function ledgerKey(c) { return c.platform + '|' + c.category + '|' + c.metric; }

  /** Candidate strings come from the engine as "platform / category / metric / value / ...". */
  function parseCandidate(line) {
    var p = String(line).split(' / ').map(function (s) { return s.trim(); });
    if (p.length < 6) return null;
    var value = parseFloat(p[3]);
    if (!isFinite(value)) return null;
    return {
      platform: p[0], category: p[1], metric: p[2], value: value,
      observed: p[4].replace(/^observed\s+/i, ''),
      clientCode: p[5]
    };
  }

  function recordCandidates(lines, periodEnd) {
    var ledger = readStore(LEDGER, {});
    if (Object.prototype.toString.call(ledger) !== '[object Object]') ledger = {};
    lines.forEach(function (line) {
      var c = parseCandidate(line);
      if (!c) return;
      var k = ledgerKey(c);
      var rows = ledger[k] || [];
      // One reading per client per period: a re-run must not look like a second client.
      rows = rows.filter(function (r) {
        return !(r.clientCode === c.clientCode && r.periodEnd === periodEnd);
      });
      rows.push({ clientCode: c.clientCode, value: c.value, observed: c.observed, periodEnd: periodEnd });
      ledger[k] = rows;
    });
    writeStore(LEDGER, ledger);
    return ledger;
  }

  function distinctClients(rows) {
    var seen = {};
    rows.forEach(function (r) { seen[r.clientCode] = 1; });
    return Object.keys(seen).length;
  }

  /** The median across clients — one client's outlier must not drag a category benchmark. */
  function medianPerClient(rows) {
    var byClient = {};
    rows.forEach(function (r) {
      if (!byClient[r.clientCode] || r.periodEnd > byClient[r.clientCode].periodEnd) {
        byClient[r.clientCode] = r;   // that client's most recent reading
      }
    });
    var vals = Object.keys(byClient).map(function (k) { return byClient[k].value; })
      .sort(function (a, b) { return a - b; });
    if (!vals.length) return null;
    var mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  }

  function renderLedger() {
    var ledger = readStore(LEDGER, {});
    var keys = Object.keys(ledger).sort();
    if (!keys.length) {
      $('ledger').textContent = 'Nothing recorded yet. Every brief you generate adds to this.';
      $('cand-pill').textContent = 'n=0';
      return;
    }
    var ready = 0, lines = [];
    keys.forEach(function (k) {
      var rows = ledger[k];
      var n = distinctClients(rows);
      var parts = k.split('|');
      var med = medianPerClient(rows);
      if (n >= 3) {
        ready++;
        // The exact markdown row for benchmarks.md, so promoting it is a paste, not a retype.
        lines.push('READY  ' + parts[0] + ' / ' + parts[1] + ' / ' + parts[2] +
          '\n       | ' + parts[1] + ' | ' + med.toFixed(2) + ' | ' + n + ' | ' +
          new Date().toISOString().slice(0, 7) + ' | observed across ' + n + ' clients |');
      } else {
        lines.push('n=' + n + '/3  ' + parts[0] + ' / ' + parts[1] + ' / ' + parts[2] +
          '  —  median ' + (med === null ? '—' : med.toFixed(2)) +
          ', needs ' + (3 - n) + ' more client' + (3 - n === 1 ? '' : 's'));
      }
    });
    $('ledger').textContent = lines.join('\n\n');
    $('cand-pill').textContent = ready ? ready + ' ready' : keys.length + ' tracked';
  }

  $('copyledger').addEventListener('click', function () {
    var ledger = readStore(LEDGER, {});
    var rows = Object.keys(ledger).filter(function (k) { return distinctClients(ledger[k]) >= 3; });
    if (!rows.length) { say('Nothing has reached three separate clients yet.', 'err'); return; }
    var out = rows.map(function (k) {
      var parts = k.split('|');
      return '<!-- ' + parts[0] + ' / ' + parts[2] + ' -->\n| ' + parts[1] + ' | ' +
        medianPerClient(ledger[k]).toFixed(2) + ' | ' + distinctClients(ledger[k]) + ' | ' +
        new Date().toISOString().slice(0, 7) + ' | observed |';
    }).join('\n');
    copy(out, 'Promotable rows');
  });

  $('clearledger').addEventListener('click', function () {
    if (!window.confirm('Delete every recorded benchmark candidate on this device? This cannot be undone.')) return;
    writeStore(LEDGER, {});
    renderLedger();
    say('Benchmark ledger cleared.');
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

  /* The wordmark is rasterised once, at load, never on the click path: awaiting inside a click
     handler costs the user-activation flag in some browsers and the download is then blocked
     with no error at all. If the image is not decoded yet, retry after the load event. */
  prepareLogo();
  if (!LOGO_CACHE) window.addEventListener('load', prepareLogo);
})();
