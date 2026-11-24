/* Cassius's voice: the day's sitting read aloud by a real voice, for the commute.
   The reading is made once, by the helper, with the owner's own ElevenLabs account (Growth › Listen sets it up:
   he pastes his ElevenLabs key once and the helper keeps it sealed; it never stays on this phone). The mp3 lands in
   opus-data (voice/lessons/) and is kept on this phone too, so it plays offline, with the screen locked, from the
   lock screen controls, at any speed, and picks up where it stopped.
   A small player sits above the tab bar: back 15 s, play or pause, forward 15 s, speed, close. Tap its words for the
   voice and this month's characters. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Store = Opus.store, ui = Opus.ui;
  const h = s => ui.h(s);
  const RATES = [1, 1.15, 1.3, 0.9];
  const CACHE = 'opus-voice';
  const POS_KEY = 'opus.voicepos';
  const I = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    back: '<svg viewBox="0 0 24 24" class="ln"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.4h3.4"/><text x="12" y="15.2" text-anchor="middle">15</text></svg>',
    fwd: '<svg viewBox="0 0 24 24" class="ln"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v3.4h-3.4"/><text x="12" y="15.2" text-anchor="middle">15</text></svg>',
    stop: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>'
  };
  const S = () => (Store.data.settings = Store.data.settings || {});
  const rate = () => { const r = Number(S().voiceRate); return RATES.includes(r) ? r : 1; };
  const fmt = t => { t = Math.max(0, Math.round(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const ready = () => S().voiceReady === true || !!(Opus.sync && Opus.sync.voice && Opus.sync.voice() === true); // the helper's word, or this phone's after a key was saved

  /* where each reading stopped, kept apart from the rest of Opus's data so a playing lesson doesn't rewrite it all */
  const posAll = () => { try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const posGet = f => Number(posAll()[f]) || 0;
  function posSet(f, t) {
    try { const a = posAll(); if (t == null) delete a[f]; else a[f] = Math.round(t * 10) / 10; const ks = Object.keys(a); if (ks.length > 30) delete a[ks[0]]; localStorage.setItem(POS_KEY, JSON.stringify(a)); } catch (e) {}
  }

  /* ---------- the helper ---------- */
  function fail(code, error) { const e = new Error(error); e.code = code; return e; }
  async function call(body, ms) {
    const ph = Opus.sync && Opus.sync.phone && Opus.sync.phone();
    if (!ph) throw fail('nohelper', 'Opus hasn’t heard from the helper yet. Sync once (Settings › Sync), then try again.');
    if (navigator.onLine === false) throw fail('offline', 'You’re offline. A reading already on this phone still plays.');
    const ac = window.AbortController ? new AbortController() : null, t = ac && setTimeout(() => ac.abort(), ms || 25000);
    try {
      const r = await fetch(ph.url + '/voice', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Opus-Key': ph.key }, body: JSON.stringify(body), signal: ac ? ac.signal : undefined });
      let j = null; try { j = await r.json(); } catch (e) {}
      if (!j) throw fail('fail', 'The helper answered ' + r.status + '.');
      if (j.code === 'phone') throw fail('phone', j.error);
      return j;
    } catch (e) { if (e.code) throw e; throw fail('net', e.name === 'AbortError' ? 'The reading is taking longer than usual. Try again in a minute; it finishes on its own.' : 'Couldn’t reach the helper just now.'); }
    finally { if (t) clearTimeout(t); }
  }
  async function status() {
    const j = await call({ do: 'status' });
    if (j.ok) { S().voiceReady = !!j.ready; Store.save(); }
    return j;
  }

  /* ---------- the audio on this phone ---------- */
  const reqFor = f => new Request(location.origin + '/__voice/' + f);
  async function cached(f) { try { const c = await caches.open(CACHE); const r = await c.match(reqFor(f)); return r ? await r.blob() : null; } catch (e) { return null; } }
  async function keep(f, blob) {
    try {
      const c = await caches.open(CACHE); await c.put(reqFor(f), new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } }));
      const ks = await c.keys(); for (const k of ks.slice(0, Math.max(0, ks.length - 14))) await c.delete(k); // the last two weeks or so
    } catch (e) {}
  }
  // a breath of silence, played inside the tap, so the phone lets the real reading start once it arrives
  let silent = null;
  function silence() {
    if (silent) return silent;
    const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer), w = (o, s) => [...s].forEach((c, i) => b[o + i] = c.charCodeAt(0));
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
    return (silent = URL.createObjectURL(new Blob([b], { type: 'audio/wav' })));
  }

  let A = null, st = null, dock = null, url = null, lastSave = 0;
  function audio() {
    if (A) return A;
    A = new Audio(); A.preload = 'auto'; A.setAttribute('playsinline', ''); A.setAttribute('webkit-playsinline', '');
    A.addEventListener('timeupdate', () => { paint(); if (st && st.file && Date.now() - lastSave > 3000) { lastSave = Date.now(); posSet(st.file, A.currentTime); } media(); });
    A.addEventListener('play', () => { if (st && st.file) { st.playing = true; paint(); } });
    A.addEventListener('pause', () => { if (st && st.file) { st.playing = false; posSet(st.file, A.currentTime); paint(); } });
    A.addEventListener('ended', () => { if (!st || !st.file) return; st.playing = false; posSet(st.file, null); st.done = true; paint(); });
    A.addEventListener('loadedmetadata', () => { A.playbackRate = rate(); paint(); });
    A.addEventListener('ratechange', () => { if (A.playbackRate !== rate() && st && st.file) A.playbackRate = rate(); });
    A.addEventListener('error', () => { if (st && st.file && A.src === url) { st.playing = false; st.err = 'This reading wouldn’t play. Close the player and try again.'; paint(); } });
    return A;
  }
  /* the lock screen and headphones: title, play and pause, skip 15 s, scrub */
  let mediaSet = false;
  function media() {
    const ms = navigator.mediaSession; if (!ms || !st) return;
    try {
      if (!mediaSet) {
        ms.setActionHandler('play', () => A && A.play());
        ms.setActionHandler('pause', () => A && A.pause());
        ms.setActionHandler('seekbackward', () => skip(-15));
        ms.setActionHandler('seekforward', () => skip(15));
        try { ms.setActionHandler('seekto', d => { if (A && d && isFinite(d.seekTime)) A.currentTime = d.seekTime; }); } catch (e) {}
        try { ms.setActionHandler('stop', stop); } catch (e) {}
        mediaSet = true;
      }
      if (ms.metadata == null || ms.metadata.title !== st.title) ms.metadata = new MediaMetadata({ title: st.title, artist: 'Cassius', album: 'Opus · The sitting', artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] });
      if (A && isFinite(A.duration) && A.duration > 0 && ms.setPositionState) ms.setPositionState({ duration: A.duration, position: Math.min(A.currentTime, A.duration), playbackRate: A.playbackRate || 1 });
      ms.playbackState = st.playing ? 'playing' : 'paused';
    } catch (e) {}
  }

  /* the fingerprint of a sitting as it is now: a lesson Cassius edits after it was read is read again */
  const fp = l => [l.date, l.title, String(l.body || '').length, l.question || '', l.takeaway || ''].join('|');
  const voiceFor = () => S().voiceId || null;

  /* play the sitting of l.date. Called from a tap. */
  async function play(l) {
    if (!l || !l.date) return;
    if (!ready()) { setup(() => play(l)); return; }
    const a = audio();
    if (st && st.date === l.date && st.file && !st.err) { a.play().catch(() => {}); build(); return; }
    // inside the tap: wake the player up so it may start on its own once the reading is ready
    a.src = silence(); a.play().catch(() => {});
    const known = (S().voiceFiles || {})[l.date];
    st = { date: l.date, title: l.title || 'The sitting', file: null, playing: false, wait: 'Getting it ready…', err: null, done: false };
    build(); paint();
    try {
      let file = known && known.fp === fp(l) && known.voice === voiceFor() && known.fast === !!S().voiceFast ? known.file : null;
      let blob = file ? await cached(file) : null;
      if (!blob) {
        const slow = setTimeout(() => { if (st && st.date === l.date && !st.file) { st.wait = 'Cassius is recording it. The first play of a sitting takes a little while.'; paint(); } }, 2500);
        let j; try { j = await call({ do: 'make', date: l.date, voice: voiceFor(), fast: !!S().voiceFast }, 120000); } finally { clearTimeout(slow); }
        if (j.ok === true && j.ready === false) { S().voiceReady = false; Store.save(); stop(); setup(() => play(l)); return; }
        if (!j.ok) throw fail(j.code || 'fail', j.error || 'The reading couldn’t be made.');
        file = j.file;
        if (j.chars) { S().voiceMonth = { m: U.key().slice(0, 7), n: ((S().voiceMonth || {}).m === U.key().slice(0, 7) ? (S().voiceMonth.n || 0) : 0) + j.chars }; }
        blob = await cached(file);
        if (!blob) { if (st) { st.wait = 'Bringing it to your phone…'; paint(); } blob = await Opus.sync.raw(file); if (!blob) throw fail('fail', 'The reading was made but hasn’t reached your data yet. Try again in a moment.'); blob = new Blob([blob], { type: 'audio/mpeg' }); keep(file, blob); }
        S().voiceFiles = Object.assign({}, S().voiceFiles || {}, { [l.date]: { file, fp: fp(l), voice: voiceFor(), fast: !!S().voiceFast } });
        const ks = Object.keys(S().voiceFiles).sort(); if (ks.length > 30) delete S().voiceFiles[ks[0]];
        Store.save();
      }
      if (!st || st.date !== l.date) return; // closed while it was coming
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      st.file = file; st.wait = null;
      const from = posGet(file);
      a.src = url; a.playbackRate = rate();
      const go = () => { if (from > 3) { try { a.currentTime = from - 2; } catch (e) {} } a.playbackRate = rate(); a.play().then(() => {}, () => { st.playing = false; paint(); }); };
      if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true });
      paint(); media();
    } catch (e) {
      if (!st) return;
      st.err = e.message || 'Couldn’t play it just now.'; st.wait = null; paint();
      if (e.code === 'key') S().voiceReady = false;
    }
  }
  function toggle() {
    if (!st || !A) return;
    if (st.err || st.wait) return;
    if (st.done) { st.done = false; A.currentTime = 0; }
    if (A.paused) A.play().catch(() => {}); else A.pause();
  }
  function skip(d) { if (!A || !st || !st.file || !isFinite(A.duration)) return; A.currentTime = Math.max(0, Math.min(A.duration - 0.5, A.currentTime + d)); st.done = false; paint(); }
  function speed() { S().voiceRate = RATES[(RATES.indexOf(rate()) + 1) % RATES.length]; Store.save(); if (A) A.playbackRate = rate(); paint(); media(); }
  function stop() {
    if (A) { if (st && st.file) posSet(st.file, st.done ? null : A.currentTime); A.pause(); A.removeAttribute('src'); try { A.load(); } catch (e) {} }
    st = null; clearInterval(placeIv);
    try { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; } catch (e) {}
    if (dock) { dock.classList.remove('show'); const d = dock; setTimeout(() => { if (!st && d.parentNode) d.remove(); if (dock === d && !st) dock = null; }, 500); }
  }

  /* ---------- the player ---------- */
  let placeIv = null;
  function build() {
    if (dock && dock.parentNode) { place(); dock.classList.add('show'); clearInterval(placeIv); placeIv = setInterval(place, 800); return; }
    dock = h('<div class="listendock vdock" role="region" aria-label="Cassius reading">' +
      '<button class="lbl" type="button" data-a="voice" aria-label="Voice and characters"><b></b><span></span><i class="lp"><u></u></i></button>' +
      '<button class="lb" type="button" data-a="back" aria-label="Back 15 seconds">' + I.back + '</button>' +
      '<button class="lb main" type="button" data-a="toggle" aria-label="Play"></button>' +
      '<button class="lb" type="button" data-a="fwd" aria-label="Forward 15 seconds">' + I.fwd + '</button>' +
      '<button class="lb sp num" type="button" data-a="speed" aria-label="Speed"></button>' +
      '<button class="lb" type="button" data-a="stop" aria-label="Close the player">' + I.stop + '</button></div>');
    dock.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'voice' && e.target.closest('.lp') && A && st && st.file && isFinite(A.duration)) { const r = b.querySelector('.lp').getBoundingClientRect(); A.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * A.duration; return; }
      ({ back: () => skip(-15), fwd: () => skip(15), toggle, speed, stop, voice: () => sheet() })[b.dataset.a]();
    });
    document.body.appendChild(dock);
    place();
    requestAnimationFrame(() => requestAnimationFrame(() => dock && dock.classList.add('show')));
    clearInterval(placeIv); placeIv = setInterval(place, 800);
  }
  function place() {
    if (!dock) return;
    const sh = [...document.querySelectorAll('.sheet')].pop(), f = sh && sh.querySelector('.foot');
    dock.classList.toggle('in-sheet', !!sh);
    dock.style.bottom = sh && f && f.offsetHeight ? (f.offsetHeight + 8) + 'px' : '';
  }
  function paint() {
    if (!dock || !st) return;
    const has = !!st.file && A && isFinite(A.duration) && A.duration > 0;
    dock.querySelector('.lbl b').textContent = st.err ? 'Couldn’t play' : st.wait ? 'Cassius' : st.done ? 'Finished' : st.playing ? 'Cassius' : 'Paused';
    dock.querySelector('.lbl span').textContent = st.err || st.wait || (has ? fmt(A.currentTime) + ' / ' + fmt(A.duration) : st.title);
    dock.querySelector('.lp u').style.width = has ? (A.currentTime / A.duration * 100).toFixed(1) + '%' : '0%';
    dock.classList.toggle('waiting', !!st.wait);
    const m = dock.querySelector('.main'); m.innerHTML = st.playing ? I.pause : I.play; m.setAttribute('aria-label', st.playing ? 'Pause' : 'Play'); m.disabled = !!(st.wait || st.err);
    dock.querySelector('.sp').textContent = (rate() === 1 ? '1' : String(rate())) + '×';
  }

  /* ---------- setting it up: his ElevenLabs key, pasted once ---------- */
  function setup(then) {
    ui.sheet({ title: 'Cassius’s voice', kicker: 'Listen', render(api) {
      const b = api.body;
      b.appendChild(h('<p class="note" style="padding:0 4px">Each day’s sitting, read aloud by a real voice: the Lamp, the lesson, his question, and the one from before. It uses your own ElevenLabs account. A sitting is about 2,000 characters, and each one is read only once.</p>'));
      const steps = h('<div class="card pad v-steps"><ol>' +
        '<li>In ElevenLabs, open <b>Developers</b> (bottom left), then <b>API Keys</b>, then <b>Create Key</b>. Name it Opus.</li>' +
        '<li>Leave its permissions on, or at least turn on <b>Text to Speech</b>, <b>Voices</b> (read) and <b>User</b> (read). Tap Create, then copy the key. ElevenLabs shows it only once.</li>' +
        '<li>Picked a voice from the Voice Library? Tap <b>Add to my voices</b> on it there, so Opus can use it.</li>' +
        '<li>Paste the key below. Opus hands it to your helper, which keeps it locked away. It doesn’t stay on this phone.</li></ol></div>');
      b.appendChild(steps);
      const f = h('<div class="card pad" style="display:flex;flex-direction:column;gap:10px"><div class="field"><label for="v-key">ElevenLabs API key</label><input id="v-key" class="input mono" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="sk_…"></div><p class="small v-msg" hidden></p><button class="btn block" type="button">Save the key</button></div>');
      b.appendChild(f);
      const inp = f.querySelector('input'), msg = f.querySelector('.v-msg'), btn = f.querySelector('.btn');
      const say = (t, bad) => { msg.hidden = !t; msg.textContent = t || ''; msg.classList.toggle('warn', !!bad); };
      btn.onclick = async () => {
        const k = inp.value.trim(); if (!k) { say('Paste the key first.', true); return; }
        btn.disabled = true; btn.textContent = 'Checking with ElevenLabs…'; say('');
        try {
          const j = await call({ do: 'key', key: k }, 30000);
          inp.value = '';
          if (!j.ok) { say(j.error || 'That key didn’t work.', true); return; }
          S().voiceReady = true; if (j.voices && j.voices[0] && !S().voiceId) S().voiceId = j.voices[0].id; Store.save();
          api.close(true); ui.toast('Cassius’s voice is set up' + (j.voices && j.voices[0] ? ': ' + j.voices[0].name : ''));
          if (then) then();
        } catch (e) { say(e.message, true); }
        finally { btn.disabled = false; btn.textContent = 'Save the key'; }
      };
    } });
  }

  /* ---------- the voice and this month's characters ---------- */
  function sheet() {
    ui.sheet({ title: 'Cassius’s voice', kicker: 'Listen', render(api) {
      const b = api.body;
      const use = h('<div class="card pad v-use"><div class="g-meta"><span class="tag">This month</span><span class="small"></span></div><div class="v-bar"><u></u></div><p class="small v-usetx">Checking…</p></div>');
      const list = h('<div class="card v-list"><div class="row"><span class="tx"><small>Loading your voices…</small></span></div></div>');
      const fast = h('<div class="card"><div class="row"><span class="tx"><b>Faster voice</b><small>Half the characters a sitting. A little less rich.</small></span><button class="switch' + (S().voiceFast ? ' on' : '') + '" type="button" role="switch" aria-checked="' + !!S().voiceFast + '" aria-label="Faster voice"></button></div></div>');
      const off = h('<button class="link" type="button" style="align-self:center;margin-top:6px">Remove the ElevenLabs key</button>');
      b.appendChild(use); b.appendChild(h('<div class="sh-mini small" style="padding:4px 4px 0">Voice</div>')); b.appendChild(list); b.appendChild(fast); b.appendChild(off);
      fast.querySelector('.switch').onclick = ev => { const on = !S().voiceFast; S().voiceFast = on; Store.save(); ev.currentTarget.classList.toggle('on', on); ev.currentTarget.setAttribute('aria-checked', on); };
      off.onclick = async () => {
        if (!(await ui.ask({ title: 'Remove the key?', text: 'Cassius stops reading new sittings until you paste a key again. Readings already made still play.', yes: 'Remove', danger: true }))) return;
        try { const j = await call({ do: 'forget' }); if (!j.ok) { ui.toast(j.error); return; } S().voiceReady = false; Store.save(); api.close(); ui.toast('Key removed'); } catch (e) { ui.toast(e.message); }
      };
      let pv = null;
      (async () => {
        let j; try { j = await status(); } catch (e) { use.querySelector('.v-usetx').textContent = e.message; list.innerHTML = ''; return; }
        if (!j.ok) { use.querySelector('.v-usetx').textContent = j.error || 'Couldn’t check just now.'; list.innerHTML = ''; return; }
        if (!j.ready) { api.close(true); setup(); return; }
        const m = U.key().slice(0, 7), mine = (j.months || {})[m] || 0, u = j.usage;
        if (u && u.limit) {
          set(use, '.g-meta .small', (u.tier ? String(u.tier).replace(/^\w/, c => c.toUpperCase()) + ' plan' : '') + (u.resets ? ' · resets ' + U.fmtDateShort(u.resets.slice(0, 10)) : ''));
          use.querySelector('.v-bar u').style.width = Math.min(100, u.used / u.limit * 100).toFixed(1) + '%';
          use.querySelector('.v-usetx').textContent = u.used.toLocaleString() + ' of ' + u.limit.toLocaleString() + ' characters used' + (mine ? ' · ' + mine.toLocaleString() + ' on sittings' : '') + '. A sitting is about 2,000.';
        } else {
          use.querySelector('.v-bar').remove();
          use.querySelector('.v-usetx').textContent = (mine ? mine.toLocaleString() + ' characters on sittings this month.' : 'No sittings read yet this month.') + ' Turn on User (read) on the key to see your plan’s total here.';
        }
        list.innerHTML = '';
        const cur = S().voiceId || (j.voices[0] && j.voices[0].id);
        j.voices.slice(0, 24).forEach((v, i) => {
          const r = h('<div class="row tap v-row' + (v.id === cur ? ' on' : '') + '"><span class="v-dot" aria-hidden="true"></span><span class="tx"><b></b><small></small></span>' + (v.preview ? '<button class="lb v-pv" type="button" aria-label="Hear a sample">' + I.play + '</button>' : '') + '</div>');
          r.querySelector('b').textContent = v.name + (v.own ? ' · added by you' : i === 0 || (i && j.voices[i - 1].own) ? ' · suits Cassius' : '');
          r.querySelector('small').textContent = v.about || '';
          r.onclick = () => { S().voiceId = v.id; Store.save(); list.querySelectorAll('.v-row').forEach(x => x.classList.toggle('on', x === r)); ui.toast(v.name + ' reads from the next sitting'); };
          const p = r.querySelector('.v-pv');
          if (p) p.onclick = ev => { ev.stopPropagation(); if (pv && !pv.paused) { pv.pause(); p.innerHTML = I.play; return; } if (A && !A.paused) A.pause(); pv = pv || new Audio(); pv.src = v.preview; pv.play().catch(() => ui.toast('Couldn’t play the sample.')); list.querySelectorAll('.v-pv').forEach(x => x.innerHTML = I.play); p.innerHTML = I.pause; pv.onended = () => p.innerHTML = I.play; };
          list.appendChild(r);
        });
      })();
    }, onClose: () => { } });
  }
  const set = (el, sel, t) => { const x = el.querySelector(sel); if (x) x.textContent = t; };

  /* a Listen button for a sitting */
  function button(l, cls, label) {
    const b = h('<button class="' + (cls || 'btn quiet') + ' listen-b" type="button">' + I.play + '<span></span></button>');
    b.querySelector('span').textContent = label || 'Listen';
    b.onclick = ev => { ev.stopPropagation(); play(typeof l === 'function' ? l() : l); };
    return b;
  }
  Opus.voice = { play, stop, toggle, button, setup, sheet, ready, state: () => st };
})();
