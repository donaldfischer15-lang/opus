/* Food tab: the weekly rotation, Sunday prep, the grocery list built from the meals, weigh-ins. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const SLOTS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

  const MK = [['kcal', 'Calories', ''], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g']];
  const n0 = v => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
  function macroLine(m) {
    const x = Plan.macros(m); if (!x || x.kcal == null) return '';
    return n0(x.kcal) + ' cal · ' + n0(x.protein) + ' P · ' + n0(x.carbs) + ' C · ' + n0(x.fat) + ' F';
  }
  function macroStats(planned, eaten) {
    return '<div class="stats four">' + MK.map(([k, lbl, u]) => '<div class="stat"><span class="v">' + n0(planned[k]) + '<small>' + u + '</small></span><span class="k">' + lbl + '</span>' +
      (eaten ? '<span class="e num">' + n0(eaten[k]) + ' eaten</span>' : '') + '</div>').join('') + '</div>';
  }

  function mealSheet(id) {
    const m = Plan.meal(id); if (!m) return;
    ui.sheet({ title: m.name, kicker: (SLOTS[m.slot] || 'Meal') + (m.serving ? ' · one serving' : ''), onClose: () => Opus.refresh(), render(api) {
      const b = api.body;
      const draw = () => {
        b.innerHTML = '';
        const x = Plan.macros(Plan.meal(id)) || {};
        if (m.how) b.appendChild(h('<p class="lede" style="text-align:left;font-size:17px">' + U.esc(m.how) + '</p>'));
        b.appendChild(h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">Macros</span><span class="c">' + (x.kcal == null ? 'not set' : x.estimate ? 'estimate' : 'your numbers') + '</span></div>' + macroStats(x) +
          '<p class="small" style="padding:4px 4px 0">' + (m.serving ? 'One serving: ' + U.esc(m.serving) + '. ' : '') + (x.estimate ? 'Estimated from standard nutrition values. Swap in label numbers when you have them.' : '') + '</p></div>'));
        const hasParts = Array.isArray(Plan.p.food.meals[id].parts) && Plan.p.food.meals[id].parts.length;
        const ed = h('<div class="btns">' + (hasParts ? '<button class="btn" type="button">Edit this meal</button>' : '') + '<button class="btn ghost" type="button">Edit macros</button></div>');
        if (hasParts) ed.children[0].onclick = () => editMeal(id, () => { api.setTitle(Plan.meal(id).name); draw(); });
        ed.lastElementChild.onclick = edit; b.appendChild(ed);
        let n = 1;
        const mm = Plan.meal(id);
        if (Array.isArray(mm.parts) && mm.parts.length) {
          const c = h('<div class="sec"><div class="sh"><span class="r">' + U.roman(++n) + '</span><span class="t">Parts</span><span class="c">one serving</span></div><div class="card"></div></div>');
          mm.parts.forEach(p => c.querySelector('.card').appendChild(h('<div class="row"><span class="tx"><b>' + U.esc(p.name) + '</b><small class="num">' + U.esc(macroTxt(p.macros) || 'no macros yet') + '</small></span><span class="q num">' + U.esc(amt(p.amount == null ? 1 : p.amount, p.unit || '')) + '</span></div>')));
          b.appendChild(c);
        }
        if ((m.ingredients || []).length) {
          const c = h('<div class="sec"><div class="sh"><span class="r">' + U.roman(++n) + '</span><span class="t">Ingredients</span><span class="c">for the week</span></div><div class="card"></div></div>');
          m.ingredients.forEach(g => c.querySelector('.card').appendChild(h('<div class="row gi"><span class="tx"><b>' + U.esc(g.item) + '</b></span><span class="q">' + U.esc(g.qty || '') + '</span></div>')));
          b.appendChild(c);
        }
        if ((m.prep || []).length) {
          const c = h('<div class="sec"><div class="sh"><span class="r">' + U.roman(++n) + '</span><span class="t">Prep</span></div><div class="card"></div></div>');
          m.prep.forEach((t, i) => c.querySelector('.card').appendChild(h('<div class="row"><span class="tag" style="min-width:22px">' + U.roman(i + 1) + '</span><span class="tx"><b style="font-weight:400">' + U.esc(t) + '</b></span></div>')));
          b.appendChild(c);
        }
      };
      const editParts = () => {
        b.innerHTML = '';
        const ps = Plan.p.food.meals[id].parts;
        b.appendChild(h('<p class="note">For the amount of each part in one serving. Use the numbers on the label if you have them. The meal adds them up.</p>'));
        ps.forEach((p, i) => {
          const g = h('<div class="sec"><div class="sh"><span class="t">' + U.esc(p.name) + '</span><span class="c num">' + U.esc(amt(p.amount == null ? 1 : p.amount, p.unit || '')) + '</span></div><div class="grid2"></div></div>');
          MK.forEach(([k, lbl, u]) => { const f = h('<div class="field"><label for="pm-' + i + '-' + k + '">' + lbl + (u ? ' (g)' : '') + '</label><input class="input num" id="pm-' + i + '-' + k + '" inputmode="decimal"></div>'); f.querySelector('input').value = p.macros && p.macros[k] != null ? p.macros[k] : ''; g.querySelector('.grid2').appendChild(f); });
          b.appendChild(g);
        });
        const btns = h('<div class="btns"><button class="btn quiet" type="button">Cancel</button><button class="btn" type="button">Save</button></div>');
        btns.children[0].onclick = draw;
        btns.children[1].onclick = () => {
          const next = [];
          for (let i = 0; i < ps.length; i++) {
            const o = {}; let changed = false;
            for (const [k] of MK) { const raw = b.querySelector('#pm-' + i + '-' + k).value.trim(); const v = raw === '' ? null : Number(raw); if (raw !== '' && !(v >= 0)) { ui.toast('Numbers only'); return; } o[k] = v; if (!ps[i].macros || ps[i].macros[k] !== v) changed = true; }
            o.estimate = changed ? false : !(ps[i].macros && ps[i].macros.estimate === false) ? true : false;
            next.push(o);
          }
          ps.forEach((p, i) => { p.macros = next[i]; });
          const meal = Plan.p.food.meals[id], sum = Plan.macros(meal);
          if (sum) meal.macros = { kcal: sum.kcal, protein: sum.protein, carbs: sum.carbs, fat: sum.fat, estimate: sum.estimate };
          Plan.p.updated = U.key(); Store.save(); ui.toast('Macros saved'); draw();
        };
        b.appendChild(btns);
      };
      const edit = () => {
        if (Array.isArray(Plan.p.food.meals[id].parts) && Plan.p.food.meals[id].parts.length) return editParts();
        b.innerHTML = '';
        const x = Plan.macros(Plan.meal(id)) || {};
        b.appendChild(h('<p class="note">Per serving' + (m.serving ? ' (' + U.esc(m.serving) + ')' : '') + '. Use the numbers on the label if you have them.</p>'));
        const g = h('<div class="grid2"></div>');
        MK.forEach(([k, lbl, u]) => { const f = h('<div class="field"><label for="mac-' + k + '">' + lbl + (u ? ' (g)' : '') + '</label><input class="input num" id="mac-' + k + '" inputmode="decimal"></div>'); f.querySelector('input').value = x[k] == null ? '' : x[k]; g.appendChild(f); });
        b.appendChild(g);
        const btns = h('<div class="btns"><button class="btn quiet" type="button">Cancel</button><button class="btn" type="button">Save</button></div>');
        btns.children[0].onclick = draw;
        btns.children[1].onclick = () => {
          const o = { estimate: false };
          for (const [k] of MK) { const raw = b.querySelector('#mac-' + k).value.trim(); const v = raw === '' ? null : Number(raw); if (raw !== '' && !(v >= 0)) { ui.toast('Numbers only'); return; } o[k] = v; }
          Plan.p.food.meals[id].macros = o; Plan.p.updated = U.key(); Store.save(); ui.toast('Macros saved'); draw();
        };
        b.appendChild(btns);
      };
      draw();
    } });
  }


  /* ---------- change a planned meal ----------
     Amounts, swaps, foods added or taken out. Each part's macros and vitamins scale with its amount, the meal adds them up,
     the week's grocery amounts follow, and amounts written in the meal's words change with them. Saved into the plan,
     so Grok sees it too. A part can be counted per item ("each": { "n": 2, "of": "sandwich" }): then you set it per sandwich. */
  const SKIPW = new Set(['medium', 'large', 'small', 'sliced', 'seasoned', 'fresh', 'whole', 'cooked', 'raw', 'with', 'and', 'from', 'each', 'about', "member's", 'mark']);
  const words = s => String(s || '').toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !SKIPW.has(w)).map(w => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, ''));
  const fmtQ = n => { const r = Math.round(n * 10) / 10; return r >= 1000 ? r.toLocaleString('en-US') : String(r); };
  const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // where a meal shows up: how many planned days a week it's eaten (for the grocery amounts)
  function timesAWeek(id) {
    const f = Plan.p.food || {}, r = f.rotation, days = Plan.foodDays() ? Plan.foodDays().length : 7;
    if (!r || !Array.isArray(r.weeks) || !r.weeks.length) return days;
    const rw = Plan.rotationWeek(new Date()), wk = rw && Object.values(rw.week).includes(id) ? rw.week : r.weeks.find(w => Object.values(w).includes(id));
    if (!wk) return days;
    return Object.entries(wk).filter(([k, v]) => k !== 'name' && v === id).length * days;
  }
  // "113 g (about 6 slices)" -> "140 g (about 7 slices)" wherever the old amount is written
  function retext(str, from, to, p) {
    if (!str || from === to || !(from > 0)) return str;
    const u = String(p.unit || '').toLowerCase(), r = to / from;
    const unitRe = u ? reEsc(u.replace(/s$/, '')) + '(?:e?s)?' : (words(p.name)[0] ? reEsc(words(p.name)[0]) + '[a-z]*' : null);
    if (!unitRe) return str;
    const re = new RegExp('(^|[^\\d.,])(' + reEsc(fmtQ(from)) + '|' + reEsc(String(Math.round(from * 10) / 10)) + ')(\\s*' + unitRe + '\\b)([^.;()\\d]{0,40}?[(,]\\s*about\\s+)?(\\d+(?:\\.\\d+)?)?', 'gi');
    return str.replace(re, (m, a, n, unit, ab, k) => a + fmtQ(to) + unit + (ab ? ab + (k ? Math.max(1, Math.round(Number(k) * r)) : '') : (k || '')));
  }
  // the week's grocery amount, keeping what follows it ("(about 2 packs)", "(2 packs of 8)")
  function requantity(qty, total, p) {
    const u = String(p.unit || ''), lead = String(qty || '').match(/^\s*([\d,]+(?:\.\d+)?)\s*([a-z]+)?/i);
    const unitTxt = /^(g|kg|oz|lb|ml)$/i.test(u) ? ' ' + u : u ? ' ' + u : '';
    if (!lead) return fmtQ(total) + unitTxt;
    const was = Number(lead[1].replace(/,/g, '')), r = was > 0 ? total / was : 1;
    let rest = String(qty).slice(lead[0].length);
    rest = rest.replace(/\((\d+)\s+(packs?|bags?|boxes|box|cans?|containers?|tubs?|bottles?|cartons?)\s+of\s+(\d+)\)/i, (m, n, w, of) => '(' + Math.max(1, Math.ceil(total / Number(of))) + ' ' + w + ' of ' + of + ')')
      .replace(/\(about\s+(\d+(?:\.\d+)?)/i, (m, n) => '(about ' + Math.max(1, Math.round(Number(n) * r)));
    return fmtQ(total) + (lead[2] ? ' ' + lead[2] : unitTxt) + rest;
  }
  function findIng(ings, p, taken) {
    let best = -1, score = 0; const pw = new Set(words(p.name));
    ings.forEach((g, i) => { if (taken.has(i)) return; if (g.part && g.part === p.name) { best = i; score = 99; return; } const n = words(g.item).filter(w => pw.has(w)).length; if (n > score) { score = n; best = i; } });
    return score ? best : -1;
  }

  function editMeal(id, after) {
    const m0 = Plan.p.food.meals[id]; if (!m0) return;
    const was = U.clone(m0), times = timesAWeek(id);
    const parts = (m0.parts || []).map(p => Object.assign({}, U.clone(p), { _orig: U.clone(p), _base: U.clone(p) }));
    const txt = { name: m0.name || '', serving: m0.serving || '', how: m0.how || '', prep: (m0.prep || []).join('\n') };
    const TX = ['serving', 'how', 'prep'], txt0 = Object.assign({}, txt);
    const amtOf = p => Number(p.amount == null ? 1 : p.amount), mark = (p, k) => { p._at = p._at || {}; (k ? [k] : TX).forEach(x => { p._at[x] = amtOf(p); }); };
    const plural = w => /(s|sh|ch|x)$/i.test(w) ? w + 'es' : w + 's';
    const scaled = p => { const B = p._base, a0 = B ? Number(B.amount == null ? 1 : B.amount) : 0, a = Number(p.amount == null ? 1 : p.amount); if (!B || !(a0 > 0)) return p; const r = a / a0; return Object.assign({}, p, { macros: B.macros ? Plan.scaleMacros(B.macros, r) : null, micros: B.micros ? scaleMicros(B.micros, r) : null }); };
    ui.sheet({ title: 'Edit ' + (m0.name || 'meal'), kicker: (SLOTS[m0.slot] || 'Meal') + ' · in the plan', foot: true, onClose: () => { after && after(); }, render(api) {
      const b = api.body;
      const sum = h('<div class="eat-sum"><div class="eat-k">One serving</div><div class="eat-v num"></div><div class="eat-p small num"></div></div>');
      b.appendChild(sum);
      const card = h('<div class="card me-parts"></div>'); b.appendChild(card);
      const add = h('<button class="btn ghost" type="button">' + ui.icon('plus', 'ico') + ' Add a food</button>'); b.appendChild(add);
      const wsec = h('<div class="sec"><div class="sh"><span class="r">II</span><span class="t">How it reads</span><span class="c">amounts follow your changes</span></div>' +
        '<div class="field"><label for="me-name">Name</label><input class="input" id="me-name" autocomplete="off"></div>' +
        '<div class="field"><label for="me-serving">One serving</label><textarea class="input" id="me-serving" rows="3"></textarea></div>' +
        '<div class="field"><label for="me-how">How</label><textarea class="input" id="me-how" rows="3"></textarea></div>' +
        '<div class="field"><label for="me-prep">Prep, one step a line</label><textarea class="input" id="me-prep" rows="3"></textarea></div></div>');
      b.appendChild(wsec);
      const gsec = h('<div class="sec"><div class="sh"><span class="r">III</span><span class="t">Groceries</span><span class="c">' + times + ' a week</span></div><div class="card"></div></div>'); b.appendChild(gsec);
      const F = k => wsec.querySelector('#me-' + k);
      F('name').value = txt.name; F('serving').value = txt.serving; F('how').value = txt.how; F('prep').value = txt.prep;
      parts.forEach(p => mark(p));
      ['name', 'serving', 'how', 'prep'].forEach(k => F(k).addEventListener('input', () => { txt[k] = F(k).value; if (TX.includes(k)) { txt0[k] = txt[k]; parts.forEach(p => mark(p, k)); } }));
      // amounts written in the words, worked out again from where they started
      const rewrite = () => TX.forEach(k => { let t = txt0[k]; parts.forEach(p => { const a0 = (p._at || {})[k], a = amtOf(p); if (!(a0 > 0) || a0 === a) return; t = retext(t, a0, a, p); const ea = p.each && Number(p.each.n) > 1 ? p.each : null; if (ea) t = retext(t, a0 / ea.n, a / ea.n, p); }); if (t !== txt[k]) { txt[k] = t; F(k).value = t; } });
      // the grocery lines this meal will have, worked out from the parts
      const groceries = () => {
        const ings = U.clone(m0.ingredients || []), taken = new Set(), out = [];
        parts.forEach(p => {
          const from = p._orig, changed = !from || p._swap || Number(p.amount) !== Number(from.amount == null ? 1 : from.amount);
          const i = findIng(ings, from || p, taken);
          if (i >= 0) taken.add(i);
          if (!changed) return;
          const total = Number(p.amount == null ? 1 : p.amount) * times;
          if (i >= 0) { const g = ings[i]; g.qty = p._swap ? fmtQ(total) + (p.unit ? ' ' + p.unit : '') : requantity(g.qty, total, p); if (p._swap) g.item = p.name; g.part = p.name; g._ch = true; }
          else { ings.push({ item: p.name, qty: fmtQ(total) + (p.unit ? ' ' + p.unit : ''), section: 'Other', part: p.name, _ch: true }); taken.add(ings.length - 1); }
        });
        // a food taken out takes its grocery line with it
        (parts._gone || []).forEach(p => { const i = findIng(ings, p, taken); if (i >= 0) { ings[i]._gone = true; taken.add(i); } });
        return ings;
      };
      const draw = () => {
        const x = Plan.sumMacros(parts.map(p => scaled(p).macros));
        const all = parts.every(p => p.macros && p.macros.kcal != null), ox = Plan.macros(was);
        sum.querySelector('.eat-v').textContent = parts.length ? (all ? macroTxt(x) : macroTxt(x) + ' + parts with no numbers') : 'Nothing in it yet';
        sum.querySelector('.eat-p').textContent = ox && ox.kcal != null ? (Math.round(ox.kcal) === Math.round(x.kcal) && Math.round(ox.protein) === Math.round(x.protein) ? 'Same as the plan now' : 'The plan now: ' + macroTxt(ox)) : '';
        const gc = gsec.querySelector('.card'); gc.innerHTML = '';
        groceries().forEach(g => gc.appendChild(h('<div class="row gi' + (g._gone ? ' off' : '') + '"><span class="tx"><b>' + U.esc(g.item) + '</b>' + (g._gone ? '<small>Comes off the list</small>' : g._ch ? '<small>Changed</small>' : '') + '</span><span class="q">' + U.esc(g.qty || '') + '</span></div>')));
        if (!gc.children.length) gc.appendChild(h('<p class="empty">No groceries for this meal.</p>'));
      };
      const rows = () => {
        card.innerHTML = '';
        parts.forEach((p, i) => {
          const ea = p.each && Number(p.each.n) > 1 ? p.each : null, per = ea ? Number(p.amount) / ea.n : Number(p.amount == null ? 1 : p.amount);
          const el = h('<div class="row part-row me-row"><span class="tx"><b>' + U.esc(p.name) + '</b><small class="pm num"></small></span><div class="part-amt"></div>' +
            '<div class="me-acts"><button class="lb" type="button" data-a="swap">Swap</button><button class="lb" type="button" data-a="drop">Take out</button></div></div>');
          const st = ui.stepper({ label: p.name + (ea ? ' per ' + ea.of : ''), unit: p.unit || '', value: per,
            step: (v, dir) => { const sz = ea && isWeight(p.unit) ? 5 : stepFor(per, p.unit); return Math.max(sz, Math.round(((v || 0) + sz * dir) * 100) / 100); },
            onChange: v => {
              if (!(v > 0)) return;
              p.amount = ea ? v * ea.n : v; rewrite(); pm(); draw();
            } });
          el.querySelector('.part-amt').appendChild(st.el);
          const pm = () => { const sp = scaled(p); el.querySelector('.pm').textContent = (ea ? 'Per ' + ea.of + '. ' + ea.n + ' ' + plural(ea.of) + ': ' + amt(Number(p.amount), p.unit || '') + ', ' : '') + (sp.macros && sp.macros.kcal != null ? kcal(sp.macros) : 'no numbers yet'); };
          pm();
          el.querySelector('[data-a="swap"]').onclick = () => addFood(new Date(), { pick: true, title: p.name.length > 22 ? 'Swap this food' : 'Swap ' + p.name, entry0: scaled(p), done: x => {
            const n = Object.assign({}, x, { _swap: true, _orig: p._orig, _base: U.clone(x) }); if (p.each) n.each = Object.assign({}, p.each);
            if (p.name !== x.name) ['name', 'serving', 'how', 'prep'].forEach(k => { const t = txt[k].split(p.name).join(x.name); if (t !== txt[k]) { txt[k] = t; F(k).value = t; if (txt0[k] != null) txt0[k] = t; } });
            if (p.name === x.name) { n._swap = false; n._at = p._at; } else { mark(n); const hint = wsec.querySelector('.me-hint') || wsec.insertBefore(h('<p class="small me-hint" style="padding:0 4px 6px"></p>'), wsec.children[1]); hint.textContent = 'You swapped in ' + x.name + '. Check the words below in case they still name ' + p.name + ' or its amounts.'; }
            parts[i] = n; rewrite(); rows(); draw();
          } });
          el.querySelector('[data-a="drop"]').onclick = () => { const gone = parts.splice(i, 1)[0]; if (gone._orig) (parts._gone = parts._gone || []).push(gone._orig); ui.buzz(8); rows(); draw();
            ui.toast('Took out ' + gone.name, { label: 'Undo', run: () => { parts.splice(i, 0, gone); if (parts._gone) parts._gone = parts._gone.filter(g => g !== gone._orig); rows(); draw(); } }); };
          card.appendChild(el);
        });
        if (!parts.length) card.appendChild(h('<p class="empty">Add the foods that go in this meal.</p>'));
      };
      add.onclick = () => addFood(new Date(), { pick: true, title: 'Add to ' + (txt.name || 'the meal'), done: x => { const n = Object.assign({}, x, { _base: U.clone(x) }); mark(n); parts.push(n); rows(); draw(); } });
      rows(); draw();
      const ft = h('<div class="btns"><button class="btn quiet" type="button">Cancel</button><button class="btn" type="button">Save to the plan</button></div>');
      api.foot.appendChild(ft);
      ft.children[0].onclick = () => api.close();
      ft.children[1].onclick = () => {
        if (!txt.name.trim()) { ui.toast('Give the meal a name'); F('name').focus(); return; }
        if (!parts.length) { ui.toast('A meal needs at least one food'); return; }
        const m = Plan.p.food.meals[id];
        const ings = groceries().filter(g => !g._gone).map(g => { const o = Object.assign({}, g); delete o._ch; delete o._gone; return o; });
        m.parts = parts.map(p => { const o = scaled(p); const c = {}; for (const k of Object.keys(o)) if (k[0] !== '_') c[k] = o[k]; c.amount = Math.round(Number(c.amount == null ? 1 : c.amount) * 100) / 100; if (!c.micros) delete c.micros; return c; });
        m.name = txt.name.trim(); m.serving = txt.serving.trim(); m.how = txt.how.trim(); m.prep = txt.prep.split('\n').map(t => t.trim()).filter(Boolean);
        if (!m.serving) delete m.serving; if (!m.how) delete m.how;
        m.ingredients = ings;
        const x = Plan.sumMacros(m.parts.map(p => p.macros));
        m.macros = { kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat, estimate: x.estimate };
        const v = Plan.validate(Plan.p);
        if (!v.ok) { Object.keys(m).forEach(k => delete m[k]); Object.assign(m, was); ui.toast('Couldn’t save: ' + v.errors[0]); return; }
        Plan.p.updated = U.key(); Store.save(); ui.buzz(12); api.close(); ui.toast('Saved to the plan', { label: 'Undo', run: () => { const mm = Plan.p.food.meals[id]; Object.keys(mm).forEach(k => delete mm[k]); Object.assign(mm, was); Plan.p.updated = U.key(); Store.save(); after && after(); Opus.refresh(); } });
      };
    } });
  }

  /* ---------- what you actually ate ---------- */
  const SLOT_KEYS = ['breakfast', 'lunch', 'snack', 'dinner'];
  const slotNow = () => { const t = new Date(), m = t.getHours() * 60 + t.getMinutes(); return m < 630 ? 'breakfast' : m < 870 ? 'lunch' : m < 1050 ? 'snack' : 'dinner'; };
  const isWeight = u => /^(g|ml|kg|oz|lb)$/i.test(u || '');
  const stepFor = (amount, unit) => /^(g|ml)$/i.test(unit || '') ? (amount >= 100 ? 10 : 5) : /^(oz|lb|kg|cups?|tbsp|tsp)$/i.test(unit || '') ? .5 : (amount >= 2 ? 1 : .5);
  const amt = (n, unit, name) => { const v = U.wt(n); return isWeight(unit) ? v + ' ' + unit + (name ? ' ' + name : '') : (v + (unit ? ' ' + unit : '') + (name ? ' ' + name : '')); };
  /* how an amount reads on the day list: the unit without its label notes ("cup (240 ml) (240 g)" reads "cup"), and
     common fractions where they fit (0.75 serving reads ¾ serving) */
  const OPEN = {}; // which meals you folded or opened, while Opus is open
  const unitName = u => String(u || '').replace(/\s*\([^)]*\)/g, '').trim();
  const FRAC = [[.25, '¼'], [.333, '⅓'], [.5, '½'], [.667, '⅔'], [.75, '¾']];
  function niceAmount(n, unit) {
    const u = unitName(unit), v = Number(n);
    if (!(v > 0)) return u;
    if (isWeight(u) || /^fl oz$/i.test(u)) return U.wt(v) + ' ' + u;
    const w = Math.floor(v), f = v - w, fr = FRAC.find(x => Math.abs(x[0] - f) < .04);
    const num = f < .04 ? String(w) : f > .96 ? String(w + 1) : fr ? (w ? w : '') + fr[1] : U.wt(v);
    const one = num === '1' || num === '¼' || num === '⅓' || num === '½' || num === '⅔' || num === '¾';
    return num + (u ? ' ' + (one ? u : plural(u)) : '');
  }
  const plural = u => /s$|^(g|ml|oz|lb|kg)$/i.test(u) ? u : /^[a-z]/i.test(u) && !/\s/.test(u) ? u.replace(/(y)$/i, 'ie') + 's' : u;
  const kcal = x => (x && x.kcal != null ? n0(x.kcal) + ' cal' : '');
  const macroTxt = x => (x && x.kcal != null ? n0(x.kcal) + ' cal · ' + n0(x.protein) + ' P · ' + n0(x.carbs) + ' C · ' + n0(x.fat) + ' F' : '');
  const newId = d => U.key(d) + ':x' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
  function bury(id) { const dl = Store.data.deleted = Store.data.deleted || {}; (dl.eaten = dl.eaten || {})[id] = new Date().toISOString(); }
  function putEaten(e) { const L = Store.data.eaten = Store.data.eaten || []; const i = L.findIndex(x => x.id === e.id); if (i >= 0) L[i] = e; else L.push(e); }
  function dropEaten(id) { const L = Store.data.eaten = Store.data.eaten || []; const i = L.findIndex(x => x.id === id); if (i < 0) return null; const [x] = L.splice(i, 1); bury(id); return x; }

  /* the small line under a planned meal: what you ate of it, if it wasn't all of it */
  function eatenLine(d, it) {
    const e = Plan.eatenEntry(d, it.id);
    if (!e) return null;
    if (e.skipped) return null; // ticked after all: eaten as planned
    const ate = (e.parts || []).filter(p => p.ate > 0);
    if (!ate.length) return null;
    return 'Ate: ' + ate.map(p => (p.ate !== p.planned ? amt(p.ate, p.unit, p.name) : p.name)).join(', ') + (e.macros && e.macros.kcal != null ? ' · ' + n0(e.macros.kcal) + ' cal' : '');
  }

  /* Tap a planned meal: tick off its parts, change amounts, or say you skipped it. */
  function eatSheet(d, it, after) {
    const m = it.meal, parts = Plan.partsOf(m), e = Plan.eatenEntry(d, it.id);
    const ate = parts.map(p => { const x = e && !e.skipped && (e.parts || []).find(q => q.name === p.name); return x ? x.ate : e && e.skipped ? 0 : p.amount; });
    const mealX = Plan.macros(m);
    const partMac = (p, n) => (p.macros ? Plan.scaleMacros(p.macros, p.amount ? n / p.amount : 0) : null);
    const total = () => {
      if (parts.every(p => p.macros)) return Plan.sumMacros(parts.map((p, i) => partMac(p, ate[i])));
      if (!mealX || mealX.kcal == null) return null;
      const f = parts.length ? parts.reduce((a, p, i) => a + (p.amount ? Math.min(ate[i] / p.amount, 3) : 0), 0) / parts.length : 1;
      return Object.assign(Plan.scaleMacros(mealX, f), { estimate: true });
    };
    ui.sheet({ title: m.name, kicker: (SLOTS[it.meal.slot] || SLOTS[(Plan.p.routine || []).find(r => r.id === it.id)?.meal] || 'Meal') + (it.time ? ' · ' + U.fmtTime(it.time) : ''), foot: true,
      onClose: () => { after && after(); Opus.refresh(); }, render(api) {
      const b = api.body;
      const head = h('<div class="eat-sum"><div class="eat-k">You ate</div><div class="eat-v num"></div><div class="eat-p small num"></div></div>');
      b.appendChild(head);
      const all = h('<div class="chips" style="padding:0 2px"><button class="chip" type="button">Ate it all</button><button class="chip" type="button">Meal details</button></div>');
      b.appendChild(all);
      const card = h('<div class="card"></div>'); b.appendChild(card);
      const rows = [];
      const upd = () => {
        const x = total(), full = parts.every((p, i) => ate[i] === p.amount), none = ate.every(v => !v);
        head.querySelector('.eat-v').textContent = none ? 'Nothing' : x ? macroTxt(x) : parts.filter((p, i) => ate[i]).map(p => p.name).join(', ');
        head.querySelector('.eat-p').textContent = full ? 'Just as planned' : mealX && mealX.kcal != null ? 'Planned: ' + macroTxt(mealX) : '';
        all.children[0].classList.toggle('on', full);
        rows.forEach((r, i) => { r.el.classList.toggle('off', !ate[i]); r.el.querySelector('.ck').classList.toggle('on', !!ate[i]); const pm = partMac(parts[i], ate[i]); r.el.querySelector('.pm').textContent = pm ? kcal(pm) : ''; });
      };
      parts.forEach((p, i) => {
        const el = h('<div class="row part-row"><button class="ck" type="button" aria-label="Ate this">' + ui.CK + '</button><span class="tx"><b>' + U.esc(p.name) + '</b><small class="pm num"></small></span><div class="part-amt"></div></div>');
        const st = ui.stepper({ label: p.name, unit: p.unit || '', value: ate[i], step: (v, dir) => Math.max(0, Math.round(((v || 0) + stepFor(p.amount, p.unit) * dir) * 100) / 100), onChange: v => { ate[i] = v == null || v < 0 ? 0 : v; upd(); } });
        el.querySelector('.part-amt').appendChild(st.el);
        el.querySelector('.ck').onclick = () => { ate[i] = ate[i] ? 0 : p.amount; st.set(ate[i], true); ui.buzz(8); upd(); };
        rows.push({ el, st }); card.appendChild(el);
      });
      if (!parts.length) card.appendChild(h('<p class="empty">This meal has no parts listed yet. Tick it off on the Food tab, or ask Grok to add its parts.</p>'));
      all.children[0].onclick = () => { parts.forEach((p, i) => { ate[i] = p.amount; rows[i].st.set(p.amount, true); }); ui.buzz(8); upd(); };
      all.children[1].onclick = () => mealSheet(m.id);
      const extra = h('<button class="btn ghost" type="button">' + ui.icon('plus', 'ico') + ' Add something else</button>');
      extra.onclick = () => addFood(d, { slot: (Plan.p.routine || []).find(r => r.id === it.id)?.meal || m.slot });
      b.appendChild(extra);
      b.appendChild(h('<p class="small" style="padding:0 4px">Change an amount if you ate more or less. Everything here is saved for Grok to read.</p>'));
      const ft = h('<div class="btns"><button class="btn quiet" type="button">Didn’t eat it</button><button class="btn" type="button">Save</button></div>');
      api.foot.appendChild(ft);
      ft.children[0].onclick = () => {
        putEaten({ id: U.key(d) + ':' + it.id, date: U.key(d), item: it.id, meal: m.id, name: m.name, skipped: true, parts: parts.map(p => ({ name: p.name, unit: p.unit, planned: p.amount, ate: 0 })), macros: null, at: new Date().toISOString() });
        Plan.setChecked(d, it.id, false); Store.save(); api.close(); ui.toast('Marked as skipped');
      };
      ft.children[1].onclick = () => {
        const full = parts.every((p, i) => ate[i] === p.amount), none = ate.every(v => !v);
        if (none) { ft.children[0].click(); return; }
        const id = U.key(d) + ':' + it.id;
        if (full) { if (Plan.eatenEntry(d, it.id)) dropEaten(id); }
        else putEaten({ id, date: U.key(d), item: it.id, meal: m.id, name: m.name, parts: parts.map((p, i) => Object.assign({ name: p.name, unit: p.unit, planned: p.amount, ate: ate[i] }, p.macros ? { macros: partMac(p, ate[i]) } : {})), macros: total(), at: new Date().toISOString() });
        Plan.setChecked(d, it.id, true); Store.save(); ui.buzz(12); api.close(); ui.toast(full ? 'Eaten, as planned' : 'Saved what you ate');
      };
      upd();
    } });
  }


  /* units: how many grams one of each unit is for this food, and which unit fits the food best.
     A food's own serving tells what a cup, an each or a bar weighs; weights are fixed; liquids count 1 ml as 1 g. */
  const FIXED = { g: 1, oz: 28.35, lb: 453.6, kg: 1000, ml: 1, 'fl oz': 29.57, tbsp: 15, tsp: 5 };
  const UNIT_ALIAS = [[/^(g|grams?|gr)$/i, 'g'], [/^(oz|ounces?)$/i, 'oz'], [/^(lbs?|pounds?)$/i, 'lb'], [/^(kg|kilos?|kilograms?)$/i, 'kg'], [/^(ml|milliliters?|millilitres?)$/i, 'ml'],
    [/^(fl\.? ?oz|fluid ounces?)$/i, 'fl oz'], [/^cups?$/i, 'cup'], [/^(tbsp|tablespoons?)$/i, 'tbsp'], [/^(tsp|teaspoons?)$/i, 'tsp'], [/^(each|ea|whole|pieces?|pcs?|items?)$/i, 'each'],
    [/^bars?$/i, 'bar'], [/^sticks?$/i, 'stick'], [/^slices?$/i, 'slice'], [/^eggs?$/i, 'egg'], [/^servings?$/i, 'serving'], [/^(scoops?)$/i, 'scoop'], [/^(cans?)$/i, 'can'], [/^(bottles?)$/i, 'bottle'], [/^(containers?|cups? \(container\))$/i, 'container']];
  const canonUnit = u => { u = String(u || '').trim(); for (const [re, c] of UNIT_ALIAS) if (re.test(u)) return c; return u; };
  // "cup (240 ml) (240 g)" → { unit: 'cup', g: 240 }; "serving (2 slices, 56 g)" → { unit: 'slice', g: 28 }; "g" → { unit: 'g', g: 1 }
  function readUnit(raw) {
    const str = String(raw || '').trim(); if (!str) return { unit: '', g: null };
    const head = str.replace(/\s*\(.*$/, '').trim(), unit = canonUnit(head);
    if (FIXED[unit]) return { unit, g: FIXED[unit] };
    const gm = /([\d.]+)\s*g\b/i.exec(str), ml = /([\d.]+)\s*ml\b/i.exec(str);
    let g = gm ? Number(gm[1]) : ml ? Number(ml[1]) : null;
    const inner = /\(([\d.]+)\s+([a-z]+)/i.exec(str);
    if (unit === 'serving' && inner && g) { const n = Number(inner[1]), u2 = canonUnit(inner[2]); if (n > 0 && u2 && !FIXED[u2]) return { unit: u2, g: Math.round(g / n * 10) / 10 }; }
    return { unit, g: g > 0 ? g : null };
  }
  // the kind of food from its name: which units make sense, best first
  const KINDS = [
    [/\b(milk|juice|coffee|latte|soda|cola|coke|pepsi|sprite|tea|water|broth|stock|smoothie|shake|kefir|creamer|beer|wine|lemonade|gatorade|powerade|kombucha|energy drink|drink)\b/i, ['cup', 'fl oz', 'ml']],
    [/\b(eggs?)\b/i, ['egg', 'g']],
    [/\b(bar|bars)\b/i, ['bar', 'g']],
    [/\b(sticks?|jerky)\b/i, ['stick', 'oz', 'g']],
    [/\b(bread|toast|pizza|bacon|cheese slice|american cheese)\b/i, ['slice', 'g']],
    [/\b(bagel|muffin|tortilla|wrap|bun|roll|english muffin|banana|apple|orange|pear|peach|plum|kiwi|avocado|potato|cookie|donut|doughnut|waffle|pancake|burrito|sandwich|hot dog|sausage link|pickle)\b/i, ['each', 'g']],
    [/\b(chicken|beef|steak|pork|turkey|ham|salmon|tuna|fish|shrimp|ground|meat|brisket|ribs?|lamb|sausage|enchiladas?|lasagna|casserole|cheese)\b/i, ['oz', 'g', 'lb']],
    [/\b(rice|pasta|noodles|oats|oatmeal|cereal|granola|beans|lentils|quinoa|soup|chili|salad|berries|blueberries|strawberries|grapes|veggies|vegetables|broccoli|spinach|corn|peas|yogurt|cottage cheese|ice cream|popcorn|chips|nuts|almonds|peanuts|trail mix)\b/i, ['cup', 'g', 'oz']],
    [/\b(peanut butter|almond butter|butter|oil|mayo|mayonnaise|ranch|dressing|sauce|ketchup|mustard|syrup|honey|jam|jelly|cream cheese|hummus|sugar|creamer)\b/i, ['tbsp', 'tsp', 'g']],
    [/\b(protein powder|whey|creatine|scoop)\b/i, ['scoop', 'g']]
  ];
  function unitsFor(name, own) {
    const k = KINDS.find(([re]) => re.test(name || '')), list = k ? k[1].slice() : [];
    if (own && own.unit && !list.includes(own.unit)) list.splice(own.unit === 'g' || own.unit === 'oz' ? list.length : 0, 0, own.unit);
    for (const u of ['g', 'oz']) if (!list.includes(u)) list.push(u);
    return list.slice(0, 5);
  }
  // grams in one of this unit, for this food (null when unknown)
  function gramsPer(unit, own) {
    if (!unit) return null; if (FIXED[unit]) return FIXED[unit];
    if (own && own.unit === unit && own.g) return own.g;
    if (unit === 'cup') return 240;
    if (own && own.g && (own.unit === 'serving' || !own.unit) && /^(each|bar|stick|slice|egg|scoop|can|bottle|container)$/.test(unit)) return own.g;
    return null;
  }
  const niceAmt = (v, unit) => { if (!(v > 0)) return 0; const st = /^(g|ml)$/.test(unit) ? 5 : /^(oz|fl oz|cup|lb|kg|tbsp|tsp)$/.test(unit) ? 0.25 : 0.5; return Math.max(st, Math.round(v / st) * st); };

  /* Anything you ate that wasn't in the plan: a yogurt cup, a coffee, a second banana. */
  const scaleMicros = (m, f) => { const o = {}; for (const k in m) o[k] = typeof m[k] === 'number' ? Math.round(m[k] * f * 100) / 100 : m[k]; o.estimate = m.estimate !== false; return o; };
  function addFood(d, o) {
    o = o || {};
    const ed = o.entry || null;
    const lib = Plan.library();
    const recent = []; const seen = new Set(lib.map(x => String(x.name).toLowerCase()));
    (Store.data.eaten || []).filter(e => e.extra && e.name).sort((a, b) => String(b.at || b.date).localeCompare(String(a.at || a.date))).forEach(e => { const k = e.name.toLowerCase(); if (!seen.has(k) && recent.length < 6) { seen.add(k); recent.push(e); } });
    const picks = lib.map(x => Object.assign({ from: 'lib' }, x)).concat(recent.map(x => ({ name: x.name, amount: x.amount, unit: x.unit, macros: x.macros, micros: x.micros || null, from: 'recent' })));
    // foods already in your meals, and parts you've logged before (the turkey you used to have), for a swap
    if (o.pick) {
      const fromMeals = [], inPlan = new Set();
      for (const mm of Object.values((Plan.p.food || {}).meals || {})) for (const p of (mm.parts || [])) if (p && p.name) inPlan.add(p.name.toLowerCase());
      // foods from meals you've eaten that aren't in the plan now (the turkey you used to have) come first
      (Store.data.eaten || []).slice().sort((x, y) => String(y.date).localeCompare(String(x.date))).forEach(e => (e.parts || []).forEach(p => { const k = String(p && p.name || '').toLowerCase(); if (k && p.macros && p.planned > 0 && !inPlan.has(k) && !seen.has(k)) { seen.add(k); fromMeals.push({ name: p.name, amount: p.planned, unit: p.unit, macros: p.macros, from: 'meal' }); } }));
      for (const mm of Object.values((Plan.p.food || {}).meals || {})) for (const p of (mm.parts || [])) if (p && p.name && !seen.has(p.name.toLowerCase())) { seen.add(p.name.toLowerCase()); fromMeals.push({ name: p.name, amount: p.amount, unit: p.unit, macros: p.macros, micros: p.micros || null, from: 'meal' }); }
      picks.unshift(...fromMeals);
    }
    let slot = ed ? ed.slot || slotNow() : o.slot || slotNow(), base = null, touched = false, mbase = null, own = null, unitSet = false;
    ui.sheet({ title: o.title || (ed ? ed.name : 'Add food'), kicker: o.pick ? 'For the plan' : ed ? (Plan.foodOff(U.parseKey(ed.date)) ? 'Off day' : 'Something extra') : Plan.foodOff(d) ? 'Off day' : 'Not in the plan', foot: true, onClose: () => { o.after && o.after(); if (!o.pick) Opus.refresh(); }, render(api) {
      const b = api.body;
      let search = null;
      if (!ed && !o.pick && Opus.snap) { const w = Opus.snap.buttons(d, { slot: o.slot, before: () => api.close(true) }); w.classList.add('in-sheet'); b.appendChild(w); }
      if (!ed && Opus.foodSearch) { search = Opus.foodSearch.block(x => fill(x)); b.appendChild(search.el); if (o.query) { search.input.value = o.query; search.input.dispatchEvent(new Event('input')); search.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); } }
      if (picks.length && !ed) {
        const c = h('<div class="sec"><div class="sh"><span class="t">Your foods</span><span class="c">tap to fill in</span></div><div class="chips"></div></div>');
        picks.slice(0, o.pick ? 32 : 14).forEach(x => { const ch = h('<button class="chip" type="button">' + U.esc(x.name) + '</button>'); ch.onclick = () => { fill(x); c.querySelectorAll('.chip').forEach(y => y.classList.remove('on')); ch.classList.add('on'); ui.buzz(6); }; c.querySelector('.chips').appendChild(ch); });
        b.appendChild(c);
      }
      const nm = h('<div class="field"><label for="af-name">' + (o.pick ? 'Food' : 'What was it') + '</label><input class="input" id="af-name" placeholder="Yogurt cup" autocomplete="off"></div>');
      b.appendChild(nm);
      const ar = h('<div class="grid2 af-amt"><div class="field"><label>Amount</label></div><div class="field"><label for="af-unit">Unit</label><input class="input" id="af-unit" placeholder="cup, oz, each" autocomplete="off" autocapitalize="off" spellcheck="false"></div></div>');
      const uc = h('<div class="chips af-units" role="group" aria-label="Unit"></div>');
      const st = ui.stepper({ label: 'Amount', value: 1, step: (v, dir) => Math.max(0, Math.round(((v || 0) + stepFor(v || 1, b.querySelector('#af-unit').value) * dir) * 100) / 100), onChange: () => scale() });
      ar.children[0].appendChild(st.el); b.appendChild(ar); b.appendChild(uc);
      const sl = h('<div class="sec"><div class="sh"><span class="t">With</span></div><div class="chips"></div></div>');
      SLOT_KEYS.forEach(k => { const ch = h('<button class="chip" type="button" data-s="' + k + '">' + SLOTS[k] + '</button>'); ch.onclick = () => { slot = k; drawSlot(); }; sl.querySelector('.chips').appendChild(ch); });
      const drawSlot = () => sl.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.s === slot));
      if (!o.pick) b.appendChild(sl);
      const mg = h('<div class="sec"><div class="sh"><span class="t">Macros</span><span class="c">for this amount, if you know them</span></div><div class="grid2"></div></div>');
      MK.forEach(([k, lbl, u]) => { const f = h('<div class="field"><label for="af-' + k + '">' + lbl + (u ? ' (g)' : '') + '</label><input class="input num" id="af-' + k + '" inputmode="decimal"></div>'); f.querySelector('input').addEventListener('input', () => { touched = true; }); mg.querySelector('.grid2').appendChild(f); });
      b.appendChild(mg);
      const keep = h('<button class="row tap tgb" type="button" style="width:100%;text-align:left"><span class="ck sq">' + ui.CK + '</span><span class="tx"><b>Keep in my foods</b><small>One tap next time. Grok can see and edit your foods too.</small></span></button>');
      let keepOn = false; keep.onclick = () => { keepOn = !keepOn; keep.classList.toggle('on', keepOn); };
      if (!ed && !o.pick) b.appendChild(keep);
      b.appendChild(h('<p class="small" style="padding:0 4px">' + (o.pick ? 'Search, or tap one of your foods, then set how much goes in one serving.' : 'No numbers? It still counts as eaten, and the day’s totals note it.') + '</p>'));
      const inp = k => b.querySelector('#af-' + k);
      const setMac = x => MK.forEach(([k]) => { inp(k).value = x && x[k] != null ? U.wt(x[k]) : ''; });
      // the unit chips: tap one and the amount converts, so the numbers stay right
      function drawUnits() {
        const cur = canonUnit(inp('unit').value), list = unitsFor(inp('name').value, own);
        if (cur && !list.includes(cur)) list.unshift(cur);
        uc.innerHTML = '';
        list.forEach(u => { const c = h('<button class="chip" type="button"></button>'); c.textContent = u; c.classList.toggle('on', u === cur); c.onclick = () => { setUnit(u, true); ui.buzz(6); }; uc.appendChild(c); });
      }
      function setUnit(u, convert) {
        const was = canonUnit(inp('unit').value), gOld = gramsPer(was, own), gNew = gramsPer(u, own), a = st.get();
        inp('unit').value = u; unitSet = true;
        if (convert && gOld && gNew && a > 0 && was !== u) st.set(niceAmt(a * gOld / gNew, u), true);
        scale(); drawUnits();
      }
      // grams for the amount on screen, when the unit's weight is known
      const gramsNow = () => { const g = gramsPer(canonUnit(inp('unit').value), own), a = st.get(); return g && a > 0 ? a * g : null; };
      function fill(x) {
        inp('name').value = x.name || '';
        own = readUnit(x.unit); if (!own.g && x.serving && x.serving.g) own.g = Number(x.serving.g) || null;
        const amt0 = x.amount == null ? 1 : Number(x.amount) || 1;
        // per gram, when the food's weight is known: from its label per 100 g, or worked out from its macros
        const g0 = own.g ? amt0 * own.g : null;
        base = x.macros ? { amount: amt0, macros: x.macros, grams: g0, per100: x.per100 || null } : null; touched = false;
        mbase = x.micros ? { name: String(x.name || '').toLowerCase(), amount: amt0, grams: g0, micros: x.micros } : null;
        inp('unit').value = own.unit; st.set(amt0, true); unitSet = !!own.unit;
        // a better unit for this kind of food, when the food came in grams or a bare serving
        const best = unitsFor(x.name, null)[0];
        if (!x.from && best && best !== own.unit && (own.unit === 'g' || own.unit === 'serving' || !own.unit) && g0 && gramsPer(best, own)) { inp('unit').value = best; st.set(FIXED[best] ? niceAmt(g0 / gramsPer(best, own), best) : 1, true); }
        setMac(null); scale(); if (!base) setMac(x.macros);
        keepOn = false; keep.classList.remove('on'); keep.hidden = x.from === 'lib';
        drawUnits();
      }
      function scale() {
        if (!base || touched) return;
        const g = gramsNow();
        if (g && base.per100) { setMac(Plan.scaleMacros(Object.assign({ estimate: base.macros.estimate }, base.per100), g / 100)); return; }
        if (g && base.grams) { setMac(Plan.scaleMacros(base.macros, g / base.grams)); return; }
        if (!base.amount) return; setMac(Plan.scaleMacros(base.macros, (st.get() || 0) / base.amount));
      }
      inp('unit').addEventListener('input', () => { unitSet = true; scale(); drawUnits(); });
      inp('name').addEventListener('input', () => {
        if (base) return; // a picked food keeps its own units
        if (!unitSet) { const best = unitsFor(inp('name').value, null)[0]; if (best && unitsFor('', null)[0] !== best) inp('unit').value = best; else if (!inp('name').value.trim()) inp('unit').value = ''; }
        drawUnits();
      });
      const readMac = () => { const o2 = { estimate: true }; let any = false; for (const [k] of MK) { const raw = inp(k).value.trim(); if (raw === '') { o2[k] = null; continue; } const v = Number(raw.replace(',', '.')); if (!(v >= 0)) return false; o2[k] = v; any = true; } if (base && !touched) o2.estimate = base.macros.estimate !== false; else if (any) o2.estimate = false; return any ? o2 : null; };
      if (ed) { fill({ name: ed.name, amount: ed.amount, unit: ed.unit, macros: ed.macros, micros: ed.micros, from: 'entry' }); }
      if (o.entry0) fill(Object.assign({ from: 'entry' }, o.entry0));
      drawSlot(); drawUnits();
      const ft = h('<div class="btns">' + (ed ? '<button class="btn quiet" type="button">Remove</button>' : '') + '<button class="btn" type="button">' + (o.pick ? 'Use this' : ed ? 'Save' : 'Add') + '</button></div>');
      api.foot.appendChild(ft);
      if (ed) ft.children[0].onclick = () => {
        const gone = dropEaten(ed.id); Store.save(); api.close();
        ui.toast('Removed ' + ed.name, { label: 'Undo', run: () => { if (gone) { const dl = (Store.data.deleted || {}).eaten || {}; delete dl[gone.id]; gone.at = new Date().toISOString(); putEaten(gone); Store.save(); Opus.refresh(); } } });
      };
      ft.lastElementChild.onclick = () => {
        const name = inp('name').value.trim(); if (!name) { ui.toast('What did you eat?'); inp('name').focus(); return; }
        const amount = st.get(); if (!(amount > 0)) { ui.toast('Enter an amount'); return; }
        const macros = readMac(); if (macros === false) { ui.toast('Macros: numbers only'); return; }
        const unit = canonUnit(inp('unit').value), grams = gramsNow();
        // vitamins and minerals carry over from the food you picked, scaled to the amount (only while the name still matches)
        const micros = mbase && mbase.name === name.toLowerCase() ? scaleMicros(mbase.micros, grams && mbase.grams ? grams / mbase.grams : amount / mbase.amount) : null;
        if (o.pick) { const x = Object.assign({ name, amount, unit, macros: macros || null }, micros ? { micros } : {}); api.close(true); o.done && o.done(x); return; }
        const e = Object.assign({ id: ed ? ed.id : newId(d), date: ed ? ed.date : U.key(d), extra: true, name, amount, unit, slot, macros, at: new Date().toISOString() }, grams && !FIXED[unit] ? { grams: Math.round(grams) } : {}, micros ? { micros } : {});
        putEaten(e);
        if (keepOn) {
          const f = Plan.p.food = Plan.p.food || {}; f.library = Array.isArray(f.library) ? f.library : [];
          const i = f.library.findIndex(x => String(x.name).toLowerCase() === name.toLowerCase());
          const item = Object.assign({ name, amount, unit, macros }, micros ? { micros } : {}); if (i >= 0) f.library[i] = item; else f.library.push(item);
          Plan.p.updated = U.key();
        }
        Store.save(); ui.buzz(12); api.close(); ui.toast(ed ? 'Saved' : 'Added ' + name + (keepOn ? ', and kept in your foods' : ''));
      };
      if (!ed && !o.entry0) setTimeout(() => { if (search) search.input.focus(); else if (!picks.length) inp('name').focus(); }, 350);
    } });
  }

  /* one tap to log something you've had before: extras from the last two weeks, most often first, not yet logged today */
  function againPicks(d) {
    const today = U.key(d), from = U.key(U.addDays(d, -14)), by = new Map();
    (Store.data.eaten || []).filter(e => e.extra && e.name && e.date < today && e.date >= from).forEach(e => {
      const k = e.name.toLowerCase(), x = by.get(k) || { n: 0, last: null, slots: {} };
      x.n++; x.slots[e.slot] = (x.slots[e.slot] || 0) + 1;
      if (!x.last || String(e.date + (e.at || '')) > String(x.last.date + (x.last.at || ''))) x.last = e;
      by.set(k, x);
    });
    const had = new Set(Plan.eatenOn(d).filter(e => e.extra).map(e => String(e.name).toLowerCase()));
    return Array.from(by.entries()).filter(([k]) => !had.has(k)).map(([, x]) => x)
      .sort((a, b) => b.n - a.n || String(b.last.date).localeCompare(String(a.last.date))).slice(0, 6);
  }
  function logAgain(d, x) {
    const e0 = x.last, slot = Object.keys(x.slots).sort((a, b) => x.slots[b] - x.slots[a])[0] || e0.slot || slotNow();
    const e = Object.assign({ id: newId(d), date: U.key(d), extra: true, name: e0.name, amount: e0.amount, unit: e0.unit, slot, macros: e0.macros || null, at: new Date().toISOString() }, e0.micros ? { micros: e0.micros } : {});
    putEaten(e); Store.save(); ui.buzz(12); Opus.refresh();
    ui.toast('Added ' + e.name, { label: 'Undo', run: () => { dropEaten(e.id); Store.save(); Opus.refresh(); } });
  }

  function groceryCard(d, onChange) {
    const wk = U.key(U.weekStart(d));
    const checked = Store.data.groceries[wk] = Store.data.groceries[wk] || [];
    const groups = Plan.groceryList(d);
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    const wrap = h('<div style="display:flex;flex-direction:column;gap:12px"></div>');
    const prog = h('<div style="display:flex;align-items:center;gap:12px"><div class="bar" style="flex:1"><i></i></div><span class="small num"></span></div>');
    const upd = () => { const n = groups.reduce((m, g) => m + g.items.filter(i => checked.includes(i.item)).length, 0); prog.querySelector('i').style.width = (total ? n / total * 100 : 0) + '%'; prog.querySelector('span').textContent = n + ' of ' + total; onChange && onChange(n, total); };
    wrap.appendChild(prog);
    if (!total) wrap.appendChild(h('<p class="empty">No ingredients in this week’s meals yet.</p>'));
    groups.forEach(g => {
      const sec = h('<div class="sec"><div class="sh"><span class="t">' + U.esc(g.section) + '</span><span class="c num">' + g.items.length + '</span></div><div class="card"></div></div>');
      g.items.forEach(it => {
        const on = checked.includes(it.item), lp = Opus.receipts && Opus.receipts.lastPrice(it.item);
        const sub = [it.meals.length > 1 ? [...new Set(it.meals)].join(' · ') : null, lp ? U.money(lp.amount, { cents: true }) + ' last time' + (lp.store ? ' at ' + lp.store : '') : null].filter(Boolean).join(' · ');
        const r = h('<div class="row tap gi' + (on ? ' done' : '') + '" role="checkbox" aria-checked="' + on + '"><span class="ck sq">' + ui.CK + '</span><span class="tx"><b>' + U.esc(it.item) + '</b>' + (sub ? '<small>' + U.esc(sub) + '</small>' : '') + '</span><span class="q">' + U.esc(it.qtys.join(' + ')) + '</span></div>');
        r.onclick = () => { const i = checked.indexOf(it.item); if (i >= 0) checked.splice(i, 1); else checked.push(it.item); r.classList.toggle('done'); r.setAttribute('aria-checked', i < 0); Store.save(); ui.buzz(8); upd(); };
        sec.querySelector('.card').appendChild(r);
      });
      wrap.appendChild(sec);
    });
    const b = h('<div class="btns"><button class="btn quiet sm" type="button">Copy list</button><button class="btn quiet sm" type="button">Uncheck all</button></div>');
    b.children[0].onclick = () => ui.copy(groups.map(g => g.section.toUpperCase() + '\n' + g.items.map(i => '- ' + i.item + (i.qtys.length ? ' (' + i.qtys.join(' + ') + ')' : '')).join('\n')).join('\n\n'));
    b.children[1].onclick = () => { checked.length = 0; Store.save(); wrap.replaceWith(groceryCard(d, onChange)); };
    wrap.appendChild(b);
    const bud = (Plan.p.food || {}).budgetPerWeek || {};
    const R = Opus.receipts, rs = R ? R.weekReceipts(d) : [];
    if (rs.length) {
      const rc = h('<div class="card"></div>');
      rs.forEach(x => { const r = h('<button type="button" class="row tap"><span class="tx"><b></b><small></small></span><span class="num"></span></button>'); r.querySelector('b').textContent = x.store + ' receipt'; r.querySelector('small').textContent = U.fmtDateShort(x.date) + ' · ' + x.items.length + ' items' + (x.items.some(i => i.for) ? '' : ' · tap to tick what it bought'); r.querySelector('.num').textContent = U.money(x.total, { cents: true }); r.onclick = () => R.open(x.id, () => wrap.replaceWith(groceryCard(d, onChange))); rc.appendChild(r); });
      wrap.appendChild(rc);
    }
    if (bud.low != null || bud.high != null || R) {
      const spent = U.sum(rs.map(x => x.total || 0));
      const p = h('<div class="gi-bud"><p class="small"></p></div>');
      p.querySelector('p').textContent = (bud.low != null || bud.high != null ? 'Grocery budget: ' + U.money(bud.low) + (bud.high != null ? '–' + U.money(bud.high) : '') + ' a week.' : '') + (rs.length ? ' ' + U.money(spent, { cents: true }) + ' on receipts since Sunday.' : '');
      if (R) { const ab = h('<button class="link" type="button">Add a receipt</button>'); ab.onclick = () => R.add(() => wrap.replaceWith(groceryCard(d, onChange))); p.appendChild(ab); }
      wrap.appendChild(p);
    }
    upd();
    return wrap;
  }

  function prepCard(d) {
    const wk = U.key(U.weekStart(d));
    const done = Store.data.prep[wk] = Store.data.prep[wk] || [];
    const steps = Plan.prepSteps(d);
    const card = h('<div class="card"></div>');
    if (!steps.length) card.appendChild(h('<p class="empty">Nothing to prep this week.</p>'));
    steps.forEach(s => {
      const key = s.meal + '|' + s.text, on = done.includes(key);
      const r = h('<div class="row tap' + (on ? ' done' : '') + '"><span class="ck">' + ui.CK + '</span><span class="tx"><b>' + U.esc(s.text) + '</b><small>' + U.esc(s.meal) + '</small></span></div>');
      r.onclick = () => {
        const i = done.indexOf(key); if (i >= 0) done.splice(i, 1); else done.push(key); r.classList.toggle('done'); ui.buzz(8);
        if (done.length >= steps.length && (Plan.p.food || {}).prepDay === U.dayKey(new Date())) { Plan.setChecked(new Date(), 'food-prep', true); ui.toast('Prep done. The week is ready.'); Opus.todayRefresh && Opus.todayRefresh(); }
        Store.save();
      };
      card.appendChild(r);
    });
    return { card, count: () => done.length + ' / ' + steps.length };
  }

  function prepSheet() {
    ui.sheet({ title: 'Prep day', kicker: 'Shop, then prep', full: true, onClose: () => Opus.refresh(), render(api) {
      const d = new Date();
      api.body.appendChild(h('<div class="sh"><span class="r">I</span><span class="t">Grocery list</span></div>'));
      api.body.appendChild(groceryCard(d));
      const pc = prepCard(d);
      api.body.appendChild(h('<div class="sh"><span class="r">II</span><span class="t">Prep steps</span></div>'));
      api.body.appendChild(pc.card);
    } });
  }

  function weighIn() {
    const last = (Store.data.weights || []).slice().sort((a, b) => a.date.localeCompare(b.date)).pop();
    const g = (Plan.p.food || {}).goal || {};
    ui.sheet({ title: 'Weigh in', kicker: 'Morning, before food', render(api) {
      const today = U.key();
      const cur = (Store.data.weights || []).find(w => w.date === today);
      const st = ui.stepper({ label: 'Body weight', unit: 'lb', value: cur ? cur.lb : (last ? last.lb : g.start), step: (v, dir) => Math.round(((v || 0) + .2 * dir) * 10) / 10 });
      st.input.id = 'weigh-lb';
      api.body.appendChild(st.el);
      api.body.appendChild(h('<p class="small">Same time, same scale. The trend uses a 7-day average, so one high morning doesn’t count against you.</p>'));
      const b = h('<button class="btn block" type="button">Save</button>');
      b.onclick = () => {
        const v = st.get(); if (!v || v < 50 || v > 600) { ui.toast('Enter your weight in pounds'); return; }
        Store.data.weights = (Store.data.weights || []).filter(w => w.date !== today).concat([{ date: today, lb: v }]);
        const id = Plan.kindId('weigh'); if (id) Plan.setChecked(new Date(), id, true);
        Store.save(); api.close(); ui.toast('Logged ' + U.wt(v) + ' lb'); Opus.refresh(); Opus.todayRefresh && Opus.todayRefresh();
      };
      api.body.appendChild(b);
    } });
  }

  // "Monday to Friday" from food.days; "same meals all week" when the plan covers every day
  function planDaysLabel() {
    const ds = Plan.foodDays(); if (!ds || ds.length === 7) return 'same meals all week';
    const ix = ds.map(x => U.DAYS.indexOf(x)).sort((a, b) => a - b), run = ix.every((x, i) => !i || x === ix[i - 1] + 1);
    return run && ix.length > 2 ? 'same meals ' + U.DAY_NAMES[ix[0]] + ' to ' + U.DAY_NAMES[ix[ix.length - 1]] : 'same meals ' + ix.map(i => U.DAY_NAMES[i].slice(0, 3)).join(', ');
  }
  function render(v) {
    const d = new Date(), f = Plan.p.food || {};
    const rw = Plan.rotationWeek(d);
    v.appendChild(h('<div class="top"><div><div class="eyebrow">' + (rw ? U.esc(rw.week.name || 'Week') + ' · ' + (rw.index + 1) + ' of ' + rw.count : 'No rotation') + '</div><div class="title">Food</div></div></div>'));
    const sw = Opus.sync && Opus.sync.noticeEl && Opus.sync.noticeEl(); if (sw) v.appendChild(sw);

    // today: the planned meals, what you actually ate of them, and anything extra
    const today = Plan.itemsFor(d).filter(it => it.kind === 'meal');
    const t = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">Today</span><span class="c"></span></div><div class="mac"></div><div class="left-din" hidden><div class="ld-k">Left for dinner</div><div class="ld-v num"></div><small></small></div><div class="card"></div><p class="small mac-note" style="padding:0 4px" hidden></p></div>');
    let drawDay = () => {};
    const drawTotals = () => {
      const pl = Plan.dayMacros(d), ea = Plan.dayMacros(d, true);
      const box = t.querySelector('.mac'); box.innerHTML = '';
      if ((pl.meals && pl.missing < pl.meals) || ea.extras) {
        // no meal plan today (a day off): the big numbers are what you ate, not a plan of zeros
        const noPlan = !pl.meals || pl.missing >= pl.meals;
        box.appendChild(h(noPlan ? macroStats(ea) : macroStats(pl, ea)));
        t.querySelector('.sh .c').textContent = noPlan ? 'eaten' + (ea.estimate ? ', estimates' : '') : pl.estimate || ea.estimate ? 'estimates' : '';
      }
      const note = t.querySelector('.mac-note'), bits = [];
      const bu = Opus.whoop && Opus.whoop.burned(d); if (bu) bits.push('WHOOP: ' + bu.kcal.toLocaleString('en-US') + ' cal burned' + (bu.open ? ' so far today' : ' today') + '.');
      if (ea.extras) bits.push('Eaten includes ' + ea.extras + ' extra' + (ea.extras === 1 ? '' : 's') + (ea.unknown ? ', ' + ea.unknown + ' without macros' : '') + '.');
      note.textContent = bits.join(' '); note.hidden = !bits.length;
      // before dinner: what's left of the day's calories and protein, so the add-on fits
      const lf = Plan.leftForDinner(d), lbox = t.querySelector('.left-din');
      lbox.hidden = !(lf && !lf.dinnerDone);
      if (lf && !lf.dinnerDone) {
        const dk = lf.dinner && lf.dinner.kcal != null ? lf.dinner : null;
        lbox.querySelector('.ld-v').textContent = n0(Math.max(0, lf.kcal)) + ' cal · ' + n0(Math.max(0, lf.protein)) + ' g protein';
        const sm = [];
        if (dk) sm.push('After the planned dinner: ' + n0(Math.max(0, lf.kcal - dk.kcal)) + ' cal and ' + n0(Math.max(0, lf.protein - (dk.protein || 0))) + ' g protein for something else.');
        if (lf.assumed.length) { const a = lf.assumed.map(x => String(x).toLowerCase()), many = a.length > 1, w = a.slice(0, -1).join(', ') + (many ? ' and ' : '') + a[a.length - 1]; sm.push(w.charAt(0).toUpperCase() + w.slice(1) + (many ? ' are' : ' is') + ' counted as planned until you tick ' + (many ? 'them' : 'it') + '.'); }
        if (lf.unknown) sm.push(lf.unknown + ' item' + (lf.unknown === 1 ? ' has' : 's have') + ' no macros, so it’s not counted.');
        lbox.querySelector('small').textContent = sm.join(' '); lbox.querySelector('small').hidden = !sm.length;
      }
    };
    const card = t.querySelector('.card');
    if (!today.length && !Plan.eatenOn(d).some(e => e.extra)) card.appendChild(h('<p class="empty">' + (Plan.foodOff(d) ? 'Off day. No meal plan today, so log what you eat as you go.' : 'No meals planned today.') + '</p>'));
    const mealRow = it => {
      const on = Plan.isChecked(d, it.id), ml = macroLine(it.meal), el = on ? eatenLine(d, it) : null, sk = !on && Plan.eatenEntry(d, it.id) && Plan.eatenEntry(d, it.id).skipped;
      const r = h('<div class="row tap fd-row' + (on ? ' done' : '') + (el ? ' part' : '') + (sk ? ' skip' : '') + '"><span class="ck" role="checkbox" aria-checked="' + on + '" aria-label="Eaten">' + ui.CK + '</span><span class="tx"><b>' + U.esc(it.meal.name) + '</b><small class="num">' + U.esc(el || (sk ? 'Skipped' : ml || it.meal.how || '')) + '</small></span><span class="tm num">' + U.fmtTime(it.time) + '</span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.onclick = e => {
        if (!e.target.closest('.ck')) { eatSheet(d, it); return; }
        const n = !Plan.isChecked(d, it.id); Plan.setChecked(d, it.id, n);
        const en = Plan.eatenEntry(d, it.id); if (n && en && en.skipped) dropEaten(en.id);
        Store.save(); ui.buzz(10); drawDay(); drawTotals(); Opus.todayRefresh && Opus.todayRefresh();
      };
      return r;
    };
    drawDay = () => {
      card.querySelectorAll('.fd-g').forEach(x => x.remove());
      // one group a meal: the planned meal, then what you added, with the same food in one row
      const groups = {}, order = SLOT_KEYS.slice(), g = k => (groups[k] = groups[k] || { meals: [], foods: new Map(), last: '' });
      for (const it of today) { const k = SLOTS[it.slot] ? it.slot : 'other'; g(k).meals.push(it); if (!order.includes(k)) order.push(k); }
      const extras = Plan.eatenOn(d).filter(e => e.extra).sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
      for (const e of extras) {
        const k = SLOTS[e.slot] ? e.slot : 'other', gr = g(k), key = String(e.name || '').trim().toLowerCase();
        if (!order.includes(k)) order.push(k);
        (gr.foods.get(key) || gr.foods.set(key, []).get(key)).push(e);
        if (String(e.at || '') > gr.last) gr.last = String(e.at || '');
      }
      const has = order.filter(k => groups[k] && (groups[k].meals.length || groups[k].foods.size));
      if (!has.length) return;
      // the meal you're on stays open; earlier ones fold to one line once they're done
      const cur = slotNow(), latest = has.slice().sort((a, b) => (groups[b].last || '').localeCompare(groups[a].last || ''))[0];
      for (const k of has) {
        const gr = groups[k], tot = { kcal: 0, protein: 0 }, names = [];
        let none = 0, planned = 0;
        for (const it of gr.meals) {
          names.push(it.meal.name);
          if (!Plan.isChecked(d, it.id)) { const x = Plan.macros(it.meal); if (x && x.kcal != null) planned += x.kcal; continue; }
          const en = Plan.eatenEntry(d, it.id), x = en && !en.skipped && en.macros ? en.macros : Plan.macros(it.meal);
          if (x && x.kcal != null) { tot.kcal += x.kcal; tot.protein += Number(x.protein) || 0; } else none++;
        }
        for (const es of gr.foods.values()) { names.push(es[0].name); for (const e of es) { if (e.macros && e.macros.kcal != null) { tot.kcal += e.macros.kcal; tot.protein += Number(e.macros.protein) || 0; } else none++; } }
        const count = gr.meals.length + gr.foods.size, ate = tot.kcal > 0;
        const open = OPEN[U.key(d) + k] != null ? OPEN[U.key(d) + k] : (k === cur || k === latest || count <= 2);
        const wrap = h('<div class="fd-g' + (open ? ' open' : '') + '"><button class="fd-gh" type="button" aria-expanded="' + open + '"><span class="k">' + U.esc(SLOTS[k] || 'Other') + '</span>' + (k === cur ? '<span class="tag">Now</span>' : '') +
          '<span class="v num">' + (ate ? n0(tot.kcal) + ' cal · ' + n0(tot.protein) + ' P' : planned ? n0(planned) + ' cal planned' : '') + '</span>' + ui.icon('chev', 'ico fd-cv') + '</button>' +
          '<div class="fd-sum"></div><div class="fd-b"></div></div>');
        wrap.querySelector('.fd-sum').textContent = names.join(' · ');
        wrap.querySelector('.fd-gh').onclick = () => { const o = !wrap.classList.contains('open'); OPEN[U.key(d) + k] = o; wrap.classList.toggle('open', o); wrap.querySelector('.fd-gh').setAttribute('aria-expanded', o); ui.buzz(4); };
        const body = wrap.querySelector('.fd-b');
        gr.meals.forEach(it => body.appendChild(mealRow(it)));
        for (const es of gr.foods.values()) body.appendChild(foodRow(es));
        card.appendChild(wrap);
      }
    };
    // one food, however many times you logged it in this meal
    const foodRow = es => {
      const e0 = es[0], n = es.length, kc = es.reduce((s, e) => s + (e.macros && e.macros.kcal != null ? e.macros.kcal : 0), 0), anyKc = es.some(e => e.macros && e.macros.kcal != null);
      const same = es.every(e => unitName(e.unit) === unitName(e0.unit));
      const total = same ? niceAmount(es.reduce((s, e) => s + (Number(e.amount) || 0), 0), e0.unit) : es.map(e => niceAmount(e.amount, e.unit)).join(' + ');
      const bits = [total, anyKc ? n0(kc) + ' cal' : 'no macros', es.some(e => e.by === 'grok') ? 'from Grok' : ''].filter(Boolean);
      const r = h('<div class="row tap fd-row extra"><span class="fd-n' + (n > 1 ? ' many' : '') + '">' + (n > 1 ? '×' + n : '') + '</span><span class="tx"><b></b><small class="num"></small></span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.querySelector('b').textContent = e0.name; r.querySelector('small').textContent = bits.join(' · ');
      if (n > 1) r.querySelector('.fd-n').setAttribute('aria-label', 'Logged ' + n + ' times');
      r.onclick = () => n === 1 ? addFood(d, { entry: e0 }) : timesSheet(es);
      return r;
    };
    // tap a food you logged more than once: each time, to change or take out one of them
    const timesSheet = es => ui.sheet({ title: es[0].name, kicker: (SLOTS[es[0].slot] || 'Food') + ' · ' + es.length + ' times', render(api) {
      const c = h('<div class="card"></div>');
      es.forEach(e => {
        const t0 = e.at ? new Date(e.at) : null, tm = t0 && !isNaN(t0) ? U.fmtTimeAP(U.pad(t0.getHours()) + ':' + U.pad(t0.getMinutes())) : '';
        const r = h('<div class="row tap"><span class="tx"><b></b><small class="num"></small></span><span class="tm num"></span>' + ui.icon('chev', 'chev ico') + '</div>');
        r.querySelector('b').textContent = niceAmount(e.amount, e.unit) || '1'; r.querySelector('small').textContent = kcal(e.macros) || 'no macros'; r.querySelector('.tm').textContent = tm;
        r.onclick = () => { api.close(); addFood(d, { entry: e }); };
        c.appendChild(r);
      });
      api.body.appendChild(c);
      const b = h('<div class="btns"><button class="btn ghost" type="button">Log one more</button></div>');
      b.firstChild.onclick = () => { const e0 = es[es.length - 1]; api.close(); logAgain(d, { last: e0, slots: { [e0.slot]: 1 } }); };
      api.body.appendChild(b);
    } });
    drawDay();
    const again = againPicks(d);
    if (again.length) {
      const ag = h('<div class="again"><div class="again-k">Again</div><div class="chips"></div></div>');
      again.forEach(x => {
        const ch = h('<button class="chip" type="button"><span></span><small class="num"></small></button>');
        ch.querySelector('span').textContent = x.last.name;
        ch.querySelector('small').textContent = kcal(x.last.macros);
        ch.setAttribute('aria-label', 'Log ' + x.last.name + ' again');
        ch.onclick = () => logAgain(d, x);
        ag.querySelector('.chips').appendChild(ch);
      });
      t.appendChild(ag);
    }
    const add = h('<button class="btn ghost add-food" type="button">' + ui.icon('plus', 'ico') + ' Add food</button>');
    add.onclick = () => addFood(d);
    if (Opus.snap) {
      const wait = Opus.snap.pendingCard(d); if (wait) t.appendChild(wait);
      const ways = h('<div class="add-ways"></div>'); ways.appendChild(add); ways.appendChild(Opus.snap.buttons(d)); t.appendChild(ways);
    } else t.appendChild(add);
    drawTotals();
    if (today.length) t.appendChild(h('<p class="small" style="padding:0 4px">Tick the circle when you eat a meal as planned. Tap it if you ate only part, more or less, or skipped it.</p>'));
    v.appendChild(t);

    // this week and next
    const wkSec = h('<div class="sec"><div class="sh"><span class="r">VI</span><span class="t">The rotation</span><span class="c">' + U.esc(planDaysLabel()) + '</span></div><div class="card"></div></div>');
    const nextW = Plan.rotationWeek(U.addDays(U.weekStart(d), 7));
    const meals = Plan.weekMeals(d), nmeals = Plan.weekMeals(U.addDays(U.weekStart(d), 7));
    meals.forEach(m => {
      const n = nmeals.find(x => x.slotKey === m.slotKey), ml = macroLine(m);
      const r = h('<div class="row tap" style="align-items:flex-start"><span class="tag" style="min-width:74px;padding-top:3px">' + (SLOTS[m.slotKey] || m.slotKey) + '</span><span class="tx"><b>' + U.esc(m.name) + '</b>' + (ml ? '<small class="num">' + ml + '</small>' : '') + (n && nextW && nextW.index !== rw.index ? '<small>Next week: ' + U.esc(n.name) + '</small>' : '') + '</span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.onclick = () => mealSheet(m.id);
      wkSec.querySelector('.card').appendChild(r);
    });
    { // one day of this week's meals, all in
      const sum = { kcal: 0, protein: 0 }; let any = false, est = false;
      meals.forEach(m => { const x = Plan.macros(m); if (x && x.kcal != null) { any = true; if (x.estimate) est = true; sum.kcal += x.kcal; sum.protein += x.protein || 0; } });
      if (any) wkSec.appendChild(h('<p class="small num" style="padding:0 4px">A day of this week’s meals is about ' + n0(sum.kcal) + ' calories and ' + n0(sum.protein) + ' g protein' + (est ? ' (estimates)' : '') + '.</p>'));
    }
    if (Opus.supps) Opus.supps.section(v, 'II');

    // prep
    const pc = prepCard(d);
    const pSec = h('<div class="sec"><div class="sh"><span class="r">III</span><span class="t">' + (f.prepDay ? U.DAY_NAMES[U.DAYS.indexOf(f.prepDay)] + ' prep' : 'Prep') + '</span><span class="c num">' + pc.count() + '</span></div></div>');
    pSec.appendChild(pc.card); v.appendChild(pSec);

    // groceries, with a week switch
    const prepIdx = U.DAYS.indexOf(f.prepDay || 'sun');
    let which = d.getDay() > prepIdx && d.getDay() >= 5 ? 'next' : 'this';
    const gSec = h('<div class="sec"><div class="sh"><span class="r">IV</span><span class="t">Grocery list</span></div><div class="chips" style="padding:0 4px 4px"><button class="chip" data-w="this" type="button">This week</button><button class="chip" data-w="next" type="button">Next week</button></div><div class="gl"></div></div>');
    const draw = () => {
      gSec.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.w === which));
      const gd = which === 'this' ? d : U.addDays(U.weekStart(d), 7);
      const box = gSec.querySelector('.gl'); box.innerHTML = ''; box.appendChild(groceryCard(gd));
    };
    gSec.querySelectorAll('.chip').forEach(c => c.onclick = () => { which = c.dataset.w; draw(); });
    draw(); v.appendChild(gSec);

    // weigh-ins live on Body now
    { const r = h('<div class="row tap bd-moved"><span class="tx"><b>Weigh-ins</b><small>On Body now, with your trend and goal</small></span>' + ui.icon('chev', 'chev ico') + '</div>'); r.onclick = () => Opus.go('train'); const c = h('<div class="sec"><div class="card"></div></div>'); c.querySelector('.card').appendChild(r); v.appendChild(c); }

    if (Opus.body) Opus.body.section(v, 'V');
    v.appendChild(wkSec);

    if ((f.rules || []).length) {
      const r = h('<div class="sec"><div class="sh"><span class="r">VII</span><span class="t">House rules</span></div><div class="card"></div></div>');
      f.rules.forEach(x => r.querySelector('.card').appendChild(h('<div class="row"><span class="tx"><small style="font-size:13.5px;color:var(--ink-2)">' + U.esc(x) + '</small></span></div>')));
      v.appendChild(r);
    }
  }

  Opus.food = { againPicks, logAgain, weighIn, prepSheet, groceryCard, mealSheet, eatSheet, addFood, eatenLine };
  Opus.tab({ id: 'food', title: 'Food', icon: 'food', render });
})();
