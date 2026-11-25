/* Food search: your own foods first (instant, offline), then the USDA FoodData Central database
   (common foods, restaurant and packaged items, with vitamins and minerals), then Open Food Facts for more brands.
   Both databases are free. USDA works at once with its shared demo key (about 50 searches a day);
   a free personal key, kept only on this phone, lifts that to 1,000 an hour and lets it search as you type. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const FDC = 'https://api.nal.usda.gov/fdc/v1/foods/search';
  const OFF = 'https://world.openfoodfacts.org/cgi/search.pl';
  const SIGNUP = 'https://fdc.nal.usda.gov/api-key-signup';
  const KEY_LS = 'opus.fdcKey', CACHE_LS = 'opus.foodSearch';
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const key = () => { const k = ls.get(KEY_LS); return typeof k === 'string' && k.length >= 20 ? k : null; };

  // USDA nutrient numbers → Opus fields (macros per 100 g; micros in Opus's units: g fiber, mg, µg for A, D, B12, folate)
  const NUM = { '203': 'protein', '205': 'carbs', '204': 'fat', '291': 'fiber', '307': 'sodium', '306': 'potassium', '301': 'calcium', '303': 'iron',
    '304': 'magnesium', '309': 'zinc', '320': 'vitA', '401': 'vitC', '328': 'vitD', '430': 'vitK', '418': 'b12', '435': 'folate' };
  const MICROS = ['fiber', 'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'vitA', 'vitC', 'vitD', 'vitK', 'b12', 'folate'];
  const r2 = v => Math.round(v * 100) / 100;

  // "GREEK NONFAT YOGURT" → "Greek nonfat yogurt"; mixed case stays as written
  function tidy(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (s && s === s.toUpperCase() && /[A-Z]{3}/.test(s)) s = s.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
    return s;
  }
  function fromUSDA(f) {
    const per = { kcal: null, protein: null, carbs: null, fat: null }, mi = {};
    let kj = null, atw = null;
    for (const n of (f.foodNutrients || [])) {
      const num = String(n.nutrientNumber || (n.nutrient && n.nutrient.number) || ''), v = Number(n.value != null ? n.value : n.amount), unit = String(n.unitName || (n.nutrient && n.nutrient.unitName) || '').toUpperCase();
      if (!(v >= 0)) continue;
      if (num === '208' && unit !== 'KJ') per.kcal = v;
      else if (num === '268' || (num === '208' && unit === 'KJ')) kj = v;
      else if ((num === '957' || num === '958') && atw == null) atw = v;
      else if (num === '417' && mi.folate == null) mi.folate = v;
      else if (num === '324' && mi.vitD == null) mi.vitD = v / 40; // IU → µg
      else if (NUM[num]) { const k = NUM[num]; if (k in per) per[k] = v; else mi[k] = v; }
    }
    if (per.kcal == null) per.kcal = atw != null ? atw : kj != null ? kj / 4.184 : null;
    if (per.kcal == null && per.protein == null) return null;
    const branded = f.dataType === 'Branded';
    const portions = [];
    if (branded && Number(f.servingSize) > 0 && /^(g|grm|ml|mlt)$/i.test(f.servingSizeUnit || '')) {
      const g = Number(f.servingSize), hh = tidy(f.householdServingFullText || '');
      portions.push({ label: (hh && !/^\d+(\.\d+)?\s*(g|ml)$/i.test(hh) ? hh + ' · ' : '1 serving · ') + U.wt(g) + (/^m/i.test(f.servingSizeUnit) ? ' ml' : ' g'), g });
    }
    for (const m of (f.foodMeasures || [])) {
      const g = Number(m.gramWeight), t = tidy(m.disseminationText || m.portionDescription || '');
      if (!(g > 0) || !t || /quantity not specified/i.test(t)) continue;
      if (!portions.some(p => p.g === g)) portions.push({ label: t + ' · ' + U.wt(g) + ' g', g });
    }
    const name = tidy(f.description), brand = branded ? tidy(f.brandName || f.brandOwner || '') : '';
    return { id: 'usda:' + f.fdcId, src: 'usda', name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? name : name, brand,
      kind: branded ? 'Packaged' : f.dataType === 'Survey (FNDDS)' ? 'Common food' : 'Basic food', generic: !branded,
      per, micros: Object.keys(mi).length ? mi : null, portions: portions.slice(0, 6), estimate: !branded };
  }
  function fromOFF(p) {
    const n = p.nutriments || {}, num = k => { const v = Number(n[k + '_100g']); return v >= 0 ? v : null; };
    const per = { kcal: num('energy-kcal'), protein: num('proteins'), carbs: num('carbohydrates'), fat: num('fat') };
    if (per.kcal == null) { const kj = num('energy-kj') != null ? num('energy-kj') : num('energy'); if (kj != null) per.kcal = kj / 4.184; }
    if (per.kcal == null && per.protein == null) return null;
    const mi = {}, g2 = { fiber: ['fiber', 1], sodium: ['sodium', 1000], potassium: ['potassium', 1000], calcium: ['calcium', 1000], iron: ['iron', 1000], magnesium: ['magnesium', 1000], zinc: ['zinc', 1000], vitA: ['vitamin-a', 1e6], vitC: ['vitamin-c', 1000], vitD: ['vitamin-d', 1e6], vitK: ['vitamin-k', 1e6], b12: ['vitamin-b12', 1e6], folate: ['vitamin-b9', 1e6] };
    for (const [k, [f, x]] of Object.entries(g2)) { const v = num(f); if (v != null) mi[k] = r2(v * x); }
    const portions = [], sq = Number(p.serving_quantity);
    if (sq > 0) portions.push({ label: (tidy(p.serving_size) || '1 serving') + (/\d\s*(g|ml)\b/i.test(p.serving_size || '') ? '' : ' · ' + U.wt(sq) + ' g'), g: sq });
    const brand = tidy(Array.isArray(p.brands) ? p.brands[0] : String(p.brands || '').split(',')[0]);
    const name = tidy(p.product_name || p.generic_name || '');
    if (!name) return null;
    return { id: 'off:' + p.code, src: 'off', name, brand, kind: 'Packaged', generic: false, per, micros: Object.keys(mi).length ? mi : null, portions, estimate: true };
  }

  // ranking: every word of the search in the name, then generic foods, then shorter names
  const words = q => String(q || '').toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').split(/\s+/).filter(Boolean);
  function score(food, ws) {
    const nm = (food.name + ' ' + (food.brand || '')).toLowerCase(), first = nm.split(/[ ,]/)[0];
    let s = 0;
    for (const w of ws) { if (nm.includes(w)) s += 10; else if (nm.includes(w.replace(/s$/, ''))) s += 8; else s -= 15; }
    if (ws[0] && (first === ws[0] || first === ws[0].replace(/s$/, ''))) s += 6;
    if (food.generic) s += 4;
    if (food.kind === 'Common food') s += 2;
    s -= Math.min(10, food.name.length / 12);
    return s;
  }
  const rank = (list, q) => { const ws = words(q); return list.map(f => [score(f, ws), f]).sort((a, b) => b[0] - a[0]).map(x => x[1]); };

  // your own foods: kept foods, things you logged before, and the parts of planned meals
  function mine(q) {
    const ws = words(q); if (!ws.length) return [];
    const out = [], seen = new Set();
    const add = (x, kind) => {
      const k = String(x.name || '').toLowerCase(); if (!k || seen.has(k)) return;
      if (!ws.every(w => k.includes(w) || k.includes(w.replace(/s$/, '')))) return;
      seen.add(k); out.push({ id: 'you:' + k, src: 'you', name: x.name, kind, item: { name: x.name, amount: x.amount, unit: x.unit, macros: x.macros || null, micros: x.micros || null, from: kind === 'Your food' ? 'lib' : 'recent' } });
    };
    Plan.library().forEach(x => add(x, 'Your food'));
    (Store.data.eaten || []).filter(e => e.extra && e.name).sort((a, b) => String(b.at || b.date).localeCompare(String(a.at || a.date))).forEach(e => add(e, 'Logged before'));
    Object.values(((Plan.p.food || {}).meals) || {}).forEach(m => (m.parts || []).forEach(p => add(p, 'In your plan')));
    return out.slice(0, 8);
  }

  // a small cache so a repeat search costs nothing and works offline
  function cached(src, q) { const c = ls.get(CACHE_LS) || {}, x = c[src + '|' + q.toLowerCase()]; return x && Date.now() - x.t < 30 * 864e5 ? x.foods : null; }
  function remember(src, q, foods) {
    const c = ls.get(CACHE_LS) || {}; c[src + '|' + q.toLowerCase()] = { t: Date.now(), foods };
    const ks = Object.keys(c).sort((a, b) => c[b].t - c[a].t); for (const k of ks.slice(60)) delete c[k];
    ls.set(CACHE_LS, c);
  }
  async function get(url, ms) {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, t = setTimeout(() => ac && ac.abort(), ms || 12000);
    try { return await fetch(url, ac ? { signal: ac.signal } : {}); } finally { clearTimeout(t); }
  }
  async function usda(q) {
    const hit = cached('usda', q); if (hit) return hit;
    const k = key() || 'DEMO_KEY';
    const url = FDC + '?api_key=' + encodeURIComponent(k) + '&query=' + encodeURIComponent(q) + '&pageSize=40&dataType=' + encodeURIComponent('Foundation,SR Legacy,Survey (FNDDS),Branded');
    let r;
    try { r = await get(url); } catch (e) { const er = new Error(navigator.onLine === false ? 'You’re offline. Your own foods still show.' : 'The USDA search didn’t answer. Try again in a moment.'); throw er; }
    if (r.status === 429) throw new Error(key() ? 'Too many searches this hour. It opens again within the hour.' : 'The shared key is used up for now (about 50 searches a day). Add your free key to search freely.');
    if (r.status === 403 || r.status === 401) throw new Error(key() ? 'The USDA key was refused. Check it in Search settings.' : 'The USDA search refused the shared key. Add your free key.');
    if (!r.ok) throw new Error('The USDA search answered ' + r.status + '. Try again in a moment.');
    const j = await r.json();
    const foods = (j.foods || []).map(fromUSDA).filter(Boolean);
    remember('usda', q, foods);
    return foods;
  }
  async function off(q) {
    const hit = cached('off', q); if (hit) return hit;
    const url = OFF + '?search_terms=' + encodeURIComponent(q) + '&search_simple=1&action=process&json=1&page_size=24&fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments';
    let r;
    try { r = await get(url, 15000); } catch (e) { throw new Error(navigator.onLine === false ? 'You’re offline.' : 'Open Food Facts didn’t answer. It can be slow; try again.'); }
    if (!r.ok) throw new Error('Open Food Facts answered ' + r.status + '. Try again later.');
    const j = await r.json();
    const foods = (j.products || []).map(fromOFF).filter(Boolean);
    remember('off', q, foods);
    return foods;
  }

  // what a food comes to for one portion, in the add-food form's terms
  function itemFor(food, portion) {
    const g = portion ? portion.g : 100;
    const f = g / 100, mac = { estimate: food.estimate !== false };
    for (const k of ['kcal', 'protein', 'carbs', 'fat']) mac[k] = food.per[k] == null ? null : Math.round(food.per[k] * f * 10) / 10;
    let micros = null;
    if (food.micros) { micros = { estimate: true }; for (const k of MICROS) if (food.micros[k] != null) micros[k] = r2(food.micros[k] * f); }
    const name = food.brand && !food.name.toLowerCase().includes(food.brand.toLowerCase()) ? food.brand + ' ' + food.name : food.name;
    if (!portion) return { name, amount: 100, unit: 'g', macros: mac, micros, src: food.src };
    // "1 cup · 245 g" → 1 × "cup (245 g)"; "2 slices · 56 g" → 1 × "serving (2 slices, 56 g)"
    const [what, grams] = portion.label.split(' · '), m = /^1\s+(.+)$/.exec(what || '');
    const unit = m ? m[1] + (grams ? ' (' + grams + ')' : '') : grams ? 'serving (' + what + ', ' + grams + ')' : /^[\d.]+\s*(g|ml)$/i.test(what) ? 'serving (' + what + ')' : what;
    return { name, amount: 1, unit, macros: mac, micros, src: food.src };
  }
  const perLine = food => {
    const p = food.portions && food.portions[0], f = p ? p.g / 100 : 1, k = food.per.kcal, pr = food.per.protein;
    return (k == null ? '' : Math.round(k * f) + ' cal') + (pr == null ? '' : ' · ' + Math.round(pr * f) + ' g protein') + ' per ' + (p ? p.label.split(' · ')[0] : '100 g');
  };

  /* the search block for the add-food sheet. onPick gets an item shaped like a kept food. */
  function block(onPick) {
    const el = h('<div class="fs"><div class="fs-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input class="input" type="search" enterkeyhint="search" placeholder="Search foods: chicken breast, Chobani…" autocomplete="off" aria-label="Search foods"><button class="fs-x" type="button" aria-label="Clear" hidden>×</button></div><div class="fs-out" hidden></div></div>');
    const inp = el.querySelector('input'), out = el.querySelector('.fs-out'), x = el.querySelector('.fs-x');
    let timer = null, seq = 0, state = { q: '', usda: null, off: null, err: null, offErr: null, busy: false, offBusy: false, open: null };
    const row = (food, i) => {
      const r = h('<div class="fs-r"><button class="fs-t" type="button"><span class="tx"><b></b><small class="num"></small></span><span class="fs-k"></span></button><div class="fs-p" hidden></div></div>');
      r.querySelector('b').textContent = food.name + (food.brand && !food.name.toLowerCase().includes(food.brand.toLowerCase()) ? ' · ' + food.brand : '');
      r.querySelector('small').textContent = food.src === 'you' ? (food.item.macros && food.item.macros.kcal != null ? Math.round(food.item.macros.kcal) + ' cal · ' : '') + [food.item.amount, food.item.unit].filter(v => v != null && v !== '').join(' ') : perLine(food);
      r.querySelector('.fs-k').textContent = food.kind;
      r.querySelector('.fs-t').onclick = () => {
        if (food.src === 'you') { pick(food.item, food.name); return; }
        const pp = r.querySelector('.fs-p'), was = !pp.hidden;
        out.querySelectorAll('.fs-p').forEach(y => { y.hidden = true; }); if (was) return;
        pp.innerHTML = '<div class="fs-pk">How much</div><div class="chips"></div>'; const cs = pp.querySelector('.chips');
        food.portions.concat([null]).forEach(p => { const c = h('<button class="chip" type="button"></button>'); c.textContent = p ? p.label : '100 g'; c.onclick = () => pick(itemFor(food, p), food.name); cs.appendChild(c); });
        pp.hidden = false; ui.buzz(4);
      };
      return r;
    };
    function pick(item, label) {
      out.hidden = true; inp.value = ''; x.hidden = true; ui.buzz(8);
      onPick(item);
      ui.toast('Filled in ' + label + '. Change the amount if you had more or less.');
    }
    function draw() {
      const q = state.q; out.innerHTML = ''; out.hidden = !q;
      if (!q) return;
      const you = mine(q);
      if (you.length) { out.appendChild(h('<div class="fs-h">Yours</div>')); you.forEach(f => out.appendChild(row(f))); }
      const head = h('<div class="fs-h">USDA food database</div>'); out.appendChild(head);
      if (state.busy) out.appendChild(h('<p class="fs-m">Searching…</p>'));
      else if (state.err) out.appendChild(h('<p class="fs-m">' + U.esc(state.err) + '</p>'));
      else if (state.usda) { const r = rank(state.usda, q).slice(0, 20); if (!r.length) out.appendChild(h('<p class="fs-m">Nothing there for “' + U.esc(q) + '”. Try fewer words, or brands below.</p>')); r.forEach(f => out.appendChild(row(f))); }
      else { const go = h('<button class="btn ghost fs-go" type="button">Search “' + U.esc(q) + '”</button>'); go.onclick = run; out.appendChild(go); }
      const oh = h('<div class="fs-h">More brands · Open Food Facts</div>'); out.appendChild(oh);
      if (state.offBusy) out.appendChild(h('<p class="fs-m">Searching…</p>'));
      else if (state.offErr) out.appendChild(h('<p class="fs-m">' + U.esc(state.offErr) + '</p>'));
      else if (state.off) { const r = rank(state.off, q).slice(0, 15); if (!r.length) out.appendChild(h('<p class="fs-m">No brands found.</p>')); r.forEach(f => out.appendChild(row(f))); }
      else { const go = h('<button class="btn ghost fs-go" type="button">Search brands</button>'); go.onclick = runOff; out.appendChild(go); }
      const ft = h('<p class="fs-f">' + (key() ? 'Values are per the database: USDA for common foods, labels for packaged ones.' : 'Searching with the shared key, about 50 searches a day.') + ' <button type="button" class="link">Search settings</button></p>');
      ft.querySelector('button').onclick = () => settings(() => draw());
      out.appendChild(ft);
    }
    async function run() {
      const q = state.q, my = ++seq; if (words(q).join('').length < 2) return;
      state.busy = true; state.err = null; draw();
      try { const r = await usda(q); if (my !== seq) return; state.usda = r; } catch (e) { if (my !== seq) return; state.err = e.message; }
      state.busy = false; draw();
    }
    async function runOff() {
      const q = state.q, my = seq; state.offBusy = true; state.offErr = null; draw();
      try { const r = await off(q); if (my !== seq) return; state.off = r; } catch (e) { if (my !== seq) return; state.offErr = e.message; }
      state.offBusy = false; draw();
    }
    inp.addEventListener('input', () => {
      const q = inp.value.trim(); x.hidden = !q; seq++;
      state = { q, usda: cached('usda', q), off: cached('off', q), err: null, offErr: null, busy: false, offBusy: false };
      draw(); clearTimeout(timer);
      if (q && !state.usda && key() && words(q).join('').length >= 3) timer = setTimeout(run, 450);
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); if (!state.usda) run(); inp.blur(); } });
    x.onclick = () => { inp.value = ''; inp.dispatchEvent(new Event('input')); inp.focus(); };
    return { el, input: inp };
  }

  /* the free USDA key: kept on this phone only, never synced */
  function settings(after) {
    ui.sheet({ title: 'Food search', kicker: 'Free databases', foot: true, onClose: () => after && after(), render(api) {
      const b = api.body, k = key();
      b.appendChild(h('<p class="note">Search looks in your own foods first, then the USDA FoodData Central database (common foods, restaurant and packaged items, with vitamins and minerals), then Open Food Facts for more brands. Both are free.</p>'));
      b.appendChild(h('<div class="card pad"><p class="note" style="margin:0"><b>' + (k ? 'Your key is in.' : 'Shared key for now.') + '</b> ' + (k ? 'Up to 1,000 searches an hour, and results come as you type.' : 'It allows about 50 searches a day. A free key of your own allows 1,000 an hour and searches as you type.') + '</p></div>'));
      b.appendChild(h('<ol class="steps small"><li>Open the USDA sign-up page below and enter your name and email.</li><li>The key arrives by email in a minute or two.</li><li>Copy it and paste it here. It stays on this phone only and is never synced or sent anywhere but the USDA search.</li></ol>'));
      const open = h('<a class="btn ghost" target="_blank" rel="noopener" href="' + SIGNUP + '">Open the USDA sign-up page</a>'); b.appendChild(open);
      const f = h('<div class="field"><label for="fs-key">Your USDA key</label><input class="input" id="fs-key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + (k ? 'Saved. Paste a new one to replace it.' : 'Paste it here') + '"></div>');
      b.appendChild(f);
      const ft = h('<div class="btns">' + (k ? '<button class="btn quiet" type="button">Remove key</button>' : '') + '<button class="btn" type="button">Save</button></div>');
      api.foot.appendChild(ft);
      if (k) ft.children[0].onclick = () => { ls.set(KEY_LS, null); ui.toast('Key removed. Back to the shared key.'); api.close(); };
      ft.lastElementChild.onclick = () => {
        const v = f.querySelector('input').value.trim();
        if (!v) { api.close(); return; }
        if (!/^[A-Za-z0-9]{20,60}$/.test(v)) { ui.toast('That doesn’t look like a USDA key: letters and numbers only.'); return; }
        ls.set(KEY_LS, v); ls.set(CACHE_LS, null); ui.toast('Key saved on this phone'); api.close();
      };
    } });
  }

  Opus.foodSearch = { block, settings, usda, off, mine, rank, itemFor, fromUSDA, fromOFF, tidy, hasKey: () => !!key(), key: () => key() || null };
})();
