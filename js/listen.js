/* Listen: reads a piece out loud with the phone's own voice (no account, no cost), for the commute.
   A small player sits above the tab bar: back a part, play or pause, forward a part, speed, stop.
   The screen stays awake while it plays, because the phone stops speaking when it locks. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Store = Opus.store;
  const h = s => Opus.ui.h(s);
  const S = window.speechSynthesis;
  const ok = !!(S && window.SpeechSynthesisUtterance);
  const RATES = [1, 1.15, 1.3, 0.9];
  const I = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M11 6.5v11L3.5 12zM20 6.5v11L12.5 12z"/></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M13 6.5v11l7.5-5.5zM4 6.5v11l7.5-5.5z"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>'
  };
  let st = null, dock = null, placeIv = null;

  /* the words as they'd be said: no markdown marks, list dashes or quote signs */
  const plain = t => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/^#{1,3}\s+/gm, '')
    .replace(/^\s*[-•]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/[ \t]+/g, ' ').trim();
  /* parts of about two sentences each, so one long paragraph never stalls the voice, and back and forward move a little at a time */
  function parts(pieces) {
    const out = [];
    pieces.filter(Boolean).forEach(p => {
      plain(p).split(/\n\s*\n/).forEach(para => {
        const ss = para.replace(/\n/g, ' ').match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) || [para];
        let cur = '';
        ss.forEach(s => { if ((cur + s).length > 240 && cur) { out.push({ t: cur.trim() }); cur = ''; } cur += s; });
        if (cur.trim()) out.push({ t: cur.trim() });
        if (out.length) out[out.length - 1].gap = true; // a breath between paragraphs
      });
    });
    return out;
  }
  /* the best English voice the phone has: a downloaded Enhanced or Premium voice first */
  function voice() {
    const vs = (S.getVoices() || []).filter(v => /^en[-_]/i.test(v.lang));
    const rank = v => (/premium/i.test(v.name) ? 4 : /enhanced|neural|natural/i.test(v.name) ? 3 : 0) + (/^en[-_]US/i.test(v.lang) ? 1 : 0) + (v.localService ? .5 : 0);
    return vs.sort((a, b) => rank(b) - rank(a))[0] || null;
  }
  const rate = () => { const r = Number((Store.data.settings || {}).listenRate); return RATES.includes(r) ? r : 1; };

  function speak() {
    if (!st || !st.playing) return;
    if (st.i >= st.parts.length) { finish(); return; }
    const p = st.parts[st.i], u = new SpeechSynthesisUtterance(p.t);
    u.rate = rate(); const v = voice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.onend = () => {
      if (!st || st.u !== u || !st.playing) return;
      st.u = null; st.i++; paint();
      st.gapT = setTimeout(speak, p.gap ? 450 : 60);
    };
    u.onerror = e => { if (st && st.u === u && e.error !== 'interrupted' && e.error !== 'canceled') { st.playing = false; paint(); Opus.ui.toast('The phone’s voice stopped. Tap play to go on.'); } };
    st.u = u; S.speak(u);
  }
  function halt() { if (!st) return; clearTimeout(st.gapT); st.u = null; try { S.cancel(); } catch (e) {} }

  function play(o) {
    if (!ok) { Opus.ui.toast('This phone can’t read aloud here.'); return; }
    const ps = parts(o.pieces || [o.text]);
    if (!ps.length) return;
    halt();
    st = { title: o.title || 'Listening', who: o.who || 'Listen', parts: ps, i: 0, playing: true, u: null, gapT: null };
    Opus.ui.wake(true);
    build(); paint(); speak();
  }
  function toggle() {
    if (!st) return;
    if (st.playing) { st.playing = false; halt(); Opus.ui.wake(false); }
    else { if (st.i >= st.parts.length) st.i = 0; st.playing = true; Opus.ui.wake(true); speak(); }
    paint();
  }
  function step(d) {
    if (!st) return;
    halt(); st.i = Math.max(0, Math.min(st.parts.length - 1, st.i + d)); paint();
    if (st.playing) speak();
  }
  function speed() {
    const s = Store.data.settings = Store.data.settings || {};
    s.listenRate = RATES[(RATES.indexOf(rate()) + 1) % RATES.length]; Store.save();
    if (st && st.playing) { halt(); speak(); }
    paint();
  }
  function finish() { if (!st) return; st.playing = false; st.i = st.parts.length; Opus.ui.wake(false); paint(); setTimeout(() => { if (st && !st.playing && st.i >= st.parts.length) stop(); }, 2500); }
  function stop() {
    halt(); st = null; Opus.ui.wake(false); clearInterval(placeIv);
    if (dock) { dock.classList.remove('show'); const d = dock; setTimeout(() => { if (!st && d.parentNode) d.remove(); if (dock === d && !st) dock = null; }, 500); }
  }

  function build() {
    if (dock && dock.parentNode) { place(); dock.classList.add('show'); clearInterval(placeIv); placeIv = setInterval(place, 800); return; }
    dock = h('<div class="listendock" role="region" aria-label="Listening">' +
      '<div class="lbl"><b></b><span></span><i class="lp"><u></u></i></div>' +
      '<button class="lb" type="button" data-a="back" aria-label="Back a part">' + I.back + '</button>' +
      '<button class="lb main" type="button" data-a="toggle" aria-label="Pause"></button>' +
      '<button class="lb" type="button" data-a="fwd" aria-label="Forward a part">' + I.fwd + '</button>' +
      '<button class="lb sp num" type="button" data-a="speed" aria-label="Speed"></button>' +
      '<button class="lb" type="button" data-a="stop" aria-label="Stop">' + I.stop + '</button></div>');
    dock.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      ({ back: () => step(-1), fwd: () => step(1), toggle, speed, stop })[b.dataset.a]();
    });
    document.body.appendChild(dock);
    place();
    requestAnimationFrame(() => requestAnimationFrame(() => dock && dock.classList.add('show')));
    clearInterval(placeIv); placeIv = setInterval(place, 800);
  }
  /* over a sheet it sits at the bottom of the screen; otherwise just above the tab bar */
  function place() {
    if (!dock) return;
    const sh = [...document.querySelectorAll('.sheet')].pop(), f = sh && sh.querySelector('.foot');
    dock.classList.toggle('in-sheet', !!sh);
    // over a sheet with buttons at the bottom, sit just above them so they stay tappable
    dock.style.bottom = sh && f && f.offsetHeight ? (f.offsetHeight + 8) + 'px' : '';
  }
  function paint() {
    if (!dock || !st) return;
    const done = st.i >= st.parts.length;
    dock.querySelector('.lbl b').textContent = st.playing ? 'Reading' : done ? 'Done' : 'Paused';
    dock.querySelector('.lbl span').textContent = st.who + ' · ' + st.title;
    dock.querySelector('.lp u').style.width = (Math.min(st.i, st.parts.length) / st.parts.length * 100).toFixed(1) + '%';
    const m = dock.querySelector('.main'); m.innerHTML = st.playing ? I.pause : I.play; m.setAttribute('aria-label', st.playing ? 'Pause' : 'Play');
    dock.querySelector('.sp').textContent = (rate() === 1 ? '1' : String(rate())) + '×';
  }
  // the phone can drop speech when Opus goes to the background; show it as paused so one tap picks up the same part
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && st && st.playing) { st.playing = false; halt(); paint(); }
  });
  if (ok && S.getVoices && !S.getVoices().length) try { S.addEventListener('voiceschanged', () => {}); } catch (e) {}

  /* a Listen button for any piece */
  function button(o, cls) {
    const b = h('<button class="' + (cls || 'btn quiet') + ' listen-b" type="button">' + I.play + '<span>Listen</span></button>');
    b.onclick = ev => { ev.stopPropagation(); play(typeof o === 'function' ? o() : o); };
    return b;
  }
  Opus.listen = { ok, play, stop, toggle, button, parts, plain, state: () => st };
})();
