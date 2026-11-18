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
        if ((m.ingredients || []).length) {
          const c = h('<div class="sec"><div class="sh"><span class="r">II</span><span class="t">Ingredients</span><span class="c">for the week</span></div><div class="card"></div></div>');
          m.ingredients.forEach(g => c.querySelector('.card').appendChild(h('<div class="row gi"><span class="tx"><b>' + U.esc(g.item) + '</b></span><span class="q">' + U.esc(g.qty || '') + '</span></div>')));
          b.appendChild(c);
        }
        if ((m.prep || []).length) {
          const c = h('<div class="sec"><div class="sh"><span class="r">III</span><span class="t">Prep</span></div><div class="card"></div></div>');
          m.prep.forEach((t, i) => c.querySelector('.card').appendChild(h('<div class="row"><span class="tag" style="min-width:22px">' + U.roman(i + 1) + '</span><span class="tx"><b style="font-weight:400">' + U.esc(t) + '</b></span></div>')));
          b.appendChild(c);
        }
      };
      const edit = () => {
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

    // today
    const today = Plan.itemsFor(d).filter(it => it.kind === 'meal');
    const t = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">Today</span><span class="c"></span></div><div class="mac"></div><div class="card"></div></div>');
    const drawTotals = () => {
      const pl = Plan.dayMacros(d), ea = Plan.dayMacros(d, true);
      const box = t.querySelector('.mac'); box.innerHTML = '';
      if (pl.meals && pl.missing < pl.meals) {
        box.appendChild(h(macroStats(pl, ea)));
        t.querySelector('.sh .c').textContent = pl.estimate ? 'estimates' : '';
      }
    };
    if (!today.length) t.querySelector('.card').appendChild(h('<p class="empty">No meals planned today.</p>'));
    today.forEach(it => {
      const on = Plan.isChecked(d, it.id), ml = macroLine(it.meal);
      const r = h('<div class="row tap' + (on ? ' done' : '') + '"><span class="ck" role="checkbox" aria-checked="' + on + '" aria-label="Eaten">' + ui.CK + '</span><span class="tx"><b>' + U.esc(it.meal.name) + '</b><small class="num">' + U.esc(ml || it.meal.how || '') + '</small></span><span class="tm num">' + U.fmtTime(it.time) + '</span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.onclick = e => {
        if (!e.target.closest('.ck')) { mealSheet(it.meal.id); return; }
        const n = !Plan.isChecked(d, it.id); Plan.setChecked(d, it.id, n); r.classList.toggle('done', n); r.querySelector('.ck').setAttribute('aria-checked', n); ui.buzz(10); drawTotals();
      };
      t.querySelector('.card').appendChild(r);
    });
    drawTotals();
    if (today.length) t.appendChild(h('<p class="small" style="padding:0 4px">Tick the circle when you eat it. Tap a meal for its macros and ingredients.</p>'));
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

  Opus.food = { weighIn, prepSheet, groceryCard, mealSheet };
  Opus.tab({ id: 'food', title: 'Food', icon: 'food', render });
})();
