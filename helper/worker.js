/*
  Opus helper for Grok: a tiny MCP server that runs free on Cloudflare Workers.
  It lets Grok read the owner's private opus-data repo and save two files there:
    - plan.json  (checked with the same rules Opus uses before it is saved)
    - grok.json  (Grok's outbox: free cash, money weeks, balances, weigh-ins, workouts, food eaten, blood tests)
    - growth.json (Cassius's Growth page: today's words, the lesson, prompts, creed, reading, notes)
  It never writes logs.json. It also writes helper.json ({ version, since }) once per new version, so Opus can tell
  when the helper is behind the app. Cloudflare redeploys it from the opus repo (helper/) on every change there.

  Two secrets, set in Cloudflare (Settings > Variables and Secrets), never in this file:
    GITHUB_TOKEN  a fine-grained GitHub token: only opus-data, Contents read and write
    ACCESS_KEY    a long random string; the helper only answers at https://<worker>/<ACCESS_KEY>/mcp
  Plain variables (optional):
    REPO          donaldfischer15-lang/opus-data   (default below)
    TIME_ZONE     the owner's time zone for "today" on the Growth page (default America/New_York)
*/
const DEFAULT_REPO = 'donaldfischer15-lang/opus-data';
const VERSION = '1.5.0';
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const PARTS = ['morning', 'workday', 'evening'];
const Plan = {};
/* plan checks, copied from Opus (site/js/core.js) */
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
  (mo.debts || []).forEach((d, i) => { if (!d.name) errors.push('money.debts item ' + (i + 1) + ' needs a "name".'); });
  (mo.bills || []).forEach((b, i) => { if (!b.name) errors.push('money.bills item ' + (i + 1) + ' needs a "name".'); if (b.every && !['week', 'month', 'year'].includes(b.every)) errors.push('bill "' + b.name + '": every must be week, month or year.'); });
  const hids = new Set();
  (((p.home || {}).items) || []).forEach((h, i) => {
    if (!h.id || !h.title) errors.push('home item ' + (i + 1) + ' needs "id" and "title".');
    if (hids.has(h.id)) errors.push('home id "' + h.id + '" is used twice.'); hids.add(h.id);
    if (h.time && !TIME.test(h.time)) errors.push('home "' + h.id + '": time should look like "19:30".');
  });
  return { ok: errors.length === 0, errors, warnings };
};

/* ---------- GitHub ---------- */
function b64enc(s) { const b = new TextEncoder().encode(s); let x = ''; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); }
function b64dec(s) { const x = atob(String(s).replace(/\s/g, '')); const b = new Uint8Array(x.length); for (let i = 0; i < x.length; i++) b[i] = x.charCodeAt(i); return new TextDecoder().decode(b); }
function gh(env) {
  const repo = env.REPO || DEFAULT_REPO;
  const H = { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'opus-grok-helper' };
  const url = p => (env.GITHUB_API || 'https://api.github.com') + '/repos/' + repo + '/contents/' + p;
  return {
    async get(p) {
      const r = await fetch(url(p), { headers: H });
      if (r.status === 404) return { missing: true };
      if (!r.ok) throw new Error('GitHub answered ' + r.status + ' reading ' + p + (r.status === 401 ? ' (the token is wrong or expired)' : ''));
      const j = await r.json();
      return { text: b64dec(j.content || ''), sha: j.sha };
    },
    async put(p, text, sha, message) {
      const body = { message, content: b64enc(text), committer: { name: 'Grok via Opus helper', email: 'opus-helper@users.noreply.github.com' } };
      if (sha) body.sha = sha;
      const r = await fetch(url(p), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify(body) });
      if (r.status === 409 || r.status === 422) { const e = new Error('The file changed while saving (the phone probably synced). Read it again and redo the change.'); e.conflict = true; throw e; }
      if (!r.ok) throw new Error('GitHub answered ' + r.status + ' saving ' + p);
      return (await r.json()).content.sha;
    }
  };
}

/* ---------- the outbox merge ---------- */
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = v => typeof v === 'number' && isFinite(v);
/* The outbox sections. GUIDE.md section 4 lists exactly these (a test checks that the two match).
   Each check returns null when the entry is fine, or what is wrong with it, naming the field. */
