/* Body: vitamins and minerals estimated from what you logged in Food, and your blood test results.
   Estimates come only from foods with nutrient numbers; anything without them is named, never guessed.
   Blood results keep the lab's own range as printed. Opus never diagnoses: a result outside the lab's
   range only says it's worth raising with your doctor. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;

  // key, name, unit, true = a limit to stay under rather than an amount to reach
  const NUT = [
    ['fiber', 'Fiber', 'g'], ['sodium', 'Sodium', 'mg', true], ['potassium', 'Potassium', 'mg'], ['calcium', 'Calcium', 'mg'],
    ['iron', 'Iron', 'mg'], ['magnesium', 'Magnesium', 'mg'], ['zinc', 'Zinc', 'mg'], ['vitA', 'Vitamin A', 'µg'],
    ['vitC', 'Vitamin C', 'mg'], ['vitD', 'Vitamin D', 'µg'], ['vitK', 'Vitamin K', 'µg'], ['b12', 'Vitamin B12', 'µg'], ['folate', 'Folate', 'µg']
  ];
  /* daily amounts from the US Dietary Reference Intakes (RDA or AI; sodium is the upper limit to stay under) */
  const base = { sodium: 2300, calcium: 1000, vitD: 15, b12: 2.4, folate: 400 };
  const REF = {
    'men-19-30': Object.assign({ label: 'Men 19–30', vitK: 120, fiber: 38, potassium: 3400, iron: 8, magnesium: 400, zinc: 11, vitA: 900, vitC: 90 }, base),
    'men-31-50': Object.assign({ label: 'Men 31–50', vitK: 120, fiber: 38, potassium: 3400, iron: 8, magnesium: 420, zinc: 11, vitA: 900, vitC: 90 }, base),
    'women-19-30': Object.assign({ label: 'Women 19–30', vitK: 90, fiber: 25, potassium: 2600, iron: 18, magnesium: 310, zinc: 8, vitA: 700, vitC: 75 }, base),
    'women-31-50': Object.assign({ label: 'Women 31–50', vitK: 90, fiber: 25, potassium: 2600, iron: 18, magnesium: 320, zinc: 8, vitA: 700, vitC: 75 }, base)
  };
  /* blood markers that speak to a nutrient (shown beside the estimate; different measures, never converted) */
  const LINK = { vitD: /vitamin d|25-?oh|calcidiol/i, b12: /b-?12|cobalamin/i, folate: /folate|folic/i, iron: /^iron\b|ferritin|serum iron/i,
    magnesium: /magnesium/i, calcium: /^calcium/i, potassium: /potassium/i, sodium: /sodium/i, zinc: /zinc/i };
  const COMMON = [['Vitamin D, 25-OH', 'ng/mL'], ['Vitamin B12', 'pg/mL'], ['Ferritin', 'ng/mL'], ['Iron', 'µg/dL'], ['Folate', 'ng/mL'], ['Magnesium', 'mg/dL'],
    ['Hemoglobin', 'g/dL'], ['Glucose', 'mg/dL'], ['Hemoglobin A1c', '%'], ['Total cholesterol', 'mg/dL'], ['LDL', 'mg/dL'], ['HDL', 'mg/dL'],
    ['Triglycerides', 'mg/dL'], ['TSH', 'mIU/L'], ['Testosterone, total', 'ng/dL'], ['Creatinine', 'mg/dL'], ['ALT', 'U/L']];

  const fmt = (v, u) => { if (v == null) return '—'; const r = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100; return r.toLocaleString('en-US') + (u ? ' ' + u : ''); };
  const health = () => (Plan.p.health = Plan.p.health && typeof Plan.p.health === 'object' ? Plan.p.health : {});
  const refKey = () => (Plan.p.health || {}).reference || null;
  const ref = () => REF[refKey()] || null;
  const micros = o => (o && o.micros) || null;

  /* ---------- estimates ----------
     Food and supplements are counted apart and shown apart: food from the micros of what was eaten,
     supplements from each one's amount per dose (Opus.supps.nutrientsOf) on the days it was ticked. */
  const zero = () => { const o = {}; for (const [k] of NUT) o[k] = 0; return o; };
  function daySupps(d) {
    const s = zero(), counted = [], unknown = []; let n = 0;
    const S = Opus.supps; if (!S) return { s, counted, unknown, n };
    for (const sp of S.list()) {
      if (!S.taken(d, sp.id)) continue;
      const r = S.nutrientsOf(sp);
      if (r.amounts) { n++; counted.push(sp); for (const k in r.amounts) if (k in s && r.amounts[k] != null) s[k] += Number(r.amounts[k]); }
      else if (r.why === 'nodose') unknown.push(sp);
    }
    return { s, counted, unknown, n };
  }
  function dayMicros(d) {
    const v = zero(), missing = new Set(); let foods = 0;
    const add = (m, f) => { for (const [k] of NUT) if (m[k] != null && m[k] !== '') v[k] += Number(m[k]) * f; };
    for (const it of Plan.itemsFor(d)) {
      if (it.kind !== 'meal' || !it.meal || !Plan.isChecked(d, it.id)) continue;
      const e = Plan.eatenEntry(d, it.id), use = e && !e.skipped ? e : null;
      const parts = Plan.partsOf(it.meal);
      if (!parts.length) { foods++; missing.add(it.meal.name); continue; }
      for (const p of parts) {
        const got = use ? ((use.parts || []).find(q => q.name === p.name) || { ate: p.amount }).ate : p.amount;
        if (!got) continue;
        foods++;
        if (!p.micros) { missing.add(parts.length > 1 ? it.meal.name + ': ' + p.name : it.meal.name); continue; }
        add(p.micros, p.amount ? got / p.amount : 1);
      }
    }
    for (const e of Plan.eatenOn(d)) if (e.extra) { foods++; if (e.micros) add(e.micros, 1); else missing.add(e.name); }
    const sp = daySupps(d), tot = {};
    for (const [k] of NUT) tot[k] = v[k] + sp.s[k];
    return { v: tot, food: v, supp: sp.s, missing: [...missing], foods, supps: sp.n, counted: sp.counted, unknown: sp.unknown };
  }
  /* the days before today that have anything logged (up to 7); today alone when none.
     Food averages over the days with food logged, supplements over the days any was ticked; the total is the two added. */
  function estimate(which) {
    const today = new Date();
    const one = d => { const r = dayMicros(d); return Object.assign(r, { days: r.foods || r.supps ? 1 : 0, foodDays: r.foods ? 1 : 0, suppDays: r.supps ? 1 : 0, today: true }); };
    if (which === 'today') return one(today);
    const fs = zero(), ss = zero(), missing = new Set(), counted = new Map(), unknown = new Map(); let fd = 0, sd = 0;
    for (let i = 1; i <= 7; i++) {
      const r = dayMicros(U.addDays(today, -i));
      if (r.foods) { fd++; for (const [k] of NUT) fs[k] += r.food[k]; r.missing.forEach(m => missing.add(m)); }
      if (r.supps) { sd++; for (const [k] of NUT) ss[k] += r.supp[k]; }
      r.counted.forEach(x => counted.set(x.id, x)); r.unknown.forEach(x => unknown.set(x.id, x));
    }
    if (!fd && !sd) return one(today);
    const food = zero(), supp = zero(), v = zero();
    for (const [k] of NUT) { food[k] = fd ? fs[k] / fd : 0; supp[k] = sd ? ss[k] / sd : 0; v[k] = food[k] + supp[k]; }
    return { v, food, supp, missing: [...missing], days: Math.max(fd, sd), foodDays: fd, suppDays: sd, counted: [...counted.values()], unknown: [...unknown.values()], today: false };
  }
  const pctOf = (k, val) => { const r = ref(); return r && r[k] ? val / r[k] : null; };

  /* ---------- blood tests ---------- */
  const labs = () => (Store.data.labs || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  function parseRange(t) {
    const s = String(t == null ? '' : t).replace(/,/g, '').trim(); let x;
    if ((x = s.match(/^(-?\d*\.?\d+)\s*(?:-|–|—|to)\s*(-?\d*\.?\d+)/i))) return { low: +x[1], high: +x[2] };
    if ((x = s.match(/^(?:<|≤|<=|under|below|less than)\s*(-?\d*\.?\d+)/i))) return { high: +x[1] };
    if ((x = s.match(/^(?:>|≥|>=|over|above|greater than)\s*(-?\d*\.?\d+)/i))) return { low: +x[1] };
    return {};
  }
  function flagOf(m) { const v = Number(m.value); if (m.low != null && v < m.low) return 'below'; if (m.high != null && v > m.high) return 'above'; return null; }
  const rangeTxt = m => m.range || (m.low != null && m.high != null ? m.low + '–' + m.high : m.low != null ? 'over ' + m.low : m.high != null ? 'under ' + m.high : '');
  function history(name) {
    const k = String(name).toLowerCase(), out = [];
    for (const t of labs()) for (const m of t.markers || []) if (String(m.name).toLowerCase() === k) out.push(Object.assign({ date: t.date }, m));
    return out;
  }
  function latest() {
    const map = new Map();
    for (const t of labs()) for (const m of t.markers || []) map.set(String(m.name).toLowerCase(), Object.assign({ date: t.date }, m));
    return [...map.values()];
  }
  const labFor = k => (LINK[k] ? latest().filter(m => LINK[k].test(m.name)) : []);
  const flagTxt = f => (f === 'below' ? 'below the lab’s range' : f === 'above' ? 'above the lab’s range' : 'in the lab’s range');
  function bury(date) { const dl = Store.data.deleted = Store.data.deleted || {}; (dl.labs = dl.labs || {})[date] = new Date().toISOString(); }

  /* ---------- pieces ---------- */
  function pickRef(after) {
    const w = h('<div style="display:flex;flex-direction:column;gap:10px"><p class="small" style="padding:0 2px">Which daily amounts should Opus compare you against? They come from the US Dietary Reference Intakes and differ a little by sex and age.</p><div class="chips"></div></div>');
    Object.entries(REF).forEach(([k, r]) => { const c = h('<button class="chip' + (refKey() === k ? ' on' : '') + '" type="button">' + r.label + '</button>'); c.onclick = () => { health().reference = k; Plan.p.updated = U.key(); Store.save(); ui.buzz(8); after && after(); }; w.querySelector('.chips').appendChild(c); });
    return w;
  }
  function nutRow(k, name, unit, limit, val, withLab, split) {
    const p = pctOf(k, val), r = ref();
    const pc = p == null ? 0 : Math.min(p, 1.5);
    const fv = split ? split.food[k] || 0 : val, sv = split ? split.supp[k] || 0 : 0;
    const fw = val > 0 ? pc * fv / val : 0, sw = val > 0 ? pc * sv / val : 0;
    const cls = limit ? (p > 1 ? ' over' : '') : (p != null && p < .5 ? ' low' : '');
    const row = h('<div class="nrow' + cls + '"><div class="nt"><span class="nn">' + name + '</span><span class="nv num">' + fmt(val, unit) + (r ? '<small> of ' + fmt(r[k], unit) + (limit ? ' limit' : '') + '</small>' : '') + '</span></div>' +
      '<div class="nbar"><i style="width:' + (fw / 1.5 * 100).toFixed(1) + '%"></i>' + (sw > 0 ? '<i class="sp" style="left:' + (fw / 1.5 * 100).toFixed(1) + '%;width:' + (sw / 1.5 * 100).toFixed(1) + '%"></i>' : '') + '<b style="left:' + (100 / 1.5).toFixed(1) + '%"></b></div>' +
      '<div class="np small num">' + (p != null ? Math.round(p * 100) + '%' + (limit ? ' of the limit' : ' of the daily amount') : '') + (sv > 0 ? '<span class="nsplit">' + fmt(fv, unit) + ' food · <em>' + fmt(sv, unit) + ' supplements</em></span>' : '') + '</div></div>');
    if (withLab) labFor(k).forEach(m => row.appendChild(h('<div class="nlab small"><span class="lab-dot' + (flagOf(m) ? ' out' : '') + '"></span>Blood test ' + U.fmtDateShort(U.parseKey(m.date)) + ': <b class="num">' + U.esc(fmt(Number(m.value), m.unit)) + '</b> ' + U.esc(m.name) + ', ' + flagTxt(flagOf(m)) + '</div>')));
    return row;
  }
  // which supplements went into the numbers, and which were taken but have no amount to count
  function suppNote(est) {
    const S = Opus.supps; if (!S || !(est.counted || []).length && !(est.unknown || []).length) return null;
    const bits = [];
    if (est.counted.length) bits.push('Supplements counted: ' + est.counted.map(x => U.esc(x.name) + ' (' + U.esc(S.nutrientText(x)) + ')').join(', ') + '.');
    if (est.unknown.length) bits.push('Taken but not counted, no amount per dose yet: ' + est.unknown.map(x => U.esc(x.name)).join(', ') + '. Add it from the bottle under Supplements.');
    return h('<p class="small nsupp">' + bits.join(' ') + '</p>');
  }

  /* the section on the Food tab */
  function section(v, numeral) {
    const sec = h('<div class="sec"><div class="sh"><span class="r">' + numeral + '</span><span class="t">Vitamins & minerals</span><span class="c">estimates</span></div><div class="card pad body-card"></div></div>');
    const c = sec.querySelector('.card');
    const draw = () => {
      c.innerHTML = '';
      if (!ref()) { c.appendChild(pickRef(draw)); return; }
      const est = estimate();
      if (!est.days) c.appendChild(h('<p class="small">Tick off meals and supplements in Today and Opus estimates your vitamins and minerals from them.</p>'));
      else {
        c.appendChild(h('<p class="small">' + (est.today ? 'Today so far' : 'Average of the last ' + (est.days === 1 ? 'day' : est.days + ' days') + ' you logged') + ', from standard food values' + (est.counted && est.counted.length ? ' plus the supplements you ticked' : '') + '. <span class="nkey"><i></i>food <i class="sp"></i>supplements</span></p>'));
        const ranked = NUT.filter(n => !n[3]).map(n => [n, pctOf(n[0], est.v[n[0]])]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(x => x[0]);
        const sod = NUT.find(n => n[0] === 'sodium'); if (pctOf('sodium', est.v.sodium) > 1) ranked.push(sod);
        ranked.forEach(([k, name, unit, limit]) => c.appendChild(nutRow(k, name, unit, limit, est.v[k], true, est)));
        const sn = suppNote(est); if (sn && est.unknown.length) { sn.textContent = 'Taken but not counted, no amount per dose yet: ' + est.unknown.map(x => x.name).join(', ') + '.'; c.appendChild(sn); }
      }
      const n = labs().length, out = latest().filter(flagOf).length;
      const b = h('<div class="btns"><button class="btn quiet sm" type="button">All nutrients</button><button class="btn quiet sm" type="button">Blood tests' + (n ? ' · ' + n : '') + '</button></div>');
      b.children[0].onclick = nutrientsSheet; b.children[1].onclick = labsSheet;
      c.appendChild(b);
      if (out) c.appendChild(h('<p class="small lab-note"><span class="lab-dot out"></span>' + out + ' result' + (out === 1 ? ' is' : 's are') + ' outside the lab’s range on your last test. Worth raising with your doctor.</p>'));
    };
    draw();
    v.appendChild(sec);
  }

  function nutrientsSheet() {
    let which = 'week';
    ui.sheet({ title: 'Vitamins & minerals', kicker: 'Estimated from what you logged', full: true, onClose: () => Opus.refresh(), render(api) {
      const b = api.body;
      const draw = () => {
        b.innerHTML = '';
        if (!ref()) { b.appendChild(pickRef(draw)); return; }
        const sw = h('<div class="chips"><button class="chip" data-w="week" type="button">Last 7 days</button><button class="chip" data-w="today" type="button">Today so far</button></div>');
        sw.querySelectorAll('.chip').forEach(c => { c.classList.toggle('on', c.dataset.w === which); c.onclick = () => { which = c.dataset.w; draw(); }; });
        b.appendChild(sw);
        const est = estimate(which);
        b.appendChild(h('<p class="small">' + (!est.days ? 'Nothing logged yet.' : est.today ? 'Today so far.' : 'Average of ' + est.days + (est.days === 1 ? ' day' : ' days') + ' you logged, not counting today.') + ' <span class="nkey"><i></i>food <i class="sp"></i>supplements</span></p>'));
        const card = h('<div class="card pad body-card"></div>');
        NUT.forEach(([k, name, unit, limit]) => card.appendChild(nutRow(k, name, unit, limit, est.v[k], true, est)));
        b.appendChild(card);
        const sn = suppNote(est); if (sn) b.appendChild(sn);
        if (est.missing.length) b.appendChild(h('<p class="small">Not counted, no nutrient numbers yet: ' + U.esc(est.missing.join(', ')) + '. Grok can add them.</p>'));
        b.appendChild(h('<p class="small">Estimates from standard food values. Sodium leaves out salt and seasoning you add, so the real number is higher. Vitamin D also comes from sun, which food can’t show. Your blood tests are the real picture.</p>'));
        const rr = h('<p class="small">Compared with daily amounts for ' + ref().label + ' (US Dietary Reference Intakes). <button class="link" type="button">Change</button></p>');
        rr.querySelector('button').onclick = () => { b.innerHTML = ''; b.appendChild(pickRef(draw)); };
        b.appendChild(rr);
        const lb = h('<button class="btn ghost" type="button">Blood tests</button>'); lb.onclick = labsSheet; b.appendChild(lb);
      };
      draw();
    } });
  }

  function labsSheet() {
    ui.sheet({ title: 'Blood tests', kicker: 'Your results, with the lab’s ranges', full: true, onClose: () => Opus.refresh(), render(api) {
      const b = api.body;
      const draw = () => {
        b.innerHTML = '';
        const all = labs(), last = latest().sort((x, y) => (flagOf(y) ? 1 : 0) - (flagOf(x) ? 1 : 0) || String(x.name).localeCompare(y.name));
        if (!all.length) b.appendChild(h('<div class="card pad"><div class="serif-h">No results yet</div><p class="small">After a blood test, add each result with the range printed on the report. Or send Grok a photo of the report and say “Add my blood test to Opus.”</p></div>'));
        else {
          const c = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">Latest</span><span class="c num">' + last.length + ' markers</span></div><div class="card"></div></div>');
          last.forEach(m => {
            const f = flagOf(m), hist = history(m.name);
            const r = h('<div class="row tap lab-row' + (f ? ' out' : '') + '"><span class="tx"><b>' + U.esc(m.name) + '</b><small class="num">' + (rangeTxt(m) ? 'Lab range ' + U.esc(rangeTxt(m)) : 'No range given') + ' · ' + U.fmtDateShort(U.parseKey(m.date)) + (f ? ' · ' + flagTxt(f) : '') + '</small></span><span class="q num">' + U.esc(fmt(Number(m.value), m.unit)) + '</span>' + (hist.length > 1 ? '<span class="spk"></span>' : '') + ui.icon('chev', 'chev ico') + '</div>');
            if (hist.length > 1) r.querySelector('.spk').appendChild(h(ui.spark(hist.map(x => ({ v: Number(x.value) })), { w: 44, h: 18 })));
            r.onclick = () => markerSheet(m.name);
            c.querySelector('.card').appendChild(r);
          });
          b.appendChild(c);
          if (last.some(flagOf)) b.appendChild(h('<p class="small lab-note"><span class="lab-dot out"></span>Marked results are outside the range printed by the lab. Opus doesn’t diagnose anything; raise them with your doctor.</p>'));
          const t = h('<div class="sec"><div class="sh"><span class="r">II</span><span class="t">Tests</span></div><div class="card"></div></div>');
          all.slice().reverse().forEach(x => {
            const n = (x.markers || []).filter(flagOf).length;
            const r = h('<div class="row tap"><span class="tx"><b>' + U.fmtDateShort(U.parseKey(x.date)) + ', ' + x.date.slice(0, 4) + '</b><small>' + U.esc([x.lab, (x.markers || []).length + ' markers', n ? n + ' outside range' : '', x.by === 'grok' ? 'from Grok' : ''].filter(Boolean).join(' · ')) + '</small></span>' + ui.icon('chev', 'chev ico') + '</div>');
            r.onclick = () => editSheet(x, draw);
            t.querySelector('.card').appendChild(r);
          });
          b.appendChild(t);
        }
        const add = h('<button class="btn ghost" type="button">' + ui.icon('plus', 'ico') + ' Add a blood test</button>'); add.onclick = () => editSheet(null, draw); b.appendChild(add);
        b.appendChild(h('<p class="small">Results stay in your private data and Grok can read them. Grok can add them for you from a photo of the report.</p>'));
      };
      draw();
    } });
  }

  function markerSheet(name) {
    const hist = history(name), last = hist[hist.length - 1] || {};
    ui.sheet({ title: name, kicker: 'Blood test trend', render(api) {
      const b = api.body;
      const k = Object.keys(LINK).find(x => LINK[x].test(name));
      if (hist.length > 1) {
        const c = h('<div class="card pad"></div>');
        c.appendChild(ui.chart(hist.map(x => ({ date: x.date, v: Number(x.value) })), { h: 110, target: last.low != null ? last.low : last.high, tlabel: 'lab ' + (last.low != null ? 'low' : 'high'), fmt: x => fmt(x), tipFmt: x => fmt(x, last.unit) }));
        if (last.low != null || last.high != null) c.appendChild(h('<p class="small">The line marks the lab’s ' + (last.low != null ? 'low end (' + last.low + ')' : 'high end (' + last.high + ')') + '.</p>'));
        b.appendChild(c);
      }
      const card = h('<div class="card"></div>');
      hist.slice().reverse().forEach(x => { const f = flagOf(x); card.appendChild(h('<div class="row lab-row' + (f ? ' out' : '') + '"><span class="tx"><b>' + U.fmtDateShort(U.parseKey(x.date)) + ', ' + x.date.slice(0, 4) + '</b><small class="num">' + (rangeTxt(x) ? 'Lab range ' + U.esc(rangeTxt(x)) + ' · ' : '') + flagTxt(f) + '</small></span><span class="q num">' + U.esc(fmt(Number(x.value), x.unit)) + '</span></div>')); });
      b.appendChild(card);
      if (k && ref()) {
        const n = NUT.find(x => x[0] === k), est = estimate();
        if (est.days) { b.appendChild(h('<div class="sh"><span class="t">' + (est.supp && est.supp[k] > 0 ? 'From food and supplements' : 'From your food') + '</span><span class="c">estimate</span></div>')); b.appendChild(h('<div class="card pad body-card"></div>')).appendChild(nutRow(n[0], n[1], n[2], n[3], est.v[k], false, est)); }
        b.appendChild(h('<p class="small">Food estimates and blood levels measure different things, so they won’t match number for number. Together they show the direction.</p>'));
      }
      if (hist.some(flagOf)) b.appendChild(h('<p class="small lab-note"><span class="lab-dot out"></span>Outside the lab’s range is worth raising with your doctor. Opus doesn’t diagnose anything.</p>'));
    } });
  }

  function editSheet(test, after) {
    const ed = test ? JSON.parse(JSON.stringify(test)) : { date: U.key(), lab: '', markers: [] };
    ui.sheet({ title: test ? 'Blood test' : 'Add a blood test', kicker: test ? U.fmtDateShort(U.parseKey(test.date)) + ', ' + test.date.slice(0, 4) : 'Copy it from the report', foot: true, full: true, onClose: () => after && after(), render(api) {
      const b = api.body;
      const top = h('<div class="grid2"><div class="field"><label for="lab-date">Date of the test</label><input class="input" id="lab-date" type="date"></div><div class="field"><label for="lab-name">Lab (optional)</label><input class="input" id="lab-name" placeholder="Quest" autocomplete="off"></div></div>');
      top.querySelector('#lab-date').value = ed.date; top.querySelector('#lab-name').value = ed.lab || '';
      b.appendChild(top);
      b.appendChild(h('<p class="small">For each result, type the value, the unit and the range exactly as the report prints them.</p>'));
      const list = h('<div class="lab-list"></div>'); b.appendChild(list);
      const addRow = (m, focus) => {
        const r = h('<div class="card pad lab-ed"><div class="field"><label>Marker</label><input class="input lm-name" placeholder="Vitamin D, 25-OH" autocomplete="off"></div><div class="lab-ed3"><div class="field"><label>Value</label><input class="input num lm-val" inputmode="decimal"></div><div class="field"><label>Unit</label><input class="input lm-unit" autocomplete="off"></div><div class="field"><label>Lab range</label><input class="input num lm-range" placeholder="30–100" autocomplete="off"></div></div><button class="link lm-x" type="button">Remove</button></div>');
        r.querySelector('.lm-name').value = m.name || ''; r.querySelector('.lm-val').value = m.value == null ? '' : m.value; r.querySelector('.lm-unit').value = m.unit || ''; r.querySelector('.lm-range').value = rangeTxt(m);
        r.querySelector('.lm-x').onclick = () => r.remove();
        list.appendChild(r); if (focus) setTimeout(() => r.querySelector(m.name ? '.lm-val' : '.lm-name').focus(), 50);
      };
      (ed.markers.length ? ed.markers : []).forEach(m => addRow(m));
      const chips = h('<div class="sec"><div class="sh"><span class="t">Add a marker</span><span class="c">tap one</span></div><div class="chips"></div></div>');
      COMMON.forEach(([n, u]) => { const c = h('<button class="chip" type="button">' + U.esc(n) + '</button>'); c.onclick = () => { addRow({ name: n, unit: u }, true); ui.buzz(6); }; chips.querySelector('.chips').appendChild(c); });
      const other = h('<button class="chip" type="button">Other</button>'); other.onclick = () => addRow({}, true); chips.querySelector('.chips').appendChild(other);
      b.appendChild(chips);
      const ft = h('<div class="btns">' + (test ? '<button class="btn quiet" type="button">Remove</button>' : '') + '<button class="btn" type="button">Save</button></div>');
      api.foot.appendChild(ft);
      if (test) ft.children[0].onclick = () => {
        const L = Store.data.labs || []; const i = L.findIndex(x => x.date === test.date); if (i < 0) return;
        const [gone] = L.splice(i, 1); bury(gone.date); Store.save(); api.close();
        ui.toast('Removed the ' + U.fmtDateShort(U.parseKey(gone.date)) + ' test', { label: 'Undo', run: () => { delete ((Store.data.deleted || {}).labs || {})[gone.date]; gone.at = new Date().toISOString(); (Store.data.labs = Store.data.labs || []).push(gone); Store.save(); Opus.refresh(); } });
      };
      ft.lastElementChild.onclick = () => {
        const date = b.querySelector('#lab-date').value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { ui.toast('Pick the date of the test'); return; }
        const markers = [];
        for (const r of list.querySelectorAll('.lab-ed')) {
          const name = r.querySelector('.lm-name').value.trim(), raw = r.querySelector('.lm-val').value.trim().replace(',', '.');
          if (!name && !raw) continue;
          if (!name) { ui.toast('Name every marker'); return; }
          const value = Number(raw); if (raw === '' || !isFinite(value)) { ui.toast(name + ': value should be a number'); r.querySelector('.lm-val').focus(); return; }
          const range = r.querySelector('.lm-range').value.trim(), pr = parseRange(range);
          markers.push(Object.assign({ name, value, unit: r.querySelector('.lm-unit').value.trim() }, range ? { range } : {}, pr));
        }
        if (!markers.length) { ui.toast('Add at least one result'); return; }
        const L = Store.data.labs = Store.data.labs || [];
        if (test && test.date !== date) { const i = L.findIndex(x => x.date === test.date); if (i >= 0) { L.splice(i, 1); bury(test.date); } }
        const lab = b.querySelector('#lab-name').value.trim();
        const rec = Object.assign({ date, markers, at: new Date().toISOString() }, lab ? { lab } : {}, ed.note ? { note: ed.note } : {});
        const j = L.findIndex(x => x.date === date); if (j >= 0) L[j] = rec; else L.push(rec);
        const dl = (Store.data.deleted || {}).labs; if (dl) delete dl[date];
        Store.save(); ui.buzz(12); api.close();
        const out = markers.filter(flagOf).length;
        ui.toast('Saved ' + markers.length + ' result' + (markers.length === 1 ? '' : 's') + (out ? ', ' + out + ' outside the lab’s range' : ''));
      };
    } });
  }

  Opus.body = { NUT, REF, LINK, dayMicros, daySupps, estimate, parseRange, flagOf, history, latest, section, nutrientsSheet, labsSheet, markerSheet, editSheet };
})();
