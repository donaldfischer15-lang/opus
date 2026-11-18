/* Opus training logic: progressive overload, plate math, bests. No UI here. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store;

  const T = {
    cfg() { return Plan.p.training || {}; },
    /* every set ever logged for an exercise, newest session first */
    sessionsFor(exId) {
      const out = [];
      const all = Store.data.workouts.slice().sort((a, b) => (b.finished || b.started).localeCompare(a.finished || a.started));
      for (const w of all) { const sets = w.sets.filter(s => s.ex === exId && !s.warmup); if (sets.length) out.push({ date: w.date, workout: w.workout, sets }); }
      return out;
    },
    lastFor(exId) { return this.sessionsFor(exId)[0] || null; },
    best(exId, excludeSessionId) {
      let best = 0;
      for (const w of Store.data.workouts) { if (w.id === excludeSessionId) continue; for (const s of w.sets) if (s.ex === exId) best = Math.max(best, U.e1rm(s.weight, s.reps)); }
      return best;
    },
    hasHistory(exId) { return Store.data.workouts.some(w => w.sets.some(s => s.ex === exId)); },

    /* weight steps by how the lift is loaded */
    step(exId, w, dir) {
      const ex = Plan.exercise(exId), c = this.cfg(), inc = c.increments || {};
      dir = dir || 1;
      if (ex.load === 'dumbbell') {
        const db = (c.dumbbells || []).slice().sort((a, b) => a - b);
        if (!db.length) return Math.max(0, (w || 0) + 5 * dir);
        if (w == null) return db[0];
        if (dir > 0) { const n = db.find(x => x > w + 1e-9); return n == null ? w + 5 : n; }
        const p = db.filter(x => x < w - 1e-9).pop(); return p == null ? db[0] : p;
      }
      const def = { 'barbell-lower': 10, 'barbell-upper': 5, machine: 10, cable: 5, bodyweight: 0 };
      const s = Number(inc[ex.load] != null ? inc[ex.load] : def[ex.load] != null ? def[ex.load] : 5);
      return Math.max(0, (w || 0) + s * dir);
    },
    fineStep(exId) {
      const ex = Plan.exercise(exId);
      if (ex.load === 'dumbbell') return null; // use dumbbell sizes
      if (ex.load && ex.load.startsWith('barbell')) return 5;
      return 5;
    },
    incLabel(exId, w) {
      const ex = Plan.exercise(exId);
      if (ex.load === 'dumbbell') return 'the next dumbbell (' + U.wt(this.step(exId, w, 1)) + 's)';
      const n = this.step(exId, w, 1) - (w || 0);
      return n + ' lb';
    },
    roundTo(exId, w) {
      const ex = Plan.exercise(exId);
      if (ex.load === 'dumbbell') { const db = (this.cfg().dumbbells || []); if (!db.length) return w; return db.reduce((b, x) => Math.abs(x - w) < Math.abs(b - w) ? x : b, db[0]); }
      return Math.round(w / 5) * 5;
    },

    /* progressive overload: what to do next time, and why */
    suggest(block) {
      const exId = block.ex, [lo, hi] = block.reps, sets = block.sets;
      const ex = Plan.exercise(exId);
      const hist = this.sessionsFor(exId);
      if (!hist.length) {
        if (block.start != null) return { weight: block.start, reps: lo, kind: 'start', reason: 'Starting point from your plan. Earn ' + hi + ' on every set, then add ' + this.incLabel(exId, block.start) + '.' };
        return { weight: null, reps: lo, kind: 'first', reason: 'First time. Pick a weight you could lift for 2 more reps than ' + lo + '.' };
      }
      if (ex.load === 'bodyweight') {
        const last = hist[0].sets; const minR = Math.min(...last.map(s => s.reps));
        return { weight: null, reps: Math.min(hi, minR + 1), kind: 'reps', reason: 'Add a rep to each set.' };
      }
      const last = hist[0].sets;
      const top = Math.max(...last.map(s => s.weight || 0));
      const atTop = last.filter(s => (s.weight || 0) === top);
      const minR = Math.min(...atTop.map(s => s.reps));
      if (atTop.length >= sets && minR >= hi) {
        const nw = this.step(exId, top, 1);
        return { weight: nw, reps: lo, kind: 'up', from: top, reason: 'You hit ' + hi + ' on all ' + sets + ' sets at ' + U.wt(top) + '. Move to ' + U.wt(nw) + ' and build back up from ' + lo + '.' };
      }
      if (atTop.length >= Math.min(sets, atTop.length) && minR >= lo) {
        const target = Math.min(hi, minR + 1);
        return { weight: top, reps: target, kind: 'hold', reason: 'Stay at ' + U.wt(top) + ' and aim for ' + target + ' on every set. At ' + hi + ' across the board, you move up.' };
      }
      // fell short of the low end
      const prev = hist[1];
      const prevShort = prev && Math.max(...prev.sets.map(s => s.weight || 0)) === top && Math.min(...prev.sets.map(s => s.reps)) < lo;
      if (prevShort) {
        const nw = this.roundTo(exId, top * 0.9);
        return { weight: nw, reps: lo, kind: 'reset', reason: 'Two sessions short of ' + lo + ' at ' + U.wt(top) + '. Drop to ' + U.wt(nw) + ', own it, and build back.' };
      }
      return { weight: top, reps: lo, kind: 'repeat', reason: 'Repeat ' + U.wt(top) + ' and get ' + lo + ' on every set before adding weight.' };
    },

    /* plate math: plates per side for a barbell total */
    plates(total, bar, plates) {
      const c = this.cfg();
      bar = bar != null ? bar : (c.bar != null ? c.bar : 45);
      plates = (plates || c.plates || [45, 35, 25, 10, 5, 2.5]).slice().sort((a, b) => b - a);
      if (total == null || isNaN(total)) return null;
      if (total < bar) return { bar, perSide: [], leftover: 0, under: true, total };
      let side = (total - bar) / 2; const out = [];
      for (const p of plates) { while (side >= p - 1e-9) { out.push(p); side -= p; } }
      const leftover = Math.round(side * 2 * 100) / 100;
      return { bar, perSide: out, leftover, total, loaded: total - leftover };
    },
    isBarbell(exId) { const l = Plan.exercise(exId).load || ''; return l.startsWith('barbell'); },

    /* lift trends: best estimated 1-rep max per session */
    trend(exId) {
      const pts = [];
      for (const w of Store.data.workouts.slice().sort((a, b) => a.date.localeCompare(b.date))) {
        const sets = w.sets.filter(s => s.ex === exId); if (!sets.length) continue;
        const b = Math.max(...sets.map(s => U.e1rm(s.weight, s.reps)));
        const top = sets.reduce((a, s) => (U.e1rm(s.weight, s.reps) > U.e1rm(a.weight, a.reps) ? s : a), sets[0]);
        pts.push({ date: w.date, v: Math.round(b), top });
      }
      return pts;
    },
    mainLifts() {
      const out = []; const seen = new Set();
      for (const w of Object.values(this.cfg().workouts || {})) { const b = (w.blocks || [])[0]; if (b && !seen.has(b.ex)) { seen.add(b.ex); out.push(b.ex); } }
      return out;
    }
  };
  Opus.training = T;
})();
