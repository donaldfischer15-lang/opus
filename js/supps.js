/* Supplements: what you take (plan.health.supplements), ticked on Today, kept in logs `supps`
   so Grok can see them. One row per part of the day, however many you take then. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;

  const health = () => (Plan.p.health = Plan.p.health || {});
  const list = () => { const hl = health(); return (hl.supplements = Array.isArray(hl.supplements) ? hl.supplements : []); };
  const log = () => (Store.data.supps = Store.data.supps || []);
  const iso = () => new Date().toISOString();
  const PART = s => s.part || 'morning';

  function bury(id) { const dl = Store.data.deleted = Store.data.deleted || {}; (dl.supps = dl.supps || {})[id] = iso(); }
  function taken(d, sid) { const k = U.key(d); return log().some(e => e.date === k && e.supp === sid); }
  function take(d, sid, on) {
    const k = U.key(d), id = k + ':' + sid, L = log(), i = L.findIndex(e => e.id === id);
    if (on && i < 0) { L.push({ id, date: k, supp: sid, at: iso() }); const dl = (Store.data.deleted || {}).supps; if (dl) delete dl[id]; }
    if (!on && i >= 0) { L.splice(i, 1); bury(id); }
  }
  function dueOn(d) { const dk = U.dayKey(d), isW = Plan.isWorkday(d); return list().filter(s => s.active !== false && U.matchDays(s.days, dk, isW)); }
  function label(s) { return s.name + (s.dose ? ' (' + s.dose + ')' : ''); }

  /* what one dose adds to the vitamins and minerals on Food. `nutrients` on the supplement ({ magnesium: 200 }, in the
     units Food uses) wins; otherwise Opus reads it from the dose when the name and unit leave no doubt
     (“Vitamin D3, 5,000 IU” → 125 µg vitamin D). Anything else is named as not counted, never guessed. */
  const NUTS = [['vitD', /vitamin\s*d\b|\bd3\b|cholecalciferol/i, 'µg', 'vitamin D'], ['vitK', /vitamin\s*k\b|\bk2\b|menaquinone|phylloquinone/i, 'µg', 'vitamin K'],
    ['b12', /\bb-?12\b|cobalamin/i, 'µg', 'vitamin B12'], ['folate', /folate|folic/i, 'µg', 'folate'], ['vitC', /vitamin\s*c\b|ascorbic/i, 'mg', 'vitamin C'],
    ['vitA', /vitamin\s*a\b|retinol/i, 'µg', 'vitamin A'], ['magnesium', /magnesium/i, 'mg', 'magnesium'], ['zinc', /\bzinc\b/i, 'mg', 'zinc'],
    ['iron', /\biron\b|ferrous/i, 'mg', 'iron'], ['calcium', /calcium/i, 'mg', 'calcium'], ['potassium', /potassium/i, 'mg', 'potassium'], ['fiber', /fiber|fibre|psyllium/i, 'g', 'fiber']];
  const NUTK = {}; NUTS.forEach(n => { NUTK[n[0]] = n; });
  const MULTI = /multi-?vitamin|\bmulti\b|prenatal|b-?complex/i;
  function nutrientKey(s) { if (MULTI.test(s.name || '')) return null; const n = NUTS.find(x => x[1].test(s.name || '')); return n ? n[0] : null; }
  function fromDose(key, dose) {
    const m = /(\d[\d,]*(?:\.\d+)?)\s*(mcg|µg|ug|mg|g|iu)\b/i.exec(String(dose || '')); if (!m) return null;
    const v = Number(m[1].replace(/,/g, '')), u = m[2].toLowerCase(), want = NUTK[key][2];
    if (!(v >= 0)) return null;
    if (u === 'iu') return key === 'vitD' ? v / 40 : null; // vitamin A's IU depends on the form, so it isn't converted
    const toMg = { g: 1000, mg: 1, mcg: .001, 'µg': .001, ug: .001 }[u];
    return want === 'mg' ? v * toMg : want === 'µg' ? v * toMg * 1000 : v * toMg / 1000;
  }
  function nutrientsOf(s) {
    if (s.nutrients && typeof s.nutrients === 'object') {
      const a = {}; let any = false; for (const k in s.nutrients) if (s.nutrients[k] != null && Number(s.nutrients[k]) >= 0) { a[k] = Number(s.nutrients[k]); any = true; }
      if (any) return { amounts: a, why: 'set' };
    }
    const key = nutrientKey(s); if (!key) return { amounts: null, why: 'notnut' };
    const v = fromDose(key, s.dose); if (v == null) return { amounts: null, why: 'nodose', key };
    return { amounts: { [key]: Math.round(v * 100) / 100 }, why: 'dose', key };
  }
  const nfmt = (v, k) => { const u = (NUTK[k] || [0, 0, ''])[2], r = v >= 100 ? Math.round(v) : Math.round(v * 100) / 100; return r.toLocaleString('en-US') + ' ' + u + ' ' + ((NUTK[k] || [])[3] || k); };
  function nutrientText(s) { const r = nutrientsOf(s); return r.amounts ? Object.keys(r.amounts).map(k => nfmt(r.amounts[k], k)).join(', ') + ' a dose' : ''; }

  /* how long the supply lasts: supply { left, asOf, perDose } counts down by what you log after asOf */
  function supply(s, today) {
    const sp = s.supply; if (!sp || sp.left == null) return null;
    today = today || new Date();
    const per = Number(sp.perDose) || 1;
    const used = log().filter(e => e.supp === s.id && e.date > sp.asOf).length * per;
    const left = Math.max(0, Number(sp.left) - used);
    let perWeek = 0; for (let i = 0; i < 7; i++) { const d = U.addDays(today, i); if (U.matchDays(s.days, U.dayKey(d), Plan.isWorkday(d))) perWeek++; }
    const days = perWeek ? Math.floor(left / (per * perWeek / 7)) : null;
    return { left, days, low: days != null && days <= 10 };
  }
  function lowLine(s) { const sp = supply(s); return sp && sp.low ? (sp.days <= 0 ? 'out' : 'about ' + sp.days + (sp.days === 1 ? ' day' : ' days') + ' left') : ''; }

  /* ---------- Today ---------- */
  Plan.mods.push({
    prefix: 'supp',
    items(d) {
      const by = {};
      for (const s of dueOn(d)) (by[PART(s)] = by[PART(s)] || []).push(s);
      return Object.keys(by).map(part => {
        const ss = by[part], n = ss.filter(s => taken(d, s.id)).length;
        const times = ss.map(s => s.time).filter(Boolean).sort();
        const low = ss.map(s => { const l = lowLine(s); return l ? s.name + ': ' + l : ''; }).filter(Boolean);
        const food = ss.some(s => s.withFood) ? 'with food' : '';
        const detail = ss.length === 1
          ? [ss[0].dose, food, ss[0].note, low[0]].filter(Boolean).join(' · ')
          : [(n && n < ss.length ? n + ' of ' + ss.length + ' taken' : ss.map(s => s.name).join(', ')), food, low.join(', ')].filter(Boolean).join(' · ');
        return { id: 'supp:' + part, title: ss.length === 1 ? ss[0].name : 'Supplements', part, time: times[0] || null, kind: 'supp', detail, supps: ss.map(s => s.id) };
      });
    },
    checked(d) { const by = {}; for (const s of dueOn(d)) (by[PART(s)] = by[PART(s)] || []).push(s); return Object.keys(by).filter(p => by[p].every(s => taken(d, s.id))).map(p => 'supp:' + p); },
    set(d, id, on) { const part = id.split(':')[1]; for (const s of dueOn(d)) if (PART(s) === part) take(d, s.id, on); }
  });

  /* tap the row: tick each one; the check box on the row still takes them all */
  function takeSheet(d, it, after) {
    ui.sheet({ title: it.title, kicker: Plan.partLabel(it.part, d), render(api) {
      const c = h('<div class="card"></div>');
      for (const sid of it.supps) {
        const s = list().find(x => x.id === sid); if (!s) continue;
        const on = taken(d, sid), low = lowLine(s);
        const r = h('<div class="row tap' + (on ? ' done' : '') + '" role="checkbox" aria-checked="' + on + '"><span class="ck">' + ui.CK + '</span><span class="tx"><b>' + U.esc(label(s)) + '</b>' + ([s.withFood ? 'With food' : '', s.note, low].filter(Boolean).length ? '<small>' + U.esc([s.withFood ? 'With food' : '', s.note, low].filter(Boolean).join(' · ')) + '</small>' : '') + '</span></div>');
        r.onclick = () => { const n = !taken(d, sid); take(d, sid, n); Store.save(); r.classList.toggle('done', n); r.setAttribute('aria-checked', n); ui.buzz(n ? 10 : 6); after && after(); };
        c.appendChild(r);
      }
      api.body.appendChild(c);
      const b = h('<div class="btns"><button class="btn" type="button">Took them all</button></div>');
      b.firstChild.onclick = () => { it.supps.forEach(sid => take(d, sid, true)); Store.save(); ui.buzz(12); api.close(); after && after(); };
      api.body.appendChild(b);
    } });
  }

  /* ---------- add / edit ---------- */
  function editSheet(idx, after) {
    const isNew = idx == null, s = isNew ? { id: '', name: '', dose: null, part: 'morning', time: null, days: 'all', withFood: false, note: null, supply: null } : U.clone(list()[idx]);
    ui.sheet({ title: isNew ? 'Add a supplement' : s.name, kicker: isNew ? '' : 'Supplement', render(api) {
      const b = api.body;
      const f = (id, lbl, val, ph, type) => { const x = h('<div class="field"><label for="sp-' + id + '">' + lbl + '</label><input class="input" id="sp-' + id + '"' + (type ? ' type="' + type + '"' : '') + ' placeholder="' + U.esc(ph || '') + '"></div>'); x.querySelector('input').value = val == null ? '' : val; b.appendChild(x); return x.querySelector('input'); };
      const name = f('name', 'What', s.name, 'e.g. Fish oil'), dose = f('dose', 'Dose', s.dose, 'e.g. 2 capsules');
      // what a dose adds on Food › Vitamins & minerals
      const nf = h('<div class="field"><label for="sp-nut"></label><div class="snap-wt"><input class="input num" id="sp-nut" inputmode="decimal" placeholder="from the label"><span class="sp-nu small"></span></div><p class="small sp-nh" style="margin-top:6px"></p></div>');
      const nIn = nf.querySelector('input'); let nKey = null;
      const nDraw = () => {
        const tmp = { name: name.value, dose: dose.value, nutrients: null }, key = (s.nutrients && Object.keys(s.nutrients)[0]) && name.value === s.name ? Object.keys(s.nutrients)[0] : nutrientKey(tmp);
        nKey = key; nf.hidden = !key; if (!key) return;
        const n = NUTK[key];
        nf.querySelector('label').textContent = n[3].charAt(0).toUpperCase() + n[3].slice(1) + ' per dose';
        nf.querySelector('.sp-nu').textContent = n[2];
        const set = s.nutrients && s.nutrients[key] != null && name.value === s.name ? Number(s.nutrients[key]) : null, auto = fromDose(key, dose.value);
        nIn.placeholder = auto != null ? String(Math.round(auto * 100) / 100) : 'from the label';
        if (document.activeElement !== nIn && set != null) nIn.value = String(set);
        nf.querySelector('.sp-nh').textContent = nIn.value.trim() ? 'Counted on Food as you typed it.' : auto != null ? 'Read from the dose. If the label’s ' + n[3] + ' line says a different amount, type it here.' : 'Not counted on Food until you type the amount from the label.';
      };
      name.addEventListener('input', nDraw); dose.addEventListener('input', nDraw); nIn.addEventListener('input', nDraw);
      b.appendChild(nf); nDraw();
      let part = PART(s), mode = Array.isArray(s.days) ? 'days' : (s.days || 'all'), days = Array.isArray(s.days) ? s.days.slice() : [], wf = !!s.withFood;
      const pc = h('<div class="field"><label>When</label><div class="chips">' + Plan.PARTS.map(p => '<button class="chip" type="button" data-p="' + p + '">' + Plan.partLabel(p, new Date(2026, 10, 23)) + '</button>').join('') + '</div></div>');
      const mc = h('<div class="field"><label>Which days</label><div class="chips"><button class="chip" type="button" data-m="all">Every day</button><button class="chip" type="button" data-m="workdays">Workdays</button><button class="chip" type="button" data-m="daysoff">Days off</button><button class="chip" type="button" data-m="days">Some days</button></div></div>');
      const dc = h('<div class="chips">' + U.DAYS.map(d => '<button class="chip" type="button" data-d="' + d + '">' + U.DAY_NAMES[U.DAYS.indexOf(d)].slice(0, 3) + '</button>').join('') + '</div>');
      const fc = h('<div class="field"><div class="chips"><button class="chip" type="button">With food</button></div></div>');
      const draw = () => {
        pc.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.p === part));
        mc.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.m === mode));
        dc.hidden = mode !== 'days'; dc.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', days.includes(c.dataset.d)));
        fc.querySelector('.chip').classList.toggle('on', wf);
      };
      pc.querySelectorAll('.chip').forEach(c => c.onclick = () => { part = c.dataset.p; draw(); });
      mc.querySelectorAll('.chip').forEach(c => c.onclick = () => { mode = c.dataset.m; draw(); });
      dc.querySelectorAll('.chip').forEach(c => c.onclick = () => { const i = days.indexOf(c.dataset.d); if (i >= 0) days.splice(i, 1); else days.push(c.dataset.d); draw(); });
      fc.querySelector('.chip').onclick = () => { wf = !wf; draw(); };
      b.appendChild(pc); b.appendChild(mc); b.appendChild(dc); b.appendChild(fc);
      const time = f('time', 'Time (optional)', s.time, '', 'time');
      const note = f('note', 'Note (optional)', s.note, 'e.g. Not with coffee');
      // supply
      const sp = supply(s);
      const st = ui.stepper({ label: 'On hand', unit: 'left', value: sp ? sp.left : null, step: (v, k) => Math.max(0, (v || 0) + k * 10) });
      const per = ui.stepper({ label: 'Per dose', unit: 'each', value: s.supply ? (s.supply.perDose || 1) : 1, step: (v, k) => Math.max(1, (v || 1) + k) });
      const sw = h('<div class="field"><label>On hand (optional)</label><div class="grid2"></div><p class="small" style="margin-top:6px">Count the pills or scoops left and Opus warns you about ten days before you run out, and puts it on the grocery list.</p></div>');
      sw.querySelector('.grid2').appendChild(st.el); sw.querySelector('.grid2').appendChild(per.el); b.appendChild(sw);
      draw();
      const btns = h('<div class="btns">' + (isNew ? '' : '<button class="btn danger" type="button">Remove</button>') + '<button class="btn" type="button">Save</button></div>');
      if (!isNew) btns.firstChild.onclick = () => ui.ask({ title: 'Remove ' + s.name + '?', text: 'Days you already took it stay in your logs.', yes: 'Remove', danger: true }).then(ok => { if (!ok) return; list().splice(idx, 1); Plan.p.updated = U.key(); Store.save(); api.close(); after && after(); });
      btns.lastChild.onclick = () => {
        const nm = name.value.trim(); if (!nm) { ui.toast('What is it?'); name.focus(); return; }
        if (mode === 'days' && !days.length) { ui.toast('Pick at least one day'); return; }
        const out = { id: s.id || nm.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || U.uid(), name: nm, dose: dose.value.trim() || null, part, time: time.value || null, days: mode === 'days' ? U.DAYS.filter(d => days.includes(d)) : mode, withFood: wf, note: note.value.trim() || null, supply: s.supply || null, since: s.since || U.key() };
        const left = st.get();
        if (left == null) out.supply = null;
        else if (!sp || left !== sp.left || (per.get() || 1) !== ((s.supply || {}).perDose || 1)) out.supply = { left, asOf: U.key(), perDose: per.get() || 1 };
        if (s.active === false) out.active = false;
        const nv = Number(nIn.value.replace(',', '.')); if (nKey && nIn.value.trim() && nv >= 0) out.nutrients = { [nKey]: nv };
        else if (s.nutrients && nm === s.name && !nKey) out.nutrients = s.nutrients;
        const L = list();
        if (isNew) { while (L.some(x => x.id === out.id)) out.id += '-2'; L.push(out); } else L[idx] = out;
        Plan.p.updated = U.key(); Store.save(); api.close(); ui.toast('Saved'); after && after();
      };
      b.appendChild(btns);
    } });
  }

  /* ---------- Food tab section ---------- */
  function section(v, numeral) {
    const d = new Date(), L = list();
    const sec = h('<div class="sec"><div class="sh"><span class="r">' + numeral + '</span><span class="t">Supplements</span><button class="c" type="button">+ Add</button></div><div class="card"></div></div>');
    sec.querySelector('button').onclick = () => editSheet(null, () => Opus.refresh());
    const c = sec.querySelector('.card');
    if (!L.length) c.appendChild(h('<p class="empty">Nothing here yet. Add what you take, or tell Grok and it adds them.</p>'));
    L.forEach((s, i) => {
      // the last 7 days it was due (since it was added), how many it was taken
      let due = 0, n = 0;
      for (let k = 0; k < 7; k++) { const dd = U.addDays(d, -k); if (s.since && U.key(dd) < s.since) break; if (U.matchDays(s.days, U.dayKey(dd), Plan.isWorkday(dd))) { due++; if (taken(dd, s.id)) n++; } }
      const when = (s.days === 'workdays' ? 'Workdays' : s.days === 'daysoff' ? 'Days off' : Array.isArray(s.days) ? s.days.map(x => U.DAY_NAMES[U.DAYS.indexOf(x)].slice(0, 3)).join(' ') : 'Daily') + ', ' + Plan.partLabel(PART(s), d).toLowerCase() + (s.time ? ' ' + U.fmtTime(s.time) : '');
      const low = lowLine(s);
      const nr = nutrientsOf(s), nt = nr.amounts ? nutrientText(s) : nr.why === 'nodose' ? 'amount not known yet' : '';
      const r = h('<div class="row tap"><span class="tx"><b>' + U.esc(label(s)) + '</b><small>' + U.esc(when + (s.withFood ? ' · with food' : '') + (nt ? ' · ' + nt : '')) + (low ? ' · <span class="warn">' + U.esc(low) + '</span>' : '') + '</small></span><span class="tm num" title="last 7 days">' + (due ? n + '/' + due : '') + '</span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.onclick = () => editSheet(i, () => Opus.refresh());
      c.appendChild(r);
    });
    if (L.length) c.appendChild(h('<p class="small" style="padding:4px 0 10px">The number is days taken out of the last seven it was due, counted from when you added it. Tick them on Today.</p>'));
    v.appendChild(sec);
  }

  /* running low goes on the week's grocery list */
  const gl = Plan.groceryList && Plan.groceryList.bind(Plan);
  if (gl) Plan.groceryList = function (d) {
    const groups = gl(d), low = list().filter(s => s.active !== false && (supply(s) || {}).low);
    if (low.length) groups.push({ section: 'Supplements', items: low.map(s => ({ item: s.name, meals: ['running low'], qtys: [] })) });
    return groups;
  };

  Opus.supps = { list, supply, taken, takeSheet, editSheet, section, nutrientsOf, nutrientText, nutrientKey };
})();
