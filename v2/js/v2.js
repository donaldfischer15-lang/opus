/* Opus V2, slice 1 "Alive Today", built into Opus itself (on 1.42). Nothing is taken away: the six tabs and every
   screen stay. Added to Today: Up next that follows the clock, "Not today", rows that swipe, what is still open,
   the Tomorrow card, a first drawn Augur, and the hour's light on every tab. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h, T = Opus.training;
  const esc = U.esc;

  /* ---------- not today ---------- */
  const skips = d => { const s = Store.data.skips = Store.data.skips || {}; return s[U.key(d)] || []; };
  const isSkipped = (d, id) => skips(d).includes(id);
  function setSkipped(d, id, on) {
    const s = Store.data.skips = Store.data.skips || {}, k = U.key(d), a = s[k] = s[k] || [], i = a.indexOf(id);
    if (on && i < 0) a.push(id); if (!on && i >= 0) a.splice(i, 1);
    if (on && Plan.isChecked(d, id)) Plan.setChecked(d, id, false);
    Store.save();
  }
  const live = (items, d) => items.filter(it => !isSkipped(d, it.id));
  function notToday(it, d) {
    setSkipped(d, it.id, true); ui.buzz(6); Opus.refresh();
    ui.toast('Not today: ' + String(it.title).split(':')[0], { label: 'Undo', run: () => { setSkipped(d, it.id, false); Opus.refresh(); } });
  }

  /* ---------- the hour's light ---------- */
  function light(now) {
    now = now || new Date();
    const m = U.nowMins(now), s = Plan.p.schedule || {}, wake = U.mins(s.wake) ?? 300, lights = U.mins(s.lightsOut) ?? 1290;
    document.body.dataset.light = m < wake - 30 || m >= lights ? 'night' : m < wake + 180 ? 'dawn' : m < 16 * 60 + 30 ? 'day' : 'dusk';
  }

  /* ---------- what is now: the clock decides, not the first unticked row ---------- */
  function eff(it, d) {
    const t = U.mins(it.time); if (t != null) return t;
    if (it.part === 'evening') return (U.mins((Plan.p.schedule || {}).lightsOut) ?? 1290) - 60;
    return (Plan.partStarts(d)[it.part] ?? 300) + 30;
  }
  function state(now) {
    now = now || new Date();
    const s = Plan.p.schedule || {}, m = U.nowMins(now), wake = U.mins(s.wake) ?? 300, lights = U.mins(s.lightsOut) ?? 1290;
    const items = Plan.itemsFor(now);
    const open = items.filter(it => !Plan.isChecked(now, it.id) && !isSkipped(now, it.id)).sort((a, b) => eff(a, now) - eff(b, now));
    const night = m < wake - 30 || m >= lights;
    const cur = open.filter(it => eff(it, now) >= m - 90 && eff(it, now) <= m + 20), later = open.filter(it => eff(it, now) > m + 20);
    return { now: night ? null : cur[0] || null, next: night || cur.length ? null : later[0] || null, stale: night ? open : open.filter(it => eff(it, now) < m - 90), items, open, night, m, lights, wake };
  }
  Plan.nextThing = function (now) {
    now = now || new Date();
    const st = state(now), s = this.p.schedule || {}, it = st.now || st.next;
    if (st.night) return { kind: 'sleep', title: 'Nothing needs you', detail: (st.m >= st.lights ? 'Lights out was ' + U.fmtTimeAP(s.lightsOut) + '. ' : '') + 'Tomorrow starts at ' + U.fmtTimeAP(s.wake) + '.', time: null };
    if (!it) return { kind: 'sleep', title: 'Nothing needs you', detail: 'That is the day. Lights out at ' + U.fmtTimeAP(s.lightsOut) + '.', time: null };
    return Object.assign({ overdue: !!st.now && U.mins(it.time) != null && U.mins(it.time) < st.m - 20 }, it);
  };

  /* ---------- Up next gets "Not today" (and "Something else" for a meal) ---------- */
  function dressNext(el, nx, d) {
    if (!nx || nx.kind === 'sleep' || !nx.id) { el.classList.add('v2-rest'); return; }
    const acts = h('<div class="v2-acts">' + (nx.kind === 'meal' && nx.meal && Opus.food ? '<button class="btn ghost sm" type="button" data-a="else">Something else</button>' : '') + '<button class="btn ghost sm" type="button" data-a="skip">Not today</button></div>');
    const e = acts.querySelector('[data-a="else"]'); if (e) e.onclick = () => Opus.food.eatSheet(d, nx);
    acts.querySelector('[data-a="skip"]').onclick = () => notToday(nx, d);
    el.classList.add('v2-next'); el.appendChild(acts);
  }

  /* ---------- still open: earlier things, each settled in one tap ---------- */
  function afterNext(v, d) {
    const st = state(d); if (!st.stale.length) return;
    if (st.night) { v.appendChild(h('<div class="card v2-still"><div class="row"><span class="tx"><b>' + st.stale.length + (st.stale.length === 1 ? ' thing' : ' things') + ' left open today</b><small>Swipe them below, or let them go.</small></span></div></div>')); return; }
    const card = h('<div class="card v2-still"><div class="v2-cap">Still open</div></div>');
    for (const it of st.stale) {
      const flow = ['workout', 'writing', 'review', 'money', 'prep', 'weigh', 'foodlog'].includes(it.kind) || !!it.open;
      const r = h('<div class="row"><span class="tx"><b>' + esc(String(it.title).split(':')[0]) + '</b><small class="num">' + (it.time ? U.fmtTime(it.time) : Plan.partLabel(it.part, d)) + '</small></span><button class="btn ghost sm" type="button" data-a="did">' + (it.kind === 'meal' ? 'Ate it' : flow ? 'Open' : 'Did it') + '</button><button class="btn ghost sm" type="button" data-a="skip">Not today</button></div>');
      r.querySelector('[data-a="did"]').onclick = () => { if (flow) { it.open ? it.open(() => Opus.refresh()) : Opus.today.openFlow(it, () => Opus.refresh()); } else { Plan.setChecked(d, it.id, true); ui.buzz(10); Opus.refresh(); } };
      r.querySelector('[data-a="skip"]').onclick = () => notToday(it, d);
      card.appendChild(r);
    }
    v.appendChild(card);
  }

  /* ---------- rows: swipe right for done, left for not today ---------- */
  function dressRow(row, it, d) {
    row.dataset.noswipe = '1'; row.classList.add('v2-row');
    if (isSkipped(d, it.id)) { row.classList.add('skipped'); const tx = row.querySelector('.tx'); const sm = tx.querySelector('small') || tx.appendChild(document.createElement('small')); sm.textContent = 'Not today. Tap to bring it back.'; }
    let s = null, under = null;
    const clear = () => { row.style.transition = 'transform .28s cubic-bezier(.2,.7,.2,1)'; row.style.transform = ''; const u = under; under = null; setTimeout(() => { u && u.remove(); row.classList.remove('lifted'); if (row.parentElement) row.parentElement.classList.remove('v2-clip'); }, 280); };
    row.addEventListener('pointerdown', e => { if (e.target.closest('.ck')) return; s = { x: e.clientX, y: e.clientY, on: false }; });
    row.addEventListener('pointermove', e => {
      if (!s) return; const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.on) {
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        s.on = true; try { row.setPointerCapture(e.pointerId); } catch (err) {}
        under = h('<div class="v2-under"><span class="r">' + ui.CK + 'Done</span><span class="l">Not today</span></div>');
        under.style.top = row.offsetTop + 'px'; under.style.height = row.offsetHeight + 'px';
        row.parentElement.insertBefore(under, row); row.classList.add('lifted'); row.parentElement.classList.add('v2-clip');
      }
      const x = U.clamp(dx, -150, 150); row.style.transition = 'none'; row.style.transform = 'translateX(' + x + 'px)';
      under.dataset.dir = x > 0 ? 'r' : 'l'; under.classList.toggle('armed', Math.abs(x) >= 80);
    });
    const end = e => {
      if (!s) return; const was = s; s = null; if (!was.on) return;
      const dx = e.clientX - was.x; row.dataset.swiped = '1'; setTimeout(() => delete row.dataset.swiped, 400); clear();
      if (dx >= 80) setTimeout(() => { if (isSkipped(d, it.id)) setSkipped(d, it.id, false); if (!Plan.isChecked(d, it.id)) { Plan.setChecked(d, it.id, true); ui.buzz(12); } Opus.refresh(); }, 220);
      else if (dx <= -80) setTimeout(() => notToday(it, d), 220);
    };
    row.addEventListener('pointerup', end); row.addEventListener('pointercancel', end);
    row.addEventListener('click', e => {
      if (row.dataset.swiped) { e.stopImmediatePropagation(); e.preventDefault(); return; }
      if (isSkipped(d, it.id)) { e.stopImmediatePropagation(); e.preventDefault(); setSkipped(d, it.id, false); Opus.refresh(); }
    }, true);
  }

  /* ---------- tomorrow, shown once the evening is under way ---------- */
  function tomorrow(v, d) {
    const st = state(d); if (!st.night && st.m < Plan.partStarts(d).evening + 120) return;
    const t = U.addDays(d, 1), items = Plan.itemsFor(t).slice().sort((a, b) => eff(a, t) - eff(b, t)); if (!items.length) return;
    const s = h('<div class="sec v2-tom"><div class="sh"><span class="r">☽</span><span class="t">Tomorrow</span><span class="c">' + U.DAY_NAMES[t.getDay()] + '</span></div><div class="card"></div></div>'), card = s.querySelector('.card');
    const row = (day, title, small, right) => { const r = h('<div class="row wa-row"><span class="tag wa-d">' + day + '</span><span class="tx"><b></b>' + (small ? '<small></small>' : '') + '</span>' + (right ? '<span class="tm num"></span>' : '') + '</div>'); r.querySelector('b').textContent = title; if (small) r.querySelector('small').textContent = small; if (right) r.querySelector('.tm').textContent = right; return r; };
    const pack = items.find(it => /pack/i.test(it.title) && it.part === 'morning');
    if (pack) {
      const r = h('<div class="row tap' + (Plan.isChecked(t, pack.id) ? ' done' : '') + '"><button class="ck" type="button" aria-label="Mark done">' + ui.CK + '</button><span class="tx"><b>' + esc(pack.title) + ', tonight</b><small>Tick it now and it’s already done when you wake.</small></span></div>');
      r.onclick = () => { Plan.setChecked(t, pack.id, !Plan.isChecked(t, pack.id)); ui.buzz(10); Opus.refresh(); };
      card.appendChild(r);
    }
    const first = items[0], w = Plan.workoutFor(t), wi = items.find(i => i.kind === 'workout');
    card.appendChild(row('First', String(first.title).split(':')[0], '', first.time ? U.fmtTimeAP(first.time) : ''));
    card.appendChild(row('Train', w ? w.name + ': ' + (w.focus || 'session').toLowerCase() : 'Rest day', w ? Plan.workoutSummary(w) : 'No session planned.', w && wi && wi.time ? U.fmtTimeAP(wi.time) : ''));
    let bills = []; try { bills = Opus.weekAhead.gather(t).bills.filter(b => U.key(b.date) === U.key(t)); } catch (e) {}
    card.appendChild(row('Money', bills.length ? bills.map(b => b.name).join(', ') + ' comes out' : 'No bills go out', '', bills.length ? U.money(U.sum(bills.map(b => b.amount || 0)), { cents: true }) : ''));
    v.appendChild(s);
  }

  /* ---------- the Augur: a first drawn section ---------- */
  let sealN = 0;
  function seal(on, mark) {
    if (!on) return '<span class="v2-seal off" aria-hidden="true"></span>';
    const id = 'v2sg' + (++sealN); let d = '';
    for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2, r = 21 + 1.7 * Math.cos(a * 14); d += (i ? 'L' : 'M') + (24 + r * Math.cos(a)).toFixed(2) + ' ' + (24 + r * Math.sin(a)).toFixed(2); }
    return '<svg class="v2-seal" viewBox="0 0 48 48" aria-hidden="true"><defs><radialGradient id="' + id + '" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="#fbe3b6"/><stop offset=".5" stop-color="#cf9152"/><stop offset="1" stop-color="#6f4725"/></radialGradient></defs>' +
      '<path d="' + d + 'Z" fill="url(#' + id + ')"/><circle cx="24" cy="24" r="15.5" fill="none" stroke="rgba(27,18,10,.4)" stroke-width="1"/><circle cx="24" cy="24" r="14.2" fill="none" stroke="rgba(255,240,210,.35)" stroke-width=".7"/>' +
      '<text x="24" y="29.4" text-anchor="middle" font-family="Cinzel, serif" font-size="15" font-weight="600" fill="#2a1a0c">' + (mark || 'A') + '</text></svg>';
  }
  const blockOf = ex => { for (const w of Object.values((Plan.p.training || {}).workouts || {})) for (const b of (w.blocks || [])) if (b.ex === ex) return b; return null; };
  function lastOf(ex) { const hist = T.sessionsFor(ex); if (!hist.length) return null; const l = hist[0], top = Math.max(...l.sets.map(s => s.weight || 0)); return { date: l.date, top, at: l.sets.filter(s => (s.weight || 0) === top) }; }
  /* each set as a small column of stones: lit for the reps you got, hollow up to the reps that move you up */
  function pips(sets, hi, need) {
    let o = '<div class="v2-pips" role="img" aria-label="' + sets.map(s => s.reps).join(', ') + ' reps; ' + hi + ' on every set moves you up">';
    for (let i = 0; i < Math.max(need, sets.length); i++) { const r = sets[i] ? sets[i].reps : 0; o += '<span class="pc">'; for (let k = hi - 1; k >= 0; k--) o += '<i class="' + (k < r ? 'on' : '') + '"></i>'; o += '<b class="num">' + (sets[i] ? r : '–') + '</b></span>'; }
    return o + '</div>';
  }
  function readings() {
    const out = [], d = new Date();
    for (const ex of T.mainLifts()) {
      const b = blockOf(ex), l = lastOf(ex); if (!b || !l) continue;
      const s = T.suggest(b), name = Plan.exercise(ex).name, hi = b.reps[1];
      let line = null, to = null;
      if (s.kind === 'up') { to = s.weight; line = U.wt(to) + ' at your next session'; }
      else if (s.kind === 'hold' && s.weight) { to = T.step(ex, s.weight, 1); const short = l.at.slice(0, b.sets).reduce((n, x) => n + Math.max(0, hi - x.reps), 0) + Math.max(0, b.sets - l.at.length) * hi; line = U.wt(to) + ' is ' + short + (short === 1 ? ' rep' : ' reps') + ' away'; }
      if (!line) continue;
      const book = Store.data.augur = Store.data.augur || [], bid = ex + ':' + l.date;
      if (!book.some(x => x.id === bid)) { book.push({ id: bid, ex, from: l.date, made: U.key(), line, expect: s.kind === 'up' ? { kind: 'up', weight: to } : { kind: 'hold', weight: s.weight, reps: hi } }); Store.save(); }
      out.push({ ex, k: name, sealed: true, state: 'Opens next session', line, sub: 'Read from ' + (l.top ? U.wt(l.top) + ' × ' : '') + l.at.map(x => x.reps).join(', ') + ' on ' + U.fmtDateShort(l.date) + '. ' + hi + ' on every set moves you up.',
        draw: pips(l.at, hi, b.sets) + (T.hasPlates(ex) && Opus.train ? '<div class="v2-plates"><span class="v2-cap">' + U.wt(to) + ' on the bar</span>' + Opus.train.plateView(to, T.plateBase(ex)) + '</div>' : '') });
    }
    const ws = (Store.data.weights || []).slice().sort((a, b) => a.date.localeCompare(b.date)), goal = ((Plan.p.food || {}).goal || {}).target;
    if (ws.length && goal) {
      const span = U.daysBetween(U.parseKey(ws[0].date), d) + 1, avgOf = (a, b2) => U.avg(ws.filter(w => { const n = U.daysBetween(U.parseKey(w.date), d); return n >= a && n < b2; }).map(w => w.lb));
      const a7 = avgOf(0, 7), b7 = avgOf(7, 14);
      if (span >= 21 && a7 != null && b7 != null && a7 < b7 && a7 > goal) {
        const wks = (a7 - goal) / (b7 - a7), lo = U.addDays(d, Math.round(wks * 7 * .8)), hi2 = U.addDays(d, Math.round(wks * 7 * 1.25));
        out.push({ k: 'Weight', sealed: true, state: 'Opens ' + U.fmtDateShort(lo), line: goal + ' lb between ' + U.fmtDateShort(lo) + ' and ' + U.fmtDateShort(hi2), sub: 'Read from two weekly averages, ' + U.wt(b7) + ' then ' + U.wt(a7) + ' lb. The range is wide on purpose.' });
      } else {
        let dots = '<div class="v2-days" role="img" aria-label="day ' + Math.min(span, 21) + ' of 21">'; for (let i = 0; i < 21; i++) dots += '<i class="' + (i < span ? 'on' : '') + '"></i>'; dots += '</div>';
        out.push({ k: 'Weight', sealed: false, state: 'Day ' + Math.min(span, 21) + ' of 21', line: 'Not yet read', sub: ws.length + ' weigh-ins so far' + (a7 != null ? ', averaging ' + U.wt(a7) + ' lb this week' : '') + '. A date range for ' + goal + ' lb needs three weeks of mornings.', draw: dots });
      }
    }
    try {
      const r = Opus.money.debtFree();
      if (r && r.date) {
        const each = (r.each || []).filter(x => x.date && !x.paid), max = Math.max(1, ...each.map(x => x.months));
        let tl = '<div class="v2-line">'; each.forEach((x, i) => { tl += '<span class="' + (i % 2 ? 'lo' : '') + '" style="left:' + (4 + 82 * x.months / max).toFixed(1) + '%"><i></i><b>' + esc(x.name) + '</b><small>' + U.MONTHS[x.date.getMonth()].slice(0, 3) + ' ' + x.date.getFullYear() + '</small></span>'; }); tl += '</div>';
        out.push({ k: 'Debt', sealed: true, state: 'Moves with your pace', line: 'Debt-free around ' + U.MONTHS[r.date.getMonth()] + ' ' + r.date.getFullYear(), sub: r.pace && r.budget ? 'Read from ' + U.money(r.budget) + ' a week' + (r.pace.src === 'pace' ? ', your pace over the last ' + r.pace.n + ' weeks' : ', your plan') + '. Debts with no rate set count no interest.' : r.msg, draw: each.length > 1 ? tl : '' });
      }
    } catch (e) {}
    out.push({ k: 'From Duet', sealed: false, state: 'Listening', line: 'Still learning you', sub: 'Patterns need about four weeks of logs. Until then every reading here is worked out on this phone.' });
    return out;
  }
  function opened() {
    const out = [];
    for (const x of Store.data.augur || []) {
      const later = T.sessionsFor(x.ex).filter(s => s.date > x.from).pop(); if (!later || !x.expect) continue;
      const top = Math.max(...later.sets.map(s => s.weight || 0)), at = later.sets.filter(s => (s.weight || 0) === top), minR = Math.min(...at.map(s => s.reps));
      const hit = x.expect.kind === 'up' ? top >= x.expect.weight : top >= x.expect.weight && minR >= x.expect.reps;
      out.push({ ex: x.ex, name: Plan.exercise(x.ex).name, line: x.line, hit, got: (top ? U.wt(top) + ' × ' : '') + at.map(s => s.reps).join(', '), date: later.date, from: x.from });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }
  function readingCard(r, plain) {
    const el = readingEl(r);
    if (r.ex && !plain && Opus.v2.liftPage) { el.classList.add('tap'); el.onclick = () => Opus.v2.liftPage(r.ex); }
    return el;
  }
  function readingEl(r) {
    return h('<div class="card v2-reading' + (r.sealed ? '' : ' unread') + '">' + seal(r.sealed, r.mark) + '<div class="tx"><div class="vk"><span class="k">' + esc(r.k) + '</span><span class="w">' + esc(r.state) + '</span></div><div class="serif-h">' + esc(r.line) + '</div>' + (r.draw || '') + '<small>' + esc(r.sub) + '</small></div></div>');
  }
  function augurSheet() {
    ui.sheet({ title: 'The Augur', kicker: 'What the record says is coming', full: true, render(api) {
      const b = api.body, rs = readings(), a = rs.filter(r => r.sealed), u = rs.filter(r => !r.sealed), nm = ['I', 'II', 'III']; let n = 0;
      const sec = (t, c) => h('<div class="sec"><div class="sh"><span class="r">' + nm[n++] + '</span><span class="t">' + t + '</span><span class="c num">' + c + '</span></div></div>');
      if (a.length) { const s = sec('Sealed', a.length); a.forEach(r => s.appendChild(readingCard(r))); b.appendChild(s); }
      if (u.length) { const s = sec('Not yet read', u.length); u.forEach(r => s.appendChild(readingCard(r))); b.appendChild(s); }
      const op = opened(), s3 = sec('The record', op.length ? op.filter(x => x.hit).length + ' of ' + op.length + ' came true' : '');
      if (op.length) { const c = h('<div class="card"></div>'); op.forEach(x => c.appendChild(h('<div class="row v2-rec">' + seal(true, x.hit ? '✓' : '×') + '<span class="tx"><b>' + esc(x.name + ': ' + x.line) + '</b><small>Sealed ' + U.fmtDateShort(x.from) + ', opened ' + U.fmtDateShort(x.date) + ' with ' + esc(x.got) + '. ' + (x.hit ? 'It came true.' : 'It did not.') + '</small></span></div>'))); s3.appendChild(c); }
      else s3.appendChild(h('<div class="card pad"><p class="small">None opened yet. A reading is sealed when it is made and opened on its day, right or wrong. Both kinds are kept here.</p></div>'));
      b.appendChild(s3);
      b.appendChild(h('<p class="small" style="padding:0 4px">Tap a lift to open its page. Nothing here is a promise. It is only what your own numbers point to.</p>'));
    } });
  }
  function augur(v) {
    const rs = readings(), a = rs.filter(r => r.sealed), top = a[0];
    const s = h('<div class="sec v2-aug"><div class="sh"><span class="r">✦</span><span class="t">The Augur</span><span class="c">' + (a.length ? a.length + ' sealed' : 'listening') + '</span></div></div>');
    const c = h('<button type="button" class="card v2-reading tap">' + seal(!!top, top && top.mark) + '<div class="tx"><div class="vk"><span class="k">' + esc(top ? top.k : 'Nothing read yet') + '</span><span class="w">' + esc(top ? top.state : '') + '</span></div><div class="serif-h">' + esc(top ? top.line : 'The record is still short') + '</div>' + (top && top.draw ? top.draw.split('<div class="v2-plates">')[0] : '') + '<small>' + (a.length > 1 ? esc(a.slice(1).map(r => r.k + ': ' + r.line.replace(/^Debt-free /, '')).join(' · ')) : 'Readings appear as your logs grow.') + '</small></div></button>');
    c.onclick = () => augurSheet();
    s.appendChild(c); v.appendChild(s);
  }
  function beforeWeek(v, d) { tomorrow(v, d); augur(v); }

  Opus.v2 = { light, live, isSkipped, setSkipped, state, dressNext, afterNext, dressRow, beforeWeek, readings, readingCard, opened, seal, augurSheet };
  Opus.onBoot(() => { light(); setInterval(light, 60000); });
})();
