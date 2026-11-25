/* Opus V2, slices 2 and 3 (prototype on 1.42): the Augur keeps a book and a record; every lift has its own page;
   the Annals hold every day you have logged, with everything that happened on it in one place. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h, T = Opus.training, V = Opus.v2;
  const esc = U.esc;
  const blockOf = ex => { for (const w of Object.values((Plan.p.training || {}).workouts || {})) for (const b of (w.blocks || [])) if (b.ex === ex) return b; return null; };
  const setsText = sets => { const by = new Map(); for (const s of sets) { const k = s.weight || 0; if (!by.has(k)) by.set(k, []); by.get(k).push(s.reps); } return [...by].map(([w, r]) => (w ? U.wt(w) + ' × ' : '') + r.join(', ')).join(' · '); };

  /* ---------- a lift's own page ---------- */
  function liftPage(ex) {
    const name = Plan.exercise(ex).name, all = Store.data.workouts.filter(w => w.sets.some(s => s.ex === ex)).sort((a, b) => b.date.localeCompare(a.date));
    ui.sheet({ title: name, kicker: 'Its whole story', full: true, render(api) {
      const b = api.body;
      if (!all.length) { b.appendChild(h('<p class="empty">Nothing logged yet. The story starts with your first session.</p>')); return; }
      const pts = T.trend(ex).map(p => ({ date: p.date, v: p.v, note: U.wt(p.top.weight) + ' × ' + p.top.reps }));
      let bestW = null; for (const w of all) for (const s of w.sets) if (s.ex === ex && (!bestW || U.e1rm(s.weight, s.reps) > U.e1rm(bestW.weight, bestW.reps))) bestW = Object.assign({ date: w.date }, s);
      b.appendChild(h('<div class="stats"><div class="stat"><span class="v">' + all.length + '</span><span class="k">Sessions</span></div><div class="stat"><span class="v">' + (bestW && bestW.weight ? U.wt(bestW.weight) + '×' + bestW.reps : '—') + '</span><span class="k">Best set · ' + (bestW ? U.fmtDateShort(bestW.date) : '') + '</span></div><div class="stat"><span class="v">' + U.fmtDateShort(all[all.length - 1].date) + '</span><span class="k">First logged</span></div></div>'));
      if (pts.length >= 2) { const c = h('<div class="card pad"><div class="v2-cap" style="margin-bottom:8px">Best set each session, as est. 1-rep max</div></div>'); c.appendChild(ui.chart(pts, { h: 110, fmt: v => U.num(v, 0) })); b.appendChild(c); }
      const blk = blockOf(ex);
      if (blk) { const r = (V.readings() || []).find(x => x.ex === ex); if (r) { const s = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">What comes next</span></div></div>'); s.appendChild(V.readingCard(r, true)); b.appendChild(s); } }
      const s = h('<div class="sec"><div class="sh"><span class="r">' + (blk ? 'II' : 'I') + '</span><span class="t">Every session</span><span class="c num">' + all.length + '</span></div><div class="card"></div></div>'), card = s.querySelector('.card');
      for (const w of all) {
        const sets = w.sets.filter(x => x.ex === ex), rec = Opus.whoop && Opus.whoop.rec(w.date), dy = Opus.whoop && Opus.whoop.day(w.date);
        const bits = [w.name, rec ? 'recovery ' + rec.score + '%' : null, dy && dy.sleep && dy.sleep.asleep != null ? 'slept ' + Opus.whoop.hm(dy.sleep.asleep) : null].filter(Boolean).join(' · ');
        const row = h('<div class="row tap v2-story"><span class="tag wa-d">' + U.fmtDateShort(w.date) + '</span><span class="tx"><b class="num">' + esc(setsText(sets)) + '</b><small>' + esc(bits) + '</small>' + (w.note ? '<small class="v2-note">“' + esc(String(w.note).split('\n')[0]) + '”</small>' : '') + '</span>' + ui.icon('chev', 'chev ico') + '</div>');
        if (V.firstIn && V.firstIn(w, ex)) row.querySelector('b').insertAdjacentHTML('beforeend', V.firstTag());
        row.onclick = () => dayPage(w.date);
        card.appendChild(row);
      }
      b.appendChild(s);
    } });
  }

  /* ---------- the Annals: every day, and everything that happened on it ---------- */
  function dayFacts(k) {
    const d = U.parseKey(k), D = Store.data, items = V.live(Plan.itemsFor(d), d), done = items.filter(it => Plan.isChecked(d, it.id)).length;
    return { d, items, done, share: items.length ? done / items.length : 0, workouts: D.workouts.filter(w => w.date === k), weight: (D.weights || []).find(w => w.date === k) || null,
      whoop: Opus.whoop ? Opus.whoop.day(k) : null, eaten: Plan.eatenOn(k), writing: (D.writing || []).filter(w => w.date === k), kept: (D.kept || []).filter(x => x.date === k),
      receipts: (D.receipts || []).filter(r => r.date === k), cash: ((D.money || {}).cash || []).find(c => c.date === k) || null, supps: (D.supps || []).filter(s => s.date === k).length,
      any: !!((D.checks[k] || []).length || D.workouts.some(w => w.date === k) || (D.weights || []).some(w => w.date === k)) };
  }
  function firstDay() { const D = Store.data, ks = Object.keys(D.checks).concat((D.weights || []).map(w => w.date), D.workouts.map(w => w.date)).filter(Boolean).sort(); return ks[0] || U.key(); }
  function dayPage(k) {
    const f = dayFacts(k), d = f.d;
    ui.sheet({ title: U.DAY_NAMES[d.getDay()] + ', ' + U.fmtDateShort(d), kicker: 'The Annals', full: true, render(api) {
      const b = api.body, nm = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']; let n = 0;
      const sec = (t, c) => { const s = h('<div class="sec"><div class="sh"><span class="r">' + nm[n++] + '</span><span class="t">' + t + '</span><span class="c num">' + esc(c || '') + '</span></div><div class="card"></div></div>'); b.appendChild(s); return s.querySelector('.card'); };
      const row = (title, small, right, fn) => { const r = h('<div class="row' + (fn ? ' tap' : '') + '"><span class="tx"><b></b>' + (small ? '<small></small>' : '') + '</span>' + (right ? '<span class="tm num"></span>' : '') + (fn ? ui.icon('chev', 'chev ico') : '') + '</div>'); r.querySelector('b').textContent = title; if (small) r.querySelector('small').textContent = small; if (right) r.querySelector('.tm').textContent = right; if (fn) r.onclick = fn; return r; };
      b.appendChild(h('<div class="hero v2-dayhero">' + ui.arch(Math.max(1, f.items.length), f.done) + '<div class="big"><div class="n num">' + f.done + '</div><div class="l">OF ' + f.items.length + ' DONE</div></div></div>'));
      const w = f.whoop, r = w && w.recovery && w.recovery.scored ? w.recovery : null;
      if (w && (r || w.sleep || w.day)) { const c = sec('Body', r ? 'recovery ' + r.score + '%' : ''); if (w.sleep && w.sleep.asleep != null) c.appendChild(row('Slept ' + Opus.whoop.hm(w.sleep.asleep), w.sleep.need ? 'Needed ' + Opus.whoop.hm(w.sleep.need) : '', r && r.hrv != null ? 'HRV ' + r.hrv : '')); if (w.day && w.day.strain != null) c.appendChild(row('Strain ' + w.day.strain, w.day.kcal != null ? w.day.kcal.toLocaleString('en-US') + ' calories burned' : '', r && r.rhr != null ? 'RHR ' + r.rhr : '')); if (f.weight) c.appendChild(row('Weighed ' + U.wt(f.weight.lb) + ' lb', '', '')); }
      else if (f.weight) { sec('Body', '').appendChild(row('Weighed ' + U.wt(f.weight.lb) + ' lb', '', '')); }
      if (f.workouts.length) {
        const c = sec('Training', f.workouts.map(x => x.name).join(', '));
        for (const wo of f.workouts) { const exs = [...new Set(wo.sets.map(s => s.ex))]; for (const ex of exs) { const r = row(Plan.exercise(ex).name, setsText(wo.sets.filter(s => s.ex === ex)), '', () => liftPage(ex)); if (V.firstIn && V.firstIn(wo, ex)) r.querySelector('b').insertAdjacentHTML('beforeend', V.firstTag()); c.appendChild(r); } if (wo.note) c.appendChild(h('<div class="row"><span class="tx"><small class="v2-note">“' + esc(String(wo.note).split('\n')[0]) + '”</small></span></div>')); }
      }
      const meals = f.items.filter(it => it.kind === 'meal' && it.meal), extras = f.eaten.filter(e => e.extra);
      if (meals.length || extras.length) {
        const m = Plan.dayMacros(d, true), c = sec('Food', m.kcal ? Math.round(m.kcal).toLocaleString('en-US') + ' cal · ' + Math.round(m.protein) + ' g protein' : '');
        for (const it of meals) { const on = Plan.isChecked(d, it.id), e = Plan.eatenEntry(d, it.id); c.appendChild(row(it.title, on ? (e && e.macros ? 'Changed: ' + Math.round(e.macros.kcal) + ' cal' : 'Eaten as planned') : e && e.skipped ? 'Skipped' : 'Not marked', it.time ? U.fmtTime(it.time) : '', V.mealPage ? () => V.mealPage(it.meal.id) : null)); }
        if (extras.length) c.appendChild(row(extras.length + ' other ' + (extras.length === 1 ? 'thing' : 'things') + ' logged', extras.map(e => e.name).slice(0, 6).join(', ') + (extras.length > 6 ? '…' : ''), ''));
      }
      if (f.cash || f.receipts.length) { const c = sec('Money', ''); if (f.cash) { let free = f.cash.free; try { if (Opus.money.freeOf) free = Opus.money.freeOf(f.cash); } catch (e) {} if (typeof free === 'object' && free) free = free.free; c.appendChild(row('Free cash ' + (typeof free === 'number' ? U.money(free) : '—'), f.cash.note ? String(f.cash.note).split('. ')[0] + '.' : '', '')); } for (const rc of f.receipts) c.appendChild(row(rc.store, rc.items.length + ' items', U.money(rc.total, { cents: true }))); }
      if (f.writing.length || f.kept.length) { const c = sec('Mind', ''); for (const wr of f.writing) c.appendChild(row(wr.kind ? wr.kind[0].toUpperCase() + wr.kind.slice(1) + ' answer' : 'Writing', '“' + String(wr.text).slice(0, 110) + (String(wr.text).length > 110 ? '…' : '') + '”', wr.words + ' words')); for (const kp of f.kept) c.appendChild(row('Kept a line', '“' + String(kp.text).slice(0, 90) + (String(kp.text).length > 90 ? '…' : '') + '”', '')); }
      const left = f.items.filter(it => !Plan.isChecked(d, it.id) && it.kind !== 'meal');
      const c = sec('The day', f.done + ' of ' + f.items.length);
      for (const it of f.items.filter(it => Plan.isChecked(d, it.id) && it.kind !== 'meal')) c.appendChild(h('<div class="row done"><span class="ck on" aria-hidden="true">' + ui.CK + '</span><span class="tx"><b>' + esc(it.title) + '</b></span></div>'));
      if (left.length) c.appendChild(row(left.length + ' not marked', left.map(it => String(it.title).split(':')[0]).join(', '), ''));
      if (f.supps) c.appendChild(row(f.supps + ' supplements taken', '', ''));
      if (!f.any) b.appendChild(h('<p class="empty">Nothing was logged this day.</p>'));
    } });
  }
  function annals() {
    const today = new Date(), first = U.parseKey(firstDay()); let month = new Date(today.getFullYear(), today.getMonth(), 1);
    ui.sheet({ title: 'The Annals', kicker: 'Every day you have logged', full: true, render(api) {
      const b = api.body;
      const draw = () => {
        b.innerHTML = '';
        const days = []; for (let x = new Date(first); U.key(x) <= U.key(today); x = U.addDays(x, 1)) days.push(U.key(x));
        const facts = days.map(dayFacts), tr = facts.reduce((n, f) => n + f.workouts.length, 0);
        b.appendChild(h('<div class="stats"><div class="stat"><span class="v">' + days.length + '</span><span class="k">Days kept</span></div><div class="stat"><span class="v">' + tr + '</span><span class="k">Sessions</span></div><div class="stat"><span class="v">' + facts.reduce((n, f) => n + f.done, 0) + '</span><span class="k">Things done</span></div></div>'));
        if (V.works) b.appendChild(V.works(dayPage));
        const head = h('<div class="v2-calh"><button type="button" class="icon-btn" aria-label="Earlier month">‹</button><span class="eyebrow">' + U.MONTHS[month.getMonth()] + ' ' + month.getFullYear() + '</span><button type="button" class="icon-btn" aria-label="Later month">›</button></div>');
        const [pv, nx] = head.querySelectorAll('button');
        pv.disabled = month <= new Date(first.getFullYear(), first.getMonth(), 1); nx.disabled = month >= new Date(today.getFullYear(), today.getMonth(), 1);
        pv.onclick = () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); draw(); }; nx.onclick = () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); draw(); };
        b.appendChild(head);
        const g = h('<div class="v2-cal" data-noswipe="1"></div>');
        'SMTWTFS'.split('').forEach(x => g.appendChild(h('<span class="dw">' + x + '</span>')));
        for (let i = 0; i < month.getDay(); i++) g.appendChild(h('<span></span>'));
        const dim = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        for (let n = 1; n <= dim; n++) {
          const dt = new Date(month.getFullYear(), month.getMonth(), n), k = U.key(dt), inRange = k >= U.key(first) && k <= U.key(today);
          if (!inRange) { g.appendChild(h('<span class="cd off"><b>' + n + '</b></span>')); continue; }
          const f = dayFacts(k), lvl = f.share >= .85 ? 4 : f.share >= .6 ? 3 : f.share >= .3 ? 2 : f.share > 0 ? 1 : 0;
          const rc = Opus.whoop && Opus.whoop.rec(k), bd = rc ? Opus.whoop.band(rc.score) : '';
          const c = h('<button type="button" class="cd l' + lvl + (k === U.key(today) ? ' now' : '') + (bd ? ' rb-' + bd : '') + '" aria-label="' + (rc ? 'recovery ' + rc.score + ' percent, ' : '') + U.fmtDateShort(dt) + ', ' + f.done + ' of ' + f.items.length + ' done"><b>' + n + '</b><i>' + (f.workouts.length ? '<u class="t"></u>' : '') + (f.weight ? '<u></u>' : '') + (f.writing.length ? '<u></u>' : '') + '</i></button>');
          c.onclick = () => dayPage(k); g.appendChild(c);
        }
        b.appendChild(g);
        b.appendChild(h('<p class="small" style="padding:0 4px">A brighter stone is a fuller day. The marks under a date are a session, a weigh-in and a piece of writing. Tap any day to open it.</p>'));
        const s = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">Lifts</span><span class="c">each has its own page</span></div><div class="card"></div></div>'), card = s.querySelector('.card');
        const exs = [...new Set(Store.data.workouts.flatMap(w => w.sets.map(x => x.ex)))];
        for (const ex of exs) { const hist = T.sessionsFor(ex); const r = h('<div class="row tap"><span class="tx"><b>' + esc(Plan.exercise(ex).name) + '</b><small class="num">' + esc('Last: ' + setsText(hist[0].sets) + ' · ' + U.fmtDateShort(hist[0].date)) + '</small></span><span class="tm num">' + hist.length + '×</span>' + ui.icon('chev', 'chev ico') + '</div>'); r.onclick = () => liftPage(ex); card.appendChild(r); }
        if (exs.length) b.appendChild(s);
        if (V.pagesInto) V.pagesInto(b);
      };
      draw();
    } });
  }
  function annalsRow() {
    const r = h('<div class="row tap"><span class="tx"><b>The Annals</b><small>Every day you’ve logged, and a page for every lift</small></span>' + ui.icon('chev', 'chev ico') + '</div>');
    r.onclick = () => annals(); return r;
  }
  Object.assign(V, { liftPage, dayPage, annals, annalsRow, dayFacts, firstDay });
})();
