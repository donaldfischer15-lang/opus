/* Days off: mark any workday as off, today or ahead of time.
   A day off is not a workday anywhere in Opus: Today drops the workday plan (packing lunch, the Workday section
   becomes Midday), the catch-up session can use it, and Money takes the missed days off the next check.
   The days live in the plan as schedule.daysOff: ["YYYY-MM-DD", ...], so Claude or Grok can mark one too. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const KEEP_DAYS = 45; // older days off are dropped when the list is saved

  const list = () => { const s = (Plan.p && Plan.p.schedule) || {}; return Array.isArray(s.daysOff) ? s.daysOff : []; };
  const isOff = d => list().includes(U.key(d));
  const plainWorkday = d => { const s = (Plan.p && Plan.p.schedule) || {}; return (s.workdays || []).includes(U.dayKey(d)); };

  // a marked day is no longer a workday, everywhere Opus asks
  const isWorkday0 = Plan.isWorkday;
  Plan.isWorkday = function (d) { return isWorkday0.call(this, d) && !isOff(d); };

  function set(d, on) {
    const s = Plan.p.schedule = Plan.p.schedule || {};
    const k = U.key(d), cut = U.key(U.addDays(new Date(), -KEEP_DAYS));
    let a = list().filter(x => x !== k && x >= cut);
    if (on) a.push(k);
    a.sort();
    if (a.length) s.daysOff = a; else delete s.daysOff;
    Store.save();
  }

  /* ---------- the sheet: the next three weeks of workdays ---------- */
  function sheet() {
    ui.sheet({ title: 'Days off', kicker: 'Schedule', onClose: () => Opus.refresh(), render(api) {
      const b = api.body, t = new Date();
      b.appendChild(h('<p class="muted do-help">Tap a workday you’re not working. Today and the rest of Opus switch to a day-off layout, and Money takes it off your next check.</p>'));
      let wk = null;
      for (let i = 0; i < 21; i++) {
        const d = U.addDays(t, i);
        if (!plainWorkday(d)) continue;
        const ws = U.key(U.weekStart(d));
        if (!wk || wk.dataset.w !== ws) {
          wk = h('<div class="do-week" data-w="' + ws + '"><div class="do-wl">' + (i < 7 && U.key(U.weekStart(t)) === ws ? 'This week' : 'Week of ' + U.fmtDateShort(U.addDays(U.weekStart(d), 1))) + '</div><div class="chips"></div></div>');
          b.appendChild(wk);
        }
        const c = h('<button class="chip do-chip" type="button"><b>' + (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : U.DAY_NAMES[d.getDay()].slice(0, 3)) + '</b><span>' + U.fmtDateShort(d) + '</span></button>');
        const paint = () => c.classList.toggle('on', isOff(d));
        c.onclick = () => { set(d, !isOff(d)); paint(); ui.buzz(8); };
        paint();
        wk.querySelector('.chips').appendChild(c);
      }
      const past = list().filter(k => k < U.key(t));
      if (past.length) b.appendChild(h('<p class="small do-past">Marked off before today: ' + past.slice(-6).map(k => U.DAY_NAMES[U.parseKey(k).getDay()].slice(0, 3) + ' ' + U.fmtDateShort(k)).join(', ') + '</p>'));
      const done = h('<button class="btn block" type="button">Done</button>');
      done.onclick = () => api.close();
      b.appendChild(done);
    } });
  }

  /* ---------- Today: the button in the corner, and a line when today is off ---------- */
  function topButton(top, d) {
    const spacer = top.firstElementChild;
    if (!spacer || spacer.tagName !== 'SPAN') return;
    const off = isOff(d);
    const btn = h('<button class="icon-btn do-btn' + (off ? ' on' : '') + '" type="button" aria-label="Days off">' + ui.icon('off') + '</button>');
    btn.onclick = sheet;
    spacer.replaceWith(btn);
  }
  function todayLine(v, d) {
    if (!isOff(d)) return;
    const el = h('<div class="change-line do-line">Day off today. <button class="link" type="button">Working after all?</button></div>');
    el.querySelector('button').onclick = () => { set(d, false); ui.toast('Back to a workday'); Opus.refresh(); };
    const hero = v.querySelector('.hero');
    if (hero) hero.after(el); else v.appendChild(el);
  }

  /* ---------- Money: what the next check should be ---------- */
  /* a check pays for the Monday-to-Sunday week before payday's week (money.payCovers "last-week", the default),
     or payday's own week ("this-week"). Each workday marked off in it comes off at money.dayOffValue a day,
     or the usual take-home split evenly across the workdays. */
  function nextCheck() {
    if (!Opus.money || !Opus.money.calc) return null;
    const m = Plan.p.money || {}, c = Opus.money.calc();
    if (c.take == null) return null;
    const pay = Opus.money.nextPayday();
    const mon = U.addDays(U.weekStart(pay), 1); // Monday of payday's week
    const start = m.payCovers === 'this-week' ? mon : U.addDays(mon, -7);
    const days = [];
    for (let i = 0; i < 7; i++) { const d = U.addDays(start, i); if (plainWorkday(d) && isOff(d)) days.push(d); }
    const wds = ((Plan.p.schedule || {}).workdays || []).length || 5;
    const per = Number(m.dayOffValue) > 0 ? Number(m.dayOffValue) : c.take / wds;
    return { pay, start, days, per, usual: c.take, est: Math.max(0, c.take - per * days.length), set: Number(m.dayOffValue) > 0 };
  }
  function checkLine() {
    const n = nextCheck(); if (!n || !n.days.length) return null;
    const names = n.days.map(d => U.DAY_NAMES[d.getDay()].slice(0, 3)).join(', ');
    return h('<div class="g-take do-check"><div class="tag">Next check · ' + U.DAY_NAMES[n.pay.getDay()].slice(0, 3) + ' ' + U.fmtDateShort(n.pay) + '</div><div>About <b class="num">' + U.money(n.est) + '</b>, not your usual ' + U.money(n.usual) + '. ' +
      n.days.length + ' day' + (n.days.length > 1 ? 's' : '') + ' off (' + names + ') take about ' + U.money(n.per * n.days.length) + ' off' + (n.set ? '.' : ', split evenly across your workdays.') + '</div></div>');
  }

  Opus.daysOff = { isOff, set, list, sheet, topButton, todayLine, nextCheck, checkLine };
})();
