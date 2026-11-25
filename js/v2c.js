/* Opus V2 (prototype on 1.42): a way home from any depth, and pages for meals, bills and supplements. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h, V = Opus.v2;
  const esc = U.esc;

  /* ---------- home, from any depth: every sheet opened on top of another gets the arch beside its close button ---------- */
  function goHome() {
    let n = 0; while (ui.topSheet() && n++ < 20) ui.topSheet().close(true);
    Opus.go('today'); window.scrollTo(0, 0); ui.buzz(8);
  }
  const sheet0 = ui.sheet;
  ui.sheet = function (opts) {
    const deep = !!ui.topSheet(), api = sheet0(opts);
    if (deep) {
      const b = h('<button class="icon-btn v2-home" type="button" aria-label="Back to Today"><svg viewBox="0 0 24 24" aria-hidden="true">' + ui.I.today + '</svg></button>');
      b.onclick = goHome;
      const x = api.head.querySelector('[data-close]'); api.head.insertBefore(b, x);
    }
    return api;
  };

  const sec = (b, num, t, c) => { const s = h('<div class="sec"><div class="sh"><span class="r">' + num + '</span><span class="t">' + t + '</span><span class="c num">' + esc(c || '') + '</span></div><div class="card"></div></div>'); b.appendChild(s); return s.querySelector('.card'); };
  const row = (title, small, right, fn) => { const r = h('<div class="row' + (fn ? ' tap' : '') + '"><span class="tx"><b></b>' + (small ? '<small></small>' : '') + '</span>' + (right ? '<span class="tm num"></span>' : '') + (fn ? ui.icon('chev', 'chev ico') : '') + '</div>'); r.querySelector('b').textContent = title; if (small) r.querySelector('small').textContent = small; if (right) r.querySelector('.tm').textContent = right; if (fn) r.onclick = fn; return r; };
  const mac = m => m && m.kcal != null ? Math.round(m.kcal) + ' cal · ' + Math.round(m.protein || 0) + ' P · ' + Math.round(m.carbs || 0) + ' C · ' + Math.round(m.fat || 0) + ' F' : 'No numbers yet';

  /* ---------- a meal's page ---------- */
  function mealPage(id) {
    const m = Plan.meal(id); if (!m) return;
    ui.sheet({ title: m.name, kicker: 'Meal', full: true, render(api) {
      const b = api.body, x = Plan.macros(m);
      b.appendChild(h('<div class="stats"><div class="stat"><span class="v">' + (x && x.kcal != null ? Math.round(x.kcal) : '—') + '</span><span class="k">Calories</span></div><div class="stat"><span class="v">' + (x && x.protein != null ? Math.round(x.protein) + 'g' : '—') + '</span><span class="k">Protein</span></div><div class="stat"><span class="v">' + (m.slot ? m.slot[0].toUpperCase() + m.slot.slice(1) : '—') + '</span><span class="k">Slot</span></div></div>'));
      if (m.how) b.appendChild(h('<p class="lede" style="text-align:left;font-size:17px">' + esc(m.how) + '</p>'));
      const parts = Plan.partsOf(m);
      if (parts.length) { const c = sec(b, 'I', 'What’s in it', parts.length + (parts.length === 1 ? ' part' : ' parts')); for (const p of parts) c.appendChild(row(p.name, p.macros ? mac(p.macros) : '', U.num(p.amount, 1) + (p.unit ? ' ' + p.unit : ''))); }
      const log = (Store.data.eaten || []).filter(e => e.meal === id).sort((a, c2) => c2.date.localeCompare(a.date));
      const c = sec(b, parts.length ? 'II' : 'I', 'When it went differently', log.length ? String(log.length) : '');
      if (log.length) for (const e of log.slice(0, 12)) c.appendChild(row(U.DAY_NAMES[U.parseKey(e.date).getDay()] + ', ' + U.fmtDateShort(e.date), e.skipped ? 'Skipped' : 'Ate ' + mac(e.macros), '', () => V.dayPage(e.date)));
      else c.appendChild(h('<div class="row"><span class="tx"><small>Nothing logged against the plan for this meal. A tick with no changes means eaten as planned.</small></span></div>'));
      const rot = ((Plan.p.food || {}).rotation || {}).weeks || [], on = rot.filter(w => Object.values(w).includes(id)).map(w => w.name);
      b.appendChild(h('<p class="small" style="padding:0 4px">' + (on.length ? 'On the plan in ' + esc(on.join(', ')) + '.' : 'Not in the rotation right now.') + (x && x.estimate ? ' Numbers are estimates.' : '') + '</p>'));
    } });
  }

  /* ---------- a bill's page ---------- */
  function billPage(name) {
    const M = Plan.p.money || {}, bill = (M.bills || []).find(x => x.name === name); if (!bill) return;
    ui.sheet({ title: bill.name, kicker: bill.sub ? 'Subscription' : 'Bill', full: true, render(api) {
      const b = api.body, today = new Date();
      let next = null; if (bill.dueDay) { next = new Date(today.getFullYear(), today.getMonth(), Number(bill.dueDay)); if (U.key(next) < U.key(today)) next = new Date(today.getFullYear(), today.getMonth() + 1, Number(bill.dueDay)); }
      const perYear = bill.amount == null ? null : bill.every === 'week' ? bill.amount * 52 : bill.every === 'year' ? bill.amount : bill.amount * 12;
      b.appendChild(h('<div class="stats"><div class="stat"><span class="v">' + U.money(bill.amount, { cents: true }) + '</span><span class="k">Every ' + esc(bill.every || 'month') + '</span></div><div class="stat"><span class="v">' + (next ? U.fmtDateShort(next) : '—') + '</span><span class="k">Next due</span></div><div class="stat"><span class="v">' + (perYear == null ? '—' : U.money(perYear)) + '</span><span class="k">A year of it</span></div></div>'));
      const c1 = sec(b, 'I', 'Details', '');
      c1.appendChild(row('Comes out of', '', bill.account || 'Not set yet'));
      c1.appendChild(row('Due day', '', bill.dueDay ? 'the ' + bill.dueDay + (['th', 'st', 'nd', 'rd'][bill.dueDay % 10 > 3 || (bill.dueDay > 10 && bill.dueDay < 14) ? 0 : bill.dueDay % 10]) : 'Not set yet'));
      const debt = (M.debts || []).find(d => d.name === bill.name); if (debt) c1.appendChild(row('Also a debt', debt.balance != null ? 'Balance ' + U.money(debt.balance, { cents: true }) : '', ''));
      const key = String(bill.name).toLowerCase().split(/[ (]/)[0], paid = [];
      for (const w of ((Store.data.money || {}).weeks || [])) for (const x of (w.bills || [])) if (String(x.name).toLowerCase().startsWith(key)) paid.push({ week: w.weekEnding, amount: x.amount, name: x.name });
      paid.sort((a, c) => c.week.localeCompare(a.week));
      const c2 = sec(b, 'II', 'Times it came out', paid.length ? String(paid.length) : '');
      if (paid.length) for (const p of paid) c2.appendChild(row('Week ending ' + U.fmtDateShort(p.week), p.name !== bill.name ? p.name : '', U.money(p.amount, { cents: true })));
      else c2.appendChild(h('<div class="row"><span class="tx"><small>No money week has shown it yet.</small></span></div>'));
    } });
  }

  /* ---------- a supplement's page ---------- */
  function suppPage(id) {
    const s = (Opus.supps ? Opus.supps.list() : []).find(x => x.id === id); if (!s) return;
    ui.sheet({ title: s.name, kicker: 'Supplement', full: true, render(api) {
      const b = api.body, today = new Date(), taken = new Set((Store.data.supps || []).filter(x => x.supp === id).map(x => x.date));
      b.appendChild(h('<div class="stats"><div class="stat"><span class="v">' + esc(s.dose || '—') + '</span><span class="k">Dose</span></div><div class="stat"><span class="v">' + taken.size + '</span><span class="k">Days taken</span></div><div class="stat"><span class="v">' + (s.since ? U.fmtDateShort(s.since) : '—') + '</span><span class="k">Since</span></div></div>'));
      let dots = '<div class="v2-days v2-days14" role="img" aria-label="last 14 days">'; for (let i = 13; i >= 0; i--) { const k = U.key(U.addDays(today, -i)); dots += '<i class="' + (taken.has(k) ? 'on' : '') + '" title="' + k + '"></i>'; } dots += '</div>';
      const c0 = h('<div class="card pad"><div class="v2-cap" style="margin-bottom:8px">Last 14 days, today on the right</div>' + dots + '</div>'); b.appendChild(c0);
      const c1 = sec(b, 'I', 'Details', '');
      c1.appendChild(row('When', '', (s.part ? s.part[0].toUpperCase() + s.part.slice(1) : '—') + (s.time ? ' · ' + U.fmtTimeAP(s.time) : '')));
      if (s.note) c1.appendChild(row('Note', s.note, ''));
      if (s.confirm) c1.appendChild(row('Dose to confirm', 'Recorded from memory. Check it against the label or your prescriber.', ''));
      const facts = s.label && Array.isArray(s.label.facts) ? s.label.facts : [];
      if (facts.length) { const c2 = sec(b, 'II', 'On the label', s.label.serving || ''); for (const f of facts) c2.appendChild(row(f.name, '', f.amount + ' ' + f.unit + (f.dv != null ? ' · ' + f.dv + '%' : ''))); }
    } });
  }

  /* everything with a page, listed under the Annals */
  function pagesInto(b) {
    const rw = Plan.rotationWeek(new Date()), meals = rw ? ['breakfast', 'lunch', 'snack', 'dinner'].map(s => Plan.meal(rw.week[s])).filter(Boolean) : [];
    if (meals.length) { const c = sec(b, 'II', 'Meals', 'this week'); for (const m of meals) c.appendChild(row(m.name, mac(Plan.macros(m)), '', () => mealPage(m.id))); }
    const bills = ((Plan.p.money || {}).bills || []);
    if (bills.length) { const c = sec(b, 'III', 'Bills', String(bills.length)); for (const x of bills) c.appendChild(row(x.name, x.dueDay ? 'Due the ' + x.dueDay : 'No due day yet', U.money(x.amount, { cents: true }), () => billPage(x.name))); }
    const sp = Opus.supps ? Opus.supps.list().filter(x => x.active !== false) : [];
    if (sp.length) { const c = sec(b, 'IV', 'Supplements', String(sp.length)); for (const x of sp) c.appendChild(row(x.name, x.dose || 'Dose not set', x.part || '', () => suppPage(x.id))); }
  }
  Object.assign(V, { goHome, mealPage, billPage, suppPage, pagesInto });
})();
