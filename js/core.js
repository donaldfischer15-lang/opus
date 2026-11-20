/* Opus core: utilities, storage, plan logic. No UI here. */
(function () {
  'use strict';
  const Opus = (window.Opus = window.Opus || {});
  Opus.VERSION = '1.16.0';

  /* ---------- utilities ---------- */
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const U = {
    DAYS, DAY_NAMES, MONTHS,
    pad: n => String(n).padStart(2, '0'),
    key(d) { d = d || new Date(); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); },
    parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); },
    addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
    dayKey: d => DAYS[(d || new Date()).getDay()],
    weekStart(d) { d = d || new Date(); const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - x.getDay()); return x; },
    daysBetween(a, b) { return Math.round((U.parseKey(U.key(b)) - U.parseKey(U.key(a))) / 864e5); },
    mins(t) { if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; },
    nowMins(d) { d = d || new Date(); return d.getHours() * 60 + d.getMinutes(); },
    fmtTime(t) { const m = U.mins(t); if (m == null) return ''; let h = Math.floor(m / 60), mm = m % 60; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + U.pad(mm); },
    fmtTimeAP(t) { const m = U.mins(t); if (m == null) return ''; let h = Math.floor(m / 60); const ap = h >= 12 ? ' PM' : ' AM'; return U.fmtTime(t) + ap; },
    roman(n) {
      const r = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
      let s = ''; for (const [v, c] of r) while (n >= v) { s += c; n -= v; } return s;
    },
    money(n, opts) {
      if (n == null || isNaN(n)) return '—';
      const neg = n < 0; const v = Math.abs(n);
      const s = v.toLocaleString('en-US', { minimumFractionDigits: opts && opts.cents ? 2 : 0, maximumFractionDigits: opts && opts.cents ? 2 : 0 });
      return (neg ? '−$' : '$') + s;
    },
    num(n, d) { if (n == null || isNaN(n)) return '—'; const f = Math.pow(10, d || 0); return String(Math.round(n * f) / f); },
    wt(n) { if (n == null || isNaN(n)) return '—'; return (Math.round(n * 10) / 10).toString(); },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
    clone: o => JSON.parse(JSON.stringify(o)),
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    sum: a => a.reduce((s, x) => s + (Number(x) || 0), 0),
    avg: a => (a.length ? U.sum(a) / a.length : null),
    e1rm(w, r) { if (!w || !r) return 0; return r === 1 ? w : w * (1 + r / 30); },
    fmtDuration(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + U.pad(s); },
    fmtDateShort(k) { const d = typeof k === 'string' ? U.parseKey(k) : k; return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate(); },
    matchDays(spec, dk, isWork) {
      if (spec == null || spec === 'all') return true;
      if (spec === 'workdays') return isWork;
      if (spec === 'daysoff' || spec === 'weekends') return !isWork;
      if (Array.isArray(spec)) return spec.includes(dk);
      if (typeof spec === 'string') return spec.split(/[ ,]+/).includes(dk);
      return true;
    }
  };
  Opus.util = U;

  /* ---------- storage ---------- */
  const KEY = 'opus.v1';
  let mem = null; // memory fallback
  let storageOK = true;
  try { const t = '__opus_t'; localStorage.setItem(t, '1'); localStorage.removeItem(t); } catch (e) { storageOK = false; }

  function blankData() {
    return {
      format: 'opus-data', version: 1,
      created: new Date().toISOString(),
      plan: null,
      checks: {},          // { 'YYYY-MM-DD': ['item-id', ...] }
      workouts: [],        // finished sessions
      active: null,        // workout in progress
      rest: null,          // { endAt, total, label }
      weights: [],         // [{ date, lb }]
      money: { weeks: [], balances: [] },
      groceries: {},       // { weekStartKey: ['Item name', ...] checked }
      prep: {},            // { weekStartKey: ['step text', ...] done }
      reviews: [],         // [{ weekOf, worked, slipped, change, saved }]
      writing: [],         // [{ date, text, words, sentences }]
      eaten: [],           // what was actually eaten: part of a planned meal, a meal skipped, or something extra
      labs: [],            // blood test results: [{ date, lab, markers: [{ name, value, unit, low, high, range }], note, at }]
      pets: [],            // pet care done, weigh-ins and vet visits: [{ id, date, pet, care, lb, note, at }]
      supps: [],           // supplements taken: [{ id: 'date:supp', date, supp, at }]
      changes: [],         // what Grok, Cassius or an update changed, per tab (this phone only, never synced)
      ledger: [],          // the Growth ledger, one mark a day: [{ week, virtue, date, mark: 'clean' | 'dot', at }]
      glimpses: [],        // Growth's night sky, one line when a moment comes together: [{ id, date, line, who: [names], at }]
      deleted: { workouts: {}, eaten: {}, labs: {}, pets: {}, supps: {}, ledger: {}, glimpses: {} }, // { id: when } removed on purpose, so a sync doesn't bring them back
      seen: {},            // small UI memory, e.g. { moneyAutoOpen: '2026-11-27' }
      settings: {
        tabs: ['today', 'food', 'train', 'money', 'home', 'growth'],
        hidden: [],
        rest: {},          // overrides by type, seconds
        sound: true,
        lastBackup: null
      }
    };
  }

  /* a newer copy of the same shipped plan replaces the saved one, keeping what was changed in the app */
  function upgradePlan(old, shipped) {
    const p = U.clone(shipped);
    const oe = ((old.training || {}).exercises) || {}, ne = (p.training = p.training || {}).exercises = p.training.exercises || {};
    for (const id of Object.keys(oe)) if (!ne[id]) ne[id] = oe[id];
    const om = ((old.food || {}).meals) || {}, nm = ((p.food || {}).meals) || {};
    for (const id of Object.keys(om)) if (nm[id] && om[id].macros && om[id].macros.estimate === false) nm[id].macros = om[id].macros;
    if (old.home && old.home.items) p.home = old.home; // home items are edited in the app
    return p;
  }

  const Store = {
    ok: () => storageOK,
    data: null,
    load() {
      let raw = null;
      if (storageOK) { try { raw = localStorage.getItem(KEY); } catch (e) { storageOK = false; } }
      else raw = mem;
      let d = null;
      if (raw) { try { d = JSON.parse(raw); } catch (e) { d = null; } }
      const base = blankData();
      if (!d || d.format !== 'opus-data') d = base;
      // fill any missing keys after upgrades
      for (const k of Object.keys(base)) if (d[k] === undefined) d[k] = base[k];
      for (const k of Object.keys(base.settings)) if (d.settings[k] === undefined) d.settings[k] = base.settings[k];
      if (!d.money.weeks) d.money.weeks = []; if (!d.money.balances) d.money.balances = [];
      if (!d.deleted) d.deleted = {}; for (const k of ['workouts', 'eaten', 'labs', 'pets', 'supps', 'ledger', 'glimpses']) if (!d.deleted[k]) d.deleted[k] = {};
      const shipped = window.OPUS_PRELOADED_PLAN || window.OPUS_EXAMPLE_PLAN;
      if (!d.plan) d.plan = U.clone(shipped);
      else if (shipped && d.plan.name === shipped.name && (Number(shipped.rev) || 1) > (Number(d.plan.rev) || 1)) d.plan = upgradePlan(d.plan, shipped);
      this.data = d;
      return d;
    },
    _t: null,
    save(now) {
      const write = () => {
        const s = JSON.stringify(this.data);
        if (storageOK) { try { localStorage.setItem(KEY, s); } catch (e) { storageOK = false; mem = s; } }
        else mem = s;
      };
      clearTimeout(this._t);
      if (now) write(); else this._t = setTimeout(write, 150);
    },
    flush() { clearTimeout(this._t); this.save(true); },
    reset() { this.data = blankData(); this.data.plan = U.clone(window.OPUS_PRELOADED_PLAN || window.OPUS_EXAMPLE_PLAN); this.save(true); },
    exportJSON() {
      const d = U.clone(this.data);
      d.exported = new Date().toISOString();
      d.app = 'Opus ' + Opus.VERSION;
      return JSON.stringify(d, null, 2);
    },
    importJSON(text) {
      let d;
      try { d = JSON.parse(text); } catch (e) { return { ok: false, error: 'That file is not valid JSON.' }; }
      if (!d || d.format !== 'opus-data') return { ok: false, error: 'That is not an Opus backup (format should be "opus-data").' };
      const v = Plan.validate(d.plan);
      if (!v.ok) return { ok: false, error: 'The plan inside the backup has problems: ' + v.errors[0] };
      return { ok: true, data: d };
    },
    applyImport(d) {
      this.data = d;
      const base = blankData();
      for (const k of Object.keys(base)) if (this.data[k] === undefined) this.data[k] = base[k];
      for (const k of Object.keys(base.settings)) if (this.data.settings[k] === undefined) this.data.settings[k] = base.settings[k];
      this.save(true);
    }
  };
  Opus.store = Store;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}

  /* ---------- plan logic ---------- */
  const PARTS = ['morning', 'workday', 'evening'];
  const Plan = {
    PARTS,
    get p() { return Store.data.plan; },
    isWorkday(d) { const s = this.p.schedule || {}; return (s.workdays || []).includes(U.dayKey(d)); },
    partStarts(d) {
      const s = this.p.schedule || {}; const w = this.isWorkday(d);
      return {
        morning: U.mins(s.wake) ?? 300,
        workday: w ? (U.mins(s.workStart) ?? 390) : (U.mins(s.dayOffMidday) ?? 660),
        evening: w ? (U.mins(s.workEnd) ?? 1020) : (U.mins(s.dayOffEvening) ?? 1020)
      };
    },
    partLabel(part, d) {
      if (part === 'workday') return this.isWorkday(d) ? 'Workday' : 'Midday';
      return part === 'morning' ? 'Morning' : 'Evening';
    },
    currentPart(d) {
      const st = this.partStarts(d), m = U.nowMins(d);
      if (m >= st.evening) return 'evening';
      if (m >= st.workday) return 'workday';
      return 'morning';
    },
    /* food */
    rotationWeek(d) {
      const f = this.p.food || {}, r = f.rotation;
      if (!r || !r.weeks || !r.weeks.length) return null;
      const start = r.start ? U.weekStart(U.parseKey(r.start)) : U.weekStart(new Date(2026, 0, 4));
      const n = Math.floor(U.daysBetween(start, U.weekStart(d)) / 7);
      const i = ((n % r.weeks.length) + r.weeks.length) % r.weeks.length;
      return { index: i, count: r.weeks.length, week: r.weeks[i] };
    },
    meal(id) { const m = ((this.p.food || {}).meals || {})[id]; return m ? Object.assign({ id }, m) : null; },
    mealFor(d, slot) { const rw = this.rotationWeek(d); if (!rw) return null; return this.meal(rw.week[slot]); },
    weekMeals(d) {
      const rw = this.rotationWeek(d); if (!rw) return [];
      const out = [];
      for (const slot of ['breakfast', 'lunch', 'snack', 'dinner']) { const m = this.meal(rw.week[slot]); if (m) out.push(Object.assign({ slotKey: slot }, m)); }
      for (const k of Object.keys(rw.week)) if (!['name', 'breakfast', 'lunch', 'snack', 'dinner'].includes(k)) { const m = this.meal(rw.week[k]); if (m) out.push(Object.assign({ slotKey: k }, m)); }
      return out;
    },
    groceryList(d) {
      const meals = this.weekMeals(d);
      const map = new Map();
      for (const m of meals) for (const ing of (m.ingredients || [])) {
        const k = ing.item.trim().toLowerCase();
        if (!map.has(k)) map.set(k, { item: ing.item.trim(), qtys: [], section: ing.section || 'Other', meals: [] });
        const g = map.get(k); if (ing.qty) g.qtys.push(ing.qty); g.meals.push(m.name);
      }
      const order = (this.p.food || {}).sections || [];
      const groups = {};
      for (const g of map.values()) (groups[g.section] = groups[g.section] || []).push(g);
      const secs = Object.keys(groups).sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      });
      return secs.map(s => ({ section: s, items: groups[s].sort((a, b) => a.item.localeCompare(b.item)) }));
    },
    prepSteps(d) {
      const out = [];
      for (const m of this.weekMeals(d)) for (const s of (m.prep || [])) out.push({ meal: m.name, text: s });
      return out;
    },
    /* macros: per serving on each meal. A meal can list its parts (4 eggs, 1 banana), each with its own
       macros; then the meal is the sum of its parts. A day adds the meals its routine eats, and when
       you log what you actually ate (part of a meal, a meal skipped, something extra), that wins. */
    MK: ['kcal', 'protein', 'carbs', 'fat'],
    partsOf(m) {
      if (!m) return [];
      if (Array.isArray(m.parts) && m.parts.length) return m.parts.map(p => ({ name: p.name, amount: p.amount == null ? 1 : Number(p.amount), unit: p.unit || '', macros: p.macros || null, micros: p.micros || null }));
      // no parts written yet: read them off the serving line ("4 large eggs, 1 banana"), without macros
      return String(m.serving || '').split(/,\s*(?![^()]*\))|\s+and\s+(?=\d)/).map(t => t.trim()).filter(Boolean).map(t => {
        const x = t.match(/^(\d+(?:\.\d+)?|[½¼¾])\s*(g|kg|oz|lb|ml|cups?|tbsp|tsp)?\b\s*(.*)$/i);
        if (!x) return { name: t, amount: 1, unit: '', macros: null };
        const n = { '½': .5, '¼': .25, '¾': .75 }[x[1]] || Number(x[1]);
        return { name: x[3] || t, amount: n, unit: (x[2] || '').toLowerCase(), macros: null };
      });
    },
    sumMacros(list) {
      const o = { kcal: 0, protein: 0, carbs: 0, fat: 0, estimate: false };
      for (const x of list) { if (!x) continue; for (const k of this.MK) o[k] += Number(x[k]) || 0; if (x.estimate !== false) o.estimate = true; }
      for (const k of this.MK) o[k] = Math.round(o[k] * 10) / 10;
      return o;
    },
    scaleMacros(x, f) { if (!x) return null; const o = { estimate: x.estimate !== false }; for (const k of this.MK) o[k] = x[k] == null || x[k] === '' ? null : Math.round(Number(x[k]) * f * 10) / 10; return o; },
    macros(m) {
      if (!m) return null;
      const ps = Array.isArray(m.parts) ? m.parts : [];
      if (ps.length && ps.every(p => p.macros && p.macros.kcal != null)) return this.sumMacros(ps.map(p => p.macros));
      const x = m.macros; if (!x) return null; const o = {}; for (const k of this.MK) o[k] = x[k] == null || x[k] === '' ? null : Number(x[k]); o.estimate = x.estimate !== false; return o;
    },
    eatenOn(d) { const k = typeof d === 'string' ? d : U.key(d); return ((Store.data || {}).eaten || []).filter(e => e.date === k); },
    eatenEntry(d, itemId) { const k = (typeof d === 'string' ? d : U.key(d)) + ':' + itemId; return ((Store.data || {}).eaten || []).find(e => e.id === k) || null; },
    dayMacros(d, eatenOnly) {
      const out = { kcal: 0, protein: 0, carbs: 0, fat: 0, meals: 0, missing: 0, estimate: false, extras: 0, unknown: 0, partial: 0 };
      const add = x => { for (const k of this.MK) out[k] += Number(x[k]) || 0; if (x.estimate !== false) out.estimate = true; };
      for (const it of this.itemsFor(d)) {
        if (it.kind !== 'meal' || !it.meal) continue;
        out.meals++;
        if (eatenOnly && !this.isChecked(d, it.id)) continue;
        const e = eatenOnly ? this.eatenEntry(d, it.id) : null;
        if (e && !e.skipped && e.macros) { add(e.macros); out.partial++; continue; }
        const x = this.macros(it.meal);
        if (!x || x.kcal == null) { out.missing++; continue; }
        add(x);
      }
      if (eatenOnly) for (const e of this.eatenOn(d)) {
        if (!e.extra) continue;
        out.extras++;
        if (!e.macros || e.macros.kcal == null) { out.unknown++; continue; }
        add(e.macros);
      }
      return out;
    },
    library() { const f = this.p.food || {}; return Array.isArray(f.library) ? f.library : []; },
    /* training */
    workoutFor(d) {
      const t = this.p.training || {}; const id = (t.schedule || {})[U.dayKey(d)];
      if (!id || !(t.workouts || {})[id]) return null;
      return Object.assign({ id }, t.workouts[id]);
    },
    workout(id) { const w = ((this.p.training || {}).workouts || {})[id]; return w ? Object.assign({ id }, w) : null; },
    exercise(id) { const e = ((this.p.training || {}).exercises || {})[id]; return e ? Object.assign({ id }, e) : { id, name: id, type: 'accessory', load: 'machine' }; },
    restFor(exId) {
      const ex = this.exercise(exId); const t = this.p.training || {};
      const o = Store.data.settings.rest || {};
      const def = { compound: 180, accessory: 120, isolation: 75, conditioning: 60 };
      const type = ex.type || 'accessory';
      return Number(o[type] || (t.rest || {})[type] || def[type] || 90);
    },
    nextWorkoutAfter(d) {
      for (let i = 1; i <= 7; i++) { const x = U.addDays(d, i); const w = this.workoutFor(x); if (w) return { date: x, workout: w }; }
      return null;
    },
    /* home */
    homeDue(d) {
      const items = ((this.p.home || {}).items) || [];
      const dk = U.dayKey(d), isW = this.isWorkday(d);
      return items.filter(it => {
        if (it.monthDay) return d.getDate() === Number(it.monthDay);
        return U.matchDays(it.days, dk, isW);
      });
    },
    /* the day's checklist */
    itemsFor(d) {
      d = d || new Date();
      const p = this.p, dk = U.dayKey(d), isW = this.isWorkday(d);
      const items = [];
      for (const r0 of (p.routine || [])) {
        if (!U.matchDays(r0.days, dk, isW)) continue;
        const r = Object.assign({}, r0, (!isW && r0.daysOff) ? r0.daysOff : {});
        delete r.daysOff;
        const it = { id: r.id, title: r.title, part: r.part || 'morning', time: r.time || null, kind: r.kind || (r.meal ? 'meal' : 'task'), detail: r.detail || '' };
        if (r.meal) {
          const m = this.mealFor(d, r.meal);
          if (m) { it.meal = m; it.title = m.name.toLowerCase() === String(r.title).toLowerCase() ? r.title : r.title + ': ' + lower1(m.name); it.detail = r.detail ? r.detail : (m.how || ''); }
        }
        if (it.kind === 'workout') {
          const w = this.workoutFor(d); if (!w) continue;
          it.workout = w; it.title = w.name + ': ' + lower1(w.focus || 'session'); it.detail = workoutSummary(w);
        }
        if (it.kind === 'writing') { const wr = ((p.mind || {}).writing) || {}; it.detail = wr.goal ? 'Goal: ' + wr.goal : ''; }
        items.push(it);
      }
      for (const m of this.mods) { try { for (const x of (m.items(d) || [])) items.push(x); } catch (e) { console.warn('opus: ' + m.prefix + ' items', e); } }
      for (const h of this.homeDue(d)) items.push({ id: 'home:' + h.id, title: h.title, part: h.part || 'evening', time: h.time || null, kind: 'home', detail: h.note || '', home: h });
      const f = p.food || {};
      if (f.prepDay === dk) items.push({ id: 'food-prep', title: 'Groceries and food prep', part: 'workday', time: f.prepTime || null, kind: 'prep', detail: 'Shop the list, then prep the week' });
      const mo = p.money || {};
      if (mo.checkInDay === dk) items.push({ id: 'money-checkin', title: 'Money check-in', part: 'evening', time: mo.checkInTime || null, kind: 'money', detail: 'Five minutes: pay in, spending, debts' });
      const rv = p.review || {};
      if (rv.day === dk) items.push({ id: 'weekly-review', title: 'Weekly review', part: 'evening', time: rv.time || null, kind: 'review', detail: 'What worked, what slipped, one change' });
      items.sort((a, b) => PARTS.indexOf(a.part) - PARTS.indexOf(b.part) || (U.mins(a.time) ?? 2000) - (U.mins(b.time) ?? 2000));
      return items;
    },
    kindId(kind) { const r = (this.p.routine || []).find(x => x.kind === kind); return r ? r.id : null; },
    /* modules whose ticks live in their own logs (pets, supplements): { prefix, items(d), checked(d) -> ids, set(d, id, on) } */
    mods: [],
    mod(id) { const i = String(id).indexOf(':'); return i > 0 ? this.mods.find(m => m.prefix === String(id).slice(0, i)) : null; },
    checked(d) {
      const own = Store.data.checks[U.key(d)] || [];
      if (!this.mods.length) return own;
      const out = own.filter(id => !this.mod(id));
      for (const m of this.mods) { try { for (const id of (m.checked(d) || [])) if (!out.includes(id)) out.push(id); } catch (e) { console.warn('opus: ' + m.prefix + ' checked', e); } }
      return out;
    },
    isChecked(d, id) { return this.checked(d).includes(id); },
    setChecked(d, id, on) {
      const m = this.mod(id);
      if (m) { m.set(d, id, on); Store.save(); return; }
      const k = U.key(d); const a = Store.data.checks[k] = Store.data.checks[k] || [];
      const i = a.indexOf(id);
      if (on && i < 0) a.push(id);
      if (!on && i >= 0) a.splice(i, 1);
      Store.save();
    },
    nextThing(now) {
      now = now || new Date();
      const s = this.p.schedule || {};
      const m = U.nowMins(now), wake = U.mins(s.wake) ?? 300, lights = U.mins(s.lightsOut) ?? 1290;
      const items = this.itemsFor(now);
      if (m < wake - 30 || m >= lights) {
        return { kind: 'sleep', title: 'Rest', detail: m >= lights ? 'Lights out was ' + U.fmtTimeAP(s.lightsOut) + '. Tomorrow starts at ' + U.fmtTimeAP(s.wake) + '.' : 'Up at ' + U.fmtTimeAP(s.wake) + '.', time: null };
      }
      const cur = PARTS.indexOf(this.currentPart(now));
      const open = items.filter(it => !this.isChecked(now, it.id) && PARTS.indexOf(it.part) >= cur);
      if (open.length) return Object.assign({ overdue: open[0].time && U.mins(open[0].time) < m - 20 }, open[0]);
      return { kind: 'sleep', title: 'Wind down', detail: 'That is the day. Lights out at ' + U.fmtTimeAP(s.lightsOut) + '.', time: s.lightsOut };
    }
  };
  function lower1(s) { s = String(s || ''); return s && s[0] === s[0].toUpperCase() && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; }
  function workoutSummary(w) {
    const b = (w.blocks || [])[0]; if (!b) return w.focus || '';
    const ex = Plan.exercise(b.ex);
    const sug = Opus.training ? Opus.training.suggest(b) : null;
    const r = b.reps[0] === b.reps[1] ? b.reps[0] : b.reps[0] + '–' + b.reps[1];
    let s = ex.name + ' ' + b.sets + ' × ' + r;
    if (sug && sug.weight) s += ' at ' + U.wt(sug.weight);
    const n = (w.blocks || []).length;
    return s + (n > 1 ? ' + ' + (n - 1) + ' more' : '');
  }
  Plan.workoutSummary = workoutSummary;

  /* ---------- plan validation (for imports from Claude or Grok) ---------- */
  const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
  Plan.validate = function (p) {
    const errors = [], warnings = [];
    if (!p || typeof p !== 'object') return { ok: false, errors: ['The plan is empty or not an object.'], warnings };
    if (p.format !== 'opus-plan') errors.push('"format" must be "opus-plan".');
    if (p.version !== 1) errors.push('"version" must be 1.');
    const s = p.schedule || {};
    for (const k of ['wake', 'lightsOut', 'workStart', 'workEnd', 'dayOffMidday', 'dayOffEvening']) if (s[k] != null && !TIME.test(s[k])) errors.push('schedule.' + k + ' should look like "05:00".');
    (s.workdays || []).forEach(d => { if (!DAYS.includes(d)) errors.push('schedule.workdays has "' + d + '"; use sun, mon, tue, wed, thu, fri, sat.'); });
    const ids = new Set();
    (p.routine || []).forEach((r, i) => {
      if (!r.id) errors.push('routine item ' + (i + 1) + ' needs an "id".');
      else if (ids.has(r.id)) errors.push('routine id "' + r.id + '" is used twice.'); else ids.add(r.id);
      if (!r.title) errors.push('routine item "' + (r.id || i + 1) + '" needs a "title".');
      if (r.part && !PARTS.includes(r.part)) errors.push('routine "' + r.id + '": part must be morning, workday or evening.');
      if (r.time && !TIME.test(r.time)) errors.push('routine "' + r.id + '": time should look like "12:00".');
    });
    const MICROS = ['fiber', 'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'vitA', 'vitC', 'vitD', 'b12', 'folate'];
    const microErr = (o, where) => {
      if (typeof o !== 'object' || Array.isArray(o)) { errors.push(where + ': micros should be an object like { "fiber": 3.1, "potassium": 422 }.'); return; }
      for (const k of Object.keys(o)) {
        if (k === 'estimate' || k === 'note') continue;
        if (!MICROS.includes(k)) errors.push(where + ': micros has "' + k + '"; use ' + MICROS.join(', ') + '.');
        else if (o[k] != null && !(Number(o[k]) >= 0)) errors.push(where + ': micros.' + k + ' should be a number (or null).');
      }
    };
    if (p.health != null) {
      const hl = p.health;
      if (typeof hl !== 'object' || Array.isArray(hl)) errors.push('health should be an object.');
      else if (hl.reference != null && !['men-19-30', 'men-31-50', 'women-19-30', 'women-31-50'].includes(hl.reference)) errors.push('health.reference should be men-19-30, men-31-50, women-19-30 or women-31-50.');
      const sp = hl && hl.supplements;
      if (sp != null && !Array.isArray(sp)) errors.push('health.supplements should be a list.');
      const sids = new Set();
      (Array.isArray(sp) ? sp : []).forEach((x, i) => {
        if (!x || typeof x !== 'object' || !x.id || !x.name) { errors.push('health.supplements item ' + (i + 1) + ' needs "id" and "name".'); return; }
        if (sids.has(x.id)) errors.push('supplement id "' + x.id + '" is used twice.'); sids.add(x.id);
        if (x.part != null && !PARTS.includes(x.part)) errors.push('supplement "' + x.id + '": part should be morning, workday or evening.');
        if (x.time != null && !TIME.test(x.time)) errors.push('supplement "' + x.id + '": time should look like "07:30" (or null).');
        if (x.days != null && x.days !== 'all' && x.days !== 'workdays' && x.days !== 'daysoff' && !(Array.isArray(x.days) && x.days.every(d => U.DAYS.includes(d)))) errors.push('supplement "' + x.id + '": days should be "all", "workdays", "daysoff" or a list like ["mon","thu"].');
        if (x.since != null && !/^\d{4}-\d{2}-\d{2}$/.test(x.since)) errors.push('supplement "' + x.id + '": since should be the date it was started, like "2026-11-18" (or null).');
        if (x.supply != null && !(x.supply && typeof x.supply === 'object' && Number(x.supply.left) >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(x.supply.asOf || '') && (x.supply.perDose == null || Number(x.supply.perDose) > 0))) errors.push('supplement "' + x.id + '": supply should be { "left": 60, "asOf": "2026-11-18", "perDose": 1 } (or null).');
      });
    }
    const f = p.food || {}, meals = f.meals || {};
    ((f.rotation || {}).weeks || []).forEach((w, i) => {
      for (const [slot, id] of Object.entries(w)) if (slot !== 'name' && !meals[id]) errors.push('food rotation week ' + (i + 1) + ' (' + slot + ') points to meal "' + id + '", which is not in food.meals.');
    });
    for (const [id, m] of Object.entries(meals)) {
      if (!m.name) errors.push('meal "' + id + '" needs a "name".');
      (m.ingredients || []).forEach(g => { if (!g.item) errors.push('meal "' + id + '" has an ingredient without "item".'); });
      if (m.macros) for (const k of ['kcal', 'protein', 'carbs', 'fat']) { const v = m.macros[k]; if (v != null && !(Number(v) >= 0)) errors.push('meal "' + id + '": macros.' + k + ' should be a number (or null).'); }
      if (m.parts != null) {
        if (!Array.isArray(m.parts)) errors.push('meal "' + id + '": parts should be a list.');
        else m.parts.forEach((pt, i) => {
          if (!pt || !pt.name) errors.push('meal "' + id + '", part ' + (i + 1) + ' needs a "name".');
          else if (pt.amount != null && !(Number(pt.amount) > 0)) errors.push('meal "' + id + '", part "' + pt.name + '": amount should be a number above 0.');
          if (pt && pt.macros) for (const k of ['kcal', 'protein', 'carbs', 'fat']) { const v = pt.macros[k]; if (v != null && !(Number(v) >= 0)) errors.push('meal "' + id + '", part "' + pt.name + '": macros.' + k + ' should be a number (or null).'); }
          if (pt && pt.micros != null) microErr(pt.micros, 'meal "' + id + '", part "' + pt.name + '"');
        });
      }
    }
    if (f.library != null) {
      if (!Array.isArray(f.library)) errors.push('food.library should be a list of foods.');
      else f.library.forEach((x, i) => {
        if (!x || !x.name) errors.push('food.library item ' + (i + 1) + ' needs a "name".');
        else if (x.amount != null && !(Number(x.amount) > 0)) errors.push('food.library "' + x.name + '": amount should be a number above 0.');
        if (x && x.macros) for (const k of ['kcal', 'protein', 'carbs', 'fat']) { const v = x.macros[k]; if (v != null && !(Number(v) >= 0)) errors.push('food.library "' + x.name + '": macros.' + k + ' should be a number (or null).'); }
        if (x && x.micros != null) microErr(x.micros, 'food.library "' + (x.name || i + 1) + '"');
      });
    }
    const t = p.training || {}, ex = t.exercises || {}, wo = t.workouts || {};
    for (const [d, id] of Object.entries(t.schedule || {})) {
      if (!DAYS.includes(d)) errors.push('training.schedule day "' + d + '" is not a day key.');
      if (!wo[id]) errors.push('training.schedule.' + d + ' points to workout "' + id + '", which is not in training.workouts.');
    }
    for (const [id, w] of Object.entries(wo)) (w.blocks || []).forEach(b => {
      if (!ex[b.ex]) errors.push('workout "' + id + '" uses exercise "' + b.ex + '", which is not in training.exercises.');
      if (!Array.isArray(b.reps) || b.reps.length !== 2) errors.push('workout "' + id + '", "' + b.ex + '": reps must be [low, high].');
      if (!(b.sets > 0)) errors.push('workout "' + id + '", "' + b.ex + '": sets must be a number above 0.');
    });
    for (const [id, e] of Object.entries(ex)) {
      if (!['compound', 'accessory', 'isolation', 'conditioning'].includes(e.type)) warnings.push('exercise "' + id + '": type should be compound, accessory, isolation or conditioning.');
      if (!['barbell-lower', 'barbell-upper', 'dumbbell', 'machine', 'cable', 'bodyweight'].includes(e.load)) warnings.push('exercise "' + id + '": load should be barbell-lower, barbell-upper, dumbbell, machine, cable or bodyweight.');
    }
    const mo = p.money || {};
    if (mo.cushion != null && !(typeof mo.cushion === 'number' && mo.cushion >= 0)) errors.push('money.cushion must be a number of dollars, 0 or more, or null.');
    (mo.debts || []).forEach((d, i) => { if (!d.name) errors.push('money.debts item ' + (i + 1) + ' needs a "name".'); });
    (mo.bills || []).forEach((b, i) => { if (!b.name) errors.push('money.bills item ' + (i + 1) + ' needs a "name".'); if (b.every && !['week', 'month', 'year'].includes(b.every)) errors.push('bill "' + b.name + '": every must be week, month or year.'); });
    const hids = new Set();
    (((p.home || {}).items) || []).forEach((h, i) => {
      if (!h.id || !h.title) errors.push('home item ' + (i + 1) + ' needs "id" and "title".');
      if (hids.has(h.id)) errors.push('home id "' + h.id + '" is used twice.'); hids.add(h.id);
      if (h.time && !TIME.test(h.time)) errors.push('home "' + h.id + '": time should look like "19:30".');
      if (h.pet != null && typeof h.pet !== 'string' && !(Array.isArray(h.pet) && h.pet.every(x => typeof x === 'string'))) errors.push('home "' + h.id + '": pet should be a pet\'s id, or a list of ids, from home.pets.');
    });
    const pids = new Set(), UNITS = ['day', 'week', 'month'];
    const pets = (p.home || {}).pets;
    if (pets != null && !Array.isArray(pets)) errors.push('home.pets should be a list.');
    (Array.isArray(pets) ? pets : []).forEach((pt, i) => {
      if (!pt || typeof pt !== 'object' || !pt.id || !pt.name) { errors.push('home.pets item ' + (i + 1) + ' needs "id" and "name".'); return; }
      if (pids.has(pt.id)) errors.push('pet id "' + pt.id + '" is used twice.'); pids.add(pt.id);
      if (pt.kind != null && !['dog', 'cat', 'other'].includes(pt.kind)) errors.push('pet "' + pt.id + '": kind should be dog, cat or other.');
      if (pt.born != null && !/^\d{4}-\d{2}-\d{2}$/.test(pt.born)) errors.push('pet "' + pt.id + '": born should be a date like "2020-05-14" (or null).');
      for (const k of ['age', 'weightLb']) if (pt[k] != null && !(typeof pt[k] === 'number' && pt[k] >= 0)) errors.push('pet "' + pt.id + '": ' + k + ' should be a number (or null).');
      if (pt.notes != null && !Array.isArray(pt.notes)) errors.push('pet "' + pt.id + '": notes should be a list of lines.');
      const cids = new Set();
      (pt.care || []).forEach((c, j) => {
        if (!c || !c.id || !c.title) { errors.push('pet "' + pt.id + '": care item ' + (j + 1) + ' needs "id" and "title".'); return; }
        if (['weight', 'vet'].includes(c.id)) errors.push('pet "' + pt.id + '": care id "' + c.id + '" is reserved; pick another.');
        if (cids.has(c.id)) errors.push('pet "' + pt.id + '": care id "' + c.id + '" is used twice.'); cids.add(c.id);
        if (c.every != null && !(c.every && typeof c.every === 'object' && Number(c.every.n) > 0 && UNITS.includes(c.every.unit))) errors.push('pet "' + pt.id + '", care "' + c.id + '": every should be like { "n": 1, "unit": "month" } (day, week or month), or null.');
      });
    });
    return { ok: errors.length === 0, errors, warnings };
  };
  Plan.summary = function (p) {
    const f = p.food || {}, t = p.training || {}, mo = p.money || {};
    return [
      (p.routine || []).length + ' daily items',
      (((f.rotation || {}).weeks) || []).length + ' meal weeks',
      Object.keys(t.workouts || {}).length + ' workouts',
      (mo.bills || []).length + ' bills',
      (mo.debts || []).length + ' debts',
      (((p.home || {}).items) || []).length + ' home items'
    ].join(' · ');
  };
  Opus.plan = Plan;
})();
