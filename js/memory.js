/* Memory: everything the owner wants kept, one pull away from any screen, with a calendar built in.
   No tab. A copper handle sits at the top of every screen; pull it down (or tap it) and Memory drops over
   whatever is open. Push it back up and you are where you were.
   A line you keep is one of three kinds, read from what you type:
     a note ("Hip thrust machine weighs 45 lb empty"),
     a plan on a date, with or without a time ("Dentist Tuesday 3pm"),
     something every year, like a birthday ("Sam's birthday March 14 1990" also knows the age).
   Plans and birthdays show on Today, in the week ahead and as notifications; the pets' birthdays from Home
   join them. Kept in logs.json as `remember` and synced like the rest. Grok, Cassius and Claude can add
   entries through the outbox (GUIDE.md section 4). One search covers what you kept and what Opus knows. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const list = () => (Store.data.remember = Store.data.remember || []);
  const lower1 = s => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  /* ---------- reading dates, times and kinds out of a line ---------- */
  const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
  const monOf = s => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(s.toLowerCase().slice(0, 3));
  const DAYS = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  const WORDN = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const YEARLY = /\b(birthday|bday|b-day|anniversary)\b/i;
  const valid = (y, m, d) => { const x = new Date(y, m, d); return x.getFullYear() === y && x.getMonth() === m && x.getDate() === d ? x : null; };
  const yr = s => { const n = Number(s); return s && String(s).length === 2 ? 2000 + n : n; };

  function parse(text, now) {
    now = day0(now || new Date());
    let s = ' ' + String(text || '') + ' ';
    const out = { date: null, time: null, yearly: YEARLY.test(s), born: false };
    let year = null;
    const cut = (re, fn) => { const m = s.match(re); if (!m) return false; if (fn(m) === false) return false; s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); return true; };

    // time: 2pm, 2:30 pm, 14:00, noon, at 7
    cut(/\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)(?=\W)/i, m => {
      let hh = Number(m[1]); const mm = Number(m[2] || 0), pm = /p/i.test(m[3]); if (hh < 1 || hh > 12) return false;
      if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; out.time = U.pad(hh) + ':' + U.pad(mm);
    }) ||
    cut(/\b(?:at\s+)?(noon|midday)\b/i, () => { out.time = '12:00'; }) ||
    cut(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/, m => { let hh = Number(m[1]); if (hh >= 1 && hh <= 6) hh += 12; out.time = U.pad(hh) + ':' + m[2]; }) ||
    cut(/\bat\s+(\d{1,2})\b(?![\/:.\d])/i, m => {
      let hh = Number(m[1]); if (hh < 1 || hh > 12) return false;
      if (hh <= 6 || /\b(dinner|night|tonight|evening|party|game|drinks|movie|show)\b/i.test(text)) hh = hh === 12 ? 12 : hh + 12;
      out.time = U.pad(hh) + ':00';
    });

    // date
    const dated = cut(new RegExp('\\b(?:on\\s+)?' + MON + '\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\W)', 'i'), m => { const d = valid(m[3] ? Number(m[3]) : now.getFullYear(), monOf(m[1]), Number(m[2])); if (!d) return false; out.date = d; if (m[3]) year = Number(m[3]); }) ||
      cut(new RegExp('\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MON + '(?:,?\\s+(\\d{4}))?(?=\\W)', 'i'), m => { const d = valid(m[3] ? Number(m[3]) : now.getFullYear(), monOf(m[2]), Number(m[1])); if (!d) return false; out.date = d; if (m[3]) year = Number(m[3]); }) ||
      cut(/\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/, m => { const d = valid(m[3] ? yr(m[3]) : now.getFullYear(), Number(m[1]) - 1, Number(m[2])); if (!d) return false; out.date = d; if (m[3]) year = yr(m[3]); }) ||
      cut(/\b(today|tonight|tomorrow|tmrw|tmr)\b/i, m => { out.date = /^to(day|night)$/i.test(m[1]) ? now : U.addDays(now, 1); }) ||
      cut(/\bin\s+(\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?)\b/i, m => { const n = WORDN[m[1].toLowerCase()] || Number(m[1]); out.date = U.addDays(now, n * (/^w/i.test(m[2]) ? 7 : 1)); }) ||
      cut(/\b(?:(on|this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)\b/i, m => {
        const w = m[2].toLowerCase(); if (!m[1] && w.length < 6) return false; // a bare "sat" or "wed" is a word, not a day
        if (!m[1] && (/\b(every|each|most|usually|always|takes?|took)\b/i.test(text) || /^\s*(prep|night|morning|nights|mornings|routine|workout|lift|run)\b/i.test(s.slice(m.index + m[0].length)))) return false; // "Sunday prep takes 90 minutes" is a habit, not a plan
        let n = (DAYS[w] - now.getDay() + 7) % 7; if (n === 0 && (m[1] || '').toLowerCase() !== 'this') n = 7;
        out.date = U.addDays(now, n);
      });

    if (dated) {
      const thisYear = now.getFullYear();
      if (out.yearly && year && year < thisYear) out.born = true;
      if (out.yearly && year) out.date = valid(year, out.date.getMonth(), out.date.getDate()) || out.date;
      else if (!year && out.date < now && !out.yearly) out.date = valid(thisYear + 1, out.date.getMonth(), out.date.getDate()) || out.date;
      out.date = U.key(out.date);
    } else if (out.time) out.date = U.key(now); // a time and no day means today
    let title = s.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/\b(on|at|by|for)\s*$/i, '').replace(/^[\s,.\-–—:]+|[\s,\-–—:]+$/g, '').trim();
    if (!title) title = String(text || '').trim();
    out.text = title.charAt(0).toUpperCase() + title.slice(1);
    return out;
  }

  /* ---------- sorting a line under a heading ---------- */
  const TAGS = ['Note', 'To do', 'Plans', 'Birthday', 'Gym', 'Food', 'Money', 'Home', 'Health'];
  const RULES = [
    ['Gym', /\b(leg day|push day|pull day|squat|bench|deadlift|press|lift(s|ed|ing)?|gym|workout|reps?|sets?|row|curls?|thrust|pull-?ups?|cardio|run|bike|plates?|machine|pr)\b/i],
    ['Food', /\b(eat|ate|meals?|prep|lunch|dinner|breakfast|snacks?|grocer(y|ies)|recipe|calories|cal|protein|carbs|chicken|eggs?|turkey|beef|food|cook|enchiladas?)\b/i],
    ['Money', /\$|\b(pay|paid|payday|bill|bills|bank|rent|debt|budget|price|cost|bought|card|loan|savings?|money|refund)\b/i],
    ['Health', /\b(doctor|dentist|dermatologist|blood|labs?|vitamins?|supplements?|sleep|whoop|meds?|medicine|prescription|checkup|physical|therapy|hair|skin)\b/i],
    ['Home', /\b(house|home|clean|laundry|yard|lawn|mow|car|oil change|tires?|fix|repair|trash|dishes|vet|dog|cat|pets?|walk|groom)\b/i]
  ];
  const TODO = /^(call|text|email|buy|get|pick up|set up|setup|book(?!s|\s+(to|idea|club|list)\b)|schedule|pay|send|fix|clean|order|renew|cancel|return|remember to|make|finish|check|ask|bring|grab|mail|sign|submit|file|wash|change|replace|look into|find)\b/i;
  function tagFor(e) {
    if (e.yearly && YEARLY.test(e.text)) return 'Birthday';
    if (TODO.test(e.text)) return 'To do';
    for (const [t, re] of RULES) if (re.test(e.text)) return t;
    if (e.yearly) return 'Birthday';
    return e.date ? 'Plans' : 'Note';
  }

  /* ---------- when things happen ---------- */
  /* the next day an entry happens on or after `from` (a Date), or null; yearly ones come round each year */
  function nextOn(e, from) {
    if (!e.date) return null;
    from = day0(from || new Date());
    const d = U.parseKey(e.date);
    if (!e.yearly) return d >= from ? d : null;
    let x = valid(from.getFullYear(), d.getMonth(), d.getDate()) || new Date(from.getFullYear(), 1, 28);
    if (x < from) x = valid(from.getFullYear() + 1, d.getMonth(), d.getDate()) || new Date(from.getFullYear() + 1, 1, 28);
    return x;
  }
  const turns = (e, on) => (e.born && e.date ? on.getFullYear() - Number(e.date.slice(0, 4)) : null);

  /* everything on the calendar from `start` for `days` days: kept plans and yearly dates, and the pets' birthdays */
  function upcoming(start, days) {
    start = day0(start || new Date()); const end = U.addDays(start, (days || 30) - 1), out = [];
    for (const e of list()) {
      const on = nextOn(e, start); if (!on || on > end) continue;
      out.push({ on, entry: e, title: e.text, time: e.time || null, yearly: !!e.yearly, birthday: !!e.yearly && (e.tag === 'Birthday' || YEARLY.test(e.text)), turns: turns(e, on), tag: e.tag || tagFor(e) });
    }
    if (Opus.pets) for (const p of Opus.pets.list()) {
      if (!p.born || !/^\d{4}-\d{2}-\d{2}$/.test(p.born)) continue;
      const on = nextOn({ date: p.born, yearly: true }, start); if (!on || on > end) continue;
      out.push({ on, pet: p.id, title: p.name + '’s birthday', time: null, yearly: true, birthday: true, turns: on.getFullYear() - Number(p.born.slice(0, 4)), tag: 'Birthday' });
    }
    return out.sort((a, b) => a.on - b.on || String(a.time || '99').localeCompare(String(b.time || '99')));
  }

  /* ---------- words for dates ---------- */
  const DAY3 = d => U.DAY_NAMES[d.getDay()].slice(0, 3);
  function when(on, time, today) {
    today = day0(today || new Date()); const n = U.daysBetween(today, on);
    const day = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? U.DAY_NAMES[on.getDay()] : DAY3(on) + ', ' + U.fmtDateShort(on) + (on.getFullYear() !== today.getFullYear() ? ' ' + on.getFullYear() : '');
    return day + (time ? ' · ' + U.fmtTimeAP(time) : '');
  }
  function preview(p) {
    if (!p.date) return '';
    const on = nextOn(p, new Date()) || U.parseKey(p.date);
    if (p.yearly) return 'Every year · ' + U.fmtDateShort(on) + (p.born ? ' · turns ' + turns(p, on) : '');
    return when(on, p.time);
  }

  /* ---------- saving ---------- */
  function keep(text) {
    const p = parse(text);
    if (!p.text) return null;
    const e = { id: 'm-' + U.uid(), text: p.text, date: p.date, time: p.time, yearly: p.yearly && !!p.date, born: p.born, pinned: false, at: new Date().toISOString() };
    e.tag = tagFor(e);
    list().unshift(e); Store.save(); Opus.sync && Opus.sync.soon && Opus.sync.soon();
    return e;
  }
  function save(e) { e.at = new Date().toISOString(); const L = list(), i = L.findIndex(x => x.id === e.id); if (i >= 0) L[i] = e; else L.unshift(e); Store.save(); Opus.sync && Opus.sync.soon && Opus.sync.soon(); }
  function remove(e) {
    const L = list(), i = L.findIndex(x => x.id === e.id); if (i >= 0) L.splice(i, 1);
    (Store.data.deleted.remember = Store.data.deleted.remember || {})[e.id] = new Date().toISOString();
    Store.save(); Opus.sync && Opus.sync.soon && Opus.sync.soon();
  }

  /* ---------- one search over what you kept and what Opus knows ---------- */
  function search(q) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return [];
    const hit = s => { s = String(s || '').toLowerCase(); return words.every(w => s.includes(w)); };
    const out = [];
    for (const e of list()) if (hit(e.text + ' ' + (e.tag || ''))) out.push({ kind: 'kept', entry: e });
    const P = Plan.p || {};
    const ex = ((P.training || {}).exercises) || {};
    for (const id of Object.keys(ex)) {
      if (!hit(ex[id].name || id)) continue;
      const last = Opus.training && Opus.training.lastFor(id);
      out.push({ kind: 'opus', title: ex[id].name || id, small: last ? U.fmtDateShort(last.date) + ' · ' + last.sets.map(s => (s.weight != null ? s.weight + ' × ' : '') + s.reps).join(', ') : 'Not logged yet', tag: 'Gym', tab: 'train' });
    }
    const meals = ((P.food || {}).meals) || {};
    for (const id of Object.keys(meals)) {
      const m = meals[id]; if (!hit(m.name + ' ' + (m.serving || ''))) continue;
      const x = Plan.macros(m);
      out.push({ kind: 'opus', title: m.name, small: x && x.kcal != null ? Math.round(x.kcal) + ' cal · ' + Math.round(x.protein || 0) + ' g protein' : 'Macros not in yet', tag: 'Food', tab: 'food' });
    }
    const M = P.money || {};
    for (const b of (M.bills || [])) if (hit(b.name)) out.push({ kind: 'opus', title: b.name, small: [b.amount != null ? U.money(b.amount, { cents: true }) : null, b.dueDay ? 'due on day ' + b.dueDay : null].filter(Boolean).join(' · ') || 'Bill', tag: 'Money', tab: 'money' });
    for (const b of (M.debts || [])) if (hit(b.name)) out.push({ kind: 'opus', title: b.name, small: b.balance != null ? U.money(b.balance, { cents: true }) + ' left' : 'Debt', tag: 'Money', tab: 'money' });
    for (const it of (((P.home || {}).items) || [])) if (hit(it.title)) out.push({ kind: 'opus', title: it.title, small: it.detail || 'Home job', tag: 'Home', tab: 'home' });
    if (Opus.pets) for (const p of Opus.pets.list()) if (hit(p.name + ' ' + (p.kind || '') + ' ' + (p.breed || ''))) out.push({ kind: 'opus', title: p.name, small: [p.breed, p.born ? 'born ' + U.fmtDateShort(p.born) + ' ' + p.born.slice(0, 4) : null].filter(Boolean).join(' · ') || 'Pet', tag: 'Home', tab: 'home' });
    return out.slice(0, 24);
  }

  /* ---------- the drop-down ---------- */
  let open = null, query = '', showAll = false;
  const isOpen = () => !!open;
  const tagEl = t => '<span class="mem-tag">' + U.esc(t) + '</span>';

  function dateTile(on, today) {
    const n = U.daysBetween(today, on);
    return '<span class="mem-day' + (n === 0 ? ' now' : '') + '"><b class="num">' + on.getDate() + '</b><i>' + (n === 0 ? 'Today' : U.MONTHS[on.getMonth()].slice(0, 3)) + '</i></span>';
  }
  function entryRow(e, small) {
    const r = h('<button type="button" class="row mem-row"><span class="tx"><b></b><small></small></span>' + tagEl(e.tag || tagFor(e)) + '</button>');
    r.querySelector('b').textContent = e.text;
    const sm = small != null ? small : (e.date ? (e.yearly ? 'Every year · ' + U.fmtDateShort(nextOn(e) || U.parseKey(e.date)) : when(U.parseKey(e.date), e.time)) : U.fmtDateShort(U.key(new Date(e.at || Date.now())))) + (e.by === 'grok' ? ' · added for you' : '');
    r.querySelector('small').textContent = sm;
    r.onclick = () => edit(e);
    return r;
  }
  function calRow(x, today) {
    const r = h('<button type="button" class="row mem-row mem-cal">' + dateTile(x.on, today) + '<span class="tx"><b></b><small></small></span>' + tagEl(x.tag) + '</button>');
    r.querySelector('.tx b').textContent = x.title;
    const n = U.daysBetween(today, x.on);
    r.querySelector('.tx small').textContent = (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : U.DAY_NAMES[x.on.getDay()] + (n >= 7 ? ', in ' + n + ' days' : '')) + (x.time ? ' · ' + U.fmtTimeAP(x.time) : '') + (x.turns ? ' · turns ' + x.turns : '');
    r.onclick = () => { if (x.entry) edit(x.entry); else { close(); Opus.go('home'); } };
    return r;
  }
  const section = (title, count) => h('<div class="mem-sh"><span>' + U.esc(title) + '</span>' + (count ? '<i class="num">' + U.esc(count) + '</i>' : '') + '</div>');

  function draw(api) {
    const b = api.body, today = day0(new Date());
    const keepScroll = b.scrollTop; b.innerHTML = '';

    // search
    const sr = h('<label class="mem-search">' + ui.icon('search') + '<input type="search" enterkeyhint="search" placeholder="Search everything you’ve kept" autocomplete="off"></label>');
    const si = sr.querySelector('input'); si.value = query;
    b.appendChild(sr);

    // keep
    const kp = h('<form class="mem-keep"><input class="mem-in" type="text" enterkeyhint="done" placeholder="Remember…" autocomplete="off" autocapitalize="sentences"><button class="btn sm" type="submit">Keep</button></form>');
    const ki = kp.querySelector('input'), chip = h('<div class="mem-read" hidden></div>');
    ki.addEventListener('input', () => {
      const t = ki.value.trim(); if (!t) { chip.hidden = true; return; }
      const p = parse(t), e = { text: p.text, date: p.date, yearly: p.yearly && !!p.date };
      const pv = preview(Object.assign({}, p, { yearly: e.yearly })); chip.textContent = (pv ? pv + ' · ' : '') + tagFor(e); chip.hidden = false;
    });
    kp.addEventListener('submit', ev => {
      ev.preventDefault(); const t = ki.value.trim(); if (!t) return;
      const e = keep(t); if (!e) return;
      ui.buzz && ui.buzz(8); ui.toast(e.date ? (e.yearly ? 'Kept, every year on ' + U.fmtDateShort(nextOn(e)) : 'Kept for ' + lower1(when(U.parseKey(e.date), e.time))) : 'Kept');
      ki.value = ''; chip.hidden = true; query = ''; draw(api); refreshBehind();
    });
    b.appendChild(kp); b.appendChild(chip);

    const results = h('<div class="mem-body"></div>'); b.appendChild(results);
    const fill = () => {
      results.innerHTML = '';
      if (query.trim()) {
        const hits = search(query);
        if (!hits.length) { results.appendChild(h('<p class="empty">Nothing kept or in Opus matches “' + U.esc(query.trim()) + '”.</p>')); return; }
        const kept = hits.filter(x => x.kind === 'kept'), op = hits.filter(x => x.kind === 'opus');
        if (kept.length) { results.appendChild(section('Kept', kept.length)); const c = h('<div class="card mem-list"></div>'); kept.forEach(x => c.appendChild(entryRow(x.entry))); results.appendChild(c); }
        if (op.length) {
          results.appendChild(section('In Opus', op.length)); const c = h('<div class="card mem-list"></div>');
          op.forEach(x => { const r = h('<button type="button" class="row mem-row"><span class="tx"><b></b><small></small></span>' + tagEl(x.tag) + '</button>'); r.querySelector('.tx b').textContent = x.title; r.querySelector('small').textContent = x.small; r.onclick = () => { close(); Opus.go(x.tab); }; c.appendChild(r); });
          results.appendChild(c);
        }
        return;
      }
      const cal = upcoming(today, 30), L = list();
      if (!L.length && !cal.length) {
        results.appendChild(h('<div class="mem-empty"><p>Keep anything here: a note, a plan with a day and time, or a birthday. Opus reads the date out of what you type.</p><p class="small">Try “Dentist Tuesday 3pm” or “Sam’s birthday March 14”.</p></div>'));
        return;
      }
      if (cal.length) {
        results.appendChild(section('Coming up', 'next 30 days'));
        const c = h('<div class="card mem-list"></div>'); cal.forEach(x => c.appendChild(calRow(x, today))); results.appendChild(c);
      }
      const onCal = new Set(cal.filter(x => x.entry).map(x => x.entry.id));
      const pinned = L.filter(e => e.pinned && !onCal.has(e.id));
      if (pinned.length) { results.appendChild(section('Pinned')); const c = h('<div class="card mem-list"></div>'); pinned.forEach(e => c.appendChild(entryRow(e))); results.appendChild(c); }
      const rest = L.filter(e => !e.pinned && !onCal.has(e.id)).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
      if (rest.length) {
        results.appendChild(section('Recent', rest.length > 12 ? String(rest.length) : ''));
        const c = h('<div class="card mem-list"></div>'); (showAll ? rest : rest.slice(0, 12)).forEach(e => c.appendChild(entryRow(e))); results.appendChild(c);
        if (rest.length > 12 && !showAll) { const m = h('<button type="button" class="btn quiet sm mem-more">Show all ' + rest.length + '</button>'); m.onclick = () => { showAll = true; fill(); }; results.appendChild(m); }
      }
    };
    si.addEventListener('input', () => { query = si.value; fill(); });
    si.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); si.blur(); } });
    fill();
    b.scrollTop = keepScroll;
  }

  function show() {
    if (open) return;
    if (ui.topSheet()) return; // something else is open; Memory waits
    query = ''; showAll = false;
    const sd = Store.data.seen = Store.data.seen || {}; if (!sd.memOpened) { sd.memOpened = new Date().toISOString(); Store.save(); pull && pull.classList.remove('hint'); }
    open = ui.sheet({
      top: true, title: 'Memory',
      headExtra: '<button type="button" class="mem-up">Push up to close</button>',
      render(api) { draw(api); },
      onClose() { open = null; }
    });
    open.head.querySelector('.mem-up').onclick = () => close();
    dragClose(open);
  }
  function close() { if (open) { const o = open; open = null; o.close(); } }

  /* push the bottom grip (or the sheet itself, from its edge) up to close */
  function dragClose(api) {
    const el = api.el, grip = api.grip; if (!grip) return;
    let y0 = null, dy = 0;
    grip.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; el.style.transition = 'none'; }, { passive: true });
    grip.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.min(0, e.touches[0].clientY - y0); el.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
    grip.addEventListener('touchend', e => { e.preventDefault(); if (y0 == null) return; el.style.transition = ''; el.style.transform = ''; const moved = dy; y0 = null; if (moved < -24 || moved === 0) close(); }, { passive: false });
    grip.addEventListener('click', e => { if (!('ontouchstart' in window)) close(); });
  }

  /* ---------- editing one entry ---------- */
  function edit(e0) {
    const e = Object.assign({}, e0);
    let kind = e.yearly ? 'year' : e.date ? 'date' : 'note';
    ui.sheet({
      title: 'Kept', kicker: e.at ? 'Since ' + U.fmtDateShort(U.key(new Date(e.at))) : '',
      render(api) {
        const b = api.body;
        const tx = h('<label class="field"><span>What to remember</span><textarea class="input" rows="2"></textarea></label>'); tx.querySelector('textarea').value = e.text; b.appendChild(tx);
        const kinds = h('<div class="chips"></div>');
        [['note', 'Note'], ['date', 'On a date'], ['year', 'Every year']].forEach(([k, l]) => { const c = h('<button type="button" class="chip' + (kind === k ? ' on' : '') + '">' + l + '</button>'); c.onclick = () => { kind = k; kinds.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); sync(); }; kinds.appendChild(c); });
        b.appendChild(kinds);
        const when_ = h('<div class="mem-when"><label class="field"><span>Date</span><input class="input" type="date"></label><label class="field mem-t"><span>Time</span><input class="input" type="time"></label></div>');
        const di = when_.querySelector('input[type=date]'), ti = when_.querySelector('input[type=time]');
        di.value = e.date || ''; ti.value = e.time || '';
        b.appendChild(when_);
        const age = h('<label class="mem-check"><input type="checkbox"> <span>The year is when they were born, so show their age</span></label>'); age.querySelector('input').checked = !!e.born; b.appendChild(age);
        const sync = () => { when_.hidden = kind === 'note'; when_.querySelector('.mem-t').hidden = kind !== 'date'; age.hidden = kind !== 'year'; };
        sync();
        b.appendChild(h('<div class="mem-lab">Sorted under</div>'));
        const tags = h('<div class="chips"></div>'); let tag = e.tag || tagFor(e);
        TAGS.forEach(t => { const c = h('<button type="button" class="chip' + (t === tag ? ' on' : '') + '">' + t + '</button>'); c.onclick = () => { tag = t; tags.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); }; tags.appendChild(c); });
        b.appendChild(tags);
        const pin = h('<label class="mem-check"><input type="checkbox"> <span>Pin it to the top</span></label>'); pin.querySelector('input').checked = !!e.pinned; b.appendChild(pin);
        const btns = h('<div class="btns"><button type="button" class="btn quiet danger">Delete</button><button type="button" class="btn">Save</button></div>');
        btns.children[0].onclick = async () => { if (await ui.ask({ title: 'Delete this?', text: e0.text, yes: 'Delete', danger: true })) { remove(e0); api.close(true); redraw(); refreshBehind(); } };
        btns.children[1].onclick = () => {
          const t = tx.querySelector('textarea').value.trim(); if (!t) { ui.toast('Type what to remember first'); return; }
          if (kind !== 'note' && !di.value) { ui.toast('Pick a date, or choose Note'); return; }
          Object.assign(e0, { text: t, date: kind === 'note' ? null : di.value, time: kind === 'date' && ti.value ? ti.value : null, yearly: kind === 'year', born: kind === 'year' && age.querySelector('input').checked, tag, pinned: pin.querySelector('input').checked });
          delete e0.by; save(e0); api.close(true); redraw(); refreshBehind(); ui.toast('Saved');
        };
        b.appendChild(btns);
      }
    });
  }
  const redraw = () => { if (open) draw(open); };
  const refreshBehind = () => { const c = Opus.current && Opus.current(); if (c === 'today') setTimeout(() => { const v = document.querySelector('.view'); if (v && Opus.go) { const y = window.scrollY; Opus.go('today', { refresh: true }); window.scrollTo(0, y); } }, 0); };

  /* ---------- Today: plans today and tomorrow, birthdays this week ---------- */
  function todayCard(d) {
    const today = day0(d || new Date());
    const xs = upcoming(today, 8).filter(x => { const n = U.daysBetween(today, x.on); return x.birthday ? n <= 7 : n <= 1; }).slice(0, 3);
    if (!xs.length) return null;
    const c = h('<button type="button" class="card mem-today"><div class="mem-th"><span>On the calendar</span>' + ui.icon('chev') + '</div></button>');
    xs.forEach(x => {
      const n = U.daysBetween(today, x.on);
      const r = h('<div class="mem-tr">' + dateTile(x.on, today) + '<span class="tx"><b></b><small></small></span></div>');
      r.querySelector('.tx b').textContent = x.title;
      r.querySelector('.tx small').textContent = (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : U.DAY_NAMES[x.on.getDay()]) + (x.time ? ' · ' + U.fmtTimeAP(x.time) : '') + (x.turns ? ' · turns ' + x.turns : '');
      c.appendChild(r);
    });
    c.onclick = () => show();
    return c;
  }

  /* ---------- the handle ---------- */
  let pull = null;
  function mountHandle() {
    if (pull) return;
    pull = h('<button type="button" class="mem-pull" aria-label="Open Memory"><i></i><span>Pull down for Memory</span></button>');
    if (!((Store.data.seen || {}).memOpened)) pull.classList.add('hint');
    document.body.appendChild(pull);
    let y0 = null, x0 = 0, fired = false;
    pull.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; fired = false; }, { passive: true });
    pull.addEventListener('touchmove', e => { if (y0 == null || fired) return; const dy = e.touches[0].clientY - y0; if (dy > 24) { fired = true; show(); } }, { passive: true });
    pull.addEventListener('touchend', e => { e.preventDefault(); if (y0 != null && !fired) show(); y0 = null; }, { passive: false }); // no ghost click on the sheet's backdrop
    pull.addEventListener('click', () => { if (!('ontouchstart' in window)) show(); });
    // pulling down from the very top of any screen, already scrolled to the top, opens it too
    let t0 = null;
    document.addEventListener('touchstart', e => {
      t0 = null; if (e.touches.length !== 1 || ui.topSheet() || window.scrollY > 2 || pull.contains(e.target)) return;
      const t = e.touches[0]; if (t.clientY > 80) return;
      if (e.target.closest && e.target.closest('input, textarea, select, button, a')) return;
      t0 = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!t0) return; const t = e.touches[0], dy = t.clientY - t0.y, dx = Math.abs(t.clientX - t0.x);
      if (dy > 70 && dy > dx * 2) { t0 = null; show(); }
    }, { passive: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open && ui.topSheet() === open) close(); });
  }
  Opus.onBoot(mountHandle);

  Opus.memory = { list, parse, tagFor, nextOn, upcoming, keep, save, remove, search, show, close, isOpen, todayCard, when };
})();
