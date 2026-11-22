/* The food camera: scan a barcode, take a photo of a plate, or say what you ate, and Opus fills in the food.
   - Barcodes are read on this phone (js/vendor/zxing, nothing sent anywhere) and looked up in Open Food Facts, then
     USDA's branded foods. Those are the numbers printed on the label. A food you scan is kept in your foods with its
     barcode, so the next scan is instant, even offline.
   - A photo (and anything you type about it) goes to your own Opus helper, where a vision model on your free
     Cloudflare account says what is in it and how much. Opus then looks each food up in USDA FoodData Central,
     restaurant chains included. The model's own numbers are used only when USDA has nothing. All of it is marked
     as an estimate and can be changed with a tap before it is added. Photos are never kept, except on this phone
     while one waits for a signal.
   - A photo of a Nutrition Facts panel is read as printed, for anything the databases don't have. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const SLOTS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' }, SLOT_KEYS = Object.keys(SLOTS);
  const slotNow = () => { const t = new Date(), m = t.getHours() * 60 + t.getMinutes(); return m < 630 ? 'breakfast' : m < 870 ? 'lunch' : m < 1050 ? 'snack' : 'dinner'; };
  const MICROS = ['fiber', 'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'vitA', 'vitC', 'vitD', 'b12', 'folate'];
  const PEND_LS = 'opus.snapPending', USE_LS = 'opus.snapUse';
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const n0 = v => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
  const r1 = v => Math.round(v * 10) / 10;
  const esc = U.esc;
  const ICON = {
    scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 8v8M10 8v8M13 8v8M16.5 8v8"/>',
    camera: '<path d="M4 8h3l1.6-2.4A1 1 0 0 1 9.4 5h5.2a1 1 0 0 1 .8.6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>',
    words: '<path d="M4 6h16M4 11h16M4 16h10"/>',
    torch: '<path d="M8 3h8l-1 5H9zM9 8h6v4l-1.5 9h-3L9 12z"/>'
  };
  const icon = (n, c) => '<svg class="' + (c || 'ico') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + '</svg>';

  /* ---------- saving what you ate (same shape as Add food) ---------- */
  const newId = d => U.key(d) + ':x' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
  function putEaten(e) { const L = Store.data.eaten = Store.data.eaten || []; const i = L.findIndex(x => x.id === e.id); if (i >= 0) L[i] = e; else L.push(e); }
  function dropEaten(id) { const L = Store.data.eaten = Store.data.eaten || []; const i = L.findIndex(x => x.id === id); if (i < 0) return; L.splice(i, 1); const dl = Store.data.deleted = Store.data.deleted || {}; (dl.eaten = dl.eaten || {})[id] = new Date().toISOString(); }
  function keepFood(item) {
    const f = Plan.p.food = Plan.p.food || {}; f.library = Array.isArray(f.library) ? f.library : [];
    const i = f.library.findIndex(x => (item.barcode && x.barcode === item.barcode) || String(x.name).toLowerCase() === item.name.toLowerCase());
    if (i >= 0) f.library[i] = Object.assign({}, f.library[i], item); else f.library.push(item);
    Plan.p.updated = U.key();
  }

  /* ---------- the helper (photos and typed meals) ---------- */
  const phone = () => (Opus.sync && Opus.sync.phone && Opus.sync.phone()) || null;
  function noteUse(neurons) {
    const day = new Date().toISOString().slice(0, 10), u = ls.get(USE_LS);
    const o = u && u.day === day ? u : { day, neurons: 0, reads: 0 };
    o.reads++; o.neurons += neurons > 0 ? neurons : 120; ls.set(USE_LS, o);
  }
  // about how many reads are left in today's free amount (10,000 a day, reset at midnight UTC)
  function readsLeft() {
    const u = ls.get(USE_LS), day = new Date().toISOString().slice(0, 10);
    if (!u || u.day !== day || !u.reads) return null;
    const per = u.neurons / u.reads; return Math.max(0, Math.floor((10000 - u.neurons) / per));
  }
  const resetAt = () => { const t = new Date(); t.setUTCHours(24, 0, 0, 0); return U.fmtTimeAP(String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0')).replace(' ', ' '); };
  async function ask(body) {
    const ph = phone();
    if (!ph) return { ok: false, code: 'setup', error: 'The photo reader comes with the newest helper. Sync Opus once (Settings › Sync) and try again.' };
    if (navigator.onLine === false) return { ok: false, code: 'offline', error: 'You’re offline.' };
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, t = setTimeout(() => ac && ac.abort(), 60000);
    try {
      const r = await fetch(ph.url + '/food', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Opus-Key': ph.key }, body: JSON.stringify(body), signal: ac ? ac.signal : undefined });
      let j = null; try { j = await r.json(); } catch (e) {}
      if (!j) return { ok: false, code: 'failed', error: 'The helper answered ' + r.status + '. Try again in a moment.' };
      if (j.ok) noteUse(j.neurons);
      if (j.code === 'limit') j.error = 'Today’s free photo reads are used up. They come back at ' + resetAt() + '.';
      return j;
    } catch (e) {
      return { ok: false, code: navigator.onLine === false ? 'offline' : 'failed', error: navigator.onLine === false ? 'You’re offline.' : 'The helper didn’t answer. Try again in a moment.' };
    } finally { clearTimeout(t); }
  }

  /* ---------- photos: shrink on the phone first (a 12 MP photo becomes ~150 KB) ---------- */
  function shrink(file, max) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const s = Math.min(1, (max || 1024) / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That photo couldn’t be opened.')); };
      img.src = url;
    });
  }
  // the system picker: Take Photo or Photo Library on iPhone (a photo from earlier works too)
  function pickPhoto(onFile) {
    const inp = h('<input type="file" accept="image/*" hidden>');
    document.body.appendChild(inp);
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) onFile(f); };
    inp.click();
    setTimeout(() => { if (inp.isConnected && !(inp.files && inp.files.length)) inp.remove(); }, 120000);
  }

  /* ---------- photos waiting for a signal ---------- */
  const pending = () => (ls.get(PEND_LS) || []).filter(p => p && p.img);
  function keepPending(p) {
    const L = pending().filter(x => x.id !== p.id); L.push(p);
    while (L.length > 4) L.shift();
    if (!ls.set(PEND_LS, L)) { L.shift(); ls.set(PEND_LS, L); }
  }
  const dropPending = id => ls.set(PEND_LS, pending().filter(x => x.id !== id));

  /* ---------- USDA: the numbers for what the photo shows ---------- */
  /* weights: the kitchen scale reads oz, lb, g or kg */
  const WT = { oz: 28.349523125, lb: 453.59237, g: 1, kg: 1000 }, WTS = ['oz', 'lb', 'g', 'kg'];
  const WSTEP = { oz: 0.5, lb: 0.05, g: 5, kg: 0.01, serving: 0.5 };
  const WDP = { oz: 1, lb: 2, g: 0, kg: 3, serving: 2 };
  const roundU = (v, u) => { const k = Math.pow(10, WDP[u] == null ? 1 : WDP[u]); return Math.round(v * k) / k; };
  const fmtU = (v, u) => String(roundU(v, u));
  const scaleUnit = () => { const u = (Store.data.settings || {}).scaleUnit; return WT[u] || u === 'serving' ? u : 'oz'; };
  const setScaleUnit = u => { (Store.data.settings = Store.data.settings || {}).scaleUnit = u; Store.save(); };
  const showW = (g, u) => (WT[u] ? fmtU(g / WT[u], u) + ' ' + u : U.wt(Math.round(g)) + ' g');

  const FS = () => Opus.foodSearch;
  const unitWord = u => String(u || '').toLowerCase().replace(/^(\d+\s*)?/, '').replace(/es$|s$/, '').trim();
  function portionFor(food, unit) {
    const w = unitWord(unit); if (!w || /^(g|gram|oz|ounce|item|serving|portion)$/.test(w)) return null;
    return (food.portions || []).find(p => { const l = p.label.toLowerCase(); return new RegExp('\\b' + w.replace(/[^a-z ]/g, '') + '(e?s)?\\b').test(l); }) || null;
  }
  // one item from the photo → its USDA candidates, best first
  async function matchesFor(it) {
    const fs = FS(); if (!fs) return { list: [], err: 'search unavailable' };
    const tries = [it.query, it.brand ? it.brand + ' ' + it.name : null, it.name].filter((q, i, a) => q && a.indexOf(q) === i);
    let err = null;
    for (const q of tries) {
      try {
        const got = await fs.usda(q);
        const list = fs.rank(got, q + ' ' + it.name).filter(f => f.per && f.per.kcal != null).slice(0, 4);
        if (list.length) return { list, q };
      } catch (e) { err = e.message; break; }
    }
    return { list: [], err };
  }
  const withBrand = f => (f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase().replace(/[’']s$/, '')) ? f.brand + ' · ' : '') + f.name;
  // "1 container (150 g)" → "container (150 g)"; "2/3 cup (55g)" → "serving (2/3 cup, 55 g)"
  const servUnit = sv => { const m = /^1\s+(.+)$/.exec(sv.label); if (m) return /\d\s*g\b/i.test(m[1]) ? m[1] : m[1] + ' (' + U.wt(sv.g) + ' g)'; return 'serving (' + sv.label.replace(/\s*·\s*/, ', ').replace(/\s*\((\d[\d.]*)\s*g\)/i, ', $1 g') + ')'; };
  /* what one photo item comes to with a chosen source (a USDA food, or the model's guess) */
  function figure(x) {
    const f = x.src;
    if (!f) { // the model's own rough numbers, scaled if you changed the amount
      const k = x.base.amount ? x.amount / x.base.amount : 1, g = x.base.guess;
      return { grams: x.base.grams != null ? r1(x.base.grams * k) : null, macros: g.kcal == null ? null : { kcal: r1(g.kcal * k), protein: g.protein == null ? null : r1(g.protein * k), carbs: g.carbs == null ? null : r1(g.carbs * k), fat: g.fat == null ? null : r1(g.fat * k), estimate: true }, micros: null, from: 'Rough guess from the photo' };
    }
    const por = portionFor(f, x.unit);
    const grams = x.gramsSet != null ? x.gramsSet : por ? por.g * x.amount : x.base.grams != null ? x.base.grams * (x.base.amount ? x.amount / x.base.amount : 1) : null;
    if (grams == null) return { grams: null, macros: null, micros: null, from: '' };
    const k = grams / 100, mac = { estimate: true };
    for (const m of ['kcal', 'protein', 'carbs', 'fat']) mac[m] = f.per[m] == null ? null : r1(f.per[m] * k);
    let mic = null; if (f.micros) { mic = { estimate: true }; for (const m of MICROS) if (f.micros[m] != null) mic[m] = Math.round(f.micros[m] * k * 100) / 100; }
    return { grams: r1(grams), macros: mac, micros: mic, usdaWeight: !!por && x.gramsSet == null, from: withBrand(f) };
  }

  /* ======================================================================================
     The sheet: one place for scan, photo, words and label, moving between them
     ====================================================================================== */
  function open(d, mode, o) {
    o = o || {};
    d = d || new Date();
    let api = null, stopCam = () => {}, closed = false;
    const st = { slot: o.slot || slotNow(), photo: o.photo || null, note: o.note || '', pendId: o.pendId || null };
    const title = { scan: 'Scan a barcode', photo: 'Photo of food', words: 'Say what you ate', label: 'Read a label' };

    function clear(t) { stopCam(); stopCam = () => {}; api.body.innerHTML = ''; api.foot.innerHTML = ''; if (t) api.setTitle(t); api.body.scrollTop = 0; }
    function go(m, arg) {
      if (m === 'scan') scanView();
      else if (m === 'photo') st.photo ? photoView() : pickPhoto(async f => { try { st.photo = await shrink(f); photoView(); } catch (e) { ui.toast(e.message); } });
      else if (m === 'words') wordsView();
      else if (m === 'label') labelView(arg);
    }
    function slotChips() {
      const sl = h('<div class="sec snap-slot"><div class="sh"><span class="t">With</span></div><div class="chips"></div></div>');
      SLOT_KEYS.forEach(k => { const c = h('<button class="chip" type="button" data-s="' + k + '">' + SLOTS[k] + '</button>'); c.onclick = () => { st.slot = k; draw(); ui.buzz(4); }; sl.querySelector('.chips').appendChild(c); });
      const draw = () => sl.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.s === st.slot)); draw();
      return sl;
    }
    function busy(text) { const b = h('<div class="snap-busy"><span class="snap-spin" aria-hidden="true"></span><span class="t"></span></div>'); b.querySelector('.t').textContent = text; return b; }
    function msg(text, cls) { const p = h('<p class="note snap-msg' + (cls ? ' ' + cls : '') + '"></p>'); p.textContent = text; return p; }
    const footBtns = (...bs) => { const f = h('<div class="btns"></div>'); bs.forEach(b => f.appendChild(b)); api.foot.innerHTML = ''; api.foot.appendChild(f); return f; };
    const btn = (label, cls, fn) => { const b = h('<button class="btn' + (cls ? ' ' + cls : '') + '" type="button"></button>'); b.innerHTML = label; b.onclick = fn; return b; };

    /* ---------------- 1. barcode ---------------- */
    function scanView() {
      clear('Scan a barcode');
      const b = api.body;
      const cam = h('<div class="snap-cam"><video playsinline muted autoplay></video><div class="snap-frame"><i></i><i></i><i></i><i></i><b class="snap-line"></b></div><button class="snap-torch" type="button" aria-label="Light" hidden>' + icon('torch') + '</button><div class="snap-cue">Starting the camera…</div></div>');
      b.appendChild(cam);
      const cue = cam.querySelector('.snap-cue'), video = cam.querySelector('video');
      const typed = h('<div class="snap-type" hidden><div class="field"><label for="snap-code">The numbers under the bars</label><input class="input num" id="snap-code" inputmode="numeric" autocomplete="off" placeholder="0 12345 67890 5"></div></div>');
      b.appendChild(typed);
      b.appendChild(h('<p class="small snap-tip">Hold the phone about a hand’s width away. The barcode is read on this phone; only the number is looked up.</p>'));
      const lk = h('<div class="chips snap-alt"></div>');
      const tbtn = h('<button class="chip" type="button">Type the number</button>');
      const pbtn = h('<button class="chip" type="button">Use a photo of it</button>');
      lk.appendChild(tbtn); lk.appendChild(pbtn); b.appendChild(lk);
      tbtn.onclick = () => { typed.hidden = false; stopCam(); cue.textContent = 'Camera off while you type'; setTimeout(() => typed.querySelector('input').focus(), 50); footBtns(btn('Look it up', '', () => { const v = typed.querySelector('input').value.replace(/\D/g, ''); if (!/^\d{8}$|^\d{12,14}$/.test(v)) { ui.toast('A barcode has 8, 12 or 13 numbers'); return; } lookup(v); })); };
      pbtn.onclick = () => pickPhoto(async f => {
        cue.textContent = 'Reading the photo…';
        try { const code = await readStill(f); if (code) lookup(code); else { cue.textContent = 'No barcode found in that photo. Try closer, or type the number.'; ui.buzz(20); } }
        catch (e) { cue.textContent = e.message; }
      });
      footBtns(btn('Cancel', 'quiet', () => api.close()));
      startCam(video, cue, cam).then(stop => { stopCam = stop; });
    }

    async function startCam(video, cue, cam) {
      let stream = null, alive = true, timer = null;
      const stop = () => { alive = false; clearTimeout(timer); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { cue.textContent = 'This phone can’t show the camera here. Use a photo of the barcode, or type the number.'; return stop; }
      try {
        const [s] = await Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }), reader()]);
        stream = s;
        if (!alive || closed) { stop(); return stop; }
        video.srcObject = stream; await video.play().catch(() => {});
        cue.textContent = 'Line up the barcode inside the frame';
        cam.classList.add('live');
        const track = stream.getVideoTracks()[0], caps = track && track.getCapabilities ? track.getCapabilities() : {};
        if (caps && caps.torch) { const tb = cam.querySelector('.snap-torch'); let on = false; tb.hidden = false; tb.onclick = () => { on = !on; track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {}); tb.classList.toggle('on', on); }; }
      } catch (e) {
        cue.textContent = e && e.name === 'NotAllowedError' ? 'Opus can’t use the camera. Allow it when asked, or in Settings › Safari › Camera. A photo of the barcode works too.' : e && e.message && /barcode reader/.test(e.message) ? e.message : 'The camera didn’t start. Use a photo of the barcode, or type the number.';
        return stop;
      }
      const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
      let misses = 0;
      const tick = async () => {
        if (!alive) return;
        const vw = video.videoWidth, vh = video.videoHeight;
        if (vw && vh) {
          // the middle of the picture, where the frame is, at up to 960 wide
          const cw = Math.round(vw * 0.86), ch = Math.round(vh * 0.6), sx = Math.round((vw - cw) / 2), sy = Math.round((vh - ch) / 2), k = Math.min(1, 960 / cw);
          c.width = Math.round(cw * k); c.height = Math.round(ch * k);
          ctx.drawImage(video, sx, sy, cw, ch, 0, 0, c.width, c.height);
          try {
            const code = await decode(ctx.getImageData(0, 0, c.width, c.height));
            if (code && alive) { ui.buzz(18); cam.classList.add('hit'); stop(); setTimeout(() => lookup(code), 220); return; }
          } catch (e) {}
          if (++misses === 60) cue.textContent = 'Still looking. More light, or a little farther away, helps.';
        }
        timer = setTimeout(tick, 140);
      };
      tick();
      return stop;
    }

    /* look the number up: your foods, then Open Food Facts, then USDA's branded foods */
    async function lookup(code) {
      clear('Scan a barcode');
      api.body.appendChild(busy('Looking up ' + code + '…'));
      footBtns(btn('Cancel', 'quiet', () => api.close()));
      const r = await findCode(code);
      if (closed) return;
      if (r.food) productView(r.food, code);
      else notFoundView(code, r.err);
    }

    function notFoundView(code, err) {
      clear('Not found');
      const b = api.body;
      b.appendChild(msg(err || 'Barcode ' + code + ' isn’t in the free databases yet. A photo of its Nutrition Facts panel fills it in, and Opus keeps it so the next scan is instant.'));
      const nm = h('<div class="field"><label for="snap-nm">What is it</label><input class="input" id="snap-nm" autocomplete="off" placeholder="Brand and product"></div>');
      b.appendChild(nm);
      footBtns(btn('Scan again', 'quiet', () => scanView()), btn(icon('camera') + ' Photo of the label', '', () => labelView({ code, name: nm.querySelector('input').value.trim() })));
    }

    /* a packaged food: label numbers, pick how much */
    function productView(food, code) {
      clear(food.name);
      const b = api.body, per = food.per, sv = food.serving;
      const head = h('<div class="snap-prod"><div class="snap-pk"></div><div class="snap-pn"></div><div class="snap-ps small"></div></div>');
      head.querySelector('.snap-pk').textContent = food.brand || 'Packaged food';
      head.querySelector('.snap-pn').textContent = food.name;
      head.querySelector('.snap-ps').textContent = food.srcText;
      b.appendChild(head);
      if (per.kcal == null) {
        b.appendChild(msg('This one has no numbers in the database yet. A photo of its Nutrition Facts panel fills them in.'));
        footBtns(btn('Scan again', 'quiet', () => scanView()), btn(icon('camera') + ' Photo of the label', '', () => labelView({ code, name: food.name, brand: food.brand })));
        return;
      }
      // how much: by weight on his scale (oz, lb, g, kg), worked out in servings; servings too when the label gives one
      const byServ = !!(sv && sv.g > 0);
      const units = WTS.concat(byServ ? ['serving'] : []);
      let u = scaleUnit(); if (units.indexOf(u) < 0) u = 'oz';
      let n = roundU((byServ ? sv.g : 100) / (u === 'serving' ? sv.g : WT[u]), u);
      const tot = h('<div class="eat-sum snap-tot"><div class="eat-k">You’re adding</div><div class="eat-v num"></div><div class="eat-p small num"></div></div>');
      b.appendChild(tot);
      const amtSec = h('<div class="sec"><div class="sh"><span class="t">How much</span><span class="c"></span></div><div class="snap-units" role="group" aria-label="Unit"></div><div class="snap-step"></div><div class="chips snap-qty"></div></div>');
      amtSec.querySelector('.c').textContent = byServ ? '1 serving = ' + sv.label : 'no serving size on the label';
      b.appendChild(amtSec);
      const gOf = (v, unit) => unit === 'serving' ? v * sv.g : v * WT[unit];
      let exact = byServ ? sv.g : 100; // grams from a chip or the starting serving, kept exact through unit changes
      const grams = () => exact != null ? exact : gOf(n, u);
      let stp = null, qs = [];
      function build() {
        const ub = amtSec.querySelector('.snap-units'); ub.innerHTML = '';
        units.forEach(x => { const c = h('<button class="snap-u" type="button"></button>'); c.textContent = x === 'serving' ? 'servings' : x; c.classList.toggle('on', x === u); c.setAttribute('aria-pressed', x === u ? 'true' : 'false'); c.onclick = () => { if (x === u) return; const g = grams(); u = x; setScaleUnit(u); n = roundU(g / gOf(1, u), u); build(); upd(); ui.buzz(4); }; ub.appendChild(c); });
        const box = amtSec.querySelector('.snap-step'); box.innerHTML = '';
        stp = ui.stepper({ label: u === 'serving' ? 'Servings' : 'Weight in ' + u, unit: u === 'serving' ? 'serving' : u, value: n, step: (v, dir) => Math.max(0, roundU((v || 0) + WSTEP[u] * dir, u)), onChange: v => { n = v || 0; exact = null; upd(); } });
        stp.set(n, true); stp.input.value = fmtU(n, u);
        box.appendChild(stp.el);
        const base = { oz: [2, 4, 8, 16], lb: [0.25, 0.5, 1, 2], g: [50, 100, 150, 200], kg: [0.1, 0.25, 0.5, 1], serving: [0.5, 1, 1.5, 2] }[u];
        qs = base.map(v => [v, u === 'serving' ? ({ 0.5: '½', 1: '1', 1.5: '1½', 2: '2' })[v] : fmtU(v, u) + ' ' + u]);
        if (byServ && u !== 'serving') qs.unshift([roundU(sv.g / WT[u], u), '1 serving (' + fmtU(sv.g / WT[u], u) + ' ' + u + ')', sv.g]);
        const packG = food.packG || (byServ && food.servings > 1 ? food.servings * sv.g : null);
        if (packG && (u !== 'serving' || food.servings <= 12)) qs.push([roundU(packG / gOf(1, u), u), 'Whole pack (' + fmtU(packG / gOf(1, u), u) + ' ' + (u === 'serving' ? 'servings' : u) + ')', packG]);
        const qb = amtSec.querySelector('.snap-qty'); qb.innerHTML = '';
        qs.forEach(([v, l, g0]) => { const c = h('<button class="chip" type="button"></button>'); c.textContent = l; c.onclick = () => { n = v; exact = g0 != null ? g0 : gOf(v, u); stp.set(v, true); stp.input.value = fmtU(v, u); upd(); ui.buzz(4); }; qb.appendChild(c); });
      }
      build();
      b.appendChild(slotChips());
      const known = Plan.library().find(x => x.barcode === code);
      const keep = h('<button class="row tap tgb on" type="button" style="width:100%;text-align:left"><span class="ck sq">' + ui.CK + '</span><span class="tx"><b>Keep in my foods</b><small>The next scan, or one tap in Add food, fills it in, even offline.</small></span></button>');
      let keepOn = true; keep.onclick = () => { keepOn = !keepOn; keep.classList.toggle('on', keepOn); };
      if (!known) b.appendChild(keep);
      function upd() {
        const g = grams(), k = g / 100, x = {}; ['kcal', 'protein', 'carbs', 'fat'].forEach(m => { x[m] = per[m] == null ? null : per[m] * k; });
        tot.querySelector('.eat-v').textContent = n > 0 ? n0(x.kcal) + ' cal · ' + n0(x.protein) + ' P · ' + n0(x.carbs) + ' C · ' + n0(x.fat) + ' F' : 'Nothing';
        const sNum = byServ ? r1(g / sv.g) : null;
        const parts = u === 'serving' ? [fmtU(n, u) + ' serving' + (n === 1 ? '' : 's'), U.wt(Math.round(g)) + ' g'] : [fmtU(n, u) + ' ' + u].concat(u !== 'g' ? [U.wt(Math.round(g)) + ' g'] : []).concat(byServ ? [fmtU(sNum, 'serving') + ' serving' + (sNum === 1 ? '' : 's')] : []);
        tot.querySelector('.eat-p').textContent = parts.concat([food.label ? 'numbers from the label' : 'numbers from the database']).join(' · ');
        amtSec.querySelectorAll('.snap-qty .chip').forEach((c, i) => c.classList.toggle('on', qs[i] && Math.abs(qs[i][0] - n) < 1e-9));
      }
      upd();
      footBtns(btn('Scan another', 'quiet', () => scanView()), btn('Add', '', () => {
        if (!(n > 0)) { ui.toast('How much did you have?'); return; }
        const g = grams(), k = g / 100, macros = { estimate: !food.label };
        ['kcal', 'protein', 'carbs', 'fat'].forEach(m => { macros[m] = per[m] == null ? null : r1(per[m] * k); });
        let micros = null; if (food.micros) { micros = { estimate: !food.label }; MICROS.forEach(m => { if (food.micros[m] != null) micros[m] = Math.round(food.micros[m] * k * 100) / 100; }); }
        const name = food.brand && !food.name.toLowerCase().includes(food.brand.toLowerCase()) ? food.brand + ' ' + food.name : food.name;
        const amount = u === 'g' ? Math.round(n) : roundU(n, u);
        const e = Object.assign({ id: newId(d), date: U.key(d), extra: true, name, amount, unit: u === 'serving' ? servUnit(sv) : u, grams: r1(g), slot: st.slot, macros, via: 'barcode', barcode: code, at: new Date().toISOString() }, byServ ? { servings: roundU(g / sv.g, 'serving') } : {}, micros ? { micros } : {});
        putEaten(e);
        const keepF = byServ ? sv.g / g : 100 / g;
        if (keepOn || known) keepFood(Object.assign({ name, amount: byServ ? 1 : 100, unit: byServ ? servUnit(sv) : 'g', macros: Plan.scaleMacros(macros, keepF), barcode: code, per100: per, serving: sv || null }, micros ? { micros: scaleMicros(micros, keepF) } : {}));
        Store.save(); ui.buzz(12); api.close();
        ui.toast('Added ' + name, { label: 'Undo', run: () => { dropEaten(e.id); Store.save(); Opus.refresh(); } });
      }));
    }

    /* ---------------- 2. a photo of food ---------------- */
    function photoView() {
      clear('Photo of food');
      const b = api.body;
      const pic = h('<div class="snap-pic"><img alt="Your photo"></div>'); pic.querySelector('img').src = st.photo; b.appendChild(pic);
      const note = h('<div class="field"><label for="snap-note">Anything it can’t see? <span class="opt">optional</span></label><textarea class="input" id="snap-note" rows="2" maxlength="400" placeholder="Where it’s from, the size, how much you ate. “1 slice, Domino’s large 5-cheese, hand tossed”"></textarea></div>');
      note.querySelector('textarea').value = st.note || '';
      note.querySelector('textarea').addEventListener('input', e => { st.note = e.target.value; });
      b.appendChild(note);
      const hints = h('<div class="chips snap-hints"></div>');
      ['Ate half', 'Shared it', 'Large', 'From a restaurant'].forEach(t => { const c = h('<button class="chip" type="button"></button>'); c.textContent = t; c.onclick = () => { const ta = note.querySelector('textarea'); ta.value = (ta.value.trim() ? ta.value.trim().replace(/[.,]?$/, ', ') : '') + t.toLowerCase(); st.note = ta.value; ui.buzz(4); }; hints.appendChild(c); });
      b.appendChild(hints);
      const left = readsLeft();
      if (left != null && left < 25) b.appendChild(msg('About ' + left + ' free photo reads left today. They come back at ' + resetAt() + '.', 'quiet'));
      footBtns(btn('Another photo', 'quiet', () => { st.photo = null; st.pendId = null; go('photo'); }), btn('Read it', '', () => readNow({ image: st.photo, text: st.note.trim() || undefined })));
    }

    /* ---------------- 3. in words ---------------- */
    function wordsView() {
      clear('Say what you ate');
      const b = api.body;
      const f = h('<div class="field"><label for="snap-words">What did you have, and how much?</label><textarea class="input" id="snap-words" rows="3" maxlength="400" placeholder="1 slice of Domino’s large 5-cheese pizza and a can of Coke"></textarea></div>');
      f.querySelector('textarea').value = st.note || '';
      f.querySelector('textarea').addEventListener('input', e => { st.note = e.target.value; });
      b.appendChild(f);
      b.appendChild(h('<p class="small" style="padding:0 4px">The more you give (the place, the size, how much), the closer it gets. Chain restaurants come from USDA’s measured numbers when it has them.</p>'));
      footBtns(btn('Cancel', 'quiet', () => api.close()), btn('Work it out', '', () => { const t = st.note.trim(); if (t.length < 3) { ui.toast('Say what you ate'); return; } readNow({ text: t }); }));
      setTimeout(() => f.querySelector('textarea').focus(), 380);
    }

    /* ---------------- reading (photo or words) ---------------- */
    async function readNow(body) {
      clear(body.image ? 'Reading your photo' : 'Working it out');
      const b = api.body;
      if (body.image) { const pic = h('<div class="snap-pic small"><img alt=""></div>'); pic.querySelector('img').src = body.image; b.appendChild(pic); }
      const bz = busy(body.image ? 'Looking at the photo…' : 'Reading what you wrote…'); b.appendChild(bz);
      footBtns(btn('Cancel', 'quiet', () => api.close()));
      const r = await ask(Object.assign({ mode: 'food' }, body));
      if (closed) return;
      if (!r.ok) return readFailed(r, body);
      if (st.pendId) { dropPending(st.pendId); st.pendId = null; }
      if (r.kind === 'label' && body.image) { labelView({ photo: body.image, ask: true }); return; }
      if (!r.items.length) {
        clear('Nothing to add');
        b.appendChild(msg(r.kind === 'none' ? 'I don’t see any food in that one.' : 'I couldn’t tell what that is.'));
        footBtns(btn('Say it in words', 'quiet', () => wordsView()), btn('Another photo', '', () => { st.photo = null; go('photo'); }));
        return;
      }
      bz.querySelector('.t').textContent = 'Finding the numbers in USDA…';
      const items = r.items.map(it => ({ base: it, name: it.name, amount: it.amount, unit: it.unit, gramsSet: null, src: null, alts: [], on: true, conf: it.confidence, how: it.how }));
      let usdaErr = null;
      await Promise.all(items.map(async x => { const m = await matchesFor(x.base); x.alts = m.list; x.src = m.list[0] || null; if (m.err) usdaErr = m.err; }));
      if (closed) return;
      resultsView(items, r, body, usdaErr);
    }
    function readFailed(r, body) {
      clear(r.code === 'offline' ? 'Saved for later' : 'Couldn’t read it');
      const b = api.body;
      if ((r.code === 'offline' || r.code === 'failed' || r.code === 'limit') && body.image) {
        const id = st.pendId || 'p' + Date.now().toString(36);
        keepPending({ id, at: new Date().toISOString(), date: U.key(d), slot: st.slot, img: body.image, note: body.text || '' }); st.pendId = id;
        b.appendChild(msg((r.code === 'offline' ? 'You’re offline, so the photo is kept on this phone.' : r.error) + ' It waits on the Food tab; tap it there to read it later.'));
      } else b.appendChild(msg(r.error || 'That didn’t work.'));
      const words = (body.text || '').trim();
      footBtns(btn('Close', 'quiet', () => api.close()),
        r.code === 'offline' || r.code === 'setup' || r.code === 'limit'
          ? btn('Search instead', '', () => { api.close(); Opus.food.addFood(d, { slot: st.slot, query: words }); })
          : btn('Try again', '', () => readNow(body)));
    }

    function resultsView(items, r, body, usdaErr) {
      clear(items.length === 1 ? items[0].name : items.length + ' foods');
      const b = api.body;
      let addB = null;
      if (body.image) { const pic = h('<div class="snap-pic small"><img alt=""></div>'); pic.querySelector('img').src = body.image; b.appendChild(pic); }
      const tot = h('<div class="eat-sum snap-tot"><div class="eat-k">Estimate</div><div class="eat-v num"></div><div class="eat-p small"></div></div>');
      b.appendChild(tot);
      if (r.note) b.appendChild(msg(r.note, 'quiet'));
      if (r.kind === 'package') b.appendChild(msg('This looks packaged. Scanning its barcode gives the label’s exact numbers.', 'quiet'));
      if (usdaErr) b.appendChild(msg('USDA didn’t answer (' + usdaErr.replace(/\.$/, '') + '), so these use the photo’s own rough numbers.', 'quiet'));
      const card = h('<div class="card snap-items"></div>'); b.appendChild(card);
      const rows = items.map(x => itemRow(x));
      rows.forEach(rw => card.appendChild(rw.el));
      b.appendChild(slotChips());
      const keep = h('<button class="row tap tgb" type="button" style="width:100%;text-align:left"><span class="ck sq">' + ui.CK + '</span><span class="tx"><b>Keep in my foods</b><small>For things you have often: one tap next time.</small></span></button>');
      let keepOn = false; keep.onclick = () => { keepOn = !keepOn; keep.classList.toggle('on', keepOn); };
      b.appendChild(keep);
      b.appendChild(h('<p class="small" style="padding:0 4px">Everything here is an estimate. Tap a food to change how much, or pick a closer match.</p>'));
      function total() {
        const on = items.filter(x => x.on), fs = on.map(figure), t = { kcal: 0, protein: 0 }; let miss = 0;
        fs.forEach(f => { if (!f.macros || f.macros.kcal == null) miss++; else { t.kcal += f.macros.kcal; t.protein += f.macros.protein || 0; } });
        tot.querySelector('.eat-v').textContent = on.length ? '≈ ' + n0(t.kcal) + ' cal · ' + n0(t.protein) + ' g protein' : 'Nothing picked';
        tot.querySelector('.eat-p').textContent = on.length ? on.length + ' food' + (on.length === 1 ? '' : 's') + (miss ? ' · ' + miss + ' without numbers' : '') : '';
        if (addB) addB.textContent = on.length > 1 ? 'Add ' + on.length + ' foods' : 'Add';
      }
      function itemRow(x) {
        const el = h('<div class="snap-it"><button class="snap-ih" type="button"><span class="ck on">' + ui.CK + '</span><span class="tx"><b></b><small class="num"></small><small class="snap-from"></small></span>' + ui.icon('chev', 'chev ico') + '</button><div class="snap-ed" hidden></div></div>');
        const paint = () => {
          const f = figure(x);
          el.classList.toggle('off', !x.on); el.querySelector('.ck').classList.toggle('on', x.on);
          el.querySelector('b').textContent = x.name;
          el.querySelector('.num').textContent = [U.wt(x.amount) + ' ' + x.unit, f.grams != null ? (x.gramsSet != null ? '' : '≈ ') + showW(f.grams, WT[scaleUnit()] ? scaleUnit() : 'g') + (WT[scaleUnit()] && scaleUnit() !== 'g' ? ' (' + n0(f.grams) + ' g)' : '') : null, f.macros && f.macros.kcal != null ? n0(f.macros.kcal) + ' cal' : 'no numbers', f.macros && f.macros.protein != null ? n0(f.macros.protein) + ' g protein' : null].filter(Boolean).join(' · ');
          el.querySelector('.snap-from').textContent = (x.src ? 'USDA: ' : '') + f.from + (x.conf === 'low' ? ' · worth a check' : '');
          total();
        };
        el.querySelector('.ck').onclick = e => { e.stopPropagation(); x.on = !x.on; ui.buzz(6); paint(); };
        el.querySelector('.snap-ih').onclick = () => { const ed = el.querySelector('.snap-ed'); ed.hidden = !ed.hidden; if (!ed.hidden && !ed.firstChild) edit(ed); ui.buzz(4); };
        function edit(ed) {
          const nm = h('<div class="field"><label>Name</label><input class="input" autocomplete="off"></div>');
          nm.querySelector('input').value = x.name; nm.querySelector('input').oninput = e => { x.name = e.target.value.trim() || x.base.name; paint(); };
          ed.appendChild(nm);
          const row = h('<div class="snap-amt"><div class="field"><label>How much</label></div><div class="field"><label>Weighed</label><div class="snap-wt"><input class="input num" inputmode="decimal" placeholder="auto"><select class="input" aria-label="Unit">' + WTS.map(w => '<option>' + w + '</option>').join('') + '</select></div></div></div>');
          const stp = ui.stepper({ label: 'Amount', unit: x.unit, value: x.amount, step: (v, dir) => Math.max(0, Math.round(((v || 0) + (/^(g|ml)$/i.test(x.unit) ? 10 : 0.5) * dir) * 100) / 100), onChange: v => { x.amount = v || 0; x.gramsSet = null; gi.value = ''; paint(); } });
          row.children[0].appendChild(stp.el);
          const gi = row.children[1].querySelector('input'), gu = row.children[1].querySelector('select'); gu.value = WT[scaleUnit()] ? scaleUnit() : 'oz';
          const wIn = () => { const v = Number(gi.value.replace(',', '.')); x.gramsSet = gi.value.trim() && v >= 0 ? v * WT[gu.value] : null; paint(); };
          gi.oninput = wIn; gu.onchange = () => { setScaleUnit(gu.value); wIn(); };
          ed.appendChild(row);
          if (x.how) ed.appendChild(h('<p class="small snap-how">Sized by: ' + esc(x.how) + '</p>'));
          const ms = h('<div class="sec"><div class="sh"><span class="t">Closest matches</span></div><div class="snap-alts"></div></div>');
          const alts = x.alts.map(f => [f, withBrand(f), f.kind]).concat(x.base.guess && x.base.guess.kcal != null ? [[null, 'The photo’s own rough numbers', 'Guess']] : []);
          alts.forEach(([f, l, k]) => {
            const c = h('<button class="snap-alt-r" type="button"><span class="tx"><b></b><small></small></span></button>');
            c.querySelector('b').textContent = l; c.querySelector('small').textContent = k + (f && f.per.kcal != null ? ' · ' + n0(f.per.kcal) + ' cal per 100 g' : '');
            c.onclick = () => { x.src = f; ms.querySelectorAll('.snap-alt-r').forEach(y => y.classList.toggle('on', y === c)); ui.buzz(4); paint(); };
            if (f === x.src) c.classList.add('on');
            ms.querySelector('.snap-alts').appendChild(c);
          });
          const more = h('<button class="link small" type="button">Search for it by name instead</button>');
          more.onclick = async () => {
            const q = x.name; more.textContent = 'Searching…';
            const m = await matchesFor({ query: q, name: q });
            more.textContent = m.list.length ? 'Searched “' + q + '”' : 'Nothing found for “' + q + '”';
            m.list.forEach(f => { if (!x.alts.some(a => a.id === f.id)) x.alts.push(f); });
            ed.innerHTML = ''; edit(ed);
          };
          ms.appendChild(more);
          ed.appendChild(ms);
        }
        paint();
        return { el };
      }
      addB = btn('Add', '', () => {
        const on = items.filter(x => x.on); if (!on.length) { ui.toast('Pick at least one'); return; }
        const ids = [];
        on.forEach(x => {
          const f = figure(x);
          const e = Object.assign({ id: newId(d), date: U.key(d), extra: true, name: x.name, amount: x.amount, unit: x.unit, slot: st.slot, macros: f.macros, via: body.image ? 'photo' : 'words', at: new Date().toISOString() }, f.grams != null ? { grams: f.grams } : {}, f.micros ? { micros: f.micros } : {}, x.src ? { match: x.src.id } : {});
          putEaten(e); ids.push(e.id);
          if (keepOn) keepFood(Object.assign({ name: x.name, amount: x.amount, unit: x.unit, macros: f.macros }, f.micros ? { micros: f.micros } : {}));
        });
        Store.save(); ui.buzz(12); api.close();
        ui.toast('Added ' + (on.length === 1 ? on[0].name : on.length + ' foods') + (keepOn ? ', and kept in your foods' : ''), { label: 'Undo', run: () => { ids.forEach(dropEaten); Store.save(); Opus.refresh(); } });
      });
      footBtns(btn('Start over', 'quiet', () => body.image ? photoView() : wordsView()), addB);
      total();
    }

    /* ---------------- 4. a Nutrition Facts label ---------------- */
    function labelView(a) {
      a = a || {};
      const run = async photo => {
        clear('Reading the label');
        const pic = h('<div class="snap-pic small"><img alt=""></div>'); pic.querySelector('img').src = photo; api.body.appendChild(pic);
        api.body.appendChild(busy('Reading the numbers…'));
        footBtns(btn('Cancel', 'quiet', () => api.close()));
        const r = await ask({ mode: 'label', image: photo });
        if (closed) return;
        if (!r.ok) { clear('Couldn’t read it'); api.body.appendChild(msg(r.error)); footBtns(btn('Close', 'quiet', () => api.close()), btn('Try again', '', () => run(photo))); return; }
        labelFormView(r.label, a);
      };
      if (a.photo && a.ask) {
        clear('That’s a label');
        api.body.appendChild(msg('That photo is a Nutrition Facts panel. Read it as printed?'));
        footBtns(btn('No, it’s food', 'quiet', () => { st.note = (st.note ? st.note + '. ' : '') + 'This is food, not a label'; readNow({ image: a.photo, text: st.note }); }), btn('Read the label', '', () => run(a.photo)));
        return;
      }
      if (a.photo) { run(a.photo); return; }
      clear('Read a label');
      api.body.appendChild(msg('Take a photo of the Nutrition Facts panel, straight on and in good light. Opus reads it as printed and asks you to check it.'));
      footBtns(btn('Cancel', 'quiet', () => api.close()), btn(icon('camera') + ' Take the photo', '', () => pickPhoto(async f => { try { run(await shrink(f, 1400)); } catch (e) { ui.toast(e.message); } })));
    }
    /* what the label said, in fields you can fix before it counts */
    function labelFormView(L, a) {
      clear('Check the label');
      const b = api.body;
      b.appendChild(msg('Read from your photo. Check each number against the label; fix any that are off. Blanks couldn’t be read.', 'quiet'));
      const F = [['name', 'Name', 'text', [L.brand, L.name].filter(Boolean).join(' ') || a.name || ''], ['serving', 'Serving size', 'text', L.serving || ''], ['servingG', 'Serving (g)', 'n', L.servingG], ['servings', 'Servings per pack', 'n', L.servings], ['kcal', 'Calories', 'n', L.kcal], ['protein', 'Protein (g)', 'n', L.protein], ['carbs', 'Carbs (g)', 'n', L.carbs], ['fat', 'Fat (g)', 'n', L.fat], ['fiber', 'Fiber (g)', 'n', L.fiber], ['sodium', 'Sodium (mg)', 'n', L.sodium]];
      const g = h('<div class="grid2 snap-lbl"></div>'); b.appendChild(g);
      const inp = {};
      F.forEach(([k, l, t, v]) => { const f = h('<div class="field' + (k === 'name' ? ' wide' : '') + '"><label></label><input class="input' + (t === 'n' ? ' num' : '') + '" autocomplete="off"' + (t === 'n' ? ' inputmode="decimal"' : '') + '></div>'); f.querySelector('label').textContent = l; f.querySelector('input').value = v == null ? '' : v; if (v == null && t === 'n') f.classList.add('blank'); inp[k] = f.querySelector('input'); g.appendChild(f); });
      footBtns(btn('Retake', 'quiet', () => labelView({ code: a.code, name: inp.name.value })), btn('Looks right', '', () => {
        const num = k => { const s = inp[k].value.trim(); if (!s) return null; const v = Number(s.replace(',', '.')); return v >= 0 ? v : NaN; };
        const vals = {}; for (const [k, , t] of F) if (t === 'n') { vals[k] = num(k); if (Number.isNaN(vals[k])) { ui.toast(F.find(x => x[0] === k)[1] + ': numbers only'); return; } }
        const name = inp.name.value.trim(); if (!name) { ui.toast('Give it a name'); inp.name.focus(); return; }
        if (vals.kcal == null) { ui.toast('Calories are needed'); inp.kcal.focus(); return; }
        const sg = vals.servingG, k = sg > 0 ? 100 / sg : null;
        const per = sg > 0 ? { kcal: vals.kcal * k, protein: vals.protein == null ? null : vals.protein * k, carbs: vals.carbs == null ? null : vals.carbs * k, fat: vals.fat == null ? null : vals.fat * k } : null;
        const micros = {}; if (vals.fiber != null && k) micros.fiber = vals.fiber * k; if (vals.sodium != null && k) micros.sodium = vals.sodium * k;
        if (per) {
          productView({ name, brand: '', per, micros: Object.keys(micros).length ? micros : null, serving: { label: (inp.serving.value.trim() || '1 serving') + (/\d\s*g\b/i.test(inp.serving.value) ? '' : ' · ' + U.wt(sg) + ' g'), g: sg }, servings: vals.servings, label: true, srcText: 'From your photo of the label' }, a.code || null);
        } else {
          // no serving weight: count servings as printed
          const e = { id: newId(d), date: U.key(d), extra: true, name, amount: 1, unit: 'serving' + (inp.serving.value.trim() ? ' (' + inp.serving.value.trim() + ')' : ''), slot: st.slot, macros: { kcal: vals.kcal, protein: vals.protein, carbs: vals.carbs, fat: vals.fat, estimate: false }, via: 'label', at: new Date().toISOString() };
          if (a.code) e.barcode = a.code;
          putEaten(e); keepFood({ name, amount: 1, unit: e.unit, macros: e.macros, barcode: a.code || undefined }); Store.save(); api.close();
          ui.toast('Added ' + name + ', and kept in your foods', { label: 'Undo', run: () => { dropEaten(e.id); Store.save(); Opus.refresh(); } });
        }
      }));
    }
    // opened last, so everything above exists when the first view draws
    ui.sheet({ title: title[mode] || 'Food camera', kicker: Plan.foodOff(d) ? 'Off day · ' + U.fmtDateShort(d) : U.key(d) === U.key() ? 'Today' : U.fmtDateShort(d), foot: true, full: true,
      onClose: () => { closed = true; stopCam(); o.after && o.after(); Opus.refresh(); },
      render(a) { api = a; a.el.classList.add('snap-sheet'); go(mode); } });
    return api;
  }
  const scaleMicros = (m, f) => { const o = {}; for (const k in m) o[k] = typeof m[k] === 'number' ? Math.round(m[k] * f * 100) / 100 : m[k]; return o; };

  /* ---------- barcode reading (on this phone) ---------- */
  let readerP = null;
  function reader() {
    if (readerP) return readerP;
    readerP = new Promise((res, rej) => {
      if (window.ZXingWASM) { res(window.ZXingWASM); return; }
      const s = document.createElement('script'); s.src = 'js/vendor/zxing/reader.js';
      s.onload = () => { try { window.ZXingWASM.prepareZXingModule({ overrides: { locateFile: (p, pre) => p.endsWith('.wasm') ? new URL('js/vendor/zxing/' + p, location.href).href : pre + p } }); res(window.ZXingWASM); } catch (e) { rej(e); } };
      s.onerror = () => { readerP = null; rej(new Error('The barcode reader didn’t load. It needs a signal the first time.')); };
      document.head.appendChild(s);
    });
    return readerP;
  }
  const FORMATS = ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'];
  async function decode(src) {
    const Z = await reader();
    const res = await Z.readBarcodes(src, { formats: FORMATS, tryHarder: true, maxNumberOfSymbols: 1 });
    const hit = (res || []).find(x => x.isValid && /^\d{8,14}$/.test(x.text));
    return hit ? hit.text : null;
  }
  async function readStill(file) {
    const url = await shrink(file, 1600), blob = await (await fetch(url)).blob();
    return decode(blob);
  }
  // the same product can be written 12 or 13 digits long (UPC-A is EAN-13 with a leading 0)
  function variants(code) {
    const c = String(code).replace(/\D/g, ''), v = new Set([c]);
    if (c.length === 12) v.add('0' + c); if (c.length === 13 && c[0] === '0') v.add(c.slice(1)); if (c.length === 14 && c[0] === '0') { v.add(c.slice(1)); v.add(c.slice(2)); }
    return Array.from(v);
  }
  async function findCode(code) {
    const vs = variants(code);
    // 1. yours (instant, offline)
    const mine = Plan.library().find(x => x.barcode && vs.includes(String(x.barcode)));
    if (mine) {
      const per = mine.per100 || null, sv = mine.serving || null;
      if (per) return { food: { name: mine.name, brand: '', per, micros: null, serving: sv, servings: null, label: mine.macros && mine.macros.estimate === false, srcText: 'From your foods' } };
      return { food: { name: mine.name, brand: '', per: perFromItem(mine), micros: null, serving: { label: [mine.amount, mine.unit].filter(Boolean).join(' '), g: 100 }, label: true, srcText: 'From your foods (per ' + [mine.amount, mine.unit].filter(Boolean).join(' ') + ')' } };
    }
    if (navigator.onLine === false) return { err: 'You’re offline, and ' + code + ' isn’t in your foods yet. Type what it is in Add food, or scan again with a signal.' };
    // 2. Open Food Facts: the label as printed, by barcode
    let err = null;
    for (const c of vs) {
      try {
        const r = await fetchT('https://world.openfoodfacts.org/api/v2/product/' + c + '.json?fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments,product_quantity,product_quantity_unit,quantity', 9000);
        if (r.ok) {
          const j = await r.json();
          if (j && j.status === 1 && j.product) {
            const f = Opus.foodSearch.fromOFF(Object.assign({ code: c }, j.product)) || { name: Opus.foodSearch.tidy(j.product.product_name || ''), per: { kcal: null }, portions: [] };
            if (f.name) {
              const p = j.product, sq = Number(p.serving_quantity), pq = Number(p.product_quantity);
              return { food: { name: f.name, brand: f.brand || '', per: f.per, micros: f.micros, serving: sq > 0 ? { label: Opus.foodSearch.tidy(p.serving_size) || U.wt(sq) + ' g', g: sq } : null, servings: sq > 0 && pq > 0 ? Math.round(pq / sq * 10) / 10 : null, packG: pq > 0 && !/ml/i.test(p.product_quantity_unit || '') ? pq : null, label: true, srcText: 'Label numbers, from Open Food Facts' } };
            }
          }
        }
      } catch (e) { err = 'Open Food Facts didn’t answer.'; }
    }
    // 3. USDA's branded foods carry the barcode too
    try {
      const key = (Opus.foodSearch.key && Opus.foodSearch.key()) || 'DEMO_KEY';
      const r = await fetchT('https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(key) + '&query=' + encodeURIComponent(vs[0]) + '&dataType=Branded&pageSize=10', 10000);
      if (r.ok) {
        const j = await r.json();
        const hit = (j.foods || []).find(f => vs.some(c => String(f.gtinUpc || '').replace(/^0+/, '') === c.replace(/^0+/, '')));
        if (hit) {
          const f = Opus.foodSearch.fromUSDA(hit);
          if (f) { const p = f.portions[0]; return { food: { name: f.name, brand: f.brand, per: f.per, micros: f.micros, serving: p ? { label: p.label.split(' · ')[0] + ' · ' + U.wt(p.g) + ' g', g: p.g } : null, label: true, srcText: 'Label numbers, from USDA’s branded foods' } }; }
        }
      } else if (r.status === 429) err = (err ? err + ' ' : '') + 'USDA’s shared key is used up for now.';
    } catch (e) { err = (err ? err + ' ' : '') + 'USDA didn’t answer.'; }
    return { err: err ? 'Couldn’t check every database (' + err.replace(/\.$/, '') + '). Barcode ' + code + ' wasn’t found where it looked. A photo of its Nutrition Facts panel fills it in.' : null };
  }
  function perFromItem(x) { const m = x.macros || {}; return { kcal: m.kcal == null ? null : m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat }; }
  async function fetchT(url, ms) {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, t = setTimeout(() => ac && ac.abort(), ms || 10000);
    try { return await fetch(url, ac ? { signal: ac.signal } : {}); } finally { clearTimeout(t); }
  }

  /* ---------- on the Food tab ---------- */
  // three ways in, under Add food
  function buttons(d, o) {
    const row = h('<div class="snap-ways"><button class="snap-w" type="button" data-m="scan">' + icon('scan') + '<span>Scan</span></button><button class="snap-w" type="button" data-m="photo">' + icon('camera') + '<span>Photo</span></button><button class="snap-w" type="button" data-m="words">' + icon('words') + '<span>Describe</span></button></div>');
    row.querySelectorAll('.snap-w').forEach(b => { b.onclick = () => { if (o && o.before) o.before(); start(d, b.dataset.m, o); }; });
    return row;
  }
  // the photo picker has to open from the tap itself, before any sheet
  function start(d, m, o) {
    o = o || {};
    if (m === 'photo') pickPhoto(async f => { try { open(d, 'photo', Object.assign({}, o, { photo: await shrink(f) })); } catch (e) { ui.toast(e.message); } });
    else open(d, m, o);
  }
  // photos kept while there was no signal
  function pendingCard(d) {
    const L = pending(); if (!L.length) return null;
    const c = h('<div class="snap-wait"><div class="snap-thumbs"></div><div class="tx"><b></b><small></small></div><button class="btn sm" type="button">Read</button></div>');
    L.slice(-3).forEach(p => { const i = h('<img alt="">'); i.src = p.img; c.querySelector('.snap-thumbs').appendChild(i); });
    c.querySelector('b').textContent = L.length === 1 ? 'A photo is waiting' : L.length + ' photos are waiting';
    c.querySelector('small').textContent = navigator.onLine === false ? 'They’ll be read once you have a signal.' : 'Tap Read to fill them in.';
    c.querySelector('.btn').onclick = () => { const p = L[0]; open(p.date ? U.parseKey(p.date) : d, 'photo', { photo: p.img, note: p.note, slot: p.slot, pendId: p.id }); };
    const x = h('<button class="snap-wx" type="button" aria-label="Throw away the waiting photos">' + ui.icon('close') + '</button>');
    x.onclick = () => { const was = pending(); ls.set(PEND_LS, null); Opus.refresh(); ui.toast('Waiting photos thrown away', { label: 'Undo', run: () => { ls.set(PEND_LS, was); Opus.refresh(); } }); };
    c.appendChild(x);
    return c;
  }
  window.addEventListener('online', () => { if (pending().length && Opus.current && Opus.current() === 'food') try { Opus.refresh(); } catch (e) {} });

  Opus.snap = { open, start, buttons, ask, shrink, pickPhoto, pendingCard, findCode, variants, figure, portionFor, readsLeft, pending, reader, decode };
})();
