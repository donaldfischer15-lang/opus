/* Hair, on Body: a hair routine from the plan (health.hair), its daily ticks on Today, a side-effect check, a monthly
   photo set from five fixed angles with last month's photo as a guide, blind side-by-side comparisons at the plan's
   checkpoints, and WHOOP's resting heart rate over 30 days.
   Everything personal (the routine, the products, the wording of notes and expectations) lives in the private plan;
   this file only lays it out. Photos stay on the phone (IndexedDB) and a resized copy goes to the data repo under
   hair/, never to the app's own repo. Nothing here scores progress or reads a trend as a diagnosis. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const ANGLES = [
    ['front', 'Front', 'Face the camera, hairline straight on, phone at eye level.'],
    ['top', 'Top', 'Hold the phone above your head, looking straight down at the middle of your scalp.'],
    ['crown', 'Crown', 'Phone behind and above your head. The timer helps, or have someone take it.'],
    ['left', 'Left temple', 'Turn your head so your left temple faces the camera, at eye level.'],
    ['right', 'Right temple', 'Turn your head so your right temple faces the camera, at eye level.']
  ];
  const ANGLE = Object.fromEntries(ANGLES.map(a => [a[0], a]));
  const P = () => { const x = (Plan.p.health || {}).hair; return x && typeof x === 'object' ? x : null; };
  const notes = () => (P() && P().notes) || {};
  const L = () => {
    const d = Store.data; if (!d.hair || typeof d.hair !== 'object') d.hair = {};
    for (const k of ['effects', 'photos', 'compares']) if (!Array.isArray(d.hair[k])) d.hair[k] = [];
    return d.hair;
  };
  const iso = () => new Date().toISOString();
  const lower1 = s => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s || '');
  const shortDate = k => U.fmtDateShort(k);
  const monthName = k => { const d = U.parseKey(k); return U.MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };

  /* ---------- the routine and its ticks (the day's checks, ids "hair:<id>") ---------- */
  const routine = () => (P() && Array.isArray(P().routine) ? P().routine : []);
  const extras = () => (P() && Array.isArray(P().extras) ? P().extras : []);
  const dueOn = (x, d) => U.matchDays(x.days || 'all', U.dayKey(d), Plan.isWorkday(d));
  const ticked = (d, id) => (Store.data.checks[U.key(d)] || []).includes('hair:' + id);
  const restItem = () => routine().find(r => r.rule); // the item with a "nothing after" rule (needling)
  function extraLive(x, d) { return !(x.emptied && x.emptied <= U.key(d)) && dueOn(x, d); }
  function restDay(d) { const r = restItem(); return r && dueOn(r, d) ? r : null; }

  /* the photo set due: on the plan's day of the month (a day later if that's the rest day), for a week after */
  function photoTarget(d) {
    const p = P(); if (!p) return null;
    const day = Math.min(28, Math.max(1, Number(p.photoDay) || 4));
    let t = new Date(d.getFullYear(), d.getMonth(), day);
    if (restDay(t)) t = U.addDays(t, 1);
    return t;
  }
  const sets = () => { // complete and partial sets, newest first: [{ date, angles: { angle: photo }, n }]
    const by = {};
    for (const x of L().photos) { if (!x || !x.date || !ANGLE[x.angle]) continue; (by[x.date] = by[x.date] || { date: x.date, angles: {} }).angles[x.angle] = x; }
    return Object.values(by).map(s => Object.assign(s, { n: Object.keys(s.angles).length })).sort((a, b) => b.date.localeCompare(a.date));
  };
  const fullSets = () => sets().filter(s => s.n === ANGLES.length);
  const baseline = () => { const f = fullSets(); return f.find(s => Object.values(s.angles).some(x => x.baseline)) || f[f.length - 1] || null; };
  function photosDue(d) {
    const p = P(); if (!p) return null;
    if (!fullSets().length) return { first: true, target: d };
    const t = photoTarget(d), k = U.key(d), tk = U.key(t);
    if (k < tk || U.daysBetween(t, d) > 6) return null;
    const month = tk.slice(0, 7);
    if (fullSets().some(s => s.date.slice(0, 7) === month && s.date >= U.key(U.addDays(t, -6)))) return null;
    return { first: false, target: t };
  }

  Plan.mods.push({
    prefix: 'hair',
    items(d) {
      const p = P(); if (!p) return [];
      const out = [], rest = restDay(d), restDone = rest && ticked(d, rest.id), yRest = restDay(U.addDays(d, -1)), yDone = yRest && ticked(U.addDays(d, -1), yRest.id);
      for (const r of routine()) {
        if (!r.id || !r.name || !dueOn(r, d)) continue;
        out.push({ id: 'hair:' + r.id, title: r.name, part: r.part || 'evening', time: null, kind: 'hair', detail: [r.minutes ? r.minutes + ' min' : '', r.rule || ''].filter(Boolean).join(' · ') });
      }
      for (const x of extras()) {
        if (!x.id || !x.name || !extraLive(x, d)) continue;
        if (rest && restDone) continue; // nothing on the scalp after the rest item today
        out.push({ id: 'hair:' + x.id, title: x.name, part: x.part || 'evening', time: null, kind: 'hair', detail: 'Extra' + (yDone ? ' · wait until 24 hours after last night’s ' + lower1(yRest.name) : '') });
      }
      const due = photosDue(d);
      if (due) out.push({ id: 'hair:photos', title: due.first ? 'Hair photos: your starting set' : 'Hair photos', part: 'evening', time: null, kind: 'hairphotos', detail: (rest ? 'Before ' + lower1(rest.name) + ' · ' : '') + 'Five angles, about 5 minutes', openLabel: 'Take them', open: after => photoFlow(after) });
      return out;
    },
    checked(d) {
      const own = (Store.data.checks[U.key(d)] || []).filter(id => String(id).startsWith('hair:'));
      const k = U.key(d); if (sets().some(s => s.date === k && s.n === ANGLES.length) && !own.includes('hair:photos')) own.push('hair:photos');
      return own;
    },
    set(d, id, on) {
      if (id === 'hair:photos') { if (on) photoFlow(() => Opus.todayRefresh && Opus.todayRefresh()); return; }
      const k = U.key(d), a = Store.data.checks[k] = Store.data.checks[k] || [], i = a.indexOf(id);
      if (on && i < 0) a.push(id); if (!on && i >= 0) a.splice(i, 1);
      // an extra ticked within a day of the rest item: one quiet line, never a block
      const x = extras().find(e => 'hair:' + e.id === id), yRest = restDay(U.addDays(d, -1));
      if (on && x && yRest && ticked(U.addDays(d, -1), yRest.id) && new Date().getHours() < 18) ui.toast('Usually you’d wait 24 hours after ' + lower1(yRest.name) + '.');
    }
  });

  /* ---------- photos: kept on the phone, a copy in the data repo ---------- */
  const DB = 'opus-photos', ST = 'p';
  function db() {
    return new Promise((res, rej) => {
      try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
      catch (e) { rej(e); }
    });
  }
  async function idbPut(k, blob) { const x = await db(); return new Promise((res, rej) => { const t = x.transaction(ST, 'readwrite'); t.objectStore(ST).put(blob, k); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); }); }
  async function idbGet(k) { const x = await db(); return new Promise(res => { const t = x.transaction(ST, 'readonly'), r = t.objectStore(ST).get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); }
  const urls = {};
  async function photoURL(file) {
    if (!file) return null;
    if (urls[file]) return urls[file];
    let b = null; try { b = await idbGet(file); } catch (e) {}
    if (!b && Opus.sync && Opus.sync.raw) { try { b = await Opus.sync.raw(file); if (b) idbPut(file, b).catch(() => {}); } catch (e) {} }
    return b ? (urls[file] = URL.createObjectURL(b)) : null;
  }
  const b64of = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  let uploading = false;
  async function upload() { // every photo not yet in the data repo, one at a time
    if (uploading || !(Opus.sync && Opus.sync.putRaw && Opus.sync.cfg && Opus.sync.cfg() && Opus.sync.cfg().token) || navigator.onLine === false) return;
    uploading = true;
    try {
      for (const x of L().photos.filter(p => p && p.file && !p.up)) {
        let b = null; try { b = await idbGet(x.file); } catch (e) {}
        if (!b) continue;
        try { await Opus.sync.putRaw(x.file, await b64of(b), 'Opus: hair photo ' + x.date + ' ' + x.angle); x.up = true; Store.save(); } catch (e) { break; }
      }
    } finally { uploading = false; }
  }
  Opus.onBoot(() => { setTimeout(upload, 4000); window.addEventListener('online', () => upload()); });

  /* a frame from the camera (or a picked photo) at up to 1200 px on the long edge */
  function toJpeg(src, w, hgt) {
    const s = Math.min(1, 1200 / Math.max(w, hgt)), c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(hgt * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.85));
  }
  function fileToJpeg(f) {
    return new Promise((res, rej) => { const url = URL.createObjectURL(f), img = new Image(); img.onload = async () => { const b = await toJpeg(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); res(b); }; img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That photo couldn’t be opened.')); }; img.src = url; });
  }
  const lastLength = () => { const s = sets()[0]; return s ? Object.values(s.angles)[0].length || null : null; };
  const lengthText = l => !l ? 'length not noted' : l.guard != null ? 'guard ' + l.guard + (l.mm ? ' (' + l.mm + ' mm)' : '') : 'growing' + (l.cut ? ', last cut ' + shortDate(l.cut) : '') + (l.mm ? ' (' + l.mm + ' mm)' : '');
  const sameLength = (a, b) => !!a && !!b && (a.guard ?? 'g') === (b.guard ?? 'g') && (a.cut || '') === (b.cut || '') && (a.mm || null) === (b.mm || null);

  /* the photo set: what to check first, hair length, then five angles */
  function photoFlow(after) {
    const p = P(); if (!p) return;
    const date = U.key(), have = (sets().find(s => s.date === date) || { angles: {} }).angles;
    const prev = sets().find(s => s.date !== date && s.n) || null;
    let len = (Object.values(have)[0] || {}).length || lastLength() || null, step = 0, stopCam = null, closed = false;
    const sh = ui.sheet({ title: 'Hair photos', kicker: shortDate(date), full: true, onClose() { closed = true; if (stopCam) stopCam(); after && after(); }, render(api) { draw(api); } });
    function draw(api) {
      if (stopCam) { stopCam(); stopCam = null; }
      const b = api.body; b.innerHTML = '';
      if (step === 0) return intro(api, b);
      const todo = ANGLES.filter(a => !have[a[0]]);
      if (!todo.length) return done(api, b);
      shoot(api, b, todo[0], ANGLES.length - todo.length + 1);
    }
    function intro(api, b) {
      const rest = restDay(new Date());
      b.appendChild(h('<div class="card pad hr-cond"><b>Same every month</b><ul><li>Same spot, same overhead light</li><li>No flash</li><li>Dry hair, no products</li><li>' + (rest ? 'Before ' + U.esc(lower1(rest.name)) : 'Not right after anything that leaves the scalp red') + '</li></ul></div>'));
      const box = h('<div class="card pad hr-len"><b>Hair length today</b><small>Longer hair covers more scalp, so each set keeps its length.</small><div class="chips hr-guards"></div><div class="field" hidden><label for="hr-cut">Last cut</label><input class="input" id="hr-cut" type="date"></div><div class="field"><label for="hr-mm">Length in mm (optional)</label><input class="input" id="hr-mm" inputmode="decimal" placeholder="e.g. 6"></div></div>');
      const g = box.querySelector('.hr-guards'), cutF = box.querySelector('.field[hidden]'), cut = box.querySelector('#hr-cut'), mm = box.querySelector('#hr-mm');
      let pick = len ? (len.guard != null ? String(len.guard) : 'grow') : null;
      ['0', '1', '2', '3', '4', '6', '8', 'grow'].forEach(x => { const c = h('<button class="chip" type="button">' + (x === 'grow' ? 'Growing' : 'Guard ' + x) + '</button>'); c.dataset.v = x; c.onclick = () => { pick = x; paint(); }; g.appendChild(c); });
      const paint = () => { g.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.v === pick)); cutF.hidden = pick !== 'grow'; };
      if (len && len.cut) cut.value = len.cut; if (len && len.mm) mm.value = len.mm;
      paint(); b.appendChild(box);
      if (prev) b.appendChild(h('<p class="small" style="padding:0 4px">Last set: ' + shortDate(prev.date) + ' · ' + U.esc(lengthText((Object.values(prev.angles)[0] || {}).length)) + '. Each angle shows that photo faintly so you can line it up.</p>'));
      const go = h('<button class="btn block" type="button">' + (Object.keys(have).length ? 'Carry on' : 'Start') + '</button>');
      go.onclick = () => {
        if (!pick) { ui.toast('Pick a guard number, or Growing'); return; }
        const m = parseFloat(String(mm.value).replace(',', '.'));
        len = pick === 'grow' ? { guard: null, cut: cut.value || null, mm: m > 0 ? m : null } : { guard: Number(pick), mm: m > 0 ? m : null };
        step = 1; draw(api);
      };
      b.appendChild(go);
    }
    function shoot(api, b, a, n) {
      const [angle, name, how] = a, ghost = prev && prev.angles[angle];
      b.appendChild(h('<div class="hr-step"><span class="tag">' + n + ' of ' + ANGLES.length + '</span><b>' + name + '</b><small>' + how + '</small></div>'));
      const cam = h('<div class="hr-cam mirror"><video playsinline muted></video><img class="hr-ghost" alt="" hidden><div class="hr-count" hidden></div><p class="hr-cue">Starting the camera…</p></div>');
      b.appendChild(cam);
      const video = cam.querySelector('video'), gimg = cam.querySelector('.hr-ghost'), cue = cam.querySelector('.hr-cue'), count = cam.querySelector('.hr-count');
      if (ghost) photoURL(ghost.file).then(u => { if (u) { gimg.src = u; gimg.hidden = false; } });
      const row = h('<div class="btns hr-tools"><button class="btn quiet sm" type="button" data-a="flip">Flip camera</button><button class="btn quiet sm" type="button" data-a="timer">Timer: off</button></div>');
      const shot = h('<button class="btn block" type="button" disabled>Take it</button>');
      const alt = h('<button class="link" type="button" style="align-self:center">Use a photo instead</button>');
      b.appendChild(row); b.appendChild(shot); b.appendChild(alt);
      let facing = 'user', timer = 0, stream = null;
      const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
      stopCam = stop;
      async function start() {
        stop(); cam.classList.toggle('mirror', facing === 'user');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { noCam('This phone can’t show the camera here. Use a photo instead.'); return; }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
          if (closed || !cam.isConnected) { stop(); return; }
          video.srcObject = stream; await video.play().catch(() => {});
          cam.classList.add('live'); cue.textContent = ghost ? 'Line up with last month’s photo' : ''; shot.disabled = false;
        } catch (e) { noCam(e && e.name === 'NotAllowedError' ? 'Opus can’t use the camera. Allow it when asked, or use a photo instead.' : 'The camera didn’t start. Use a photo instead.'); }
      }
      function noCam(t) { cue.textContent = t; shot.disabled = true; cam.classList.remove('live'); if (ghost) cam.classList.add('guide'); }
      row.querySelector('[data-a="flip"]').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
      row.querySelector('[data-a="timer"]').onclick = e => { timer = timer ? 0 : 3; e.target.textContent = 'Timer: ' + (timer ? '3 s' : 'off'); };
      shot.onclick = async () => {
        shot.disabled = true;
        for (let s = timer; s > 0; s--) { count.hidden = false; count.textContent = s; await new Promise(r => setTimeout(r, 1000)); if (closed) return; }
        count.hidden = true;
        const blob = await toJpeg(video, video.videoWidth, video.videoHeight); ui.buzz(14);
        review(api, b, a, blob);
      };
      alt.onclick = () => Opus.snap.pickPhoto(async f => { try { review(api, b, a, await fileToJpeg(f)); } catch (e) { ui.toast(e.message); } });
      start();
    }
    function review(api, b, a, blob) {
      if (stopCam) { stopCam(); stopCam = null; }
      const url = URL.createObjectURL(blob);
      b.innerHTML = '';
      b.appendChild(h('<div class="hr-step"><b>' + a[1] + '</b><small>Sharp, in the light, and lined up like last time?</small></div>'));
      const im = h('<div class="hr-cam"><img class="hr-shot" alt="' + a[1] + ' photo"></div>'); im.querySelector('img').src = url; b.appendChild(im);
      const btns = h('<div class="btns"><button class="btn quiet" type="button">Retake</button><button class="btn" type="button">Use it</button></div>');
      btns.children[0].onclick = () => { URL.revokeObjectURL(url); draw(api); };
      btns.children[1].onclick = async () => {
        btns.children[1].disabled = true;
        const file = 'hair/' + date + '-' + a[0] + '.jpg';
        try { await idbPut(file, blob); } catch (e) { ui.toast('This phone couldn’t keep the photo. Try again.'); btns.children[1].disabled = false; return; }
        if (urls[file]) URL.revokeObjectURL(urls[file]); urls[file] = url;
        const lg = L(), e = { id: date + ':' + a[0], date, angle: a[0], file, length: len, at: iso(), up: false };
        if (!fullSets().length && !lg.photos.some(x => x.baseline && x.date !== date)) e.baseline = true;
        lg.photos = lg.photos.filter(x => x.id !== e.id).concat([e]);
        have[a[0]] = e; Store.save(); upload();
        draw(api);
      };
      b.appendChild(btns);
    }
    function done(api, b) {
      const t = photoTarget(U.addDays(new Date(), 28));
      b.appendChild(h('<div class="card pad hr-done"><div class="serif-h">Set saved</div><p class="small" style="margin:0">Five angles for ' + shortDate(date) + ' · ' + U.esc(lengthText(len)) + '. The next set is due around ' + shortDate(U.key(t)) + '.</p></div>'));
      const c = h('<button class="btn block" type="button">Done</button>'); c.onclick = () => api.close(); b.appendChild(c);
    }
    return sh;
  }

  /* ---------- photos by angle, month by month ---------- */
  function historySheet(start) {
    let angle = start || 'front';
    ui.sheet({ title: 'Hair photos', kicker: 'By angle', full: true, render(api) {
      const b = api.body; b.innerHTML = '';
      const chips = h('<div class="chips"></div>');
      ANGLES.forEach(([id, name]) => { const c = h('<button class="chip' + (id === angle ? ' on' : '') + '" type="button">' + name + '</button>'); c.onclick = () => { angle = id; api.rerender(); }; chips.appendChild(c); });
      b.appendChild(chips);
      const list = sets().filter(s => s.angles[angle]).slice().reverse();
      if (!list.length) { b.appendChild(h('<p class="empty">No ' + ANGLE[angle][1].toLowerCase() + ' photos yet.</p>')); return; }
      const strip = h('<div class="hr-strip"></div>');
      list.forEach(s => {
        const x = s.angles[angle], f = h('<figure class="hr-fig"><div class="hr-cam"><img alt=""></div><figcaption><b>' + monthName(s.date) + '</b><small>' + shortDate(s.date) + ' · ' + U.esc(lengthText(x.length)) + (x.baseline ? ' · starting set' : '') + '</small></figcaption></figure>');
        photoURL(x.file).then(u => { if (u) f.querySelector('img').src = u; else f.querySelector('.hr-cam').classList.add('missing'); });
        strip.appendChild(f);
      });
      b.appendChild(strip);
      b.appendChild(h('<p class="small" style="padding:0 4px">Swipe through the months. Not scored; the side-by-side checks come at the checkpoints.</p>'));
      requestAnimationFrame(() => { strip.scrollLeft = strip.scrollWidth; });
    } });
  }

  /* ---------- checkpoints: blind side by side ---------- */
  const checkpoints = () => (P() && Array.isArray(P().checkpoints) ? P().checkpoints.filter(c => /^\d{4}-\d{2}-\d{2}$/.test(c)).sort() : []);
  const monthsFrom = c => { const s = P() && P().start; if (!s) return ''; const a = U.parseKey(s), b = U.parseKey(c); const m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); return m + (m === 1 ? ' month' : ' months'); };
  function pairFor(c) { // the starting set against the first full set on or after the checkpoint
    const base = baseline(), later = fullSets().slice().reverse().find(s => s.date >= c);
    return base && later && later.date !== base.date ? { base, later } : null;
  }
  const comparesFor = c => L().compares.filter(x => x.checkpoint === c);
  function summary(c) {
    const rs = comparesFor(c); if (!rs.length) return '';
    return ANGLES.filter(a => rs.some(r => r.angle === a[0])).map(a => {
      const r = rs.find(x => x.angle === a[0]);
      return a[1] + ': ' + (r.pickedLater === true ? 'later set looked fuller (+' + r.rating + ')' : r.pickedLater === false ? 'earlier set looked fuller (−' + Math.abs(r.rating) + ')' : 'can’t tell') + '.';
    }).join(' ');
  }
  function compareFlow(c, after) {
    const pr = pairFor(c); if (!pr) return;
    const angles = ANGLES.filter(a => pr.base.angles[a[0]] && pr.later.angles[a[0]]);
    let i = 0;
    ui.sheet({ title: 'Side by side', kicker: monthsFrom(c) + ' check', full: true, onClose() { after && after(); }, render(api) { step(api); } });
    function step(api) {
      const b = api.body; b.innerHTML = '';
      if (i >= angles.length) {
        b.appendChild(h('<div class="card pad"><div class="serif-h">All angles done</div><p class="small" style="margin:0">' + U.esc(summary(c)) + '</p></div>'));
        const bl = (pr.base.angles.front || {}).length, ll = (pr.later.angles.front || {}).length;
        if (!sameLength(bl, ll)) b.appendChild(h('<p class="small" style="padding:0 4px">Hair length: ' + U.esc(lengthText(bl)) + ' then ' + U.esc(lengthText(ll)) + '. Longer hair covers more scalp; compare with care.</p>'));
        const x = h('<button class="btn block" type="button">Done</button>'); x.onclick = () => api.close(); b.appendChild(x);
        return;
      }
      const [angle, name] = angles[i], laterLeft = Math.random() < 0.5;
      const L0 = laterLeft ? pr.later : pr.base, R0 = laterLeft ? pr.base : pr.later;
      b.appendChild(h('<div class="hr-step"><span class="tag">' + (i + 1) + ' of ' + angles.length + '</span><b>' + name + '</b><small>Which looks fuller? Dates stay hidden until you pick.</small></div>'));
      const pair = h('<div class="hr-pair"><button type="button" class="hr-pick"><div class="hr-cam"><img alt="A"></div><span>A</span></button><button type="button" class="hr-pick"><div class="hr-cam"><img alt="B"></div><span>B</span></button></div>');
      const [pa, pb] = pair.querySelectorAll('.hr-pick');
      photoURL(L0.angles[angle].file).then(u => { if (u) pa.querySelector('img').src = u; });
      photoURL(R0.angles[angle].file).then(u => { if (u) pb.querySelector('img').src = u; });
      b.appendChild(pair);
      const cant = h('<button class="btn quiet block" type="button">Can’t tell</button>'); b.appendChild(cant);
      const finish = (pickedLater, size) => {
        const rating = pickedLater == null ? 0 : (pickedLater ? 1 : -1) * size;
        const lg = L(), id = c + ':' + angle;
        lg.compares = lg.compares.filter(x => x.id !== id).concat([{ id, checkpoint: c, angle, pickedLater, rating, at: iso() }]); Store.save();
        b.innerHTML = '';
        b.appendChild(h('<div class="card pad"><b>' + name + '</b><p class="small" style="margin:6px 0 0">A was ' + monthName(L0.date) + ', B was ' + monthName(R0.date) + '. ' + (pickedLater == null ? 'You couldn’t tell them apart.' : 'You picked the ' + (pickedLater ? 'later' : 'earlier') + ' set (' + (rating > 0 ? '+' : '−') + Math.abs(rating) + ').') + '</p></div>'));
        const nx = h('<button class="btn block" type="button">' + (i + 1 < angles.length ? 'Next angle' : 'See all') + '</button>'); nx.onclick = () => { i++; step(api); }; b.appendChild(nx);
      };
      const choose = left => {
        const pickedLater = left === laterLeft;
        pair.querySelectorAll('.hr-pick').forEach((x, j) => x.classList.toggle('on', (j === 0) === left));
        cant.remove();
        const q = h('<div class="card pad hr-size"><b>How big is the difference?</b><div class="chips"></div></div>');
        [['Slight', 1], ['Clear', 2], ['Big', 3]].forEach(([t, n]) => { const x = h('<button class="chip" type="button">' + t + '</button>'); x.onclick = () => finish(pickedLater, n); q.querySelector('.chips').appendChild(x); });
        b.appendChild(q);
      };
      pa.onclick = () => choose(true); pb.onclick = () => choose(false);
      cant.onclick = () => finish(null, 0);
    }
  }

  /* ---------- side effects ---------- */
  const effectList = () => (P() && Array.isArray(P().effects) ? P().effects.filter(x => typeof x === 'string' && x.trim()) : []);
  const effectOn = k => L().effects.find(e => e.date === k) || null;
  function setEffects(k, items, opt) {
    const lg = L(), e = Object.assign({ date: k, items: items.slice(), at: iso() }, opt || {});
    if (!e.note) delete e.note;
    lg.effects = lg.effects.filter(x => x.date !== k).concat([e]); Store.save();
  }
  function effectsSheet(weekly, after) {
    const k = U.key(), cur = effectOn(k), sel = new Set((cur && cur.items) || []);
    ui.sheet({ title: weekly ? 'This week' : 'Anything off?', kicker: weekly ? 'Weekly check' : shortDate(k), onClose() { after && after(); }, render(api) {
      const b = api.body;
      b.appendChild(h('<p class="small" style="margin:0 4px 10px">' + (weekly ? 'Anything from the past week. Nothing ticked means nothing noted.' : 'Optional. Leave it and nothing is noted for today.') + '</p>'));
      const c = h('<div class="chips hr-fx"></div>');
      effectList().forEach(t => { const x = h('<button class="chip' + (sel.has(t) ? ' on' : '') + '" type="button"></button>'); x.textContent = t; x.onclick = () => { if (sel.has(t)) sel.delete(t); else sel.add(t); x.classList.toggle('on'); }; c.appendChild(x); });
      b.appendChild(c);
      const note = h('<div class="field"><label for="hr-note">Anything else (optional)</label><input class="input" id="hr-note" maxlength="200"></div>'); if (cur && cur.note) note.querySelector('input').value = cur.note; b.appendChild(note);
      if (notes().effects) b.appendChild(h('<p class="small" style="padding:0 4px">' + U.esc(notes().effects) + '</p>'));
      const btns = h('<div class="btns">' + (weekly ? '<button class="btn quiet" type="button">None this week</button>' : '') + '<button class="btn" type="button">Save</button></div>');
      const save = () => { setEffects(k, [...sel], Object.assign({ note: note.querySelector('input').value.trim() || null }, weekly ? { weekly: true } : {})); api.close(); ui.toast(sel.size ? 'Noted' : 'Nothing noted'); };
      if (weekly) btns.children[0].onclick = () => { sel.clear(); setEffects(k, [], { weekly: true, none: true }); api.close(); ui.toast('None this week'); };
      btns.lastChild.onclick = save;
      b.appendChild(btns);
    } });
  }

  /* ---------- quiet blanks the owner fills ---------- */
  function blanks() {
    const p = P(), out = [], sp = (Plan.p.health || {}).supplements || [];
    for (const id of p.core || []) { const i = sp.findIndex(s => s.id === id); if (i >= 0 && (sp[i].confirm || !sp[i].dose)) out.push({ text: (sp[i].dose ? 'Confirm the dose: ' : 'Add the dose: ') + sp[i].name + (sp[i].dose ? ' ' + sp[i].dose : ''), act: 'dose', i }); }
    routine().forEach((r, i) => {
      if ('brand' in r && !r.brand) out.push({ text: r.name + ': brand and model', act: 'field', i, key: 'brand', label: 'Brand and model', ph: 'As on the box' });
      if ('depth' in r && !r.depth) out.push({ text: r.name + ': depth', act: 'field', i, key: 'depth', label: 'Depth', ph: 'e.g. 1.0 mm' });
    });
    return out;
  }
  function fill(x, after) {
    if (x.act === 'dose') {
      const sp = Plan.p.health.supplements, s = sp[x.i], before = s.dose;
      const edit = () => Opus.supps.editSheet(x.i, () => { const n = Plan.p.health.supplements.find(y => y.id === s.id); if (n && n.dose && n.dose !== before) { delete n.confirm; Store.save(); } after(); });
      if (!s.dose) { edit(); return; }
      ui.sheet({ title: s.name, kicker: 'Dose', render(api) {
        api.body.appendChild(h('<p class="note">Is ' + U.esc(s.dose) + ' right?</p>'));
        const b = h('<div class="btns"><button class="btn quiet" type="button">Change it</button><button class="btn" type="button">Yes, that’s right</button></div>');
        b.children[0].onclick = () => { api.close(true); edit(); };
        b.children[1].onclick = () => { delete s.confirm; Store.save(); api.close(true); ui.toast('Saved'); after(); };
        api.body.appendChild(b);
      } });
      return;
    }
    const r = routine()[x.i];
    ui.sheet({ title: r.name, kicker: x.label, render(api) {
      const f = h('<div class="field"><label for="hr-f">' + x.label + '</label><input class="input" id="hr-f" maxlength="80" placeholder="' + U.esc(x.ph) + '"></div>'); api.body.appendChild(f);
      const s = h('<button class="btn block" type="button">Save</button>');
      s.onclick = () => { const v = f.querySelector('input').value.trim(); if (!v) { ui.toast('Type it in first'); return; } r[x.key] = v; Store.save(); api.close(); after(); };
      api.body.appendChild(s);
    } });
  }

  /* ---------- the section on Body ---------- */
  function spark(vals) {
    const pts = vals.map((v, i) => [i, v]).filter(p => p[1] != null); if (pts.length < 2) return '<span class="bd-spark"></span>';
    const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1])), sp = hi - lo || 1, W = 132, H = 34;
    const X = i => (i / (vals.length - 1) * (W - 6) + 3).toFixed(1), Y = v => (H - 4 - (v - lo) / sp * (H - 8)).toFixed(1), last = pts[pts.length - 1];
    return '<svg class="bd-spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><path d="' + pts.map((p, j) => (j ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + '"/><circle cx="' + X(last[0]) + '" cy="' + Y(last[1]) + '" r="3"/></svg>';
  }
  const avg = a => { const b = a.filter(v => v != null); return b.length ? b.reduce((m, v) => m + v, 0) / b.length : null; };

  function section(v, R, d) {
    const p = P(); if (!p) return;
    d = d || new Date();
    const k = U.key(d), redraw = () => Opus.refresh();
    const since = p.start ? Math.max(0, U.daysBetween(U.parseKey(p.start), d)) : null;
    const sec = h('<div class="sec"><div class="sh"><span class="r">' + R() + '</span><span class="t">Hair</span><span class="c">' + (since != null ? 'day ' + (since + 1) : '') + '</span></div><div class="card"></div></div>');
    const c = sec.querySelector('.card');

    // tonight's routine
    const items = Plan.mods.find(m => m.prefix === 'hair').items(d).filter(it => it.kind === 'hair');
    const rest = restDay(d);
    if (items.length || rest) {
      const t = h('<div class="row hr-tonight"><span class="tx"><b>' + (items.length ? 'Tonight' : 'Nothing due tonight') + '</b><small></small></span><span class="hr-ticks"></span></div>');
      t.querySelector('small').textContent = rest && ticked(d, rest.id) ? (notes().restAfter || 'Nothing on your scalp until tomorrow evening.') : rest ? rest.name + ' tonight' + (rest.rule ? ' · ' + rest.rule : '') : items.some(it => /^Extra/.test(it.detail)) ? 'Extras are kept apart from the routine.' : '';
      const tk = t.querySelector('.hr-ticks');
      items.forEach(it => {
        const on = ticked(d, it.id.slice(5)), x = h('<button type="button" class="hr-tk' + (on ? ' on' : '') + (/^Extra/.test(it.detail) ? ' extra' : '') + '"></button>');
        x.textContent = it.title; x.setAttribute('aria-pressed', on ? 'true' : 'false');
        x.onclick = () => { Plan.setChecked(d, it.id, !on); ui.buzz(on ? 6 : 12); redraw(); };
        tk.appendChild(x);
      });
      c.appendChild(t);
    }

    // side effects: optional daily, a full list on the rest day
    if (effectList().length) {
      const cur = effectOn(k), weekly = !!rest;
      const recent = L().effects.filter(e => U.daysBetween(U.parseKey(e.date), d) < 14 && e.items && e.items.length);
      const counts = {}; recent.forEach(e => e.items.forEach(x => counts[x] = (counts[x] || 0) + 1));
      const lately = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([x, n]) => lower1(x) + (n > 1 ? ' (' + n + ')' : '')).join(', ');
      const fx = h('<div class="row tap hr-fxrow"><span class="tx"><b>' + (weekly ? 'Weekly check' : 'Anything off?') + '</b><small></small></span>' + (weekly && !(cur && cur.weekly) ? '<button class="btn quiet sm" type="button">None this week</button>' : '') + ui.icon('chev', 'chev ico') + '</div>');
      fx.querySelector('small').textContent = cur ? (cur.items.length ? 'Noted today: ' + cur.items.map(lower1).join(', ') : weekly && cur.weekly ? 'None this week' : 'Nothing noted today') : lately ? 'Last 2 weeks: ' + lately : weekly ? 'Anything from the past week? One tap if not.' : 'Optional. Nothing noted means nothing off.';
      fx.onclick = () => effectsSheet(weekly, redraw);
      const none = fx.querySelector('.btn'); if (none) none.onclick = e => { e.stopPropagation(); setEffects(k, [], { weekly: true, none: true }); ui.toast('None this week'); redraw(); };
      c.appendChild(fx);
      const first = checkpoints()[0];
      if (notes().shedding && first && L().effects.some(e => e.date < first && (e.items || []).some(x => /shed/i.test(x)))) c.appendChild(h('<p class="small hr-note">' + U.esc(notes().shedding) + '</p>'));
    }

    // photos
    const due = photosDue(d), all = sets(), last = all[0];
    const ph = h('<div class="row hr-photos"><span class="tx"><b>Monthly photos</b><small></small></span><button class="btn sm" type="button"></button></div>');
    const today = all.find(s => s.date === k);
    ph.querySelector('small').textContent = today && today.n < ANGLES.length ? today.n + ' of ' + ANGLES.length + ' angles today' : due ? (due.first ? 'Your starting set: five angles, same light every month' : 'Due now · five angles') : last ? 'Last set ' + shortDate(last.date) + ' · next around ' + shortDate(U.key(photoTarget(U.addDays(U.parseKey(last.date), 25)))) : 'Five angles a month, same light';
    const pb = ph.querySelector('.btn'); pb.textContent = today && today.n < ANGLES.length ? 'Carry on' : due ? 'Take them' : 'Take a set';
    if (!due && !(today && today.n < ANGLES.length)) pb.classList.add('quiet');
    pb.onclick = () => photoFlow(redraw);
    c.appendChild(ph);
    if (all.length) { const hs = h('<div class="row tap"><span class="tx"><b>Photo history</b><small>' + all.length + (all.length === 1 ? ' set' : ' sets') + ' · swipe through the months by angle</small></span>' + ui.icon('chev', 'chev ico') + '</div>'); hs.onclick = () => historySheet(); c.appendChild(hs); }

    // checkpoints
    const cps = checkpoints(), sixth = cps[1];
    for (const cp of cps) {
      if (k < cp) continue;
      const pr = pairFor(cp), sm = summary(cp), n = pr ? ANGLES.filter(a => pr.base.angles[a[0]] && pr.later.angles[a[0]]).length : 0, didN = comparesFor(cp).length;
      const row = h('<div class="row hr-cp"><span class="tx"><b>' + monthsFrom(cp) + ' check</b><small></small></span></div>');
      row.querySelector('small').textContent = sm || (pr ? 'Ready: your starting set against ' + monthName(pr.later.date) + ', side by side, dates hidden.' : 'Take a full set on or after ' + shortDate(cp) + ' to compare it with your starting set.');
      if (pr && didN < n) { const b2 = h('<button class="btn sm" type="button">' + (didN ? 'Carry on' : 'Compare') + '</button>'); b2.onclick = () => compareFlow(cp, redraw); row.appendChild(b2); }
      c.appendChild(row);
    }
    if (sixth && k < sixth) c.appendChild(h('<p class="small hr-note">First honest read is at 6 months, verdict at 12.' + (cps[0] && k < cps[0] ? ' The first side-by-side is on ' + shortDate(cps[0]) + '.' : '') + '</p>'));

    // resting heart rate, 30 days (WHOOP)
    const W = Opus.whoop && Opus.whoop.data();
    if (W) {
      const ks = []; for (let i = 29; i >= 0; i--) ks.push(U.key(U.addDays(d, -i)));
      const rhr = ks.map(x => { const r = (W.days[x] || {}).recovery; return r && r.scored && r.rhr != null ? r.rhr : null; });
      const n = rhr.filter(x => x != null).length;
      if (n) {
        const usual = avg(rhr.slice(-15, -1)), lastV = [...rhr].reverse().find(x => x != null);
        c.appendChild(h('<div class="row bd-row"><span class="tx"><b>Resting HR</b><small>' + (usual != null ? 'usual ' + Math.round(usual) + ' · ' : '') + '30 days</small></span>' + spark(rhr) + '<span class="bd-v num">' + lastV + '<small> bpm</small></span></div>'));
        if (notes().rhr) c.appendChild(h('<p class="small hr-note">' + U.esc(notes().rhr) + '</p>'));
      }
    }

    // the blanks
    const bl = blanks();
    bl.forEach(x => { const r = h('<div class="row tap hr-blank"><span class="tx"><small></small></span>' + ui.icon('chev', 'chev ico') + '</div>'); r.querySelector('small').textContent = x.text; r.onclick = () => fill(x, redraw); c.appendChild(r); });

    // what to expect
    if (notes().expectations) {
      const ex = h('<details class="hr-expect"><summary>What to expect</summary><p class="small"></p></details>');
      ex.querySelector('p').textContent = notes().expectations; c.appendChild(ex);
    }
    const ex2 = extras().filter(x => x.id && x.name);
    if (ex2.length) {
      const m = h('<div class="row tap"><span class="tx"><b>Extras</b><small></small></span>' + ui.icon('chev', 'chev ico') + '</div>');
      m.querySelector('small').textContent = ex2.map(x => x.name + (x.emptied ? ' (ran out ' + shortDate(x.emptied) + ')' : '')).join(' · ');
      m.onclick = () => extrasSheet(redraw); c.appendChild(m);
    }
    v.appendChild(sec);
  }
  function extrasSheet(after) {
    ui.sheet({ title: 'Extras', kicker: 'Used until they run out', onClose() { after && after(); }, render(api) {
      const b = api.body; b.innerHTML = '';
      b.appendChild(h('<p class="small" style="margin:0 4px 10px">Extras sit apart from the main routine and never count toward how it’s going.</p>'));
      const card = h('<div class="card"></div>');
      extras().filter(x => x.id && x.name).forEach(x => {
        const r = h('<div class="row"><span class="tx"><b></b><small></small></span><button class="btn quiet sm" type="button"></button></div>');
        r.querySelector('b').textContent = x.name; r.querySelector('small').textContent = x.emptied ? 'Ran out ' + shortDate(x.emptied) : 'In use';
        const btn = r.querySelector('.btn'); btn.textContent = x.emptied ? 'Back in use' : 'Ran out';
        btn.onclick = () => { if (x.emptied) x.emptied = null; else x.emptied = U.key(); Store.save(); ui.toast(x.emptied ? x.name + ': off your list' : x.name + ': back on'); api.rerender(); };
        card.appendChild(r);
      });
      b.appendChild(card);
    } });
  }

  /* notifications: the rest-day reminder and the photo day, with no product or medication names */
  function events(now, add) {
    const p = P(); if (!p) return;
    const r = restItem();
    for (let i = 0; i <= 7; i++) {
      const d = U.addDays(now, i), at = (hm, dflt) => { const m = U.mins(hm) ?? U.mins(dflt); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60); };
      if (r && dueOn(r, d)) add(at(r.time, '19:30'), 'needling', r.name + ' tonight', r.rule ? r.rule + '.' : 'Nothing on your scalp for 24 hours after.', { check: { date: U.key(d), id: 'hair:' + r.id } });
      const due = photosDue(d);
      if (due && !due.first && U.key(d) === U.key(due.target)) add(at(p.photoTime, '18:00'), 'hairphotos', 'Hair photos today', 'Five angles, same light as last month' + (r && dueOn(r, d) ? ', before ' + lower1(r.name) : '') + '.', { check: { date: U.key(d), id: 'hair:photos' } });
    }
  }
  /* supplements whose names stay off the lock screen */
  function privateSupp(id) { const p = P(), s = ((Plan.p.health || {}).supplements || []).find(x => x.id === id); return !!(s && s.private) || !!(p && (p.core || []).includes(id)); }

  Opus.hair = { section, photoFlow, historySheet, compareFlow, effectsSheet, events, privateSupp, sets, photosDue, upload, ANGLES };
})();
