/* Opus V2 (on 1.42): what Grok can add, all through tools it already has.
   - Shared memory, heading "Augur": lines Grok writes become readings.
       "[opens 2026-11-25] [free 150-210] About $180 free the day before payday | from $324 today less the car loan"
         is sealed, and opened against the free-cash reading on that day.
       "Noticed: three of your four kept lines are Stoics | kept Nov 19, 21, 22" is shown as noticed, never scored.
   - Shared memory, heading "Today": "[2026-11-25] one line" becomes the line under the arch for that day.
   - plan.food.supplies: [{ id, name, left, unit, asOf, match: ["egg"], low }] is counted down by what was eaten since asOf. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h, V = Opus.v2;
  const esc = U.esc;

  /* ---------- lines from the shared memory ---------- */
  function section(name) {
    const out = [], re = /^#{1,6}\s+(.+?)\s*$/; let on = false;
    for (const raw of String(Store.data.memory || '').split('\n')) {
      const m = re.exec(raw); if (m) { on = m[1].trim().toLowerCase() === name.toLowerCase(); continue; }
      if (!on) continue; const t = raw.replace(/^\s*[-*]\s+/, '').trim(); if (!t) continue;
      const who = /\((grok|cassius|claude|duet)[^)]*\)\s*$/i.exec(t);
      out.push({ text: t.replace(/\s*\((grok|cassius|claude|duet)[^)]*\)\s*$/i, '').trim(), by: who ? who[1][0].toUpperCase() + who[1].slice(1).toLowerCase() : 'Grok' });
    }
    return out;
  }
  function grokReadings() {
    const out = [];
    for (const l of section('Augur')) {
      let t = l.text; const opens = /\[opens (\d{4}-\d{2}-\d{2})\]/i.exec(t), free = /\[free (-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\]/i.exec(t);
      t = t.replace(/\[[^\]]*\]\s*/g, '').trim();
      const noticed = /^noticed:\s*/i.test(t); t = t.replace(/^noticed:\s*/i, '');
      const [line, basis] = t.split(/\s*\|\s*/); if (!line) continue;
      out.push({ k: noticed ? 'Noticed' : free ? 'Money' : 'From ' + l.by, by: l.by, line, basis: basis || '', noticed, opens: opens ? opens[1] : null, free: free ? [Number(free[1]), Number(free[2])] : null });
    }
    return out;
  }
  function cashOn(k) {
    const c = (((Store.data.money || {}).cash) || []).filter(x => x.date >= k).sort((a, b) => a.date.localeCompare(b.date))[0]; if (!c) return null;
    let f = c.free; try { if (Opus.money && Opus.money.freeOf) { const x = Opus.money.freeOf(c); if (typeof x === 'number') f = x; } } catch (e) {}
    return typeof f === 'number' ? { date: c.date, free: f } : null;
  }
  const readings0 = V.readings, opened0 = V.opened;
  V.readings = function () {
    const base = readings0().filter(r => r.k !== 'From Duet'), today = U.key(), extra = [];
    for (const g of grokReadings()) {
      if (g.noticed) continue;
      if (g.opens && g.opens <= today && g.free && cashOn(g.opens)) continue; // opened: it lives in the record now
      extra.push({ k: g.k, sealed: true, mark: g.by[0], state: g.opens ? 'Opens ' + U.fmtDateShort(g.opens) : 'Sealed by ' + g.by, line: g.line, sub: (g.basis ? 'Read ' + g.basis + '. ' : '') + 'From ' + g.by + '.' });
    }
    if (!extra.length) base.push({ k: 'From Grok', sealed: false, state: 'Listening', line: 'Nothing sealed yet', sub: 'Grok can seal a reading by writing it under “Augur” in the shared memory. Until then every reading here is worked out on this phone.' });
    return base.concat(extra);
  };
  V.opened = function () {
    const out = opened0(), today = U.key();
    for (const g of grokReadings()) { if (!g.free || !g.opens || g.opens > today) continue; const c = cashOn(g.opens); if (!c) continue; const hit = c.free >= g.free[0] && c.free <= g.free[1]; out.push({ name: g.by, line: g.line, hit, got: U.money(c.free) + ' free', date: c.date, from: null }); }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  };
  V.noticed = () => grokReadings().filter(g => g.noticed);
  V.noticedInto = function (b) {
    const ns = V.noticed(); if (!ns.length) return;
    const s = h('<div class="sec"><div class="sh"><span class="r">✦</span><span class="t">Noticed</span><span class="c num">' + ns.length + '</span></div><div class="card"></div></div>'), c = s.querySelector('.card');
    for (const n of ns) c.appendChild(h('<div class="row"><span class="tx"><b class="v2-notice">' + esc(n.line) + '</b><small>' + esc((n.basis ? n.basis + ' · ' : '') + 'from ' + n.by) + '</small></span></div>'));
    b.appendChild(s);
  };
  /* the line under the arch: a holiday or a first comes first, then a line Grok wrote for today */
  const lede0 = V.lede;
  V.lede = function (d) {
    const own = lede0 ? lede0(d) : null; if (own) return own;
    const k = U.key(d), l = section('Today').map(x => /^\[(\d{4}-\d{2}-\d{2})\]\s*(.+)$/.exec(x.text)).filter(m => m && m[1] === k).pop();
    return l ? l[2].trim() : null;
  };

  /* ---------- supplies, counted down by what you ate ---------- */
  const fits = (su, name) => (su.match && su.match.length ? su.match : [su.name]).some(m => String(name || '').toLowerCase().includes(String(m).toLowerCase()));
  function amountOf(su, x) { // x: { amount, unit, grams }
    const u = String(su.unit || '').toLowerCase(), xu = String(x.unit || '').toLowerCase();
    if (!u) return !xu || /^(each|count|large|medium|small|stick|slice|cup|container)/.test(xu) ? Number(x.amount) || 1 : null;
    if (u === 'g') return x.grams != null ? Number(x.grams) : xu === 'g' ? Number(x.amount) : xu === 'oz' ? Number(x.amount) * 28.35 : null;
    if (u === 'oz') return xu === 'oz' ? Number(x.amount) : x.grams != null ? Number(x.grams) / 28.35 : xu === 'g' ? Number(x.amount) / 28.35 : null;
    return xu === u ? Number(x.amount) : null;
  }
  function supplies() {
    const list = Array.isArray((Plan.p.food || {}).supplies) ? Plan.p.food.supplies : [], today = new Date(), out = [];
    for (const su of list) {
      if (!su || !su.name || !(Number(su.left) >= 0) || !/^\d{4}-\d{2}-\d{2}$/.test(su.asOf || '')) continue;
      let used = 0, uncounted = 0, days = 0;
      for (let d = U.addDays(U.parseKey(su.asOf), 1); U.key(d) <= U.key(today); d = U.addDays(d, 1)) {
        days++; const k = U.key(d), take = x => { const a = amountOf(su, x); if (a == null || !isFinite(a)) uncounted++; else used += a; };
        for (const e of Plan.eatenOn(k)) { if (e.extra && fits(su, e.name)) take(e); }
        for (const it of Plan.itemsFor(d)) {
          if (it.kind !== 'meal' || !it.meal || !Plan.isChecked(d, it.id)) continue;
          const e = Plan.eatenEntry(d, it.id), parts = e && Array.isArray(e.parts) ? e.parts.map(p => ({ name: p.name, amount: p.ate != null ? p.ate : p.planned, unit: p.unit })) : Plan.partsOf(it.meal);
          for (const p of parts) if (fits(su, p.name)) take(p);
        }
      }
      const left = Math.max(0, Math.round((su.left - used) * 10) / 10), perDay = days >= 3 && used > 0 ? used / days : null;
      out.push({ su, used: Math.round(used * 10) / 10, left, uncounted, daysLeft: perDay ? Math.floor(left / perDay) : null, low: su.low != null ? left <= Number(su.low) : perDay ? left / perDay <= 2 : left <= 0 });
    }
    return out;
  }
  function suppliesSection() {
    const all = supplies(); if (!all.length) return null;
    const s = h('<div class="sec v2-sup"><div class="sh"><span class="r">✦</span><span class="t">Supplies</span><span class="c">counted from what you ate</span></div><div class="card"></div></div>'), c = s.querySelector('.card');
    for (const x of all) {
      const pct = x.su.left > 0 ? U.clamp(x.left / x.su.left, 0, 1) * 100 : 0, unit = x.su.unit ? ' ' + x.su.unit : '';
      c.appendChild(h('<div class="row v2-suprow"><span class="tx"><b>' + esc(x.su.name) + (x.low ? '<span class="v2-first v2-low">Low</span>' : '') + '</b><span class="v2-bar"><i style="width:' + pct.toFixed(0) + '%"></i></span><small class="num">' + esc('About ' + U.num(x.left, 1) + unit + ' left of ' + U.num(x.su.left, 1) + unit + ' on ' + U.fmtDateShort(x.su.asOf) + (x.daysLeft != null ? ' · about ' + x.daysLeft + (x.daysLeft === 1 ? ' day' : ' days') + ' at your pace' : '') + (x.uncounted ? ' · ' + x.uncounted + ' logged in a unit Opus couldn’t count' : '')) + '</small></span></div>'));
    }
    return s;
  }
  const tabs = Opus.tabsAll();
  if (tabs.food) { const r0 = tabs.food.render; tabs.food.render = function (v, o) { r0.call(this, v, o); try { const s = suppliesSection(); if (s) { const secs = v.querySelectorAll('.sec'); const first = secs[0]; if (first && first.nextSibling) first.parentElement.insertBefore(s, first.nextSibling); else v.appendChild(s); } } catch (e) { console.warn('opus: supplies', e); } }; }
  /* low supplies are said on the Tomorrow card, the evening before you'd miss them */
  const before0 = V.beforeWeek;
  V.beforeWeek = function (v, d) {
    before0(v, d);
    try { const card = v.querySelector('.v2-tom .card'), low = supplies().filter(x => x.low); if (card && low.length) { const r = h('<div class="row wa-row"><span class="tag wa-d">Low</span><span class="tx"><b></b><small></small></span></div>'); r.querySelector('b').textContent = low.map(x => x.su.name).join(', '); r.querySelector('small').textContent = low.map(x => 'about ' + U.num(x.left, 1) + (x.su.unit ? ' ' + x.su.unit : '') + ' left').join(' · '); card.appendChild(r); } } catch (e) {}
  };
  Object.assign(V, { supplies, suppliesSection, grokReadings });
})();
