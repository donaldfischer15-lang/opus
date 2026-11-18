/*
  Opus helper for Grok: a tiny MCP server that runs free on Cloudflare Workers.
  It lets Grok read Donald's opus-data repo and save two files there:
    - plan.json  (checked with the same rules Opus uses before it is saved)
    - grok.json  (Grok's outbox: money weeks, weigh-ins, balances, workouts)
  It never writes logs.json or anything else.

  Two secrets, set in Cloudflare (Settings > Variables and Secrets), never in this file:
    GITHUB_TOKEN  a fine-grained GitHub token: only opus-data, Contents read and write
    ACCESS_KEY    a long random string; the helper only answers at https://<worker>/<ACCESS_KEY>/mcp
  One plain variable:
    REPO          donaldfischer15-lang/opus-data   (default below)
*/
const DEFAULT_REPO = 'donaldfischer15-lang/opus-data';
const VERSION = '1.0.0';
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
  const f = p.food || {}, meals = f.meals || {};
  ((f.rotation || {}).weeks || []).forEach((w, i) => {
    for (const [slot, id] of Object.entries(w)) if (slot !== 'name' && !meals[id]) errors.push('food rotation week ' + (i + 1) + ' (' + slot + ') points to meal "' + id + '", which is not in food.meals.');
  });
  for (const [id, m] of Object.entries(meals)) {
    if (!m.name) errors.push('meal "' + id + '" needs a "name".');
    (m.ingredients || []).forEach(g => { if (!g.item) errors.push('meal "' + id + '" has an ingredient without "item".'); });
    if (m.macros) for (const k of ['kcal', 'protein', 'carbs', 'fat']) { const v = m.macros[k]; if (v != null && !(Number(v) >= 0)) errors.push('meal "' + id + '": macros.' + k + ' should be a number (or null).'); }
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
const OUT = [
  ['weights', w => w.date, w => isDate(w.date) && num(w.lb)],
  ['money.weeks', w => w.weekEnding, w => isDate(w.weekEnding) && (w.paycheck == null || num(w.paycheck)) && ['spent', 'bills', 'debtPayments', 'balances'].every(k => w[k] == null || (Array.isArray(w[k]) && w[k].every(x => isObj(x) && num(x.amount))))],
  ['money.balances', w => w.date, w => isDate(w.date) && isObj(w.debts)],
  ['workouts', w => w.id, w => typeof w.id === 'string' && isDate(w.date) && Array.isArray(w.sets)]
];
const getp = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function setp(o, p, v) { const ks = p.split('.'); let a = o; for (const k of ks.slice(0, -1)) { if (!isObj(a[k])) a[k] = {}; a = a[k]; } a[ks[ks.length - 1]] = v; }
function mergeOutbox(cur, add) {
  const out = isObj(cur) && cur.format === 'opus-grok' ? cur : { format: 'opus-grok', version: 1 };
  const report = { added: 0, replaced: 0, bad: [] };
  let any = false;
  for (const [p, key, ok] of OUT) {
    const items = getp(add, p); if (items == null) continue;
    if (!Array.isArray(items)) { report.bad.push(p + ' must be a list'); continue; }
    const list = Array.isArray(getp(out, p)) ? getp(out, p) : []; setp(out, p, list);
    for (const x of items) {
      const k = isObj(x) ? key(x) : null;
      if (k == null) { report.bad.push(p + ': an entry has no ' + (p === 'workouts' ? 'id' : p === 'money.weeks' ? 'weekEnding' : 'date')); continue; }
      if (!(x.delete === true) && !ok(x)) { report.bad.push(p + ' ' + k + ': missing or wrong fields (see GUIDE.md section 4)'); continue; }
      const i = list.findIndex(y => isObj(y) && key(y) === k);
      if (i >= 0) { list[i] = x; report.replaced++; } else { list.push(x); report.added++; }
      any = true;
    }
  }
  out.updated = new Date().toISOString().slice(0, 10);
  return { out, report, any };
}

/* ---------- tools ---------- */
const FILES = { plan: 'plan.json', logs: 'logs.json', guide: 'GUIDE.md', outbox: 'grok.json' };
const TOOLS = [
  { name: 'read_opus_file', description: 'Read one file from the owner\'s Opus repo. "guide" is GUIDE.md (read it first: it explains every file and the rules). "plan" is plan.json, the plan you may change. "logs" is logs.json, what the owner logged on the phone (read only). "outbox" is grok.json, entries you added that Opus copies into the logs.',
    inputSchema: { type: 'object', properties: { file: { type: 'string', enum: ['guide', 'plan', 'logs', 'outbox'] } }, required: ['file'] } },
  { name: 'save_plan', description: 'Save the whole updated plan.json. Read the plan first and send it back complete, with your change made: "format": "opus-plan", "version": 1, every id kept, "updated" set to today. Change only what the owner asked for. Never invent numbers; use null when unknown. Opus checks the plan the same way the app does and refuses a broken one.',
    inputSchema: { type: 'object', properties: { plan: { type: 'object', description: 'The complete plan object.' }, change: { type: 'string', description: 'One short line saying what changed, for the history.' } }, required: ['plan', 'change'] } },
  { name: 'add_to_outbox', description: 'Add or correct entries the owner asked you to log: money weeks, weigh-ins, debt balance snapshots or workouts, in the grok.json format from GUIDE.md section 4. Send only the new or corrected entries; entries already in grok.json are kept. Same key again corrects an entry; { key, "delete": true } takes one back. Opus copies them into the logs the next time the owner opens it.',
    inputSchema: { type: 'object', properties: { entries: { type: 'object', description: 'Like { "money": { "weeks": [...], "balances": [...] }, "weights": [...], "workouts": [...] }' }, change: { type: 'string' } }, required: ['entries', 'change'] } }
];
function text(t, isError) { return { content: [{ type: 'text', text: t }], isError: !!isError }; }
function parseMaybe(x) { if (typeof x === 'string') { let s = x.trim(); const f = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) s = f[1]; return JSON.parse(s); } return x; }

