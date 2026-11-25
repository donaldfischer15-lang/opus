/* Breathing, on Body: blood oxygen while asleep (WHOOP's SpO2), breaths a minute (respiratory rate), and a nightly nose
   strips tick, so nights with and without strips can be set side by side. It says what the numbers are, never what they
   mean medically.
   A night belongs to the morning you woke up, the same day WHOOP files that sleep under. Store.data.strips keeps the
   nights you set: [{ date, on, at }]. From the first night you set on, a night you didn't set counts as your usual
   (settings.stripsUsual, on unless you change it). */
(function () {
  const Opus = window.Opus, U = Opus.util, Store = Opus.store;
  const h = s => Opus.ui.h(s);
  const MIN = 3; // nights of each before the comparison shows
  const list = () => (Store.data.strips = Store.data.strips || []);
  const usual = () => !(Store.data.settings && Store.data.settings.stripsUsual === false);
  const since = () => { let s = null; for (const x of list()) if (x && x.date && (!s || x.date < s)) s = x.date; return s; };
  /* true, false, or null when strips weren't tracked yet that night */
  function strips(k) {
    const e = list().find(x => x.date === k); if (e) return !!e.on;
    const s = since(); return s && k >= s && k <= U.key() ? usual() : null;
  }
  function set(k, on) {
    const l = list(), e = { date: k, on: !!on, at: new Date().toISOString() }, i = l.findIndex(x => x.date === k);
    if (i >= 0) l[i] = e; else l.push(e);
    Store.save();
  }
  const avg = a => { const b = a.filter(v => v != null); return b.length ? b.reduce((m, v) => m + v, 0) / b.length : null; };
  const f1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1);
  const nightName = k => U.DAY_NAMES[U.parseKey(k).getDay()].slice(0, 3) + ' ' + U.fmtDateShort(k);
  function spark(vals) {
    const pts = vals.map((v, i) => [i, v]).filter(p => p[1] != null); if (pts.length < 2) return '<span class="bd-spark"></span>';
    const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1])), sp = hi - lo || 1, W = 132, H = 34;
    const X = i => (i / (vals.length - 1) * (W - 6) + 3).toFixed(1), Y = v => (H - 4 - (v - lo) / sp * (H - 8)).toFixed(1);
    const last = pts[pts.length - 1];
    return '<svg class="bd-spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><path d="' + pts.map((p, j) => (j ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + '"/><circle cx="' + X(last[0]) + '" cy="' + Y(last[1]) + '" r="3"/></svg>';
  }
  /* the nights WHOOP kept, with what each needs for the comparison */
  function nights() {
    const w = Opus.whoop && Opus.whoop.data(); if (!w) return [];
    return Object.keys(w.days).sort().map(k => {
      const x = w.days[k] || {}, r = x.recovery || {}, s = x.sleep || {};
      return { k, on: strips(k), spo2: r.spo2 != null ? r.spo2 : null, rr: s.respiratory != null ? s.respiratory : null, perf: s.scored && s.performance != null ? s.performance : null, rec: r.scored && r.score != null ? r.score : null };
    }).filter(n => n.spo2 != null || n.rr != null || n.perf != null || n.rec != null);
  }
  /* strips on and off, side by side, once there are MIN nights of each */
  function compare() {
    const ns = nights(), on = ns.filter(n => n.on === true), off = ns.filter(n => n.on === false);
    return { on, off, ready: on.length >= MIN && off.length >= MIN };
  }

  function section(v, roman, d) {
    const today = U.key(d || new Date());
    const ks = []; for (let i = 13; i >= 0; i--) ks.push(U.key(U.addDays(d || new Date(), -i)));
    const w = Opus.whoop && Opus.whoop.data(), xs = ks.map(k => (w && w.days[k]) || {});
    const spo2 = xs.map(x => x.recovery && x.recovery.spo2 != null ? x.recovery.spo2 : null);
    const rr = xs.map(x => x.sleep && x.sleep.respiratory != null ? x.sleep.respiratory : null);
    const sec = h('<div class="sec"><div class="sh"><span class="r">' + roman + '</span><span class="t">Breathing</span><span class="c">14 nights</span></div><div class="card"></div></div>');
    const c = sec.querySelector('.card');

    // last night's tick: one tap, set to your usual until you change it
    const tick = h('<div class="row br-tick"><span class="tx"><b>Nose strips last night</b><small></small></span><span class="br-seg" role="group" aria-label="Nose strips last night"><button type="button" data-on="1">On</button><button type="button" data-on="0">Off</button></span></div>');
    const paintTick = () => {
      const e = list().find(x => x.date === today), cur = e ? !!e.on : usual();
      tick.querySelectorAll('.br-seg button').forEach(b => { const sel = (b.dataset.on === '1') === cur; b.classList.toggle('on', sel); b.setAttribute('aria-pressed', sel ? 'true' : 'false'); });
      tick.querySelector('small').textContent = e ? 'Saved for ' + nightName(today) : since() ? 'Counted as your usual. Tap ' + (cur ? 'Off' : 'On') + ' if last night was different.' : 'Tap one to start. After that, a night you skip counts as your usual.';
    };
    tick.querySelectorAll('.br-seg button').forEach(b => b.onclick = () => { set(today, b.dataset.on === '1'); paintTick(); paintDots(); });
    c.appendChild(tick);

    // 14 nights of strips: filled on, ring off; tap one to change it
    const dots = h('<div class="row br-nights"><span class="tx"><small>Each night, oldest first. Tap one to change it.</small></span><span class="br-dots"></span></div>');
    const paintDots = () => {
      const box = dots.querySelector('.br-dots'); box.innerHTML = '';
      ks.forEach(k => {
        const s = strips(k), b = h('<button type="button" class="br-dot' + (s === true ? ' on' : s === false ? ' off' : '') + (k === today ? ' now' : '') + '" aria-label="' + nightName(k) + ': ' + (s === true ? 'strips on' : s === false ? 'strips off' : 'not set') + '"></button>');
        b.onclick = () => { const next = s !== true; set(k, next); Opus.ui.toast('Nose strips ' + (next ? 'on' : 'off') + ', ' + nightName(k)); paintDots(); paintTick(); };
        box.appendChild(b);
      });
    };
    paintDots(); paintTick();
    c.appendChild(dots);

    // blood oxygen, the main measure
    const lastOf = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };
    const so = avg(spo2), sn = spo2.filter(x => x != null).length;
    c.appendChild(h('<div class="row bd-row"><span class="tx"><b>Blood oxygen</b><small>' + (sn ? 'asleep · avg ' + f1(so) + '%' : 'Comes in with WHOOP’s recovery each morning') + '</small></span>' + spark(spo2) + '<span class="bd-v num">' + f1(lastOf(spo2)) + '<small>%</small></span></div>'));

    // breaths a minute: a small line, mostly to spot a night that isn't like the others
    const rLast = rr[rr.length - 1], rAvg = avg(rr.slice(0, -1).length ? rr.slice(0, -1) : rr);
    let rLine = '';
    if (rAvg != null) {
      const odd = rr.map(x => x != null && Math.abs(x - rAvg) >= 1).filter(Boolean).length;
      rLine = 'usual ' + f1(rAvg) + (rLast != null && Math.abs(rLast - rAvg) >= 1 ? ' · last night ' + f1(Math.abs(rLast - rAvg)) + (rLast > rAvg ? ' above' : ' below') + ' your usual' : odd ? ' · ' + odd + (odd === 1 ? ' night' : ' nights') + ' a breath or more off it' : ' · every night close to it');
    }
    c.appendChild(h('<div class="row br-rr"><span class="tx"><b>Breaths a minute</b><small>' + U.esc(rLine || 'Comes in with WHOOP’s sleep each morning') + '</small></span><span class="bd-v sm num">' + f1(lastOf(rr)) + '</span></div>'));

    // strips on and off, side by side
    const cmp = compare();
    if (cmp.ready) {
      const col = (ns, key, unit, dec) => { const a = avg(ns.map(n => n[key])); return a == null ? '—' : (dec ? f1(a) : Math.round(a)) + unit; };
      const rows = [['Blood oxygen', 'spo2', '%', 1], ['Breaths a minute', 'rr', '', 1], ['Sleep performance', 'perf', '%', 0], ['Recovery', 'rec', '%', 0]];
      const t = h('<div class="br-cmp"><div class="br-ch"><span></span><span>With strips<small>' + cmp.on.length + ' nights</small></span><span>Without<small>' + cmp.off.length + ' nights</small></span></div></div>');
      rows.forEach(([name, key, unit, dec]) => t.appendChild(h('<div class="br-cr"><span>' + name + '</span><b class="num">' + col(cmp.on, key, unit, dec) + '</b><b class="num">' + col(cmp.off, key, unit, dec) + '</b></div>')));
      c.appendChild(t);
    } else {
      c.appendChild(h('<div class="row"><span class="tx"><b>With strips and without</b><small>' + (w ? 'After ' + MIN + ' nights of each, Opus sets them side by side here. So far ' + cmp.on.length + ' with, ' + cmp.off.length + ' without' + '.' : 'Once WHOOP sends your nights, Opus sets nights with strips and without side by side here.') + '</small></span></div>'));
    }
    const foot = h('<p class="small" style="padding:0 4px">Your own numbers from WHOOP, for comparing one night with another. They aren’t a medical test. <button class="link" type="button">Usual: strips ' + (usual() ? 'on' : 'off') + '</button></p>');
    foot.querySelector('button').onclick = () => {
      const s = Store.data.settings = Store.data.settings || {}; s.stripsUsual = !usual(); Store.save();
      foot.querySelector('button').textContent = 'Usual: strips ' + (usual() ? 'on' : 'off');
      Opus.ui.toast('Your usual is now strips ' + (usual() ? 'on' : 'off')); paintTick(); paintDots();
    };
    sec.appendChild(foot);
    v.appendChild(sec);
  }
  Opus.breath = { section, strips, set, compare, usual };
})();
