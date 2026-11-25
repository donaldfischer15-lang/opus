/* Opus V2 (on 1.42): the motion half of the beauty pass. A stone you just earned is set into the arch, the count
   lifts, Up next changes hands, and pages lay themselves out in order. Everything is skipped for reduced motion. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, ui = Opus.ui, V = Opus.v2;
  const last = { day: null, filled: null, next: null };
  function afterToday(v) {
    const hero = v.querySelector('.hero'), nEl = hero && hero.querySelector('.n'), filled = nEl ? Number(nEl.textContent) : null, day = U.key();
    if (hero && filled != null) {
      if (last.day === day && last.filled != null && filled > last.filled) {
        const st = hero.querySelectorAll('.st'), n = st.length, order = []; { let l = 0, r = n - 1; while (l <= r) { order.push(l++); if (l <= r) order.push(r--); } }
        for (let i = last.filled; i < filled; i++) { const s = st[order[i]]; if (s) { s.classList.add('v2-lit'); s.style.animationDelay = (i - last.filled) * 140 + 'ms'; } }
        nEl.classList.add('v2-bump');
      }
      last.day = day; last.filled = filled;
    }
    const nx = v.querySelector('.next .h'), t = nx ? nx.textContent : null;
    if (nx && last.next != null && t !== last.next) nx.closest('.next').classList.add('v2-new');
    last.next = t;
  }
  const tabs = Opus.tabsAll();
  if (tabs.today) { const r0 = tabs.today.render; tabs.today.render = function (v, o) { const r = r0.call(this, v, o); try { afterToday(v); } catch (e) {} return r; }; }
  /* the in-place refresh (a tick on the circle) swaps the Up next card: watch for it */
  Opus.onBoot(() => {
    const view = document.getElementById('view');
    new MutationObserver(ms => { if (Opus.current() !== 'today') return; for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('next')) { const t = (n.querySelector('.h') || {}).textContent; if (last.next != null && t !== last.next) n.classList.add('v2-new'); last.next = t; } const nEl = view.querySelector('.hero .n'); if (nEl) { const f = Number(nEl.textContent); if (last.filled != null && f > last.filled) { nEl.classList.remove('v2-bump'); void nEl.offsetWidth; nEl.classList.add('v2-bump'); const st = view.querySelectorAll('.hero .st'), n = st.length, order = []; { let l = 0, r = n - 1; while (l <= r) { order.push(l++); if (l <= r) order.push(r--); } } for (let i = last.filled; i < f; i++) { const x = st[order[i]]; if (x) { x.classList.remove('v2-lit'); void x.getBoundingClientRect(); x.classList.add('v2-lit'); } } } last.filled = f; last.day = U.key(); } }).observe(view, { childList: true, subtree: true, characterData: true });
  });
  /* order numbers for the staggered arrivals */
  const sheet0 = ui.sheet;
  ui.sheet = function (opts) {
    const api = sheet0(opts);
    const number = () => { [...api.body.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 9))); api.body.querySelectorAll('svg.v2-seal').forEach((s, i) => s.style.setProperty('--n', i)); api.body.querySelectorAll('.v2-aq path').forEach((s, i) => s.style.setProperty('--s', i)); api.body.querySelectorAll('.v2-cal .cd').forEach((s, i) => s.style.setProperty('--c', i)); api.body.querySelectorAll('.v2-pips i.on').forEach((s, i) => s.style.setProperty('--p', i % 40)); };
    if (/^(The Annals|Its whole story|Meal|Bill|Subscription|Supplement|What the record says is coming)$/.test(opts.kicker || '')) { api.body.classList.add('v2-rise'); setTimeout(() => api.body.classList.remove('v2-rise'), 1400); }
    try { number(); new MutationObserver(number).observe(api.body, { childList: true }); } catch (e) {}
    return api;
  };
})();
