/* What changed: when Grok, Cassius or an Opus update changes something, the tab it touches gets a dot and a short
   "What changed" card at the top, in plain words. The dot goes once you've looked; the card stays until "Got it".
   Kept on this phone only (Store.data.changes), never synced. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util;
  const D = () => Opus.store.data;
  const arr = a => Array.isArray(a) ? a : [];
  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const blank = v => v == null || v === '' || (Array.isArray(v) && !v.length);
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const trunc = (s, n) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
  const KEEP_DAYS = 30, CARD_DAYS = 7, LINES = 40, SHOW = 6;

  /* ---------- the words ---------- */
  const FIELD = {
    apr: 'rate', minMonthly: 'monthly minimum', minimum: 'minimum', balance: 'balance', amount: 'amount', every: 'how often',
    weightLb: 'weight', born: 'birthday', ageAsOf: 'age as of', takeHome: 'take-home pay', payday: 'payday', cushion: 'cushion before extra debt',
    plannedDebtPerWeek: 'planned debt payment a week', budgetPerWeek: 'weekly food budget', checkInDay: 'money check-in day', checkInTime: 'money check-in time',
    lightsOut: 'lights out', wake: 'wake time', monthDay: 'day of the month', dayOffMidday: 'day-off midday', dayOffEvening: 'day-off evening',
    restSeconds: 'rest', minutes: 'minutes', perWeek: 'per week', kcal: 'calories', protein: 'protein', carbs: 'carbs', fat: 'fat',
    cue: 'cue', sets: 'sets', reps: 'reps', load: 'load', step: 'step', start: 'start', target: 'target', unit: 'unit',
    phone: 'phone', vet: 'vet', care: 'care', feeding: 'feeding', dose: 'dose', when: 'when', part: 'part of the day', low: 'low', high: 'high'
  };
  const human = k => FIELD[k] || String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase();
  const MONEYISH = /^(amount|balance|minMonthly|minimum|cushion|plannedDebtPerWeek|takeHome|paycheck|low|high|cash|free|limit)$/;
  function fmt(v, key, inMoney) {
    if (blank(v)) return 'blank';
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (typeof v === 'number') {
      if (key === 'apr') return v + '%';
      if (inMoney && MONEYISH.test(key)) return U.money(v, { cents: !Number.isInteger(v) });
      return v.toLocaleString('en-US');
    }
    if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? U.fmtDateShort(v) : trunc(v, 48);
    if (Array.isArray(v)) return v.every(x => typeof x !== 'object') ? trunc(v.join(', '), 48) : v.length + (v.length === 1 ? ' item' : ' items');
    return nameOf(v) || 'details';
  }
  function nameOf(o, i, parentKey) {
    if (!isObj(o)) return null;
    const n = o.name || o.title || o.label || (o.text && trunc(o.text, 32));
    if (n) return String(n);
    if (parentKey === 'weeks' && i != null) return 'Week ' + (i + 1);
    if (o.id) return human(o.id);
    return i != null ? cap(human(parentKey || 'item').replace(/s$/, '')) + ' ' + (i + 1) : null;
  }
  const keyOf = o => isObj(o) ? (o.id || o.name || o.title || o.date || null) : null;
  const SKIP = new Set(['updated', 'rev', 'format', 'version', 'at', 'by', 'since']);

  /* deep difference between two plan sections, as plain lines */
  function diff(a, b, names, key, inMoney, out) {
    if (same(a, b) || out.length > LINES * 3) return;
    const ctx = names.slice(-2).join(' · ');
    const lead = ctx ? ctx + ' ' : '';
    if (Array.isArray(a) && Array.isArray(b) && (a.concat(b).some(isObj))) {
      const keyed = a.concat(b).every(x => keyOf(x) != null);
      if (keyed) {
        const ka = new Map(a.map(x => [keyOf(x), x])), kb = new Map(b.map(x => [keyOf(x), x]));
        b.forEach((x, i) => { const k = keyOf(x); if (!ka.has(k)) out.push((ctx ? ctx + ' · ' : '') + 'Added ' + (nameOf(x, i, key) || 'an item')); else diff(ka.get(k), x, names.concat([nameOf(x, i, key) || human(k)]), null, inMoney, out); });
        a.forEach((x, i) => { if (!kb.has(keyOf(x))) out.push((ctx ? ctx + ' · ' : '') + 'Removed ' + (nameOf(x, i, key) || 'an item')); });
      } else {
        const n = Math.max(a.length, b.length);
        for (let i = 0; i < n; i++) {
          if (i >= a.length) out.push((ctx ? ctx + ' · ' : '') + 'Added ' + (nameOf(b[i], i, key) || 'an item'));
          else if (i >= b.length) out.push((ctx ? ctx + ' · ' : '') + 'Removed ' + (nameOf(a[i], i, key) || 'an item'));
          else diff(a[i], b[i], names.concat([nameOf(b[i], i, key) || nameOf(a[i], i, key) || '']).filter(Boolean), null, inMoney, out);
        }
      }
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const add = b.filter(x => !a.includes(x)), rem = a.filter(x => !b.includes(x));
      const label = cap(lead + human(key || 'list'));
      if (add.length && !rem.length) out.push(label + ': added ' + fmt(add, key));
      else if (rem.length && !add.length) out.push(label + ': removed ' + fmt(rem, key));
      else out.push(label + ': ' + fmt(a, key) + ' → ' + fmt(b, key));
      return;
    }
    if (isObj(a) && isObj(b)) {
      for (const k of Object.keys(Object.assign({}, a, b))) {
        if (SKIP.has(k)) continue;
        const va = a[k], vb = b[k];
        if (same(va, vb)) continue;
        const nested = (isObj(va) || isObj(vb) || (Array.isArray(va) && va.some(isObj)) || (Array.isArray(vb) && vb.some(isObj)));
        if (nested && !blank(va) && !blank(vb)) {
          const child = isObj(vb) ? (vb.name || vb.title) : null;
          diff(va, vb, Array.isArray(vb) ? names : names.concat([child ? String(child) : human(k)]), k, inMoney, out);
        } else if (isObj(vb) && blank(va)) out.push((ctx ? ctx + ' · ' : '') + 'Added ' + (nameOf(vb, null, k) || human(k)));
        else if (isObj(va) && blank(vb)) out.push((ctx ? ctx + ' · ' : '') + 'Removed ' + (nameOf(va, null, k) || human(k)));
        else leaf(names, k, va, vb, inMoney, out);
      }
      return;
    }
    leaf(names.slice(0, -1), key || names[names.length - 1] || 'value', a, b, inMoney, out);
  }
  function leaf(names, k, va, vb, inMoney, out) {
    const ctx = names.slice(-2).join(' · ');
    const label = cap((ctx ? ctx + ' ' : '') + human(k));
    if (blank(va)) out.push(label + ' set to ' + fmt(vb, k, inMoney));
    else if (blank(vb)) out.push(label + ' cleared');
    else if (typeof va === 'string' && typeof vb === 'string' && (va.length > 48 || vb.length > 48)) out.push(label + ' rewritten');
    else out.push(label + ': ' + fmt(va, k, inMoney) + ' → ' + fmt(vb, k, inMoney));
  }

  /* which tab a part of the plan belongs to */
  function tabOfPlan(top, sub) {
    if (top === 'health') return sub === 'reference' ? 'food' : 'today';
    if (top === 'mind') return 'growth';
    return { schedule: 'today', routine: 'today', review: 'today', profile: 'today', notes: 'today', name: 'today', food: 'food', training: 'train', money: 'money', home: 'home' }[top] || 'today';
  }
  const TOP = { schedule: 'Schedule', routine: 'Daily checklist', review: 'Weekly review', profile: 'Profile', notes: 'Plan notes', name: 'Plan name' };
  function planLines(before, after) {
    const by = {};
    const push = (tab, line) => { (by[tab] = by[tab] || []).push(line); };
    if (!isObj(before) || !isObj(after)) return by;
    for (const top of Object.keys(Object.assign({}, before, after))) {
      if (SKIP.has(top)) continue;
      const a = before[top], b = after[top];
      if (same(a, b)) continue;
      if (isObj(a) && isObj(b) && (top === 'health' || top === 'mind' || top === 'home')) {
        for (const sub of Object.keys(Object.assign({}, a, b))) {
          if (same(a[sub], b[sub])) continue;
          const out = []; diff(a[sub], b[sub], sub === 'pets' ? [] : [cap(human(sub))], sub, false, out);
          out.forEach(l => push(tabOfPlan(top, sub), l));
        }
        continue;
      }
      const out = [];
      diff(a, b, TOP[top] ? [TOP[top]] : [], top, top === 'money' || top === 'food', out);
      out.forEach(l => push(tabOfPlan(top), l));
    }
    return by;
  }

  /* entries Grok added to your logs (the ones that carry "by") */
  const LOGS = [
    ['money.cash', 'money', e => 'Free cash for ' + U.fmtDateShort(e.date) + ': ' + U.money(e.free != null ? e.free : e.cash, { cents: true }), e => e.date],
    ['money.weeks', 'money', e => 'Money week ending ' + U.fmtDateShort(e.weekEnding) + (e.paycheck != null ? ', paycheck ' + U.money(e.paycheck, { cents: true }) : ''), e => e.weekEnding],
    ['money.balances', 'money', e => 'Debt balances as of ' + U.fmtDateShort(e.date), e => e.date],
    ['weights', 'today', e => 'Weigh-in ' + U.fmtDateShort(e.date) + ': ' + e.lb + ' lb', e => e.date],
    ['workouts', 'train', e => 'Workout ' + (e.name || e.workout || '') + ' on ' + U.fmtDateShort(e.date), e => e.id],
    ['eaten', 'food', e => (e.name || 'Food') + ' on ' + U.fmtDateShort(e.date) + (e.skipped ? ' (skipped)' : ''), e => e.id],
    ['labs', 'food', e => 'Blood test from ' + U.fmtDateShort(e.date), e => e.date],
    ['pets', 'home', e => cap(String(e.care || 'care')) + ' for ' + (e.pet || 'a pet') + ' on ' + U.fmtDateShort(e.date), e => e.id],
    ['supps', 'today', e => 'Supplement ' + (e.supp || '') + ' on ' + U.fmtDateShort(e.date), e => e.id]
  ];
  const getp = (o, p) => p.split('.').reduce((x, k) => x && x[k], o);
  function logLines(before, after) {
    const by = {};
    for (const [p, tab, say, key] of LOGS) {
      const old = new Map(arr(getp(before, p)).map(e => [key(e), e]));
      arr(getp(after, p)).forEach(e => {
        if (!e || !e.by) return;
        const o = old.get(key(e));
        if (o && same(o, e)) return;
        const who = cap(String(e.by));
        ((by[tab] = by[tab] || {})[who] = by[tab][who] || []).push(say(e) + (o ? ' (updated)' : ''));
      });
    }
    return by;
  }

  /* Cassius's page, said his way */
  function growthLines(a, b) {
    const out = [];
    if (!isObj(a) || !isObj(b)) return out;
    const t = (x, n) => trunc(x || '', n || 60);
    if (!same(a.energy, b.energy) && b.energy && b.energy.text) out.push('New words for today' + (b.energy.from ? ', from ' + t(b.energy.from, 30) : ''));
    if (!same(a.lesson, b.lesson) && b.lesson && b.lesson.title) out.push((a.lesson && a.lesson.date === b.lesson.date ? 'Lesson updated: ' : 'New lesson: ') + t(b.lesson.title));
    if (!same(a.prompt, b.prompt) && b.prompt && b.prompt.text) out.push('New writing prompt: ' + t(b.prompt.text));
    if (!same(a.ledger, b.ledger) && b.ledger && b.ledger.virtue) out.push((a.ledger && a.ledger.week === b.ledger.week ? 'This week’s virtue updated: ' : 'This week’s virtue: ') + t(b.ledger.virtue, 30));
    if (!same(a.recall, b.recall) && b.recall && b.recall.question) out.push('New recall question: ' + t(b.recall.question));
    if (!same(a.creed, b.creed)) {
      const la = arr(a.creed && a.creed.lines), lb = arr(b.creed && b.creed.lines);
      if (!same(la, lb)) out.push(lb.length > la.length ? 'Creed: added ' + (lb.length - la.length) + (lb.length - la.length === 1 ? ' line' : ' lines') : lb.length < la.length ? 'Creed: removed ' + (la.length - lb.length) + (la.length - lb.length === 1 ? ' line' : ' lines') : 'Creed reworded');
      else out.push(Number.isInteger(b.creed.today) ? 'Cassius picked today’s creed line' : 'Creed lines take turns again');
    }
    const keyN = n => n.date + '|' + (n.on || '') + '|' + n.text;
    const oldN = new Set(arr(a.notes).map(keyN));
    arr(b.notes).filter(n => n && n.text && !oldN.has(keyN(n))).forEach(n => {
      const m = /^(writing|lesson|recall):(\d{4}-\d{2}-\d{2})$/.exec(n.on || '');
      out.push(m ? 'Note on your ' + (m[1] === 'writing' ? 'writing' : m[1] === 'lesson' ? 'lesson answer' : 'recall answer') + ' from ' + U.fmtDateShort(m[2]) : 'New note: ' + t(n.text, 70));
    });
    const oldL = new Map(arr(a.lessons).map(l => [l.date, l]));
    arr(b.lessons).forEach(l => { const o = oldL.get(l.date); if (o && !o.takeaway && l.takeaway) out.push('Takeaway added to ' + t(l.title || U.fmtDateShort(l.date), 40)); else if (o && !same(o, l) && !(a.lesson && a.lesson.date === l.date)) out.push('Past lesson updated: ' + t(l.title || '', 40)); });
    for (const k of ['reading', 'subjects', 'prompts']) {
      if (same(a[k], b[k])) continue;
      const lines = []; diff(arr(a[k]), arr(b[k]), [k === 'reading' ? 'Reading' : k === 'subjects' ? 'Subjects' : 'Prompts'], k, false, lines);
      out.push(...lines);
    }
    return out;
  }

  /* ---------- the record ---------- */
  function list() { const d = D(); if (!Array.isArray(d.changes)) d.changes = []; return d.changes; }
  function record(tab, by, lines) {
    lines = arr(lines).filter(Boolean);
    if (!lines.length || !tab) return;
    const now = new Date(), cut = now.getTime() - KEEP_DAYS * 864e5;
    const all = list().filter(c => new Date(c.at).getTime() > cut);
    // a second update from the same source to the same tab within the hour joins the first, if it's still unread
    const last = all.find(c => c.tab === tab && c.by === by && !c.done && now - new Date(c.at) < 36e5);
    if (last) { last.lines = last.lines.concat(lines.filter(l => !last.lines.includes(l))).slice(0, LINES); last.at = now.toISOString(); last.seen = false; }
    else all.unshift({ id: now.getTime().toString(36) + Math.random().toString(36).slice(2, 6), at: now.toISOString(), tab, by, lines: lines.slice(0, LINES), more: Math.max(0, lines.length - LINES), seen: false, done: false });
    D().changes = all.slice(0, 120);
  }
  function fromSync(o) {
    try {
      if (o.planBefore && o.planAfter) {
        const by = planLines(o.planBefore, o.planAfter);
        Object.keys(by).forEach(tab => record(tab, o.planBy || 'Grok', by[tab]));
      }
      if (o.logsBefore && o.logsAfter) {
        const by = logLines(o.logsBefore, o.logsAfter);
        Object.keys(by).forEach(tab => Object.keys(by[tab]).forEach(who => record(tab, who, by[tab][who])));
      }
      if (o.growthBefore && o.growthAfter) record('growth', 'Cassius', growthLines(o.growthBefore, o.growthAfter));
    } catch (e) { console.error('changes', e); }
  }

  /* what's new in an Opus update, shown once on the tabs it touches */
  const RELEASES = {
    '1.13.0': [['today', 'Notifications: Opus can now buzz your lock screen for workouts, meals, bills, pet care and more, even when it is closed. Turn them on in Settings › Notifications.']],
    '1.12.0': [['today', 'Swipe left or right to move between tabs. Week ahead is under The week, and on Sundays it has its own card here.'], ['food', 'Under Today, tap anything in Again to log it once more, with its macros.']],
    '1.11.0': [['today', 'Each tab now shows what changed when Grok, Cassius or an update changes something, right here at the top.']]
  };
  function checkVersion() {
    const s = D().settings, v = Opus.VERSION;
    const news = s.lastVersion && s.lastVersion !== v && RELEASES[v];
    if (news) RELEASES[v].forEach(([tab, line]) => record(tab, 'Opus ' + v, [line]));
    if (s.lastVersion !== v) { s.lastVersion = v; Opus.store.save(); }
    if (news) { Opus.renderBar(); Opus.refresh(); }
  }

  const open = tab => list().filter(c => c.tab === tab && !c.done && Date.now() - new Date(c.at).getTime() < CARD_DAYS * 864e5);
  const unseen = tab => list().some(c => c.tab === tab && !c.seen && !c.done);
  function viewed(tab) { let n = 0; list().forEach(c => { if (c.tab === tab && !c.seen) { c.seen = true; n++; } }); if (n) Opus.store.save(); }
  function when(iso) {
    const d = new Date(iso), k = U.key(d), t = U.fmtTimeAP(U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()));
    return (k === U.key() ? 'today' : k === U.key(U.addDays(new Date(), -1)) ? 'yesterday' : U.fmtDateShort(k)) + ', ' + t;
  }
  function setEl(c, max) {
    const h = Opus.ui.h;
    const el = h('<div class="chg-set"><div class="chg-by"><span class="who"></span><span class="small"></span></div><ul class="chg-lines"></ul></div>');
    el.querySelector('.who').textContent = c.by;
    el.querySelector('.small').textContent = when(c.at);
    const ul = el.querySelector('ul'), lines = c.lines.slice(0, max || c.lines.length);
    lines.forEach(l => { const li = document.createElement('li'); li.textContent = l; ul.appendChild(li); });
    const rest = c.lines.length - lines.length + (c.more || 0);
    if (rest > 0) { const li = document.createElement('li'); li.className = 'more'; li.textContent = '+ ' + rest + ' more'; ul.appendChild(li); }
    return el;
  }
  function card(tab) {
    const sets = open(tab);
    if (!sets.length) return null;
    const h = Opus.ui.h;
    const fresh = sets.some(c => !c.seen);
    const el = h('<div class="sec chg"><div class="card pad chg-card' + (fresh ? ' fresh' : '') + '"><div class="g-meta"><span class="tag">' + (fresh ? '<i class="chg-dot" aria-hidden="true"></i>' : '') + 'What changed</span><span class="small"></span></div><div class="chg-body"></div>' +
      '<div class="chg-acts"><button class="link" type="button">All changes</button><button class="btn sm ghost" type="button">Got it</button></div></div></div>');
    el.querySelector('.g-meta .small').textContent = sets.length === 1 ? '' : sets.length + ' updates';
    const body = el.querySelector('.chg-body');
    sets.slice(0, 3).forEach(c => body.appendChild(setEl(c, SHOW)));
    if (sets.length > 3) body.appendChild(h('<p class="small chg-older">' + (sets.length - 3) + ' earlier ' + (sets.length - 3 === 1 ? 'update' : 'updates') + ' under All changes</p>'));
    const [all, ok] = el.querySelectorAll('button');
    all.onclick = () => historySheet(tab);
    ok.onclick = () => { sets.forEach(c => { c.done = true; c.seen = true; }); Opus.store.save(); el.classList.add('going'); setTimeout(() => el.remove(), 260); Opus.renderBar(); };
    return el;
  }
  /* put the card under the tab's title, and take the dot off now that you've looked */
  function place(tab, v) {
    try {
      const c = card(tab);
      if (c) { const top = v.querySelector(':scope > .top'); if (top && top.nextSibling) v.insertBefore(c, top.nextSibling); else if (top) v.appendChild(c); else v.insertBefore(c, v.firstChild); }
      viewed(tab);
    } catch (e) { console.error('changes', e); }
  }
  function historySheet(tab) {
    const reg = Opus.tabsAll(), h = Opus.ui.h;
    const items = list().filter(c => !tab || c.tab === tab);
    Opus.ui.sheet({ title: 'What changed', kicker: tab && reg[tab] ? reg[tab].title + ' · last ' + KEEP_DAYS + ' days' : 'Last ' + KEEP_DAYS + ' days', render(api) {
      const b = api.body;
      if (tab) { const allB = h('<button class="link" type="button" style="margin-bottom:6px">Show every tab</button>'); allB.onclick = () => { api.close(true); historySheet(null); }; b.appendChild(allB); }
      if (!items.length) { b.appendChild(h('<p class="empty">Nothing has changed here lately.</p>')); return; }
      let day = null, card = null;
      items.forEach(c => {
        const k = U.key(new Date(c.at));
        if (k !== day) { day = k; b.appendChild(h('<div class="sh"><span class="t">' + U.esc(k === U.key() ? 'Today' : U.fmtDateShort(k)) + '</span></div>')); card = h('<div class="card pad chg-hist"></div>'); b.appendChild(card); }
        const el = setEl(c);
        if (!tab && reg[c.tab]) el.querySelector('.who').textContent = c.by + ' · ' + reg[c.tab].title;
        card.appendChild(el);
      });
    } });
  }

  Opus.changes = { fromSync, record, card, place, unseen, viewed, history: historySheet, checkVersion, planLines, growthLines, logLines };
  Opus.onBoot(checkVersion);
})();
