/* Money tab: free cash right now (kept current by Grok), what comes out before payday, debts in payoff order with a debt-free date,
   the weekly plan, the check-in and Grok's weekly import. Everything entered here is saved in the logs (or the plan) for Grok to read. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const M = () => Plan.p.money || {};

  /* ---------- calculations ---------- */
  const perWeek = b => b.amount == null ? null : b.every === 'week' ? b.amount : b.every === 'year' ? b.amount / 52 : b.amount * 12 / 52;
  function weekEnding(d) {
    d = d || new Date();
    const pd = U.DAYS.indexOf(M().payday || 'fri');
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    while (x.getDay() !== pd) x.setDate(x.getDate() + 1);
    return x;
  }
  function weeks() { return (Store.data.money.weeks || []).slice().sort((a, b) => a.weekEnding.localeCompare(b.weekEnding)); }
  function weekSpent(w) { return U.sum((w.spent || []).map(s => s.amount)); }
  function calc() {
    const m = M();
    const lastPay = weeks().filter(w => w.paycheck != null).pop() || null; // the most recent paycheck is the take-home
    const take = lastPay ? lastPay.paycheck : m.takeHomePerWeek;
    const bills = (m.bills || []).map(b => perWeek(b));
    const billsW = U.sum(bills.filter(x => x != null)), billsMissing = bills.some(x => x == null);
    let debtW = m.plannedDebtPerWeek;
    let debtSrc = 'plan';
    if (debtW == null) { const mins = (m.debts || []).map(d => d.minMonthly).filter(x => x != null); if (mins.length) { debtW = U.sum(mins) * 12 / 52; debtSrc = 'minimums'; } }
    const ws = weeks().slice(-4);
    let spendLo, spendHi, spendSrc;
    if (ws.length) { spendLo = spendHi = U.avg(ws.map(weekSpent)); spendSrc = 'Average of your last ' + ws.length + ' week' + (ws.length > 1 ? 's' : ''); }
    else { const b = (Plan.p.food || {}).budgetPerWeek || {}; spendLo = b.low; spendHi = b.high != null ? b.high : b.low; spendSrc = spendLo != null ? 'Grocery budget until check-ins come in' : null; }
    const base = take == null ? null : take - billsW - (debtW || 0);
    const free = base == null || spendLo == null ? null : { lo: base - spendHi, hi: base - spendLo };
    const we = U.key(weekEnding());
    const cur = (Store.data.money.weeks || []).find(w => w.weekEnding === we);
    const left = base == null ? null : base - (cur ? weekSpent(cur) : 0);
    return { take, lastPay, billsW, billsMissing, debtW, debtSrc, spendLo, spendHi, spendSrc, free, cur, left, we };
  }
  function debtFree() {
    const m = M(), ds = (m.debts || []);
    if (!ds.length) return { msg: 'No debts listed.' };
    const missing = ds.filter(d => d.balance == null).map(d => d.name);
    if (missing.length) return { msg: 'Add the balance for ' + missing.join(', ') + ' to see your debt-free date.' };
    const total = U.sum(ds.map(d => d.balance)); if (total <= 0) return { msg: 'Debt-free. Every balance is zero.', done: true };
    const c = calc(); const budget = c.debtW;
    if (!budget) return { msg: 'Set how much goes to debt each week to see your debt-free date.' };
    const monthly = budget * 52 / 12;
    const bal = ds.map(d => d.balance), apr = ds.map(d => (d.apr || 0) / 100 / 12), min = ds.map(d => d.minMonthly || 0);
    let months = 0;
    while (bal.some(b => b > 0.005) && months < 600) {
      months++;
      for (let i = 0; i < bal.length; i++) if (bal[i] > 0) bal[i] += bal[i] * apr[i];
      let pot = monthly;
      for (let i = 0; i < bal.length; i++) if (bal[i] > 0) { const p = Math.min(bal[i], min[i], pot); bal[i] -= p; pot -= p; }
      for (let i = 0; i < bal.length && pot > 0; i++) if (bal[i] > 0) { const p = Math.min(bal[i], pot); bal[i] -= p; pot -= p; }
      if (months === 1 && U.sum(bal) >= total) return { msg: 'At ' + U.money(budget) + ' a week, interest outpaces payments. Raise the weekly debt amount.' };
    }
    if (months >= 600) return { msg: 'At this pace it takes more than 50 years.' };
    const dt = new Date(); dt.setMonth(dt.getMonth() + months);
    const noApr = ds.some(d => d.apr == null);
    return { date: dt, months, msg: 'Debt-free around ' + U.MONTHS[dt.getMonth()] + ' ' + dt.getFullYear() + ' at ' + U.money(budget) + ' a week' + (noApr ? ', not counting interest on debts with no rate set' : '') + '.' };
  }
  function debtHistory() {
    return (Store.data.money.balances || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map(s => ({ date: s.date, v: U.sum(Object.values(s.debts || {})) }));
  }
  /* ---------- cash on hand (money.cash in the logs): Grok writes it from the accounts, or you enter it ---------- */
  const cashList = () => (Store.data.money.cash || []).slice().sort((a, b) => (a.date + (a.at || '')).localeCompare(b.date + (b.at || '')));
  const latestCash = () => { const l = cashList(); return l[l.length - 1] || null; };
  const heldOf = c => (Array.isArray(c && c.held) ? c.held : []).filter(x => x && typeof x.amount === 'number');
  function freeOf(c) {
    if (!c) return null;
    if (typeof c.free === 'number') return c.free;
    if (typeof c.cash === 'number') return c.cash - U.sum(heldOf(c).map(x => x.amount));
    return null;
  }
  function nextPayday(d) {
    d = d || new Date();
    const pd = U.DAYS.indexOf(M().payday || 'fri');
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    while (x.getDay() !== pd) x.setDate(x.getDate() + 1);
    return x; // today, if today is payday
  }
  function whenAt(c) {
    const t = c.at ? new Date(c.at) : null;
    if (!t || isNaN(t)) return U.daysBetween(U.parseKey(c.date), new Date()) === 0 ? 'today' : U.fmtDateShort(c.date);
    const days = U.daysBetween(t, new Date()), hm = U.fmtTimeAP(U.pad(t.getHours()) + ':' + U.pad(t.getMinutes()));
    if (days === 0) { const mins = Math.round((Date.now() - t.getTime()) / 60000); return mins < 2 ? 'just now' : mins < 60 ? mins + ' min ago' : 'today ' + hm; }
    return (days === 1 ? 'yesterday' : days < 7 ? U.DAY_NAMES[t.getDay()] : U.fmtDateShort(t)) + ' ' + hm;
  }
  const ageHours = c => { const t = c && c.at ? new Date(c.at).getTime() : c ? U.parseKey(c.date).getTime() + 12 * 36e5 : 0; return (Date.now() - t) / 36e5; };
  const ASK_GROK = 'Update my cash on hand in Opus: read my accounts, then add a money.cash entry for today with my cash and everything that has to come out before payday.';

  function snapshotBalances(date) {
    const debts = {}; for (const d of (M().debts || [])) if (d.balance != null) debts[d.name] = d.balance;
    const arr = Store.data.money.balances = (Store.data.money.balances || []).filter(s => s.date !== date);
    if (Object.keys(debts).length) arr.push({ date, debts });
  }

  /* ---------- the weekly import format (from Grok) ---------- */
  const amt = s => { const v = parseFloat(String(s).replace(/[$,\s]/g, '')); return isNaN(v) ? null : v; };
  function parseWeek(text) {
    const errors = [], warnings = [];
    text = String(text || '').trim();
    const out = { weekEnding: null, paycheck: null, spent: [], bills: [], debtPayments: [], balances: [], notes: [], source: 'import' };
    if (!text) return { ok: false, errors: ['Paste the block from Grok first.'], warnings };
    if (text[0] === '{') {
      try {
        const j = JSON.parse(text);
        if (j.format !== 'opus-money-week') errors.push('JSON must have "format": "opus-money-week".');
        Object.assign(out, { weekEnding: j.week_ending || j.weekEnding, paycheck: j.paycheck == null ? null : Number(j.paycheck) });
        (j.spent || []).forEach(s => out.spent.push({ cat: String(s.category || s.cat || 'other').toLowerCase(), amount: Number(s.amount) }));
        (j.bills || []).forEach(s => out.bills.push({ name: s.name, amount: Number(s.amount) }));
        (j.debt_payments || j.debtPayments || []).forEach(s => out.debtPayments.push({ name: s.name, amount: Number(s.amount) }));
        (j.balances || []).forEach(s => out.balances.push({ name: s.name, amount: Number(s.balance != null ? s.balance : s.amount) }));
        if (j.note) out.notes.push(String(j.note));
      } catch (e) { return { ok: false, errors: ['That looks like JSON but does not parse: ' + e.message], warnings }; }
    } else {
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (!/^OPUS MONEY WEEK/i.test(lines[0])) warnings.push('First line should be OPUS MONEY WEEK. Reading it anyway.');
      lines.forEach((l, i) => {
        if (/^OPUS MONEY WEEK/i.test(l) || /^END$/i.test(l)) return;
        const m = l.match(/^([a-z_ ]+):\s*(.*)$/i);
        if (!m) { warnings.push('Line ' + (i + 1) + ' skipped: "' + l + '"'); return; }
        const k = m[1].trim().toLowerCase().replace(/\s+/g, '_'), rest = m[2].trim();
        const la = rest.match(/^(.*?)[\s:=]+(-?\$?[\d,]+(?:\.\d+)?)$/);
        switch (k) {
          case 'week_ending': out.weekEnding = rest; break;
          case 'paycheck': case 'pay': out.paycheck = amt(rest); if (out.paycheck == null) errors.push('paycheck must be a number.'); break;
          case 'spent': case 'spend':
            if (!la) errors.push('Line ' + (i + 1) + ': write spent as "spent: groceries 124.50".'); else out.spent.push({ cat: la[1].trim().toLowerCase() || 'other', amount: amt(la[2]) }); break;
          case 'bill': if (!la) errors.push('Line ' + (i + 1) + ': write bill as "bill: car insurance 151.00".'); else out.bills.push({ name: la[1].trim(), amount: amt(la[2]) }); break;
          case 'debt_payment': case 'debt': if (!la) errors.push('Line ' + (i + 1) + ': write it as "debt_payment: credit card 50.00".'); else out.debtPayments.push({ name: la[1].trim(), amount: amt(la[2]) }); break;
          case 'balance': if (!la) errors.push('Line ' + (i + 1) + ': write it as "balance: credit card 1234.56".'); else out.balances.push({ name: la[1].trim(), amount: amt(la[2]) }); break;
          case 'note': out.notes.push(rest); break;
          default: warnings.push('Unknown line "' + k + '" skipped.');
        }
      });
    }
    if (!out.weekEnding || !/^\d{4}-\d{2}-\d{2}$/.test(out.weekEnding)) errors.push('week_ending must be a date like 2026-11-27.');
    [...out.spent, ...out.bills, ...out.debtPayments, ...out.balances].forEach(x => { if (x.amount == null || isNaN(x.amount)) errors.push('An amount is missing or not a number.'); else if (x.amount < 0) errors.push('Amounts should not be negative (' + (x.cat || x.name) + ').'); });
    const names = (M().debts || []).map(d => d.name.toLowerCase());
    out.balances.forEach(b => { if (!names.includes(String(b.name).toLowerCase())) warnings.push('No debt named "' + b.name + '" in your plan, so that balance will not be used.'); });
    return { ok: errors.length === 0, errors: [...new Set(errors)], warnings, week: out };
  }
  function saveWeek(w) {
    Store.data.money.weeks = (Store.data.money.weeks || []).filter(x => x.weekEnding !== w.weekEnding).concat([Object.assign({ saved: new Date().toISOString() }, w)]);
    const ds = M().debts || [];
    for (const b of (w.balances || [])) { const d = ds.find(x => x.name.toLowerCase() === String(b.name).toLowerCase()); if (d) d.balance = b.amount; }
    if ((w.balances || []).length) snapshotBalances(w.weekEnding);
    const d = new Date(); if (M().checkInDay === U.dayKey(d)) Plan.setChecked(d, 'money-checkin', true);
    Store.save();
  }
  const TEMPLATE = 'OPUS MONEY WEEK\nweek_ending: 2026-11-27\npaycheck: 650.00\nspent: groceries 0.00\nspent: gas 0.00\nspent: eating out 0.00\nspent: other 0.00\nbill: car insurance 0.00\ndebt_payment: credit card 0.00\nbalance: credit card 0.00\nnote: optional, one line\nEND';
  function grokPrompt() {
    const ds = (M().debts || []).map(d => d.name).join(', ');
    return 'Each Friday, give me my week in this exact format so I can paste it into my Opus app. One item per line. Amounts are plain numbers in dollars. week_ending is the Friday date (YYYY-MM-DD). "spent" is everyday spending by category, not counting bills or debt payments. "bill" is a bill paid this week. "debt_payment" is money paid toward a debt. "balance" is the current balance of a debt; use these debt names exactly: ' + ds + '. Leave out any line you do not know rather than guessing.\n\n' + TEMPLATE;
  }

  function previewBlock(res) {
    const w = res.week; const box = h('<div style="display:flex;flex-direction:column;gap:10px"></div>');
    if (res.errors.length) box.appendChild(h('<div class="banner">' + res.errors.map(U.esc).join('<br>') + '</div>'));
    if (res.warnings.length) box.appendChild(h('<div class="banner gold">' + res.warnings.map(U.esc).join('<br>') + '</div>'));
    if (w && res.ok) {
      const c = h('<div class="card"></div>');
      const kv = (k, v) => c.appendChild(h('<div class="kv"><span>' + U.esc(k) + '</span><span class="num">' + v + '</span></div>'));
      kv('Week ending', U.esc(U.fmtDateShort(w.weekEnding)));
      if (w.paycheck != null) kv('Paycheck', U.money(w.paycheck, { cents: true }));
      w.spent.forEach(s => kv('Spent · ' + s.cat, U.money(s.amount, { cents: true })));
      if (w.spent.length) kv('Spent total', '<b>' + U.money(weekSpent(w), { cents: true }) + '</b>');
      w.bills.forEach(s => kv('Bill · ' + s.name, U.money(s.amount, { cents: true })));
      w.debtPayments.forEach(s => kv('Debt payment · ' + s.name, U.money(s.amount, { cents: true })));
      w.balances.forEach(s => kv('Balance · ' + s.name, U.money(s.amount, { cents: true })));
      box.appendChild(c);
    }
    return box;
  }
  function importBox(onSaved) {
    const wrap = h('<div style="display:flex;flex-direction:column;gap:10px"></div>');
    const ta = h('<textarea class="input mono" id="money-import" rows="8" placeholder="Paste the OPUS MONEY WEEK block from Grok"></textarea>');
    const out = h('<div></div>');
    const btns = h('<div class="btns"><button class="btn quiet" type="button">Copy format for Grok</button><button class="btn" type="button">Preview</button></div>');
    let parsed = null;
    btns.children[0].onclick = () => ui.copy(grokPrompt());
    btns.children[1].onclick = () => {
      parsed = parseWeek(ta.value); out.innerHTML = ''; out.appendChild(previewBlock(parsed));
      if (parsed.ok) {
        const exists = (Store.data.money.weeks || []).some(x => x.weekEnding === parsed.week.weekEnding);
        const sv = h('<button class="btn block" type="button" style="margin-top:10px">' + (exists ? 'Replace that week' : 'Save this week') + '</button>');
        sv.onclick = () => { parsed.week.source = 'grok'; saveWeek(parsed.week); ui.toast('Week saved'); ta.value = ''; out.innerHTML = ''; onSaved && onSaved(); };
        out.appendChild(sv);
      }
    };
    wrap.appendChild(ta); wrap.appendChild(btns); wrap.appendChild(out);
    return wrap;
  }

  /* ---------- the Friday check-in ---------- */
  function checkIn() {
    ui.sheet({ title: 'Money check-in', kicker: 'Week ending ' + U.fmtDateShort(weekEnding()), full: true, onClose: () => Opus.refresh(), render(api) {
      const b = api.body, c = calc();
      b.appendChild(h('<p class="note">Three steps: bring in the week from Grok, look over your week, update a balance if it changed. If Grok already logged the week, it shows here.</p>'));
      b.appendChild(h('<div class="sh"><span class="r">I</span><span class="t">This week from Grok</span></div>'));
      if (c.cur) b.appendChild(h('<div class="banner gold">This week is already in (' + U.money(weekSpent(c.cur), { cents: true }) + ' spent). Paste again to replace it.</div>'));
      b.appendChild(importBox(() => api.rerender()));
      const man = h('<details class="fold"><summary class="link">Or enter it by hand</summary><div style="display:flex;flex-direction:column;gap:10px;margin-top:10px"></div></details>');
      const mb = man.querySelector('div');
      mb.appendChild(h('<div class="grid2"><div class="field"><label for="mi-pay">Paycheck</label><input class="input" id="mi-pay" inputmode="decimal"></div><div class="field"><label for="mi-spent">Spent this week</label><input class="input" id="mi-spent" inputmode="decimal"></div></div>'));
      const ms = h('<button class="btn quiet" type="button">Save by hand</button>');
      ms.onclick = () => {
        const pay = amt(mb.querySelector('#mi-pay').value), sp = amt(mb.querySelector('#mi-spent').value);
        if (sp == null && pay == null) { ui.toast('Enter at least one number'); return; }
        const prev = c.cur || {};
        saveWeek({ weekEnding: c.we, paycheck: pay != null ? pay : prev.paycheck ?? null, spent: sp != null ? [{ cat: 'everyday', amount: sp }] : (prev.spent || []), bills: prev.bills || [], debtPayments: prev.debtPayments || [], balances: [], notes: [], source: 'manual' });
        ui.toast('Week saved'); api.rerender();
      };
      mb.appendChild(ms); b.appendChild(man);
      b.appendChild(h('<div class="sh"><span class="r">II</span><span class="t">Your week</span></div>'));
      b.appendChild(freeCard(calc()));
      b.appendChild(h('<div class="sh"><span class="r">III</span><span class="t">Debts</span></div>'));
      b.appendChild(debtCard(() => api.rerender()));
      const done = h('<button class="btn block" type="button">Done</button>');
      done.onclick = () => { const d = new Date(); if (M().checkInDay === U.dayKey(d)) Plan.setChecked(d, 'money-checkin', true); Store.save(); api.close(); Opus.todayRefresh && Opus.todayRefresh(); };
      b.appendChild(done);
    } });
  }

  function freeCard(c) {
    const card = h('<div class="card pad" style="display:flex;flex-direction:column;gap:6px"></div>');
    const fv = c.free ? (Math.round(c.free.lo) === Math.round(c.free.hi) ? U.money(c.free.lo) : U.money(c.free.lo) + '–' + U.money(c.free.hi).replace('$', '')) : '—';
    card.appendChild(h('<div class="figure"><div class="v">' + fv + '</div><div class="k">Left over a week</div><div class="sub">' + (c.free ? 'Your plan on an average week. It sharpens with each check-in.' : 'Fill in the blanks below to see it.') + '</div></div>'));
    if (c.left != null && c.cur) {
      const base = c.take - c.billsW - (c.debtW || 0);
      const pct = base > 0 ? U.clamp(c.left / base, 0, 1) : 0;
      card.appendChild(h('<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px"><div class="kv" style="border:0;padding:0"><span>Left this week</span><span class="num ' + (c.left < 0 ? 'warn' : '') + '">' + U.money(c.left) + '</span></div><div class="bar"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></div></div>'));
    }
    const rows = h('<div style="margin-top:8px"></div>');
    const kv = (k, v, cls) => rows.appendChild(h('<div class="kv ' + (cls || '') + '"><span>' + k + '</span><span class="num">' + v + '</span></div>'));
    kv(c.lastPay ? 'Take-home (paycheck, week ending ' + U.fmtDateShort(c.lastPay.weekEnding) + ')' : 'Take-home (until a paycheck is logged)', c.take == null ? '<span class="muted">not set</span>' : U.money(c.take, { cents: !!c.lastPay }));
    kv('Bills, weekly share', '− ' + U.money(c.billsW) + (c.billsMissing ? ' <span class="muted">+ blanks</span>' : ''));
    kv('Debt plan', c.debtW == null ? '<span class="muted">not set</span>' : '− ' + U.money(c.debtW) + (c.debtSrc === 'minimums' ? ' <span class="muted">(minimums)</span>' : ''));
    kv('Normal spending', c.spendLo == null ? '<span class="muted">no data yet</span>' : '− ' + (c.spendLo === c.spendHi ? U.money(c.spendLo) : U.money(c.spendLo) + '–' + U.money(c.spendHi).replace('$', '')));
    if (c.spendSrc) rows.appendChild(h('<div class="small" style="text-align:right;margin-top:-4px">' + U.esc(c.spendSrc) + '</div>'));
    kv('Left over', fv, 'total');
    card.appendChild(rows);
    return card;
  }

  /* what's yours this week: free cash (bills before payday already out) minus food until payday and this week's planned debt payment */
  function thisWeek() {
    const m = M(), c = latestCash(), free = freeOf(c);
    const pay = nextPayday(), d0 = U.daysBetween(new Date(), pay), days = d0 > 0 ? d0 : 7;
    const fb = (Plan.p.food || {}).budgetPerWeek || {}, foodW = fb.high != null ? fb.high : fb.low;
    const food = foodW == null ? null : Math.round(foodW * days / 7);
    const we = U.key(pay), cur = (Store.data.money.weeks || []).find(w => w.weekEnding === we);
    const paid = cur ? U.sum((cur.debtPayments || []).map(x => x.amount)) : 0;
    const inHeld = heldOf(c).some(x => /\bdebt\b/i.test(x.name || '')); // Grok already held this week's debt payment back
    const debt = m.plannedDebtPerWeek == null || inHeld ? null : Math.max(0, m.plannedDebtPerWeek - paid);
    const yours = free == null ? null : free - (food || 0) - (debt || 0);
    const cash = c && typeof c.cash === 'number' ? c.cash : null;
    return { c, free, cash, pay, days, payToday: d0 === 0, foodW, food, debt, paid, yours };
  }
  function weekCard() {
    const t = thisWeek(), m = M();
    const card = h('<div class="card pad" style="display:flex;flex-direction:column;gap:6px"></div>');
    if (t.yours == null) {
      card.appendChild(h('<div class="figure"><div class="v">—</div><div class="k">Yours this week</div><div class="sub">This needs your cash on hand. Grok adds it when it reads your accounts, or tap Free cash at the top to enter it.</div></div>'));
      return card;
    }
    const v = Math.floor(t.yours), short = v < 0;
    const until = t.payToday ? 'until next payday' : 'until payday ' + U.DAY_NAMES[t.pay.getDay()];
    card.appendChild(h('<div class="figure"><div class="v num"' + (short ? ' style="color:var(--warn);background:none;-webkit-text-fill-color:currentColor"' : '') + '>' + (short ? '−' + U.money(-v) : U.money(v)) + '</div><div class="k">Yours this week</div><div class="sub">' +
      (short ? 'Short ' + until + '. Hold off on extras.' : 'Spend it on anything, or put extra on debt. It covers you ' + until + '.') + '</div></div>'));
    if (!short && t.days > 1) card.appendChild(h('<div class="fc-chips" style="margin-top:2px"><span>about ' + U.money(t.yours / t.days) + ' a day</span><span>' + t.days + ' days left</span></div>'));
    const rows = h('<div style="margin-top:8px"></div>');
    const kv = (k, val, cls) => rows.appendChild(h('<div class="kv ' + (cls || '') + '"><span>' + k + '</span><span class="num">' + val + '</span></div>'));
    kv('Free cash <span class="muted">· ' + U.esc(whenAt(t.c)) + '</span>', U.money(t.free, { cents: true }));
    if (t.food != null) kv('Food ' + (t.days === 1 ? 'for 1 day' : 'for ' + t.days + ' days'), '− ' + U.money(t.food));
    if (t.debt != null) kv(t.paid ? 'Rest of this week’s debt payment' : 'This week’s debt payment', t.debt ? '− ' + U.money(t.debt) : '<span class="muted">sent</span>');
    kv('Yours this week', short ? '−' + U.money(-v) : U.money(v), 'total');
    rows.appendChild(h('<div class="small" style="margin-top:6px">Bills due before payday are already out of free cash.' + (t.foodW != null ? ' Food uses the top of your ' + U.money(t.foodW) + ' weekly budget.' : '') + '</div>'));
    card.appendChild(rows);
    // your rule: extra debt payments wait for the cushion
    if (m.cushion != null && t.cash != null && !short) {
      const first = (m.debts || []).find(d => d.balance == null || d.balance > 0);
      const gap = m.cushion - t.cash;
      card.appendChild(h('<div class="g-take" style="margin-top:8px"><div class="tag">Extra on debt</div><div>' + (gap > 0
        ? 'Your rule keeps a ' + U.money(m.cushion) + ' cushion first. Cash is ' + U.money(gap) + ' short of it, so extra debt payments wait for now.'
        : 'Cash is above your ' + U.money(m.cushion) + ' cushion, so up to ' + U.money(Math.min(v, t.cash - m.cushion)) + ' can go to extra debt' + (first ? ', starting with ' + U.esc(first.name) : '') + '.') + '</div></div>'));
    }
    const avg = calc().free;
    if (avg) {
      const f = h('<button class="link" type="button" style="align-self:center;margin-top:6px">Average week from your plan: ' + (Math.round(avg.lo) === Math.round(avg.hi) ? U.money(avg.lo) : U.money(avg.lo) + '–' + U.money(avg.hi).replace('$', '')) + '</button>');
      f.onclick = () => ui.sheet({ title: 'Average week', kicker: 'Your plan', render(api) { api.body.appendChild(freeCard(calc())); } });
      card.appendChild(f);
    }
    return card;
  }

  function debtCard(onChange) {
    const m = M(), ds = m.debts || [];
    const card = h('<div class="card"></div>');
    const firsts = {}; (Store.data.money.balances || []).slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(s => { for (const [k, v] of Object.entries(s.debts || {})) if (firsts[k] == null) firsts[k] = v; });
    if (!ds.length) card.appendChild(h('<p class="empty">No debts in your plan.</p>'));
    ds.forEach((d, i) => {
      const first = firsts[d.name];
      const paid = first && d.balance != null && first > 0 ? U.clamp(1 - d.balance / first, 0, 1) : null;
      const isFocus = ds.findIndex(x => x.balance == null || x.balance > 0) === i;
      const r = h('<div class="row tap" style="flex-wrap:wrap;row-gap:8px"><span class="tag" style="min-width:26px">' + U.roman(i + 1) + '</span><span class="tx"><b>' + U.esc(d.name) + (isFocus ? ' <span class="tag" style="margin-left:6px">Focus</span>' : '') + '</b><small>' +
        [d.apr != null ? d.apr + '% APR' : null, d.minMonthly != null ? U.money(d.minMonthly) + '/mo min' : null].filter(Boolean).join(' · ') + '</small></span>' +
        '<span class="num" style="font-weight:600;' + (d.balance == null ? 'color:var(--gold);font-weight:500;font-size:13px' : '') + '">' + (d.balance == null ? 'Add balance' : d.balance === 0 ? 'Paid off' : U.money(d.balance)) + '</span>' +
        (paid != null ? '<div class="bar" style="flex-basis:100%;margin-left:40px"><i style="width:' + (paid * 100).toFixed(1) + '%"></i></div>' : '') + '</div>');
      r.onclick = () => editDebt(i, onChange);
      card.appendChild(r);
    });
    const df = debtFree();
    card.appendChild(h('<div class="row"><span class="tx"><small style="font-size:13.5px;color:' + (df.date ? 'var(--gold-2)' : 'var(--dim)') + '">' + U.esc(df.msg) + '</small></span></div>'));
    return card;
  }
  function numField(id, label, val) { return '<div class="field"><label for="' + id + '">' + label + '</label><input class="input" id="' + id + '" inputmode="decimal" value="' + (val == null ? '' : val) + '" placeholder="blank"></div>'; }
  function editDebt(i, onChange) {
    const d = M().debts[i];
    ui.sheet({ title: d.name, kicker: 'Payoff order ' + U.roman(i + 1), render(api) {
      api.body.appendChild(h('<div style="display:flex;flex-direction:column;gap:12px">' + numField('db-bal', 'Balance now', d.balance) + '<div class="grid2">' + numField('db-apr', 'APR %', d.apr) + numField('db-min', 'Minimum a month', d.minMonthly) + '</div></div>'));
      api.body.appendChild(h('<p class="small">Leave a field blank if you don’t know it yet.</p>'));
      const sv = h('<button class="btn block" type="button">Save</button>');
      sv.onclick = () => {
        const g = id => { const v = api.body.querySelector(id).value.trim(); return v === '' ? null : amt(v); };
        const bal = g('#db-bal'); const changed = bal !== d.balance;
        d.balance = bal; d.apr = g('#db-apr'); d.minMonthly = g('#db-min');
        if (changed) snapshotBalances(U.key());
        Store.save(); api.close(); ui.toast('Saved'); onChange && onChange();
      };
      api.body.appendChild(sv);
    } });
  }
  function editNumbers(onChange) {
    const m = M();
    ui.sheet({ title: 'Money numbers', kicker: 'Your plan', render(api) {
      const b = api.body;
      b.appendChild(h('<div class="grid2">' + numField('mn-take', 'Take-home until a paycheck is logged', m.takeHomePerWeek) + numField('mn-debt', 'To debt a week', m.plannedDebtPerWeek) + numField('mn-cush', 'Cushion before extra debt', m.cushion) + '</div>'));
      const bills = h('<div class="card"></div>');
      (m.bills || []).forEach((bl, i) => bills.appendChild(h('<div class="row"><span class="tx"><b>' + U.esc(bl.name) + '</b><small>per ' + (bl.every || 'month') + '</small></span><input class="input" style="width:110px" id="mn-bill-' + i + '" inputmode="decimal" value="' + (bl.amount == null ? '' : bl.amount) + '" placeholder="blank"></div>')));
      b.appendChild(h('<div class="sh"><span class="t">Bills</span></div>')); b.appendChild(bills);
      b.appendChild(h('<p class="small">Add or rename bills in your plan file. Blank means unknown; nothing is guessed.</p>'));
      const sv = h('<button class="btn block" type="button">Save</button>');
      sv.onclick = () => {
        const g = id => { const v = b.querySelector(id).value.trim(); return v === '' ? null : amt(v); };
        m.takeHomePerWeek = g('#mn-take'); m.plannedDebtPerWeek = g('#mn-debt'); m.cushion = g('#mn-cush');
        (m.bills || []).forEach((bl, i) => { bl.amount = g('#mn-bill-' + i); });
        Store.save(); api.close(); ui.toast('Saved'); onChange && onChange();
      };
      b.appendChild(sv);
    } });
  }

  /* ---------- free cash, right now ---------- */
  function cashHero() {
    const c = latestCash(), free = freeOf(c), pay = nextPayday(), days = U.daysBetween(new Date(), pay);
    const el = h('<div class="fc' + (c ? '' : ' none') + (free != null && free < 0 ? ' short' : '') + '" role="button" tabindex="0"></div>');
    if (!c || free == null) {
      el.innerHTML = '<div class="fc-k">Free cash</div><div class="fc-v wait">—</div>' +
        '<div class="fc-s">Grok fills this in from your accounts: the cash you can use that isn’t needed for bills or anything else before payday.</div>' +
        '<div class="fc-acts"><button class="g-act" type="button" data-ask>' + ui.icon('spark') + '<span>Copy ask for Grok</span></button><button class="g-act" type="button" data-hand><span>Enter it myself</span></button></div>';
      el.querySelector('[data-ask]').onclick = e => { e.stopPropagation(); ui.copy(ASK_GROK); };
      el.querySelector('[data-hand]').onclick = e => { e.stopPropagation(); updateCash(); };
      el.onclick = null; el.removeAttribute('role'); el.removeAttribute('tabindex');
      return el;
    }
    const stale = ageHours(c) > 36, held = heldOf(c);
    const perDay = days > 0 && free > 0 ? free / days : null;
    const payLine = days === 0 ? 'Payday today' : 'Payday ' + U.DAY_NAMES[pay.getDay()] + ' · ' + days + (days === 1 ? ' day' : ' days');
    const hist = cashList().map(x => ({ date: x.date, v: freeOf(x) })).filter(x => x.v != null).slice(-30);
    el.innerHTML = '<div class="fc-k">Free cash</div>' +
      '<div class="fc-v num">' + U.money(free) + '</div>' +
      '<div class="fc-s">' + (free < 0 ? 'Short by ' + U.money(-free) + ' before payday' : 'Yours to use until payday') + '</div>' +
      '<div class="fc-chips"><span>' + U.esc(payLine) + '</span>' + (perDay != null ? '<span>about ' + U.money(perDay) + ' a day</span>' : '') + (held.length ? '<span>' + U.money(U.sum(held.map(x => x.amount))) + ' held back</span>' : '') + '</div>' +
      (hist.length > 2 ? '<div class="fc-spark" aria-hidden="true">' + ui.spark(hist, { w: 240, h: 34 }) + '</div>' : '') +
      '<div class="fc-from' + (stale ? ' stale' : '') + '"><i></i>' + (c.by === 'grok' ? 'From Grok' : 'You entered it') + ' · ' + U.esc(whenAt(c)) + (stale ? ' · may be out of date' : '') + '</div>' +
      (stale ? '<div class="fc-acts"><button class="g-act" type="button" data-ask>' + ui.icon('spark') + '<span>Copy ask for Grok</span></button></div>' : '');
    const ask = el.querySelector('[data-ask]'); if (ask) ask.onclick = e => { e.stopPropagation(); ui.copy(ASK_GROK); };
    el.onclick = () => cashSheet();
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cashSheet(); } };
    return el;
  }

  function cashSheet() {
    const c = latestCash(); if (!c) { updateCash(); return; }
    ui.sheet({ title: 'Free cash', kicker: (c.by === 'grok' ? 'From Grok · ' : 'You entered it · ') + whenAt(c), render(api) {
      const b = api.body, free = freeOf(c), held = heldOf(c).slice().sort((x, y) => String(x.due || '9').localeCompare(String(y.due || '9')));
      const card = h('<div class="card"></div>');
      const kv = (k, v, cls) => card.appendChild(h('<div class="kv ' + (cls || '') + '"><span>' + k + '</span><span class="num">' + v + '</span></div>'));
      (Array.isArray(c.accounts) ? c.accounts : []).forEach(a => kv(U.esc(a.name || 'Account'), U.money(a.amount, { cents: true })));
      if (typeof c.cash === 'number') kv('<b>' + (Array.isArray(c.accounts) && c.accounts.length ? 'Total cash' : 'Cash') + '</b>', '<b>' + U.money(c.cash, { cents: true }) + '</b>');
      held.forEach(x => kv(U.esc(x.name || 'Held back') + (x.due ? ' <span class="muted">· ' + U.esc(dueLabel(x.due)) + '</span>' : ''), '− ' + U.money(x.amount, { cents: true })));
      kv('Free cash', U.money(free, { cents: true }), 'total');
      b.appendChild(card);
      if (typeof c.free === 'number' && typeof c.cash === 'number' && Math.abs(c.cash - U.sum(held.map(x => x.amount)) - c.free) > 1) b.appendChild(h('<p class="small">Grok’s free cash differs from cash minus what’s listed by ' + U.money(Math.abs(c.cash - U.sum(held.map(x => x.amount)) - c.free)) + '. Ask Grok what else it held back.</p>'));
      if (c.note) b.appendChild(h('<div class="g-take"><div class="tag">' + (c.by === 'grok' ? 'Grok’s note' : 'Your note') + '</div><div>' + U.esc(c.note) + '</div></div>'));
      const past = cashList().reverse().slice(1, 8);
      if (past.length) {
        b.appendChild(h('<div class="sh" style="margin-top:6px"><span class="t">Earlier</span></div>'));
        const pc = h('<div class="card"></div>');
        past.forEach(x => pc.appendChild(h('<div class="kv"><span>' + U.esc(U.DAY_NAMES[U.parseKey(x.date).getDay()].slice(0, 3) + ', ' + U.fmtDateShort(x.date)) + ' <span class="muted">· ' + (x.by === 'grok' ? 'Grok' : 'you') + '</span></span><span class="num">' + U.money(freeOf(x)) + '</span></div>')));
        b.appendChild(pc);
      }
      const btns = h('<div class="btns"><button class="btn quiet" type="button">Copy ask for Grok</button><button class="btn" type="button">Update it myself</button></div>');
      btns.children[0].onclick = () => ui.copy(ASK_GROK);
      btns.children[1].onclick = () => { api.close(true); updateCash(); };
      b.appendChild(btns);
    } });
  }
  function dueLabel(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(k))) return String(k);
    const n = U.daysBetween(new Date(), U.parseKey(k));
    return n < 0 ? 'was due ' + U.fmtDateShort(k) : n === 0 ? 'due today' : n === 1 ? 'due tomorrow' : n < 7 ? 'due ' + U.DAY_NAMES[U.parseKey(k).getDay()] : 'due ' + U.fmtDateShort(k);
  }

  /* enter cash by hand: what's held back carries over from the last reading, minus anything already past due */
  function updateCash() {
    const last = latestCash(), today = U.key();
    let held = heldOf(last).filter(x => !x.due || !/^\d{4}-\d{2}-\d{2}$/.test(x.due) || x.due >= today).map(x => Object.assign({}, x));
    ui.sheet({ title: 'Cash on hand', kicker: 'Update it yourself', foot: true, render(api) {
      const b = api.body;
      b.appendChild(h('<div class="field"><label for="cash-now">Cash you have now</label><input class="input" id="cash-now" inputmode="decimal" placeholder="checking plus cash"></div>'));
      b.appendChild(h('<p class="small">The total in the accounts you spend from. Opus takes away what’s held back below.</p>'));
      b.appendChild(h('<div class="sh" style="margin-top:4px"><span class="t">Held back before payday</span></div>'));
      const list = h('<div class="card"></div>'); b.appendChild(list);
      const out = h('<div class="figure" style="padding-top:2px"><div class="v num">—</div><div class="k">Free cash</div></div>');
      const calcOut = () => { const v = amt(b.querySelector('#cash-now').value); out.querySelector('.v').textContent = v == null ? '—' : U.money(v - U.sum(held.map(x => x.amount))); };
      const draw = () => {
        list.innerHTML = '';
        if (!held.length) list.appendChild(h('<p class="empty" style="padding:12px 0">Nothing held back. Add bills or anything else due before payday.</p>'));
        held.forEach((x, i) => {
          const r = h('<div class="kv"><span>' + U.esc(x.name) + (x.due ? ' <span class="muted">· ' + U.esc(dueLabel(x.due)) + '</span>' : '') + '</span><span class="num">' + U.money(x.amount, { cents: true }) + ' <button class="link" type="button" aria-label="Remove ' + U.esc(x.name) + '">✕</button></span></div>');
          r.querySelector('button').onclick = () => { held.splice(i, 1); draw(); calcOut(); };
          list.appendChild(r);
        });
        const add = h('<div class="row" style="gap:8px"><input class="input" placeholder="What" style="flex:1;min-width:0"><input class="input" inputmode="decimal" placeholder="$" style="width:84px"><button class="btn sm" type="button">Add</button></div>');
        add.querySelector('button').onclick = () => { const n = add.children[0].value.trim(), a = amt(add.children[1].value); if (!n || a == null) { ui.toast('Add a name and an amount'); return; } held.push({ name: n, amount: a }); draw(); calcOut(); };
        list.appendChild(add);
        // bills from the plan that aren't listed yet, one tap to add
        const names = held.map(x => x.name.toLowerCase());
        const sug = (M().bills || []).filter(bl => bl.amount != null && !names.includes(bl.name.toLowerCase()));
        if (sug.length) {
          const chips = h('<div class="chips" style="padding:4px 0 12px"></div>');
          sug.slice(0, 8).forEach(bl => { const ch = h('<button class="chip" type="button">+ ' + U.esc(bl.name) + '</button>'); ch.onclick = () => { held.push({ name: bl.name, amount: bl.amount }); draw(); calcOut(); }; chips.appendChild(ch); });
          list.appendChild(chips);
        }
      };
      draw();
      b.appendChild(out);
      b.querySelector('#cash-now').addEventListener('input', calcOut);
      const sv = h('<button class="btn block" type="button">Save</button>');
      sv.onclick = () => {
        const v = amt(b.querySelector('#cash-now').value); if (v == null) { ui.toast('Enter the cash you have now'); return; }
        const entry = { date: today, at: new Date().toISOString(), cash: v, held, free: Math.round((v - U.sum(held.map(x => x.amount))) * 100) / 100 };
        Store.data.money.cash = (Store.data.money.cash || []).filter(x => x.date !== today).concat([entry]);
        Store.save(); api.close(); ui.toast('Saved. Grok can see it.'); Opus.refresh();
      };
      api.foot.appendChild(sv);
    } });
  }

  /* what comes out before payday: Grok's list if it has one, else plan bills that have a due day */
  function beforePayday() {
    const c = latestCash(), pay = nextPayday(), today = U.key();
    let items = heldOf(c).map(x => ({ name: x.name, amount: x.amount, due: x.due || null }));
    let src = c && items.length ? (c.by === 'grok' ? 'From Grok, ' + whenAt(c) : 'From your last update') : null;
    if (!items.length) {
      const end = U.addDays(pay, days0(pay) ? 7 : 0);
      for (const bl of M().bills || []) {
        if (bl.amount == null || !bl.dueDay) continue;
        for (let d = new Date(); d <= end; d = U.addDays(d, 1)) if (d.getDate() === bl.dueDay) { items.push({ name: bl.name, amount: bl.amount, due: U.key(d) }); break; }
      }
      if (items.length) src = 'From the due days in your plan';
    }
    items = items.filter(x => !x.due || !/^\d{4}-\d{2}-\d{2}$/.test(x.due) || x.due >= today).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')));
    const sec = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">Before payday</span><span class="c num"></span></div><div class="card"></div></div>');
    const card = sec.querySelector('.card');
    if (!items.length) { card.appendChild(h('<p class="empty">Grok lists what has to come out before payday when it updates your free cash.</p>')); return sec; }
    sec.querySelector('.c').textContent = U.money(U.sum(items.map(x => x.amount)));
    items.forEach(x => {
      const soon = x.due && /^\d{4}-\d{2}-\d{2}$/.test(x.due) && U.daysBetween(new Date(), U.parseKey(x.due)) <= 1;
      card.appendChild(h('<div class="row"><span class="tag" style="min-width:44px' + (soon ? ';color:var(--warn)' : '') + '">' + (x.due && /^\d{4}-\d{2}-\d{2}$/.test(x.due) ? U.esc(U.DAY_NAMES[U.parseKey(x.due).getDay()].slice(0, 3)) : '—') + '</span><span class="tx"><b>' + U.esc(x.name || 'Held back') + '</b>' + (x.due ? '<small>' + U.esc(dueLabel(x.due)) + '</small>' : '') + '</span><span class="num">' + U.money(x.amount, { cents: true }) + '</span></div>'));
    });
    if (src) card.appendChild(h('<div class="row" style="min-height:0;padding:8px 0 10px"><span class="tx"><small>' + U.esc(src) + '</small></span></div>'));
    return sec;
  }
  const days0 = d => U.daysBetween(new Date(), d) === 0;

  /* ---------- the tab ---------- */
  function render(v) {
    const c = calc(), m = M();
    v.appendChild(h('<div class="top"><div><div class="eyebrow">Week ending ' + U.DAY_NAMES[weekEnding().getDay()].slice(0, 3) + ', ' + U.fmtDateShort(weekEnding()) + '</div><div class="title">Money</div></div></div>'));
    v.appendChild(cashHero());
    v.appendChild(beforePayday());

    const ds = h('<div class="sec"><div class="sh"><span class="r">II</span><span class="t">Debts</span><span class="c">payoff order</span></div></div>');
    const total = U.sum((m.debts || []).map(d => d.balance).filter(x => x != null)), dh = debtHistory();
    if (total > 0) {
      const top = h('<div class="card pad debt-top"><div><div class="k">Total debt known</div><div class="v num">' + U.money(total) + '</div>' +
        (dh.length > 1 && dh[0].v > total ? '<div class="small" style="color:var(--good)">' + U.money(dh[0].v - total) + ' paid down since ' + U.fmtDateShort(dh[0].date) + '</div>' : '<div class="small">Each balance update is saved</div>') + '</div>' +
        (dh.length > 1 ? '<div class="spk">' + ui.spark(dh.slice(-20), { w: 110, h: 34 }) + '</div>' : '') + '</div>');
      ds.appendChild(top);
    }
    ds.appendChild(debtCard(() => Opus.refresh())); v.appendChild(ds);
    if (m.notes) {
      const nt = h('<details class="fold"><summary class="link" style="padding:0 4px">Your money rules</summary><p class="small" style="padding:6px 4px 0"></p></details>');
      nt.querySelector('p').textContent = m.notes; v.appendChild(nt);
    }

    const wk = h('<div class="sec"><div class="sh"><span class="r">III</span><span class="t">Your week</span><button class="c" type="button">Edit numbers</button></div></div>');
    wk.querySelector('button').onclick = () => editNumbers(() => Opus.refresh());
    wk.appendChild(weekCard()); v.appendChild(wk);

    const isDay = m.checkInDay === U.dayKey(new Date());
    const ck = h('<div class="next"><div class="body"><div class="k">' + (c.cur ? (c.cur.by === 'grok' ? 'Logged by Grok' : 'Check-in done') : isDay ? 'Today' : U.DAY_NAMES[U.DAYS.indexOf(m.checkInDay || 'fri')]) + '</div><div class="h">' + U.DAY_NAMES[U.DAYS.indexOf(m.checkInDay || 'fri')] + ' check-in</div><div class="s">' + (c.cur ? U.money(weekSpent(c.cur), { cents: true }) + ' spent this week' : 'Grok logs the week, you look it over') + '</div></div><button class="btn' + (c.cur ? ' ghost sm' : '') + '" type="button">' + (c.cur ? 'Open' : 'Start') + '</button></div>');
    ck.querySelector('.btn').onclick = checkIn; v.appendChild(ck);

    const ws = weeks().slice(-8).reverse();
    const hs = h('<div class="sec"><div class="sh"><span class="r">IV</span><span class="t">Recent weeks</span></div><div class="card"></div></div>');
    if (!ws.length) hs.querySelector('.card').appendChild(h('<p class="empty">Each weekly check-in adds a week here.</p>'));
    else {
      const pts = weeks().map(w => ({ date: w.weekEnding, v: weekSpent(w) }));
      if (pts.length > 1) { const box = h('<div style="padding:12px 0 4px"></div>'); box.appendChild(ui.chart(pts, { h: 90, fmt: x => U.money(x) })); hs.querySelector('.card').appendChild(box); }
      ws.forEach(w => hs.querySelector('.card').appendChild(h('<div class="row"><span class="tx"><b>Week ending ' + U.fmtDateShort(w.weekEnding) + '</b><small>' + (w.paycheck != null ? 'Pay ' + U.money(w.paycheck, { cents: true }) + ' · ' : '') + (w.by === 'grok' || w.source === 'grok' ? 'from Grok' : 'by hand') + '</small></span><span class="num">' + U.money(weekSpent(w), { cents: true }) + '</span></div>')));
    }
    v.appendChild(hs);

    v.appendChild(h('<p class="small" style="text-align:center;padding:0 12px">Everything you enter here is saved for Grok to read.</p>'));
  }

  Opus.money = { thisWeek, importBox, checkIn, calc, debtFree, debtHistory, parseWeek, saveWeek, grokPrompt, TEMPLATE, latestCash, freeOf, updateCash, nextPayday };
  Opus.onBoot(() => {
    const m = M(), d = new Date(), k = U.key(d);
    if (m.checkInDay !== U.dayKey(d) || Store.data.seen.moneyAuto === k) return;
    if (calc().cur) return;
    const hide = Store.data.settings.hidden || []; if (hide.includes('money')) return;
    const ci = U.mins(m.checkInTime); if (ci != null && U.nowMins(d) < ci - 120) return;
    Store.data.seen.moneyAuto = k; Store.save();
    setTimeout(() => { if (!ui.topSheet()) checkIn(); else Store.data.seen.moneyAuto = null; }, 700);
  });
  Opus.tab({ id: 'money', title: 'Money', icon: 'money', render });
})();
