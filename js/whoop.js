/* WHOOP: the owner's recovery, sleep, strain and workouts, pulled by the Opus helper into whoop.json (read only here).
   Today shows last night; Train turns low recovery into a lighter-day suggestion; Food shows calories burned so far;
   the weekly review shows the week's averages. Nothing shows until WHOOP data exists. */
(function () {
  const Opus = window.Opus, U = Opus.util, Store = Opus.store;
  const h = s => Opus.ui.h(s);
  const W = () => { const w = Store.data.whoop; return w && w.format === 'opus-whoop' && w.days ? w : null; };
  const day = d => { const w = W(); return w ? w.days[typeof d === 'string' ? d : U.key(d || new Date())] || null : null; };
  /* WHOOP's own bands: green 67 and up, yellow 34 to 66, red 33 and under */
  const band = s => s == null ? null : s >= 67 ? 'green' : s >= 34 ? 'yellow' : 'red';
  const hm = m => m == null ? '—' : Math.floor(m / 60) + 'h ' + U.pad(m % 60) + 'm';
  const rec = d => { const x = day(d); const r = x && x.recovery; return r && r.scored && r.score != null ? r : null; };
  function ring(score) {
    const b = band(score), C = 2 * Math.PI * 22, f = Math.max(0, Math.min(100, score || 0)) / 100;
    return '<svg class="wr-ring ' + (b || '') + '" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="22" class="t"/><circle cx="27" cy="27" r="22" class="f" stroke-dasharray="' + (C * f).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 27 27)"/></svg>';
  }
  /* the card on Today: last night's sleep and this morning's recovery */
  function todayCard(d) {
    const x = day(d); if (!x || !(x.recovery || x.sleep)) return null;
    const r = x.recovery || {}, s = x.sleep || {}, sc = r.scored && r.score != null ? r.score : null;
    const sleepLine = s.asleep != null ? 'Slept ' + hm(s.asleep) + (s.need ? ' of ' + hm(s.need) + ' needed' : '') : 'Sleep not scored yet';
    const bits = [r.hrv != null && 'HRV ' + r.hrv, r.rhr != null && 'resting HR ' + r.rhr, x.day && x.day.strain != null && 'strain ' + x.day.strain].filter(Boolean);
    const el = h('<button type="button" class="wr-card"><span class="wr-dial">' + ring(sc) + '<b class="num">' + (sc == null ? '—' : sc + '<small>%</small>') + '</b></span><span class="wr-tx"><span class="k">Recovery' + (r.calibrating ? ' · calibrating' : sc == null ? ' · not scored yet' : ' · ' + { green: 'ready', yellow: 'steady', red: 'low' }[band(sc)]) + '</span><b>' + U.esc(sleepLine) + '</b><small class="num">' + U.esc(bits.join(' · ')) + '</small></span>' + Opus.ui.icon('chev', 'chev ico') + '</button>');
    el.onclick = () => weekSheet();
    return el;
  }
  /* one line for Train: what today's recovery means for the session */
  function trainLine(d) {
    const r = rec(d); if (!r || r.calibrating) return null;
    const b = band(r.score);
    const t = b === 'red' ? 'Recovery ' + r.score + '%, low. Go lighter: drop the last set of each lift and stop 2 to 3 reps short, or move this session to tomorrow.'
      : b === 'yellow' ? 'Recovery ' + r.score + '%. Train as planned.'
      : 'Recovery ' + r.score + '%. A good day to go for the top of your rep ranges.';
    return h('<div class="wr-line ' + b + '"><i></i><span>' + U.esc(t) + '</span></div>');
  }
  /* calories burned so far today (the whole day once WHOOP closes it) */
  function burned(d) { const x = day(d); return x && x.day && x.day.kcal != null ? { kcal: x.day.kcal, open: !!x.day.open } : null; }
  /* averages over the 7 days from weekStart */
  function week(ws) {
    const ks = []; for (let i = 0; i < 7; i++) { const d = new Date(ws); d.setDate(d.getDate() + i); ks.push(U.key(d)); }
    const xs = ks.map(k => day(k)).filter(Boolean); if (!xs.length) return null;
    const avg = a => a.length ? Math.round(a.reduce((m, v) => m + v, 0) / a.length) : null;
    const rs = xs.map(x => x.recovery && x.recovery.scored ? x.recovery.score : null).filter(v => v != null);
    const ss = xs.map(x => x.sleep ? x.sleep.asleep : null).filter(v => v != null);
    return { days: xs.length, recovery: avg(rs), sleep: avg(ss), green: rs.filter(v => v >= 67).length, red: rs.filter(v => v <= 33).length };
  }
  function weekBlock(ws) {
    const w = week(ws); if (!w || (w.recovery == null && w.sleep == null)) return null;
    return h('<div class="stats wr-stats"><div class="stat"><span class="v">' + (w.recovery == null ? '—' : w.recovery + '%') + '</span><span class="k">Avg recovery</span></div><div class="stat"><span class="v">' + hm(w.sleep) + '</span><span class="k">Avg sleep</span></div><div class="stat"><span class="v">' + w.green + ' · ' + w.red + '</span><span class="k">Green · red days</span></div></div>');
  }
  function weekSheet() {
    Opus.ui.sheet({ title: 'Sleep and recovery', kicker: 'WHOOP · last 7 days', render(api) {
      const b = api.body, w = W(); if (!w) return;
      const ks = Object.keys(w.days).sort().reverse().slice(0, 7);
      const card = h('<div class="card"></div>');
      for (const k of ks) {
        const x = w.days[k], r = x.recovery || {}, s = x.sleep || {}, sc = r.scored ? r.score : null;
        const ws = (x.workouts || []).map(o => (o.sport ? o.sport.replace(/[-_]/g, ' ') : 'Workout') + (o.strain != null ? ' ' + o.strain : '')).join(', ');
        card.appendChild(h('<div class="row"><span class="wr-dot ' + (band(sc) || '') + '"></span><span class="tx"><b>' + U.DAY_NAMES[U.parseKey(k).getDay()].slice(0, 3) + ' ' + U.fmtDateShort(k) + '</b><small class="num">' + U.esc(['Slept ' + hm(s.asleep), r.hrv != null && 'HRV ' + r.hrv, x.day && x.day.strain != null && 'strain ' + x.day.strain, x.day && x.day.kcal != null && x.day.kcal.toLocaleString('en-US') + ' cal', ws].filter(Boolean).join(' · ')) + '</small></span><span class="tm num">' + (sc == null ? '—' : sc + '%') + '</span></div>'));
      }
      b.appendChild(card);
      b.appendChild(h('<p class="small" style="padding:0 4px">From your WHOOP, pulled by your Opus helper' + (w.pulled ? ', last at ' + new Date(w.pulled).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '') + '. Green is 67% and up, red is 33% and under.</p>'));
    } });
  }
  /* for Settings: where WHOOP stands */
  function status() {
    const w = W();
    if (!w) return 'Not connected. Your Opus helper pulls WHOOP once you connect it there.';
    if (w.problem && w.problem.text) return (w.connected === false ? 'Disconnected: ' : 'Problem: ') + w.problem.text;
    return w.connected === false ? 'Disconnected. Connect WHOOP again on your helper’s WHOOP page.' : 'Connected' + (w.pulled ? ' · last pulled ' + U.fmtDateShort(new Date(w.pulled)) + ', ' + new Date(w.pulled).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '') + ' · ' + Object.keys(w.days).length + ' days kept';
  }
  Opus.whoop = { data: W, day, band, rec, todayCard, trainLine, burned, week, weekBlock, weekSheet, status, hm };
})();
