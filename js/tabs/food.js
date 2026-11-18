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
        const ed = h('<button class="btn ghost" type="button">Edit macros</button>'); ed.onclick = edit; b.appendChild(ed);
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


  /* ---------- what you actually ate ---------- */
  const SLOT_KEYS = ['breakfast', 'lunch', 'snack', 'dinner'];
  const slotNow = () => { const t = new Date(), m = t.getHours() * 60 + t.getMinutes(); return m < 630 ? 'breakfast' : m < 870 ? 'lunch' : m < 1050 ? 'snack' : 'dinner'; };
  const isWeight = u => /^(g|ml|kg|oz|lb)$/i.test(u || '');
  const stepFor = (amount, unit) => /^(g|ml)$/i.test(unit || '') ? (amount >= 100 ? 10 : 5) : /^(oz|lb|kg|cups?|tbsp|tsp)$/i.test(unit || '') ? .5 : (amount >= 2 ? 1 : .5);
  const amt = (n, unit, name) => { const v = U.wt(n); return isWeight(unit) ? v + ' ' + unit + (name ? ' ' + name : '') : (v + (unit ? ' ' + unit : '') + (name ? ' ' + name : '')); };
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

  /* Anything you ate that wasn't in the plan: a yogurt cup, a coffee, a second banana. */
  function addFood(d, o) {
    o = o || {};
    const ed = o.entry || null;
    const lib = Plan.library();
    const recent = []; const seen = new Set(lib.map(x => String(x.name).toLowerCase()));
    (Store.data.eaten || []).filter(e => e.extra && e.name).sort((a, b) => String(b.at || b.date).localeCompare(String(a.at || a.date))).forEach(e => { const k = e.name.toLowerCase(); if (!seen.has(k) && recent.length < 6) { seen.add(k); recent.push(e); } });
    const picks = lib.map(x => Object.assign({ from: 'lib' }, x)).concat(recent.map(x => ({ name: x.name, amount: x.amount, unit: x.unit, macros: x.macros, from: 'recent' })));
    let slot = ed ? ed.slot || slotNow() : o.slot || slotNow(), base = null, touched = false;
    ui.sheet({ title: ed ? ed.name : 'Add food', kicker: ed ? 'Something extra' : 'Not in the plan', foot: true, onClose: () => { o.after && o.after(); Opus.refresh(); }, render(api) {
      const b = api.body;
      if (picks.length && !ed) {
        const c = h('<div class="sec"><div class="sh"><span class="t">Your foods</span><span class="c">tap to fill in</span></div><div class="chips"></div></div>');
        picks.slice(0, 14).forEach(x => { const ch = h('<button class="chip" type="button">' + U.esc(x.name) + '</button>'); ch.onclick = () => { fill(x); c.querySelectorAll('.chip').forEach(y => y.classList.remove('on')); ch.classList.add('on'); ui.buzz(6); }; c.querySelector('.chips').appendChild(ch); });
        b.appendChild(c);
      }
      const nm = h('<div class="field"><label for="af-name">What was it</label><input class="input" id="af-name" placeholder="Yogurt cup" autocomplete="off"></div>');
      b.appendChild(nm);
      const ar = h('<div class="grid2 af-amt"><div class="field"><label>Amount</label></div><div class="field"><label for="af-unit">Unit</label><input class="input" id="af-unit" placeholder="cup, g, bar" autocomplete="off"></div></div>');
      const st = ui.stepper({ label: 'Amount', value: 1, step: (v, dir) => Math.max(0, Math.round(((v || 0) + stepFor(v || 1, b.querySelector('#af-unit').value) * dir) * 100) / 100), onChange: () => scale() });
      ar.children[0].appendChild(st.el); b.appendChild(ar);
      const sl = h('<div class="sec"><div class="sh"><span class="t">With</span></div><div class="chips"></div></div>');
      SLOT_KEYS.forEach(k => { const ch = h('<button class="chip" type="button" data-s="' + k + '">' + SLOTS[k] + '</button>'); ch.onclick = () => { slot = k; drawSlot(); }; sl.querySelector('.chips').appendChild(ch); });
      const drawSlot = () => sl.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.s === slot));
      b.appendChild(sl);
      const mg = h('<div class="sec"><div class="sh"><span class="t">Macros</span><span class="c">for this amount, if you know them</span></div><div class="grid2"></div></div>');
      MK.forEach(([k, lbl, u]) => { const f = h('<div class="field"><label for="af-' + k + '">' + lbl + (u ? ' (g)' : '') + '</label><input class="input num" id="af-' + k + '" inputmode="decimal"></div>'); f.querySelector('input').addEventListener('input', () => { touched = true; }); mg.querySelector('.grid2').appendChild(f); });
      b.appendChild(mg);
      const keep = h('<button class="row tap tgb" type="button" style="width:100%;text-align:left"><span class="ck sq">' + ui.CK + '</span><span class="tx"><b>Keep in my foods</b><small>One tap next time. Grok can see and edit your foods too.</small></span></button>');
      let keepOn = false; keep.onclick = () => { keepOn = !keepOn; keep.classList.toggle('on', keepOn); };
      if (!ed) b.appendChild(keep);
      b.appendChild(h('<p class="small" style="padding:0 4px">No numbers? It still counts as eaten, and the day’s totals note it.</p>'));
      const inp = k => b.querySelector('#af-' + k);
      const setMac = x => MK.forEach(([k]) => { inp(k).value = x && x[k] != null ? U.wt(x[k]) : ''; });
      function fill(x) {
        inp('name').value = x.name || ''; inp('unit').value = x.unit || ''; st.set(x.amount == null ? 1 : x.amount, true);
        base = x.macros ? { amount: x.amount == null ? 1 : Number(x.amount), macros: x.macros } : null; touched = false; setMac(x.macros);
        keepOn = false; keep.classList.remove('on'); keep.hidden = x.from === 'lib';
      }
      function scale() { if (!base || touched || !base.amount) return; setMac(Plan.scaleMacros(base.macros, (st.get() || 0) / base.amount)); }
      const readMac = () => { const o2 = { estimate: true }; let any = false; for (const [k] of MK) { const raw = inp(k).value.trim(); if (raw === '') { o2[k] = null; continue; } const v = Number(raw.replace(',', '.')); if (!(v >= 0)) return false; o2[k] = v; any = true; } if (base && !touched) o2.estimate = base.macros.estimate !== false; else if (any) o2.estimate = false; return any ? o2 : null; };
      if (ed) { fill({ name: ed.name, amount: ed.amount, unit: ed.unit, macros: ed.macros }); base = null; }
      drawSlot();
      const ft = h('<div class="btns">' + (ed ? '<button class="btn quiet" type="button">Remove</button>' : '') + '<button class="btn" type="button">' + (ed ? 'Save' : 'Add') + '</button></div>');
      api.foot.appendChild(ft);
      if (ed) ft.children[0].onclick = () => {
        const gone = dropEaten(ed.id); Store.save(); api.close();
        ui.toast('Removed ' + ed.name, { label: 'Undo', run: () => { if (gone) { const dl = (Store.data.deleted || {}).eaten || {}; delete dl[gone.id]; gone.at = new Date().toISOString(); putEaten(gone); Store.save(); Opus.refresh(); } } });
      };
      ft.lastElementChild.onclick = () => {
        const name = inp('name').value.trim(); if (!name) { ui.toast('What did you eat?'); inp('name').focus(); return; }
        const amount = st.get(); if (!(amount > 0)) { ui.toast('Enter an amount'); return; }
        const macros = readMac(); if (macros === false) { ui.toast('Macros: numbers only'); return; }
        const unit = inp('unit').value.trim();
        const e = { id: ed ? ed.id : newId(d), date: ed ? ed.date : U.key(d), extra: true, name, amount, unit, slot, macros, at: new Date().toISOString() };
        putEaten(e);
        if (keepOn) {
          const f = Plan.p.food = Plan.p.food || {}; f.library = Array.isArray(f.library) ? f.library : [];
          const i = f.library.findIndex(x => String(x.name).toLowerCase() === name.toLowerCase());
          const item = { name, amount, unit, macros }; if (i >= 0) f.library[i] = item; else f.library.push(item);
          Plan.p.updated = U.key();
        }
        Store.save(); ui.buzz(12); api.close(); ui.toast(ed ? 'Saved' : 'Added ' + name + (keepOn ? ', and kept in your foods' : ''));
      };
      if (!ed) setTimeout(() => { if (!picks.length) inp('name').focus(); }, 350);
    } });
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
        const on = checked.includes(it.item);
        const r = h('<div class="row tap gi' + (on ? ' done' : '') + '" role="checkbox" aria-checked="' + on + '"><span class="ck sq">' + ui.CK + '</span><span class="tx"><b>' + U.esc(it.item) + '</b>' + (it.meals.length > 1 ? '<small>' + U.esc([...new Set(it.meals)].join(' · ')) + '</small>' : '') + '</span><span class="q">' + U.esc(it.qtys.join(' + ')) + '</span></div>');
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
    if (bud.low != null || bud.high != null) wrap.appendChild(h('<p class="small">Grocery budget: ' + U.money(bud.low) + (bud.high != null ? '–' + U.money(bud.high) : '') + ' a week.</p>'));
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

  function render(v) {
    const d = new Date(), f = Plan.p.food || {};
    const rw = Plan.rotationWeek(d);
    v.appendChild(h('<div class="top"><div><div class="eyebrow">' + (rw ? U.esc(rw.week.name || 'Week') + ' · ' + (rw.index + 1) + ' of ' + rw.count : 'No rotation') + '</div><div class="title">Food</div></div></div>'));

    // today: the planned meals, what you actually ate of them, and anything extra
    const today = Plan.itemsFor(d).filter(it => it.kind === 'meal');
    const t = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">Today</span><span class="c"></span></div><div class="mac"></div><div class="card"></div><p class="small mac-note" style="padding:0 4px" hidden></p></div>');
    const drawTotals = () => {
      const pl = Plan.dayMacros(d), ea = Plan.dayMacros(d, true);
      const box = t.querySelector('.mac'); box.innerHTML = '';
      if ((pl.meals && pl.missing < pl.meals) || ea.extras) {
        box.appendChild(h(macroStats(pl, ea)));
        t.querySelector('.sh .c').textContent = pl.estimate || ea.estimate ? 'estimates' : '';
      }
      const note = t.querySelector('.mac-note'), bits = [];
      if (ea.extras) bits.push('Eaten includes ' + ea.extras + ' extra' + (ea.extras === 1 ? '' : 's') + (ea.unknown ? ', ' + ea.unknown + ' without macros' : '') + '.');
      note.textContent = bits.join(' '); note.hidden = !bits.length;
    };
    const card = t.querySelector('.card');
    if (!today.length) card.appendChild(h('<p class="empty">No meals planned today.</p>'));
    today.forEach(it => {
      const on = Plan.isChecked(d, it.id), ml = macroLine(it.meal), el = on ? eatenLine(d, it) : null, sk = !on && Plan.eatenEntry(d, it.id) && Plan.eatenEntry(d, it.id).skipped;
      const r = h('<div class="row tap' + (on ? ' done' : '') + (el ? ' part' : '') + (sk ? ' skip' : '') + '"><span class="ck" role="checkbox" aria-checked="' + on + '" aria-label="Eaten">' + ui.CK + '</span><span class="tx"><b>' + U.esc(it.meal.name) + '</b><small class="num">' + U.esc(el || (sk ? 'Skipped' : ml || it.meal.how || '')) + '</small></span><span class="tm num">' + U.fmtTime(it.time) + '</span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.onclick = e => {
        if (!e.target.closest('.ck')) { eatSheet(d, it); return; }
        const n = !Plan.isChecked(d, it.id); Plan.setChecked(d, it.id, n);
        const en = Plan.eatenEntry(d, it.id); if (n && en && en.skipped) dropEaten(en.id);
        Store.save(); r.classList.toggle('done', n); r.querySelector('.ck').setAttribute('aria-checked', n); ui.buzz(10);
        const l2 = n ? eatenLine(d, it) : null; r.classList.toggle('part', !!l2); r.classList.remove('skip');
        r.querySelector('small').textContent = l2 || ml || it.meal.how || ''; drawTotals();
      };
      card.appendChild(r);
    });
    const extras = Plan.eatenOn(d).filter(e => e.extra).sort((a, b) => SLOT_KEYS.indexOf(a.slot) - SLOT_KEYS.indexOf(b.slot) || String(a.at).localeCompare(String(b.at)));
    extras.forEach(e => {
      const r = h('<div class="row tap extra"><span class="plus-dot">' + ui.icon('plus') + '</span><span class="tx"><b>' + U.esc(e.name) + '</b><small class="num">' + U.esc([amt(e.amount, e.unit), kcal(e.macros) || 'no macros', e.by === 'grok' ? 'from Grok' : ''].filter(Boolean).join(' · ')) + '</small></span><span class="tm">' + U.esc(SLOTS[e.slot] || '') + '</span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.onclick = () => addFood(d, { entry: e });
      card.appendChild(r);
    });
    const add = h('<button class="btn ghost add-food" type="button">' + ui.icon('plus', 'ico') + ' Add food</button>');
    add.onclick = () => addFood(d);
    t.appendChild(add);
    drawTotals();
    if (today.length) t.appendChild(h('<p class="small" style="padding:0 4px">Tick the circle when you eat a meal as planned. Tap it if you ate only part, more or less, or skipped it.</p>'));
    v.appendChild(t);

    // this week and next
    const wkSec = h('<div class="sec"><div class="sh"><span class="r">II</span><span class="t">The rotation</span><span class="c">same meals all week</span></div><div class="card"></div></div>');
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
    v.appendChild(wkSec);

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

    // weight
    const ws = (Store.data.weights || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const g = f.goal || {};
    const wSec = h('<div class="sec"><div class="sh"><span class="r">V</span><span class="t">Body weight</span><span class="c">' + (g.target ? 'goal ' + g.target + ' lb' : '') + '</span></div><div class="card pad" style="display:flex;flex-direction:column;gap:12px"></div></div>');
    const wc = wSec.querySelector('.card');
    const last = ws[ws.length - 1];
    const recent = ws.filter(w => U.daysBetween(U.parseKey(w.date), d) < 7);
    const avg7 = recent.length ? U.avg(recent.map(w => w.lb)) : null;
    wc.appendChild(h('<div class="stats"><div class="stat"><span class="v">' + (last ? U.wt(last.lb) : '—') + '</span><span class="k">Last</span></div><div class="stat"><span class="v">' + (avg7 ? U.wt(avg7) : '—') + '</span><span class="k">7-day avg</span></div><div class="stat"><span class="v">' + (g.target && (avg7 || last) ? U.wt((avg7 || last.lb) - g.target) : '—') + '</span><span class="k">To go</span></div></div>'));
    if (g.start && g.target && (avg7 || last)) {
      const pct = U.clamp((g.start - (avg7 || last.lb)) / (g.start - g.target), 0, 1);
      wc.appendChild(h('<div style="display:flex;flex-direction:column;gap:6px"><div class="bar"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></div><div class="small num" style="display:flex;justify-content:space-between"><span>' + g.start + ' start</span><span>' + Math.round(pct * 100) + '%</span><span>' + g.target + ' goal</span></div></div>'));
    }
    if (ws.length > 1) wc.appendChild(ui.chart(ws.slice(-60).map(w => ({ date: w.date, v: w.lb })), { h: 100, target: g.target, fmt: x => U.wt(x) }));
    const lb = h('<button class="btn ghost" type="button">Log weight</button>'); lb.onclick = weighIn; wc.appendChild(lb);
    v.appendChild(wSec);

    if ((f.rules || []).length) {
      const r = h('<div class="sec"><div class="sh"><span class="r">VI</span><span class="t">House rules</span></div><div class="card"></div></div>');
      f.rules.forEach(x => r.querySelector('.card').appendChild(h('<div class="row"><span class="tx"><small style="font-size:13.5px;color:var(--ink-2)">' + U.esc(x) + '</small></span></div>')));
      v.appendChild(r);
    }
  }

  Opus.food = { weighIn, prepSheet, groceryCard, mealSheet, eatSheet, addFood, eatenLine };
  Opus.tab({ id: 'food', title: 'Food', icon: 'food', render });
})();
