/* Opus UI primitives: icons, sheets, toasts, arch, charts, rest timer, tabs. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Store = Opus.store;

  const I = {
    today: '<path d="M4 20V11a8 8 0 0 1 16 0v9M8 20v-8a4 4 0 0 1 8 0v8M2 20h20"/>',
    food: '<path d="M4 11h16a8 8 0 0 1-16 0zM9 4c0 2 2 2 2 4M14 4c0 2 2 2 2 4"/>',
    camera: '<path d="M4 8h3l1.6-2.4A1 1 0 0 1 9.4 5h5.2a1 1 0 0 1 .8.6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>',
    train: '<path d="M2 12h20M5 8v8M8 6v12M16 6v12M19 8v8"/>',
    money: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/>',
    home: '<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
    laurel: '<path d="M12 21c-4-2-7-6-7-11M12 21c4-2 7-6 7-11M5 10c1.5 0 2.5 1 3 2.5M5 14c1.5-.3 3 .3 3.8 1.6M19 10c-1.5 0-2.5 1-3 2.5M19 14c-1.5-.3-3 .3-3.8 1.6M5 6c1.2.4 2 1.4 2.2 2.6M19 6c-1.2.4-2 1.4-2.2 2.6"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'
  };
  const icon = (n, cls) => '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" aria-hidden="true">' + (I[n] || '') + '</svg>';
  const CK = '<svg viewBox="0 0 12 12"><path d="M2 6.5 5 9 10 3" fill="none" stroke="#1b120a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function stagger(root) { Array.from(root.children).forEach((c, i) => c.style.setProperty('--i', i)); root.classList.add('rise'); }

  /* ---------- sounds and haptics ---------- */
  let ac = null;
  function unlockAudio() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} }
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  function chime() {
    if (!Store.data.settings.sound) return;
    try {
      unlockAudio(); if (!ac) return;
      const t0 = ac.currentTime;
      [[659.25, 0], [987.77, .16]].forEach(([f, dt]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0, t0 + dt); g.gain.linearRampToValueAtTime(.18, t0 + dt + .02); g.gain.exponentialRampToValueAtTime(.0001, t0 + dt + 1.1);
        o.start(t0 + dt); o.stop(t0 + dt + 1.2);
      });
    } catch (e) {}
  }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p || 12); } catch (e) {} }

  /* ---------- screen wake lock ---------- */
  let wl = null, wantWake = false;
  async function wake(on) {
    wantWake = on;
    try {
      if (on && 'wakeLock' in navigator && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
      if (!on && wl) { await wl.release(); wl = null; }
    } catch (e) { wl = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wantWake) wake(true); });

  /* ---------- toast ---------- */
  let toastEl = null, toastT = null;
  function toast(text, action) {
    if (!toastEl) { toastEl = h('<div class="toast" role="status" aria-live="polite"></div>'); document.body.appendChild(toastEl); }
    toastEl.innerHTML = '<span>' + U.esc(text) + '</span>' + (action ? '<button type="button">' + U.esc(action.label) + '</button>' : '');
    if (action) toastEl.querySelector('button').onclick = () => { action.run(); toastEl.classList.remove('show'); };
    requestAnimationFrame(() => toastEl.classList.add('show'));
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), action ? 5000 : 2600);
  }

  /* ---------- sheets ---------- */
  const stack = [];
  function sheet(opts) {
    const scrim = h('<div class="scrim"></div>');
    const el = h('<section class="sheet' + (opts.full ? ' full' : '') + (opts.top ? ' top' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="frame"><div class="head"><div class="ht">' + (opts.kicker ? '<div class="eyebrow">' + U.esc(opts.kicker) + '</div>' : '') +
      '<div class="title">' + U.esc(opts.title || '') + '</div></div>' +
      (opts.headExtra || '') +
      '<button class="icon-btn" type="button" aria-label="Close" data-close>' + icon('close') + '</button></div>' +
      '<div class="scroll"></div>' + (opts.foot ? '<div class="foot"></div>' : '') + (opts.top ? '<div class="grip" role="button" aria-label="Close"><i></i></div>' : '') + '</div></section>');
    document.body.appendChild(scrim); document.body.appendChild(el);
    const api = {
      el, body: $('.scroll', el), foot: $('.foot', el), head: $('.head', el), grip: $('.grip', el),
      close(silent) {
        el.classList.remove('show'); scrim.classList.remove('show');
        setTimeout(() => { el.remove(); scrim.remove(); }, 450);
        const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
        document.body.style.overflow = stack.length ? 'hidden' : '';
        if (!silent && opts.onClose) opts.onClose();
        Opus.rest && Opus.rest.place();
      },
      setTitle(t) { $('.title', el).textContent = t; },
      rerender() { api.body.innerHTML = ''; opts.render(api); }
    };
    $('[data-close]', el).onclick = () => (opts.beforeClose ? opts.beforeClose(api) : api.close());
    if (!opts.full) scrim.onclick = () => api.close();
    stack.push(api); document.body.style.overflow = 'hidden';
    opts.render(api);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('show'); scrim.classList.add('show'); }));
    Opus.rest && Opus.rest.place();
    return api;
  }
  function topSheet() { return stack[stack.length - 1] || null; }

  /* confirm built into the page (the browser's confirm() is not used) */
  function ask(o) {
    return new Promise(res => {
      let done = false;
      const s = sheet({
        title: o.title, kicker: o.kicker,
        render(api) {
          api.body.appendChild(h('<p class="note">' + U.esc(o.text || '') + '</p>'));
          const b = h('<div class="btns"><button class="btn quiet" type="button">' + U.esc(o.no || 'Cancel') + '</button><button class="btn' + (o.danger ? ' danger' : '') + '" type="button">' + U.esc(o.yes || 'OK') + '</button></div>');
          b.children[0].onclick = () => { done = true; api.close(true); res(false); };
          b.children[1].onclick = () => { done = true; api.close(true); res(true); };
          api.body.appendChild(b);
        },
        onClose() { if (!done) res(false); }
      });
      return s;
    });
  }

  /* ---------- arch ---------- */
  function arch(n, filled) {
    n = Math.max(1, n);
    const cx = 120, cy = 146, R1 = 108, R2 = 83;
    let paths = '';
    const order = []; { let l = 0, r = n - 1; while (l <= r) { order.push(l++); if (l <= r) order.push(r--); } }
    const lit = new Set(order.slice(0, filled));
    const key = order[order.length - 1];
    for (let i = 0; i < n; i++) {
      const g = n > 1 ? .012 : 0;
      const t0 = Math.PI - (i / n) * Math.PI, t1 = Math.PI - ((i + 1) / n) * Math.PI;
      const p = (r, t) => (cx + r * Math.cos(t)).toFixed(2) + ',' + (cy - r * Math.sin(t)).toFixed(2);
      const A = p(R1, t0 - g), B = p(R1, t1 + g), C = p(R2, t1 + g), D = p(R2, t0 - g);
      const on = lit.has(i);
      paths += '<path class="st" d="M' + A + ' A' + R1 + ' ' + R1 + ' 0 0 1 ' + B + ' L' + C + ' A' + R2 + ' ' + R2 + ' 0 0 0 ' + D + 'Z" fill="url(#' + (i === key ? 'kg' : 'sg') + ')" stroke="rgba(214,163,94,.35)" stroke-width=".8" style="opacity:' + (on ? 1 : .13) + (on ? ';filter:drop-shadow(0 0 3px rgba(242,211,160,.5))' : '') + '"/>';
    }
    return '<svg class="arch" viewBox="0 30 240 126" role="img" aria-label="' + filled + ' of ' + n + ' done">' +
      '<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2d3a0"/><stop offset="1" stop-color="#9a6a3e"/></linearGradient>' +
      '<linearGradient id="kg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0d2"/><stop offset="1" stop-color="#d6a35e"/></linearGradient></defs>' +
      '<line x1="6" y1="147" x2="234" y2="147" stroke="rgba(214,163,94,.4)"/>' + paths + '</svg>';
  }

  /* ---------- charts (single series, gold line, tap/hover for values) ---------- */
  function chart(pts, o) {
    o = Object.assign({ w: 320, h: 120, pad: [10, 8, 18, 34], fmt: v => U.num(v, 1), target: null, avg: null, dates: true }, o || {});
    const box = h('<div class="trend"><svg class="chart" viewBox="0 0 ' + o.w + ' ' + o.h + '" role="img"></svg><div class="tip"></div></div>');
    const svg = box.firstChild, tip = box.lastChild;
    if (!pts.length) { svg.innerHTML = '<text x="' + o.w / 2 + '" y="' + o.h / 2 + '" text-anchor="middle">No entries yet</text>'; tip.textContent = o.empty || ''; return box; }
    const [pt, pr, pb, pl] = o.pad;
    const vals = pts.map(p => p.v).concat(o.target != null ? [o.target] : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const span = hi - lo; lo -= span * .08; hi += span * .08;
    const t0 = U.parseKey(pts[0].date).getTime(), t1 = U.parseKey(pts[pts.length - 1].date).getTime();
    const X = d => pts.length === 1 ? pl + (o.w - pl - pr) / 2 : pl + (U.parseKey(d).getTime() - t0) / Math.max(1, t1 - t0) * (o.w - pl - pr);
    const Y = v => pt + (1 - (v - lo) / (hi - lo)) * (o.h - pt - pb);
    let s = '';
    const ticks = [lo + (hi - lo) * .1, lo + (hi - lo) * .5, lo + (hi - lo) * .9];
    ticks.forEach(v => { s += '<line class="grid" x1="' + pl + '" x2="' + (o.w - pr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + U.esc(o.fmt(v)) + '</text>'; });
    if (o.target != null) s += '<line class="ln2" x1="' + pl + '" x2="' + (o.w - pr) + '" y1="' + Y(o.target).toFixed(1) + '" y2="' + Y(o.target).toFixed(1) + '"/><text x="' + (o.w - pr) + '" y="' + (Y(o.target) - 4).toFixed(1) + '" text-anchor="end">' + U.esc(o.tlabel == null ? 'goal' : o.tlabel) + ' ' + U.esc(o.fmt(o.target)) + '</text>';
    const line = pts.map((p, i) => (i ? 'L' : 'M') + X(p.date).toFixed(1) + ',' + Y(p.v).toFixed(1)).join('');
    const gid = 'g' + U.uid();
    if (pts.length > 1) {
      s += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6a35e" stop-opacity=".28"/><stop offset="1" stop-color="#d6a35e" stop-opacity="0"/></linearGradient></defs>';
      s += '<path d="' + line + 'L' + X(pts[pts.length - 1].date).toFixed(1) + ',' + (o.h - pb) + 'L' + X(pts[0].date).toFixed(1) + ',' + (o.h - pb) + 'Z" fill="url(#' + gid + ')"/>';
      s += '<path class="ln" d="' + line + '"/>';
    }
    if (o.avg && o.avg.length > 1) s += '<path class="ln2" d="' + o.avg.map((p, i) => (i ? 'L' : 'M') + X(p.date).toFixed(1) + ',' + Y(p.v).toFixed(1)).join('') + '"/>';
    const last = pts[pts.length - 1];
    s += '<circle class="end" r="4.5" cx="' + X(last.date).toFixed(1) + '" cy="' + Y(last.v).toFixed(1) + '"/>';
    if (o.dates) {
      s += '<text x="' + pl + '" y="' + (o.h - 4) + '">' + U.fmtDateShort(pts[0].date) + '</text>';
      if (pts.length > 1) s += '<text x="' + (o.w - pr) + '" y="' + (o.h - 4) + '" text-anchor="end">' + U.fmtDateShort(last.date) + '</text>';
    }
    s += '<line class="hl" id="hl" y1="' + pt + '" y2="' + (o.h - pb) + '" style="opacity:0"/><circle class="hov" r="5" style="opacity:0"/>';
    s += '<rect x="0" y="0" width="' + o.w + '" height="' + o.h + '" fill="transparent"/>';
    svg.innerHTML = s;
    const lab = p => U.fmtDateShort(p.date) + ' · ' + (o.tipFmt || o.fmt)(p.v) + (p.note ? ' · ' + p.note : '');
    tip.textContent = 'Latest: ' + lab(last);
    const hl = svg.querySelector('.hl'), hv = svg.querySelector('.hov');
    const move = e => {
      const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * o.w;
      let best = pts[0]; for (const p of pts) if (Math.abs(X(p.date) - x) < Math.abs(X(best.date) - x)) best = p;
      hl.setAttribute('x1', X(best.date)); hl.setAttribute('x2', X(best.date)); hl.style.opacity = 1;
      hv.setAttribute('cx', X(best.date)); hv.setAttribute('cy', Y(best.v)); hv.style.opacity = 1;
      tip.textContent = lab(best);
    };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', () => { hl.style.opacity = 0; hv.style.opacity = 0; tip.textContent = 'Latest: ' + lab(last); });
    return box;
  }
  function spark(pts, o) {
    o = Object.assign({ w: 96, h: 30 }, o || {});
    if (pts.length < 2) return '<svg class="chart" viewBox="0 0 ' + o.w + ' ' + o.h + '"><line class="grid" x1="0" x2="' + o.w + '" y1="' + (o.h - 2) + '" y2="' + (o.h - 2) + '"/></svg>';
    const vs = pts.map(p => p.v); let lo = Math.min(...vs), hi = Math.max(...vs); if (lo === hi) { lo -= 1; hi += 1; }
    const X = i => 3 + i / (pts.length - 1) * (o.w - 6), Y = v => 3 + (1 - (v - lo) / (hi - lo)) * (o.h - 6);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p.v).toFixed(1)).join('');
    return '<svg class="chart" viewBox="0 0 ' + o.w + ' ' + o.h + '" aria-hidden="true"><path class="ln" d="' + d + '"/><circle class="end" r="3" cx="' + X(pts.length - 1).toFixed(1) + '" cy="' + Y(vs[vs.length - 1]).toFixed(1) + '"/></svg>';
  }

  /* ---------- stepper input ---------- */
  function stepper(o) {
    const el = h('<div class="stepper"><button type="button" aria-label="Less">' + I.minus.replace(/^/, '<svg viewBox="0 0 24 24">') + '</svg></button>' +
      '<input type="text" inputmode="decimal" autocomplete="off" aria-label="' + U.esc(o.label || '') + '" placeholder="' + U.esc(o.placeholder || '') + '">' +
      (o.unit ? '<span class="u">' + U.esc(o.unit) + '</span>' : '') +
      '<button type="button" aria-label="More"><svg viewBox="0 0 24 24">' + I.plus + '</svg></button></div>');
    el.querySelector('button').innerHTML = '<svg viewBox="0 0 24 24">' + I.minus + '</svg>';
    const inp = el.querySelector('input');
    const get = () => { const v = parseFloat(String(inp.value).replace(',', '.')); return isNaN(v) ? null : v; };
    const set = (v, quiet) => { inp.value = v == null ? '' : U.wt(v); if (!quiet && o.onChange) o.onChange(get()); };
    set(o.value, true);
    const [minus, plus] = el.querySelectorAll('button');
    minus.onclick = () => { set(o.step(get(), -1)); buzz(6); };
    plus.onclick = () => { set(o.step(get(), 1)); buzz(6); };
    inp.addEventListener('input', () => o.onChange && o.onChange(get()));
    inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
    return { el, get, set, input: inp };
  }

  /* ---------- copy & files ---------- */
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied'); return true; }
    catch (e) {
      const s = sheet({ title: 'Copy', render(api) {
        api.body.appendChild(h('<p class="note">Your browser blocked automatic copying. Press and hold the text, choose Select All, then Copy.</p>'));
        const ta = h('<textarea class="input mono" readonly style="min-height:50vh"></textarea>'); ta.value = text; api.body.appendChild(ta);
        setTimeout(() => { ta.focus(); ta.select(); }, 300);
      } });
      return false;
    }
  }
  async function saveFile(name, text) {
    // inside a claude.ai preview the frame blocks downloads, so show the text to copy instead
    if (/claude|anthropic/.test(location.hostname) || location.protocol === 'about:') { copy(text); return false; }
    const blob = new Blob([text], { type: 'application/json' });
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    try {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return true;
    } catch (e) { copy(text); return false; }
  }
  function pickFile() {
    return new Promise(res => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json,text/plain';
      inp.onchange = () => { const f = inp.files[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsText(f); };
      inp.click();
    });
  }

  Opus.ui = { icon, I, CK, h, $, $$, stagger, sheet, topSheet, ask, toast, arch, chart, spark, stepper, copy, saveFile, pickFile, chime, buzz, wake };

  /* ---------- rest timer ---------- */
  const R = {
    el: null, iv: null, overAt: null, suppress: false, onTick: null,
    setSuppress(v) { this.suppress = !!v; if (!this.el) return; if (v) this.el.classList.remove('show'); else if (Store.data.rest) this.el.classList.add('show'); },
    start(sec, label, next) {
      const now = Date.now();
      Store.data.rest = { endAt: now + sec * 1000, total: sec, label: label || 'Rest', next: next || '' };
      Store.save(); this.overAt = null; this.show();
    },
    adjust(d) { const r = Store.data.rest; if (!r) return; r.endAt += d * 1000; r.total = Math.max(5, r.total + d); Store.save(); this.overAt = null; this.tick(); },
    stop() { Store.data.rest = null; Store.save(); this.hide(); if (this.onTick) this.onTick(null); },
    ensure() {
      if (this.el) return;
      this.el = h('<div class="restdock" role="timer" aria-live="off"><div class="ring"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="rgba(214,163,94,.18)" stroke-width="3"/><circle class="p" cx="24" cy="24" r="20" fill="none" stroke="#d6a35e" stroke-width="3" stroke-linecap="round" stroke-dasharray="125.66" stroke-dashoffset="0"/></svg><div class="t num">0:00</div></div>' +
        '<div class="lbl"><b>Rest</b><span></span></div><button class="tb" type="button" data-d="-15">−15</button><button class="tb" type="button" data-d="15">+15</button><button class="tb" type="button" data-skip aria-label="Skip rest">' + icon('close') + '</button></div>');
      this.el.querySelector('[data-skip] svg').style.cssText = 'width:16px;height:16px';
      this.el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => this.adjust(Number(b.dataset.d)));
      this.el.querySelector('[data-skip]').onclick = () => this.stop();
      document.body.appendChild(this.el);
    },
    place() { if (!this.el) return; this.el.classList.toggle('in-sheet', !!topSheet()); },
    show() { this.ensure(); this.place(); requestAnimationFrame(() => { if (!this.suppress) this.el.classList.add('show'); }); clearInterval(this.iv); this.iv = setInterval(() => this.tick(), 250); this.tick(); },
    hide() { if (this.el) this.el.classList.remove('show', 'over'); clearInterval(this.iv); },
    tick() {
      const r = Store.data.rest; if (!r) { if (this.onTick) this.onTick(null); return this.hide(); }
      const left = (r.endAt - Date.now()) / 1000;
      if (this.onTick) this.onTick({ left, r });
      const t = this.el.querySelector('.t'), p = this.el.querySelector('.p'), lb = this.el.querySelector('.lbl b'), sp = this.el.querySelector('.lbl span');
      if (left > 0) {
        t.textContent = U.fmtDuration(Math.ceil(left));
        p.setAttribute('stroke-dashoffset', (125.66 * (1 - left / r.total)).toFixed(2));
        lb.textContent = r.label; sp.textContent = r.next ? 'Next: ' + r.next : '';
        this.el.classList.remove('over');
      } else {
        if (this.overAt == null) {
          this.overAt = Date.now();
          if (-left < 5) { chime(); buzz([60, 80, 60]); }
        }
        t.textContent = '0:00'; p.setAttribute('stroke-dashoffset', '125.66');
        lb.textContent = 'Rest done'; sp.textContent = r.next ? 'Go: ' + r.next : 'Next set';
        this.el.classList.add('over');
        if (-left > 30) this.stop();
      }
    },
    resume() { const r = Store.data.rest; if (!r) return; if (Date.now() - r.endAt > 30000) { Store.data.rest = null; Store.save(); return; } this.show(); }
  };
  Opus.rest = R;
})();
