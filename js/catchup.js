/* The catch-up session: when lifts planned in the last few days weren't logged, a free day (a day off, or any
   day that's neither a workday nor a training day) offers one longer session that covers them.
   - Each missed workout's main lift comes first, then the rest of its work, then one conditioning piece.
   - If a leg day is coming within two days, anything marked "legs": true on the exercise is left out, so the legs stay fresh.
   - A hand-written session for a date wins: plan training.workouts["catch-up-YYYY-MM-DD"] shows on that date as is.
   The session's id is "catch-up-" + its date, so the logger and history can always find it again. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const BACK = 6, AHEAD = 2, PREFIX = 'catch-up-';

  const T = () => (Plan.p && Plan.p.training) || {};
  const scheduled = d => { const id = (T().schedule || {})[U.dayKey(d)]; return id && (T().workouts || {})[id] ? id : null; };
  const logged = () => Store.data.workouts || [];
  const skipped = d => (Store.data.checks[U.key(d)] || []).includes('catch-up-skip');
  const legs = exId => !!((T().exercises || {})[exId] || {}).legs;
  const name = id => ((T().workouts || {})[id] || {}).name || id;

  /* the sessions the days before d planned and nobody logged (only days already past) */
  function missed(d) {
    const out = [], today = U.key(new Date()), k = U.key(d);
    for (let i = BACK; i >= 1; i--) {
      const x = U.addDays(d, -i), xk = U.key(x), id = scheduled(x);
      if (!id || xk >= today) continue;
      const covered = logged().some(w => w.date === xk || (w.date > xk && w.date < k && (w.workout === id || String(w.workout || '').startsWith(PREFIX))));
      if (!covered) out.push({ date: x, id });
    }
    return out;
  }
  function legDaySoon(d) {
    for (let i = 1; i <= AHEAD; i++) {
      const id = scheduled(U.addDays(d, i)); if (!id) continue;
      if (((T().workouts[id] || {}).blocks || []).some(b => legs(b.ex))) return { id, date: U.addDays(d, i) };
    }
    return null;
  }

  function build(d) {
    const ms = missed(d); if (!ms.length) return null;
    const soon = legDaySoon(d), left = [];
    const mains = [], rest = [];
    let cond = null;
    const warm = [];
    ms.forEach(m => {
      const w = T().workouts[m.id];
      (w.blocks || []).forEach((b, i) => {
        if (soon && legs(b.ex)) { left.push(Plan.exercise(b.ex).name); return; }
        if ((i === 0 ? mains : rest).some(x => x.ex === b.ex)) return;
        (i === 0 ? mains : rest).push(U.clone(b));
      });
      if (!cond && w.conditioning) cond = U.clone(w.conditioning);
      (w.warmup || []).forEach(x => { if (warm.length < 5 && !warm.includes(x)) warm.push(x); });
    });
    if (!mains.length && !rest.length) return null;
    const days = ms.map(m => U.DAY_NAMES[m.date.getDay()].slice(0, 3)).join(' and ');
    const w = {
      id: PREFIX + U.key(d), name: 'Catch-up', focus: ms.map(m => name(m.id)).join(' + '),
      warmup: warm, cooldown: [], blocks: mains.concat(rest), catchFor: ms.map(m => U.key(m.date)),
      why: 'Covers ' + ms.map(m => name(m.id)).join(' and ') + ' from ' + days + (left.length ? '. ' + left.join(', ') + ' left out so ' + U.DAY_NAMES[soon.date.getDay()] + '’s ' + name(soon.id) + ' gets fresh legs.' : '.')
    };
    if (cond) w.conditioning = cond;
    return w;
  }

  /* a free day: not a workday (days off count), no planned session */
  const free = d => !Plan.isWorkday(d) && !scheduled(d);

  function forDate(d) {
    const k = U.key(d), own = (T().workouts || {})[PREFIX + k];
    if (own) return Object.assign({ id: PREFIX + k, name: own.name || 'Catch-up' }, own);
    if (!free(d) || skipped(d)) return null;
    return build(d);
  }

  // Train, Today and the lock screen all ask Plan which session a day has, and the logger asks by id
  const workoutFor0 = Plan.workoutFor, workout0 = Plan.workout;
  Plan.workoutFor = function (d) { return workoutFor0.call(this, d) || forDate(d); };
  Plan.workout = function (id) {
    const w = workout0.call(this, id); if (w) return w;
    if (String(id).startsWith(PREFIX)) { const k = String(id).slice(PREFIX.length); if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return build(U.parseKey(k)); }
    return null;
  };
  const isCatch = id => String(id || '').startsWith(PREFIX);

  /* Train: say why, and let it be skipped */
  function dress(v) {
    const d = new Date(), w = Plan.workoutFor(d);
    if (!w || !isCatch(w.id)) return;
    const card = [...v.querySelectorAll('.next')].find(c => /Catch-up/.test((c.querySelector('.k') || {}).textContent || ''));
    if (!card) return;
    if (w.why) card.querySelector('.body').appendChild(h('<div class="s cu-why">' + U.esc(w.why) + '</div>'));
    const own = !!(T().workouts || {})[w.id];
    if (!own) {
      const sk = h('<button class="link cu-skip" type="button">Not today</button>');
      sk.onclick = () => { Plan.setChecked(d, 'catch-up-skip', true); ui.toast('Catch-up skipped'); Opus.refresh(); };
      card.appendChild(sk);
    }
  }
  const tabs = Opus.tabsAll ? Opus.tabsAll() : {};
  if (tabs.train) { const r0 = tabs.train.render; tabs.train.render = function (v, o) { const r = r0.call(this, v, o); try { dress(v); } catch (e) { console.warn('opus: catch-up', e); } return r; }; }

  Opus.catchUp = { missed, build, forDate, isCatch };
})();