async function callTool(name, args, env) {
  const G = gh(env);
  args = args || {};
  if (name === 'read_opus_file') {
    const f = FILES[args.file]; if (!f) return text('file must be guide, plan, logs or outbox.', true);
    const r = await G.get(f);
    if (r.missing) return text(f + ' does not exist yet.' + (args.file === 'outbox' ? ' Use add_to_outbox to start it.' : ''));
    return text(r.text);
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
    if (!any) return text('Nothing saved.' + (report.bad.length ? ' Problems:\n- ' + report.bad.join('\n- ') : ' No entries found.'), true);
    const change = String(args.change || 'outbox').replace(/\s+/g, ' ').slice(0, 100);
    await G.put(FILES.outbox, JSON.stringify(out, null, 2) + '\n', cur.sha, 'Grok: ' + change);
    return text('Saved to grok.json: ' + report.added + ' new, ' + report.replaced + ' corrected.' + (report.bad.length ? ' Skipped:\n- ' + report.bad.join('\n- ') : '') + ' Opus copies them in the next time the owner opens it.');
  }
  return text('Unknown tool ' + name, true);
}

/* ---------- MCP over HTTP (stateless, JSON replies) ---------- */
async function handleRpc(msg, env) {
  const { id, method, params } = msg || {};
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return err(-32600, 'Invalid request');
  if (id === undefined) return null; // a notification: nothing to answer
  if (method === 'initialize') return ok({ protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'opus', version: VERSION }, instructions: 'Opus is the owner\'s phone app. Read GUIDE.md first (read_opus_file with file "guide"). Save plan changes with save_plan and things you log with add_to_outbox. You can never change logs.json.' });
  if (method === 'ping') return ok({});
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
  async fetch(request, env) {
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
      const out = (await Promise.all(body.map(m => handleRpc(m, env)))).filter(Boolean);
      return out.length ? Response.json(out) : new Response(null, { status: 202 });
    }
    const r = await handleRpc(body, env);
    return r ? Response.json(r) : new Response(null, { status: 202 });
  }
};
