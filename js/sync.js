/* Opus sync: keeps the plan and the logs in the owner's private GitHub repo, so Grok or Claude can change the plan
   and read the logs, and the phone picks it up every time Opus opens.

   Files in the repo (all at the top level):
     plan.json   the plan ("opus-plan"). Grok and the app both edit it. On a clash, the GitHub copy wins.
     logs.json   the logs ("opus-logs"). Only the app writes it. Grok reads it.
     grok.json   Grok's outbox ("opus-grok"): new or corrected entries such as a money week. Only Grok writes it.
     GUIDE.md    the guide for AI helpers, written by the app.

   Safety rules this file keeps:
     - A log only leaves when it was removed on this phone (or a workout deleted on another phone). A sync never
       removes logs because another copy lacks them, and stops if a push would drop logs from GitHub.
     - A plan from GitHub is checked before it is used. A broken one is never used or overwritten.
     - The token lives only in this phone's storage (opus.sync). It is never in a backup, the repo or the site. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store;
  const CKEY = 'opus.sync', BKEY = 'opus.syncbase';
  const API = 'https://api.github.com';
  const F = { plan: 'plan.json', logs: 'logs.json', grok: 'grok.json', guide: 'GUIDE.md', growth: 'growth.json', helper: 'helper.json' };
  const HELPER = '1.10.0'; // the Grok helper version this Opus expects (grok-helper/worker.src.js VERSION)
  const vnum = v => String(v || '0').split('.').map(n => parseInt(n, 10) || 0).reduce((a, n) => a * 1000 + n, 0);

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  let cfg = ls.get(CKEY);   // { owner, repo, token, lastSync, problems: [], undoPlan, guideVer, grokNote }
  let base = ls.get(BKEY);  // { plan, logs, sha: { plan, logs, grok } }  what GitHub held after the last sync
  const saveCfg = () => ls.set(CKEY, cfg);
  const saveBase = () => ls.set(BKEY, base);
  const S = { status: cfg && cfg.token ? 'idle' : 'off', busy: null, again: false, waiting: false, blocked: null, listeners: [] };

  /* ---------- small helpers ---------- */
  const isObj = x => x != null && typeof x === 'object' && !Array.isArray(x);
  function eq(a, b) {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false; return true; }
    const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!eq(a[k], b[k])) return false;
    return true;
  }
  const getp = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  function setp(o, p, v) { const ks = p.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = x[k] = isObj(x[k]) ? x[k] : {}; x[ks[ks.length - 1]] = v; }
  function toB64(s) { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); }
  function fromB64(s) { const bin = atob(String(s).replace(/\s/g, '')); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return new TextDecoder().decode(b); }
  function parseJSON(text) { let t = String(text || '').trim(); const f = t.match(/^```(?:json)?\s*([\s\S]*?)```$/); if (f) t = f[1]; return JSON.parse(t); }
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const num = v => typeof v === 'number' && isFinite(v);

  /* ---------- the logs as one file ---------- */
  const KEYED = [
    ['workouts', w => w.id],
    ['weights', w => w.date],
    ['money.weeks', w => w.weekEnding],
    ['money.balances', w => w.date],
    ['money.cash', c => c.date],
    ['reviews', r => r.weekOf],
    ['writing', w => (w.kind ? w.date + ':' + w.kind : w.date)],
    ['reading', r => r.id],
    ['kept', k => k.date],
    ['eaten', e => e.id],
    ['labs', l => l.date],
    ['pets', e => e.id],
    ['supps', e => e.id],
    ['ledger', e => e.date]
  ];
  const TOMBS = ['workouts', 'eaten', 'labs', 'pets', 'supps', 'ledger']; // lists where a removal on purpose is remembered, so a sync doesn't bring it back
  const tombsOf = d => { const o = {}; for (const t of TOMBS) o[t] = ((d && d.deleted) || {})[t] || {}; return o; };
  /* removed on purpose, unless it was written again after that (an entry with a newer "at") */
  const buried = (tomb, k, x) => !!(tomb && tomb[k]) && !(x && x.at && String(x.at) > String(tomb[k]));
  const SETS = ['checks', 'groceries', 'prep'];
  function logsOf(d) {
    const o = { format: 'opus-logs', version: 1 };
    for (const k of SETS) o[k] = d[k] || {};
    o.money = {};
    for (const [p] of KEYED) setp(o, p, getp(d, p) || []);
    o.deleted = tombsOf(d);
    o.prefs = prefsOf(d);
    return o;
  }
  /* choices made in Opus that aren't part of the plan, so Grok can see them too (the phone's copy wins) */
  function prefsOf(d) {
    const s = d.settings || {};
    return { restSeconds: s.rest || {}, tabs: s.tabs || [], hiddenTabs: s.hidden || [], sound: s.sound !== false };
  }
  function logsSame(a, b) { if (!a || !b) return false; const x = Object.assign({}, a), y = Object.assign({}, b); for (const k of ['updated', 'app', 'sync']) { delete x[k]; delete y[k]; } return eq(x, y); }
  function validLogs(o) { return isObj(o) && o.format === 'opus-logs' && Array.isArray(o.workouts) && isObj(o.checks); }

  /* sets (checks per day): keep everything here, add what is new there, drop only what was unticked here */
  function mergeSetMap(b, l, r) {
    b = b || {}; l = l || {}; r = r || {};
    const out = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const B = new Set(b[k] || []), res = (l[k] || []).slice();
      for (const x of r[k] || []) if (!res.includes(x) && !B.has(x)) res.push(x);
      if (res.length) out[k] = res;
    }
    return out;
  }
  /* keyed lists: same rule. Both changed the same entry: this phone wins. */
  function mergeKeyed(b, l, r, key, tomb) {
    const mb = new Map((b || []).map(x => [key(x), x])), ml = new Map(), out = [];
    for (const x of l || []) { const k = key(x); if (k == null) { out.push(x); continue; } if (buried(tomb, k, x)) continue; ml.set(k, x); out.push(x); }
    for (const R of r || []) {
      const k = key(R); if (k == null || buried(tomb, k, R)) continue;
      const L = ml.get(k), B = mb.get(k);
      if (L) { if (!eq(L, R) && eq(B, L)) out[out.indexOf(L)] = R; continue; }
      if (B && eq(B, R)) continue; // removed on this phone, unchanged there: stays removed
      out.push(R);
    }
    return out;
  }
  function mergeLogs(B, L, R) {
    const o = { format: 'opus-logs', version: 1, money: {} };
    o.deleted = {};
    for (const t of TOMBS) { // both sides' removals; the later time wins
      const a = tombsOf(R)[t], b = tombsOf(L)[t], m = Object.assign({}, a);
      for (const [k, v] of Object.entries(b)) if (!m[k] || String(v) > String(m[k])) m[k] = v;
      o.deleted[t] = m;
    }
    for (const k of SETS) o[k] = mergeSetMap(B && B[k], L[k], R && R[k]);
    for (const [p, key] of KEYED) setp(o, p, mergeKeyed(B && getp(B, p), getp(L, p), R && getp(R, p), key, TOMBS.includes(p) ? o.deleted[p] : null));
    o.prefs = (L && L.prefs) || (R && R.prefs) || {};
    return o;
  }
  /* logs that GitHub has and the merge would drop (other than workouts deleted on purpose) */
  function droppedFrom(R, M) {
    if (!R) return 0;
    let n = 0;
    for (const [p, key] of KEYED) {
      const keep = new Set((getp(M, p) || []).map(key)), tomb = TOMBS.includes(p) ? tombsOf(M)[p] : {};
      for (const x of getp(R, p) || []) { const k = key(x); if (k != null && !keep.has(k) && !buried(tomb, k, x)) n++; }
    }
    return n;
  }

  /* ---------- the plan: three-way, by key, GitHub wins a clash ---------- */
  function listKey(arr) {
    if (!Array.isArray(arr) || !arr.length || !arr.every(isObj)) return null;
    for (const k of ['id', 'name']) { const ks = arr.map(x => x[k]); if (ks.every(v => typeof v === 'string' && v) && new Set(ks).size === ks.length) return k; }
    return null;
  }
  function merge3(B, L, R) {
    if (eq(L, R)) return L;
    if (eq(B, L)) return R;
    if (eq(B, R)) return L;
    if (isObj(L) && isObj(R)) {
      const out = {}, b = isObj(B) ? B : {};
      for (const k of new Set([...Object.keys(L), ...Object.keys(R)])) { const v = merge3(b[k], L[k], R[k]); if (v !== undefined) out[k] = v; }
      return out;
    }
    const kl = listKey(L), kr = listKey(R);
    if (kl && kl === kr) {
      const bm = new Map((Array.isArray(B) ? B : []).filter(isObj).map(x => [x[kl], x])), lm = new Map(L.map(x => [x[kl], x]));
      const out = [];
      for (const r of R) { const v = merge3(bm.get(r[kl]), lm.get(r[kl]), r); if (v !== undefined) out.push(v); }
      for (const l of L) if (!R.some(r => r[kl] === l[kl]) && !bm.has(l[kl])) out.push(l); // added here
      return out;
    }
    return R;
  }

  /* ---------- Grok's outbox ---------- */
  const GROK = [
    ['weights', w => w.date, w => isDate(w.date) && num(w.lb)],
    ['money.weeks', w => w.weekEnding, w => isDate(w.weekEnding) && (w.paycheck == null || num(w.paycheck)) && ['spent', 'bills', 'debtPayments', 'balances'].every(k => w[k] == null || (Array.isArray(w[k]) && w[k].every(x => isObj(x) && num(x.amount))))],
    ['money.balances', w => w.date, w => isDate(w.date) && isObj(w.debts)],
    ['money.cash', c => c.date, c => isDate(c.date) && (num(c.cash) || num(c.free)) && (c.held == null || (Array.isArray(c.held) && c.held.every(x => isObj(x) && num(x.amount)))) && (c.accounts == null || (Array.isArray(c.accounts) && c.accounts.every(x => isObj(x) && num(x.amount))))],
    ['workouts', w => w.id, w => typeof w.id === 'string' && isDate(w.date) && Array.isArray(w.sets)],
    ['eaten', e => e.id, e => typeof e.id === 'string' && isDate(e.date) && typeof e.name === 'string' && !!e.name.trim() && (e.amount == null || num(e.amount)) && (e.macros == null || (isObj(e.macros) && ['kcal', 'protein', 'carbs', 'fat'].every(k => e.macros[k] == null || num(e.macros[k])))) && (e.micros == null || (isObj(e.micros) && Object.keys(e.micros).every(k => k === 'estimate' || e.micros[k] == null || num(e.micros[k]))))],
    ['labs', l => l.date, l => isDate(l.date) && Array.isArray(l.markers) && l.markers.length > 0 && l.markers.every(m => isObj(m) && typeof m.name === 'string' && !!m.name.trim() && num(m.value) && (m.low == null || num(m.low)) && (m.high == null || num(m.high)))],
    ['pets', e => e.id, e => typeof e.id === 'string' && !!e.id && isDate(e.date) && typeof e.pet === 'string' && !!e.pet && typeof e.care === 'string' && !!e.care && (e.lb == null || num(e.lb)) && (e.note == null || typeof e.note === 'string')],
    ['supps', e => e.id, e => typeof e.id === 'string' && isDate(e.date) && typeof e.supp === 'string' && !!e.supp && e.id === e.date + ':' + e.supp]
  ];
  /* a money week from Grok does what a pasted one does: fills in debt balances and keeps a balance snapshot */
  function moneyWeekSideEffects(d, w) {
    for (const k of ['spent', 'bills', 'debtPayments', 'balances', 'notes']) if (w[k] == null) w[k] = [];
    const ds = ((d.plan || {}).money || {}).debts || [];
    let any = false;
    for (const b of w.balances) { const x = ds.find(y => String(y.name).toLowerCase() === String(b.name).toLowerCase()); if (x) { x.balance = b.amount; any = true; } }
    if (!any) return;
    const own = (d.money.balances || []).find(s => s.date === w.weekEnding && s.by !== 'grok');
    if (own) return;
    const debts = {}; for (const x of ds) if (x.balance != null) debts[x.name] = x.balance;
    d.money.balances = (d.money.balances || []).filter(s => s.date !== w.weekEnding).concat([{ date: w.weekEnding, debts, by: 'grok' }]);
  }
  function applyGrok(d, g) {
    const r = { added: 0, changed: 0, removed: 0, kept: [], bad: [] };
    for (const [p, key, ok] of GROK) {
      const list = getp(d, p) || []; setp(d, p, list);
      for (const x of getp(g, p) || []) {
        const k = isObj(x) ? key(x) : null;
        if (!isObj(x) || k == null) { r.bad.push(p + ': an entry has no ' + (p === 'workouts' || p === 'eaten' ? 'id' : 'date')); continue; }
        const i = list.findIndex(y => key(y) === k);
        if (x.delete === true) { if (i >= 0 && list[i].by === 'grok') { list.splice(i, 1); r.removed++; if (TOMBS.includes(p)) { d.deleted = d.deleted || {}; (d.deleted[p] = d.deleted[p] || {})[k] = new Date().toISOString(); } } continue; }
        if (!ok(x)) { r.bad.push(p + ' ' + k + ': missing or wrong fields'); continue; }
        const it = Object.assign({}, x, { by: 'grok' });
        if ((p === 'labs' || p === 'pets' || p === 'supps') && !it.at) it.at = i >= 0 && list[i].at ? list[i].at : new Date().toISOString();
        if (p === 'eaten') { if (it.item == null) it.extra = true; if (!it.at) it.at = i >= 0 && list[i].at ? list[i].at : new Date().toISOString(); if (it.macros && it.macros.estimate == null) it.macros = Object.assign({ estimate: true }, it.macros); }
        if (p === 'money.cash') { // cash on hand: the newest reading wins, whoever made it
          if (!it.at) it.at = i < 0 ? new Date().toISOString() : list[i].by === 'grok' ? list[i].at : ''; // no time from Grok: never beats a reading you made
          if (i < 0) { list.push(it); r.added++; }
          else if (String(it.at) >= String(list[i].at || '')) { if (!eq(list[i], it)) { list[i] = it; r.changed++; } }
          else if (list[i].by !== 'grok') r.kept.push('cash on hand ' + k);
          continue;
        }
        if (i < 0) {
          list.push(it);
          if (p === 'money.weeks') moneyWeekSideEffects(d, it);
          r.added++;
        } else if (list[i].by === 'grok') { if (!eq(list[i], it)) { list[i] = it; if (p === 'money.weeks') moneyWeekSideEffects(d, it); r.changed++; } }
        else r.kept.push(p === 'weights' ? 'weigh-in ' + k : p === 'money.weeks' ? 'money week ' + k : p + ' ' + k);
      }
    }
    return r;
  }

  /* ---------- GitHub ---------- */
  class SyncError extends Error { constructor(kind, msg) { super(msg); this.kind = kind; } }
  async function gh(method, path, body, accept) {
    let r;
    try {
      r = await fetch(API + '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) + path, {
        method, cache: 'no-store',
        headers: Object.assign({ Authorization: 'Bearer ' + cfg.token, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) { throw new SyncError('offline', 'No connection'); }
    if (r.status === 401) throw new SyncError('auth', 'GitHub didn’t accept the token. It may have expired. Make a new one and paste it in Settings › Sync.');
    if (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0') throw new SyncError('later', 'GitHub asked Opus to wait a little. It tries again on its own.');
    return r;
  }
  async function getFile(name) {
    const r = await gh('GET', '/contents/' + name);
    if (r.status === 404) return { missing: true };
    if (r.status === 403) throw new SyncError('access', 'The token can’t read ' + cfg.repo + '. Give it access to that repo with Contents set to Read and write.');
    if (!r.ok) throw new SyncError('later', 'GitHub answered ' + r.status + ' for ' + name + '.');
    const j = await r.json();
    let text;
    if (j.encoding === 'base64' && j.content != null) text = fromB64(j.content);
    else { const r2 = await gh('GET', '/contents/' + name, null, 'application/vnd.github.raw+json'); text = await r2.text(); }
    return { sha: j.sha, text };
  }
  /* who last changed a file in GitHub, from the start of its commit message ("Grok: ...", "Cassius: ...") */
  async function lastAuthor(name) {
    try {
      const r = await gh('GET', '/commits?path=' + encodeURIComponent(name) + '&per_page=5');
      if (!r.ok) return 'Grok';
      const c = (await r.json()).map(x => String((x.commit || {}).message || '')).find(m => !/^Opus\b/.test(m));
      const m = c && /^(Grok|Cassius|Claude)\b/i.exec(c);
      return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : 'Grok';
    } catch (e) { return 'Grok'; }
  }
  async function putFile(name, text, sha, message) {
    const r = await gh('PUT', '/contents/' + name, Object.assign({ message, content: toB64(text) }, sha ? { sha } : {}));
    if (r.status === 409 || r.status === 422) throw new SyncError('conflict', 'changed while saving');
    if (r.status === 403 || r.status === 404) throw new SyncError('access', 'The token can’t write to ' + cfg.repo + '. Set its Contents permission to Read and write.');
    if (!r.ok) throw new SyncError('later', 'GitHub answered ' + r.status + ' when saving ' + name + '.');
    const j = await r.json();
    return j.content && j.content.sha;
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

  /* ---------- status ---------- */
  function setStatus(st, msg) {
    S.status = st; S.msg = msg || '';
    S.listeners.forEach(fn => { try { fn(); } catch (e) {} });
  }
  function problem(code, text) { cfg.problems = (cfg.problems || []).filter(p => p.code !== code); if (text) cfg.problems.push({ code, text }); saveCfg(); }
  function line() {
    if (!cfg || !cfg.token) return '';
    const t = cfg.lastSync ? U.fmtTimeAP(U.pad(new Date(cfg.lastSync).getHours()) + ':' + U.pad(new Date(cfg.lastSync).getMinutes())) : null;
    const today = cfg.lastSync && U.key(new Date(cfg.lastSync)) === U.key();
    const when = t ? (today ? t : U.fmtDateShort(new Date(cfg.lastSync)) + ', ' + t) : '';
    switch (S.status) {
      case 'syncing': return 'Syncing…';
      case 'offline': return 'Offline · saved on this phone, syncs when you’re back online';
      case 'pending': return 'Saved on this phone · syncing soon';
      case 'blocked': return 'Sync paused · open Settings › Sync';
      case 'problem': return 'Sync needs a look · Settings › Sync';
      default: return (cfg.problems || []).length ? 'Synced ' + when + ' · one thing to look at in Settings' : (cfg.helper && vnum(cfg.helper.version) < vnum(HELPER)) ? 'Synced ' + when + ' · Grok helper is behind, see Settings' : (when ? 'Synced ' + when : 'Sync on');
    }
  }

  /* ---------- the sync ---------- */
  let applying = false;
  function apply(plan, logs) {
    applying = true;
    const d = Store.data;
    if (plan) d.plan = plan;
    if (logs) { for (const k of SETS) d[k] = logs[k]; for (const [p] of KEYED) setp(d, p, getp(logs, p)); d.deleted = logs.deleted; }
    Store.save(true);
    applying = false;
    try { Opus.renderBar(); Opus.refresh(); } catch (e) {}
  }

  async function run(opts) {
    opts = opts || {};
    const local = Store.data;
    const [rp, rl, rg, rgw, rh] = await Promise.all([getFile(F.plan), getFile(F.logs), getFile(F.grok), getFile(F.growth), getFile(F.helper).catch(() => ({ missing: true }))]);
    const notes = [];

    // which helper is live (it writes helper.json when it starts a new version)
    if (rh.missing) cfg.helper = null;
    else { let hj = null; try { hj = parseJSON(rh.text); } catch (e) {} if (hj && hj.version) cfg.helper = { version: String(hj.version), since: hj.since || null, push: hj.push && typeof hj.push.key === 'string' ? hj.push.key : null }; }

    // Cassius's growth page (read only: only Cassius writes growth.json)
    if (!rgw.missing) {
      let g = null;
      try { g = parseJSON(rgw.text); } catch (e) { problem('growth', 'growth.json is not valid JSON, so the Growth page kept what it had. Ask Cassius to fix it.'); }
      if (g) {
        if (g.format !== 'opus-growth') problem('growth', 'growth.json should have "format": "opus-growth", so the Growth page kept what it had.');
        else {
          problem('growth', null);
          if (!eq(g, local.growth)) {
            if (local.growth && Opus.changes) Opus.changes.fromSync({ growthBefore: local.growth, growthAfter: g });
            local.growth = g; applying = true; Store.save(true); applying = false;
            S.refreshLater = true;
          }
        }
      }
    }

    // plan
    let R = null, planBroken = null;
    if (!rp.missing) {
      try { R = parseJSON(rp.text); } catch (e) { planBroken = 'plan.json is not valid JSON (' + e.message + ').'; }
      if (R) { const v = Plan.validate(R); if (!v.ok) { planBroken = 'plan.json has a problem: ' + v.errors[0]; R = null; } }
    }
    problem('plan', planBroken ? planBroken + ' Opus kept the plan it had and will not overwrite plan.json until it is fixed. Ask Grok to fix it.' : null);
    const L = local.plan;
    let mPlan = L, planFromGitHub = false;
    if (R && !planBroken) {
      if (!base || !base.plan) {
        if (opts.first === 'github' || (L.name || '') === 'Example plan') mPlan = R;
        else if (opts.first === 'phone') mPlan = L;
        else if (!eq(L, R)) return { choose: { name: R.name, updated: R.updated } };
      } else {
        mPlan = merge3(base.plan, L, R);
        if (!Plan.validate(mPlan).ok) mPlan = R;
      }
      planFromGitHub = !eq(mPlan, L) && !(base && eq(base.plan, R));
    }

    // Grok's outbox (only when the file changed)
    let work = local, grokReport = null, grokFile = null;
    const grokSha = rg.missing ? null : rg.sha;
    if (!rg.missing && grokSha !== ((base || {}).sha || {}).grok) {
      let g = null;
      try { g = parseJSON(rg.text); } catch (e) { problem('grok', 'grok.json is not valid JSON, so nothing from it was added. Ask Grok to fix it.'); }
      if (g) {
        if (g.format !== 'opus-grok') problem('grok', 'grok.json should have "format": "opus-grok", so nothing from it was added.');
        else {
          grokFile = g;
          work = U.clone(local); work.plan = U.clone(mPlan);
          grokReport = applyGrok(work, g);
          if (!Plan.validate(work.plan).ok) work.plan = U.clone(mPlan);
          mPlan = work.plan;
          problem('grok', grokReport.bad.length ? 'Some entries in grok.json were skipped: ' + grokReport.bad.slice(0, 3).join('; ') + '.' : null);
          const n = grokReport.added + grokReport.changed;
          cfg.grokNote = (n || grokReport.removed || grokReport.kept.length) ? { at: new Date().toISOString(), added: grokReport.added, changed: grokReport.changed, removed: grokReport.removed, kept: grokReport.kept.slice(0, 5) } : cfg.grokNote;
          if (n) notes.push('Grok added ' + n + ' entr' + (n === 1 ? 'y' : 'ies'));
        }
      }
    }

    // logs
    let RL = null, logsBroken = false;
    if (!rl.missing) { try { RL = parseJSON(rl.text); } catch (e) { RL = null; } if (!validLogs(RL)) { RL = null; logsBroken = true; } }
    const LL = logsOf(work);
    const BL = base && base.logs;
    const mLogs = mergeLogs(BL, LL, RL);
    const drop = droppedFrom(RL, mLogs);
    if (drop && !opts.allowDrop) { S.blocked = { count: drop }; return { blocked: drop }; }
    S.blocked = null;

    // anything to change on this phone?
    const planChanged = !eq(mPlan, local.plan), logsChanged = !logsSame(mLogs, logsOf(local));
    if ((planChanged || logsChanged) && Opus.ui.topSheet() && !opts.now) return { wait: true };
    if (planFromGitHub) { cfg.undoPlan = { plan: U.clone(local.plan), at: new Date().toISOString(), name: local.plan.name }; notes.unshift('Plan updated from GitHub'); }
    if ((planChanged || logsChanged) && base && Opus.changes) {
      const planBy = planChanged ? await lastAuthor(F.plan) : null;
      Opus.changes.fromSync({ planBefore: planChanged ? local.plan : null, planAfter: planChanged ? mPlan : null, planBy, logsBefore: logsChanged ? logsOf(local) : null, logsAfter: logsChanged ? mLogs : null });
    }
    if (planChanged || logsChanged) apply(planChanged ? U.clone(mPlan) : null, logsChanged ? mLogs : null);

    // push
    const sha = { plan: rp.sha || null, logs: rl.sha || null, grok: grokSha };
    let basePlan = R || (base && base.plan) || null;
    if (!planBroken && !eq(mPlan, R)) {
      sha.plan = await putFile(F.plan, JSON.stringify(mPlan, null, 2) + '\n', rp.sha, 'Opus: plan from phone ' + stamp());
      basePlan = U.clone(mPlan);
    }
    // logs.json "sync": when this phone last synced and what it took from grok.json, so Grok can check (written at least once a day)
    const lastSeen = RL && isObj(RL.sync) ? RL.sync : null;
    const outbox = grokReport ? { updated: grokFile.updated || null, sha: grokSha, added: grokReport.added, changed: grokReport.changed, removed: grokReport.removed, kept: grokReport.kept.slice(0, 10), skipped: grokReport.bad.slice(0, 10) } : (lastSeen && lastSeen.outbox) || null;
    const stale = !lastSeen || !lastSeen.at || U.key(new Date(lastSeen.at)) !== U.key();
    if (!logsSame(mLogs, RL) || grokReport || stale) {
      const out = Object.assign({}, mLogs, { updated: new Date().toISOString(), app: 'Opus ' + Opus.VERSION, sync: { at: new Date().toISOString(), app: Opus.VERSION, outbox } });
      sha.logs = await putFile(F.logs, JSON.stringify(out, null, 1) + '\n', rl.sha, logsBroken ? 'Opus: logs.json rebuilt from phone' : 'Opus: logs from phone ' + stamp());
      if (logsBroken) notes.push('logs.json was damaged in GitHub, so Opus rebuilt it from this phone');
    }
    base = { plan: basePlan, logs: U.clone(mLogs), sha };
    saveBase();

    // the guide, once per app version
    if (cfg.guideVer !== Opus.VERSION) {
      try {
        const gr = await fetch('GUIDE.md', { cache: 'no-store' });
        if (gr.ok) { const text = await gr.text(); const cur = await getFile(F.guide); if (cur.missing || cur.text !== text) await putFile(F.guide, text, cur.sha, 'Opus: guide for ' + Opus.VERSION); cfg.guideVer = Opus.VERSION; }
      } catch (e) { if (e.kind === 'conflict' || e.kind === 'offline') throw e; }
    }
    // a full backup into backups/ once a month, so a bad sync can't wipe history
    const month = U.key().slice(0, 7);
    if (cfg.backupMonth !== month) {
      try {
        const name = 'backups/opus-backup-' + month + '.json', cur = await getFile(name);
        if (cur.missing) await putFile(name, Store.exportJSON() + '\n', null, 'Opus: monthly backup ' + month);
        cfg.backupMonth = month;
      } catch (e) { if (e.kind === 'offline') throw e; }
    }
    // the notification schedule for the helper (only when notifications are on, and only when it changed)
    if (Opus.notify) { try { await Opus.notify.afterSync(getFile, putFile); } catch (e) { if (e.kind === 'offline' || e.kind === 'conflict') throw e; } }
    // the desk (notes between Grok, Cassius and Claude), read only
    if (Opus.desk) { try { await Opus.desk.afterSync(getFile); } catch (e) { if (e.kind === 'offline') throw e; } }
    if (Opus.desk) { try { await Opus.desk.memorySync(getFile); } catch (e) { if (e.kind === 'offline') throw e; } }
    cfg.lastSync = new Date().toISOString();
    problem('sync', null);
    saveCfg();
    return { ok: true, notes };
  }

  function sync(opts) {
    opts = opts || {};
    if (!cfg || !cfg.token) return Promise.resolve({ off: true });
    if (S.busy) { S.again = true; return S.busy; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus('offline'); return Promise.resolve({ offline: true }); }
    setStatus('syncing');
    S.busy = (async () => {
      let res, tries = 0;
      for (;;) {
        try { res = await run(opts); break; }
        catch (e) {
          if (e.kind === 'conflict' && tries++ < 2) continue;
          res = { error: e };
          break;
        }
      }
      S.busy = null;
      if (res.error) {
        const e = res.error;
        if (e.kind === 'offline') setStatus('offline');
        else if (e.kind === 'later' || e.kind === 'conflict') setStatus(dirty() ? 'pending' : 'idle', e.message);
        else { problem('sync', e.message); setStatus('problem', e.message); }
      } else if (res.blocked) setStatus('blocked');
      else if (res.wait) { S.waiting = true; setStatus(dirty() ? 'pending' : 'idle'); }
      else if (res.choose) setStatus('idle');
      else { S.waiting = false; setStatus((cfg.problems || []).length ? 'problem' : 'idle'); if (res.notes && res.notes.length && !opts.quiet) try { Opus.ui.toast(res.notes.join(' · '), cfg.undoPlan && res.notes[0] === 'Plan updated from GitHub' ? { label: 'Undo', run: undoPlan } : null); } catch (e) {} }
      if (S.again) { S.again = false; setTimeout(() => sync({ quiet: opts.quiet }), 50); }
      return res;
    })();
    return S.busy;
  }
  function dirty() { return !!(cfg && cfg.token && base && (!eq(Store.data.plan, base.plan) || !logsSame(logsOf(Store.data), base.logs))); }

  /* ---------- triggers: open, back online, changes ---------- */
  let pushT = null, lastPull = 0;
  function onSaved() {
    if (applying || !cfg || !cfg.token) return;
    clearTimeout(pushT);
    pushT = setTimeout(() => { if (dirty()) { setStatus(navigator.onLine === false ? 'offline' : 'pending'); sync({ quiet: true }); } }, 6000);
  }
  const origSave = Store.save.bind(Store);
  Store.save = function (now) { origSave(now); onSaved(); };
  // a restore or an erase replaces what is on the phone: the next sync adds, it never takes away
  const origImport = Store.applyImport.bind(Store), origReset = Store.reset.bind(Store);
  Store.applyImport = function (d) { if (base) { base.logs = null; base.plan = null; saveBase(); } return origImport(d); };
  Store.reset = function () { disconnect(); return origReset(); };

  function pull() { if (!cfg || !cfg.token || Date.now() - lastPull < 15000) return; lastPull = Date.now(); sync({ quiet: false }); }
  Opus.onBoot(() => {
    pull();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
    window.addEventListener('online', () => { if (cfg && cfg.token) sync({ quiet: true }); });
    window.addEventListener('offline', () => { if (cfg && cfg.token) setStatus('offline'); });
    // a sync that waited for an open sheet runs once the sheet closes
    setInterval(() => {
      if (S.waiting && !Opus.ui.topSheet() && !S.busy) { S.waiting = false; sync({ quiet: false }); }
      if (S.refreshLater && !Opus.ui.topSheet()) { S.refreshLater = false; try { Opus.renderBar(); Opus.refresh(); } catch (e) {} }
    }, 3000);
  });

  /* ---------- connect, disconnect, undo ---------- */
  async function check(owner, repo, token) {
    const keep = cfg; cfg = { owner, repo, token };
    try {
      let r;
      try { r = await fetch(API + '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo), { cache: 'no-store', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }); }
      catch (e) { return { error: 'Opus couldn’t reach GitHub. Check your connection and try again.' }; }
      if (r.status === 401) return { error: 'GitHub didn’t accept that token. Copy it again from GitHub, or make a new one.' };
      if (r.status === 404 || r.status === 403) return { error: 'Opus can’t see ' + owner + '/' + repo + '. Check the spelling, and that the token was given access to that repo.' };
      if (!r.ok) return { error: 'GitHub answered ' + r.status + '. Try again in a minute.' };
      const j = await r.json();
      if (j.private === false) return { error: owner + '/' + repo + ' is public, so anyone could read your plan and logs. Make it private first (in the repo: Settings › General › Danger Zone › Change visibility).' };
      return { ok: true };
    } finally { cfg = keep; }
  }
  async function connect(owner, repo, token, first) {
    cfg = { owner: owner.trim(), repo: repo.trim(), token: token.trim(), problems: [] };
    base = null; saveBase(); saveCfg();
    const res = await sync({ first, now: true });
    return res;
  }
  function disconnect() { cfg = null; base = null; ls.set(CKEY, null); ls.set(BKEY, null); setStatus('off'); }
  function undoPlan() {
    if (!cfg || !cfg.undoPlan) return;
    Store.data.plan = cfg.undoPlan.plan; cfg.undoPlan = null; saveCfg();
    Store.save(true); try { Opus.renderBar(); Opus.refresh(); } catch (e) {}
    Opus.ui.toast('Plan put back');
  }
  function resolveBlocked(keepAll) {
    if (keepAll) { if (base) { base.logs = null; saveBase(); } return sync({ now: true }); }
    return sync({ now: true, allowDrop: true });
  }

  function grokPrompt() {
    return [
      'You help me run Opus, my phone app for food, training, money and home. You reach it through the "opus" connector, which saves to my private opus-data repo. Opus reads that every time I open the app.',
      '',
      'First call read_opus_file with "guide". It explains every file. The short version:',
      '- "plan" is my plan: schedule, routine, meals with macros, training, money (pay, bills, debts in payoff order), home jobs and my pets, and the supplements I take (health.supplements). Change one part at a time with update_plan_section (for example section "money.debts"), keep every id, and change only what I ask for or what clearly needs it.',
      '- Long files come in parts; ask for the next part, or read one section (like "money") at a time. The "sync" section of my logs says when Opus last synced and what it took from your outbox.',
      '- "logs" is everything I enter in Opus: workouts, weigh-ins, meals eaten, blood tests, supplements taken, pet care, checklists, money weeks, cash on hand, writing, reviews and my settings. Read it before you ask me anything; if it is in my logs, I already told you. You can never change it.',
      '- add_to_outbox is how you log things for me: a money week, a weigh-in, a debt balance, my cash on hand, food I ate that is not a planned meal, a supplement I took, pet care I did (a flea pill, a bath, a weigh-in, a vet visit), or a blood test (every marker with its value, unit and the lab’s range as printed). With blood tests, never diagnose or suggest treatment; if a result is outside the lab’s range, just say so and that it is worth raising with my doctor.',
      '- Meals have parts (4 eggs, 1 banana) with macros for each. When I change a meal, change its parts, serving, macros, ingredients and prep together with update_plan_section section "food".',
      '- Keep Opus current without being asked: whenever something comes up in any chat that belongs in Opus (a bill, a debt, a payday, a meal change, a weight, food I ate), save it right away, then tell me in one line what you saved. Don’t save guesses; ask me for the one missing detail.',
      '- When I say "Sync Opus", follow "Keeping Opus current" in the guide: check what Opus picked up, save my cash and money week, fill the blanks you can, apply changes I asked for, then tell me what you saved and what only I can answer.',
      '- Free cash is the top of my Money tab: cash I can use now that isn’t needed for bills or anything else before payday. Whenever you look at my accounts, add a "money.cash" entry with today’s date, the time, my cash, and every amount that has to come out before payday (with due dates), as GUIDE.md section 4 shows.',
      '- Never invent numbers. Leave out anything you don’t know.',
      '- After each change, tell me in one line what you saved.',
      '',
      'To start: read the guide, my plan and my logs. Then update my cash on hand if you can see my accounts, and tell me which numbers in my plan are still blank.'
    ].join('\n');
  }

  function steps() {
    return [
      ['Make a free GitHub account', 'On your phone, go to github.com/signup. Use your email, make a password, pick a username, and confirm the code GitHub emails you.'],
      ['Make a private repo for your data', 'Go to github.com/new. Name it opus-data. Choose Private. Tick “Add a README file”. Tap Create repository.'],
      ['Make a key for Opus', 'Go to github.com/settings/personal-access-tokens/new. Name: Opus phone. Expiration: the longest it offers. Repository access: Only select repositories, then pick opus-data. Under Permissions, find Contents and set it to Read and write. Tap Generate token, then copy the token. GitHub shows it only once.'],
      ['Connect Opus', 'In Opus: gear › Sync with GitHub. Type your GitHub username, keep opus-data, paste the token, and tap Connect. Opus puts your plan, your logs and the guide into the repo.'],
      ['Connect Grok', 'In Grok, open its GitHub connector and give it access to opus-data. Then, in Opus, tap Copy Grok setup prompt and paste it to Grok once.']
    ];
  }

  Opus.sync = {
    status: () => S.status, line, cfg: () => cfg, on: fn => S.listeners.push(fn), sync, connect, check, disconnect, undoPlan, resolveBlocked,
    blocked: () => S.blocked, grokPrompt, steps, dirty,
    helper: () => { const h = cfg && cfg.helper; return { want: HELPER, have: h ? h.version : null, since: h ? h.since : null, behind: !!(h && vnum(h.version) < vnum(HELPER)) }; },
    // exposed for tests
    _: { merge3, mergeLogs, mergeSetMap, mergeKeyed, applyGrok, logsOf, droppedFrom, toB64, fromB64, eq }
  };
})();
