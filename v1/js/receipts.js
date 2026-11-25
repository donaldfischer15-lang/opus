/* Opus — receipts (since 1.29.0)
   A store receipt with its line items, kept under the spending it explains. Grok logs spending from the bank by store and
   amount; a receipt says what was in it. The two are matched (same store, same amount from the accounts, same pay week
   or the one after, since a debit can post a day or two late), so a purchase is never counted twice.
   Store.data.receipts: [{ id, date, time, store, items: [{ name, text, amount, qty, for }], subtotal, tax, total,
     paid: [{ how, amount }], earned, group, at, by }]
   "for" on an item is the grocery-list line it bought. A receipt never keeps card, reference, approval, terminal or
   transaction numbers: anything with six or more digits in a row is cut out before it is saved. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const M = () => Plan.p.money || {};
  const skey = x => String(x || '').trim().toLowerCase();
  const letters = x => skey(x).replace(/['’]s\b/g, 's').replace(/[^a-z0-9]/g, '');
  const cents = n => Math.round(n * 100) / 100;

  /* ---------- the list ---------- */
  const all = () => (Store.data.receipts = Array.isArray(Store.data.receipts) ? Store.data.receipts : []);
  const list = () => all().slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  const byId = id => all().find(r => r.id === id) || null;
  const idFor = r => r.date + '-' + String(r.time || '0000').replace(':', '') + '-' + (skey(r.store).replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'store');
  // six or more digits in a row (with spaces or dashes) and masked card digits never stay
  const scrub = v => v == null ? null : String(v).replace(/[#*xX]*\d[\d\s-]{5,}\d/g, '').replace(/[*xX#•]{2,}\s*\d+/g, '').replace(/\s+/g, ' ').trim() || null;
  const isNum = v => typeof v === 'number' && isFinite(v);
  function clean(r) {
    const o = { id: r.id || null, date: r.date, time: r.time || null, store: scrub(r.store) || 'Store',
      items: (r.items || []).filter(x => x && isNum(x.amount) && scrub(x.name)).map(x => Object.assign({ name: scrub(x.name), amount: cents(x.amount) }, scrub(x.text) ? { text: scrub(x.text) } : {}, isNum(x.qty) && x.qty > 0 ? { qty: x.qty } : {}, x.for ? { for: String(x.for) } : {})),
      subtotal: isNum(r.subtotal) ? cents(r.subtotal) : null, tax: isNum(r.tax) ? cents(r.tax) : null, total: isNum(r.total) ? cents(r.total) : null,
      paid: (r.paid || []).filter(x => x && isNum(x.amount) && scrub(x.how)).map(x => ({ how: scrub(x.how), amount: cents(x.amount) })),
      earned: isNum(r.earned) && r.earned > 0 ? cents(r.earned) : null, group: r.group || 'Groceries', at: r.at || new Date().toISOString() };
    if (o.total == null) o.total = cents(U.sum(o.items.map(x => x.amount)) + (o.tax || 0));
    if (!o.id) o.id = idFor(o);
    if (r.from) o.from = r.from;
    return o;
  }
  function save(r, edited) {
    const L = all(), i = L.findIndex(x => x.id === r.id);
    const o = clean(r);
    if (i >= 0 && L[i].by === 'grok') o.from = 'grok'; // changed on the phone: the phone's copy is kept from now on
    if (edited || i < 0) o.at = new Date().toISOString();
    if (i >= 0) L[i] = o; else L.push(o);
    const dl = Store.data.deleted = Store.data.deleted || {}; if (dl.receipts) delete dl.receipts[o.id];
    Store.save();
    return o;
  }
  function remove(id) {
    const L = all(), i = L.findIndex(x => x.id === id); if (i < 0) return null;
    const [r] = L.splice(i, 1);
    const dl = Store.data.deleted = Store.data.deleted || {}; (dl.receipts = dl.receipts || {})[id] = new Date().toISOString();
    Store.save();
    return r;
  }

  /* ---------- money ---------- */
  // store rewards and gift cards were already money spent once, so only the rest came out of the accounts
  const rewardish = how => /reward|store cash|sam['’]?s cash|gift|points|perk|bonus cash|credit balance/i.test(how || '');
  const rewardsPaid = r => cents(U.sum((r.paid || []).filter(p => rewardish(p.how)).map(p => p.amount)));
  const fromAccounts = r => cents(Math.max(0, (r.total || 0) - rewardsPaid(r)));
  const whenOf = r => { const d = U.parseKey(r.date); if (r.time && /^\d\d:\d\d$/.test(r.time)) d.setHours(+r.time.slice(0, 2), +r.time.slice(3)); else d.setHours(12); return d; };
  function weekEnding(d) {
    const pd = U.DAYS.indexOf(M().payday || 'fri');
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    while (x.getDay() !== pd) x.setDate(x.getDate() + 1);
    return x;
  }
  const weekOf = r => U.key(weekEnding(U.parseKey(r.date)));
  const weeksL = () => Store.data.money.weeks || [];
  const sameStore = (cat, store) => { const a = letters(cat), b = letters(store); return !!a && !!b && (a.includes(b) || b.includes(a)); };
  /* the bank line a receipt explains: the same store, the same amount from the accounts (or the whole total), in the
     receipt's pay week or the next one. Each bank line explains one receipt at most. */
  function matches() {
    const out = new Map(), used = new Set();
    for (const r of list().slice().reverse()) {
      const we0 = weekOf(r), we1 = U.key(U.addDays(U.parseKey(we0), 7)), want = [fromAccounts(r), r.total];
      let hit = null;
      for (const we of [we0, we1]) {
        const w = weeksL().find(x => x.weekEnding === we); if (!w) continue;
        (w.spent || []).forEach((x, n) => { if (hit || !x || x.transfer || !isNum(x.amount) || used.has(we + '#' + n)) return; if (sameStore(x.cat, r.store) && want.some(a => Math.abs(a - x.amount) < 0.011)) hit = { we, n, x }; });
        if (hit) break;
      }
      if (hit) { used.add(hit.we + '#' + hit.n); out.set(r.id, hit); }
    }
    return out;
  }
  const matchOf = r => matches().get(r.id) || null;
  const receiptFor = (we, x) => { for (const [id, m] of matches()) if (m.we === we && m.x === x) return byId(id); return null; };
  // receipts from a pay week that the bank log doesn't show yet
  function unmatchedIn(we) { const m = matches(); return list().filter(r => weekOf(r) === we && !m.has(r.id)); }
  /* groceries this pay week: the bank's Groceries lines plus receipts not in the bank yet */
  function weekGroceries(we) {
    we = we || U.key(weekEnding(new Date()));
    const groupOf = name => (M().spendGroups || {})[skey(name)] || null;
    const w = weeksL().find(x => x.weekEnding === we), m = matches();
    const lines = [];
    if (w) (w.spent || []).forEach(x => {
      if (!x || x.transfer || !isNum(x.amount)) return;
      const r = receiptFor(we, x), g = groupOf(x.cat) || (r ? r.group : null);
      if (g === 'Groceries') lines.push({ name: x.cat, amount: x.amount, receipt: r, bank: true });
    });
    for (const r of list()) if (weekOf(r) === we && !m.has(r.id) && r.group === 'Groceries') lines.push({ name: r.store, amount: fromAccounts(r), receipt: r, bank: false });
    const fb = (Plan.p.food || {}).budgetPerWeek || {};
    return { we, lines, spent: cents(U.sum(lines.map(x => x.amount))), low: fb.low, high: fb.high };
  }
  // receipts after the newest cash reading, so "Yours this week" doesn't count money that's already gone
  function sinceCash(c) {
    if (!c) return [];
    const t = c.at ? new Date(c.at).getTime() : U.parseKey(c.date).getTime() + 12 * 36e5;
    return list().filter(r => whenOf(r).getTime() > t && fromAccounts(r) > 0 && U.daysBetween(whenOf(r), new Date()) <= 10);
  }

  /* ---------- the grocery list: what a receipt bought ---------- */
  const STOP = new Set(['member', 'members', 'mark', 'mm', 'organic', 'the', 'of', 'and', 'sams', 'club', 'great', 'value', 'kirkland', 'signature', 'fresh', 'pack', 'lb', 'oz', 'ct']);
  const words = s => skey(s).replace(/\(.*?\)/g, ' ').replace(/['’]s\b/g, 's').split(/[^a-z]+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  const foodWeek = r => U.key(U.weekStart(U.parseKey(r.date)));
  // a receipt's linked lines tick the grocery list once; unticking by hand afterwards sticks
  function tickInto(d, r) {
    const want = (r.items || []).map(x => x.for).filter(Boolean); if (!want.length) return 0;
    const st = d.settings = d.settings || {}, done = st.receiptTicked = st.receiptTicked || {}, had = done[r.id] = done[r.id] || [];
    const gs = d.groceries = d.groceries || {}, wk = foodWeek(r), checked = gs[wk] = gs[wk] || [];
    let n = 0; want.forEach(f => { if (had.includes(f)) return; had.push(f); if (!checked.includes(f)) { checked.push(f); n++; } });
    return n;
  }
  const listItems = d => { try { return Plan.groceryList(d).reduce((a, g) => a.concat(g.items.map(i => i.item)), []); } catch (e) { return []; } };
  // one receipt line per list line, best matches first; the owner confirms them
  function suggest(r) {
    const items = listItems(U.parseKey(r.date)), pairs = [];
    r.items.forEach((x, n) => {
      const a = words(x.name + ' ' + (x.text || '')); if (!a.length) return;
      for (const it of items) {
        const b = words(it), shared = a.filter(w => b.includes(w)).length; if (!shared) continue;
        pairs.push({ n, item: it, score: shared * 2 + (a[a.length - 1] === b[b.length - 1] ? 3 : 0) });
      }
    });
    pairs.sort((p, q) => q.score - p.score);
    const out = new Map(), taken = new Set();
    for (const p of pairs) if (!out.has(p.n) && !taken.has(p.item)) { out.set(p.n, p.item); taken.add(p.item); }
    return { items, out };
  }
  // the last price paid for a grocery-list line, from the receipts that bought it
  function lastPrice(item) {
    for (const r of list()) for (const x of r.items) if (x.for === item) return { amount: x.amount, qty: x.qty || null, date: r.date, store: r.store };
    return null;
  }
  function weekReceipts(d) { const k = U.key(U.weekStart(d)); return list().filter(r => foodWeek(r) === k); }

  /* ---------- sheets ---------- */
  const fmtWhen = r => U.DAY_NAMES[U.parseKey(r.date).getDay()].slice(0, 3) + ', ' + U.fmtDateShort(r.date) + (r.time ? ' · ' + U.fmtTimeAP(r.time) : '');
  function rowFor(r, onOpen) {
    const m = matchOf(r);
    const row = h('<button type="button" class="row tap rc-row"><span class="tx"><b></b><small></small></span><span class="num"></span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>');
    row.querySelector('b').textContent = r.store;
    row.querySelector('small').textContent = fmtWhen(r) + ' · ' + r.items.length + ' item' + (r.items.length === 1 ? '' : 's') + (m ? ' · in the bank log' : '');
    row.querySelector('.num').textContent = U.money(r.total, { cents: true });
    row.onclick = () => open(r.id, onOpen);
    return row;
  }
  function open(id, onDone) {
    let r = byId(id); if (!r) return;
    ui.sheet({ title: r.store, kicker: 'Receipt · ' + fmtWhen(r), full: true, onClose: () => { onDone && onDone(); Opus.refresh(); }, render(api) {
      r = byId(id); const b = api.body; if (!r) { api.close(); return; }
      const acct = fromAccounts(r), rw = rewardsPaid(r), m = matchOf(r);
      b.appendChild(h('<div class="figure"><div class="v num">' + U.money(r.total, { cents: true }) + '</div><div class="k">' + U.esc(r.group || 'Spent') + '</div><div class="sub">' + U.esc(r.items.length + ' item' + (r.items.length === 1 ? '' : 's') + (rw ? ' · ' + U.money(acct, { cents: true }) + ' from your accounts' : '')) + '</div></div>'));
      const card = h('<div class="card rc-items"></div>');
      r.items.forEach(x => {
        const row = h('<div class="row"><span class="tx"><b></b><small></small></span><span class="num"></span></div>');
        row.querySelector('b').textContent = x.name;
        row.querySelector('small').textContent = [x.text && skey(x.text) !== skey(x.name) ? x.text : null, x.qty ? x.qty + ' of them' : null, x.for ? 'for ' + x.for : null].filter(Boolean).join(' · ');
        row.querySelector('.num').textContent = U.money(x.amount, { cents: true });
        card.appendChild(row);
      });
      const kv = (k, v, cls) => card.appendChild(h('<div class="kv ' + (cls || '') + '"><span>' + k + '</span><span class="num">' + v + '</span></div>'));
      if (r.subtotal != null && r.subtotal !== r.total) kv('Subtotal', U.money(r.subtotal, { cents: true }));
      if (r.tax) kv('Tax', U.money(r.tax, { cents: true }));
      kv('Total', U.money(r.total, { cents: true }), 'total');
      const sum = cents(U.sum(r.items.map(x => x.amount)) + (r.tax || 0));
      if (Math.abs(sum - r.total) > 0.011) card.appendChild(h('<p class="small" style="color:var(--warn);margin:8px 0 0">The items add up to ' + U.money(sum, { cents: true }) + ', not ' + U.money(r.total, { cents: true }) + '. Edit to fix a line.</p>'));
      b.appendChild(card);
      if (r.paid.length || r.earned) {
        const pc = h('<div class="card" style="margin-top:12px"></div>');
        r.paid.forEach(p => pc.appendChild(h('<div class="kv"><span>Paid · ' + U.esc(p.how) + (rewardish(p.how) ? ' <span class="muted">rewards</span>' : '') + '</span><span class="num">' + U.money(p.amount, { cents: true }) + '</span></div>')));
        if (r.earned) pc.appendChild(h('<div class="kv"><span>Rewards earned</span><span class="num">' + U.money(r.earned, { cents: true }) + '</span></div>'));
        b.appendChild(pc);
      }
      b.appendChild(h('<div class="g-take" style="margin-top:12px"><div class="tag">Money</div><div>' + (m
        ? 'This is the ' + U.esc(m.x.cat) + ' line of ' + U.money(m.x.amount, { cents: true }) + ' in the week ending ' + U.fmtDateShort(m.we) + ', so it counts once.'
        : 'Counted as ' + U.money(acct, { cents: true }) + ' of ' + U.esc((r.group || 'spending').toLowerCase()) + ' in the week ending ' + U.fmtDateShort(weekOf(r)) + '. When Grok logs it from your bank, Opus matches the two and counts it once.') + '</div></div>'));

      // what it bought on the grocery list
      const sg = suggest(r);
      if (sg.items.length && r.group === 'Groceries') {
        const linked = r.items.filter(x => x.for).length;
        const gl = h('<div class="sec" style="margin-top:14px"><div class="sh"><span class="t">Grocery list</span><span class="c">' + (linked ? linked + ' linked' : '') + '</span></div></div>');
        const btn = h('<button class="btn quiet block" type="button">' + (linked ? 'Change what it bought' : 'Tick what it bought') + '</button>');
        btn.onclick = () => linkSheet(r.id, () => api.rerender());
        gl.appendChild(btn);
        gl.appendChild(h('<p class="small">Ticks them off this week’s list and shows the price next time you shop.</p>'));
        b.appendChild(gl);
      }
      const acts = h('<div class="btns" style="margin-top:14px"><button class="btn quiet" type="button">Edit</button><button class="btn danger" type="button">Delete</button></div>');
      acts.children[0].onclick = () => form(r, x => { save(x, true); api.rerender(); ui.toast('Receipt saved'); });
      acts.children[1].onclick = async () => {
        const ok = await ui.ask({ title: 'Delete this receipt?', text: 'The ' + r.store + ' receipt from ' + U.fmtDateShort(r.date) + ' goes. Spending the bank logged stays.', yes: 'Delete', danger: true });
        if (!ok) return; const gone = remove(r.id); api.close();
        ui.toast('Receipt deleted', { label: 'Undo', run: () => { const dl = Store.data.deleted.receipts || {}; delete dl[gone.id]; all().push(gone); Store.save(); Opus.refresh(); } });
      };
      b.appendChild(acts);
    } });
  }
  function linkSheet(id, done) {
    const r = byId(id); if (!r) return;
    const sg = suggest(r), pick = r.items.map((x, n) => x.for || sg.out.get(n) || null);
    ui.sheet({ title: 'What it bought', kicker: r.store + ' · ' + U.fmtDateShort(r.date), foot: true, render(api) {
      const b = api.body; b.innerHTML = '';
      b.appendChild(h('<p class="note">Each line on the receipt, and the grocery-list item it was for. Tap one to change it.</p>'));
      const card = h('<div class="card"></div>');
      r.items.forEach((x, n) => {
        const row = h('<button type="button" class="row tap"><span class="tx"><b></b><small></small></span></button>');
        row.querySelector('b').textContent = x.name + ' · ' + U.money(x.amount, { cents: true });
        const sm = row.querySelector('small'); sm.textContent = pick[n] ? 'for ' + pick[n] : 'not on the list'; if (!pick[n]) sm.classList.add('muted');
        row.onclick = () => ui.sheet({ title: x.name, kicker: 'Which list item?', render(a2) {
          const c = h('<div class="chips"></div>');
          const opt = (label, val) => { const ch = h('<button class="chip' + (pick[n] === val ? ' on' : '') + '" type="button"></button>'); ch.textContent = label; ch.onclick = () => { if (val) pick.forEach((p, i) => { if (p === val && i !== n) pick[i] = null; }); pick[n] = val; a2.close(true); api.rerender(); }; c.appendChild(ch); };
          sg.items.forEach(it => opt(it, it)); opt('Not on the list', null);
          a2.body.appendChild(c);
        } });
        card.appendChild(row);
      });
      b.appendChild(card);
      api.foot.innerHTML = '';
      const sv = h('<button class="btn block" type="button">Save and tick them off</button>');
      sv.onclick = () => {
        const x = Object.assign({}, r, { items: r.items.map((it, n) => Object.assign({}, it, { for: pick[n] || undefined })) });
        x.items.forEach(it => { if (!it.for) delete it.for; });
        save(x, true);
        const wk = foodWeek(r), checked = Store.data.groceries[wk] = Store.data.groceries[wk] || [];
        let n = 0; pick.forEach(p => { if (p && !checked.includes(p)) { checked.push(p); n++; } });
        Store.save(); api.close(); done && done();
        ui.toast(n ? 'Ticked ' + n + ' off the list' : 'Saved');
      };
      api.foot.appendChild(sv);
    } });
  }

  /* add or edit: the lines, the total and how it was paid */
  function form(r0, onSave) {
    const r = U.clone(r0 || { date: U.key(), time: null, store: '', items: [], paid: [], group: 'Groceries' });
    if (!r.items.length) r.items.push({ name: '', amount: null });
    ui.sheet({ title: r0 && r0.id ? 'Edit receipt' : 'Check the receipt', kicker: r0 && r0.id ? r0.store : 'Before it’s saved', full: true, foot: true, render(api) {
      const b = api.body; b.innerHTML = '';
      const f = h('<div class="rc-form"><div class="field"><label for="rc-store">Store</label><input class="input" id="rc-store" autocomplete="off"></div>' +
        '<div class="grid2"><div class="field"><label for="rc-date">Date</label><input class="input" id="rc-date" type="date"></div><div class="field"><label for="rc-time">Time <span class="opt">optional</span></label><input class="input" id="rc-time" type="time"></div></div></div>');
      const si = f.querySelector('#rc-store'), di = f.querySelector('#rc-date'), ti = f.querySelector('#rc-time');
      si.value = r.store || ''; di.value = r.date || U.key(); ti.value = r.time || '';
      si.oninput = () => { r.store = si.value; }; di.onchange = () => { r.date = di.value || U.key(); }; ti.onchange = () => { r.time = ti.value || null; };
      b.appendChild(f);
      const groups = h('<div class="chips" style="margin:2px 0 6px"></div>');
      ['Groceries', 'Eating out', 'Pets', 'Home', 'Clothes & gear', 'Health', 'Other'].forEach(g => { const c = h('<button class="chip' + (r.group === g ? ' on' : '') + '" type="button"></button>'); c.textContent = g; c.onclick = () => { r.group = g; groups.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); }; groups.appendChild(c); });
      b.appendChild(groups);
      b.appendChild(h('<div class="sh"><span class="t">Items</span></div>'));
      const items = h('<div class="card rc-lines"></div>'), tot = h('<div class="kv total" style="border-top:0;margin-top:0;padding-top:4px"><span>Items add up to</span><span class="num"></span></div>');
      const upd = () => { tot.querySelector('.num').textContent = U.money(cents(U.sum(r.items.map(x => isNum(x.amount) ? x.amount : 0))), { cents: true }); };
      const line = (x, n) => {
        const row = h('<div class="rc-line"><input class="input" placeholder="Item" autocomplete="off"><input class="input num" inputmode="decimal" placeholder="0.00"><button class="icon-btn" type="button" aria-label="Remove line">' + ui.icon('close') + '</button></div>');
        const [ni, ai, rm] = row.children;
        ni.value = x.name || ''; ai.value = isNum(x.amount) ? x.amount.toFixed(2) : '';
        ni.oninput = () => { x.name = ni.value; };
        ai.oninput = () => { const v = parseFloat(ai.value.replace(/[$,\s]/g, '')); x.amount = isNaN(v) ? null : v; upd(); };
        rm.onclick = () => { r.items.splice(r.items.indexOf(x), 1); row.remove(); upd(); };
        return row;
      };
      r.items.forEach((x, n) => items.appendChild(line(x, n)));
      b.appendChild(items);
      const add = h('<button class="link" type="button" style="align-self:flex-start;padding:8px 2px">+ Add a line</button>');
      add.onclick = () => { const x = { name: '', amount: null }; r.items.push(x); items.appendChild(line(x)); items.lastChild.querySelector('input').focus(); };
      b.appendChild(add);
      const money = h('<div class="card" style="margin-top:6px"></div>');
      money.appendChild(tot);
      const totF = h('<div class="grid2" style="margin-top:10px"><div class="field"><label for="rc-tax">Tax</label><input class="input num" id="rc-tax" inputmode="decimal" placeholder="0.00"></div><div class="field"><label for="rc-total">Total</label><input class="input num" id="rc-total" inputmode="decimal" placeholder="items + tax"></div></div>');
      const xi = totF.querySelector('#rc-tax'), oi = totF.querySelector('#rc-total');
      xi.value = isNum(r.tax) && r.tax ? r.tax.toFixed(2) : ''; oi.value = isNum(r.total) ? r.total.toFixed(2) : '';
      const pn = s => { const v = parseFloat(String(s).replace(/[$,\s]/g, '')); return isNaN(v) ? null : v; };
      xi.oninput = () => { r.tax = pn(xi.value); }; oi.oninput = () => { r.total = pn(oi.value); };
      money.appendChild(totF);
      if (r.paid && r.paid.length) {
        money.appendChild(h('<div class="small" style="margin-top:10px">Paid</div>'));
        r.paid.forEach(p => money.appendChild(h('<div class="kv"><span>' + U.esc(p.how) + (rewardish(p.how) ? ' <span class="muted">rewards, not from your accounts</span>' : '') + '</span><span class="num">' + U.money(p.amount, { cents: true }) + '</span></div>')));
      }
      b.appendChild(money);
      b.appendChild(h('<p class="small">Card, reference and approval numbers are never saved.</p>'));
      upd();
      api.foot.innerHTML = '';
      const sv = h('<button class="btn block" type="button">Save receipt</button>');
      sv.onclick = () => {
        r.items = r.items.filter(x => String(x.name || '').trim() && isNum(x.amount));
        if (!String(r.store || '').trim()) { si.focus(); ui.toast('Add the store'); return; }
        if (!r.items.length && !isNum(r.total)) { ui.toast('Add at least one line or the total'); return; }
        if (!isNum(r.total)) r.total = cents(U.sum(r.items.map(x => x.amount)) + (r.tax || 0));
        if (!r.id) r.id = idFor(r);
        api.close(true); onSave(r);
      };
      api.foot.appendChild(sv);
    } });
  }

  /* add one: a photo the helper reads, or typed in */
  function add(onDone) {
    const S = Opus.snap;
    ui.sheet({ title: 'Add a receipt', kicker: 'Groceries and shopping', render(api) {
      const b = api.body;
      b.appendChild(h('<p class="note">Take a photo of the receipt, flat and in good light, or type it in. You check every line before it’s saved.</p>'));
      const btns = h('<div class="btns"><button class="btn" type="button">Photo of the receipt</button><button class="btn quiet" type="button">Type it in</button></div>');
      btns.children[0].onclick = () => { if (!S || !S.pickPhoto) return; S.pickPhoto(file => { api.close(true); read(file, onDone); }); };
      btns.children[1].onclick = () => { api.close(true); form(null, r => done(r, onDone)); };
      b.appendChild(btns);
    } });
  }
  function done(r, onDone) {
    const o = save(r, true); Opus.refresh(); onDone && onDone(o);
    const m = matchOf(o);
    ui.toast(m ? 'Saved. It matches the bank’s ' + U.money(m.x.amount, { cents: true }) : 'Receipt saved', { label: 'Open', run: () => open(o.id) });
  }
  function read(file, onDone) {
    const S = Opus.snap; let closed = false;
    const api = ui.sheet({ title: 'Reading the receipt', kicker: 'Photo', onClose: () => { closed = true; }, render(a) {
      a.body.appendChild(h('<div class="snap-busy"><span class="snap-spin" aria-hidden="true"></span><span class="t">Reading every line…</span></div>'));
    } });
    (async () => {
      let img; try { img = await S.shrink(file, 1600); } catch (e) { api.body.innerHTML = '<p class="note">' + U.esc(e.message) + '</p>'; return; }
      const res = await S.ask({ mode: 'receipt', image: img });
      if (closed) return;
      if (!res.ok || !res.receipt) {
        api.body.innerHTML = '';
        const p = h('<p class="note"></p>'); p.textContent = (res.error || 'That photo couldn’t be read.') + ' You can type it in instead.'; api.body.appendChild(p);
        const bt = h('<div class="btns"><button class="btn quiet" type="button">Another photo</button><button class="btn" type="button">Type it in</button></div>');
        bt.children[0].onclick = () => S.pickPhoto(f => { api.close(true); read(f, onDone); });
        bt.children[1].onclick = () => { api.close(true); form(null, r => done(r, onDone)); };
        api.body.appendChild(bt);
        return;
      }
      const x = res.receipt;
      api.close(true);
      form({ date: x.date || U.key(), time: x.time, store: x.store || '', items: x.items, subtotal: x.subtotal, tax: x.tax, total: x.total, paid: x.paid, earned: x.earned, group: 'Groceries' }, r => done(r, onDone));
    })();
  }
  function allSheet() {
    ui.sheet({ title: 'Receipts', kicker: list().length + ' kept', full: true, render(api) {
      const b = api.body; b.innerHTML = '';
      const ab = h('<button class="btn block" type="button">Add a receipt</button>'); ab.onclick = () => add(() => api.rerender()); b.appendChild(ab);
      const byMonth = new Map();
      list().forEach(r => { const k = r.date.slice(0, 7); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(r); });
      if (!byMonth.size) b.appendChild(h('<p class="empty">Receipts you add show here.</p>'));
      for (const [k, rs] of byMonth) {
        const d = U.parseKey(k + '-01');
        const sec = h('<div class="sec"><div class="sh"><span class="t">' + U.MONTHS[d.getMonth()] + ' ' + d.getFullYear() + '</span><span class="c num">' + U.money(U.sum(rs.map(fromAccounts))) + '</span></div><div class="card"></div></div>');
        rs.forEach(r => sec.querySelector('.card').appendChild(rowFor(r, () => api.rerender())));
        b.appendChild(sec);
      }
    } });
  }

  /* Money: groceries this pay week against the food budget */
  function groceriesCard() {
    const g = weekGroceries(), card = h('<div class="card pad rc-week"></div>');
    const top = g.high != null ? g.high : g.low;
    const pct = top ? U.clamp(g.spent / top, 0, 1) : 0, over = top != null && g.spent > top + 0.005;
    card.appendChild(h('<div class="rc-head"><div><div class="k">Groceries this week</div><div class="v num">' + U.money(g.spent, { cents: true }) + '</div></div>' +
      (top != null ? '<div class="small" style="text-align:right">of ' + (g.low != null && g.high != null ? U.money(g.low) + '–' + U.money(g.high) : U.money(top)) + '<br>' + (over ? '<span style="color:var(--warn)">' + U.money(g.spent - top) + ' over</span>' : U.money(top - g.spent) + ' left') + '</div>' : '') + '</div>'));
    if (top != null) {
      const bar = h('<div class="bar rc-bar"><i style="width:' + (pct * 100).toFixed(1) + '%"></i>' + (g.low != null && g.high ? '<b style="left:' + (g.low / g.high * 100).toFixed(1) + '%"></b>' : '') + '</div>');
      if (over) bar.classList.add('over');
      card.appendChild(bar);
    }
    const rows = h('<div class="rc-lines2"></div>');
    g.lines.forEach(x => {
      const r = h('<div class="row' + (x.receipt ? ' tap' : '') + '"><span class="tx"><b></b><small></small></span><span class="num"></span></div>');
      r.querySelector('b').textContent = x.name;
      r.querySelector('small').textContent = x.receipt ? fmtWhen(x.receipt) + ' · ' + x.receipt.items.length + ' items' + (x.bank ? '' : ' · not in the bank log yet') : 'from the bank';
      r.querySelector('.num').textContent = U.money(x.amount, { cents: true });
      if (x.receipt) r.onclick = () => open(x.receipt.id);
      rows.appendChild(r);
    });
    if (!g.lines.length) rows.appendChild(h('<p class="small" style="margin:8px 0 0">Nothing yet this pay week. Grocery runs show here from the bank, and from receipts you add.</p>'));
    card.appendChild(rows);
    const foot = h('<div class="btns" style="margin-top:10px"><button class="btn quiet sm" type="button">Add a receipt</button><button class="btn quiet sm" type="button">All receipts</button></div>');
    foot.children[0].onclick = () => add();
    foot.children[1].onclick = () => allSheet();
    if (!list().length) foot.children[1].remove();
    card.appendChild(foot);
    card.appendChild(h('<p class="small" style="margin:8px 0 0">Pay week to ' + U.DAY_NAMES[U.parseKey(g.we).getDay()] + ' ' + U.fmtDateShort(g.we) + '. A receipt and the bank’s line for it count once.</p>'));
    return card;
  }

  /* Memory search: a store or an item finds the receipt */
  function search(q) {
    const ws = skey(q).split(/\s+/).filter(Boolean); if (!ws.length) return [];
    const out = [];
    for (const r of list()) {
      const hay = skey(r.store + ' ' + r.items.map(x => x.name + ' ' + (x.text || '')).join(' '));
      if (!ws.every(w => hay.includes(w))) continue;
      const hit = r.items.find(x => ws.every(w => skey(x.name + ' ' + (x.text || '')).includes(w)));
      out.push({ kind: 'opus', title: hit ? hit.name + ' · ' + U.money(hit.amount, { cents: true }) : r.store + ' receipt', small: r.store + ' · ' + U.fmtDateShort(r.date) + ' · ' + U.money(r.total, { cents: true }) + ' total', tag: 'Money', open: () => open(r.id) });
      if (out.length >= 6) break;
    }
    return out;
  }

  Opus.receipts = { list, byId, save, remove, open, add, form, allSheet, groceriesCard, weekGroceries, unmatchedIn, receiptFor, matchOf, matches, fromAccounts, rewardsPaid, sinceCash, suggest, lastPrice, weekReceipts, search, clean, weekOf, foodWeek, tickInto, _: { scrub, words, sameStore } };
})();
