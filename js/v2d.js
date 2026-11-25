/* Opus V2 (on 1.42): the small things. A line under the arch that notices the day (a holiday, a first, a milestone),
   firsts marked where they happened, last session's note waiting in the logger, and the Works: every week an arch. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h, V = Opus.v2;
  const esc = U.esc;

  /* ---------- holidays, so a rule you wrote about one is said on the day ---------- */
  function holiday(d) {
    const m = d.getMonth() + 1, n = d.getDate(), dow = d.getDay(), nth = Math.ceil(n / 7), last = n + 7 > new Date(d.getFullYear(), m, 0).getDate();
    if (m === 1 && n === 1) return 'New Year’s Day';
    if (m === 5 && dow === 1 && last) return 'Memorial Day';
    if (m === 7 && n === 4) return 'Independence Day';
    if (m === 9 && dow === 1 && nth === 1) return 'Labor Day';
    if (m === 11 && dow === 4 && nth === 4) return 'Thanksgiving';
    if (m === 12 && n === 24) return 'Christmas Eve';
    if (m === 12 && n === 25) return 'Christmas';
    return null;
  }
  function holidayLine(d) {
    const name = holiday(d); if (!name) return null;
    const key = name.replace(/’/g, "'").toLowerCase(), rules = ((Plan.p.food || {}).rules || []).map(String);
    const free = rules.some(r => r.replace(/’/g, "'").toLowerCase().includes(key) && /free meal/i.test(r));
    return name + '.' + (free ? ' Your free meal.' : '');
  }

  /* ---------- firsts: a session's best set beats every session before it ---------- */
  const before = (a, w) => a.date < w.date || (a.date === w.date && String(a.started || '') < String(w.started || ''));
  function firstIn(w, ex) {
    const best = sets => sets.filter(s => s.ex === ex).reduce((b, s) => (U.e1rm(s.weight, s.reps) > U.e1rm(b.weight, b.reps) ? s : b), { weight: 0, reps: 0 });
    const mine = best(w.sets); if (!mine.weight) return null;
    const prior = Store.data.workouts.filter(a => a.id !== w.id && before(a, w) && a.sets.some(s => s.ex === ex)); if (!prior.length) return null;
    const top = Math.max(...prior.map(a => { const b = best(a.sets); return U.e1rm(b.weight, b.reps); }));
    return U.e1rm(mine.weight, mine.reps) > top + 1e-6 ? mine : null;
  }
  function firstsOn(k) {
    const out = [];
    for (const w of Store.data.workouts.filter(x => x.date === k)) for (const ex of new Set(w.sets.map(s => s.ex))) { const f = firstIn(w, ex); if (f) out.push({ ex, name: Plan.exercise(ex).name, set: f }); }
    return out;
  }
  const firstTag = () => '<span class="v2-first">A first</span>';

  /* ---------- the line under the arch ---------- */
  const WORDS = { 7: 'Seven', 30: 'Thirty', 60: 'Sixty', 100: 'One hundred', 180: 'One hundred and eighty', 365: 'Three hundred and sixty-five' };
  function lede(d) {
    const hl = holidayLine(d); if (hl) return hl;
    for (const k of [U.key(d), U.key(U.addDays(d, -1))]) { const f = firstsOn(k)[0]; if (f) return f.name + ', ' + U.wt(f.set.weight) + ' × ' + f.set.reps + (k === U.key(d) ? '' : ' yesterday') + '. A first.'; }
    if (V.firstDay) { const n = U.daysBetween(U.parseKey(V.firstDay()), d); if (WORDS[n]) return WORDS[n] + ' days since your first log.'; }
    return null;
  }

  /* ---------- last time's note, waiting at the top of the same workout ---------- */
  function lastNote(s) {
    if (!s || !s.workout) return null;
    const prev = Store.data.workouts.filter(w => w.workout === s.workout && w.note && String(w.note).trim() && w.id !== s.id).sort((a, b) => (b.finished || b.started || b.date).localeCompare(a.finished || a.started || a.date))[0];
    if (!prev) return null;
    const el = h('<div class="card pad v2-lastnote"><div class="v2-cap">Last time, ' + U.fmtDateShort(prev.date) + ', you wrote</div></div>');
    for (const line of String(prev.note).split(/\n+/).filter(Boolean).slice(0, 4)) { const p = document.createElement('p'); p.className = 'v2-note'; p.textContent = '“' + line.trim() + '”'; el.appendChild(p); }
    return el;
  }

  /* ---------- the Works: each week an arch of seven stones, side by side, stretching back ---------- */
  function works(open) {
    const today = new Date(), first = U.weekStart(U.parseKey(V.firstDay())), weeks = [];
    for (let w = new Date(first); U.key(w) <= U.key(today); w = U.addDays(w, 7)) weeks.push(new Date(w));
    const cx = 60, cy = 62, R1 = 52, R2 = 37;
    let html = '';
    for (const ws of weeks) {
      let p = '';
      for (let i = 0; i < 7; i++) {
        const d = U.addDays(ws, i), k = U.key(d), fut = k > U.key(today), f = fut ? null : V.dayFacts(k), g = .02;
        const t0 = Math.PI - (i / 7) * Math.PI, t1 = Math.PI - ((i + 1) / 7) * Math.PI, pt = (r, t) => (cx + r * Math.cos(t)).toFixed(2) + ',' + (cy - r * Math.sin(t)).toFixed(2);
        const op = !f || !f.any ? .1 : (.3 + .7 * f.share).toFixed(2);
        p += '<path' + (f && f.any ? ' data-k="' + k + '" tabindex="0" role="button" aria-label="' + U.fmtDateShort(d) + '"' : '') + ' d="M' + pt(R1, t0 - g) + ' A' + R1 + ' ' + R1 + ' 0 0 1 ' + pt(R1, t1 + g) + ' L' + pt(R2, t1 + g) + ' A' + R2 + ' ' + R2 + ' 0 0 0 ' + pt(R2, t0 - g) + 'Z" fill="url(#v2wg)" stroke="' + (k === U.key(today) ? '#fff0d2' : 'rgba(214,163,94,.35)') + '" stroke-width="' + (k === U.key(today) ? 1.4 : .7) + '" opacity="' + op + '"/>';
      }
      html += '<div class="wk"><svg viewBox="0 0 120 96" aria-hidden="false"><rect x="4" y="62" width="19" height="26" fill="url(#v2wg)" opacity=".22"/><rect x="97" y="62" width="19" height="26" fill="url(#v2wg)" opacity=".22"/><line x1="0" y1="88.5" x2="120" y2="88.5" stroke="rgba(214,163,94,.45)"/>' + p + '</svg><span>' + U.fmtDateShort(ws) + '</span></div>';
    }
    const el = h('<div class="sec v2-works"><div class="sh"><span class="r">✦</span><span class="t">The Works</span><span class="c">' + weeks.length + (weeks.length === 1 ? ' arch' : ' arches') + '</span></div>' +
      '<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="v2wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2d3a0"/><stop offset="1" stop-color="#9a6a3e"/></linearGradient></defs></svg>' +
      '<div class="card v2-aq" data-noswipe="1"><div class="run">' + html + '</div></div><p class="small" style="padding:0 4px">Opus means work. Each week is an arch and each day a stone, brighter the fuller the day. Tap a stone to open it.</p></div>');
    el.querySelectorAll('[data-k]').forEach(x => { x.onclick = () => open(x.dataset.k); });
    setTimeout(() => { const r = el.querySelector('.v2-aq'); if (r) r.scrollLeft = r.scrollWidth; }, 60);
    return el;
  }
  Object.assign(V, { holiday, lede, firstIn, firstsOn, firstTag, lastNote, works });
})();
