/* The week ahead: on Sunday, one card with the training days, bills due, pet care, payday and dated home jobs
   for the seven days starting today. Any other day it opens from The week on Today, for the next seven days.
   It only reads the plan and logs; nothing here is guessed, and blanks are named so Grok can fill them. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const lower1 = s => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  const day3 = d => U.DAY_NAMES[d.getDay()].slice(0, 3);

  function gather(start) {
    start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const end = U.addDays(start, 6), k0 = U.key(start), k1 = U.key(end), days = [];
    for (let i = 0; i < 7; i++) days.push(U.addDays(start, i));
    const inRange = k => k >= k0 && k <= k1;
    const out = { start, end, training: [], bills: [], pets: [], home: [], payday: null, blanks: [] };

    // training days
    days.forEach(d => { const w = Plan.workoutFor(d); if (w) out.training.push({ date: d, name: w.name || w.id, focus: w.focus || '' }); });

    // bills: Grok's dated list from the latest cash reading, then plan bills with a due day
    const M = Plan.p.money || {}, seen = new Set();
    const cash = Opus.money && Opus.money.latestCash ? Opus.money.latestCash() : null;
    ((cash && cash.held) || []).forEach(x => {
      if (!x || !x.name || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.due)) || !inRange(x.due)) return;
      seen.add(x.name.toLowerCase()); out.bills.push({ date: U.parseKey(x.due), name: x.name, amount: x.amount, from: cash.by === 'grok' ? 'grok' : 'you' });
    });
    (M.bills || []).forEach(b => {
      if (!b.name || seen.has(b.name.toLowerCase()) || !b.dueDay) return;
      const d = days.find(x => x.getDate() === Number(b.dueDay));
      if (d) out.bills.push({ date: d, name: b.name, amount: b.amount, from: 'plan' });
    });
    out.bills.sort((a, b) => a.date - b.date);
    if ((M.bills || []).length && !(M.bills || []).some(b => b.dueDay) && !(cash && (cash.held || []).some(x => x && x.due))) out.blanks.push('bill due days');

    // payday
    if (Opus.money && Opus.money.nextPayday) { const p = Opus.money.nextPayday(start); if (inRange(U.key(p))) out.payday = p; }

    // pets: care that comes due (or is already late), and birthdays
    let noEvery = false;
    if (Opus.pets) for (const p of Opus.pets.list()) {
      for (const c of (p.care || [])) {
        if (!c.every) { noEvery = true; continue; }
        const nx = Opus.pets.nextDue(p.id, c); if (!nx) continue;
        const k = U.key(nx);
        if (k <= k1) out.pets.push({ date: k < k0 ? start : nx, late: k < k0, name: p.name + ': ' + lower1(c.title || c.id) });
      }
      if (p.born) {
        const b = U.parseKey(p.born);
        days.forEach(d => { if (d.getMonth() === b.getMonth() && d.getDate() === b.getDate()) out.pets.push({ date: d, name: p.name + '’s birthday', turns: d.getFullYear() - b.getFullYear() }); });
      }
    }
    out.pets.sort((a, b) => a.date - b.date);
    if (noEvery) out.blanks.push('how often pet care comes due');

    // home jobs on a date of the month (weekly ones are already on each day's list)
    (((Plan.p.home || {}).items) || []).forEach(it => {
      if (!it.monthDay) return;
      const d = days.find(x => x.getDate() === Number(it.monthDay));
      if (d) out.home.push({ date: d, name: it.title });
    });
    return out;
  }

  const row = (d, title, small, right, cls) => {
    const r = h('<div class="row wa-row' + (cls ? ' ' + cls : '') + '"><span class="tag wa-d">' + day3(d) + '</span><span class="tx"><b></b>' + (small ? '<small></small>' : '') + '</span>' + (right ? '<span class="num wa-amt"></span>' : '') + '</div>');
    r.querySelector('b').textContent = title; if (small) r.querySelector('small').textContent = small; if (right) r.querySelector('.wa-amt').textContent = right;
    return r;
  };
  const when = (d, today) => { const n = U.daysBetween(today, d); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : U.DAY_NAMES[d.getDay()] + ', ' + U.fmtDateShort(d); };

  function card(w) {
    const c = h('<div class="card wa"></div>'), today = new Date();
    const group = t => c.appendChild(h('<div class="wa-g">' + t + '</div>'));
    if (w.training.length) {
      group('Training · ' + w.training.length + ' day' + (w.training.length === 1 ? '' : 's'));
      const line = h('<div class="wa-train"></div>');
      w.training.forEach(t => { const x = h('<span class="wa-t"><i></i><b></b></span>'); x.querySelector('i').textContent = day3(t.date); x.querySelector('b').textContent = t.name; x.title = t.focus; line.appendChild(x); });
      c.appendChild(line);
    }
    if (w.bills.length || w.payday) {
      const total = U.sum(w.bills.filter(b => b.amount != null).map(b => b.amount));
      group('Money' + (w.bills.length ? ' · ' + U.money(total, { cents: true }) + ' due' : ''));
      const items = w.bills.map(b => ({ d: b.date, el: row(b.date, b.name, when(b.date, today) + (b.from === 'grok' ? ' · from Grok' : ''), b.amount != null ? U.money(b.amount, { cents: true }) : 'blank') }));
      if (w.payday) items.push({ d: w.payday, el: row(w.payday, 'Payday', when(w.payday, today), '', 'wa-pay') });
      items.sort((a, b) => a.d - b.d).forEach(x => c.appendChild(x.el));
    }
    if (w.pets.length) { group('Pets'); w.pets.forEach(p => c.appendChild(row(p.date, p.name, p.late ? 'Already due' : p.turns ? 'Turns ' + p.turns : when(p.date, today), '', p.late ? 'wa-late' : ''))); }
    if (w.home.length) { group('Home'); w.home.forEach(x => c.appendChild(row(x.date, x.name, when(x.date, today)))); }
    if (!c.children.length) c.appendChild(h('<p class="empty">A quiet week: no training, bills or pet care on the calendar.</p>'));
    if (w.blanks.length) c.appendChild(h('<p class="small wa-note">Not in your plan yet: ' + U.esc(w.blanks.join(' and ')) + '. Grok can add them, and they’ll show here.</p>'));
    return c;
  }
  const range = w => U.fmtDateShort(w.start) + ' – ' + U.fmtDateShort(w.end);

  /* on Sunday: its own section on Today */
  function section(v, numeral) {
    const w = gather(new Date());
    const s = h('<div class="sec"><div class="sh"><span class="r">' + numeral + '</span><span class="t">The week ahead</span><span class="c num">' + range(w) + '</span></div></div>');
    s.appendChild(card(w)); v.appendChild(s);
    return s;
  }
  function sheet() {
    const w = gather(new Date());
    ui.sheet({ title: 'The week ahead', kicker: range(w), render(api) { api.body.appendChild(card(w)); } });
  }
  const isDay = d => U.dayKey(d || new Date()) === ((Store.data.settings || {}).weekAheadDay || 'sun');

  Opus.weekAhead = { gather, section, sheet, isDay };
})();
