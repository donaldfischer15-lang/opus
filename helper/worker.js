/*
  Opus helper for Grok: a tiny MCP server that runs free on Cloudflare Workers.
  It lets Grok read the owner's private opus-data repo and save these files there:
    - plan.json  (checked with the same rules Opus uses before it is saved)
    - grok.json  (Grok's outbox: free cash, money weeks, balances, receipts, weigh-ins, workouts, food eaten, blood tests, pet care, supplements)
  - desk.json  (the shared desk: notes for Claude, who builds the app, and Claude's replies)
  - memory.md  (the shared memory: what Grok, Cassius and Claude know about the owner)
  Grok can read growth.json but never change it: since 1.11.0 the Growth page belongs to Cassius alone (the owner's
  choice, 2026-11-20). Everything Grok writes here is signed Grok.
  Since 1.12.0 Cassius has an address of his own, /<CASSIUS_KEY>/mcp. It does everything Grok's does, signed Cassius,
  and one thing more: save_growth, which writes the Growth page (version 2). Grok's address still can't touch it.
  It never writes logs.json. It also writes helper.json ({ version, since, push, token }) when one changes, so Opus can tell
  when the helper is behind the app and when its GitHub token runs out (it also sends a notification a week and a day before). Cloudflare redeploys it from the opus repo (helper/) on every change there.

  Two secrets, set in Cloudflare (Settings > Variables and Secrets), never in this file:
    GITHUB_TOKEN  a fine-grained GitHub token: only opus-data, Contents read and write
    ACCESS_KEY    a long random string; the helper only answers at https://<worker>/<ACCESS_KEY>/mcp
  Since 1.14.0 nothing else goes into Cloudflare. The helper keeps its other keys itself, sealed in opus-data as keys.json
  (AES-GCM, with a key made from ACCESS_KEY), so a change never needs a new secret:
    Cassius's key  made the first time https://<worker>/<ACCESS_KEY>/cassius is opened; that page then always shows
                   the same finished address, https://<worker>/<cassius key>/mcp.
    WHOOP app      client id and secret, typed once into the page at https://<worker>/<ACCESS_KEY>/whoop.
  A CASSIUS_KEY, WHOOP_CLIENT_ID or WHOOP_CLIENT_SECRET secret set in Cloudflare still wins over the kept one.
  WHOOP (1.13.0): once its app is known, the helper pulls the owner's WHOOP data into whoop.json
  (see the WHOOP section below). Grok and Cassius can read it; nobody writes it but the helper.
  Notifications: Opus writes push.json (push address + schedule); this helper sends what falls due every five minutes.
  Plain variables (optional):
    REPO          donaldfischer15-lang/opus-data   (default below)
    TIME_ZONE     the owner's time zone (default America/New_York)
*/
const DEFAULT_REPO = 'donaldfischer15-lang/opus-data';
const VERSION = '1.25.0';
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
  const MICROS = ['fiber', 'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'vitA', 'vitC', 'vitD', 'vitK', 'b12', 'folate'];
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
      if (x.nutrients != null) { if (typeof x.nutrients !== 'object' || Array.isArray(x.nutrients)) errors.push('supplement "' + x.id + '": nutrients should be an object like { "magnesium": 200 } (per dose), or null.'); else for (const k of Object.keys(x.nutrients)) { if (!MICROS.includes(k)) errors.push('supplement "' + x.id + '": nutrients has "' + k + '"; use ' + MICROS.join(', ') + '.'); else if (x.nutrients[k] != null && !(Number(x.nutrients[k]) >= 0)) errors.push('supplement "' + x.id + '": nutrients.' + k + ' should be a number (or null).'); } }
      if (x.label != null && !(x.label && typeof x.label === 'object' && Array.isArray(x.label.facts) && x.label.facts.every(q => q && typeof q.name === 'string' && q.name.trim() && Number(q.amount) >= 0 && /^(mg|mcg|g|IU)$/.test(q.unit || '')))) errors.push('supplement "' + x.id + '": label should be { "serving": "1 capsule", "servings": 240, "facts": [{ "name": "Magnesium", "amount": 200, "unit": "mg" }] } with unit mg, mcg, g or IU (or null).');
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
  (mo.bills || []).forEach((b, i) => { if (!b.name) errors.push('money.bills item ' + (i + 1) + ' needs a "name".'); if (b.every && !['week', 'month', 'year'].includes(b.every)) errors.push('bill "' + b.name + '": every must be week, month or year.'); if (b.account != null && typeof b.account !== 'string') errors.push('bill "' + b.name + '": account must be the name of the account it comes out of, like in money.cash accounts.'); });
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

/* ---------- GitHub ---------- */
function b64enc(s) { const b = new TextEncoder().encode(s); let x = ''; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); }
function b64bytes(b) { let x = ''; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); }
function b64dec(s) { const x = atob(String(s).replace(/\s/g, '')); const b = new Uint8Array(x.length); for (let i = 0; i < x.length; i++) b[i] = x.charCodeAt(i); return new TextDecoder().decode(b); }
/* GitHub says on every answer when the helper's token runs out; report() puts it in helper.json so Opus can warn */
let tokenExp;
const seeExp = r => { const x = r.headers.get('github-authentication-token-expiration'); tokenExp = x ? expIso(x) : null; };
function expIso(x) {
  const m = String(x).trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*(UTC|Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) { const t = Date.parse(x); return isFinite(t) ? new Date(t).toISOString() : null; }
  const z = !m[3] || m[3] === 'UTC' || m[3] === 'Z' ? 'Z' : m[3].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
  const t = Date.parse(m[1] + 'T' + m[2] + z); return isFinite(t) ? new Date(t).toISOString() : null;
}
function gh(env, by) {
  const repo = env.REPO || DEFAULT_REPO;
  const H = { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'opus-grok-helper' };
  const url = p => (env.GITHUB_API || 'https://api.github.com') + '/repos/' + repo + '/contents/' + p;
  return {
    async get(p) {
      const r = await fetch(url(p), { headers: H });
      if (r.ok || r.status === 404) seeExp(r);
      if (r.status === 404) return { missing: true };
      if (!r.ok) throw new Error('GitHub answered ' + r.status + ' reading ' + p + (r.status === 401 ? ' (the token is wrong or expired)' : ''));
      const j = await r.json();
      return { text: b64dec(j.content || ''), sha: j.sha };
    },
    async put(p, text, sha, message) {
      const body = { message, content: text instanceof Uint8Array ? b64bytes(text) : b64enc(text), committer: { name: (by || 'Grok') + ' via Opus helper', email: 'opus-helper@users.noreply.github.com' } };
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
const MICROS = ['fiber', 'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'vitA', 'vitC', 'vitD', 'vitK', 'b12', 'folate'];
const microsErr = m => { if (m == null) return null; if (!isObj(m)) return 'micros must be an object like { "fiber": 3.1, "potassium": 422 }'; for (const k of Object.keys(m)) { if (k === 'estimate' || k === 'note') continue; if (!MICROS.includes(k)) return 'micros.' + k + ' is not one Opus tracks (' + MICROS.join(', ') + ')'; if (m[k] != null && !(num(m[k]) && m[k] >= 0)) return 'micros.' + k + ' must be a number or null'; } return null; };
const dateErr = (o, k) => isDate(o[k]) ? null : k + ' must be a date like "2026-11-27" (got ' + JSON.stringify(o[k]) + ')';
const MEM_TAGS = ['Note', 'To do', 'Plans', 'Birthday', 'Gym', 'Food', 'Money', 'Home', 'Health'];
const OUT = [
  ['money.cash', 'date', c => dateErr(c, 'date') || (num(c.cash) || num(c.free) || (Array.isArray(c.accounts) && c.accounts.length) ? null : 'needs cash (or free) as a number, or at least one account balance in accounts') || listErr(c, 'held') || listErr(c, 'accounts') || listErr(c, 'transfers') || (c.free != null && !num(c.free) ? 'free must be a number' : null) || (c.cash != null && !num(c.cash) ? 'cash must be a number' : null)],
  ['money.weeks', 'weekEnding', w => dateErr(w, 'weekEnding') || (w.paycheck == null || num(w.paycheck) ? null : 'paycheck must be a number or null') || ['spent', 'bills', 'debtPayments', 'balances', 'transfers'].map(k => listErr(w, k)).find(Boolean) || null],
  ['money.balances', 'date', w => dateErr(w, 'date') || (isObj(w.debts) ? (Object.keys(w.debts).map(k => w.debts[k] == null || num(w.debts[k]) ? null : 'debts["' + k + '"] must be a number').find(Boolean) || null) : 'debts must be an object like { "Credit card": 1840 }')],
  ['weights', 'date', w => dateErr(w, 'date') || (num(w.lb) ? null : 'lb must be a number')],
  ['workouts', 'id', w => (typeof w.id === 'string' && w.id ? null : 'id must be a text id like "grok-2026-11-27"') || dateErr(w, 'date') || (Array.isArray(w.sets) ? null : 'sets must be a list')],
  ['eaten', 'id', e => (typeof e.id === 'string' && e.id ? null : 'id must be a text id like "grok-2026-11-27-shake"') || dateErr(e, 'date') || (typeof e.name === 'string' && e.name.trim() ? null : 'name must be the food, like "Protein shake"') || (e.amount == null || num(e.amount) ? null : 'amount must be a number or null') || (e.macros == null ? null : !isObj(e.macros) ? 'macros must be an object like { "kcal": 120, "protein": 24, "carbs": 3, "fat": 1.5 }' : (['kcal', 'protein', 'carbs', 'fat'].map(k => e.macros[k] == null || num(e.macros[k]) ? null : 'macros.' + k + ' must be a number or null').find(Boolean) || null)) || microsErr(e.micros) || (e.slot == null || ['breakfast', 'lunch', 'snack', 'dinner'].includes(e.slot) ? null : 'slot must be breakfast, lunch, snack or dinner')],
  ['labs', 'date', l => dateErr(l, 'date') || (Array.isArray(l.markers) && l.markers.length ? null : 'markers must be a list of results like [{ "name": "Ferritin", "value": 85, "unit": "ng/mL", "range": "30-400", "low": 30, "high": 400 }]') || l.markers.map((m, n) => !isObj(m) ? 'markers[' + n + '] must be an object' : !(typeof m.name === 'string' && m.name.trim()) ? 'markers[' + n + '].name must be the marker as the report prints it' : !num(m.value) ? 'markers[' + n + '].value must be a number (got ' + JSON.stringify(m.value) + ')' : (m.low != null && !num(m.low)) ? 'markers[' + n + '].low must be a number or left out' : (m.high != null && !num(m.high)) ? 'markers[' + n + '].high must be a number or left out' : null).find(Boolean) || null],
  ['pets', 'id', e => (typeof e.id === 'string' && e.id ? null : 'id must be "date:pet:care", like "2026-11-27:the-pet-id:flea"') || dateErr(e, 'date') || (typeof e.pet === 'string' && e.pet ? null : 'pet must be the pet\'s id from plan home.pets') || (typeof e.care === 'string' && e.care ? null : 'care must be a care id from that pet\'s care list, or "weight" or "vet"') || (e.id === e.date + ':' + e.pet + ':' + e.care ? null : 'id must be exactly date:pet:care ("' + e.date + ':' + e.pet + ':' + e.care + '")') || (e.lb == null || num(e.lb) ? null : 'lb must be a number') || (e.care === 'weight' && !num(e.lb) ? 'a weight entry needs lb' : null) || (e.note == null || typeof e.note === 'string' ? null : 'note must be text')],
  ['supps', 'id', e => dateErr(e, 'date') || (typeof e.supp === 'string' && e.supp ? null : 'supp must be the supplement\'s id from plan health.supplements') || (e.id === e.date + ':' + e.supp ? null : 'id must be exactly date:supp ("' + e.date + ':' + e.supp + '")')],
  ['receipts', 'id', r => (typeof r.id === 'string' && r.id ? null : 'id must be a text id like "2026-11-22-1037-sams-club"') || dateErr(r, 'date') || (r.time == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? null : 'time must be 24-hour like "10:37" or left out') || (typeof r.store === 'string' && r.store.trim() ? null : 'store must be the store\'s name, like "Sam\'s Club"') || (num(r.total) ? null : 'total must be a number') || (Array.isArray(r.items) && r.items.length ? null : 'items must be a list like [{ "name": "Bananas", "text": "BANANAS", "amount": 1.56 }]') || r.items.map((x, n) => !isObj(x) ? 'items[' + n + '] must be an object' : !(typeof x.name === 'string' && x.name.trim()) ? 'items[' + n + '].name must be the item' : !num(x.amount) ? 'items[' + n + '].amount must be a number (got ' + JSON.stringify(x.amount) + ')' : null).find(Boolean) || listErr(r, 'paid') || (r.subtotal == null || num(r.subtotal) ? null : 'subtotal must be a number') || (r.tax == null || num(r.tax) ? null : 'tax must be a number') || (/\d(?:[\s-]?\d){5,}/.test(JSON.stringify(r).replace(/"(id|date|time|at)":"[^"]*"/g, '')) ? 'a receipt never carries long numbers (card, reference, approval, terminal or transaction numbers); leave them out' : null)],
  ['remember', 'id', e => (typeof e.id === 'string' && e.id ? null : 'id must be a text id like "grok-2026-11-27-dentist"') || (typeof e.text === 'string' && e.text.trim() ? null : 'text must be what to remember, like "Dentist" or "Sam\'s birthday"') || (e.text.length <= 500 ? null : 'text must be 500 characters or fewer') || (e.date == null || isDate(e.date) ? null : 'date must be a date like "2026-11-27" or left out (for a yearly date, the first one; a birth date when born is true)') || (e.time == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time) ? null : 'time must be 24-hour like "15:00" or left out') || (e.time && !e.date ? 'a time needs a date' : null) || (e.yearly && !e.date ? 'yearly needs a date' : null) || ['yearly', 'born', 'pinned'].map(k => e[k] == null || typeof e[k] === 'boolean' ? null : k + ' must be true or false').find(Boolean) || (e.tag == null || MEM_TAGS.includes(e.tag) ? null : 'tag must be one of ' + MEM_TAGS.join(', ') + ', or left out so Opus picks')]
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
      // a balances-only update (accounts, no cash, free or held) folds into that day's reading instead of replacing it
      if (p === 'money.cash' && !x.delete && i >= 0 && isObj(list[i]) && x.cash == null && x.free == null && x.held == null && Array.isArray(x.accounts)) {
        const old = list[i], acc = (Array.isArray(old.accounts) ? old.accounts : []).map(a => Object.assign({ at: old.at }, a));
        for (const a of x.accounts) { const j = acc.findIndex(b => String(b.name || '').toLowerCase() === String(a.name || '').toLowerCase()); const v = Object.assign({ at: x.at }, a); if (j >= 0) acc[j] = v; else acc.push(v); }
        const merged = Object.assign({}, old, { at: x.at, accounts: acc });
        delete merged.cash; delete merged.free; // Opus works both out from the accounts, money on its way and what is held back
        if (x.transfers) merged.transfers = x.transfers;
        if (x.note) merged.note = x.note;
        list[i] = merged; report.replaced++; any = true; return;
      }
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
  const want = String(section).toLowerCase().replace(/^#+\s*/, '').trim();
  const match = (t, mark) => { const head = t.split('\n')[0].toLowerCase(); return head.startsWith(mark + want + '.') || (!/^\d+$/.test(want) && head.includes(want)); };
  const hit = text.split(/\n(?=## )/).filter(t => match(t, '## '));
  if (hit.length) return hit.join('\n');
  const sub = text.split(/\n(?=#{2,3} )/).filter(t => t.startsWith('### ') && match(t, '### '));
  return sub.length ? sub.join('\n') : null;
}
const guideHeads = t => (t.match(/^#{2,3} .+$/gm) || []).map(x => x.replace(/^#+ /, '')).join(' | ');
function paged(t, part, label) {
  const total = Math.max(1, Math.ceil(t.length / PAGE)), n = Math.min(Math.max(1, part | 0 || 1), total);
  const body = t.slice((n - 1) * PAGE, n * PAGE);
  return total === 1 ? body : '[' + label + ': part ' + n + ' of ' + total + (n < total ? '. Call again with part ' + (n + 1) + ' for the rest.' : '. This is the end.') + ']\n' + body;
}

/* ---------- the Growth page (Cassius) ---------- */
const G_LISTS = { lessons: 'date', notes: 'date', prompts: 'id', reading: 'id', subjects: 'id' };
const G_CAP = { lessons: 120, notes: 60, prompts: 40, reading: 60, subjects: 12 };
const G_ONE = ['energy', 'creed', 'lesson', 'prompt', 'ledger', 'recall'];
const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
function mondayOf(k) { const [y, m, d] = k.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d)); x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7); return x.toISOString().slice(0, 10); }
function blankGrowth() { return { format: 'opus-growth', version: 1, updated: null, energy: null, creed: { lines: [] }, lesson: null, prompt: null, ledger: null, recall: null, prompts: [], subjects: [], reading: [], lessons: [], notes: [] }; }
function mergeGrowth(old, add, today) {
  const out = Object.assign(blankGrowth(), isObj(old) && old.format === 'opus-growth' ? old : {});
  const done = [], bad = [];
  for (const k of Object.keys(add)) {
    const v = add[k];
    if (G_ONE.includes(k)) {
      if (v === null) { out[k] = k === 'creed' ? { lines: [] } : null; done.push(k + ' cleared'); continue; }
      if (k === 'creed') {
        // { lines } replaces the lines; { today: n } alone picks the line of the day and keeps the lines
        const prev = isObj(out.creed) ? out.creed : { lines: [] };
        const given = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.lines) ? v.lines : null;
        if (given ? !given.every(x => typeof x === 'string') : !(isObj(v) && 'today' in v)) { bad.push('creed needs { "lines": ["...", "..."] } and/or { "today": <line number from 0> }'); continue; }
        const lines = given ? given.map(x => x.trim()).filter(Boolean).slice(0, 20) : (Array.isArray(prev.lines) ? prev.lines : []);
        let t = isObj(v) && 'today' in v ? v.today : (given ? null : prev.today);
        if (t !== null && t !== undefined && !(Number.isInteger(t) && t >= 0 && t < lines.length)) { bad.push('creed "today" must be a line number from 0 to ' + (lines.length - 1) + ', or null to let the lines take turns'); continue; }
        out.creed = { lines, today: Number.isInteger(t) ? t : null }; done.push(given ? 'creed' : 'creed of the day'); continue;
      }
      if (k === 'ledger') {
        const o = typeof v === 'string' ? { virtue: v } : v;
        if (!isObj(o) || !(typeof o.virtue === 'string' && o.virtue.trim())) { bad.push('ledger needs { "week": "<the Monday>", "virtue": "Order", "why": "one line" }'); continue; }
        const e = { week: mondayOf(isDate(o.week) ? o.week : today), virtue: o.virtue.trim(), why: typeof o.why === 'string' && o.why.trim() ? o.why.trim() : null };
        out.ledger = e; done.push('ledger (' + e.virtue + ', week of ' + e.week + ')'); continue;
      }
      if (k === 'recall') {
        const o = typeof v === 'string' ? { question: v } : v;
        if (!isObj(o) || !(typeof o.question === 'string' && o.question.trim())) { bad.push('recall needs { "question": "...", "from": "lesson:YYYY-MM-DD" }'); continue; }
        if (o.from != null && !/^lesson:\d{4}-\d{2}-\d{2}$/.test(String(o.from))) { bad.push('recall "from" must look like "lesson:2026-11-17"'); continue; }
        const e = { date: isDate(o.date) ? o.date : today, question: o.question.trim(), from: o.from || null };
        const ld = e.from && e.from.slice(7), src = ld && [].concat(out.lessons || [], out.lesson ? [out.lesson] : []).find(x => x && x.date === ld);
        out.recall = e; done.push('recall' + (e.from && !src ? ' (no lesson on ' + ld + ' yet, so there is no takeaway to check against)' : src && !src.takeaway ? ' (the ' + ld + ' lesson has no takeaway yet, so add one in lessons)' : '')); continue;
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
    bad.push('"' + k + '" is not a Growth section (use energy, creed, lesson, prompt, ledger, recall, prompts, subjects, reading, lessons, notes)');
  }
  out.format = 'opus-growth'; out.version = 1; out.updated = new Date().toISOString();
  return { out, done, bad };
}

/* ---------- tools ---------- */
const FILES = { plan: 'plan.json', logs: 'logs.json', guide: 'GUIDE.md', outbox: 'grok.json', growth: 'growth.json', desk: 'desk.json', memory: 'memory.md', whoop: 'whoop.json' };
/* ---------- the shared memory (memory.md) ---------- */
const MEM_SECTIONS = ['About', 'Work', 'Training', 'Food', 'Health', 'Money', 'Home', 'Pets', 'People', 'Goals', 'Preferences', 'Other'];
const MEM_HEAD = '# Shared memory\n\nWhat Grok, Cassius and Claude know about the owner, one fact per line, with who wrote it and when. Written through the Opus helper (update_memory) or by Claude. Never passwords, card, bank or account numbers, ID numbers or sign-in codes.\n';
const MEM_SECRET = /(github_pat_|ghp_|gho_|sk-[A-Za-z0-9]{10,}|\b\d{9,19}\b|\b\d{3}-\d{2}-\d{4}\b|\b(?:\d{4}[ -]){3}\d{1,7}\b|pass(word|code)\s*[:=]|\bpin\s*[:=]?\s*\d{4,})/i;
const memKey = t => String(t).replace(/\s*\((grok|cassius|claude)[^)]*\)\s*$/i, '').trim().toLowerCase().replace(/\s+/g, ' ');
function memParse(t) {
  const out = { head: MEM_HEAD, sections: [] }; if (!t) return out;
  const parts = String(t).replace(/\r/g, '').split(/\n(?=## )/);
  if (!parts[0].startsWith('## ')) out.head = parts.shift().trim() + '\n';
  for (const p of parts) { const lines = p.split('\n'); out.sections.push({ name: lines[0].slice(3).trim(), lines: lines.slice(1).filter(l => /^\s*[-*]\s+\S/.test(l)).map(l => l.replace(/^\s*[-*]\s+/, '').trim()) }); }
  return out;
}
function memText(m) {
  const order = s => { const i = MEM_SECTIONS.findIndex(x => x.toLowerCase() === s.name.toLowerCase()); return i < 0 ? 99 : i; };
  const secs = m.sections.filter(s => s.lines.length).sort((a, b) => order(a) - order(b));
  return m.head.trim() + '\n' + secs.map(s => '\n## ' + s.name + '\n' + s.lines.map(l => '- ' + l).join('\n') + '\n').join('');
}
const TOOLS = [
  { name: 'read_opus_file', description: 'Read a file from the owner\'s Opus repo. "guide" is GUIDE.md (read it first: with no section it gives the short core, the rules and a list of parts; then read the part for what you\'re doing with section, like \"money\", \"food\", \"training\", \"home\", \"health\" or \"outbox\"). "plan" is plan.json, the plan you may change. "logs" is logs.json, everything the owner entered on the phone (read only); its "sync" section says when Opus last synced and what it picked up from your outbox. "outbox" is grok.json, entries you added. "growth" is growth.json, the Growth page, which belongs to Cassius alone: you may read it, but nothing here can change it. "whoop" is whoop.json, the owner\'s WHOOP data by day (recovery, sleep, strain, calories, workouts), which the helper pulls itself; read only. Long files come in parts of about 14,000 characters: the first line says "part 1 of N", and you ask for the next with part. To read less, give section: a top-level key such as "money" or "training", or a dotted path such as "money.debts" (plan and logs), or a heading number or word such as "4" or "outbox" (guide). since ("YYYY-MM-DD") keeps only list entries from that date on, for example logs section "workouts".',
    inputSchema: { type: 'object', properties: { file: { type: 'string', enum: ['guide', 'plan', 'logs', 'outbox', 'growth', 'desk', 'memory', 'whoop'] }, section: { type: 'string', description: 'Optional: one part of the file, like "money", "money.debts", "training.exercises" or "workouts".' }, since: { type: 'string', description: 'Optional: YYYY-MM-DD; only list entries from this date on.' }, part: { type: 'integer', description: 'Optional: which part of a long result, starting at 1.' } }, required: ['file'] } },
  { name: 'update_plan_section', description: 'Change one part of plan.json without sending the whole plan. section is a top-level key ("money", "training", "food", "home", "routine", "schedule", "mind", "review", "profile", "notes", "name") or a dotted path inside one ("money.debts", "money.takeHomePerWeek", "training.schedule"). value replaces that part whole, so read that section first, change it, and send it back. Everything else in the plan stays exactly as it is, including edits the owner or Claude made meanwhile. Opus checks the whole plan with its own rules before saving and refuses a broken one, naming the problem. Never invent numbers; use null when unknown.',
    inputSchema: { type: 'object', properties: { section: { type: 'string' }, value: { description: 'The new value for that section (object, list, number, text or null).' }, change: { type: 'string', description: 'One short line saying what changed, for the history.' } }, required: ['section', 'value', 'change'] } },
  { name: 'leave_note', description: 'Leave a note on the shared desk (desk.json) for Claude, who builds and maintains the Opus app. Use it for anything you cannot do through the plan, outbox or Growth page: something in the app that looks wrong or broken, a feature or screen the owner asked for, a field or kind of entry Opus does not have, or a question about how Opus works. Claude checks the desk each evening, answers on the desk, and asks the owner before building anything. Read the desk first (read_opus_file with file "desk") so you do not repeat an open note. re answers an earlier note by its id. close marks one of your notes done once it is settled. Write plain sentences; never put passwords, tokens or account numbers in a note.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'The note, in plain sentences (up to 1,000 characters).' }, about: { type: 'string', enum: ['app', 'plan', 'data', 'question', 'other'], description: 'Optional: what it is about.' }, re: { type: 'string', description: 'Optional: the id of the note this answers.' }, close: { type: 'string', description: 'Optional: the id of a note to mark done. text can be left out when you only close one.' } } } },
  { name: 'update_memory', description: 'Add to or correct the shared memory (memory.md): what you know about the owner, kept so Grok, Cassius and Claude (who builds Opus) all know the same things. One fact per line, in plain words, as the owner told it. section is a heading such as ' + MEM_SECTIONS.join(', ') + ' (another short name starts a new heading). add appends facts (repeats are skipped); replace swaps the whole section for the facts you send; remove deletes facts by their text. Never put passwords, card, bank or account numbers, ID numbers or sign-in codes in it. Read it first with read_opus_file file "memory".',
    inputSchema: { type: 'object', properties: { section: { type: 'string', description: 'The heading, like "Training" or "People".' }, add: { type: 'array', items: { type: 'string' }, description: 'New facts, one per item (up to 400 characters each).' }, replace: { type: 'array', items: { type: 'string' }, description: 'The whole section, one fact per item. Use instead of add to rewrite it.' }, remove: { type: 'array', items: { type: 'string' }, description: 'Facts to delete, by their text.' }, change: { type: 'string', description: 'One short line for the history.' } }, required: ['section'] } },
  { name: 'save_plan', description: 'Save the whole updated plan.json. Prefer update_plan_section for a change to one part. Read the whole plan first (all its parts) and send it back complete, with your change made: "format": "opus-plan", "version": 1, every id kept, "updated" set to today. Change only what the owner asked for. Never invent numbers; use null when unknown. Opus checks the plan the same way the app does and refuses a broken one.',
    inputSchema: { type: 'object', properties: { plan: { type: 'object', description: 'The complete plan object.' }, change: { type: 'string', description: 'One short line saying what changed, for the history.' } }, required: ['plan', 'change'] } },
  { name: 'add_to_outbox', description: 'Add or correct entries for Opus, in the grok.json format from GUIDE.md section 4. The sections are ' + OUT_PATHS.join(', ') + ': free cash (cash on hand and what is held back before payday, from the accounts; money moving between the owner\'s own accounts goes in transfers, never in spending), money weeks, debt balance snapshots, weigh-ins, workouts, food the owner ate that is not a planned meal (eaten), blood test results copied from the lab report (labs), pet care done, pet weigh-ins and vet visits (pets), supplements taken (supps), and things for the owner\'s Memory: notes, plans on a date and yearly dates like birthdays (remember; one thing per entry, text without the date, dates worked out in the owner\'s time zone; a dated one gets its reminder right away), and store receipts with their line items (receipts; never card, reference, approval, terminal or transaction numbers). Anything else is refused by name. Send only the new or corrected entries; entries already in grok.json are kept. Same key again corrects an entry; { key, "delete": true } takes one back. Opus copies them into the logs the next time the owner opens it.',
    inputSchema: { type: 'object', properties: { entries: { type: 'object', description: 'Like { "money": { "cash": [...], "weeks": [...], "balances": [...] }, "weights": [...], "workouts": [...], "eaten": [...], "labs": [...], "pets": [...], "supps": [...] }' }, change: { type: 'string' } }, required: ['entries', 'change'] } }
];
const GROWTH_KEYS = { energy: 'o', lesson: 'o', recall: 'o', seal: 'o', season: 'o', map: 'o', portrait: 'o', creed: 'o', prompt: 'os', notes: 'a', portraits: 'a', lexicon: 'a', gilded: 'a', constellations: 'a', reading: 'a', made: 'a', lessons: 'a', prompts: 'a' };
const SAVE_GROWTH = { name: 'save_growth', description: 'Save the Growth page (growth.json, version 2), as GUIDE.md section 5 describes it. Read it first with read_opus_file file "growth". Send sections: an object with only the top-level parts you change (' + Object.keys(GROWTH_KEYS).join(', ') + '); each one you send replaces that part whole, and every other part stays as it is. Or send file: the whole page, with "format": "opus-growth" and "version": 2. "updated" is set for you. A seal\'s answer never changes once set, so a seal with the same date and question keeps its answer. The owner sees the change the next time Opus opens, with a notification.',
  inputSchema: { type: 'object', properties: { sections: { type: 'object', description: 'Like { "energy": { "date": "...", "text": "...", "from": "...", "why": "..." }, "lesson": { ... } }' }, file: { type: 'object', description: 'The whole Growth page instead of sections.' }, change: { type: 'string', description: 'One short line saying what changed, for the history and the notification.' } }, required: ['change'] } };
const GROK = { key: 'grok', name: 'Grok' }, CASSIUS = { key: 'cassius', name: 'Cassius' };
const toolsFor = as => as.key === 'cassius' ? TOOLS.concat([SAVE_GROWTH]) : TOOLS;

async function saveGrowth(G, args) {
  let sec = null, whole = null;
  try { if (args.file != null) whole = parseMaybe(args.file); else if (args.sections != null) sec = parseMaybe(args.sections); } catch (e) { return text('That is not valid JSON: ' + e.message, true); }
  if (!whole && !sec) return text('Send sections (the parts you change) or file (the whole page).', true);
  if (whole && (!isObj(whole) || whole.format !== 'opus-growth' || whole.version !== 2)) return text('file must be the whole page with "format": "opus-growth" and "version": 2.', true);
  if (sec && (!isObj(sec) || !Object.keys(sec).length)) return text('sections must be an object like { "energy": { ... } }.', true);
  const parts = whole ? Object.fromEntries(Object.entries(whole).filter(([k]) => !/^(format|version|updated)$/.test(k))) : sec;
  const bad = [];
  for (const [k, v] of Object.entries(parts)) {
    const t = GROWTH_KEYS[k];
    if (!t) { bad.push(/^(ledger|subjects)$/.test(k) ? k + ' is retired; leave it out' : k + ' is not a part of the page (parts: ' + Object.keys(GROWTH_KEYS).join(', ') + ')'); continue; }
    if (v === null) continue;
    if (t === 'a' && !Array.isArray(v)) bad.push(k + ' must be a list or null');
    if (t === 'o' && !isObj(v)) bad.push(k + ' must be an object or null');
    if (t === 'os' && !isObj(v) && typeof v !== 'string') bad.push(k + ' must be an object, text or null');
  }
  if (bad.length) return text('Nothing saved. Problems:\n- ' + bad.join('\n- '), true);
  const cur = await G.get(FILES.growth);
  let old = null; if (!cur.missing) { try { old = JSON.parse(cur.text); } catch (e) { old = null; } }
  const base = whole ? {} : (isObj(old) && old.version === 2 ? JSON.parse(JSON.stringify(old)) : {});
  const out = Object.assign({ format: 'opus-growth', version: 2, updated: null }, base, parts);
  out.format = 'opus-growth'; out.version = 2;
  const os = isObj(old) && isObj(old.seal) ? old.seal : null, ns = isObj(out.seal) ? out.seal : null;
  let kept = '';
  if (os && ns && os.answer && os.date === ns.date && os.question === ns.question && ns.answer !== os.answer) { ns.answer = os.answer; kept = ' The seal kept its first answer, as seals do.'; }
  const was = isObj(old) ? Object.assign({}, old, { updated: null }) : null;
  if (was && JSON.stringify(Object.assign({}, out, { updated: null })) === JSON.stringify(was)) return text('Nothing changed, so nothing was saved.');
  out.updated = new Date().toISOString().slice(0, 19) + 'Z';
  const body = JSON.stringify(out, null, 2) + '\n';
  if (body.length > 400000) return text('Nothing saved: the page would be over 400,000 characters. Move old lessons or notes out first.', true);
  const change = String(args.change || 'Growth page').replace(/\s+/g, ' ').slice(0, 100);
  await G.put(FILES.growth, body, cur.missing ? null : cur.sha, 'Cassius: ' + change);
  return text('Saved to the Growth page: ' + Object.keys(parts).join(', ') + '.' + kept + ' The owner sees it the next time Opus opens.');
}

function text(t, isError) { return { content: [{ type: 'text', text: t }], isError: !!isError }; }
function parseMaybe(x) { if (typeof x === 'string') { let s = x.trim(); const f = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) s = f[1]; return JSON.parse(s); } return x; }

async function callTool(name, args, env, as) {
  as = as || GROK;
  const G = gh(env, as.name);
  args = args || {};
  if (name === 'read_opus_file') {
    const f = FILES[args.file]; if (!f) return text('file must be guide, plan, logs, outbox, growth, desk, memory or whoop.', true);
    const r = await G.get(f);
    if (r.missing) return text(f + ' does not exist yet.' + (args.file === 'outbox' ? ' Use add_to_outbox to start it.' : args.file === 'growth' ? ' Cassius has not written it yet.' : args.file === 'desk' ? ' Nobody has left a note yet. Use leave_note to start it.' : args.file === 'memory' ? ' Nothing is in the shared memory yet. Use update_memory to start it.' : ''));
    let out = r.text, label = f;
    const sec0 = args.section != null ? String(args.section).trim() : '';
    // the guide comes as a short core plus one part per tab (since 1.16.0): no section gives the core, "all" the whole guide
    if (args.file === 'guide' && (!sec0 || /^(all|whole|everything)$/i.test(sec0))) {
      const cut = r.text.indexOf('\n## 1. ');
      if (!sec0 && /\n## Reading this guide/.test(r.text) && cut > 0) { out = r.text.slice(0, cut).trimEnd() + '\n\n(This is the core of the guide. Read the part for what you\'re doing with section, for example "money" or "food"; "all" gives the whole guide.)\n'; label = f + ' (core)'; }
      return text(paged(out, args.part, label));
    }
    if (sec0) {
      const sec = sec0;
      if (args.file === 'guide' || args.file === 'memory') { out = guideSection(r.text, sec); if (out == null) return text('No heading in ' + f + ' matches "' + sec + '". Headings: ' + guideHeads(r.text), true); }
      else {
        let o; try { o = JSON.parse(r.text); } catch (e) { return text(f + ' is not valid JSON right now: ' + e.message, true); }
        const pk = pick(o, sec); if (pk.err) return text(pk.err, true);
        out = JSON.stringify(sinceFilter(pk.v, isDate(args.since) ? args.since : null), null, 1);
      }
      label = f + ' › ' + sec;
    } else if (isDate(args.since) && args.file !== 'guide' && args.file !== 'memory') {
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
    await G.put(FILES.plan, JSON.stringify(plan, null, 2) + '\n', cur.sha, as.name + ': ' + change);
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
    await G.put(FILES.plan, JSON.stringify(p, null, 2) + '\n', cur.sha, as.name + ': ' + change);
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
    await G.put(FILES.outbox, JSON.stringify(out, null, 2) + '\n', cur.sha, as.name + ': ' + change);
    const memAdd = getp(normalizeEntries(add).out, 'remember');
    if (memAdd) { await remindersForMemory(env, Array.isArray(memAdd) ? memAdd : [memAdd]).catch(() => 0); }
    return text('Saved to grok.json: ' + report.added + ' new, ' + report.replaced + ' corrected.' + (report.bad.length ? ' NOT saved:\n- ' + report.bad.join('\n- ') + '\n' : ' ') + 'Opus copies them in the next time the owner opens it; logs.json section "sync" then shows what it picked up.');
  }
  if (name === 'leave_note') {
    const cur = await G.get(FILES.desk);
    let desk = { format: 'opus-desk', version: 1, notes: [] };
    if (!cur.missing) { try { const o = JSON.parse(cur.text); if (o && Array.isArray(o.notes)) desk = o; } catch (e) { return text('desk.json is not valid JSON right now, so nothing was saved. Tell the owner.', true); } }
    const from = as.key, who = as.name, done = [];
    if (args.close != null && String(args.close).trim()) {
      const n = desk.notes.find(x => x.id === String(args.close).trim());
      if (!n) return text('No note on the desk has the id "' + args.close + '". Read the desk to see the ids.', true);
      n.status = 'done'; n.closed = new Date().toISOString(); done.push('closed ' + n.id);
    }
    const t = String(args.text == null ? '' : args.text).trim();
    if (t) {
      if (t.length > 1000) return text('A note can be up to 1,000 characters (this one is ' + t.length + '). Split it or shorten it.', true);
      if (/(github_pat_|ghp_|sk-[A-Za-z0-9]{10,}|\b\d{13,19}\b)/.test(t)) return text('That note looks like it holds a token, key or card number, so it was not saved. Leave secrets out of notes.', true);
      const re = args.re != null && String(args.re).trim() ? String(args.re).trim() : null;
      if (re && !desk.notes.some(x => x.id === re)) return text('No note on the desk has the id "' + re + '".', true);
      let id = from + '-' + Date.now().toString(36); while (desk.notes.some(x => x.id === id)) id += 'x';
      desk.notes.push({ id, from, at: new Date().toISOString(), about: ['app', 'plan', 'data', 'question', 'other'].includes(args.about) ? args.about : 'other', text: t, re, status: 'open' });
      done.push('left note ' + id);
    }
    if (!done.length) return text('Send text for a new note, or close with a note id.', true);
    desk.notes = desk.notes.slice(-200); desk.updated = new Date().toISOString();
    await G.put(FILES.desk, JSON.stringify(desk, null, 1) + '\n', cur.missing ? null : cur.sha, who + ': desk ' + done.join(', '));
    return text('Done: ' + done.join(', ') + '. Claude reads the desk each evening and answers there; read it again with read_opus_file file "desk".');
  }
  if (name === 'update_memory') {
    const from = as.key, who = as.name;
    const secName = String(args.section || '').replace(/[#\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!secName) return text('section is missing. Use one of: ' + MEM_SECTIONS.join(', ') + '.', true);
    const list = v => { if (v == null) return []; if (typeof v === 'string') { try { const j = JSON.parse(v); if (Array.isArray(j)) v = j; } catch (e) {} } return (Array.isArray(v) ? v : [v]).map(x => String(x == null ? '' : x).replace(/\s+/g, ' ').trim()).filter(Boolean); };
    const add = list(args.add), repl = args.replace != null ? list(args.replace) : null, rem = list(args.remove);
    if (!add.length && !repl && !rem.length) return text('Send add, replace or remove with the facts.', true);
    for (const f of add.concat(repl || [])) {
      if (f.length > 400) return text('One fact can be up to 400 characters. Split this one: "' + f.slice(0, 60) + '…"', true);
      if (MEM_SECRET.test(f)) return text('Not saved: "' + f.slice(0, 40) + '…" looks like it holds a password, code, card, account or ID number. Leave those out of the memory.', true);
    }
    const cur = await G.get(FILES.memory), m = memParse(cur.missing ? '' : cur.text);
    let sec = m.sections.find(x => x.name.toLowerCase() === secName.toLowerCase());
    const proper = MEM_SECTIONS.find(x => x.toLowerCase() === secName.toLowerCase()) || secName;
    if (!sec) { if (!add.length && !repl) return text('There is no "' + secName + '" section to remove from.', true); sec = { name: proper, lines: [] }; m.sections.push(sec); }
    const day = new Date().toISOString().slice(0, 10), tag = f => f + ' (' + from + ', ' + day + ')';
    const done = [];
    if (repl) { sec.lines = []; done.push('rewrote ' + sec.name); }
    for (const f of rem) { const k = memKey(f), n = sec.lines.length; sec.lines = sec.lines.filter(l => memKey(l) !== k); if (sec.lines.length < n) done.push('removed 1'); }
    let added = 0, skipped = 0;
    for (const f of (repl || []).concat(add)) { if (sec.lines.some(l => memKey(l) === memKey(f))) { skipped++; continue; } sec.lines.push(tag(f)); added++; }
    if (added) done.push('added ' + added);
    if (sec.lines.length > 120) return text('Not saved: ' + sec.name + ' would hold ' + sec.lines.length + ' facts (120 at most). Merge or remove some with replace.', true);
    const out = memText(m);
    if (out.length > 120000) return text('Not saved: the memory would be over 120,000 characters. Tighten a section with replace first.', true);
    if (!cur.missing && out === cur.text) return text('Nothing changed' + (skipped ? ' (' + skipped + ' already there)' : '') + ', so nothing was saved.');
    const change = String(args.change || done.join(', ') || 'memory').replace(/\s+/g, ' ').slice(0, 100);
    await G.put(FILES.memory, out, cur.missing ? null : cur.sha, who + ': memory ' + sec.name + ', ' + change);
    return text('Saved to memory.md › ' + sec.name + ': ' + (done.join(', ') || 'no change') + (skipped ? ', ' + skipped + ' already there' : '') + '. Claude reads it too.');
  }
  if (name === 'update_growth') {
    if (as.key === 'cassius') return text('update_growth only knew the old, version 1 Growth page. Use save_growth: send the sections you change, or the whole page.', true);
    return text('Nothing saved. The Growth page (growth.json) belongs to Cassius alone now, and the helper no longer changes it. You can still read it with read_opus_file file "growth". If something there looks wrong, leave a note for Claude with leave_note.', true);
  }
  if (name === 'save_growth') {
    if (as.key !== 'cassius') return text('Nothing saved. Only Cassius can change the Growth page, from his own address.', true);
    return saveGrowth(G, args);
  }
  return text('Unknown tool ' + name, true);
}

/* ---------- notifications (Web Push) ----------
   Opus writes push.json: the phone's push address and its own list of what should buzz when, for the next week.
   Every five minutes (wrangler.jsonc) the helper sends what falls due, skipping anything the owner already ticked off
   in logs.json, and it sends a line whenever Grok saves a change. The push signing key (VAPID) is worked out
   from the ACCESS_KEY secret, so there is nothing new to set up; its public half goes into helper.json for Opus. */
const P256 = { p: 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn, n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n,
  gx: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, gy: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n };
const mod = (a, m) => ((a % m) + m) % m;
function inv(a, m) { let [x, y, r0, r1] = [1n, 0n, mod(a, m), m]; while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [x, y] = [y, x - q * y]; } return mod(x, m); }
/* d·G on P-256 in Jacobian coordinates (one inverse at the end, so it stays well inside the free CPU limit) */
function pmul(k) {
  const p = P256.p, gx = P256.gx, gy = P256.gy, m = x => mod(x, p);
  let X = gx, Y = gy, Z = 1n;
  for (let i = k.toString(2).length - 2; i >= 0; i--) {
    { const dl = m(Z * Z), gm = m(Y * Y), bt = m(X * gm), al = m(3n * (X - dl) * (X + dl));
      const X3 = m(al * al - 8n * bt), Z3 = m((Y + Z) * (Y + Z) - gm - dl), Y3 = m(al * (4n * bt - X3) - 8n * gm * gm); X = X3; Y = Y3; Z = Z3; }
    if ((k >> BigInt(i)) & 1n) {
      const z1 = m(Z * Z), u2 = m(gx * z1), s2 = m(gy * Z * z1), H = m(u2 - X), HH = m(H * H), I = m(4n * HH), J = m(H * I), r = m(2n * (s2 - Y)), V = m(X * I);
      const X3 = m(r * r - J - 2n * V), Y3 = m(r * (V - X3) - 2n * Y * J), Z3 = m((Z + H) * (Z + H) - z1 - HH); X = X3; Y = Y3; Z = Z3;
    }
  }
  const zi = inv(Z, p), zi2 = m(zi * zi);
  return [m(X * zi2), m(Y * zi2 * zi)];
}
const big2b = (v, len) => { const b = new Uint8Array(len); for (let i = len - 1; i >= 0; i--) { b[i] = Number(v & 0xffn); v >>= 8n; } return b; };
const b2big = b => b.reduce((a, x) => (a << 8n) | BigInt(x), 0n);
const b64u = b => { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); const x = atob(s + '='.repeat((4 - s.length % 4) % 4)); return Uint8Array.from(x, c => c.charCodeAt(0)); };
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const utf8 = s => new TextEncoder().encode(s);
let vapidCache = null;
async function vapid(env) {
  if (vapidCache && vapidCache.from === env.ACCESS_KEY) return vapidCache;
  const k = await crypto.subtle.importKey('raw', utf8(String(env.ACCESS_KEY)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const raw = new Uint8Array(await crypto.subtle.sign('HMAC', k, utf8('opus web push key 1')));
  const d = mod(b2big(raw), P256.n - 1n) + 1n, Q = pmul(d);
  const pub = cat(new Uint8Array([4]), big2b(Q[0], 32), big2b(Q[1], 32));
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: b64u(big2b(d, 32)), x: b64u(big2b(Q[0], 32)), y: b64u(big2b(Q[1], 32)), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  vapidCache = { from: env.ACCESS_KEY, pub: b64u(pub), key };
  return vapidCache;
}
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
/* RFC 8291 (aes128gcm) */
async function encryptPush(sub, text) {
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(utf8('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, cat(utf8(text), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, ct);
}
async function vapidHeader(env, endpoint) {
  const v = await vapid(env), aud = new URL(endpoint).origin;
  const part = o => b64u(utf8(JSON.stringify(o)));
  const unsigned = part({ typ: 'JWT', alg: 'ES256' }) + '.' + part({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:opus-helper@users.noreply.github.com' });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.key, utf8(unsigned)));
  return 'vapid t=' + unsigned + '.' + b64u(sig) + ', k=' + v.pub;
}
async function sendPush(env, sub, msg) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys) return { status: 0 };
  const body = await encryptPush(sub, JSON.stringify(msg));
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'normal', Authorization: await vapidHeader(env, sub.endpoint) }, body });
  return { status: r.status };
}
async function readPush(G) { const cur = await G.get('push.json'); if (cur.missing) return null; try { return Object.assign(JSON.parse(cur.text), { _sha: cur.sha }); } catch (e) { return null; } }
/* a push address the push service has dropped (404 or 410) is taken out of push.json so Opus asks for a new one */
async function dropSubs(G, push, gone) {
  if (!gone.length) return;
  const subs = (push.subs || []).filter(s => !gone.includes(s.endpoint));
  const out = Object.assign({}, push, { subs, dropped: new Date().toISOString() }); delete out._sha;
  try { await G.put('push.json', JSON.stringify(out, null, 1) + '\n', push._sha, 'Helper: a notification address expired'); } catch (e) {}
}
async function fanOut(env, G, push, msg) {
  const gone = []; let sent = 0;
  for (const s of push.subs || []) { try { const r = await sendPush(env, s, msg); if (r.status === 404 || r.status === 410) gone.push(s.endpoint); else if (r.status >= 200 && r.status < 300) sent++; } catch (e) {} }
  await dropSubs(G, push, gone);
  return sent;
}
/* every five minutes: send what fell due since the last run */
async function sendDue(env, when) {
  const G = gh(env), push = await readPush(G);
  if (!push || !Array.isArray(push.subs) || !push.subs.length || !Array.isArray(push.events)) return 0;
  const to = when, from = when - 5 * 60000;
  const due = push.events.filter(e => { const t = Date.parse(e.at); return t >= from && t < to; });
  if (!due.length) return 0;
  let checks = null;
  if (due.some(e => e.check)) { try { const l = await G.get('logs.json'); checks = l.missing ? {} : (JSON.parse(l.text).checks || {}); } catch (e) { checks = {}; } }
  let sent = 0;
  for (const e of due) {
    if (e.kind !== 'test' && push.kinds && push.kinds[e.kind] === false) continue;
    if (e.check && Array.isArray(checks[e.check.date]) && checks[e.check.date].includes(e.check.id)) continue;
    sent += await fanOut(env, G, push, { title: e.title, body: e.body || '', tab: e.tab || 'today', tag: e.check ? e.check.date + ':' + e.check.id : e.kind + ':' + e.at });
  }
  return sent;
}
const SECTION_TAB = { food: 'food', training: 'train', money: 'money', home: 'home', mind: 'growth', health: 'food' };
async function notifyChange(env, who, change, tab) {
  try {
    const G = gh(env), push = await readPush(G);
    if (!push || !(push.subs || []).length || (push.kinds && push.kinds.changes === false)) return;
    await fanOut(env, G, push, { title: who + ' changed ' + (tab === 'growth' ? 'your Growth page' : 'Opus'), body: change, tab: tab || 'today', tag: 'change:' + Date.now() });
  } catch (e) {}
}

/* Memory entries Grok adds get their reminders right away, before the phone next opens: the same times Opus uses
   (an hour before a timed plan, 7 AM for an untimed one, birthdays 8 AM a week ahead and on the day), merged into
   push.json in the phone's time zone. The phone writes its own schedule over it on its next sync, which then has them too. */
function zonedAt(dateKey, hm, tz) {
  const [y, mo, d] = dateKey.split('-').map(Number), [h, mi] = hm.split(':').map(Number);
  let t = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    t += Date.UTC(y, mo - 1, d, h, mi) - shown;
  }
  return t;
}
const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function memEvents(e, now, tz) {
  if (!isObj(e) || e.delete || !isDate(e.date)) return [];
  const title = String(e.text || '').trim().slice(0, 80); if (!title) return [];
  const out = [], until = now + 8 * 864e5, base = { kind: 'calendar', title, tab: 'today', from: 'mem:' + e.id };
  const push = (t, body) => { if (t > now && t <= until) out.push(Object.assign({ at: new Date(t).toISOString(), body }, base)); };
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(now));
  if (e.yearly) {
    const [by, bm, bd] = e.date.split('-').map(Number); let y = +todayKey.slice(0, 4);
    for (let k = 0; k < 2; k++, y++) {
      const key = y + '-' + String(bm).padStart(2, '0') + '-' + String(bd).padStart(2, '0');
      if (key < todayKey) continue;
      const turns = e.born && y > by ? y - by : null, wd = DAYN[new Date(Date.UTC(y, bm - 1, bd)).getUTCDay()];
      push(zonedAt(key, '08:00', tz), turns ? 'Turns ' + turns + ' today' : 'Today');
      push(zonedAt(key, '08:00', tz) - 7 * 864e5, 'A week from today, ' + wd + (turns ? '. Turns ' + turns : '') + '.');
      break;
    }
  } else if (e.time) {
    const [h, m] = e.time.split(':').map(Number), ap = (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
    push(zonedAt(e.date, e.time, tz) - 36e5, 'At ' + ap + ', in an hour');
  } else push(zonedAt(e.date, '07:00', tz), 'Today');
  return out;
}
async function remindersForMemory(env, entries) {
  const G = gh(env);
  for (let i = 0; i < 2; i++) {
    const push = await readPush(G);
    if (!push || !(push.subs || []).length || (push.kinds && push.kinds.calendar === false)) return 0;
    const tz = push.tz || 'America/New_York', now = Date.now(), ids = new Set(entries.filter(isObj).map(e => 'mem:' + e.id));
    const fresh = entries.flatMap(e => memEvents(e, now, tz));
    // drop this entry's earlier reminders (a correction or a take-back), and any the phone already has at the same time
    const kept = (push.events || []).filter(ev => !ids.has(ev.from));
    const add = fresh.filter(f => !kept.some(k => k.kind === 'calendar' && k.at === f.at && k.title === f.title));
    if (kept.length === (push.events || []).length && !add.length) return 0;
    const out = Object.assign({}, push, { events: kept.concat(add).sort((a, b) => String(a.at).localeCompare(String(b.at))) }); delete out._sha;
    try { await G.put('push.json', JSON.stringify(out, null, 1) + '\n', push._sha, 'Helper: reminders for a Memory entry'); return add.length; }
    catch (e) { if (!e.conflict) return 0; }
  }
  return 0;
}

/* ---------- the food camera (since 1.20.0) ----------
   Opus sends a photo of food (or of a nutrition label), or a typed description, to POST /food with the header
   X-Opus-Key. That key is worked out from ACCESS_KEY (so nothing new to set up) and handed to the phone in helper.json,
   which only the owner's GitHub token can read. A vision model on the owner's own Cloudflare account, inside the free
   daily amount (10,000 neurons; on the free plan it stops with an error, never charges), says what's in the picture and
   how much; Opus then looks each food up in USDA FoodData Central for the numbers. The model's own rough numbers are
   only a fallback, and everything is shown as an estimate. Photos are never stored. */
let ORIGIN = null;
async function phoneKey(env) {
  const k = await crypto.subtle.importKey('raw', utf8(String(env.ACCESS_KEY)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const raw = new Uint8Array(await crypto.subtle.sign('HMAC', k, utf8('opus phone key 1')));
  return [...raw.slice(0, 20)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// Scout looks closest at a plate; Mistral reads printed labels and typed meals as well and in a fifth of the time (food/vision.json, Nov 22).
// Gemma is not open to this account, so it is left out.
const FOOD_MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/mistralai/mistral-small-3.1-24b-instruct'];
const FOOD_FIRST = { photo: FOOD_MODELS[0], label: FOOD_MODELS[1], words: FOOD_MODELS[1], receipt: FOOD_MODELS[1], supplement: FOOD_MODELS[1] };
// neurons per million tokens (developers.cloudflare.com/workers-ai/platform/pricing, Nov 2026), for the phone's rough daily count
const NEURONS = { '@cf/meta/llama-4-scout-17b-16e-instruct': [24545, 77273], '@cf/mistralai/mistral-small-3.1-24b-instruct': [31876, 50488], '@cf/google/gemma-3-12b-it': [31371, 50560] };
const FOOD_PROMPT = `You are the eye of a food-logging phone app. The owner photographs what they eat, or types it, and you say what it is and how much.
List each separate food or drink as its own item (a burger, fries and a soda are three items). The owner's note always wins over what you see: if it names the place, size or amount, use it.
For each item give:
- "name": a short plain name, like "Cheese pizza" or "Grilled chicken breast".
- "query": words to search the USDA FoodData Central database for it. For a chain restaurant, start with the chain as USDA writes it, like "DOMINO'S 14\\" cheese pizza hand tossed" or "BURGER KING WHOPPER". For a packaged food, the brand and product.
- "brand": the restaurant or brand if the note or packaging shows it, else null.
- "amount" and "unit": how much was eaten, in the unit a person would say (slice, piece, cup, tbsp, oz, bowl, sandwich, can, item, g).
- "grams": your best weight for that amount, in grams.
- "how": a few words on how you sized it (the plate, a fork, a hand, the owner's note).
- "confidence": "high", "medium" or "low".
- "kcal", "protein", "carbs", "fat": your rough numbers for that amount, in calories and grams.
Never add a food you can't see and the note doesn't name. Leave out plates, cutlery, and drinks you can't identify.
"kind" is "meal" for food on a plate or in a hand, "package" for a packaged product, "label" for a Nutrition Facts panel, "none" if there is no food.
"note" is one short sentence on what is most uncertain, or null.
Answer with JSON only, no other words, in exactly this shape:
{"kind":"meal","items":[{"name":"","query":"","brand":null,"amount":1,"unit":"","grams":0,"how":"","confidence":"medium","kcal":0,"protein":0,"carbs":0,"fat":0}],"note":null}`;
const LABEL_PROMPT = `Read the Nutrition Facts panel in this photo exactly as printed. Never guess a number you can't read clearly: use null for it.
Answer with JSON only, no other words, in exactly this shape (numbers without units; grams unless named):
{"name":null,"brand":null,"serving_text":"","serving_g":null,"servings_per_container":null,"kcal":null,"fat_g":null,"carbs_g":null,"fiber_g":null,"sugar_g":null,"protein_g":null,"sodium_mg":null}
"name" and "brand" only if printed on what you can see.`;
const SUPP_PROMPT = `Read the Supplement Facts panel in this photo exactly as printed. Never guess a number you can't read clearly: use null for it.
List every ingredient line that has an amount, in order. "name" is the line as printed, with the form in brackets if printed, like "Vitamin D (as cholecalciferol) (D3)". "amount" is the number alone and "unit" its unit as printed (mg, mcg, g, IU). If a line shows both mcg and IU, give the mcg. "dv" is the % Daily Value as a number, else null.
Answer with JSON only, no other words, in exactly this shape:
{"name":null,"brand":null,"serving_text":"","servings_per_container":null,"facts":[{"name":"","amount":0,"unit":"","dv":null}]}
"name" (the product, like "Vitamin D3 5,000 IU") and "brand" only if printed on what you can see.`;
const RECEIPT_PROMPT = `Read this store receipt exactly as printed. Never guess a number you can't read clearly: use null for it.
List every item line that has a price, in order. For each: "text" is the item as printed, "name" is a plain name a person would say (expand store abbreviations only when sure, like "MM" for Member's Mark), "amount" is the line's price, "qty" the count if printed (like 3 @ 3.98), else null.
A discount or coupon line is its own item with a negative amount.
"paid" lists how it was paid: "how" is a plain word like "debit", "credit", "cash", "gift card" or "store rewards", with the amount. "earned" is rewards earned, if printed.
Never copy any card number, last four digits, reference, approval, authorization, terminal, transaction, TC, AID or account number, or a member number. Leave them out entirely.
Answer with JSON only, no other words, in exactly this shape:
{"store":"","date":"YYYY-MM-DD","time":"HH:MM","items":[{"text":"","name":"","amount":0,"qty":null}],"subtotal":null,"tax":null,"total":null,"paid":[{"how":"","amount":0}],"earned":null}`;
const corsFor = req => { const o = req.headers.get('Origin') || ''; return /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) ? o : 'null'; };
function parseLoose(t) {
  if (isObj(t)) return t;
  t = String(t || '').replace(/```(json)?/gi, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}
const numOr = (v, lo, hi) => { const n = typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : Number(v); return v === null || v === '' || !isFinite(n) ? null : Math.min(hi, Math.max(lo, Math.round(n * 10) / 10)); };
const str = (v, n) => v == null ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, n) || null;
function cleanFood(o) {
  if (!isObj(o)) return null;
  const items = (Array.isArray(o.items) ? o.items : []).filter(isObj).slice(0, 8).map(x => ({
    name: str(x.name, 80), query: str(x.query || x.name, 120), brand: str(x.brand, 60), amount: numOr(x.amount, 0, 100) || 1, unit: str(x.unit, 30) || 'item',
    grams: numOr(x.grams, 0, 3000), how: str(x.how, 140), confidence: ['high', 'medium', 'low'].includes(x.confidence) ? x.confidence : 'medium',
    guess: { kcal: numOr(x.kcal, 0, 6000), protein: numOr(x.protein, 0, 400), carbs: numOr(x.carbs, 0, 800), fat: numOr(x.fat, 0, 400) }
  })).filter(x => x.name);
  return { kind: ['meal', 'package', 'label', 'none'].includes(o.kind) ? o.kind : items.length ? 'meal' : 'none', items, note: str(o.note, 200) };
}
function cleanLabel(o) {
  if (!isObj(o)) return null;
  return { name: str(o.name, 80), brand: str(o.brand, 60), serving: str(o.serving_text, 60), servingG: numOr(o.serving_g, 0, 2000), servings: numOr(o.servings_per_container, 0, 200),
    kcal: numOr(o.kcal, 0, 5000), fat: numOr(o.fat_g, 0, 500), carbs: numOr(o.carbs_g, 0, 800), fiber: numOr(o.fiber_g, 0, 200), sugar: numOr(o.sugar_g, 0, 500), protein: numOr(o.protein_g, 0, 400), sodium: numOr(o.sodium_mg, 0, 20000) };
}
function cleanSupp(o) {
  if (!isObj(o)) return null;
  const units = { mg: 'mg', mcg: 'mcg', 'µg': 'mcg', ug: 'mcg', g: 'g', iu: 'IU' };
  const facts = (Array.isArray(o.facts) ? o.facts : []).filter(isObj).slice(0, 40).map(x => ({ name: str(x.name, 100), amount: numOr(x.amount, 0, 1e7), unit: units[String(x.unit || '').toLowerCase().trim()] || null, dv: numOr(x.dv, 0, 1e6) })).filter(x => x.name && x.amount != null && x.unit);
  if (!facts.length) return null;
  return { name: str(o.name, 80), brand: str(o.brand, 60), serving: str(o.serving_text, 60), servings: numOr(o.servings_per_container, 0, 2000), facts };
}
// a receipt never keeps long numbers: card, reference, approval, terminal and transaction numbers are cut out here too
const noIds = v => v == null ? null : String(v).replace(/[#*xX]*\d[\d\s-]{5,}\d/g, '').replace(/[*xX#•]{2,}\s*\d+/g, '').replace(/\b(ref|appr(oval)?|auth|term(inal)?|tc|aid|trans|acct)\b\s*[#:.]+\s*\S+/gi, '').replace(/\s+/g, ' ').trim() || null;
function cleanReceipt(o) {
  if (!isObj(o)) return null;
  const money = v => { const n = typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : Number(v); return v === null || v === '' || !isFinite(n) || Math.abs(n) > 100000 ? null : Math.round(n * 100) / 100; };
  const items = (Array.isArray(o.items) ? o.items : []).filter(isObj).slice(0, 80).map(x => ({ text: str(noIds(x.text), 60), name: str(noIds(x.name || x.text), 80), amount: money(x.amount), qty: numOr(x.qty, 0, 500) })).filter(x => x.name && x.amount != null);
  const paid = (Array.isArray(o.paid) ? o.paid : []).filter(isObj).slice(0, 6).map(x => ({ how: str(noIds(x.how), 30), amount: money(x.amount) })).filter(x => x.how && x.amount != null);
  const date = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null, time = typeof o.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.time) ? o.time : null;
  return { store: str(String(noIds(o.store) || '').replace(/\s*(store\s*)?#\s*\d+\s*$/i, ''), 60), date, time, items, subtotal: money(o.subtotal), tax: money(o.tax), total: money(o.total), paid, earned: money(o.earned) };
}
const isLimit = m => /4006|daily free allocation|neurons|exceeded|quota|rate.?limit|too many requests|capacity/i.test(m);
async function askModel(env, model, sys, text, image, max) {
  const content = image ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }] : text;
  const t0 = Date.now();
  const r = await env.AI.run(model, { messages: [{ role: 'system', content: sys }, { role: 'user', content }], max_tokens: max || 900, temperature: 0.2 });
  const u = (r && r.usage) || {}, rate = NEURONS[model] || [30000, 80000];
  const neurons = u.prompt_tokens != null ? Math.round(((u.prompt_tokens || 0) * rate[0] + (u.completion_tokens || 0) * rate[1]) / 1e6) : null;
  return { out: r && (r.response != null ? r.response : r.result != null ? r.result : r), ms: Date.now() - t0, neurons, usage: u };
}
/* one read: the models in order until one answers with usable JSON; stops at once when today's free amount is used up */
async function readFood(env, mode, text, image) {
  if (!env.AI) return { ok: false, code: 'setup', error: 'The helper has no AI binding yet. It comes with the next deploy.' };
  const sys = mode === 'label' ? LABEL_PROMPT : mode === 'receipt' ? RECEIPT_PROMPT : mode === 'supplement' ? SUPP_PROMPT : FOOD_PROMPT;
  const prompt = mode === 'label' || mode === 'supplement' ? 'Read this label.' : mode === 'receipt' ? 'Read this receipt.' : (text ? 'The owner\'s note: ' + text + (image ? '' : '\nThere is no photo; go by the note alone.') : 'No note from the owner; go by the photo.');
  const first = FOOD_FIRST[mode === 'label' || mode === 'receipt' || mode === 'supplement' ? mode : image ? 'photo' : 'words'];
  const order = [first].concat(FOOD_MODELS.filter(m => m !== first));
  const tried = [];
  for (const model of order) {
    try {
      const a = await askModel(env, model, sys, prompt, image, mode === 'receipt' ? 2000 : mode === 'supplement' ? 1400 : 900);
      const o = parseLoose(a.out), res = mode === 'label' ? cleanLabel(o) : mode === 'receipt' ? cleanReceipt(o) : mode === 'supplement' ? cleanSupp(o) : cleanFood(o);
      if (!res || (mode === 'receipt' && !res.items.length)) { tried.push(model.split('/').pop() + ': no JSON'); continue; }
      return Object.assign({ ok: true, model: model.split('/').pop(), ms: a.ms, neurons: a.neurons }, mode === 'label' ? { label: res } : mode === 'receipt' ? { receipt: res } : mode === 'supplement' ? { supplement: res } : res);
    } catch (e) {
      const m = String(e && e.message || e);
      if (isLimit(m)) return { ok: false, code: 'limit', error: 'Today\'s free photo reads are used up. They come back at midnight UTC.' };
      tried.push(model.split('/').pop() + ': ' + m.slice(0, 120));
    }
  }
  return { ok: false, code: 'failed', error: 'The photo reader didn\'t answer. Try again in a moment.', tried };
}
async function foodRoute(request, env) {
  const H = { 'Access-Control-Allow-Origin': corsFor(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Opus-Key', 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store', Vary: 'Origin' };
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, H) });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  if (request.method !== 'POST') return J({ ok: false, code: 'bad', error: 'POST only' }, 405);
  if (!same(request.headers.get('X-Opus-Key') || '', await phoneKey(env))) return J({ ok: false, code: 'key', error: 'This phone\'s helper key is out of date. Sync Opus and try again.' }, 401);
  if (Number(request.headers.get('Content-Length') || 0) > 4e6) return J({ ok: false, code: 'bad', error: 'That photo is too big.' }, 413);
  let b; try { b = await request.json(); } catch (e) { return J({ ok: false, code: 'bad', error: 'Bad request' }, 400); }
  const mode = ['label', 'receipt', 'supplement'].includes(b.mode) ? b.mode : 'food';
  const text = str(b.text, 400), image = typeof b.image === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.image) && b.image.length < 4e6 ? b.image : null;
  if (!image && !text) return J({ ok: false, code: 'bad', error: 'Send a photo or a few words.' }, 400);
  if (mode !== 'food' && !image) return J({ ok: false, code: 'bad', error: 'A ' + mode + ' needs a photo.' }, 400);
  return J(await readFood(env, mode, text, image));
}
/* once per helper version: read a test label with each model and save what happened to food/vision.json in the data
   repo, so whoever builds Opus can see which model works before the owner tries it (a few hundred neurons, once) */
const VISION_TEST = 'data:image/jpeg;base64,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jLBVVktZNbWSTzOLnuc9xyfVnCxzpGxx9W00v3xg/NWx8eV5OgB8yvtKMQrDdN2lhy21UYPeKdv+CyGWmlj6lLC32YwFO+DjuXPg47k2kwiG0Yb1WgeoLt4L6FLbgdybgdyjJhFCl9C58F9CldwO5c7kdyZMIvwX0LkUvoUpuR3LncjuTKcIsUvoXYUvoUluh3LndBMmEaKX0LkUvoUlugm7CjIjhS+hdhS+hSG7CbsJkYHg3oXPgw7ln7ATYCZGCKYdy58GHcs7YCbATIwvBx3Lt4OO5ZeyFzsoMTwcdybgdyy9kJshBi7gdy53A7lk4TCDH3I7lzuR3LIwmEHhuR3Juh3L3wmEHjugud0F64TCDy3YXO7C9MJhB1DV2AXKKAREQEREBERAREQEREHGFxsrsiDrspsrsiDrshMLsiDrhc4XKIOMJhcog4wmFyiDjCYXKIOMLlEQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERB//Z';
async function visionCheck(env) {
  if (!env.AI) return 0;
  const G = gh(env), cur = await G.get('food/vision.json');
  let old = null; if (!cur.missing) { try { old = JSON.parse(cur.text); } catch (e) {} }
  if (old && old.version === VERSION) return 0;
  const results = [];
  for (const model of FOOD_MODELS) {
    try {
      const a = await askModel(env, model, LABEL_PROMPT, 'Read this label.', VISION_TEST);
      const o = cleanLabel(parseLoose(a.out));
      results.push({ model, ok: !!o, ms: a.ms, neurons: a.neurons, usage: a.usage, read: o, raw: o ? undefined : String(isObj(a.out) ? JSON.stringify(a.out) : a.out).slice(0, 300) });
    } catch (e) { results.push({ model, ok: false, error: String(e && e.message || e).slice(0, 300) }); if (isLimit(String(e && e.message))) break; }
  }
  try {
    const a = await askModel(env, FOOD_MODELS[0], FOOD_PROMPT, 'The owner\'s note: 1 slice of Domino\'s large hand tossed cheese pizza and a 12 oz can of Coke\nThere is no photo; go by the note alone.');
    results.push({ model: FOOD_MODELS[0], test: 'typed', ok: !!cleanFood(parseLoose(a.out)), ms: a.ms, neurons: a.neurons, read: cleanFood(parseLoose(a.out)) });
  } catch (e) { results.push({ model: FOOD_MODELS[0], test: 'typed', ok: false, error: String(e && e.message || e).slice(0, 300) }); }
  const expect = { kcal: 230, protein: 3, carbs: 37, fat: 8, servingG: 55, servings: 4, sodium: 160 };
  await G.put('food/vision.json', JSON.stringify({ format: 'opus-vision-check', version: VERSION, at: new Date().toISOString(), expect, results }, null, 1) + '\n', cur.missing ? null : cur.sha, 'Helper: photo reader check for ' + VERSION);
  return 1;
}

/* ---------- helper.json: tell Opus which version is live, and when the helper's GitHub token runs out ----------
   Checked once an hour. "token": { "expires": ISO or null for never, "warned": [7, 1] } — a week and a day before it
   runs out, the helper sends a notification itself (so the owner hears even without opening Opus), once each. */
/* ---------- natural voice samples ----------
   A one-time try-out: the opening of today's Cassius sitting in three natural voices, made with Cloudflare's own
   Workers AI (the free daily amount only; on the free plan it stops rather than charges). Saved to voice/ in the data
   repo so Opus can play them like a podcast. Delete voice/samples.json to make them again. */
const VOICE_MODEL = '@cf/deepgram/aura-2-en';
const VOICE_SAMPLES = [['orion', 'Orion'], ['apollo', 'Apollo'], ['thalia', 'Thalia']];
const VOICE_INDEX = 'voice/samples.json';
let voiceBusy = false;
const sayable = t => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/^#{1,3}\s+/gm, '')
  .replace(/^\s*[-•]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/[ \t]+/g, ' ').trim();
function sampleText(g) {
  const l = g && g.lesson; if (!l || !l.body) return null;
  let out = sayable(l.title || ''); if (out && !/[.!?]$/.test(out)) out += '.';
  for (const para of sayable(l.body).split(/\n\s*\n/)) {
    const ss = para.replace(/\n/g, ' ').match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) || [para];
    for (const x of ss) { if ((out + ' ' + x).length > 560) return out.trim(); out = (out + ' ' + x).trim(); }
    if (out.length >= 380) break;
  }
  return out.trim() || null;
}
async function audioBytes(out) {
  if (!out) return null;
  if (out instanceof Uint8Array) return out;
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  if (typeof ReadableStream !== 'undefined' && out instanceof ReadableStream) return new Uint8Array(await new Response(out).arrayBuffer());
  if (typeof out.audio === 'string') { const x = atob(out.audio); const b = new Uint8Array(x.length); for (let i = 0; i < x.length; i++) b[i] = x.charCodeAt(i); return b; }
  if (out.body) return new Uint8Array(await new Response(out.body).arrayBuffer());
  return null;
}
async function voiceSamples(env, now) {
  if (!env.AI || voiceBusy) return;
  voiceBusy = true;
  const G = gh(env, 'Helper');
  try {
    const cur = await G.get(VOICE_INDEX);
    let old = null; if (!cur.missing) { try { old = JSON.parse(cur.text); } catch (e) {} }
    // made once; after a failure or an unfinished try, wait six hours before trying again
    if (old && Array.isArray(old.voices) && old.voices.length && !old.error) return;
    if (old && old.at && now - Date.parse(old.at) < 6 * 3600e3) return;
    const gf = await G.get('growth.json'); let g = null; if (!gf.missing) { try { g = JSON.parse(gf.text); } catch (e) {} }
    const text = sampleText(g); if (!text) return;
    let sha = await G.put(VOICE_INDEX, JSON.stringify({ format: 'opus-voice-samples', making: true, at: new Date(now).toISOString() }, null, 2) + '\n', cur.missing ? null : cur.sha, 'Helper: making natural voice samples');
    const voices = []; let error = null;
    for (const [id, name] of VOICE_SAMPLES) {
      try {
        const bytes = await audioBytes(await env.AI.run(VOICE_MODEL, { text, speaker: id, encoding: 'mp3' }));
        if (!bytes || bytes.length < 1000) throw new Error('no audio came back');
        const file = 'voice/sample-' + id + '.mp3';
        const ex = await G.get(file).catch(() => ({ missing: true }));
        await G.put(file, bytes, ex.missing ? null : ex.sha, 'Helper: voice sample ' + name);
        voices.push({ id, name, file, bytes: bytes.length });
      } catch (e) { error = String(e && e.message || e).slice(0, 200); break; }
    }
    await G.put(VOICE_INDEX, JSON.stringify({ format: 'opus-voice-samples', at: new Date().toISOString(), model: VOICE_MODEL, from: (g.lesson && g.lesson.date) || null, chars: text.length, text, voices, error }, null, 2) + '\n', sha, error ? 'Helper: voice samples stopped (' + error.slice(0, 60) + ')' : 'Helper: natural voice samples ready');
  } catch (e) {
  } finally { voiceBusy = false; }
}

let reported = null, reportedAt = 0;
const WARN_DAYS = [7, 1];
async function report(env, now) {
  now = now || Date.now();
  if (reported === VERSION && now - reportedAt < 3600e3) return;
  try {
    const G = gh(env), cur = await G.get('helper.json');
    let old = null; if (!cur.missing) { try { old = JSON.parse(cur.text); } catch (e) {} }
    const key = (await vapid(env)).pub;
    const ot = old && isObj(old.token) ? old.token : null;
    const expires = tokenExp === undefined ? (ot ? ot.expires || null : null) : tokenExp;
    let warned = ot && ot.expires === expires && Array.isArray(ot.warned) ? ot.warned.filter(d => WARN_DAYS.includes(d)) : [];
    const left = expires ? (Date.parse(expires) - now) / 864e5 : Infinity;
    const due = WARN_DAYS.filter(d => left <= d && left > 0 && !warned.includes(d));
    if (due.length) {
      try {
        const push = await readPush(G);
        if (push && (push.subs || []).length) {
          const day = new Date(expires).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: push.tz || 'America/New_York' });
          await fanOut(env, G, push, { title: 'The helper’s GitHub sign-in runs out ' + day, body: 'Make a new token and put it in Cloudflare, or Grok, Cassius and notifications stop. Steps in Settings › Sync.', tab: 'settings', tag: 'token:' + expires });
        }
      } catch (e) {}
      warned = [...new Set(warned.concat(due))].sort((x, y) => y - x);
    }
    const token = { expires, warned };
    const phone = { key: await phoneKey(env), url: ORIGIN || (old && isObj(old.phone) && old.phone.url) || null };
    const same = old && old.version === VERSION && old.push && old.push.key === key && ot && ot.expires === expires && JSON.stringify(ot.warned || []) === JSON.stringify(warned) && isObj(old.phone) && old.phone.key === phone.key && old.phone.url === phone.url;
    if (!same) await G.put('helper.json', JSON.stringify({ format: 'opus-helper', version: VERSION, since: old && old.version === VERSION && old.since ? old.since : new Date().toISOString(), push: { key }, phone, token }, null, 2) + '\n', cur.sha, old && old.version !== VERSION ? 'Helper: now ' + VERSION : !(old && isObj(old.phone) && old.phone.url === phone.url) ? 'Helper: the phone\'s food camera address' : 'Helper: token ' + (expires ? 'runs out ' + expires.slice(0, 10) : 'has no end date'));
    reported = VERSION; reportedAt = now;
  } catch (e) { /* try again next time */ }
}

/* ---------- WHOOP (since 1.13.0) ----------
   The owner's own WHOOP data, pulled with WHOOP's official API (free; needs a WHOOP membership).
   Two more secrets, set in Cloudflare and never in the repo: WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET, from the
   owner's app at developer.whoop.com. Its redirect URL is https://<worker>/whoop/callback.
   Connect once at https://<worker>/<ACCESS_KEY>/whoop. The sign-in is kept in opus-data as whoop-auth.json, sealed
   (AES-GCM) with a key made from WHOOP_CLIENT_SECRET, so nobody reading the repo can use it. The data Opus shows goes
   in whoop.json: one entry per day (recovery, sleep, strain, calories, workouts), the last 60 days. */
const WHOOP_AUTH = 'https://api.prod.whoop.com/oauth/oauth2/auth', WHOOP_TOKEN = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_SCOPES = 'offline read:recovery read:sleep read:cycles read:workout read:body_measurement';
const WHOOP_FILES = { data: 'whoop.json', auth: 'whoop-auth.json' };
const whoopApi = env => (env.WHOOP_API || 'https://api.prod.whoop.com/developer');
const whoopReady = env => !!(env.WHOOP_CLIENT_ID && env.WHOOP_CLIENT_SECRET);
async function sealKey(env) {
  const base = await crypto.subtle.importKey('raw', utf8(String(env.WHOOP_CLIENT_SECRET)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: utf8('opus-whoop'), info: utf8('whoop-auth.json') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(env, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(env), utf8(JSON.stringify(obj))); return { format: 'opus-whoop-auth', note: 'Sealed WHOOP sign-in for the Opus helper. Only the helper can open it. Delete this file to disconnect WHOOP.', iv: b64u(iv), data: b64u(new Uint8Array(ct)) }; }
async function unseal(env, f) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(f.iv) }, await sealKey(env), unb64u(f.data)); return JSON.parse(new TextDecoder().decode(pt)); }
/* WHOOP wants a state of exactly 8 characters: 4 random, 4 from an HMAC of them with the access key and the hour */
async function whoopState(env, r, hour) {
  const k = await crypto.subtle.importKey('raw', utf8(String(env.ACCESS_KEY)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return r + b64u(new Uint8Array(await crypto.subtle.sign('HMAC', k, utf8('whoop-state:' + r + ':' + hour)))).replace(/[-_]/g, 'x').slice(0, 4);
}
async function newState(env) { const a = crypto.getRandomValues(new Uint8Array(3)); const r = b64u(a).replace(/[-_]/g, 'x').slice(0, 4); return whoopState(env, r, Math.floor(Date.now() / 3600e3)); }
async function stateOk(env, s) { if (typeof s !== 'string' || s.length !== 8) return false; const h = Math.floor(Date.now() / 3600e3); for (const x of [h, h - 1]) if (same(await whoopState(env, s.slice(0, 4), x), s)) return true; return false; }
async function whoopTokenCall(env, form) {
  const r = await fetch(WHOOP_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(Object.assign({ client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET }, form)).toString() });
  if (!r.ok) { const e = new Error('WHOOP answered ' + r.status + ' to the sign-in' + (r.status === 400 || r.status === 401 ? ' (connect WHOOP again)' : '')); e.status = r.status; throw e; }
  const j = await r.json();
  if (!j.access_token) throw new Error('WHOOP sent no access token');
  return { access: j.access_token, refresh: j.refresh_token || null, expires: Date.now() + Math.max(60, Number(j.expires_in) || 3600) * 1000 - 120e3 };
}
async function saveAuth(G, env, tok, sha) {
  const body = JSON.stringify(await seal(env, tok), null, 2) + '\n';
  for (let i = 0; i < 3; i++) {
    try { return await G.put(WHOOP_FILES.auth, body, sha, 'Helper: WHOOP sign-in kept (sealed)'); }
    catch (e) { if (!e.conflict || i === 2) throw e; const cur = await G.get(WHOOP_FILES.auth); sha = cur.missing ? null : cur.sha; }
  }
}
/* a working access token: the kept one if it is still good, otherwise a refresh (WHOOP hands out a new refresh token each time) */
async function whoopAccess(env, G) {
  const cur = await G.get(WHOOP_FILES.auth);
  if (cur.missing) return null;
  let tok; try { tok = await unseal(env, JSON.parse(cur.text)); } catch (e) { throw new Error('The kept WHOOP sign-in could not be opened (was WHOOP_CLIENT_SECRET changed?). Connect WHOOP again.'); }
  if (tok.access && tok.expires > Date.now()) return tok.access;
  if (!tok.refresh) throw new Error('No WHOOP refresh token kept. Connect WHOOP again.');
  let n;
  try { n = await whoopTokenCall(env, { grant_type: 'refresh_token', refresh_token: tok.refresh, scope: 'offline' }); }
  catch (e) {
    // another pull (a webhook and the schedule at once) may have refreshed first: WHOOP then refuses the old token. Use theirs.
    await new Promise(r => setTimeout(r, 1500));
    const again = await G.get(WHOOP_FILES.auth);
    if (!again.missing && again.sha !== cur.sha) { try { const t2 = await unseal(env, JSON.parse(again.text)); if (t2.access && t2.expires > Date.now()) return t2.access; } catch (x) {} }
    throw e;
  }
  if (!n.refresh) n.refresh = tok.refresh;
  await saveAuth(G, env, n, cur.sha);
  return n.access;
}
async function whoopGet(env, access, path, q) {
  const out = []; let next = null;
  for (let page = 0; page < 6; page++) {
    const u = new URL(whoopApi(env) + path);
    for (const k of Object.keys(q || {})) u.searchParams.set(k, q[k]);
    u.searchParams.set('limit', '25'); if (next) u.searchParams.set('nextToken', next);
    const r = await fetch(u.toString(), { headers: { Authorization: 'Bearer ' + access } });
    if (r.status === 401) { const e = new Error('WHOOP did not accept the sign-in. Connect WHOOP again.'); e.status = 401; throw e; }
    if (r.status === 429) throw new Error('WHOOP asked the helper to slow down; it tries again later.');
    if (!r.ok) throw new Error('WHOOP answered ' + r.status + ' for ' + path);
    const j = await r.json();
    out.push(...(j.records || []));
    next = j.next_token || null; if (!next) break;
  }
  return out;
}
/* the owner's local date of a WHOOP time, using the offset WHOOP sends with it ("-05:00", "Z") */
function localDate(iso, off) {
  const t = Date.parse(iso); if (!isFinite(t)) return null;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(off || '')); const mins = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(t + mins * 60e3).toISOString().slice(0, 10);
}
const kcalOf = kj => num(kj) ? Math.round(kj / 4.184) : null;
const minOf = ms => num(ms) ? Math.round(ms / 60000) : null;
const r1 = x => num(x) ? Math.round(x * 10) / 10 : null;
/* WHOOP records into Opus's days. Sleep and recovery belong to the day you wake up; a cycle's strain and calories to the
   day of that recovery (or, without one, the day the cycle starts); a workout to the day it starts. */
function whoopDays(rec, slp, cyc, wo) {
  const days = {}; const day = k => (days[k] = days[k] || {});
  const sleepById = new Map(), dayByCycle = new Map();
  for (const s of slp) {
    if (s.nap) continue;
    const k = localDate(s.end || s.start, s.timezone_offset); if (!k) continue;
    sleepById.set(s.id, k);
    const sc = s.score || {}, st = sc.stage_summary || {}, need = sc.sleep_needed || {};
    const asleep = num(st.total_light_sleep_time_milli) ? (st.total_light_sleep_time_milli + (st.total_slow_wave_sleep_time_milli || 0) + (st.total_rem_sleep_time_milli || 0)) : null;
    const d = day(k);
    if (d.sleep && d.sleep.asleep != null && asleep != null && d.sleep.asleep > minOf(asleep)) continue; // keep the main sleep
    d.sleep = { start: s.start || null, end: s.end || null, scored: s.score_state === 'SCORED', inBed: minOf(st.total_in_bed_time_milli), asleep: minOf(asleep), deep: minOf(st.total_slow_wave_sleep_time_milli), rem: minOf(st.total_rem_sleep_time_milli), light: minOf(st.total_light_sleep_time_milli), awake: minOf(st.total_awake_time_milli), disturbances: num(st.disturbance_count) ? st.disturbance_count : null, performance: num(sc.sleep_performance_percentage) ? Math.round(sc.sleep_performance_percentage) : null, efficiency: num(sc.sleep_efficiency_percentage) ? Math.round(sc.sleep_efficiency_percentage) : null, consistency: num(sc.sleep_consistency_percentage) ? Math.round(sc.sleep_consistency_percentage) : null, need: num(need.baseline_milli) ? minOf((need.baseline_milli || 0) + (need.need_from_sleep_debt_milli || 0) + (need.need_from_recent_strain_milli || 0) + (need.need_from_recent_nap_milli || 0)) : null, respiratory: r1(sc.respiratory_rate) };
  }
  for (const r of rec) {
    const k = sleepById.get(r.sleep_id) || null; if (!k) continue;
    const sc = r.score || {}; const d = day(k);
    d.recovery = { scored: r.score_state === 'SCORED', calibrating: !!sc.user_calibrating, score: num(sc.recovery_score) ? Math.round(sc.recovery_score) : null, rhr: num(sc.resting_heart_rate) ? Math.round(sc.resting_heart_rate) : null, hrv: num(sc.hrv_rmssd_milli) ? Math.round(sc.hrv_rmssd_milli) : null, spo2: r1(sc.spo2_percentage), skinTemp: r1(sc.skin_temp_celsius) };
    if (r.cycle_id != null) dayByCycle.set(String(r.cycle_id), k);
  }
  for (const c of cyc) {
    const k = dayByCycle.get(String(c.id)) || localDate(c.start, c.timezone_offset); if (!k) continue;
    const sc = c.score || {};
    day(k).day = { scored: c.score_state === 'SCORED', open: !c.end, strain: r1(sc.strain), kcal: kcalOf(sc.kilojoule), avgHr: num(sc.average_heart_rate) ? sc.average_heart_rate : null, maxHr: num(sc.max_heart_rate) ? sc.max_heart_rate : null };
  }
  for (const w of wo) {
    const k = localDate(w.start, w.timezone_offset); if (!k) continue;
    const sc = w.score || {}, z = sc.zone_durations || {};
    const d = day(k); d.workouts = d.workouts || [];
    d.workouts.push({ id: w.id, sport: w.sport_name || null, start: w.start || null, end: w.end || null, minutes: w.start && w.end ? Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60000) : null, strain: r1(sc.strain), kcal: kcalOf(sc.kilojoule), avgHr: num(sc.average_heart_rate) ? sc.average_heart_rate : null, maxHr: num(sc.max_heart_rate) ? sc.max_heart_rate : null, zones: ['zero', 'one', 'two', 'three', 'four', 'five'].map(n => minOf(z['zone_' + n + '_milli'])) });
  }
  for (const k of Object.keys(days)) if (days[k].workouts) days[k].workouts.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return days;
}
let whoopLast = 0;
/* pull the last 10 days and fold them into whoop.json; keeps 60 days. Returns a short line for the status page. */
async function whoopPull(env, why) {
  const G = gh(env, 'Helper');
  const cur = await G.get(WHOOP_FILES.data);
  let old = null; if (!cur.missing) { try { old = JSON.parse(cur.text); } catch (e) {} }
  const base = old && old.format === 'opus-whoop' ? old : { format: 'opus-whoop', version: 1, days: {} };
  const out = Object.assign({}, base, { days: Object.assign({}, base.days || {}) });
  const now = new Date();
  try {
    const access = await whoopAccess(env, G);
    if (!access) { out.connected = false; out.problem = null; }
    else {
      const start = new Date(now.getTime() - 10 * 86400e3).toISOString();
      const q = { start };
      const [rec, slp, cyc, wo] = await Promise.all([whoopGet(env, access, '/v2/recovery', q), whoopGet(env, access, '/v2/activity/sleep', q), whoopGet(env, access, '/v2/cycle', q), whoopGet(env, access, '/v2/activity/workout', q)]);
      const fresh = whoopDays(rec, slp, cyc, wo);
      for (const k of Object.keys(fresh)) out.days[k] = fresh[k];
      // the body numbers WHOOP keeps (height, weight and the max heart rate it uses for zones); a miss here never stops the pull
      try {
        const r = await fetch(whoopApi(env) + '/v2/user/measurement/body', { headers: { Authorization: 'Bearer ' + access } });
        if (r.ok) { const b = await r.json(); out.body = { heightM: num(b.height_meter) ? Math.round(b.height_meter * 100) / 100 : null, weightKg: r1(b.weight_kilogram), maxHr: num(b.max_heart_rate) ? Math.round(b.max_heart_rate) : null }; }
      } catch (e) {}
      out.connected = true; out.problem = null; out.pulled = now.toISOString();
    }
  } catch (e) { out.problem = { at: now.toISOString(), text: String(e.message || e).slice(0, 200) }; if (e.status === 401) out.connected = false; }
  const keep = new Date(now.getTime() - 60 * 86400e3).toISOString().slice(0, 10);
  for (const k of Object.keys(out.days)) if (k < keep) delete out.days[k];
  const sorted = {}; for (const k of Object.keys(out.days).sort()) sorted[k] = out.days[k]; out.days = sorted;
  const cmp = o => JSON.stringify(Object.assign({}, o, { pulled: null, updated: null }));
  if (!old || cmp(old) !== cmp(out)) {
    out.updated = now.toISOString();
    const body = JSON.stringify(out, null, 1) + '\n';
    try { await G.put(WHOOP_FILES.data, body, cur.missing ? null : cur.sha, 'Helper: WHOOP ' + (why || 'update')); } catch (e) { if (!e.conflict) throw e; }
  }
  return out;
}
/* every 5 minutes Cloudflare asks; the helper pulls hourly from 4 AM to noon (the owner's time) and every 3 hours after */
function whoopDue(env, t) {
  let h = 0; try { h = Number(new Intl.DateTimeFormat('en-US', { timeZone: env.TIME_ZONE || 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(t))); } catch (e) {}
  const gap = h >= 4 && h < 12 ? 55 * 60e3 : 175 * 60e3;
  return t - whoopLast >= gap;
}
async function whoopScheduled(env, t) {
  if (!whoopReady(env) || !whoopDue(env, t)) return;
  whoopLast = t;
  try {
    const G = gh(env, 'Helper'); const cur = await G.get(WHOOP_FILES.data);
    // another copy of the helper may have pulled lately: go by the file, not just this copy's memory
    if (!cur.missing) { try { const j = JSON.parse(cur.text); if (j.pulled && t - Date.parse(j.pulled) < 50 * 60e3) return; } catch (e) {} }
    await whoopPull(env, 'morning and daily pull');
  } catch (e) { /* next time */ }
}
/* the phone asks for a fresh pull when Opus opens (same phone key as the food camera); at most one pull every 10 minutes */
async function whoopRefresh(request, env) {
  const H = { 'Access-Control-Allow-Origin': corsFor(request), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Opus-Key', 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store', Vary: 'Origin' };
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, H) });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  if (request.method !== 'POST') return J({ ok: false, code: 'bad', error: 'POST only' }, 405);
  if (!same(request.headers.get('X-Opus-Key') || '', await phoneKey(env))) return J({ ok: false, code: 'key', error: 'This phone\'s helper key is out of date. Sync Opus and try again.' }, 401);
  if (!whoopReady(env)) return J({ ok: false, code: 'off', error: 'WHOOP is not set up on the helper.' });
  const t = Date.now();
  try {
    const cur = await gh(env, 'Helper').get(WHOOP_FILES.data);
    if (!cur.missing) { try { const j = JSON.parse(cur.text); if (j.pulled && t - Date.parse(j.pulled) < 10 * 60e3) return J({ ok: true, fresh: false, pulled: j.pulled, updated: j.updated || null }); } catch (e) {} }
    if (t - whoopLast < 2 * 60e3) return J({ ok: true, fresh: false });
    whoopLast = t;
    const out = await whoopPull(env, 'pull when Opus opened');
    return J({ ok: !out.problem, fresh: true, pulled: out.pulled || null, updated: out.updated || null, connected: out.connected !== false, problem: out.problem ? out.problem.text : null });
  } catch (e) { return J({ ok: false, code: 'fail', error: String(e.message || e).slice(0, 200) }); }
}
/* WHOOP's notice that something changed (optional; set its Webhook URL to https://<worker>/whoop/webhook, model v2) */
async function whoopWebhook(request, env, ctx) {
  const raw = await request.text();
  const ts = request.headers.get('X-WHOOP-Signature-Timestamp') || '', sig = request.headers.get('X-WHOOP-Signature') || '';
  const k = await crypto.subtle.importKey('raw', utf8(String(env.WHOOP_CLIENT_SECRET)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, utf8(ts + raw)))));
  if (!ts || !same(want, sig) || Math.abs(Date.now() - Number(ts)) > 15 * 60e3) return new Response('Bad signature', { status: 401 });
  let ev = null; try { ev = JSON.parse(raw); } catch (e) {}
  if (ev && /^(recovery|sleep|workout)\./.test(String(ev.type || ''))) ctx.waitUntil(whoopPull(env, ev.type).catch(() => 0));
  return new Response(null, { status: 204 });
}
const page = (title, body) => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title><style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;background:#1b1714;color:#efe6da;margin:0;padding:28px max(20px,env(safe-area-inset-left))}main{max-width:34em;margin:auto}h1{font-weight:500;letter-spacing:.04em}a.b{display:inline-block;margin-top:14px;padding:12px 20px;border:1px solid #c99a62;border-radius:12px;color:#f2d3a0;text-decoration:none}code{background:#2a241f;padding:2px 6px;border-radius:6px;word-break:break-all}.m{color:#b7a99a}.cp{display:flex;gap:10px;align-items:center;background:#2a241f;border-radius:12px;padding:12px}.cp code{flex:1;min-width:0;padding:0}.cp button,button.b{font:inherit;background:none;border:1px solid #c99a62;border-radius:10px;color:#f2d3a0;padding:8px 14px}button.b{margin-top:14px;padding:12px 20px;border-radius:12px}.f label{display:block;margin-top:12px;color:#b7a99a}.f input{display:block;width:100%;box-sizing:border-box;margin-top:4px;font:inherit;background:#2a241f;color:#efe6da;border:1px solid #4a3f35;border-radius:10px;padding:10px}</style><main><h1>' + title + '</h1>' + body + '</main>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function whoopStart(url, env, request) {
  const cb = url.origin + '/whoop/callback';
  const fromCf = !!(env.WHOOP_CLIENT_ID && env.WHOOP_CLIENT_SECRET && !env.WHOOP_KEPT);
  if (request && request.method === 'POST') {
    const f = await request.formData();
    const id = String(f.get('id') || '').trim(), sec = String(f.get('secret') || '').trim();
    if (fromCf) return page('Connect WHOOP', '<p>The WHOOP app is set in Cloudflare, so it can\'t be changed here.</p>');
    if (!/^[\w.-]{8,200}$/.test(id) || !/^[\w.~+\/=-]{8,400}$/.test(sec)) return page('Connect WHOOP', '<p>That client id or secret doesn\'t look right. Copy both again from your app at developer.whoop.com.</p><p><a class="b" href="' + escH(url.pathname) + '">Back</a></p>');
    await saveKept(env, { whoopId: id, whoopSecret: sec }, 'WHOOP app details');
    return new Response(null, { status: 303, headers: { Location: url.pathname, 'Cache-Control': 'no-store' } });
  }
  const form = (lead) => lead + '<p>Its Redirect URL must be exactly:</p>' + copyBox(cb) + '<form method="post" class="f" autocomplete="off"><label>Client ID<input name="id" required spellcheck="false" autocapitalize="off"></label><label>Client Secret<input name="secret" type="password" required spellcheck="false" autocapitalize="off"></label><button class="b">Save</button></form><p class="m">The helper keeps them sealed in your private opus-data repo. Nothing goes into Cloudflare.</p>';
  if (!whoopReady(env)) return page('Connect WHOOP', form('<p>First, the details of your app at developer.whoop.com (Client ID and Client Secret, on the app\'s page).</p>'));
  if (url.searchParams.get('change') === '1' && !fromCf) return page('WHOOP app', form('<p>New details for your WHOOP app.</p>'));
  const G = gh(env, 'Helper'); const d = await G.get(WHOOP_FILES.data); let j = null; if (!d.missing) { try { j = JSON.parse(d.text); } catch (e) {} }
  const a = await G.get(WHOOP_FILES.auth);
  const st = await newState(env);
  const go = WHOOP_AUTH + '?' + new URLSearchParams({ response_type: 'code', client_id: env.WHOOP_CLIENT_ID, redirect_uri: cb, scope: WHOOP_SCOPES, state: st }).toString();
  const now = !a.missing ? '<p>WHOOP is connected.' + (j && j.pulled ? ' Last pulled ' + escH(j.pulled.replace('T', ' ').slice(0, 16)) + ' UTC.' : '') + '</p>' + (j && j.problem ? '<p class="m">Last problem: ' + escH(j.problem.text) + '</p>' : '') : '<p>WHOOP isn\'t connected yet.</p>';
  return page('Connect WHOOP', now + '<p>Sign in to WHOOP and allow Opus to read your recovery, sleep, strain, workouts and body measurements. Opus only reads.</p><a class="b" href="' + escH(go) + '">' + (a.missing ? 'Connect WHOOP' : 'Connect again') + '</a><p class="m">The button works for about an hour. To disconnect, delete whoop-auth.json in opus-data, or remove Opus in your WHOOP app settings.</p>' + (fromCf ? '' : '<p class="m"><a href="?change=1" style="color:inherit">Change the WHOOP app details</a></p>'));
}
async function whoopCallback(url, env) {
  if (!whoopReady(env)) return page('WHOOP', '<p>The helper doesn\'t know your WHOOP app yet. Open its Connect WHOOP page and save the client id and secret there.</p>');
  if (url.searchParams.get('error')) return page('WHOOP said no', '<p>' + escH(url.searchParams.get('error_description') || url.searchParams.get('error')) + '</p><p class="m">Nothing was saved. You can try again from the Connect WHOOP page.</p>');
  const code = url.searchParams.get('code'), st = url.searchParams.get('state');
  if (!code || !(await stateOk(env, st))) return page('Link expired', '<p>This sign-in link is too old or wasn\'t made by your helper. Open the Connect WHOOP page again and tap the button there.</p>');
  let tok;
  try { tok = await whoopTokenCall(env, { grant_type: 'authorization_code', code, redirect_uri: url.origin + '/whoop/callback' }); }
  catch (e) { return page('WHOOP sign-in failed', '<p>' + escH(e.message) + '</p><p class="m">Check that the Redirect URL in your WHOOP app is exactly <code>' + escH(url.origin + '/whoop/callback') + '</code> and that the client id and secret you saved match that app.</p>'); }
  if (!tok.refresh) return page('Almost', '<p>WHOOP didn\'t send a refresh token, so the helper couldn\'t keep the sign-in. In your WHOOP app, make sure the offline scope is allowed, then connect again.</p>');
  const G = gh(env, 'Helper'); const cur = await G.get(WHOOP_FILES.auth);
  await saveAuth(G, env, tok, cur.missing ? null : cur.sha);
  let j = null; try { j = await whoopPull(env, 'connected'); } catch (e) {}
  const n = j ? Object.keys(j.days || {}).length : 0;
  return page('WHOOP is connected', '<p>' + (j && j.problem ? 'Connected, but the first pull had a problem: ' + escH(j.problem.text) : n ? 'Pulled ' + n + ' day' + (n === 1 ? '' : 's') + ' of WHOOP data.' : 'Connected. Nothing to pull yet; data shows up once your WHOOP has scored a sleep.') + '</p><p class="m">The helper pulls each hour from 4 AM to noon and every three hours after. Open Opus and it shows up on Today.</p>');
}


/* ---------- keys the helper keeps itself (1.14.0) ----------
   keys.json in opus-data, sealed with a key made from ACCESS_KEY: { cassius, whoopId, whoopSecret }.
   It saves the owner a trip to Cloudflare for each new key. Secrets set in Cloudflare still come first. */
const KEYS_FILE = 'keys.json';
let keptCache = null; // { at, keys, sha, broken }
async function keysSealKey(env) {
  const base = await crypto.subtle.importKey('raw', utf8(String(env.ACCESS_KEY)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: utf8('opus-keys'), info: utf8(KEYS_FILE) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function readKept(env, fresh) {
  const now = Date.now();
  if (!fresh && keptCache && now - keptCache.at < (keptCache.keys.cassius || keptCache.keys.whoopId ? 300e3 : 30e3)) return keptCache;
  const cur = await gh(env, 'Helper').get(KEYS_FILE);
  let keys = {}, broken = false;
  if (!cur.missing) {
    try { const f = JSON.parse(cur.text); const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(f.iv) }, await keysSealKey(env), unb64u(f.data)); keys = JSON.parse(new TextDecoder().decode(pt)) || {}; }
    catch (e) { broken = true; }
  }
  keptCache = { at: now, keys, sha: cur.missing ? null : cur.sha, broken };
  return keptCache;
}
async function saveKept(env, change, why) {
  for (let i = 0; i < 3; i++) {
    const k = await readKept(env, true);
    const keys = Object.assign({}, k.broken ? {} : k.keys, change);
    for (const n of Object.keys(keys)) if (keys[n] == null || keys[n] === '') delete keys[n];
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keysSealKey(env), utf8(JSON.stringify(keys)));
    const body = JSON.stringify({ format: 'opus-helper-keys', note: 'Keys the Opus helper keeps for itself (Cassius’s address, the WHOOP app). Sealed: only the helper can open it. Nothing else reads this file.', iv: b64u(iv), data: b64u(new Uint8Array(ct)) }, null, 2) + '\n';
    try { await gh(env, 'Helper').put(KEYS_FILE, body, k.sha, 'Helper: ' + why); keptCache = { at: Date.now(), keys, sha: null, broken: false }; keptCache.at = 0; return keys; }
    catch (e) { if (!e.conflict || i === 2) throw e; }
  }
}
const validKey = (k, env) => k && String(k).length >= 24 && String(k) !== String(env.ACCESS_KEY) ? String(k) : null;
/* env with the kept keys filled in where Cloudflare has none */
async function withKept(env) {
  if (env.CASSIUS_KEY && env.WHOOP_CLIENT_ID && env.WHOOP_CLIENT_SECRET) return env;
  let k = { keys: {} }; try { k = await readKept(env); } catch (e) {}
  const E = Object.assign({}, env);
  if (!validKey(env.CASSIUS_KEY, env) && validKey(k.keys.cassius, env)) { E.CASSIUS_KEY = k.keys.cassius; E.CASSIUS_KEPT = true; }
  if (!(env.WHOOP_CLIENT_ID && env.WHOOP_CLIENT_SECRET) && k.keys.whoopId && k.keys.whoopSecret) { E.WHOOP_CLIENT_ID = k.keys.whoopId; E.WHOOP_CLIENT_SECRET = k.keys.whoopSecret; E.WHOOP_KEPT = true; }
  return E;
}
const copyBox = v => '<div class="cp"><code id="v">' + escH(v) + '</code><button type="button" onclick="(navigator.clipboard?navigator.clipboard.writeText(document.getElementById(\'v\').textContent).then(()=>{this.textContent=\'Copied\'},()=>{getSelection().selectAllChildren(document.getElementById(\'v\'))}):getSelection().selectAllChildren(document.getElementById(\'v\')))">Copy</button></div>';
async function cassiusPage(url, env, request) {
  let key = validKey(env.CASSIUS_KEY, env), made = false, kept = !!env.CASSIUS_KEPT;
  if (request.method === 'POST') {
    const f = await request.formData();
    if (f.get('do') !== 'new') return page('Cassius', '<p>Nothing changed.</p>');
    if (key && !kept) return page('Cassius', '<p>Cassius’s key is set in Cloudflare (CASSIUS_KEY), so it can’t be changed here. Delete that secret first.</p>');
    key = null;
  }
  if (!key) {
    const a = new Uint8Array(24); crypto.getRandomValues(a); key = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
    await saveKept(env, { cassius: key }, request.method === 'POST' ? 'new address for Cassius' : 'Cassius’s address');
    made = true;
  }
  const addr = url.origin + '/' + key + '/mcp';
  return page('Cassius’s address', (made ? '<p>Cassius’s address is ready. It works now, with nothing to add in Cloudflare.</p>' : '<p>This is Cassius’s address. It stays the same every time you open this page.</p>') +
    copyBox(addr) +
    '<p>In Claude: Settings › Connectors. Open the Opus (Cassius) connector and put this address in place of the old one (or remove it and add a custom connector with this address). Then allow it in the Cassius chat.</p>' +
    '<p class="m">Keep it private: anyone with it can act as Cassius.</p>' +
    (env.CASSIUS_KEY && !env.CASSIUS_KEPT && !made ? '' : '<form method="post" onsubmit="return confirm(\'Make a new address? The old one stops working.\')"><input type="hidden" name="do" value="new"><button class="b">Make a new address</button></form>'));
}

/* ---------- MCP over HTTP (stateless, JSON replies) ---------- */
async function handleRpc(msg, env, ctx, as) {
  as = as || GROK;
  const { id, method, params } = msg || {};
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return err(-32600, 'Invalid request');
  if (id === undefined) return null; // a notification: nothing to answer
  if (method === 'initialize') return ok({ protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'opus', version: VERSION }, instructions: as.key === 'cassius' ? 'You are Cassius, the owner\'s teacher, and this is your own address. Opus is the owner\'s phone app. Read GUIDE.md first (read_opus_file with file "guide" gives its short core); section 5, section "growth", is your Growth page. Save the Growth page with save_growth, sending only the parts you change. What the owner writes, keeps and reads there is in logs.json (read it with read_opus_file file "logs"). You can also change the plan with update_plan_section or save_plan, log things with add_to_outbox, leave notes for Claude, who builds the app, with leave_note, and add to the shared memory with update_memory. Everything you save is signed Cassius. You can never change logs.json.' : 'Opus is the owner\'s phone app. Read GUIDE.md first: read_opus_file with file "guide" gives its short core, then read the part for what you\'re doing with section ("money", "food", "training", "home", "health", "outbox"). Save a change to one part of the plan with update_plan_section (or the whole plan with save_plan) and things you log with add_to_outbox. The Growth page (growth.json) belongs to Cassius alone: read it if you like, but never try to change it. Leave anything about the app itself for Claude, who builds it, with leave_note, and read Claude\'s replies with read_opus_file file "desk". What you know about the owner goes in the shared memory with update_memory, so Claude knows it too (read it with read_opus_file file "memory"). You can never change logs.json.' });
  if (method === 'ping') return ok({});
  if (method === 'tools/list' || method === 'tools/call') { const p = report(env); if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p; }
  if (method === 'tools/list') return ok({ tools: toolsFor(as) });
  if (method === 'tools/call') {
    try {
      let r;
      for (let i = 0; i < 2; i++) { try { r = await callTool(params && params.name, params && params.arguments, env, as); break; } catch (e) { if (!e.conflict || i === 1) throw e; } }
      const tn = params && params.name, a = (params && params.arguments) || {};
      if (r && !r.isError && ['save_plan', 'update_plan_section', 'add_to_outbox', 'save_growth'].includes(tn) && !/^Nothing saved/.test(((r.content || [])[0] || {}).text || '')) {
        const who = as.name;
        const change = String(a.change || (tn === 'save_growth' ? 'Updated your Growth page' : tn === 'add_to_outbox' ? 'Logged something for you' : 'Updated your plan')).replace(/\s+/g, ' ').slice(0, 140);
        const tab = tn === 'save_growth' ? 'growth' : tn === 'update_plan_section' ? (SECTION_TAB[String(a.section || '').split('.')[0]] || 'today') : 'today';
        const p = notifyChange(env, who, change, tab); if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
      }
      return ok(r);
    } catch (e) { return ok(text(String(e.message || e), true)); }
  }
  if (method === 'resources/list') return ok({ resources: [] });
  if (method === 'prompts/list') return ok({ prompts: [] });
  return err(-32601, 'Method not found');
}
function same(a, b) { a = String(a || ''); b = String(b || ''); if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

export default {
  // Cloudflare runs this every five minutes (see wrangler.jsonc): a new version reports in without waiting for Grok,
  // and notifications that fell due go out
  async scheduled(event, env, ctx) {
    if (!env.GITHUB_TOKEN || !env.ACCESS_KEY) return;
    const E = await withKept(env);
    ctx.waitUntil(report(env, event.scheduledTime || Date.now()));
    ctx.waitUntil(sendDue(env, event.scheduledTime || Date.now()).catch(() => 0));
    ctx.waitUntil(whoopScheduled(E, event.scheduledTime || Date.now()).catch(() => 0));
    ctx.waitUntil(voiceSamples(env, event.scheduledTime || Date.now()).catch(() => 0));
    ctx.waitUntil(visionCheck(env).catch(() => 0));
  },
  async fetch(request, env0, ctx) {
    let env = env0;
    const url = new URL(request.url);
    if (ORIGIN !== url.origin) { ORIGIN = url.origin; reported = null; }
    const parts = url.pathname.split('/').filter(Boolean);
    const notFound = () => new Response('Not found', { status: 404 });
    // the phone's food camera: a photo or a typed meal in, what's in it out (see foodRoute)
    if (parts.length === 1 && parts[0] === 'food' && env.ACCESS_KEY && env.GITHUB_TOKEN) return foodRoute(request, env);
    if (!env.ACCESS_KEY || String(env.ACCESS_KEY).length < 24 || !env.GITHUB_TOKEN) {
      // made fresh on every visit and never stored: copy it into the ACCESS_KEY secret
      const a = new Uint8Array(24); crypto.getRandomValues(a); const key = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
      return new Response('Opus helper is almost set up.\n\n' + (env.GITHUB_TOKEN ? '' : '- Add the secret GITHUB_TOKEN.\n') + (env.ACCESS_KEY && String(env.ACCESS_KEY).length >= 24 ? '' : '- Add the secret ACCESS_KEY. Here is a new random one you can use:\n\n' + key + '\n') + '\nThen deploy again and reload this page.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    // the keys the helper keeps itself fill in what Cloudflare doesn't have (Cassius, the WHOOP app)
    env = await withKept(env0);
    // who is calling: Grok's address (ACCESS_KEY) or Cassius's own (CASSIUS_KEY or the kept key, 24+ characters and not the same key)
    const ck = validKey(env.CASSIUS_KEY, env);
    const as = parts.length && same(parts[0], env.ACCESS_KEY) ? GROK : parts.length && ck && same(parts[0], ck) ? CASSIUS : null;
    const plain = (t, st) => new Response(t, { status: st || 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    // WHOOP: the redirect and webhook live at fixed addresses (WHOOP needs them exact); connecting needs the access key
    if (parts[0] === 'whoop' && parts.length === 2) {
      if (parts[1] === 'callback' && request.method === 'GET') return whoopCallback(url, env);
      if (parts[1] === 'webhook' && request.method === 'POST' && whoopReady(env)) return whoopWebhook(request, env, ctx);
      if (parts[1] === 'refresh' && (request.method === 'POST' || request.method === 'OPTIONS')) return whoopRefresh(request, env);
      return notFound();
    }
    if (as === GROK && parts[1] === 'whoop' && parts.length === 2 && (request.method === 'GET' || request.method === 'POST')) return whoopStart(url, env, request);
    // Cassius's address: made and kept on the first visit, the same one after that
    if (as === GROK && parts[1] === 'cassius' && parts.length === 2 && (request.method === 'GET' || request.method === 'POST')) return cassiusPage(url, env, request);
    if (!as || parts.length > 2 || (parts[1] && parts[1] !== 'mcp')) return notFound();
    if (request.method === 'GET' && /event-stream/.test(request.headers.get('Accept') || '')) return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    if (request.method === 'GET') return new Response('Opus helper ' + VERSION + ' is running. ' + (as === CASSIUS ? 'This is Cassius\'s own address. Add it to Claude as a custom connector:' : 'Add this address to Grok as a custom connector:') + '\n\n' + url.origin + '/' + parts[0] + '/mcp', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (request.method === 'DELETE') return new Response(null, { status: 204 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    let body; try { body = await request.json(); } catch (e) { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(m => handleRpc(m, env, ctx, as)))).filter(Boolean);
      return out.length ? Response.json(out) : new Response(null, { status: 202 });
    }
    const r = await handleRpc(body, env, ctx, as);
    return r ? Response.json(r) : new Response(null, { status: 202 });
  }
};
