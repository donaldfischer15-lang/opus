/*
  Opus helper for Grok: a tiny MCP server that runs free on Cloudflare Workers.
  It lets Grok read the owner's private opus-data repo and save these files there:
    - plan.json  (checked with the same rules Opus uses before it is saved)
    - grok.json  (Grok's outbox: free cash, money weeks, balances, weigh-ins, workouts, food eaten, blood tests, pet care, supplements)
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
const VERSION = '1.18.0';
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
const MICROS = ['fiber', 'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'vitA', 'vitC', 'vitD', 'b12', 'folate'];
const microsErr = m => { if (m == null) return null; if (!isObj(m)) return 'micros must be an object like { "fiber": 3.1, "potassium": 422 }'; for (const k of Object.keys(m)) { if (k === 'estimate' || k === 'note') continue; if (!MICROS.includes(k)) return 'micros.' + k + ' is not one Opus tracks (' + MICROS.join(', ') + ')'; if (m[k] != null && !(num(m[k]) && m[k] >= 0)) return 'micros.' + k + ' must be a number or null'; } return null; };
const dateErr = (o, k) => isDate(o[k]) ? null : k + ' must be a date like "2026-11-27" (got ' + JSON.stringify(o[k]) + ')';
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
  ['remember', 'id', e => (typeof e.id === 'string' && e.id ? null : 'id must be a text id like "grok-2026-11-27-dentist"') || (typeof e.text === 'string' && e.text.trim() ? null : 'text must be what to remember, like "Dentist" or "Sam\'s birthday"') || (e.text.length <= 500 ? null : 'text must be 500 characters or fewer') || (e.date == null || isDate(e.date) ? null : 'date must be a date like "2026-11-27" or left out (for a yearly date, the first one; a birth date when born is true)') || (e.time == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time) ? null : 'time must be 24-hour like "15:00" or left out') || (e.time && !e.date ? 'a time needs a date' : null) || (e.yearly && !e.date ? 'yearly needs a date' : null) || ['yearly', 'born', 'pinned'].map(k => e[k] == null || typeof e[k] === 'boolean' ? null : k + ' must be true or false').find(Boolean) || (e.tag == null || typeof e.tag === 'string' ? null : 'tag must be text')]
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
  { name: 'add_to_outbox', description: 'Add or correct entries for Opus, in the grok.json format from GUIDE.md section 4. The sections are ' + OUT_PATHS.join(', ') + ': free cash (cash on hand and what is held back before payday, from the accounts; money moving between the owner\'s own accounts goes in transfers, never in spending), money weeks, debt balance snapshots, weigh-ins, workouts, food the owner ate that is not a planned meal (eaten), blood test results copied from the lab report (labs), pet care done, pet weigh-ins and vet visits (pets), supplements taken (supps), and things for the owner\'s Memory: notes, plans on a date and yearly dates like birthdays (remember). Anything else is refused by name. Send only the new or corrected entries; entries already in grok.json are kept. Same key again corrects an entry; { key, "delete": true } takes one back. Opus copies them into the logs the next time the owner opens it.',
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
    const same = old && old.version === VERSION && old.push && old.push.key === key && ot && ot.expires === expires && JSON.stringify(ot.warned || []) === JSON.stringify(warned);
    if (!same) await G.put('helper.json', JSON.stringify({ format: 'opus-helper', version: VERSION, since: old && old.version === VERSION && old.since ? old.since : new Date().toISOString(), push: { key }, token }, null, 2) + '\n', cur.sha, old && old.version !== VERSION ? 'Helper: now ' + VERSION : 'Helper: token ' + (expires ? 'runs out ' + expires.slice(0, 10) : 'has no end date'));
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
  },
  async fetch(request, env0, ctx) {
    let env = env0;
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const notFound = () => new Response('Not found', { status: 404 });
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
