/* Opus V2 (on 1.42): WHOOP wherever its numbers matter. Recovery on the session in Up next, a named WHOOP walk ticks
   the dog's walk, tonight's sleep against what WHOOP says you need, recovery marks in the Annals, sessions beside the
   recovery they were done on, and dated changes to a lifting session (written to the plan by Duet) applied in the logger. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h, V = Opus.v2, W = Opus.whoop;
  const esc = U.esc;
  if (!W) return;
  const hm = W.hm;

  /* ---------- a dated change to one session: plan.training.adjust["YYYY-MM-DD"] = { by, why, sets: { "<exercise id>": -1 }, note } ---------- */
  const off = () => (Store.data.adjustOff = Store.data.adjustOff || {});
  function adjustFor(d) { const k = typeof d === 'string' ? d : U.key(d), a = (((Plan.p.training || {}).adjust) || {})[k]; return a && typeof a === 'object' && !off()[k] ? Object.assign({ date: k }, a) : null; }
  function adjustText(a) {
    const parts = Object.entries(a.sets || {}).filter(([, n]) => Number(n)).map(([ex, n]) => (n < 0 ? Math.abs(n) + (Math.abs(n) === 1 ? ' set' : ' sets') + ' off ' : n + ' more on ') + Plan.exercise(ex).name.toLowerCase());
    return parts.join(', ');
  }
  function adjustLine(d, redraw) {
    const a = adjustFor(d); if (!a) return null;
    const el = h('<div class="wr-line v2-adj"><i></i><span><b>' + esc(a.by || 'Duet') + ' changed this session.</b> ' + esc([adjustText(a), a.note].filter(Boolean).join('. ')) + (a.why ? ' <em>' + esc(a.why) + '</em>' : '') + ' </span></div>');
    const btn = h('<button class="link wr-act" type="button">Use the full session</button>');
    btn.onclick = e => { e.stopPropagation(); off()[a.date] = true; const s = Store.data.active; if (s && s.adjusted && s.date === a.date) { for (const [ex, n] of Object.entries(s.adjusted.sets || {})) { s.extra[ex] = (s.extra[ex] || 0) - n; if (!s.extra[ex]) delete s.extra[ex]; } delete s.adjusted; } Store.save(true); ui.toast('Back to the full session'); redraw ? redraw() : Opus.refresh(); };
    el.querySelector('span').appendChild(btn);
    return el;
  }
  if (Opus.train && Opus.train.start) {
    const start0 = Opus.train.start;
    Opus.train.start = function (wid, dateKey) {
      const had = !!Store.data.active, r = start0(wid, dateKey), s = Store.data.active, a = s && adjustFor(s.date);
      if (!had && s && a && !s.adjusted) {
        const applied = {};
        for (const [ex, n0] of Object.entries(a.sets || {})) { const b = s.blocks.find(x => x.ex === ex), n = Math.max(Number(n0) || 0, b ? 1 - b.sets : 0); if (b && n) { s.extra[ex] = (s.extra[ex] || 0) + n; applied[ex] = n; } }
        s.adjusted = { by: a.by || 'Duet', why: a.why || '', sets: applied };
        Store.save(true);
        const t = ui.topSheet(); if (t) { t.close(true); setTimeout(() => Opus.train.openLogger(), 30); }
      }
      return r;
    };
  }

  /* ---------- Up next: recovery, and any change to the session, on the workout card ---------- */
  const dress0 = V.dressNext;
  V.dressNext = function (el, nx, d) {
    dress0(el, nx, d);
    if (!nx || nx.kind !== 'workout') return;
    const box = h('<div class="v2-wh"></div>'), a = adjustLine(d), l = W.trainLine(d);
    if (a) box.appendChild(a); if (l) box.appendChild(l);
    if (box.children.length) el.insertBefore(box, el.querySelector('.v2-acts'));
  };

  /* ---------- a walk or run you named in WHOOP ticks the dog's walk ---------- */
  function walkTick(d) {
    const day = W.day(d), acts = ((day && day.workouts) || []).filter(o => /walk|run|hik|ruck|dog/i.test(String(o.sport || ''))); if (!acts.length) return;
    const it = Plan.itemsFor(d).find(x => x.kind === 'home' && x.home && x.home.pet && /walk/i.test(x.title)); if (!it) return;
    const k = U.key(d), seen = Store.data.autoTicks = Store.data.autoTicks || {};
    if ((seen[k] || []).includes(it.id) || Plan.isChecked(d, it.id) || V.isSkipped(d, it.id)) return;
    (seen[k] = seen[k] || []).push(it.id); Plan.setChecked(d, it.id, true);
    const o = acts[acts.length - 1], t = o.start ? new Date(o.start) : null;
    setTimeout(() => ui.toast('WHOOP saw a ' + (o.minutes ? o.minutes + '-minute ' : '') + (/walk/i.test(o.sport) ? 'walk' : /run/i.test(o.sport) ? 'run' : /hik|ruck/i.test(o.sport) ? 'hike' : String(o.sport).replace(/[-_]/g, ' ').toLowerCase()) + (t ? ' at ' + U.fmtTimeAP(U.pad(t.getHours()) + ':' + U.pad(t.getMinutes())) : '') + '. ' + it.title + ' is ticked.', { label: 'Undo', run: () => { Plan.setChecked(d, it.id, false); Opus.refresh(); } }), 400);
  }

  /* ---------- tomorrow: tonight's sleep against what WHOOP asked for, and any change to tomorrow's session ---------- */
  const before0 = V.beforeWeek;
  V.beforeWeek = function (v, d) {
    before0(v, d);
    const card = v.querySelector('.v2-tom .card'); if (!card) return;
    const s = Plan.p.schedule || {}, lo = U.mins(s.lightsOut), wk = U.mins(s.wake), day = W.day(d), need = day && day.sleep && day.sleep.need;
    if (lo != null && wk != null) {
      const bed = (wk + 1440 - lo) % 1440, r = h('<div class="row wa-row"><span class="tag wa-d">Sleep</span><span class="tx"><b></b><small></small></span><span class="tm num"></span></div>');
      r.querySelector('b').textContent = hm(bed) + ' in bed if lights go out at ' + U.fmtTimeAP(s.lightsOut);
      r.querySelector('small').textContent = need ? 'WHOOP said you needed ' + hm(need) + ' last night' + (need > bed ? ', ' + hm(need - bed) + ' more than that.' : '.') : 'WHOOP has no sleep need for last night yet.';
      card.appendChild(r);
    }
    const a = adjustLine(U.addDays(d, 1)); if (a) card.parentElement.appendChild(a);
  };

  /* ---------- Body: every session beside the recovery and sleep it was done on ---------- */
  function realSessions() { return Store.data.workouts.filter(w => !(w.started && w.finished && (Date.parse(w.finished) - Date.parse(w.started)) < 5 * 60e3 && !w.catchUp)).sort((a, b) => b.date.localeCompare(a.date)); }
  function liftingSection() {
    const all = realSessions(), withRec = all.filter(w => W.rec(w.date));
    const s = h('<div class="sec v2-whl"><div class="sh"><span class="r">✦</span><span class="t">Recovery and your lifting</span><span class="c num">' + withRec.length + ' of ' + all.length + ' with WHOOP</span></div><div class="card"></div></div>'), card = s.querySelector('.card');
    if (!all.length) { card.appendChild(h('<div class="row"><span class="tx"><small>Finish a session and it shows here beside that morning’s recovery.</small></span></div>')); return s; }
    for (const w of all.slice(0, 8)) {
      const r = W.rec(w.date), dy = W.day(w.date), band = r ? W.band(r.score) : '', firsts = V.firstsOn ? V.firstsOn(w.date).length : 0;
      const row = h('<div class="row tap"><span class="wr-dot ' + band + '"></span><span class="tx"><b>' + esc(w.name) + (firsts ? V.firstTag() : '') + '</b><small class="num">' + esc([U.fmtDateShort(w.date), r ? 'recovery ' + r.score + '%' : 'no WHOOP that day', dy && dy.sleep && dy.sleep.asleep != null ? 'slept ' + hm(dy.sleep.asleep) : null].filter(Boolean).join(' · ')) + '</small></span>' + ui.icon('chev', 'chev ico') + '</div>');
      row.onclick = () => V.dayPage && V.dayPage(w.date); card.appendChild(row);
    }
    const by = { green: [0, 0], yellow: [0, 0], red: [0, 0] };
    for (const w of withRec) { const b = W.band(W.rec(w.date).score); by[b][0]++; if (V.firstsOn && V.firstsOn(w.date).length) by[b][1]++; }
    const line = withRec.length >= 6 ? 'Sessions with a first: ' + ['green', 'yellow', 'red'].filter(b => by[b][0]).map(b => by[b][1] + ' of ' + by[b][0] + ' on ' + b + ' days').join(', ') + '.' : withRec.length + (withRec.length === 1 ? ' session has' : ' sessions have') + ' a recovery score so far. At six, Opus sets green, yellow and red days side by side here.';
    s.appendChild(h('<p class="small" style="padding:0 4px">' + esc(line) + ' Your own numbers, not a diagnosis.</p>'));
    return s;
  }
  const tabs = Opus.tabsAll();
  if (tabs.today) { const t0 = tabs.today.render; tabs.today.render = function (v, o) { try { walkTick(new Date()); } catch (e) { console.warn('opus: walk tick', e); } return t0.call(this, v, o); }; }
  if (tabs.train) {
    const r0 = tabs.train.render;
    tabs.train.render = function (v, o) {
      r0.call(this, v, o);
      try {
        const d = new Date(), a = Plan.workoutFor(d) ? adjustLine(d) : null, secs = [...v.querySelectorAll('.sec')], after = secs.find(x => /recovery/i.test((x.querySelector('.t') || {}).textContent || '')) || secs[0];
        const sec = liftingSection(); if (after && after.parentElement) after.parentElement.insertBefore(sec, after.nextSibling); else v.appendChild(sec);
        if (a) { const first = v.querySelector('.sec'); (first ? first.parentElement : v).insertBefore(a, first || null); }
      } catch (e) { console.warn('opus: whoop lifting', e); }
    };
  }
  Object.assign(V, { adjustFor, adjustLine, liftingSection, walkTick });
})();