const listErr = (o, k) => {
  if (o[k] == null) return null;
  if (!Array.isArray(o[k])) return k + ' must be a list';
  for (let n = 0; n < o[k].length; n++) { const x = o[k][n]; if (!isObj(x)) return k + '[' + n + '] must be an object like { "name": "...", "amount": 12.5 }'; if (!num(x.amount)) return k + '[' + n + '].amount must be a number (got ' + JSON.stringify(x.amount) + ')'; }
  return null;
};
const MICROS = ['fiber', 'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'vitA', 'vitC', 'vitD', 'b12', 'folate'];
const microsErr = m => { if (m == null) return null; if (!isObj(m)) return 'micros must be an object like { "fiber": 3.1, "potassium": 422 }'; for (const k of Object.keys(m)) { if (k === 'estimate' || k === 'note') continue; if (!MICROS.includes(k)) return 'micros.' + k + ' is not one Opus tracks (' + MICROS.join(', ') + ')'; if (m[k] != null && !(num(m[k]) && m[k] >= 0)) return 'micros.' + k + ' must be a number or null'; } return null; };
const dateErr = (o, k) => isDate(o[k]) ? null : k + ' must be a date like "2026-11-27" (got ' + JSON.stringify(o[k]) + ')';
const OUT = [
  ['money.cash', 'date', c => dateErr(c, 'date') || (num(c.cash) || num(c.free) ? null : 'needs cash (or free) as a number') || listErr(c, 'held') || listErr(c, 'accounts') || (c.free != null && !num(c.free) ? 'free must be a number' : null)],
  ['money.weeks', 'weekEnding', w => dateErr(w, 'weekEnding') || (w.paycheck == null || num(w.paycheck) ? null : 'paycheck must be a number or null') || ['spent', 'bills', 'debtPayments', 'balances'].map(k => listErr(w, k)).find(Boolean) || null],
  ['money.balances', 'date', w => dateErr(w, 'date') || (isObj(w.debts) ? (Object.keys(w.debts).map(k => w.debts[k] == null || num(w.debts[k]) ? null : 'debts["' + k + '"] must be a number').find(Boolean) || null) : 'debts must be an object like { "Credit card": 1840 }')],
  ['weights', 'date', w => dateErr(w, 'date') || (num(w.lb) ? null : 'lb must be a number')],
  ['workouts', 'id', w => (typeof w.id === 'string' && w.id ? null : 'id must be a text id like "grok-2026-11-27"') || dateErr(w, 'date') || (Array.isArray(w.sets) ? null : 'sets must be a list')],
  ['eaten', 'id', e => (typeof e.id === 'string' && e.id ? null : 'id must be a text id like "grok-2026-11-27-shake"') || dateErr(e, 'date') || (typeof e.name === 'string' && e.name.trim() ? null : 'name must be the food, like "Protein shake"') || (e.amount == null || num(e.amount) ? null : 'amount must be a number or null') || (e.macros == null ? null : !isObj(e.macros) ? 'macros must be an object like { "kcal": 120, "protein": 24, "carbs": 3, "fat": 1.5 }' : (['kcal', 'protein', 'carbs', 'fat'].map(k => e.macros[k] == null || num(e.macros[k]) ? null : 'macros.' + k + ' must be a number or null').find(Boolean) || null)) || microsErr(e.micros) || (e.slot == null || ['breakfast', 'lunch', 'snack', 'dinner'].includes(e.slot) ? null : 'slot must be breakfast, lunch, snack or dinner')],
  ['labs', 'date', l => dateErr(l, 'date') || (Array.isArray(l.markers) && l.markers.length ? null : 'markers must be a list of results like [{ "name": "Ferritin", "value": 85, "unit": "ng/mL", "range": "30-400", "low": 30, "high": 400 }]') || l.markers.map((m, n) => !isObj(m) ? 'markers[' + n + '] must be an object' : !(typeof m.name === 'string' && m.name.trim()) ? 'markers[' + n + '].name must be the marker as the report prints it' : !num(m.value) ? 'markers[' + n + '].value must be a number (got ' + JSON.stringify(m.value) + ')' : (m.low != null && !num(m.low)) ? 'markers[' + n + '].low must be a number or left out' : (m.high != null && !num(m.high)) ? 'markers[' + n + '].high must be a number or left out' : null).find(Boolean) || null]
];
const OUT_PATHS = OUT.map(o => o[0]);
const getp = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function setp(o, p, v) { const ks = p.split('.'); let a = o; for (const k of ks.slice(0, -1)) { if (!isObj(a[k])) a[k] = {}; a = a[k]; } a[ks[ks.length - 1]] = v; }
// accept { "money.cash": [...] } and { "cash": [...] } as well as { "money": { "cash": [...] } }; name anything else
function normalizeEntries(add) {
  const out = {}, unknown = [];
  for (const k of Object.keys(add)) {
    if (['format', 'version', 'updated'].includes(k)) continue;
    if (k === 'money' && isObj(add.money)) { for (const m of Object.keys(add.money)) { if (OUT_PATHS.includes('money.' + m)) setp(out, 'money.' + m, add.money[m]); else unknown.push('money.' + m); } continue; }
    const path = OUT_PATHS.includes(k) ? k : OUT_PATHS.includes('money.' + k) ? 'money.' + k : null;
    if (path) setp(out, path, add[k]); else unknown.push(k);
  }
  return { out, unknown };
}
function mergeOutbox(cur, add) {
  const out = isObj(cur) && cur.format === 'opus-grok' ? cur : { format: 'opus-grok', version: 1 };
  const report = { added: 0, replaced: 0, bad: [] };
  let any = false;
  const nz = normalizeEntries(add);
  nz.unknown.forEach(u => report.bad.push('"' + u + '" is not an outbox section, so it was not saved. The sections are: ' + OUT_PATHS.join(', ') + '.'));
  for (const [p, keyName, check] of OUT) {
    const items = getp(nz.out, p); if (items == null) continue;
    const arr = Array.isArray(items) ? items : isObj(items) ? [items] : null;
    if (!arr) { report.bad.push(p + ' must be a list of entries'); continue; }
    const list = Array.isArray(getp(out, p)) ? getp(out, p) : []; setp(out, p, list);
    arr.forEach((x, n) => {
      const where = p + '[' + n + ']';
      if (!isObj(x)) { report.bad.push(where + ' must be an object'); return; }
      const k = x[keyName];
      if (k == null || k === '') { report.bad.push(where + ' has no "' + keyName + '"'); return; }
      if (x.delete !== true) { const e = check(x); if (e) { report.bad.push(p + ' ' + k + ': ' + e); return; } }
      if (p === 'money.cash' && !x.delete && !x.at) x.at = new Date().toISOString();
      const i = list.findIndex(y => isObj(y) && y[keyName] === k);
      if (i >= 0) { list[i] = x; report.replaced++; } else { list.push(x); report.added++; }
      any = true;
    });
  }
  out.updated = new Date().toISOString(); // Opus copies this into logs.json sync.outbox.updated once it picks the file up
  return { out, report, any, received: Object.keys(add) };
}

/* ---------- reading in pieces (Grok's reader cuts long results) ---------- */
const PAGE = 14000;
function pick(obj, section) {
  const v = getp(obj, section);
  if (v === undefined) return { err: '"' + section + '" is not in this file. Sections: ' + Object.keys(obj).filter(k => k !== 'format' && k !== 'version').join(', ') + '.' };
  return { v };
}
function sinceFilter(v, since) {
  if (!since || !Array.isArray(v)) return v;
  return v.filter(x => !isObj(x) || String(x.date || x.weekEnding || x.weekOf || '') >= since);
}
function guideSection(text, section) {
  const parts = text.split(/\n(?=## )/), want = String(section).toLowerCase();
  const hit = parts.filter(t => { const head = t.split('\n')[0].toLowerCase(); return head.startsWith('## ' + want + '.') || head.includes(want); });
  return hit.length ? hit.join('\n') : null;
}
function paged(t, part, label) {
  const total = Math.max(1, Math.ceil(t.length / PAGE)), n = Math.min(Math.max(1, part | 0 || 1), total);
  const body = t.slice((n - 1) * PAGE, n * PAGE);
  return total === 1 ? body : '[' + label + ': part ' + n + ' of ' + total + (n < total ? '. Call again with part ' + (n + 1) + ' for the rest.' : '. This is the end.') + ']\n' + body;
}

/* ---------- the Growth page (Cassius) ---------- */
const G_LISTS = { lessons: 'date', notes: 'date', prompts: 'id', reading: 'id', subjects: 'id' };
const G_CAP = { lessons: 120, notes: 60, prompts: 40, reading: 60, subjects: 12 };
const G_ONE = ['energy', 'creed', 'lesson', 'prompt'];
const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
function blankGrowth() { return { format: 'opus-growth', version: 1, updated: null, energy: null, creed: { lines: [] }, lesson: null, prompt: null, prompts: [], subjects: [], reading: [], lessons: [], notes: [] }; }
function mergeGrowth(old, add, today) {
  const out = Object.assign(blankGrowth(), isObj(old) && old.format === 'opus-growth' ? old : {});
  const done = [], bad = [];
  for (const k of Object.keys(add)) {
    const v = add[k];
    if (G_ONE.includes(k)) {
      if (v === null) { out[k] = k === 'creed' ? { lines: [] } : null; done.push(k + ' cleared'); continue; }
      if (k === 'creed') {
        const lines = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.lines) ? v.lines : null;
        if (!lines || !lines.every(x => typeof x === 'string')) { bad.push('creed needs { "lines": ["...", "..."] }'); continue; }
        out.creed = { lines: lines.map(x => x.trim()).filter(Boolean).slice(0, 20) }; done.push('creed'); continue;
      }
      const o = typeof v === 'string' ? { text: v } : v;
      if (!isObj(o)) { bad.push(k + ' must be an object'); continue; }
      const e = Object.assign({}, o); if (!isDate(e.date)) e.date = today;
      if ((k === 'energy' || k === 'prompt') && !(typeof e.text === 'string' && e.text.trim())) { bad.push(k + ' needs "text"'); continue; }
      if (k === 'energy' && !('from' in e)) e.from = null;
      if (k === 'lesson') {
        if (!(typeof e.title === 'string' && e.title.trim()) || typeof e.body !== 'string') { bad.push('lesson needs "title" and "body"'); continue; }
        const prev = out.lesson;
        if (isObj(prev) && prev.title && prev.date !== e.date) { out.lessons = (out.lessons || []).filter(x => x.date !== prev.date).concat([prev]); done.push('yesterday\'s lesson filed in lessons'); }
      }
      out[k] = e; done.push(k); continue;
    }
    if (G_LISTS[k]) {
      const key = G_LISTS[k];
      if (!Array.isArray(v)) { bad.push(k + ' must be a list'); continue; }
      let list = Array.isArray(out[k]) ? out[k].slice() : [];
      let n = 0;
      for (const raw of v) {
        let e = typeof raw === 'string' && k === 'prompts' ? { text: raw } : raw;
        if (!isObj(e)) { bad.push('a ' + k + ' entry is not an object'); continue; }
        e = Object.assign({}, e);
        if (key === 'id' && !e.id) e.id = slug(e.title || e.name || e.text);
        if (key === 'date' && !isDate(e.date)) e.date = today;
        if (!e[key]) { bad.push('a ' + k + ' entry has no ' + key); continue; }
        // notes can share a date: they are told apart by date + what they are on
        const same = x => k === 'notes' ? x.date === e.date && (x.on || '') === (e.on || '') : x[key] === e[key];
        if (e.delete === true) { const before = list.length; list = list.filter(x => !same(x)); if (list.length < before) n++; continue; }
        const i = list.findIndex(same);
        if (i >= 0) list[i] = e; else list.push(e);
        n++;
      }
      if (key === 'date') list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      out[k] = list.slice(-G_CAP[k]);
      done.push(n + ' ' + k);
      continue;
    }
    if (['format', 'version', 'updated'].includes(k)) continue;
    bad.push('"' + k + '" is not a Growth section (use energy, creed, lesson, prompt, prompts, subjects, reading, lessons, notes)');
  }
  out.format = 'opus-growth'; out.version = 1; out.updated = new Date().toISOString();
  return { out, done, bad };
}

/* ---------- tools ---------- */
const FILES = { plan: 'plan.json', logs: 'logs.json', guide: 'GUIDE.md', outbox: 'grok.json', growth: 'growth.json' };
const TOOLS = [
  { name: 'read_opus_file', description: 'Read a file from the owner\'s Opus repo. "guide" is GUIDE.md (read it first: it explains every file and the rules). "plan" is plan.json, the plan you may change. "logs" is logs.json, everything the owner entered on the phone (read only); its "sync" section says when Opus last synced and what it picked up from your outbox. "outbox" is grok.json, entries you added. "growth" is growth.json, the Growth page that Cassius fills in. Long files come in parts of about 14,000 characters: the first line says "part 1 of N", and you ask for the next with part. To read less, give section: a top-level key such as "money" or "training", or a dotted path such as "money.debts" (plan and logs), or a heading number or word such as "4" or "outbox" (guide). since ("YYYY-MM-DD") keeps only list entries from that date on, for example logs section "workouts".',
    inputSchema: { type: 'object', properties: { file: { type: 'string', enum: ['guide', 'plan', 'logs', 'outbox', 'growth'] }, section: { type: 'string', description: 'Optional: one part of the file, like "money", "money.debts", "training.exercises" or "workouts".' }, since: { type: 'string', description: 'Optional: YYYY-MM-DD; only list entries from this date on.' }, part: { type: 'integer', description: 'Optional: which part of a long result, starting at 1.' } }, required: ['file'] } },
  { name: 'update_plan_section', description: 'Change one part of plan.json without sending the whole plan. section is a top-level key ("money", "training", "food", "home", "routine", "schedule", "mind", "review", "profile", "notes", "name") or a dotted path inside one ("money.debts", "money.takeHomePerWeek", "training.schedule"). value replaces that part whole, so read that section first, change it, and send it back. Everything else in the plan stays exactly as it is, including edits the owner or Claude made meanwhile. Opus checks the whole plan with its own rules before saving and refuses a broken one, naming the problem. Never invent numbers; use null when unknown.',
    inputSchema: { type: 'object', properties: { section: { type: 'string' }, value: { description: 'The new value for that section (object, list, number, text or null).' }, change: { type: 'string', description: 'One short line saying what changed, for the history.' } }, required: ['section', 'value', 'change'] } },
  { name: 'update_growth', description: 'Save to the Growth page (growth.json), the teacher\'s page in Opus. Send only the sections you change, as in GUIDE.md section 5. energy, creed, lesson and prompt are replaced whole (a missing "date" becomes today; a new lesson files the old one in "lessons"). prompts, subjects, reading, lessons and notes are lists: an entry with the same key replaces the old one (prompts, subjects and reading by "id"; lessons by "date"; notes by "date" and "on"), new ones are added, and { key, "delete": true } removes one. Never invent facts about the owner.',
    inputSchema: { type: 'object', properties: { sections: { type: 'object', description: 'Like { "energy": { "text": "...", "from": null }, "lesson": { "subject": "...", "title": "...", "body": "...", "question": "..." }, "prompt": { "text": "..." }, "notes": [ { "text": "...", "on": "writing:2026-11-18" } ] }' }, change: { type: 'string', description: 'One short line saying what changed, for the history.' } }, required: ['sections', 'change'] } },
  { name: 'save_plan', description: 'Save the whole updated plan.json. Prefer update_plan_section for a change to one part. Read the whole plan first (all its parts) and send it back complete, with your change made: "format": "opus-plan", "version": 1, every id kept, "updated" set to today. Change only what the owner asked for. Never invent numbers; use null when unknown. Opus checks the plan the same way the app does and refuses a broken one.',
    inputSchema: { type: 'object', properties: { plan: { type: 'object', description: 'The complete plan object.' }, change: { type: 'string', description: 'One short line saying what changed, for the history.' } }, required: ['plan', 'change'] } },
  { name: 'add_to_outbox', description: 'Add or correct entries for Opus, in the grok.json format from GUIDE.md section 4. The sections are ' + OUT_PATHS.join(', ') + ': free cash (cash on hand and what is held back before payday, from the accounts), money weeks, debt balance snapshots, weigh-ins, workouts, food the owner ate that is not a planned meal (eaten), and blood test results copied from the lab report (labs). Anything else is refused by name. Send only the new or corrected entries; entries already in grok.json are kept. Same key again corrects an entry; { key, "delete": true } takes one back. Opus copies them into the logs the next time the owner opens it.',
    inputSchema: { type: 'object', properties: { entries: { type: 'object', description: 'Like { "money": { "cash": [...], "weeks": [...], "balances": [...] }, "weights": [...], "workouts": [...], "eaten": [...], "labs": [...] }' }, change: { type: 'string' } }, required: ['entries', 'change'] } }
];
function text(t, isError) { return { content: [{ type: 'text', text: t }], isError: !!isError }; }
function parseMaybe(x) { if (typeof x === 'string') { let s = x.trim(); const f = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) s = f[1]; return JSON.parse(s); } return x; }

async function callTool(name, args, env) {
  const G = gh(env);
  args = args || {};
  if (name === 'read_opus_file') {
    const f = FILES[args.file]; if (!f) return text('file must be guide, plan, logs, outbox or growth.', true);
    const r = await G.get(f);
    if (r.missing) return text(f + ' does not exist yet.' + (args.file === 'outbox' ? ' Use add_to_outbox to start it.' : args.file === 'growth' ? ' Use update_growth to start it.' : ''));
    let out = r.text, label = f;
    if (args.section != null && String(args.section).trim()) {
      const sec = String(args.section).trim();
      if (args.file === 'guide') { out = guideSection(r.text, sec); if (out == null) return text('No heading in GUIDE.md matches "' + sec + '". Headings: ' + (r.text.match(/^## .+$/gm) || []).map(x => x.slice(3)).join(' | '), true); }
      else {
        let o; try { o = JSON.parse(r.text); } catch (e) { return text(f + ' is not valid JSON right now: ' + e.message, true); }
        const pk = pick(o, sec); if (pk.err) return text(pk.err, true);
        out = JSON.stringify(sinceFilter(pk.v, isDate(args.since) ? args.since : null), null, 1);
      }
      label = f + ' › ' + sec;
    } else if (isDate(args.since) && args.file !== 'guide') {
      try { const o = JSON.parse(r.text); for (const k of Object.keys(o)) o[k] = sinceFilter(o[k], args.since); out = JSON.stringify(o, null, 1); } catch (e) {}
    }
    return text(paged(out, args.part, label));
  }
  if (name === 'update_plan_section') {
    const sec = String(args.section || '').trim();
    if (!sec || /^(format|version|updated|rev)$/.test(sec.split('.')[0])) return text('section must name a part of the plan such as "money" or "money.debts" (not format, version or updated).', true);
    let v; try { v = typeof args.value === 'string' && /^\s*[[{]/.test(args.value) ? parseMaybe(args.value) : args.value; } catch (e) { return text('value is not valid JSON: ' + e.message, true); }
    if (v === undefined) return text('value is missing. Send the new contents of ' + sec + '.', true);
    const cur = await G.get(FILES.plan);
    if (cur.missing) return text('plan.json does not exist yet, so there is nothing to change. Use save_plan to write a whole plan.', true);
    let plan; try { plan = JSON.parse(cur.text); } catch (e) { return text('plan.json is not valid JSON right now (' + e.message + '). Fix it with save_plan first.', true); }
    const top = sec.split('.')[0];
    if (!(top in plan)) return text('"' + top + '" is not a part of this plan. Parts: ' + Object.keys(plan).filter(k => !/^(format|version|updated|rev)$/.test(k)).join(', ') + '.', true);
    if (sec.includes('.') && getp(plan, sec.split('.').slice(0, -1).join('.')) == null) return text('"' + sec.split('.').slice(0, -1).join('.') + '" is not in the plan, so "' + sec + '" can\'t be set.', true);
    if (JSON.stringify(getp(plan, sec)) === JSON.stringify(v)) return text('Nothing changed in ' + sec + ', so nothing was saved.');
    setp(plan, sec, v);
    let today; try { today = new Intl.DateTimeFormat('en-CA', { timeZone: env.TIME_ZONE || 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { today = new Date().toISOString().slice(0, 10); }
    plan.updated = today;
    const val = Plan.validate(plan);
    if (!val.ok) return text('Not saved. With that change the plan has problems:\n- ' + val.errors.slice(0, 10).join('\n- '), true);
    const change = String(args.change || sec + ' update').replace(/\s+/g, ' ').slice(0, 100);
    await G.put(FILES.plan, JSON.stringify(plan, null, 2) + '\n', cur.sha, 'Grok: ' + change);
    return text('Saved ' + sec + ' in plan.json; the rest of the plan is unchanged. Opus picks it up the next time the owner opens it.' + (val.warnings.length ? '\nWarnings:\n- ' + val.warnings.slice(0, 8).join('\n- ') : ''));
  }
  if (name === 'save_plan') {
    let p; try { p = parseMaybe(args.plan); } catch (e) { return text('The plan is not valid JSON: ' + e.message, true); }
    const v = Plan.validate(p);
    if (!v.ok) return text('Not saved. Fix these first:\n- ' + v.errors.slice(0, 15).join('\n- '), true);
    const cur = await G.get(FILES.plan);
    if (!cur.missing) {
      let old = null; try { old = JSON.parse(cur.text); } catch (e) {}
      if (isObj(old)) {
        const lost = Object.keys(old).filter(k => !(k in p));
        if (lost.length) return text('Not saved. The plan is missing whole sections that are in the current plan.json: ' + lost.join(', ') + '. Read the plan again and send it back complete.', true);
        if (JSON.stringify(old) === JSON.stringify(p)) return text('Nothing changed, so nothing was saved.');
      }
    }
    const change = String(args.change || 'plan update').replace(/\s+/g, ' ').slice(0, 100);
    await G.put(FILES.plan, JSON.stringify(p, null, 2) + '\n', cur.sha, 'Grok: ' + change);
    return text('Saved plan.json. Opus picks it up the next time the owner opens it.' + (v.warnings.length ? '\nWarnings:\n- ' + v.warnings.join('\n- ') : ''));
  }
  if (name === 'add_to_outbox') {
    let add; try { add = parseMaybe(args.entries); } catch (e) { return text('The entries are not valid JSON: ' + e.message, true); }
    if (!isObj(add)) return text('entries must be an object like { "money": { "weeks": [...] } }.', true);
    const cur = await G.get(FILES.outbox);
    let old = null; if (!cur.missing) { try { old = JSON.parse(cur.text); } catch (e) { old = null; } }
    const { out, report, any } = mergeOutbox(old, add);
    if (!any) return text('Nothing saved.' + (report.bad.length ? ' Problems:\n- ' + report.bad.join('\n- ') : ' No entries found in what you sent (top-level keys: ' + (Object.keys(add).join(', ') || 'none') + '). Send them like { "money": { "cash": [ { "date": "2026-11-27", "cash": 900 } ] } }. The sections are: ' + OUT_PATHS.join(', ') + '.'), true);
    const change = String(args.change || 'outbox').replace(/\s+/g, ' ').slice(0, 100);
    await G.put(FILES.outbox, JSON.stringify(out, null, 2) + '\n', cur.sha, 'Grok: ' + change);
    return text('Saved to grok.json: ' + report.added + ' new, ' + report.replaced + ' corrected.' + (report.bad.length ? ' NOT saved:\n- ' + report.bad.join('\n- ') + '\n' : ' ') + 'Opus copies them in the next time the owner opens it; logs.json section "sync" then shows what it picked up.');
  }
  if (name === 'update_growth') {
    let add; try { add = parseMaybe(args.sections); } catch (e) { return text('The sections are not valid JSON: ' + e.message, true); }
    if (!isObj(add) || !Object.keys(add).length) return text('sections must be an object like { "energy": { "text": "..." } }.', true);
    const cur = await G.get(FILES.growth);
    let old = null; if (!cur.missing) { try { old = JSON.parse(cur.text); } catch (e) { old = null; } }
    let today; try { today = new Intl.DateTimeFormat('en-CA', { timeZone: env.TIME_ZONE || 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { today = new Date().toISOString().slice(0, 10); }
    const { out, done, bad } = mergeGrowth(old, add, typeof args.today === 'string' && isDate(args.today) ? args.today : today);
    if (!done.length) return text('Nothing saved.' + (bad.length ? ' Problems:\n- ' + bad.join('\n- ') : ''), true);
    const change = String(args.change || 'growth').replace(/\s+/g, ' ').slice(0, 100);
    await G.put(FILES.growth, JSON.stringify(out, null, 2) + '\n', cur.sha, 'Cassius: ' + change);
    return text('Saved to the Growth page: ' + done.join(', ') + '.' + (bad.length ? ' Skipped:\n- ' + bad.join('\n- ') : '') + ' The owner sees it the next time Opus opens.');
  }
  return text('Unknown tool ' + name, true);
}

/* ---------- helper.json: tell Opus which version is live (written once per version) ---------- */
let reported = null;
async function report(env) {
  if (reported === VERSION) return;
  try {
    const G = gh(env), cur = await G.get('helper.json');
    let old = null; if (!cur.missing) { try { old = JSON.parse(cur.text); } catch (e) {} }
    if (!old || old.version !== VERSION) await G.put('helper.json', JSON.stringify({ format: 'opus-helper', version: VERSION, since: new Date().toISOString() }, null, 2) + '\n', cur.sha, 'Helper: now ' + VERSION);
    reported = VERSION;
  } catch (e) { /* try again next time */ }
}

/* ---------- MCP over HTTP (stateless, JSON replies) ---------- */
async function handleRpc(msg, env, ctx) {
  const { id, method, params } = msg || {};
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return err(-32600, 'Invalid request');
  if (id === undefined) return null; // a notification: nothing to answer
  if (method === 'initialize') return ok({ protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'opus', version: VERSION }, instructions: 'Opus is the owner\'s phone app. Read GUIDE.md first (read_opus_file with file "guide"; long files come in parts). Save a change to one part of the plan with update_plan_section (or the whole plan with save_plan), things you log with add_to_outbox, and the Growth page with update_growth. You can never change logs.json.' });
  if (method === 'ping') return ok({});
  if (method === 'tools/list' || method === 'tools/call') { const p = report(env); if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p; }
  if (method === 'tools/list') return ok({ tools: TOOLS });
  if (method === 'tools/call') {
    try {
      let r;
      for (let i = 0; i < 2; i++) { try { r = await callTool(params && params.name, params && params.arguments, env); break; } catch (e) { if (!e.conflict || i === 1) throw e; } }
      return ok(r);
    } catch (e) { return ok(text(String(e.message || e), true)); }
  }
  if (method === 'resources/list') return ok({ resources: [] });
  if (method === 'prompts/list') return ok({ prompts: [] });
  return err(-32601, 'Method not found');
}
function same(a, b) { a = String(a || ''); b = String(b || ''); if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

export default {
  // Cloudflare runs this every hour (see wrangler.jsonc), so a new version reports in without waiting for Grok
  async scheduled(event, env, ctx) { if (env.GITHUB_TOKEN) ctx.waitUntil(report(env)); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const notFound = () => new Response('Not found', { status: 404 });
    if (!env.ACCESS_KEY || String(env.ACCESS_KEY).length < 24 || !env.GITHUB_TOKEN) {
      // made fresh on every visit and never stored: copy it into the ACCESS_KEY secret
      const a = new Uint8Array(24); crypto.getRandomValues(a); const key = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
      return new Response('Opus helper is almost set up.\n\n' + (env.GITHUB_TOKEN ? '' : '- Add the secret GITHUB_TOKEN.\n') + (env.ACCESS_KEY && String(env.ACCESS_KEY).length >= 24 ? '' : '- Add the secret ACCESS_KEY. Here is a new random one you can use:\n\n' + key + '\n') + '\nThen deploy again and reload this page.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (parts.length < 1 || parts.length > 2 || !same(parts[0], env.ACCESS_KEY) || (parts[1] && parts[1] !== 'mcp')) return notFound();
    if (request.method === 'GET' && /event-stream/.test(request.headers.get('Accept') || '')) return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    if (request.method === 'GET') return new Response('Opus helper ' + VERSION + ' is running. Add this address to Grok as a custom connector:\n\n' + url.origin + '/' + parts[0] + '/mcp', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (request.method === 'DELETE') return new Response(null, { status: 204 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    let body; try { body = await request.json(); } catch (e) { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(m => handleRpc(m, env, ctx)))).filter(Boolean);
      return out.length ? Response.json(out) : new Response(null, { status: 202 });
    }
    const r = await handleRpc(body, env, ctx);
    return r ? Response.json(r) : new Response(null, { status: 202 });
  }
};
