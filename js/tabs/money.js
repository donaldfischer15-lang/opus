/* Money tab: free cash right now (kept current by Grok), what comes out before payday, debts in payoff order with a debt-free date,
   the weekly plan, the check-in and Grok's weekly import. Everything entered here is saved in the logs (or the plan) for Grok to read. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const M = () => Plan.p.money || {};
  // a debt with counted:false (the car loan and student loan, the owner's rule) stays listed but is paid as a bill: it is left out of every debt figure
  const counted = d => d && d.counted !== false;
  const CD = () => (M().debts || []).filter(counted);
  const skey = x => String(x || '').trim().toLowerCase();
  // a counted debt that is also a bill (an installment loan on autopay) is paid by that bill each month; the debt money goes on top of it
  const billOf = d => (M().bills || []).find(b => skey(b.name) === skey(d && d.name)) || null;

  /* ---------- spending groups and one-offs, both kept in the plan so Grok sees them:
     money.spendGroups maps a store name (lower case) to a group; money.oneOff marks single purchases left out of the average week ---------- */
  const GROUPS = ['Groceries', 'Eating out', 'Pets', 'Gas', 'Clothes & gear', 'Health', 'Fun', 'Home', 'Gifts', 'Cash', 'Transfers', 'Other'];
  const groupOf = name => (M().spendGroups || {})[skey(name)] || null;
  const oneKey = (we, x) => we + '|' + skey(x.cat) + '|' + Number(x.amount).toFixed(2);
  const isOneOff = (we, x) => !!(M().oneOff || {})[oneKey(we, x)];
  function setOneOff(we, x, on) { const m = M(), o = m.oneOff = Object.assign({}, m.oneOff); if (on) o[oneKey(we, x)] = true; else delete o[oneKey(we, x)]; Store.save(); }
  function setGroup(name, g) { const m = M(), o = m.spendGroups = Object.assign({}, m.spendGroups); if (g) o[skey(name)] = g; else delete o[skey(name)]; Store.save(); }
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const perMonth = b => b.amount == null ? 0 : b.every === 'week' ? b.amount * 52 / 12 : b.every === 'year' ? b.amount / 12 : b.amount;

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
  // money moved between the owner's own accounts is never spending (an entry marked transfer: true, or in w.transfers)
  const spentOf = w => (w.spent || []).filter(s => s && !s.transfer);
  const movedOf = w => (Array.isArray(w.transfers) ? w.transfers : []).concat((w.spent || []).filter(s => s && s.transfer)).filter(x => x && typeof x.amount === 'number');
  function weekSpent(w) { return U.sum(spentOf(w).map(s => s.amount)); }
  function weekEveryday(w) { return U.sum(spentOf(w).filter(s => !isOneOff(w.weekEnding, s)).map(s => s.amount)); }
  function calc() {
    const m = M();
    const pays = weeks().filter(w => w.paycheck != null).slice(-4), lastPay = pays[pays.length - 1] || null; // take-home is the average of the last 4 paychecks
    const take = pays.length ? U.avg(pays.map(w => w.paycheck)) : m.takeHomePerWeek;
    const bills = (m.bills || []).map(b => perWeek(b));
    const billsW = U.sum(bills.filter(x => x != null)), billsMissing = bills.some(x => x == null);
    let debtW = m.plannedDebtPerWeek;
    let debtSrc = 'plan';
    if (debtW == null) { const mins = CD().filter(d => !billOf(d)).map(d => d.minMonthly).filter(x => x != null); if (mins.length) { debtW = U.sum(mins) * 12 / 52; debtSrc = 'minimums'; } }
    const ws = weeks().slice(-4);
    let spendLo, spendHi, spendSrc;
    if (ws.length) { spendLo = spendHi = U.avg(ws.map(weekEveryday)); spendSrc = 'Average of your last ' + ws.length + ' week' + (ws.length > 1 ? 's' : '') + (ws.some(w => weekEveryday(w) < weekSpent(w) - .005) ? ', one-offs left out' : ''); }
    else { const b = (Plan.p.food || {}).budgetPerWeek || {}; spendLo = b.low; spendHi = b.high != null ? b.high : b.low; spendSrc = spendLo != null ? 'Grocery budget until check-ins come in' : null; }
    const base = take == null ? null : take - billsW - (debtW || 0);
    const free = base == null || spendLo == null ? null : { lo: base - spendHi, hi: base - spendLo };
    const we = U.key(weekEnding());
    const cur = (Store.data.money.weeks || []).find(w => w.weekEnding === we);
    const left = base == null ? null : base - (cur ? weekSpent(cur) : 0);
    return { take, pays, lastPay, billsW, billsMissing, debtW, debtSrc, spendLo, spendHi, spendSrc, free, cur, left, we };
  }
  /* debt payments that count: anything Grok logged that isn't a bill or a debt paid as a bill (a payment named for a counted debt counts) */
  function debtPaid(w) {
    const skip = (M().debts || []).filter(d => !counted(d)).map(d => skey(d.name)).concat((M().bills || []).map(b => skey(b.name)));
    return U.sum((w.debtPayments || []).filter(p => !skip.includes(skey(p.name))).map(p => p.amount));
  }
  /* your pace: what you actually put toward debt over the last 4 logged weeks; your plan until 2 weeks are in */
  function debtPace() {
    const plan = M().plannedDebtPerWeek, ws = weeks().slice(-4);
    if (ws.length >= 2) { const v = U.sum(ws.map(debtPaid)) / ws.length; return v > 0 ? { perWeek: v, src: 'pace', n: ws.length, plan } : { perWeek: plan, src: 'plan', none: ws.length, plan }; }
    return { perWeek: plan, src: 'plan', plan };
  }
  const monthsOn = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d; };
  const monthYear = d => U.MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  const monShort = d => U.MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
  /* month by month: interest, minimums, then everything left to the first debt in payoff order */
  function payoff(perWeek) {
    const ds = CD(), monthly = perWeek * 52 / 12;
    const bal = ds.map(d => d.balance), apr = ds.map(d => (d.apr || 0) / 100 / 12);
    const viaBill = ds.map(d => { const b = billOf(d); return b ? perMonth(b) : 0; });
    const min = ds.map((d, i) => viaBill[i] ? 0 : d.minMonthly || 0);
    const at = bal.map(b => (b <= 0.005 ? 0 : null)), total = U.sum(bal);
    let months = 0;
    while (bal.some(b => b > 0.005) && months < 600) {
      months++;
      for (let i = 0; i < bal.length; i++) if (bal[i] > 0) bal[i] += bal[i] * apr[i];
      let pot = monthly;
      for (let i = 0; i < bal.length; i++) if (bal[i] > 0 && viaBill[i]) bal[i] -= Math.min(bal[i], viaBill[i]);
      for (let i = 0; i < bal.length; i++) if (bal[i] > 0) { const p = Math.min(bal[i], min[i], pot); bal[i] -= p; pot -= p; }
      for (let i = 0; i < bal.length && pot > 0; i++) if (bal[i] > 0) { const p = Math.min(bal[i], pot); bal[i] -= p; pot -= p; }
      bal.forEach((b, i) => { if (at[i] == null && b <= 0.005) at[i] = months; });
      if (months === 1 && U.sum(bal) >= total) return { stuck: true };
    }
    return { months, tooLong: months >= 600, each: ds.map((d, i) => ({ name: d.name, months: at[i], date: at[i] == null ? null : monthsOn(at[i]), paid: d.balance <= 0.005 })) };
  }
  function debtFree(perWeek) {
    const ds = CD();
    if (!ds.length) return { msg: 'No debts counted.' };
    const missing = ds.filter(d => d.balance == null).map(d => d.name);
    if (missing.length) return { msg: 'Add the balance for ' + missing.join(', ') + ' to see your debt-free date.' };
    if (U.sum(ds.map(d => d.balance)) <= 0) return { msg: 'Debt-free. Every balance is zero.', done: true };
    const pace = perWeek == null ? debtPace() : { perWeek, src: 'try' }, budget = pace.perWeek;
    if (!budget) return { msg: 'Set how much goes to debt each week to see your debt-free date.', pace };
    const r = payoff(budget);
    if (r.stuck) return { msg: 'At ' + U.money(budget) + ' a week, interest outpaces payments. Raise the weekly debt amount.', pace, budget };
    if (r.tooLong) return { msg: 'At this pace it takes more than 50 years.', pace, budget };
    const dt = monthsOn(r.months), noApr = ds.some(d => d.apr == null && d.balance > 0);
    const how = pace.src === 'pace' ? 'at your pace of ' + U.money(budget) + ' a week (last ' + pace.n + ' weeks)'
      : 'at ' + U.money(budget) + ' a week' + (pace.none ? ', your plan (no debt payments logged in the last ' + pace.none + ' weeks)' : '');
    return { date: dt, months: r.months, each: r.each, pace, budget, msg: 'Debt-free around ' + monthYear(dt) + ' ' + how + (noApr ? '. Debts with no rate set count no interest' : '') + '.' };
  }
  /* try more or less a week and watch each payoff date move */
  function tryPace(onChange) {
    const base = debtFree(), start = Math.round(base.budget || M().plannedDebtPerWeek || 0);
    ui.sheet({ title: 'More or less to debt', kicker: 'Try a weekly amount', render(api) {
      const b = api.body;
      b.appendChild(h('<p class="note">Change what goes to debt each week and every payoff date moves with it.</p>'));
      const fig = h('<div class="figure"><div class="v num">—</div><div class="k">Debt-free</div><div class="sub"></div></div>');
      const st = ui.stepper({ label: 'A week to debt', unit: '$ a week', value: start, step: (v, d) => Math.max(0, Math.round((v || 0) / 10) * 10 + 10 * d), onChange: v => draw(v) });
      const out = h('<div class="card"></div>');
      const save = h('<button class="btn quiet block" type="button"></button>');
      function draw(v) {
        out.innerHTML = '';
        const r = v > 0 ? debtFree(v) : null;
        fig.querySelector('.v').textContent = r && r.date ? monShort(r.date) : '—';
        const d = r && r.months != null && base.months != null ? base.months - r.months : null;
        fig.querySelector('.sub').textContent = !r ? 'Enter an amount a week.' : !r.date ? r.msg : d > 0 ? d + (d === 1 ? ' month' : ' months') + ' sooner than now' : d < 0 ? -d + (-d === 1 ? ' month' : ' months') + ' later than now' : 'Same as now';
        ((r && r.each) || []).forEach((e, i) => out.appendChild(h('<div class="kv"><span>' + U.roman(i + 1) + ' · ' + U.esc(e.name) + '</span><span class="num">' + (e.paid ? 'Paid off' : e.date ? 'paid off ' + monShort(e.date) : '—') + '</span></div>')));
        save.hidden = !(v > 0) || v === M().plannedDebtPerWeek;
        save.textContent = 'Make ' + U.money(v || 0) + ' a week my plan';
      }
      save.onclick = () => { M().plannedDebtPerWeek = st.get(); Store.save(); api.close(); ui.toast('Saved as your weekly plan'); onChange && onChange(); };
      b.appendChild(fig); b.appendChild(st.el); b.appendChild(out); b.appendChild(save);
      b.appendChild(h('<p class="small">Your dates on Money follow what you actually pay, so they move as your payments come in.</p>'));
      draw(start);
    } });
  }
  function debtHistory() {
    const names = CD().map(d => d.name);
    return (Store.data.money.balances || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map(s => ({ date: s.date, v: U.sum(names.map(n => (s.debts || {})[n]).filter(x => typeof x === 'number')) }));
  }
  /* ---------- cash on hand (money.cash in the logs): Grok writes it from the accounts, or you enter it ---------- */
  const cashList = () => (Store.data.money.cash || []).slice().sort((a, b) => (a.date + (a.at || '')).localeCompare(b.date + (b.at || '')));
  const latestCash = () => { const l = cashList(); return l[l.length - 1] || null; };
  // an entry that only updates balances (no cash, no held list) keeps what the reading before it held back, minus anything past due
  function heldOf(c) {
    let l = c && c.held;
    if (c && l == null && typeof c.cash !== 'number' && typeof c.free !== 'number') {
      const all = cashList(), i = all.indexOf(c);
      for (let j = (i < 0 ? all.length : i) - 1; j >= 0; j--) if (Array.isArray(all[j].held)) { l = all[j].held.filter(x => !x || !x.due || !/^\d{4}-\d{2}-\d{2}$/.test(x.due) || x.due >= c.date); break; }
    }
    return (Array.isArray(l) ? l : []).filter(x => x && typeof x.amount === 'number');
  }
  // money on its way between the owner's own accounts: it has left one and not landed in the other, so it still counts as cash
  const transitOf = c => (Array.isArray(c && c.transfers) ? c.transfers : []).filter(x => x && typeof x.amount === 'number' && x.amount > 0 && x.pending !== false);
  // each account's balance: this reading's, or the last one known when this reading left an account out (carried: true)
  function accountsOf(c) {
    if (!c || !Array.isArray(c.accounts) || !c.accounts.length) return [];
    const own = c.accounts.filter(a => a && typeof a.amount === 'number').map(a => Object.assign({ at: c.at || null }, a));
    const have = new Set(own.map(a => String(a.name || '').toLowerCase()));
    const l = cashList(), i = l.indexOf(c);
    for (let j = (i < 0 ? l.length : i) - 1; j >= 0; j--) {
      for (const a of (Array.isArray(l[j].accounts) ? l[j].accounts : [])) {
        const n = String(a && a.name || '').toLowerCase();
        if (!n || have.has(n) || typeof a.amount !== 'number') continue;
        have.add(n); own.push(Object.assign({ at: l[j].at || null, date: l[j].date }, a, { carried: true }));
      }
    }
    return own;
  }
  // worked out from the accounts when money is on its way or an account was carried over; Grok's own numbers otherwise
  const computed = c => !!c && (transitOf(c).length > 0 || accountsOf(c).some(a => a.carried) || (typeof c.cash !== 'number' && accountsOf(c).length > 0));
  function cashOf(c) {
    if (!c) return null;
    if (computed(c)) return U.sum(accountsOf(c).map(a => a.amount)) + U.sum(transitOf(c).map(x => x.amount));
    return typeof c.cash === 'number' ? c.cash : null;
  }
  function freeOf(c) {
    if (!c) return null;
    if (computed(c)) return Math.round((cashOf(c) - U.sum(heldOf(c).map(x => x.amount))) * 100) / 100;
    if (typeof c.free === 'number') return c.free;
    if (typeof c.cash === 'number') return c.cash - U.sum(heldOf(c).map(x => x.amount));
    return null;
  }
  // when one account was last read, in a few words
  function whenAcct(a) { return whenAt({ at: a.at, date: a.date || U.key(a.at ? new Date(a.at) : new Date()) }); }
  function movedCard(w, card) {
    const mv = movedOf(w); if (!mv.length) return;
    card.appendChild(h('<div class="sh" style="margin-top:10px"><span class="t">Moved between your accounts</span></div>'));
    mv.forEach(x => card.appendChild(h('<div class="kv"><span>' + U.esc((x.from || x.cat || 'One account') + (x.to ? ' \u2192 ' + x.to : '')) + '</span><span class="num muted">' + U.money(x.amount, { cents: true }) + '</span></div>')));
    card.appendChild(h('<p class="small" style="margin:6px 0 0">Not spending, so it isn\u2019t in the totals.</p>'));
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

  /* ---------- the weekly check-in: your week against the plan, where it went, bills that came out, the week ahead, one line ---------- */
  const sameName = (x, y) => { const a = skey(x).replace(/[^a-z0-9 ]/g, ''), b = skey(y).replace(/[^a-z0-9 ]/g, ''); return !!a && !!b && (a === b || a.includes(b) || b.includes(a) || a.split(' ')[0] === b.split(' ')[0]); };
  const FOOD = ['Groceries', 'Eating out'];
  function checkinOf(we) { return Object.assign({}, (M().checkins || {})[we]); }
  function saveCheckin(we, patch) {
    const m = M(), all = Object.assign({}, m.checkins), k = Object.keys(all).sort();
    all[we] = Object.assign({}, all[we], patch, { at: new Date().toISOString() });
    k.slice(0, Math.max(0, k.length - 25)).forEach(x => delete all[x]); // keep about six months
    m.checkins = all; Store.save();
  }
  // plan vs actual: money.split is the plan for one check (bills, food, spending, debt)
  function splitCard(w) {
    const sp = M().split || {}, card = h('<div class="card"></div>');
    const food = U.sum(spentOf(w).filter(x => FOOD.includes(groupOf(x.cat))).map(x => x.amount));
    const other = weekSpent(w) - food, unsorted = spentOf(w).filter(x => !groupOf(x.cat)).length;
    const rows = [['Bills', sp.bills, U.sum((w.bills || []).map(x => x.amount)), 'Bills come in lumps. Your monthly bills average ' + U.money(U.sum((M().bills || []).map(perMonth)) * 12 / 52) + ' a week.'],
      ['Food', sp.food, food, unsorted ? unsorted + ' store' + (unsorted > 1 ? 's' : '') + ' not sorted yet count as spending.' : null],
      ['Spending', sp.spending, other, null], ['Debt', sp.debt, debtPaid(w), null]];
    rows.forEach(([k, plan, act, note]) => {
      const over = plan != null && act > plan + .005, pct = plan ? U.clamp(act / plan, 0, 1) : 0;
      card.appendChild(h('<div class="pa"><div class="kv" style="border:0;padding:0"><span>' + k + '</span><span class="num"><b' + (over && k !== 'Debt' ? ' style="color:var(--warn)"' : '') + '>' + U.money(act) + '</b>' + (plan != null ? '<span class="muted"> of ' + U.money(plan) + '</span>' : '') + '</span></div>' +
        (plan != null ? '<div class="bar' + (over && k !== 'Debt' ? ' over' : '') + '"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></div>' : '') + (note ? '<small>' + U.esc(note) + '</small>' : '') + '</div>'));
    });
    if (w.paycheck != null) card.appendChild(h('<div class="kv"><span>Paycheck</span><span class="num">' + U.money(w.paycheck, { cents: true }) + '</span></div>'));
    return card;
  }
  // spending sorted by group, each store one tap from a group or a one-off mark
  function sortCard(w, rerender) {
    const card = h('<div class="card"></div>'), spent = weekSpent(w), groups = new Map();
    spentOf(w).forEach(x => { const g = groupOf(x.cat) || 'Not sorted yet'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x); });
    [...groups.keys()].sort((a, b) => (a === 'Not sorted yet') - (b === 'Not sorted yet') || U.sum(groups.get(b).map(x => x.amount)) - U.sum(groups.get(a).map(x => x.amount))).forEach(g => {
      const items = groups.get(g), tot = U.sum(items.map(x => x.amount));
      card.appendChild(h('<div class="wg"><div class="kv" style="border:0;padding:0"><span' + (g === 'Not sorted yet' ? ' style="color:var(--warn)"' : '') + '>' + U.esc(g) + '</span><span class="num">' + U.money(tot, { cents: true }) + '</span></div><div class="bar"><i style="width:' + (spent ? tot / spent * 100 : 0).toFixed(1) + '%"></i></div></div>'));
      items.forEach(x => { const r = h('<div class="row tap wg-i"><span class="tx"><b>' + U.esc(x.cat) + '</b>' + (isOneOff(w.weekEnding, x) ? '<small style="color:var(--gold-2)">one-off</small>' : '') + '</span><span class="num">' + U.money(x.amount, { cents: true }) + '</span></div>'); r.onclick = () => itemSheet(w.weekEnding, x, rerender); card.appendChild(r); });
    });
    if (!spentOf(w).length) card.appendChild(h('<p class="empty">No spending logged this week.</p>'));
    movedCard(w, card);
    return card;
  }
  // this week against the week before and your average
  function compareLine(w) {
    const all = weeks(), i = all.findIndex(x => x.weekEnding === w.weekEnding), prev = i > 0 ? all[i - 1] : null;
    const now = weekSpent(w), bits = [];
    if (prev) { const d = now - weekSpent(prev); bits.push(Math.abs(d) < .5 ? 'the same as the week before' : U.money(Math.abs(d)) + (d < 0 ? ' less' : ' more') + ' than the week before (' + U.money(weekSpent(prev)) + ')'); }
    const ws = all.slice(Math.max(0, i - 3), i + 1); if (ws.length > 2) bits.push('your ' + ws.length + '-week average is ' + U.money(U.avg(ws.map(weekSpent))));
    const one = now - weekEveryday(w); if (one > .005) bits.push(U.money(one) + ' of it one-off');
    return bits.length ? bits.join(', ') : 'Your first week logged. Next week compares to it.';
  }
  // bills that came out against the ones due in the week, from the calendar
  function billsCheck(w) {
    const end = U.parseKey(w.weekEnding), due = [];
    for (let i = 6; i >= 0; i--) { const d = U.addDays(end, -i); dueOn(d).forEach(x => due.push(Object.assign({ date: d }, x))); }
    const plan = M().bills || [], card = h('<div class="card"></div>'), used = new Set();
    (w.bills || []).forEach(x => {
      const pb = plan.find(b => sameName(b.name, x.name));
      const di = due.findIndex((d, j) => !used.has(j) && sameName(d.name, x.name)); if (di >= 0) used.add(di);
      const diff = pb && pb.amount != null && Math.abs(pb.amount - x.amount) > .5;
      card.appendChild(h('<div class="row"><span class="tag" style="min-width:20px;color:' + (!pb || diff ? 'var(--warn)' : 'var(--good)') + '">' + (!pb || diff ? '!' : '✓') + '</span><span class="tx"><b>' + U.esc(x.name) + '</b><small>' +
        (!pb ? 'Not in your bills' : diff ? 'Your plan says ' + U.money(pb.amount, { cents: true }) + (pb.amount < x.amount ? ', ' + U.money(x.amount - pb.amount, { cents: true }) + ' more' : ', ' + U.money(pb.amount - x.amount, { cents: true }) + ' less') : 'As planned') + '</small></span><span class="num">' + U.money(x.amount, { cents: true }) + '</span></div>'));
    });
    due.forEach((d, j) => { if (used.has(j)) return; card.appendChild(h('<div class="row"><span class="tag" style="min-width:20px;color:var(--warn)">?</span><span class="tx"><b>' + U.esc(d.name) + '</b><small>Due ' + U.DAY_NAMES[d.date.getDay()].slice(0, 3) + ' ' + U.fmtDateShort(d.date) + ', not seen in this week</small></span><span class="num">' + U.money(d.amount, { cents: true }) + '</span></div>')); });
    if (!card.children.length) card.appendChild(h('<p class="empty">No bills came out or were due this week.</p>'));
    return card;
  }
  // the week ahead: what's due before the next payday after this check, then extra to debt
  function aheadCard(we, rerender) {
    const m = M(), t = thisWeek(), start = new Date(), end = U.addDays(nextPayday(U.addDays(start, 1)), -1), card = h('<div class="card pad" style="display:flex;flex-direction:column;gap:4px"></div>');
    const items = []; for (let d = new Date(start); d <= end; d = U.addDays(d, 1)) dueOn(d).forEach(x => items.push(Object.assign({ date: new Date(d) }, x)));
    const later = []; for (let d = U.addDays(end, 1); d <= U.addDays(end, 10); d = U.addDays(d, 1)) dueOn(d).filter(x => x.once).forEach(x => later.push(Object.assign({ date: new Date(d) }, x)));
    const kv = (k, v, cls) => card.appendChild(h('<div class="kv ' + (cls || '') + '"><span>' + k + '</span><span class="num">' + v + '</span></div>'));
    card.appendChild(h('<div class="small" style="margin-bottom:4px">Through ' + U.DAY_NAMES[end.getDay()] + ', ' + U.fmtDateShort(end) + ', the day before payday</div>'));
    items.forEach(x => kv(U.esc(x.name) + ' <span class="muted">· ' + U.DAY_NAMES[x.date.getDay()].slice(0, 3) + ' ' + x.date.getDate() + '</span>', U.money(x.amount, { cents: true })));
    if (!items.length) kv('Nothing due', '<span class="muted">—</span>');
    else kv('Due before payday', U.money(U.sum(items.map(x => x.amount)), { cents: true }), 'total');
    later.forEach(x => card.appendChild(h('<div class="g-take" style="margin-top:8px"><div class="tag">Right after</div><div>' + U.esc(x.name) + ': ' + U.money(x.amount, { cents: true }) + ' by ' + U.DAY_NAMES[x.date.getDay()] + ', ' + U.fmtDateShort(x.date) + '.</div></div>')));
    // extra to debt, held to your cushion rule
    const first = CD().find(d => d.balance == null || d.balance > 0); if (!first) return card;
    const ck = checkinOf(we), room = t.cash != null && m.cushion != null && t.yours != null ? Math.max(0, Math.min(t.yours + (t.extra || 0), t.cash - m.cushion)) : null;
    card.appendChild(h('<div class="sh" style="margin:14px 0 2px"><span class="t">Extra to ' + U.esc(first.name) + '</span></div>'));
    card.appendChild(h('<p class="small" style="margin:0">' + (room == null ? 'Add your cash on hand to see how much your cushion allows.' : room > 0 ? 'Your ' + U.money(m.cushion) + ' cushion and this week’s money leave room for up to ' + U.money(Math.floor(room)) + '.' : 'Your ' + U.money(m.cushion) + ' cushion says hold off this week.') + '</p>'));
    const st = ui.stepper({ label: 'Extra to debt', unit: '$', value: ck.extra || 0, step: (v, d) => Math.max(0, Math.round((v || 0) / 10) * 10 + 10 * d) });
    const sv = h('<button class="btn quiet block" type="button">' + (ck.extra ? 'Update the extra' : 'Plan this extra') + '</button>');
    sv.onclick = () => { const v = st.get() || 0; saveCheckin(we, { extra: v, to: first.name }); ui.toast(v ? U.money(v) + ' extra to ' + first.name + ' is planned' : 'No extra this week'); rerender(); };
    card.appendChild(st.el); card.appendChild(sv);
    if (ck.extra) card.appendChild(h('<p class="small" style="margin:4px 0 0">Planned: ' + U.money(ck.extra) + ' to ' + U.esc(ck.to || first.name) + '. It comes out of Yours this week, and you move the money.</p>'));
    return card;
  }
  function checkIn() {
    ui.sheet({ title: 'Money check-in', kicker: 'Week ending ' + U.fmtDateShort(weekEnding()), full: true, onClose: () => Opus.refresh(), render(api) {
      const b = api.body, c = calc(), we = c.we, ck = checkinOf(we);
      const w = c.cur || weeks().pop() || null; // this week once it's logged, the last logged week until then
      const head = h('<p class="note">Your week against the plan, where it went, the bills that came out, then the week ahead.</p>');
      b.appendChild(head);
      if (!c.cur) {
        const man = h('<details class="fold"><summary class="link">This week isn’t in yet? Enter it by hand</summary><div style="display:flex;flex-direction:column;gap:10px;margin-top:10px"></div></details>');
        const mb = man.querySelector('div');
        mb.appendChild(h('<div class="grid2"><div class="field"><label for="mi-pay">Paycheck</label><input class="input" id="mi-pay" inputmode="decimal"></div><div class="field"><label for="mi-spent">Spent this week</label><input class="input" id="mi-spent" inputmode="decimal"></div></div>'));
        const ms = h('<button class="btn quiet" type="button">Save by hand</button>');
        ms.onclick = () => {
          const pay = amt(mb.querySelector('#mi-pay').value), sp = amt(mb.querySelector('#mi-spent').value);
          if (sp == null && pay == null) { ui.toast('Enter at least one number'); return; }
          saveWeek({ weekEnding: we, paycheck: pay, spent: sp != null ? [{ cat: 'everyday', amount: sp }] : [], bills: [], debtPayments: [], balances: [], notes: [], source: 'manual' });
          ui.toast('Week saved'); api.rerender();
        };
        mb.appendChild(ms); b.appendChild(man);
      }
      if (w) {
        if (!c.cur) b.appendChild(h('<div class="banner gold">Showing the week ending ' + U.fmtDateShort(w.weekEnding) + ' until this week comes in.</div>'));
        b.appendChild(h('<div class="sh"><span class="r">I</span><span class="t">Your week</span><span class="c">plan vs actual</span></div>'));
        b.appendChild(h('<div class="figure"><div class="v num">' + U.money(weekSpent(w)) + '</div><div class="k">Spent</div><div class="sub">' + U.esc(compareLine(w)) + '</div></div>'));
        b.appendChild(splitCard(w));
        b.appendChild(h('<div class="sh"><span class="r">II</span><span class="t">Where it went</span><span class="c">tap to sort</span></div>'));
        b.appendChild(sortCard(w, () => api.rerender()));
        b.appendChild(h('<div class="sh"><span class="r">III</span><span class="t">Bills that came out</span></div>'));
        b.appendChild(billsCheck(w));
      }
      b.appendChild(h('<div class="sh"><span class="r">' + (w ? 'IV' : 'I') + '</span><span class="t">The week ahead</span></div>'));
      b.appendChild(aheadCard(we, () => api.rerender()));
      b.appendChild(h('<div class="sh"><span class="r">' + (w ? 'V' : 'II') + '</span><span class="t">Debts</span></div>'));
      b.appendChild(debtCard(() => api.rerender()));
      b.appendChild(h('<div class="sh"><span class="r">' + (w ? 'VI' : 'III') + '</span><span class="t">One line for the week</span></div>'));
      const ta = h('<textarea class="input" rows="2" maxlength="280" placeholder="What went well, or what to change"></textarea>'); ta.value = ck.note || '';
      ta.addEventListener('change', () => saveCheckin(we, { note: ta.value.trim() }));
      b.appendChild(ta);
      b.appendChild(h('<p class="small" style="margin-top:-4px">Saved with this week for Grok and Cassius to read.</p>'));
      const done = h('<button class="btn block" type="button">Done</button>');
      done.onclick = () => { saveCheckin(we, { note: ta.value.trim(), done: true }); const d = new Date(); if (M().checkInDay === U.dayKey(d)) Plan.setChecked(d, 'money-checkin', true); Store.save(); api.close(); Opus.todayRefresh && Opus.todayRefresh(); };
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
    kv(c.pays.length > 1 ? 'Take-home (average of your last ' + c.pays.length + ' paychecks)' : c.lastPay ? 'Take-home (paycheck, week ending ' + U.fmtDateShort(c.lastPay.weekEnding) + ')' : 'Take-home (until a paycheck is logged)', c.take == null ? '<span class="muted">not set</span>' : U.money(c.take, { cents: !!c.lastPay }));
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
    const R = Opus.receipts, we = U.key(pay);
    // groceries already bought this pay week come out of the week's food budget, and receipts after the cash reading come out of free cash
    const groc = R ? R.weekGroceries(we).spent : 0, since = R ? R.sinceCash(c) : [], sinceAmt = U.sum(since.map(R ? R.fromAccounts : () => 0));
    const pro = foodW == null ? null : Math.round(foodW * days / 7);
    const food = pro == null ? null : groc > 0 ? Math.min(pro, Math.max(0, Math.round(foodW - groc))) : pro;
    const cur = (Store.data.money.weeks || []).find(w => w.weekEnding === we);
    const paid = cur ? U.sum((cur.debtPayments || []).map(x => x.amount)) : 0;
    const inHeld = heldOf(c).some(x => /\bdebt\b/i.test(x.name || '')); // Grok already held this week's debt payment back
    const debt = m.plannedDebtPerWeek == null || inHeld ? null : Math.max(0, m.plannedDebtPerWeek - paid);
    const ck = (m.checkins || {})[we] || {}, paidExtra = Math.max(0, paid - (m.plannedDebtPerWeek || 0));
    const extra = ck.extra > 0 ? Math.max(0, ck.extra - paidExtra) : 0;
    const yours = free == null ? null : free - sinceAmt - (food || 0) - (debt || 0) - extra;
    const cash = c ? cashOf(c) : null;
    return { c, free, cash, pay, days, payToday: d0 === 0, foodW, food, groc, since, sinceAmt, debt, paid, extra, extraTo: ck.to || null, yours };
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
    t.since.forEach(r => kv(U.esc(r.store) + ' <span class="muted">· after that reading</span>', '− ' + U.money(Opus.receipts.fromAccounts(r), { cents: true })));
    if (t.food != null) kv(t.groc > 0 ? 'Rest of this week’s food <span class="muted">· ' + U.money(t.groc) + ' bought</span>' : 'Food ' + (t.days === 1 ? 'for 1 day' : 'for ' + t.days + ' days'), t.food ? '− ' + U.money(t.food) : '<span class="muted">covered</span>');
    if (t.debt != null) kv(t.paid ? 'Rest of this week’s debt payment' : 'This week’s debt payment', t.debt ? '− ' + U.money(t.debt) : '<span class="muted">sent</span>');
    if (t.extra) kv('Extra to ' + U.esc(t.extraTo || 'debt') + ' <span class="muted">· your check-in</span>', '− ' + U.money(t.extra));
    kv('Yours this week', short ? '−' + U.money(-v) : U.money(v), 'total');
    rows.appendChild(h('<div class="small" style="margin-top:6px">Bills due before payday are already out of free cash.' + (t.foodW != null ? ' Food uses the top of your ' + U.money(t.foodW) + ' weekly budget' + (t.groc > 0 ? ', less the groceries already bought.' : '.') : '') + '</div>'));
    card.appendChild(rows);
    // your rule: extra debt payments wait for the cushion
    if (m.cushion != null && t.cash != null && !short) {
      const first = CD().find(d => d.balance == null || d.balance > 0);
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
    const cds = ds.filter(counted), billed = ds.filter(d => !counted(d));
    if (ds.length && !cds.length) card.appendChild(h('<p class="empty">No debts counted. Debts paid as bills are listed below.</p>'));
    const df = debtFree();
    cds.forEach((d, n) => {
      const i = ds.indexOf(d), ms = df.each && df.each[n];
      const first = firsts[d.name];
      const paid = first && d.balance != null && first > 0 ? U.clamp(1 - d.balance / first, 0, 1) : null;
      const isFocus = cds.findIndex(x => x.balance == null || x.balance > 0) === n;
      const r = h('<div class="row tap" style="flex-wrap:wrap;row-gap:8px"><span class="tag" style="min-width:26px">' + U.roman(n + 1) + '</span><span class="tx"><b>' + U.esc(d.name) + (isFocus ? ' <span class="tag" style="margin-left:6px">Focus</span>' : '') + '</b><small>' +
        [ms && ms.date && !ms.paid ? '<span style="color:var(--gold-2)">paid off ' + monShort(ms.date) + '</span>' : null, d.apr != null ? d.apr + '% APR' : null, billOf(d) ? U.money(billOf(d).amount) + '/' + ({ week: 'wk', year: 'yr' }[billOf(d).every] || 'mo') + ' as a bill' : d.minMonthly != null ? U.money(d.minMonthly) + '/mo min' : null].concat(debtExtras(d, !!(ms && ms.date))).filter(Boolean).join(' · ') + '</small></span>' +
        '<span class="num" style="font-weight:600;' + (d.balance == null ? 'color:var(--gold);font-weight:500;font-size:13px' : '') + '">' + (d.balance == null ? 'Add balance' : d.balance === 0 ? 'Paid off' : U.money(d.balance)) + '</span>' +
        (paid != null ? '<div class="bar" style="flex-basis:100%;margin-left:40px"><i style="width:' + (paid * 100).toFixed(1) + '%"></i></div>' : '') + '</div>');
      r.onclick = () => editDebt(i, onChange);
      card.appendChild(r);
    });
    const dfr = h('<div class="row"><span class="tx" style="gap:8px"><small style="font-size:13.5px;color:' + (df.date ? 'var(--gold-2)' : 'var(--dim)') + '">' + U.esc(df.msg) + '</small>' + (df.date ? '<button class="link" type="button" style="align-self:flex-start;font-size:13px">Try more or less a week</button>' : '') + '</span></div>');
    const tb = dfr.querySelector('button'); if (tb) tb.onclick = () => tryPace(onChange);
    card.appendChild(dfr);
    if (billed.length) {
      card.appendChild(h('<div class="row" style="min-height:0;padding:12px 0 4px"><span class="tx"><small>Paid as bills, not counted in your debt</small></span></div>'));
      billed.forEach(d => {
        const r = h('<div class="row tap" style="opacity:.72"><span class="tag" style="min-width:26px">·</span><span class="tx"><b>' + U.esc(d.name) + '</b><small>' +
          [d.minMonthly != null ? U.money(d.minMonthly) + '/mo as a bill' : 'paid as a bill', d.apr != null ? d.apr + '% APR' : null].concat(debtExtras(d)).filter(Boolean).join(' · ') + '</small></span><span class="num" style="color:var(--dim)">' + (d.balance == null ? '—' : d.balance === 0 ? 'Paid off' : U.money(d.balance)) + '</span></div>');
        r.onclick = () => editDebt(ds.indexOf(d), onChange);
        card.appendChild(r);
      });
    }
    return card;
  }
  function numField(id, label, val) { return '<div class="field"><label for="' + id + '">' + label + '</label><input class="input" id="' + id + '" inputmode="decimal" value="' + (val == null ? '' : val) + '" placeholder="blank"></div>'; }
  function editDebt(i, onChange) {
    const d = M().debts[i];
    const ci = CD().indexOf(d);
    ui.sheet({ title: d.name, kicker: counted(d) ? 'Payoff order ' + U.roman(ci + 1) : 'Paid as a bill, not counted in your debt', render(api) {
      const facts = debtFacts(d);
      if (facts.length) api.body.appendChild(h('<div class="card pad" style="margin-bottom:14px">' + facts.map(f => '<div class="kv"><span>' + f[0] + '</span><span class="num" style="text-align:right">' + f[1] + '</span></div>').join('') + '</div>'));
      if (d.note) { const p = h('<p class="small" style="margin:-4px 4px 14px"></p>'); p.textContent = d.note; api.body.appendChild(p); }
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
      acctLine(c) +
      (hist.length > 2 ? '<div class="fc-spark" aria-hidden="true">' + ui.spark(hist, { w: 240, h: 34 }) + '</div>' : '') +
      '<div class="fc-from' + (stale ? ' stale' : '') + '"><i></i>' + (c.by === 'grok' ? 'From Grok' : 'You entered it') + ' · ' + U.esc(whenAt(c)) + (stale ? ' · may be out of date' : '') + '</div>' +
      (stale ? '<div class="fc-acts"><button class="g-act" type="button" data-ask>' + ui.icon('spark') + '<span>Copy ask for Grok</span></button></div>' : '');
    const ask = el.querySelector('[data-ask]'); if (ask) ask.onclick = e => { e.stopPropagation(); ui.copy(ASK_GROK); };
    el.onclick = () => cashSheet();
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cashSheet(); } };
    return el;
  }

  // the accounts under the big number: each balance and when it was read, so an old one is easy to spot
  function acctLine(c) {
    const ac = accountsOf(c), tr = transitOf(c);
    if (!ac.length && !tr.length) return '';
    return '<div class="fc-accts">' + ac.map(a => { const old = a.at ? (Date.now() - new Date(a.at).getTime()) / 36e5 > 36 : true; return '<span class="' + (old ? 'old' : '') + '"><b>' + U.esc(a.name || 'Account') + '</b> ' + U.money(a.amount) + ' <small>' + U.esc(whenAcct(a)) + '</small></span>'; }).join('') +
      tr.map(x => '<span class="mv"><b>On its way</b> ' + U.money(x.amount) + ' <small>' + U.esc((x.from || '') + (x.to ? ' \u2192 ' + x.to : '')) + '</small></span>').join('') + '</div>';
  }
  function cashSheet() {
    const c = latestCash(); if (!c) { updateCash(); return; }
    ui.sheet({ title: 'Free cash', kicker: (c.by === 'grok' ? 'From Grok · ' : 'You entered it · ') + whenAt(c), render(api) {
      const b = api.body, free = freeOf(c), held = heldOf(c).slice().sort((x, y) => String(x.due || '9').localeCompare(String(y.due || '9')));
      const card = h('<div class="card"></div>');
      const kv = (k, v, cls) => card.appendChild(h('<div class="kv ' + (cls || '') + '"><span>' + k + '</span><span class="num">' + v + '</span></div>'));
      const ac = accountsOf(c), tr = transitOf(c), cash = cashOf(c);
      ac.forEach(a => kv(U.esc(a.name || 'Account') + ' <span class="muted">· ' + U.esc((a.carried ? 'last read ' : '') + whenAcct(a)) + '</span>', U.money(a.amount, { cents: true })));
      tr.forEach(x => kv('On its way' + ' <span class="muted">· ' + U.esc((x.from || 'your account') + (x.to ? ' \u2192 ' + x.to : '')) + '</span>', '+ ' + U.money(x.amount, { cents: true })));
      if (cash != null) kv('<b>' + (ac.length ? 'Total cash' : 'Cash') + '</b>', '<b>' + U.money(cash, { cents: true }) + '</b>');
      held.forEach(x => kv(U.esc(x.name || 'Held back') + (x.due ? ' <span class="muted">· ' + U.esc(dueLabel(x.due)) + '</span>' : ''), '− ' + U.money(x.amount, { cents: true })));
      kv('Free cash', U.money(free, { cents: true }), 'total');
      b.appendChild(card);
      if (tr.length) b.appendChild(h('<p class="small">Money moving between your own accounts still counts as yours until it lands, so it isn\u2019t taken out of free cash.</p>'));
      if (!computed(c) && typeof c.free === 'number' && typeof c.cash === 'number' && Math.abs(c.cash - U.sum(held.map(x => x.amount)) - c.free) > 1) b.appendChild(h('<p class="small">Grok’s free cash differs from cash minus what’s listed by ' + U.money(Math.abs(c.cash - U.sum(held.map(x => x.amount)) - c.free)) + '. Ask Grok what else it held back.</p>'));
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
    items.forEach(x => { x.account = x.account || billAccount(x.name); });
    const short = shortfalls(c, items);
    const sec = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">Before payday</span><span class="c num"></span></div><div class="card"></div></div>');
    const card = sec.querySelector('.card');
    if (!items.length) { card.appendChild(h('<p class="empty">Grok lists what has to come out before payday when it updates your free cash.</p>')); return sec; }
    sec.querySelector('.c').textContent = U.money(U.sum(items.map(x => x.amount)));
    short.forEach(sf => card.appendChild(h('<div class="acct-short"><b>Move ' + U.money(Math.ceil(sf.gap)) + (sf.from ? ' from ' + U.esc(sf.from) : '') + ' to ' + U.esc(sf.account) + ' by ' + U.esc(byLabel(sf.by)) + '</b><span>' + U.esc(sf.account) + ' has ' + U.money(sf.have, { cents: true }) + (sf.incoming ? ' with ' + U.money(sf.incoming) + ' on its way' : '') + ', and ' + U.esc(sf.bills) + ' need' + (sf.count === 1 ? 's' : '') + ' ' + U.money(sf.need, { cents: true }) + ' ' + U.esc(dueLabel(sf.due)) + '.</span></div>')));
    items.forEach(x => {
      const soon = x.due && /^\d{4}-\d{2}-\d{2}$/.test(x.due) && U.daysBetween(new Date(), U.parseKey(x.due)) <= 1;
      const sf = x.account && short.find(y => y.account === x.account && y.names.includes(x.name));
      const sub = [x.due ? dueLabel(x.due) : '', x.account ? 'from ' + x.account : ''].filter(Boolean).join(' · ');
      card.appendChild(h('<div class="row"><span class="tag" style="min-width:44px' + (soon ? ';color:var(--warn)' : '') + '">' + (x.due && /^\d{4}-\d{2}-\d{2}$/.test(x.due) ? U.esc(U.DAY_NAMES[U.parseKey(x.due).getDay()].slice(0, 3)) : '—') + '</span><span class="tx"><b>' + U.esc(x.name || 'Held back') + '</b>' + (sub ? '<small' + (sf ? ' style="color:var(--warn)"' : '') + '>' + U.esc(sub) + (sf ? ' · short' : '') + '</small>' : '') + '</span><span class="num">' + U.money(x.amount, { cents: true }) + '</span></div>'));
    });
    if (src) card.appendChild(h('<div class="row" style="min-height:0;padding:8px 0 10px"><span class="tx"><small>' + U.esc(src) + '</small></span></div>'));
    return sec;
  }
  const days0 = d => U.daysBetween(new Date(), d) === 0;
  /* which account pays a bill: the plan bill's "account" (matched by name), else none */
  function billAccount(name) {
    const n = String(name || '').toLowerCase().trim(); if (!n) return null;
    const bl = (M().bills || []).find(b => String(b.name || '').toLowerCase().trim() === n) || (M().bills || []).find(b => b.name && (n.startsWith(String(b.name).toLowerCase()) || String(b.name).toLowerCase().startsWith(n)));
    return bl && typeof bl.account === 'string' && bl.account.trim() ? bl.account.trim() : null;
  }
  /* for each account that pays bills before payday: is there enough in it, counting money on its way to it? */
  function shortfalls(c, items) {
    const acc = accountsOf(c); if (!acc.length) return [];
    const bal = n => { const a = acc.find(x => String(x.name || '').toLowerCase() === String(n).toLowerCase()); return a ? a.amount : null; };
    const incoming = n => U.sum(transitOf(c).filter(t => String(t.to || '').toLowerCase() === String(n).toLowerCase()).map(t => t.amount));
    const out = [], byAcct = new Map();
    items.filter(x => x.account && x.due && /^\d{4}-\d{2}-\d{2}$/.test(x.due)).forEach(x => { if (!byAcct.has(x.account)) byAcct.set(x.account, []); byAcct.get(x.account).push(x); });
    for (const [name, list] of byAcct) {
      const have = bal(name); if (have == null) continue;
      const inc = incoming(name), avail = have + inc;
      let need = 0, first = null; const names = [];
      for (const x of list) { need += x.amount; names.push(x.name); if (need > avail + 0.005 && !first) first = x; }
      if (!first) continue;
      const gap = need - avail, last = list[list.length - 1];
      // move it from the account with the most in it that isn't this one
      const from = acc.filter(a => String(a.name).toLowerCase() !== name.toLowerCase()).sort((a, b) => b.amount - a.amount)[0];
      const by = U.key(U.addDays(U.parseKey(first.due), -1));
      out.push({ account: name, have, incoming: inc, need, gap, due: last.due, by: by < U.key() ? U.key() : by, names, count: names.length, bills: names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1], from: from ? from.name : null });
    }
    return out;
  }
  const byLabel = k => { const n = U.daysBetween(new Date(), U.parseKey(k)); return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : n < 7 ? U.DAY_NAMES[U.parseKey(k).getDay()] : U.fmtDateShort(k); };


  /* ---------- bills: a month calendar against paydays, pay-week totals, subscriptions ---------- */
  // bills with a due day land on that day each month (the last day in a short month); money.due holds one-time amounts with a date
  function dueOn(d) {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), k = U.key(d), out = [];
    for (const b of M().bills || []) if (b.amount != null && b.dueDay && (!b.every || b.every === 'month') && Math.min(b.dueDay, last) === d.getDate()) out.push({ name: b.name, amount: b.amount });
    for (const x of M().due || []) if (x && x.date === k && typeof x.amount === 'number') out.push({ name: x.name, amount: x.amount, once: true });
    return out;
  }
  const isPayday = d => d.getDay() === U.DAYS.indexOf(M().payday || 'fri');
  function billCal(off, nav) {
    const now = new Date(), first = new Date(now.getFullYear(), now.getMonth() + off, 1), y = first.getFullYear(), mo = first.getMonth();
    const days = new Date(y, mo + 1, 0).getDate(), today = U.key(now);
    const wrap = h('<div class="bc"></div>');
    const head = h('<div class="bc-head"><button class="bc-nav" type="button" aria-label="Previous month">‹</button><b>' + U.MONTHS[mo] + ' ' + y + '</b><button class="bc-nav" type="button" aria-label="Next month">›</button></div>');
    head.children[0].onclick = () => nav(off - 1); head.children[2].onclick = () => nav(off + 1);
    head.children[0].disabled = off <= -1; head.children[2].disabled = off >= 2;
    wrap.appendChild(head);
    const grid = h('<div class="bc-grid"></div>');
    'SMTWTFS'.split('').forEach(l => grid.appendChild(h('<div class="bc-wd">' + l + '</div>')));
    for (let i = 0; i < first.getDay(); i++) grid.appendChild(h('<div></div>'));
    for (let n = 1; n <= days; n++) {
      const d = new Date(y, mo, n), k = U.key(d), list = dueOn(d), tot = U.sum(list.map(x => x.amount));
      const c = h('<button type="button" class="bc-d' + (list.length ? ' bill' : '') + (isPayday(d) ? ' pay' : '') + (k === today ? ' today' : '') + (k < today ? ' past' : '') + '"><span>' + n + '</span>' + (list.length ? '<i class="num">' + U.money(tot) + '</i>' : '') + '</button>');
      c.setAttribute('aria-label', U.DAY_NAMES[d.getDay()] + ' ' + U.fmtDateShort(d) + (isPayday(d) ? ', payday' : '') + (list.length ? ', ' + list.map(x => x.name).join(', ') + ' ' + U.money(tot, { cents: true }) : ''));
      c.onclick = () => { if (!list.length) return; ui.sheet({ title: U.DAY_NAMES[d.getDay()] + ', ' + U.fmtDateShort(d), kicker: isPayday(d) ? 'Payday' : 'Due', render(api) { const cd = h('<div class="card"></div>'); list.forEach(x => cd.appendChild(h('<div class="kv"><span>' + U.esc(x.name) + (x.once ? ' <span class="muted">· this time only</span>' : '') + '</span><span class="num">' + U.money(x.amount, { cents: true }) + '</span></div>'))); if (list.length > 1) cd.appendChild(h('<div class="kv total"><span>Total</span><span class="num">' + U.money(tot, { cents: true }) + '</span></div>')); api.body.appendChild(cd); } }); };
      grid.appendChild(c);
    }
    wrap.appendChild(grid);
    wrap.appendChild(h('<div class="bc-key"><span><i class="k-pay"></i>Payday</span><span><i class="k-bill"></i>Bills due</span></div>'));
    // pay weeks that start in this month: payday through the day before the next one
    const weeksL = [];
    for (let d = new Date(y, mo, 1); d.getMonth() === mo; d = U.addDays(d, 1)) if (isPayday(d)) {
      const items = []; for (let i = 0; i < 7; i++) items.push(...dueOn(U.addDays(d, i)));
      weeksL.push({ start: d, end: U.addDays(d, 6), items, total: U.sum(items.map(x => x.amount)) });
    }
    const max = Math.max(1, ...weeksL.map(w => w.total));
    const list = h('<div class="bc-weeks"></div>');
    weeksL.forEach(w => {
      const past = U.key(w.end) < today;
      list.appendChild(h('<div class="bc-wk' + (past ? ' past' : '') + '"><div class="kv" style="border:0;padding:0"><span>Paycheck ' + U.DAY_NAMES[w.start.getDay()].slice(0, 3) + ' ' + U.fmtDateShort(w.start) + '</span><span class="num">' + (w.total ? U.money(w.total) : '<span class="muted">none</span>') + '</span></div>' +
        '<div class="bar"><i style="width:' + (w.total / max * 100).toFixed(1) + '%"></i></div>' + (w.items.length ? '<small>' + w.items.map(x => U.esc(x.name)).join(', ') + '</small>' : '') + '</div>'));
    });
    wrap.appendChild(list);
    const undated = (M().bills || []).filter(b => b.amount != null && !b.dueDay);
    if (undated.length) wrap.appendChild(h('<p class="small" style="margin:10px 0 0">No due day yet: ' + undated.map(b => U.esc(b.name)).join(', ') + '. Grok adds them when it sees them come out.</p>'));
    return wrap;
  }
  function subsSheet(subs) {
    ui.sheet({ title: 'Subscriptions', kicker: subs.length + ' a month', render(api) {
      const tot = U.sum(subs.map(perMonth));
      api.body.appendChild(h('<div class="figure"><div class="v num">' + U.money(tot * 12) + '</div><div class="k">A year</div><div class="sub">' + U.money(tot, { cents: true }) + ' a month</div></div>'));
      const cd = h('<div class="card"></div>');
      subs.slice().sort((a, b) => perMonth(b) - perMonth(a)).forEach(b => cd.appendChild(h('<div class="row"><span class="tx"><b>' + U.esc(b.name) + '</b><small>' + (b.dueDay ? 'comes out the ' + ord(b.dueDay) : 'no due day yet') + ' · ' + U.money(perMonth(b) * 12) + ' a year</small></span><span class="num">' + U.money(perMonth(b), { cents: true }) + '</span></div>')));
      api.body.appendChild(cd);
    } });
  }
  let calOff = 0;
  function billsSec(n) {
    const bills = M().bills || [], monthly = U.sum(bills.map(perMonth));
    const sec = h('<div class="sec"><div class="sh"><span class="r">' + U.roman(n) + '</span><span class="t">Bills</span><span class="c num">' + U.money(monthly) + ' a month</span></div></div>');
    const card = h('<div class="card pad"></div>'); sec.appendChild(card);
    const draw = () => { card.innerHTML = ''; card.appendChild(billCal(calOff, o => { calOff = o; draw(); })); };
    draw();
    const subs = bills.filter(b => b.sub && b.amount != null);
    if (subs.length) {
      const t = U.sum(subs.map(perMonth));
      const r = h('<div class="card" style="margin-top:10px"><div class="row tap"><span class="tx"><b>Subscriptions</b><small>' + subs.length + ' of them · ' + U.money(t * 12) + ' a year</small></span><span class="num">' + U.money(t, { cents: true }) + '<span class="muted"> /mo</span></span></div></div>');
      r.querySelector('.row').onclick = () => subsSheet(subs);
      sec.appendChild(r);
    }
    return sec;
  }

  /* ---------- one week: where it went, by group; tap a store to sort it or mark it one-off ---------- */
  function weekSheet(we) {
    ui.sheet({ title: 'Where it went', kicker: 'Week ending ' + U.fmtDateShort(we), full: true, onClose: () => Opus.refresh(), render(api) {
      const b = api.body, w = (Store.data.money.weeks || []).find(x => x.weekEnding === we); if (!w) return;
      const spent = weekSpent(w), every = weekEveryday(w);
      b.appendChild(h('<div class="figure"><div class="v num">' + U.money(spent) + '</div><div class="k">Spent</div><div class="sub">' + (spent - every > .005 ? U.money(every) + ' everyday · ' + U.money(spent - every) + ' one-off' : 'Tap a store to sort it or mark it one-off') + '</div></div>'));
      const groups = new Map();
      const R = Opus.receipts, rOf = x => R ? R.receiptFor(we, x) : null;
      spentOf(w).forEach(x => { const rc = rOf(x), g = groupOf(x.cat) || (rc && rc.group) || 'Not sorted yet'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x); });
      const order = [...groups.keys()].sort((a, b) => (a === 'Not sorted yet') - (b === 'Not sorted yet') || U.sum(groups.get(b).map(x => x.amount)) - U.sum(groups.get(a).map(x => x.amount)));
      const card = h('<div class="card"></div>');
      order.forEach(g => {
        const items = groups.get(g), tot = U.sum(items.map(x => x.amount));
        card.appendChild(h('<div class="wg"><div class="kv" style="border:0;padding:0"><span' + (g === 'Not sorted yet' ? ' style="color:var(--warn)"' : '') + '>' + U.esc(g) + '</span><span class="num">' + U.money(tot, { cents: true }) + '</span></div><div class="bar"><i style="width:' + (spent ? tot / spent * 100 : 0).toFixed(1) + '%"></i></div></div>'));
        items.forEach(x => {
          const one = isOneOff(we, x);
          const r = h('<div class="row tap wg-i"><span class="tx"><b>' + U.esc(x.cat) + '</b>' + (one ? '<small style="color:var(--gold-2)">one-off</small>' : '') + '</span><span class="num">' + U.money(x.amount, { cents: true }) + '</span></div>');
          r.onclick = () => itemSheet(we, x, () => api.rerender());
          card.appendChild(r);
          const rc = rOf(x);
          if (rc) { const l = h('<button type="button" class="row tap wg-i rc-under"><span class="tx"><small></small></span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'); l.querySelector('small').textContent = 'Receipt · ' + rc.items.slice(0, 3).map(i => i.name).join(', ') + (rc.items.length > 3 ? ' and ' + (rc.items.length - 3) + ' more' : ''); l.onclick = () => R.open(rc.id, () => api.rerender()); card.appendChild(l); }
        });
      });
      if (!spentOf(w).length) card.appendChild(h('<p class="empty">No spending logged this week.</p>'));
      const un = R ? R.unmatchedIn(we) : [];
      if (un.length) {
        card.appendChild(h('<div class="wg"><div class="kv" style="border:0;padding:0"><span>Receipts not in the bank log yet</span><span class="num">' + U.money(U.sum(un.map(R.fromAccounts)), { cents: true }) + '</span></div></div>'));
        un.forEach(rc => { const l = h('<button type="button" class="row tap wg-i"><span class="tx"><b></b><small></small></span><span class="num"></span></button>'); l.querySelector('b').textContent = rc.store; l.querySelector('small').textContent = U.fmtDateShort(rc.date) + ' · ' + rc.items.length + ' items'; l.querySelector('.num').textContent = U.money(R.fromAccounts(rc), { cents: true }); l.onclick = () => R.open(rc.id, () => api.rerender()); card.appendChild(l); });
      }
    movedCard(w, card);
      b.appendChild(card);
      const more = h('<div class="card" style="margin-top:12px"></div>');
      const kv = (k, v) => more.appendChild(h('<div class="kv"><span>' + k + '</span><span class="num">' + v + '</span></div>'));
      if (w.paycheck != null) kv('Paycheck', U.money(w.paycheck, { cents: true }));
      (w.bills || []).forEach(x => kv('Bill · ' + U.esc(x.name), U.money(x.amount, { cents: true })));
      (w.debtPayments || []).forEach(x => kv('To debt · ' + U.esc(x.name), U.money(x.amount, { cents: true })));
      if (more.children.length) b.appendChild(more);
      (w.notes || []).forEach(t => b.appendChild(h('<div class="g-take" style="margin-top:10px"><div class="tag">' + (w.by === 'grok' || w.source === 'grok' ? 'Grok’s note' : 'Note') + '</div><div>' + U.esc(t) + '</div></div>')));
    } });
  }
  function itemSheet(we, x, done) {
    ui.sheet({ title: x.cat, kicker: U.money(x.amount, { cents: true }) + ' · week ending ' + U.fmtDateShort(we), render(api) {
      const b = api.body, cur = groupOf(x.cat);
      b.appendChild(h('<div class="sh"><span class="t">Group</span></div>'));
      const chips = h('<div class="chips"></div>');
      GROUPS.forEach(g => { const c = h('<button class="chip' + (g === cur ? ' on' : '') + '" type="button">' + U.esc(g) + '</button>'); c.onclick = () => { setGroup(x.cat, g === cur ? null : g); api.close(); ui.toast(g === cur ? 'Unsorted' : 'Every ' + x.cat + ' goes to ' + g); done && done(); }; chips.appendChild(c); });
      b.appendChild(chips);
      b.appendChild(h('<p class="small">Sorting a store sorts it in every week, and Grok sees it.</p>'));
      const one = isOneOff(we, x);
      const t = h('<button class="btn ' + (one ? '' : 'quiet ') + 'block" type="button" style="margin-top:6px">' + (one ? 'Count it as everyday again' : 'Mark as one-off') + '</button>');
      t.onclick = () => { setOneOff(we, x, !one); api.close(); ui.toast(one ? 'Counted as everyday' : 'Left out of your average week'); done && done(); };
      b.appendChild(t);
      b.appendChild(h('<p class="small">A one-off stays in the week’s total but is left out of your average week.</p>'));
    } });
  }

  /* ---------- credit: scores and what drives them (money.credit, from Grok's reads of the owner's credit report) ---------- */
  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  const toneOf = r => !r ? '' : /needs work|fair|poor|bad/i.test(r) ? 'var(--warn)' : /excellent|good/i.test(r) ? 'var(--good)' : '';
  const ymd = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? U.parseKey(v) : null;
  const dateY = v => { const d = ymd(v); return !d ? '—' : U.fmtDateShort(v) + (d.getFullYear() !== new Date().getFullYear() ? ', ' + d.getFullYear() : ''); };
  // when an installment loan's last payment falls: opened + term
  function endsOf(d) {
    const o = ymd(d.opened), t = Number(d.termMonths);
    if (!o || !(t > 0)) return null;
    return new Date(o.getFullYear(), o.getMonth() + t, 1);
  }
  function debtExtras(d, noEnd) {
    const out = [];
    if (d.limit > 0 && d.balance != null) out.push(Math.round(d.balance / d.limit * 100) + '% of ' + U.money(d.limit) + ' limit');
    const e = noEnd ? null : endsOf(d); if (e && !(d.balance === 0)) out.push('last payment ~' + monShort(e));
    return out;
  }
  function debtFacts(d) {
    const f = [];
    if (d.lender) f.push(['Lender', U.esc(d.lender)]);
    if (d.limit != null) f.push(['Credit limit', U.money(d.limit)]);
    if (d.highest != null) f.push(['Highest balance', U.money(d.highest)]);
    if (d.termMonths != null) f.push(['Term', d.termMonths + ' months']);
    if (ymd(d.opened)) f.push(['Opened', dateY(d.opened)]);
    const e = endsOf(d); if (e) f.push(['Last payment due', 'around ' + monthYear(e)]);
    if (ymd(d.lastPayment)) f.push(['Last paid', dateY(d.lastPayment)]);
    if (d.onTime != null) f.push(['Payment history', d.onTime === true ? '<span style="color:var(--good)">All on time</span>' : d.onTime === false ? '<span style="color:var(--warn)">Some late</span>' : U.esc(String(d.onTime))]);
    if (Array.isArray(d.loans) && d.loans.length) {
      const nums = d.loans.map(x => typeof x === 'number' ? x : x && x.balance).filter(x => typeof x === 'number');
      f.push([d.loans.length + ' loans', nums.map(x => U.money(x)).join(' · ')]);
    }
    if (ymd(d.reported)) f.push(['Balance reported', dateY(d.reported)]);
    return f;
  }
  function creditSec(n) {
    const cr = M().credit;
    if (!isObj(cr)) return null;
    const scores = (Array.isArray(cr.scores) ? cr.scores : []).filter(x => x && typeof x.score === 'number');
    const factors = (Array.isArray(cr.factors) ? cr.factors : []).filter(x => x && x.name);
    const cards = (Array.isArray(cr.cards) ? cr.cards : []).filter(x => x && x.name);
    const inq = (Array.isArray(cr.inquiries) ? cr.inquiries : []).filter(x => x && (x.lender || x.date));
    if (!scores.length && !factors.length && !cards.length) return null;
    const sec = h('<div class="sec"><div class="sh"><span class="r">' + U.roman(n) + '</span><span class="t">Credit</span><span class="c">' + (ymd(cr.asOf) ? 'as of ' + U.fmtDateShort(cr.asOf) : '') + '</span></div></div>');
    const card = h('<div class="card pad"></div>');
    if (scores.length) {
      const g = h('<div class="grid2" style="gap:8px"></div>');
      scores.slice(0, 4).forEach(x => {
        const ch = typeof x.change === 'number' && x.change ? '<span style="color:' + (x.change > 0 ? 'var(--good)' : 'var(--warn)') + '">' + (x.change > 0 ? '▲ ' : '▼ ') + Math.abs(x.change) + '</span>' : null;
        g.appendChild(h('<div class="figure"><div class="v num">' + x.score + '</div><div class="k">' + U.esc(x.bureau || 'Score') + '</div><div class="sub">' + [ch, x.band ? '<span style="color:' + (toneOf(x.band) || 'var(--dim)') + '">' + U.esc(x.band) + '</span>' : null].filter(Boolean).join(' · ') + '</div></div>'));
      });
      card.appendChild(g);
      // score history, once there is more than one read
      const hist = (Array.isArray(cr.history) ? cr.history : []).filter(x => x && ymd(x.date) && isObj(x.scores)).sort((a, b) => a.date.localeCompare(b.date));
      const b0 = scores[0].bureau, pts = hist.map(x => ({ date: x.date, v: x.scores[b0] })).filter(x => typeof x.v === 'number');
      if (pts.length > 1) {
        const d = pts[pts.length - 1].v - pts[0].v;
        const row = h('<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0 2px"><span class="small">' + U.esc(b0) + ' ' + (d === 0 ? 'unchanged' : (d > 0 ? 'up ' : 'down ') + Math.abs(d)) + ' since ' + U.fmtDateShort(pts[0].date) + '</span><span class="spk">' + ui.spark(pts.slice(-20), { w: 110, h: 30 }) + '</span></div>');
        card.appendChild(row);
      }
    }
    const list = h('<div></div>');
    factors.forEach(x => {
      const sub = [x.rating ? '<span style="color:' + (toneOf(x.rating) || 'var(--dim)') + '">' + U.esc(x.rating) + '</span>' : null, x.impact ? U.esc(x.impact) + ' impact' : null, x.note ? U.esc(x.note) : null].filter(Boolean).join(' · ');
      const isInq = /inquir/i.test(x.name) && inq.length;
      const r = h('<div class="row' + (isInq ? ' tap' : '') + '"><span class="tx"><b>' + U.esc(x.name) + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="num" style="font-weight:600">' + U.esc(x.value == null ? '—' : String(x.value)) + '</span></div>');
      if (isInq) r.onclick = () => inquiries(inq);
      list.appendChild(r);
    });
    if (inq.length && !factors.some(x => /inquir/i.test(x.name))) { const r = h('<div class="row tap"><span class="tx"><b>Hard inquiries</b></span><span class="num" style="font-weight:600">' + inq.length + '</span></div>'); r.onclick = () => inquiries(inq); list.appendChild(r); }
    if (typeof cr.netWorth === 'number') list.appendChild(h('<div class="row"><span class="tx"><b>Net worth</b><small>the credit report’s estimate</small></span><span class="num" style="font-weight:600">' + (cr.netWorth < 0 ? '−' : '') + U.money(Math.abs(cr.netWorth)) + '</span></div>'));
    if (cards.length) {
      list.appendChild(h('<div class="row" style="min-height:0;padding:12px 0 4px"><span class="tx"><small>Open cards not in your debts</small></span></div>'));
      cards.forEach(x => list.appendChild(h('<div class="row"><span class="tx"><b>' + U.esc(x.name) + '</b><small>' + [x.limit != null ? U.money(x.limit) + ' limit' : null, x.limit > 0 && x.balance != null ? Math.round(x.balance / x.limit * 100) + '% used' : null].filter(Boolean).join(' · ') + '</small></span><span class="num">' + (x.balance == null ? '—' : U.money(x.balance)) + '</span></div>')));
    }
    if (list.children.length) { list.style.marginTop = scores.length ? '8px' : '0'; card.appendChild(list); }
    if (cr.source) { const p = h('<p class="small" style="margin-top:10px"></p>'); p.textContent = 'From ' + cr.source + '. Grok updates this when you share a new report.'; card.appendChild(p); }
    sec.appendChild(card);
    return sec;
  }
  function inquiries(inq) {
    ui.sheet({ title: 'Hard inquiries', kicker: 'Lenders who checked your credit', render(api) {
      const c = h('<div class="card"></div>');
      inq.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).forEach(x => {
        const age = ymd(x.date) ? U.daysBetween(U.parseKey(x.date), new Date()) : null;
        c.appendChild(h('<div class="row"><span class="tx"><b>' + U.esc(x.lender || 'Lender') + '</b><small>' + (age != null ? (age < 730 ? 'drops off your report around ' + monShort(new Date(U.parseKey(x.date).getFullYear() + 2, U.parseKey(x.date).getMonth(), 1)) : 'over two years old') : '') + '</small></span><span class="num">' + dateY(x.date) + '</span></div>'));
      });
      api.body.appendChild(c);
      api.body.appendChild(h('<p class="small">A hard inquiry stays on a report for two years and counts toward scores for about one.</p>'));
    } });
  }

  /* ---------- the tab ---------- */
  function render(v) {
    const c = calc(), m = M();
    v.appendChild(h('<div class="top"><div><div class="eyebrow">Week ending ' + U.DAY_NAMES[weekEnding().getDay()].slice(0, 3) + ', ' + U.fmtDateShort(weekEnding()) + '</div><div class="title">Money</div></div></div>'));
    v.appendChild(cashHero());
    v.appendChild(beforePayday());

    const ds = h('<div class="sec"><div class="sh"><span class="r">II</span><span class="t">Debts</span><span class="c">payoff order</span></div></div>');
    const total = U.sum(CD().map(d => d.balance).filter(x => x != null)), dh = debtHistory();
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
    wk.appendChild(weekCard());
    if (Opus.receipts) { const gc = Opus.receipts.groceriesCard(); gc.style.marginTop = '12px'; wk.appendChild(gc); }
    v.appendChild(wk);

    const isDay = m.checkInDay === U.dayKey(new Date());
    const ck = h('<div class="next"><div class="body"><div class="k">' + (c.cur ? (c.cur.by === 'grok' ? 'Logged by Grok' : 'Check-in done') : isDay ? 'Today' : U.DAY_NAMES[U.DAYS.indexOf(m.checkInDay || 'fri')]) + '</div><div class="h">' + U.DAY_NAMES[U.DAYS.indexOf(m.checkInDay || 'fri')] + ' check-in</div><div class="s">' + (c.cur ? U.money(weekSpent(c.cur), { cents: true }) + ' spent this week' : 'Grok logs the week, you look it over') + '</div></div><button class="btn' + (c.cur ? ' ghost sm' : '') + '" type="button">' + (c.cur ? 'Open' : 'Start') + '</button></div>');
    ck.querySelector('.btn').onclick = checkIn; v.appendChild(ck);

    v.appendChild(billsSec(4));

    const ws = weeks().slice(-8).reverse();
    const hs = h('<div class="sec"><div class="sh"><span class="r">V</span><span class="t">Recent weeks</span></div><div class="card"></div></div>');
    if (!ws.length) hs.querySelector('.card').appendChild(h('<p class="empty">Each weekly check-in adds a week here.</p>'));
    else {
      const pts = weeks().map(w => ({ date: w.weekEnding, v: weekSpent(w) }));
      if (pts.length > 1) { const box = h('<div style="padding:12px 0 4px"></div>'); box.appendChild(ui.chart(pts, { h: 90, fmt: x => U.money(x) })); hs.querySelector('.card').appendChild(box); }
      ws.forEach(w => {
        const one = weekSpent(w) - weekEveryday(w), unsorted = spentOf(w).filter(x => !groupOf(x.cat)).length;
        const r = h('<div class="row tap"><span class="tx"><b>Week ending ' + U.fmtDateShort(w.weekEnding) + '</b><small>' + [w.paycheck != null ? 'Pay ' + U.money(w.paycheck, { cents: true }) : null, one > .005 ? 'incl. ' + U.money(one) + ' one-off' : null, unsorted ? '<span style="color:var(--warn)">' + unsorted + ' to sort</span>' : null, w.by === 'grok' || w.source === 'grok' ? 'from Grok' : 'by hand'].filter(Boolean).join(' · ') + '</small></span><span class="num">' + U.money(weekSpent(w), { cents: true }) + '</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>');
        r.onclick = () => weekSheet(w.weekEnding);
        hs.querySelector('.card').appendChild(r);
      });
    }
    v.appendChild(hs);

    const cs = creditSec(6); if (cs) v.appendChild(cs);

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
