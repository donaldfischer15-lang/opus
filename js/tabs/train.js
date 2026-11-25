/* Body tab (its id stays 'train'): WHOOP's recovery, sleep and strain, breathing, weigh-ins, and training: today's session, the set logger with auto rest timer, progressive overload, plate math, history. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, T = Opus.training, h = ui.h;

  const repStr = r => (r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1]);
  const typeName = { compound: 'Big compound', accessory: 'Accessory', isolation: 'Isolation', conditioning: 'Conditioning' };

  /* ---------- plate math view ---------- */
  function plateView(total, base, what) {
    const r = T.plates(total, base);
    what = what || 'bar';
    if (!r) return '<div class="platetext">Enter a weight to see plates.</div>';
    if (r.under) return '<div class="platetext">That is less than the ' + U.wt(r.bar) + ' lb ' + (what === 'bar' ? 'bar' : 'the machine starts at') + '.</div>';
    const known = new Set(['45', '35', '25', '10', '5', '2.5']);
    const ps = r.perSide.map(p => '<span class="plate' + (known.has(String(p)) ? '' : ' other') + '" data-w="' + p + '">' + U.wt(p) + '</span>').join('');
    const txt = r.perSide.length ? 'Per side: ' + r.perSide.map(U.wt).join(' + ') : (what === 'bar' ? 'Just the bar' : 'No plates');
    return '<div style="display:flex;flex-direction:column;gap:6px"><div class="plates" aria-hidden="true"><span class="collar"></span>' + ps + '<span class="sleeve"></span></div>' +
      '<div class="platetext num">' + txt + (r.leftover ? ' <span class="warn">(' + U.wt(r.leftover) + ' lb can’t be made with your plates; loads ' + U.wt(r.loaded) + ')</span>' : '') + (what === 'bar' ? ' · ' + U.wt(r.bar) + ' lb bar' : ' · the machine is ' + U.wt(r.bar) + ' lb empty') + '</div></div>';
  }

  /* ---------- active session helpers ---------- */
  const A = () => Store.data.active;
  function newSession(wid, dateKey) {
    const w = Plan.workout(wid) || { name: 'Free session', blocks: [] };
    return {
      id: U.uid(), workout: wid, name: w.name, date: dateKey || U.key(), started: new Date().toISOString(),
      blocks: U.clone(w.blocks || []), logged: [], draft: {}, extra: {}, warm: [], cool: [], cond: false, open: null, note: ''
    };
  }
  const catchUp = s => s.date !== U.key(); // logging a past day: no rest timer
  const counts = (s, b) => !b.optional || setsFor(s, b.ex).length > 0;
  function totals(s) { let n = 0; s.blocks.forEach(b => { if (counts(s, b)) n += plannedSets(s, b); }); return { done: s.logged.length, all: n }; }
  function setsFor(s, ex) { return s.logged.filter(x => x.ex === ex); }
  function plannedSets(s, b) { return b.sets + (s.extra[b.ex] || 0); }
  function currentBlock(s) { return s.blocks.find(b => counts(s, b) && setsFor(s, b.ex).length < plannedSets(s, b)) || null; }
  function defaultsFor(b, i) {
    const last = T.lastFor(b.ex);
    if (last) { const ls = last.sets[Math.min(i, last.sets.length - 1)]; return { w: ls.weight, r: ls.reps }; }
    const sg = T.suggest(b); return { w: sg.weight, r: sg.reps };
  }
  function draft(s, ex, i, b) {
    s.draft[ex] = s.draft[ex] || {};
    if (!s.draft[ex][i]) {
      // after logging set i-1, carry its numbers forward
      const prev = s.logged.filter(x => x.ex === ex && x.set === i - 1)[0];
      s.draft[ex][i] = prev ? { w: prev.weight, r: prev.reps } : defaultsFor(b, i);
    }
    return s.draft[ex][i];
  }

  /* ---------- the logger ---------- */
  function start(wid, dateKey) {
    if (A() && (A().workout !== wid || (dateKey && A().date !== dateKey))) {
      return ui.ask({ title: 'Session in progress', text: A().name + ' is still open. Finish or discard it first.', yes: 'Open it', no: 'Cancel' }).then(ok => ok && openLogger());
    }
    if (!A()) { Store.data.active = newSession(wid, dateKey); Store.save(); }
    openLogger();
  }
  let clockIv = null;
  function openLogger() {
    const s = A(); if (!s) return;
    ui.wake(true);
    let apiRef = null;
    const sh = ui.sheet({
      title: s.name, kicker: catchUp(s) ? 'Logging ' + U.DAY_NAMES[U.parseKey(s.date).getDay()] : 'In progress', full: true, foot: true,
      onClose() { clearInterval(clockIv); ui.wake(false); Opus.rest.onTick = null; Opus.rest.setSuppress(false); Opus.refresh(); },
      render(api) { apiRef = api; renderLogger(api); }
    });
    // the logger shows the rest timer in its own header, so the floating dock steps aside
    Opus.rest.setSuppress(true);
    Opus.rest.onTick = st => paintTimer(sh.el, st);
    if (Store.data.rest) Opus.rest.resume();
    clearInterval(clockIv);
    const tick = () => { const k = sh.el.querySelector('.head .eyebrow'); if (k && A() && !catchUp(A())) k.textContent = 'In progress · ' + U.fmtDuration((Date.now() - new Date(A().started)) / 1000); if (!Store.data.rest) paintTimer(sh.el, null); };
    tick(); clockIv = setInterval(tick, 1000);
  }

  /* header timer: idle shows quick starts by lift type, running shows the count and −15 / +15 / Stop */
  function paintTimer(root, st) {
    const box = root && root.querySelector('.lgt'); if (!box) return;
    const running = !!(st && st.left > 0), over = !!(st && st.left <= 0);
    const mode = running ? 'run' : over ? 'over' : 'idle';
    const t = box.querySelector('.lgt-t');
    t.textContent = running ? U.fmtDuration(Math.ceil(st.left)) : over ? 'Go' : 'Rest';
    box.classList.toggle('on', running); box.classList.toggle('over', over);
    if (box.dataset.mode !== mode) {
      box.dataset.mode = mode;
      const b = box.querySelector('.lgt-b'); b.innerHTML = '';
      if (mode === 'idle') {
        const tr = (Plan.p.training || {}).rest || {}, o = Store.data.settings.rest || {};
        ['isolation', 'accessory', 'compound'].forEach(k => {
          const sec = Number(o[k] || tr[k] || { compound: 180, accessory: 120, isolation: 75 }[k]);
          const x = h('<button class="lgk" type="button">' + U.fmtDuration(sec) + '</button>');
          x.onclick = () => Opus.rest.start(sec, 'Rest', ''); b.appendChild(x);
        });
      } else {
        [['−15', () => Opus.rest.adjust(-15)], ['+15', () => Opus.rest.adjust(15)], ['Stop', () => Opus.rest.stop()]].forEach(([l, f]) => { const x = h('<button class="lgk" type="button">' + l + '</button>'); x.onclick = f; b.appendChild(x); });
      }
    }
    const nx = root.querySelector('.lgt-n'); if (nx) nx.textContent = st && st.r && st.r.next ? (over ? 'Go: ' : 'Next: ') + st.r.next : nx.dataset.def || '';
  }

  function renderLogger(api, focusEx, last) {
    const s = A(); const b = api.body;
    const keep = b.scrollTop; b.innerHTML = '';
    const w = Plan.workout(s.workout) || {};
    const cur = currentBlock(s);

    b.appendChild(headerCard(s, cur));
    { const ln = Opus.v2 && Opus.v2.lastNote && !s.logged.length ? Opus.v2.lastNote(s) : null; if (ln) b.appendChild(ln); }
    { const wl = s.date === U.key() && Opus.whoop && Opus.whoop.trainLine(new Date(), s, () => renderLogger(api)); if (wl) b.appendChild(wl); }
    if ((w.warmup || []).length) b.appendChild(checklist('Warm-up', w.warmup, s.warm));

    if (!s.blocks.length) b.appendChild(h('<div class="card pad"><p class="empty" style="padding:8px"><span class="serif-h" style="display:block">Add your first exercise</span>Then tap Set as you finish each one.</p></div>'));
    s.blocks.forEach((blk, bi) => b.appendChild(exCard(api, s, blk, bi, cur)));

    const add = h('<button class="btn quiet block" type="button">+ Add an exercise</button>');
    add.onclick = () => pickExercise(ex => { const ss = A(); if (!ss) return; ss.blocks.push({ ex, sets: 3, reps: [8, 12], start: null }); Store.save(true); renderLogger(api, ex, true); ui.toast(Plan.exercise(ex).name + ' added'); });
    b.appendChild(add);

    if (w.conditioning) b.appendChild(condCard(api, s, w.conditioning));
    if ((w.cooldown || []).length) b.appendChild(checklist('Cool-down', w.cooldown, s.cool));

    const note = h('<div class="field"><label for="sess-note">Notes</label><textarea class="input" id="sess-note" rows="3" style="min-height:84px" placeholder="How it felt, anything to flag"></textarea></div>');
    note.querySelector('textarea').value = s.note || '';
    note.querySelector('textarea').oninput = e => { s.note = e.target.value; Store.save(); };
    b.appendChild(note);
    b.appendChild(h('<p class="small" style="text-align:center">' + (Store.ok() ? 'Saves on this phone as you go. Close the app and it picks up here.' : 'This browser can’t save here. Finish before you close it.') + '</p>'));

    api.foot.innerHTML = '';
    const fin = h('<div class="btns"><button class="btn quiet" type="button">Discard</button><button class="btn" type="button">Finish workout</button></div>');
    fin.children[0].onclick = () => ui.ask({ title: 'Discard this session?', text: 'The ' + s.logged.length + ' logged sets will be deleted.', yes: 'Discard', danger: true }).then(ok => { if (ok) { Store.data.active = null; Opus.rest.stop(); Store.save(); api.close(); } });
    fin.children[1].onclick = () => finish(api);
    api.foot.appendChild(fin);

    b.scrollTop = keep;
    if (focusEx) {
      const els = b.querySelectorAll('.ex[data-ex="' + focusEx + '"]'), el = last ? els[els.length - 1] : els[0];
      if (el) { if (last) el.classList.add('flash'); setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }
    }
    paintTimer(api.el, Store.data.rest ? { left: (Store.data.rest.endAt - Date.now()) / 1000, r: Store.data.rest } : null);
  }

  function headerCard(s, cur) {
    const t = totals(s), pct = t.all ? t.done / t.all * 100 : 0;
    let nxt = 'Add an exercise to start.';
    if (cur) { const k = setsFor(s, cur.ex).length, d = draft(s, cur.ex, k, cur); nxt = 'Up next: ' + Plan.exercise(cur.ex).name + ', set ' + (k + 1) + (d.w != null && d.w !== '' ? ' · ' + U.wt(d.w) + ' × ' + (d.r ?? '—') : ''); }
    else if (t.all) nxt = 'All sets done. Finish when you’re ready.';
    const el = h('<div class="lgp"><div class="lgp-top"><span class="tag">' + t.done + ' / ' + t.all + ' sets done</span><span class="small num">' + (catchUp(s) ? 'Catching up · ' + U.fmtDateShort(s.date) : '') + '</span></div>' +
      '<div class="bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      (catchUp(s) ? '<div class="lgt-n small">' + U.esc(nxt) + '</div>' :
      '<div class="lgt" data-mode=""><span class="lgt-t num">Rest</span><span class="lgt-b"></span></div><div class="lgt-n small"></div>') + '</div>');
    const n = el.querySelector('.lgt-n'); if (n) { n.dataset.def = nxt; n.textContent = nxt; }
    return el;
  }

  function checklist(title, list, store) {
    const sec = h('<div class="sec"><div class="sh"><span class="t">' + title + '</span><span class="c num">' + store.length + ' / ' + list.length + '</span></div><div class="tgl"></div></div>');
    list.forEach((t, i) => {
      const r = h('<button class="tgb' + (store.includes(i) ? ' on' : '') + '" type="button"><span class="ck">' + ui.CK + '</span><span>' + U.esc(t) + '</span></button>');
      r.onclick = () => { const k = store.indexOf(i); if (k >= 0) store.splice(k, 1); else store.push(i); r.classList.toggle('on'); sec.querySelector('.c').textContent = store.length + ' / ' + list.length; Store.save(); ui.buzz(8); };
      sec.querySelector('.tgl').appendChild(r);
    });
    return sec;
  }

  function exCard(api, s, blk, bi, cur) {
    const ex = Plan.exercise(blk.ex), done = setsFor(s, blk.ex).length, n = plannedSets(s, blk);
    const isCur = cur && cur.ex === blk.ex, per = blk.perSide || ex.repsNote || '';
    const sg = T.suggest(blk), last = T.lastFor(blk.ex);
    const target = (sg.weight != null ? U.wt(sg.weight) + ' · ' : '') + n + '×' + repStr(blk.reps) + (per ? ' ' + per : '');
    const lastTxt = last ? U.fmtDateShort(last.date) + ': ' + groupSets(last.sets) : 'Nothing logged yet';
    const card = h('<div class="ex' + (isCur ? ' cur' : '') + (done >= n ? ' fin' : '') + '" data-ex="' + U.esc(blk.ex) + '">' +
      (blk.optional ? '<div class="tag" style="padding:12px 16px 0">Optional · first to cut</div>' : '') +
      '<div class="eh"><div class="tx"><div class="nm"><span class="exn">' + U.roman(bi + 1) + '.</span> ' + U.esc(ex.name) + '</div></div><span class="small num">' + done + '/' + n + '</span></div>' +
      '<div class="eb"><div class="exi"><div><span>Target</span><b class="num">' + U.esc(target) + '</b></div><div><span>Last time</span><b class="num">' + U.esc(lastTxt) + '</b></div><div><span>Rest</span><b class="num">' + U.fmtDuration(Plan.restFor(blk.ex)) + '</b></div></div>' +
      (blk.cue || ex.cue ? '<p class="note">' + U.esc(blk.cue || ex.cue) + '</p>' : '') + '</div></div>');
    const body = card.querySelector('.eb');

    const sug = h('<div class="sug">' + ui.icon('trend') + '<div style="flex:1">' + U.esc(sg.reason) + '</div>' + (sg.weight != null ? '<button class="btn sm ghost" type="button">Use ' + U.wt(sg.weight) + '</button>' : '') + '</div>');
    if (sg.weight != null) sug.querySelector('button').onclick = () => {
      for (let i = 0; i < n; i++) if (!s.logged.some(x => x.ex === blk.ex && x.set === i)) { const d = draft(s, blk.ex, i, blk); d.w = sg.weight; d.r = sg.reps; d.touched = false; }
      Store.save(); renderLogger(api);
    };
    body.appendChild(sug);

    const pBase = T.plateBase(blk.ex), pWhat = T.isBarbell(blk.ex) && Plan.exercise(blk.ex).base == null ? 'bar' : 'machine';
    const plateBox = pBase != null ? h('<div></div>') : null;
    if (plateBox) body.appendChild(plateBox);

    const sets = h('<div class="sets"><div class="sethead"><span>lb</span><span></span><span>Reps</span><span></span><span></span></div></div>');
    let firstOpen = -1;
    for (let i = 0; i < n; i++) {
      const lg = s.logged.find(x => x.ex === blk.ex && x.set === i);
      if (!lg && firstOpen < 0) firstOpen = i;
      const d = lg ? { w: lg.weight, r: lg.reps } : draft(s, blk.ex, i, blk);
      const row = h('<div class="set' + (lg ? ' logged' : '') + '">' +
        '<input class="sw num" inputmode="decimal" aria-label="Set ' + (i + 1) + ' weight" placeholder="lb">' +
        '<button class="sb" type="button" aria-label="One less rep">−</button>' +
        '<input class="sr num" inputmode="numeric" aria-label="Set ' + (i + 1) + ' reps" placeholder="reps">' +
        '<button class="sb" type="button" aria-label="One more rep">+</button>' +
        '<button class="sgo" type="button">' + (lg ? '✓ ' : 'Set ') + U.roman(i + 1) + '</button></div>');
      const [wI, minus, rI, plus, go] = row.children;
      wI.id = 'w-' + bi + '-' + i; rI.id = 'r-' + bi + '-' + i;
      wI.value = d.w == null ? '' : U.wt(d.w); rI.value = d.r == null ? '' : d.r;
      wI.onfocus = rI.onfocus = e => { try { e.target.select(); } catch (x) {} };
      const num = el => { const v = parseFloat(String(el.value).replace(',', '.')); return isNaN(v) ? null : v; };
      if (lg) { wI.readOnly = rI.readOnly = true; minus.disabled = plus.disabled = true; }
      wI.oninput = () => { if (lg) return; const dd = draft(s, blk.ex, i, blk); dd.w = num(wI); dd.touched = true; Store.save(); if (plateBox && i === firstOpen) plateBox.innerHTML = plateView(dd.w, pBase, pWhat); };
      rI.oninput = () => { if (lg) return; rI.value = rI.value.replace(/[^0-9]/g, ''); const dd = draft(s, blk.ex, i, blk); dd.r = num(rI); dd.touched = true; Store.save(); };
      const bump = k => { if (lg) return; const dd = draft(s, blk.ex, i, blk); dd.r = Math.max(0, (num(rI) || 0) + k); dd.touched = true; rI.value = dd.r; Store.save(); ui.buzz(6); };
      minus.onclick = () => bump(-1); plus.onclick = () => bump(1);
      go.onclick = () => {
        if (lg) { s.logged = s.logged.filter(x => x !== lg); s.draft[blk.ex] = s.draft[blk.ex] || {}; s.draft[blk.ex][i] = { w: lg.weight, r: lg.reps, touched: true }; Store.save(); renderLogger(api); return; }
        const rv = num(rI);
        if (!rv) { ui.toast('Enter reps first'); rI.focus(); return; }
        logSet(api, s, blk, i, num(wI), rv);
      };
      sets.appendChild(row);
      if (lg && lg.pr) sets.appendChild(h('<span class="best" style="padding-left:4px">' + ui.icon('laurel', '') + 'New best · ' + U.wt(lg.weight) + ' × ' + lg.reps + '</span>'));
    }
    body.appendChild(sets);
    if (plateBox) { const d0 = firstOpen >= 0 ? draft(s, blk.ex, firstOpen, blk) : { w: (setsFor(s, blk.ex).pop() || {}).weight }; plateBox.innerHTML = plateView(d0.w, pBase, pWhat); }

    const more = h('<div class="btns lgb"><button class="btn quiet sm" type="button">+ Set</button><button class="btn quiet sm" type="button">− Set</button><button class="btn quiet sm" type="button">Swap</button><button class="btn quiet sm" type="button">Remove</button></div>');
    const [bAdd, bLess, bSwap, bDel] = more.children;
    bAdd.onclick = () => { s.extra[blk.ex] = (s.extra[blk.ex] || 0) + 1; Store.save(); renderLogger(api); };
    bLess.disabled = plannedSets(s, blk) <= 1;
    bLess.onclick = () => { const k = plannedSets(s, blk) - 1; if (s.logged.some(x => x.ex === blk.ex && x.set === k)) { ui.toast('That set is logged. Undo it first.'); return; } s.extra[blk.ex] = (s.extra[blk.ex] || 0) - 1; Store.save(); renderLogger(api); };
    bSwap.onclick = () => pickExercise(nx => {
      if (s.blocks.some(x => x.ex === nx)) { ui.toast('That one is already in this session'); return; }
      s.logged.forEach(x => { if (x.ex === blk.ex) x.ex = nx; });
      if (s.extra[blk.ex]) { s.extra[nx] = s.extra[blk.ex]; delete s.extra[blk.ex]; }
      delete s.draft[blk.ex]; blk.ex = nx; blk.start = null; delete blk.cue; Store.save(); renderLogger(api);
    }, 'Swap ' + ex.name + ' for');
    bDel.onclick = () => {
      const go = () => { s.blocks.splice(bi, 1); s.logged = s.logged.filter(x => x.ex !== blk.ex); delete s.draft[blk.ex]; delete s.extra[blk.ex]; Store.save(); renderLogger(api); };
      if (!done) return go();
      ui.ask({ title: 'Remove ' + ex.name + '?', text: 'Its ' + done + ' logged sets go too.', yes: 'Remove', danger: true }).then(ok => ok && go());
    };
    body.appendChild(more);
    return card;
  }
  /* "230 × 6, 6, 6" when the weight holds, "95 × 15, 85 × 15" when it changes */
  function groupSets(sets) {
    const out = []; let cur = null;
    sets.forEach(x => { const w = x.weight == null ? '' : U.wt(x.weight); if (cur && cur.w === w) cur.r.push(x.reps); else { cur = { w, r: [x.reps] }; out.push(cur); } });
    return out.map(g => (g.w ? g.w + ' × ' : '') + g.r.join(', ')).join('; ');
  }

  function logSet(api, s, blk, i, w, r) {
    const ex = Plan.exercise(blk.ex);
    const best = T.best(blk.ex, s.id);
    const thisSession = s.logged.filter(x => x.ex === blk.ex).reduce((m, x) => Math.max(m, U.e1rm(x.weight, x.reps)), 0);
    const e = U.e1rm(w, r);
    const pr = T.hasHistory(blk.ex) && w > 0 && e > best + 0.01 && e > thisSession + 0.01;
    if (pr) s.logged.forEach(x => { if (x.ex === blk.ex) x.pr = false; });
    s.logged.push({ ex: blk.ex, set: i, weight: w, reps: r, at: new Date().toISOString(), pr });
    // the sets still to come follow this one, unless you already changed them by hand
    for (let j = i + 1; j < plannedSets(s, blk); j++) {
      if (s.logged.some(x => x.ex === blk.ex && x.set === j)) continue;
      const dj = draft(s, blk.ex, j, blk); if (!dj.touched) { dj.w = w; dj.r = r; }
    }
    Store.save(); ui.buzz(14);
    // what's next, for the rest timer label
    const nb = currentBlock(s);
    let nextLbl = '', moveTo = null;
    if (nb) {
      const k = setsFor(s, nb.ex).length; const d = draft(s, nb.ex, k, nb);
      nextLbl = (nb.ex === blk.ex ? 'Set ' + (k + 1) : Plan.exercise(nb.ex).name) + (d.w != null ? ' · ' + U.wt(d.w) + ' × ' + d.r : '');
      if (nb.ex !== blk.ex) moveTo = nb.ex;
      if (!catchUp(s)) Opus.rest.start(Plan.restFor(blk.ex), 'Rest · ' + ex.name, nextLbl);
    } else {
      Opus.rest.stop();
      ui.toast(Plan.workout(s.workout) && Plan.workout(s.workout).conditioning ? 'All sets logged. Conditioning next.' : 'All sets logged. Finish when you’re ready.');
    }
    if (pr) ui.toast('New best on ' + ex.name);
    Store.save(); renderLogger(api, moveTo);
  }

  function condCard(api, s, c) {
    const card = h('<div class="ex' + (!currentBlock(s) && !s.cond ? ' cur' : '') + '"><div class="eh"><div class="tx"><div class="tag">Conditioning</div><div class="nm">' + U.esc(c.name) + '</div><div class="tg">' + U.esc(c.detail || '') + '</div></div>' +
      '<span class="ck' + (s.cond ? ' on' : '') + '" role="checkbox" aria-checked="' + !!s.cond + '" tabindex="0">' + ui.CK + '</span></div></div>');
    card.querySelector('.ck').onclick = () => { s.cond = !s.cond; Store.save(); renderLogger(api); };
    if (c.rounds && c.work) {
      const b = h('<div class="eb"><button class="btn ghost" type="button">Start interval timer</button></div>');
      b.querySelector('button').onclick = () => intervals(c, () => { s.cond = true; Store.save(); renderLogger(api); });
      card.appendChild(b);
    }
    return card;
  }

  /* interval timer for conditioning: work / easy phases with a chime at each change */
  function intervals(c, onDone) {
    const phases = []; for (let i = 0; i < c.rounds; i++) { phases.push({ k: 'Hard', s: c.work, r: i + 1 }); if (c.rest) phases.push({ k: 'Easy', s: c.rest, r: i + 1 }); }
    let pi = -1, endAt = 0, iv = null, paused = null;
    const sh = ui.sheet({
      title: c.name, kicker: c.rounds + ' rounds', full: true,
      onClose() { clearInterval(iv); },
      render(api) {
        api.body.style.justifyContent = 'center';
        api.body.appendChild(h('<div class="figure" style="padding-top:10vh"><div class="tag" id="iv-phase">Get ready</div><div class="v num" id="iv-t" style="font-size:96px;margin-top:12px">0:05</div><div class="k" id="iv-r">Round 1 of ' + c.rounds + '</div></div>'));
        const bar = h('<div class="bar" style="margin:24px 8px"><i id="iv-bar" style="width:0%"></i></div>'); api.body.appendChild(bar);
        const btns = h('<div class="btns" style="margin-top:12px"><button class="btn quiet" type="button">Pause</button><button class="btn ghost" type="button">Skip phase</button></div>');
        btns.children[0].onclick = () => { if (paused == null) { paused = endAt - Date.now(); btns.children[0].textContent = 'Resume'; } else { endAt = Date.now() + paused; paused = null; btns.children[0].textContent = 'Pause'; } };
        btns.children[1].onclick = () => { endAt = Date.now(); };
        api.body.appendChild(btns);
      }
    });
    endAt = Date.now() + 5000; ui.wake(true);
    const step = () => {
      if (paused != null) return;
      const left = (endAt - Date.now()) / 1000;
      const ph = phases[pi];
      const tEl = sh.el.querySelector('#iv-t'); if (!tEl) return clearInterval(iv);
      tEl.textContent = U.fmtDuration(Math.ceil(Math.max(0, left)));
      if (ph) sh.el.querySelector('#iv-bar').style.width = (100 * (1 - left / ph.s)).toFixed(1) + '%';
      if (left <= 0) {
        pi++;
        if (pi >= phases.length) { clearInterval(iv); ui.chime(); ui.buzz([80, 60, 80]); sh.el.querySelector('#iv-phase').textContent = 'Done'; sh.el.querySelector('#iv-r').textContent = 'Nice work'; onDone && onDone(); setTimeout(() => sh.close(), 1600); return; }
        const p = phases[pi]; endAt = Date.now() + p.s * 1000; ui.chime(); ui.buzz(40);
        sh.el.querySelector('#iv-phase').textContent = p.k; sh.el.querySelector('#iv-phase').style.color = p.k === 'Hard' ? 'var(--gold-2)' : 'var(--dim)';
        sh.el.querySelector('#iv-r').textContent = 'Round ' + p.r + ' of ' + c.rounds;
      }
    };
    iv = setInterval(step, 200); step();
  }

  const loadName = { 'barbell-lower': 'Barbell, lower body', 'barbell-upper': 'Barbell, upper body', dumbbell: 'Dumbbell', machine: 'Machine', cable: 'Cable', bodyweight: 'Bodyweight' };
  function pickExercise(cb, title) {
    ui.sheet({ title: title || 'Add exercise', full: true, render(api) {
      const t = Plan.p.training = Plan.p.training || {}; t.exercises = t.exercises || {};
      const q = h('<input class="input" type="search" placeholder="Search or type a new exercise" autocomplete="off">');
      const list = h('<div class="card"></div>');
      api.body.appendChild(q); api.body.appendChild(list);
      let shown = [], picked = false;
      const pick = id => { if (picked) return; picked = true; try { q.blur(); } catch (e) {} api.close(); cb(id); };
      const draw = () => {
        const term = q.value.trim().toLowerCase();
        const all = Object.keys(t.exercises).map(id => Plan.exercise(id)).filter(e => e && e.name).filter(e => !term || e.name.toLowerCase().includes(term)).sort((a, b) => a.name.localeCompare(b.name));
        list.innerHTML = '';
        if (term && !all.some(e => e.name.toLowerCase() === term)) {
          const r = h('<button class="row tap" type="button"><span class="tx"><b>+ New: ' + U.esc(q.value.trim()) + '</b><small>Pick its type next</small></span></button>');
          r.onclick = () => newExercise(q.value.trim());
          list.appendChild(r);
        }
        all.forEach(e => { const r = h('<button class="row tap" type="button"><span class="tx"><b>' + U.esc(e.name) + '</b><small>' + (typeName[e.type] || '') + ' · ' + (loadName[e.load] || '') + '</small></span>' + ui.icon('plus', 'chev ico') + '</button>'); r.onclick = () => pick(e.id); list.appendChild(r); });
        shown = all;
        if (!list.children.length) list.appendChild(h('<p class="empty">Type a name to add a new exercise.</p>'));
      };
      const newExercise = name => {
        api.body.innerHTML = '';
        let type = 'accessory', load = 'dumbbell';
        api.body.appendChild(h('<div class="serif-h">' + U.esc(name) + '</div>'));
        const tc = h('<div class="field"><label>Type (sets the rest timer)</label><div class="chips">' + ['compound', 'accessory', 'isolation'].map(k => '<button class="chip" data-v="' + k + '" type="button">' + typeName[k] + '</button>').join('') + '</div></div>');
        const lc = h('<div class="field"><label>Equipment (sets the weight jumps)</label><div class="chips">' + Object.keys(loadName).map(k => '<button class="chip" data-v="' + k + '" type="button">' + loadName[k] + '</button>').join('') + '</div></div>');
        const sync = () => { tc.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.v === type)); lc.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.v === load)); };
        tc.querySelectorAll('.chip').forEach(c => c.onclick = () => { type = c.dataset.v; sync(); });
        lc.querySelectorAll('.chip').forEach(c => c.onclick = () => { load = c.dataset.v; sync(); });
        sync(); api.body.appendChild(tc); api.body.appendChild(lc);
        const sv = h('<button class="btn block" type="button">Add it</button>');
        sv.onclick = () => {
          let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || U.uid();
          while (t.exercises[id]) id += '-2';
          t.exercises[id] = { name, type, load }; Plan.p.updated = U.key(); Store.save(true);
          pick(id);
        };
        api.body.appendChild(sv);
      };
      q.oninput = draw; draw();
      // Return on the keyboard: the exact match, the only match, or start a new one
      q.onkeydown = ev => {
        if (ev.key !== 'Enter') return; ev.preventDefault();
        const term = q.value.trim(); if (!term) return;
        const exact = shown.find(e => e.name.toLowerCase() === term.toLowerCase());
        if (exact) pick(exact.id); else if (shown.length === 1) pick(shown[0].id); else newExercise(term);
      };
      setTimeout(() => { try { q.focus(); } catch (e) {} }, 350);
    } });
  }

  function finish(api) {
    const s = A();
    if (!s.logged.length) return ui.ask({ title: 'No sets logged', text: 'Close this session without saving it?', yes: 'Close it' }).then(ok => { if (ok) { Store.data.active = null; Store.save(); Opus.rest.stop(); api.close(); } });
    const rec = { id: s.id, workout: s.workout, name: s.name, date: s.date, started: s.started, finished: new Date().toISOString(),
      sets: s.logged.map(x => ({ ex: x.ex, weight: x.weight, reps: x.reps, at: x.at, pr: !!x.pr })), conditioning: !!s.cond };
    if ((s.note || '').trim()) rec.note = s.note.trim();
    const wo = Plan.workout(s.workout) || {};
    if ((wo.warmup || []).length) rec.warmup = s.warm.slice().sort((a, b) => a - b).map(i => wo.warmup[i]).filter(Boolean);
    if ((wo.cooldown || []).length) rec.cooldown = s.cool.slice().sort((a, b) => a - b).map(i => wo.cooldown[i]).filter(Boolean);
    if (catchUp(s)) { const noon = U.parseKey(s.date); noon.setHours(12); rec.started = rec.finished = noon.toISOString(); rec.catchUp = true; } // logged afterwards: no real duration
    Store.data.workouts.push(rec); Store.data.active = null; Opus.rest.stop();
    const wid = Plan.kindId('workout'); if (wid && s.date === U.key()) Plan.setChecked(new Date(), wid, true);
    Store.save(true); api.close(true); ui.wake(false);
    summary(rec);
  }
  function summary(rec) {
    ui.sheet({ title: rec.name, kicker: 'Session saved · ' + U.fmtDateShort(rec.date), onClose: () => Opus.refresh(), render(api) {
      const mins = Math.round((new Date(rec.finished) - new Date(rec.started)) / 60000);
      const vol = U.sum(rec.sets.map(x => (x.weight || 0) * x.reps));
      api.body.appendChild(h('<div class="stats"><div class="stat"><span class="v">' + (mins || '—') + '</span><span class="k">Minutes</span></div><div class="stat"><span class="v">' + rec.sets.length + '</span><span class="k">Sets</span></div><div class="stat"><span class="v">' + (vol >= 10000 ? U.num(vol / 1000, 1) + 'k' : Math.round(vol)) + '</span><span class="k">lb moved</span></div></div>'));
      const prs = rec.sets.filter(x => x.pr);
      if (prs.length) {
        const c = h('<div class="card"></div>');
        prs.forEach(x => c.appendChild(h('<div class="row"><span class="best">' + ui.icon('laurel', '') + '</span><span class="tx"><b>' + U.esc(Plan.exercise(x.ex).name) + '</b><small class="num">' + U.wt(x.weight) + ' × ' + x.reps + ' · est. max ' + Math.round(U.e1rm(x.weight, x.reps)) + '</small></span><span class="best">New best</span></div>')));
        api.body.appendChild(c);
      }
      api.body.appendChild(sessionDetail(rec));
      api.body.appendChild(savedLine());
      const nx = Plan.nextWorkoutAfter(new Date());
      if (nx) api.body.appendChild(h('<p class="note">Next: ' + U.esc(nx.workout.name) + ' on ' + U.DAY_NAMES[nx.date.getDay()] + '. Your next targets are ready in Body.</p>'));
    } });
  }
  /* where the session is: saved on the phone, on its way to Grok, or with Grok. Opus syncs a few seconds after a save. */
  function savedLine() {
    const el = h('<div class="saved-line" role="status"><i></i><span></span></div>');
    const S = Opus.sync, on = S && S.cfg() && S.cfg().token;
    const draw = () => {
      let t, tone = '';
      if (!on) { t = 'Saved on this phone. Turn on Sync in Settings so Grok sees your workouts.'; tone = 'warn'; }
      else {
        const st = S.status();
        if (st === 'syncing' || st === 'pending') { t = 'Saved · sending to Grok…'; tone = 'busy'; }
        else if (st === 'offline') { t = 'Saved on this phone · goes to Grok when you’re back online'; tone = 'warn'; }
        else if (st === 'blocked' || st === 'problem') { t = 'Saved on this phone · sync needs a look in Settings'; tone = 'warn'; }
        else if (S.dirty()) { t = 'Saved · sending to Grok…'; tone = 'busy'; }
        else t = 'Saved for Grok. Nothing to copy.';
      }
      el.className = 'saved-line ' + tone; el.querySelector('span').textContent = t;
    };
    draw();
    if (on) { S.on(() => { if (el.isConnected) draw(); }); setTimeout(() => { if (el.isConnected) draw(); }, 6500); }
    return el;
  }
  /* plain-text log to paste to Claude or Grok */
  function logText(rec) {
    const d = U.parseKey(rec.date), lines = ['## ' + U.DAY_NAMES[d.getDay()].slice(0, 3) + ' ' + rec.date + ' · ' + rec.name + (rec.catchUp ? ' (logged afterwards)' : '')];
    const by = {}; rec.sets.forEach(x => (by[x.ex] = by[x.ex] || []).push(x));
    Object.entries(by).forEach(([ex, ss]) => lines.push('- ' + Plan.exercise(ex).name + ': ' + ss.map(x => (x.weight != null ? U.wt(x.weight) + 'x' : '') + x.reps).join(', ') + (ss.some(x => x.pr) ? ' (new best)' : '')));
    const wo = Plan.workout(rec.workout) || {};
    (wo.blocks || []).forEach(b => { if (!by[b.ex]) lines.push('- ' + Plan.exercise(b.ex).name + ': skipped'); });
    if (rec.warmup) lines.push('- Warm-up: ' + (rec.warmup.length ? rec.warmup.join('; ') : 'skipped'));
    if (wo.conditioning) lines.push('- ' + wo.conditioning.name + ': ' + (rec.conditioning ? 'done' : 'skipped'));
    if (rec.cooldown) lines.push('- Cool-down: ' + (rec.cooldown.length ? rec.cooldown.join('; ') : 'skipped'));
    if (!rec.catchUp) { const mins = Math.round((new Date(rec.finished) - new Date(rec.started)) / 60000); if (mins) lines.push('- Time: ' + mins + ' min'); }
    if (rec.note) lines.push('- Notes: ' + rec.note.replace(/\n+/g, ' '));
    return lines.join('\n');
  }
  function sessionDetail(rec) {
    const by = {}; rec.sets.forEach(x => (by[x.ex] = by[x.ex] || []).push(x));
    const c = h('<div class="card"></div>');
    Object.entries(by).forEach(([ex, ss]) => c.appendChild(h('<div class="row"><span class="tx"><b>' + U.esc(Plan.exercise(ex).name) + '</b><small class="num">' + ss.map(x => (x.weight != null ? U.wt(x.weight) + '×' : '') + x.reps).join('  ') + '</small></span></div>')));
    if (rec.note) c.appendChild(h('<div class="row"><span class="tx"><small style="font-size:13.5px;color:var(--ink-2)">' + U.esc(rec.note) + '</small></span></div>'));
    return c;
  }
  function historySheet(rec) {
    ui.sheet({ title: rec.name, kicker: U.DAY_NAMES[U.parseKey(rec.date).getDay()] + ' · ' + U.fmtDateShort(rec.date), render(api) {
      api.body.appendChild(sessionDetail(rec));
      const del = h('<button class="btn danger" type="button">Delete this session</button>');
      del.onclick = () => ui.ask({ title: 'Delete session?', text: 'This removes it from your history and trends.', yes: 'Delete', danger: true }).then(ok => { if (ok) { Store.data.workouts = Store.data.workouts.filter(w => w.id !== rec.id); const dl = Store.data.deleted = Store.data.deleted || {}; (dl.workouts = dl.workouts || {})[rec.id] = new Date().toISOString(); Store.save(); api.close(); Opus.refresh(); } });
      api.body.appendChild(del);
    } });
  }

  /* ---------- the tab ---------- */
  function render(v) {
    const d = new Date(), t = Plan.p.training || {};
    v.appendChild(h('<div class="top"><div><div class="eyebrow">Week of ' + U.fmtDateShort(U.weekStart(d)) + '</div><div class="title">Body</div></div></div>'));
    let n = 0; const R = () => U.roman(++n);
    { const wc = Opus.whoop && Opus.whoop.todayCard(d); if (wc) v.appendChild(wc); }

    if (A()) {
      const s = A();
      const c = h('<div class="next"><div class="body"><div class="k">In progress</div><div class="h">' + U.esc(s.name) + '</div><div class="s">' + s.logged.length + ' sets logged · started ' + new Date(s.started).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</div></div><button class="btn" type="button">Resume</button></div>');
      c.querySelector('.btn').onclick = () => openLogger();
      v.appendChild(c);
    } else {
      const w = Plan.workoutFor(d), doneToday = Store.data.workouts.some(x => x.date === U.key(d));
      if (w && !doneToday) {
        const est = (w.blocks || []).reduce((m, b) => m + b.sets * (Plan.restFor(b.ex) + 45), 0) / 60 + ((w.conditioning || {}).minutes || 0) + 8;
        const wl = Opus.whoop && Opus.whoop.trainLine(d);
        const c = h('<div class="next" style="flex-direction:column;align-items:stretch"><div class="body"><div class="k">Today · ' + U.esc(w.name) + '</div><div class="h">' + U.esc(w.focus || w.name) + '</div><div class="s">' + U.esc(Plan.workoutSummary(w)) + ' · about ' + Math.round(est / 5) * 5 + ' min</div></div><button class="btn block" type="button">Start workout</button><button class="link" type="button" style="align-self:center">Log a different session</button></div>');
        c.querySelector('.btn').onclick = () => start(w.id);
        c.querySelector('.link').onclick = () => chooseWorkout();
        if (wl) c.insertBefore(wl, c.querySelector('.btn'));
        v.appendChild(c);
      } else {
        const nx = Plan.nextWorkoutAfter(d);
        const c = h('<div class="next" style="flex-direction:column;align-items:stretch"><div class="body"><div class="k">' + (doneToday ? 'Done today' : 'Rest day') + '</div><div class="h">' + (doneToday ? 'Session logged' : 'Recover well') + '</div><div class="s">' + (nx ? 'Next: ' + U.esc(nx.workout.name) + ' on ' + U.DAY_NAMES[nx.date.getDay()] : 'No sessions scheduled') + '</div></div><button class="btn block" type="button">Log a workout</button></div>');
        c.querySelector('.btn').onclick = () => chooseWorkout();
        v.appendChild(c);
      }
    }

    // week strip
    const ws = U.weekStart(d); const strip = h('<div class="week"></div>');
    for (let i = 0; i < 7; i++) {
      const dd = U.addDays(ws, i), w = Plan.workoutFor(dd), done = Store.data.workouts.some(x => x.date === U.key(dd));
      strip.appendChild(h('<div class="wd' + (U.key(dd) === U.key(d) ? ' today' : '') + (done ? ' done' : '') + (!w ? ' rest' : '') + '"><span class="d">' + U.DAYS[i].toUpperCase().slice(0, 2) + '</span><span class="w">' + (w ? U.esc(w.name.replace(/^(Lower|Upper) /, (m, a) => a[0] + ' ')) : '·') + '</span><span class="dot"></span></div>'));
    }
    v.appendChild(strip);

    // recovery and sleep, 14 days (WHOOP)
    const W = Opus.whoop && Opus.whoop.data();
    if (W) {
      const ks = []; for (let i = 13; i >= 0; i--) ks.push(U.key(U.addDays(d, -i)));
      const xs = ks.map(k => W.days[k] || {});
      const spark = vals => {
        const pts = vals.map((v, i) => [i, v]).filter(p => p[1] != null); if (pts.length < 2) return '<span class="bd-spark"></span>';
        const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1])), sp = hi - lo || 1, W2 = 132, H = 34;
        const X = i => (i / (vals.length - 1) * (W2 - 6) + 3).toFixed(1), Y = v => (H - 4 - (v - lo) / sp * (H - 8)).toFixed(1);
        const path = pts.map((p, j) => (j ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' '), last = pts[pts.length - 1];
        return '<svg class="bd-spark" viewBox="0 0 ' + W2 + ' ' + H + '" aria-hidden="true"><path d="' + path + '"/><circle cx="' + X(last[0]) + '" cy="' + Y(last[1]) + '" r="3"/></svg>';
      };
      const avg = a => { const b = a.filter(v => v != null); return b.length ? b.reduce((m, v) => m + v, 0) / b.length : null; };
      const hrv = xs.map(x => x.recovery && x.recovery.scored ? x.recovery.hrv : null), rhr = xs.map(x => x.recovery && x.recovery.scored ? x.recovery.rhr : null), strain = xs.map(x => x.day && x.day.strain != null ? x.day.strain : null);
      const lastOf = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };
      const trend = (a, dec) => { const f = avg(a.slice(0, 7)), l = avg(a.slice(7)); if (f == null || l == null) return ''; const dlt = l - f, r = dec ? Math.round(Math.abs(dlt) * 10) / 10 : Math.round(Math.abs(dlt)); return r < (dec ? .5 : 1) ? ' · steady' : ' · ' + (dlt > 0 ? 'up ' : 'down ') + r + ' vs last week'; };
      const sec = h('<div class="sec"><div class="sh"><span class="r">' + R() + '</span><span class="t">Recovery & sleep</span><span class="c">14 days</span></div><div class="card"></div></div>');
      const c = sec.querySelector('.card');
      const row = (name, a, unit, dec) => { const m = avg(a), l = lastOf(a); return h('<div class="row bd-row"><span class="tx"><b>' + name + '</b><small>' + (m == null ? 'Not in yet' : 'avg ' + (dec ? Math.round(m * 10) / 10 : Math.round(m)) + trend(a, dec)) + '</small></span>' + spark(a) + '<span class="bd-v num">' + (l == null ? '—' : l) + '<small>' + unit + '</small></span></div>'); };
      c.appendChild(row('HRV', hrv, ' ms'));
      c.appendChild(row('Resting HR', rhr, ' bpm'));
      c.appendChild(row('Day strain', strain, '', true));
      // sleep against need: a bar a night, from 4 hours up
      const sl = xs.map(x => x.sleep && x.sleep.asleep != null ? x.sleep : null), got = sl.filter(Boolean);
      if (got.length) {
        const FL = 240, mx = Math.max(FL + 60, ...got.map(s => Math.max(s.asleep || 0, s.need || 0))), sc = m => Math.max(4, Math.min(100, (m - FL) / (mx - FL) * 100)).toFixed(0);
        const bars = sl.map(s2 => !s2 ? '<span class="bd-b none"></span>' : '<span class="bd-b' + (s2.need && s2.asleep >= s2.need ? ' ok' : '') + '" title="' + Opus.whoop.hm(s2.asleep) + '"><i style="height:' + sc(s2.asleep) + '%"></i>' + (s2.need ? '<em style="bottom:' + sc(s2.need) + '%"></em>' : '') + '</span>').join('');
        const withNeed = got.filter(s2 => s2.need), met = withNeed.filter(s2 => s2.asleep >= s2.need).length, short = avg(withNeed.map(s2 => s2.need - s2.asleep));
        c.appendChild(h('<div class="row bd-sleep"><span class="tx"><b>Sleep vs need</b><small>' + (withNeed.length ? met + ' of ' + withNeed.length + ' nights met · ' + (short > 0 ? 'short ' + Math.round(short) + ' min a night' : 'on target') : got.length + ' nights') + '</small></span><div class="bd-bars">' + bars + '</div></div>'));
      }
      sec.appendChild(h('<p class="small" style="padding:0 4px">Each bar is a night asleep, from 4 hours up; the line is what WHOOP said you needed. Tap the recovery card for the day by day.</p>'));
      v.appendChild(sec);
    }

    // breathing: blood oxygen, breaths a minute and the nose strips tick
    if (Opus.breath) Opus.breath.section(v, R(), d);

    // weigh-ins (moved here from Food)
    {
      const wts = (Store.data.weights || []).filter(w => w && w.date && w.lb != null).slice().sort((a, b) => a.date.localeCompare(b.date));
      const g = ((Plan.p.food || {}).goal) || {};
      const sec = h('<div class="sec"><div class="sh"><span class="r">' + R() + '</span><span class="t">Weigh-ins</span><span class="c">' + (g.target ? 'goal ' + g.target + ' lb' : wts.length + ' logged') + '</span></div><div class="card pad bd-wt"></div></div>');
      const c = sec.querySelector('.card');
      if (wts.length) {
        const last = wts[wts.length - 1], first = wts[0], ch = Math.round((last.lb - first.lb) * 10) / 10;
        const days = Math.round((U.parseKey(last.date) - U.parseKey(first.date)) / 864e5);
        c.appendChild(h('<div class="bd-wh"><div><span class="bd-big num">' + U.wt(last.lb) + '</span><span class="small"> lb · ' + U.fmtDateShort(last.date) + '</span></div>' + (wts.length > 1 && days > 0 ? '<span class="tag">' + (ch <= 0 ? '−' : '+') + Math.abs(ch) + ' lb in ' + days + ' days</span>' : '') + '</div>'));
        const recent = wts.filter(w => U.daysBetween(U.parseKey(w.date), d) < 7), avg7 = recent.length ? U.avg(recent.map(w => w.lb)) : null, now = avg7 || last.lb;
        if (g.target) c.appendChild(h('<div class="stats"><div class="stat"><span class="v">' + (avg7 ? U.wt(avg7) : '—') + '</span><span class="k">7-day avg</span></div><div class="stat"><span class="v">' + U.wt(now - g.target) + '</span><span class="k">To go</span></div><div class="stat"><span class="v">' + g.target + '</span><span class="k">Goal</span></div></div>'));
        if (g.start && g.target && g.start !== g.target) {
          const pct = U.clamp((g.start - now) / (g.start - g.target), 0, 1);
          c.appendChild(h('<div style="display:flex;flex-direction:column;gap:6px"><div class="bar"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></div><div class="small num" style="display:flex;justify-content:space-between"><span>' + g.start + ' start</span><span>' + Math.round(pct * 100) + '%</span><span>' + g.target + ' goal</span></div></div>'));
        }
        if (wts.length > 1) c.appendChild(ui.chart(wts.slice(-60).map(w => ({ date: w.date, v: w.lb })), { h: 100, target: g.target, fmt: x => U.wt(x) }));
      } else c.appendChild(h('<p class="small" style="margin:0">Weigh in in the morning, before food, and the trend builds here.</p>'));
      const b = h('<button class="btn ghost" type="button">Weigh in</button>'); b.onclick = () => Opus.food && Opus.food.weighIn(); c.appendChild(b);
      v.appendChild(sec);
    }

    // hair, when the plan has a hair routine
    if (Opus.hair) Opus.hair.section(v, R, d);

    // next targets: progressive overload
    const target = Plan.workoutFor(d) || (Plan.nextWorkoutAfter(d) || {}).workout;
    if (target) {
      const sec = h('<div class="sec"><div class="sh"><span class="r">' + R() + '</span><span class="t">Next targets</span><span class="c">' + U.esc(target.name) + '</span></div><div class="card"></div></div>');
      (target.blocks || []).forEach(b => {
        const sg = T.suggest(b), last = T.lastFor(b.ex), ex = Plan.exercise(b.ex);
        const lastTxt = last ? U.wt(Math.max(...last.sets.map(x => x.weight || 0))) + ' × ' + last.sets.map(x => x.reps).join(',') : 'No history';
        const nextTxt = sg.weight != null ? U.wt(sg.weight) + ' × ' + sg.reps : (sg.kind === 'reps' ? '+1 rep' : 'Find it');
        sec.querySelector('.card').appendChild(h('<div class="row" style="align-items:flex-start"><span class="tx"><b>' + U.esc(ex.name) + (sg.kind === 'up' ? ' <span class="tag" style="margin-left:6px">Move up</span>' : '') + '</b><small>' + U.esc(sg.reason) + '</small></span>' +
          '<span style="text-align:right;display:flex;flex-direction:column;gap:2px"><b class="num" style="color:var(--gold-2);font-weight:600">' + nextTxt + '</b><span class="small num">' + lastTxt + '</span></span></div>'));
      });
      sec.appendChild(h('<p class="small" style="padding:0 4px">Double progression: build reps to the top of the range on every set, then add weight. Bigger jumps for squat and RDL, smaller for presses, the next dumbbell for DB work.</p>'));
      v.appendChild(sec);
    }

    // plate math
    const pm = h('<div class="sec"><div class="sh"><span class="r">' + R() + '</span><span class="t">Plate math</span><span class="c">' + (t.bar || 45) + ' lb bar</span></div><div class="card pad" style="display:flex;flex-direction:column;gap:12px"></div></div>');
    const sq = (target && (target.blocks || []).find(b => T.isBarbell(b.ex))) || null;
    const startW = sq ? (T.suggest(sq).weight || 135) : 135;
    const out = h('<div></div>');
    const st = ui.stepper({ label: 'Barbell total', value: startW, unit: 'lb', step: (v, dir) => Math.max(t.bar || 45, (v || 0) + 5 * dir), onChange: v => { out.innerHTML = plateView(v); } });
    st.input.id = 'plate-total';
    pm.querySelector('.card').appendChild(st.el); pm.querySelector('.card').appendChild(out); out.innerHTML = plateView(startW);
    v.appendChild(pm);

    // history
    const hist = Store.data.workouts.slice().sort((a, b) => b.finished.localeCompare(a.finished)).slice(0, 8);
    const hs = h('<div class="sec"><div class="sh"><span class="r">' + R() + '</span><span class="t">Recent sessions</span><span class="c">' + Store.data.workouts.length + ' total</span></div><div class="card"></div></div>');
    if (!hist.length) hs.querySelector('.card').appendChild(h('<p class="empty">Your sessions show up here once you finish one.</p>'));
    hist.forEach(w => {
      const mins = Math.round((new Date(w.finished) - new Date(w.started)) / 60000), prs = w.sets.filter(x => x.pr).length;
      const r = h('<div class="row tap"><span class="tx"><b>' + U.esc(w.name) + '</b><small class="num">' + U.DAY_NAMES[U.parseKey(w.date).getDay()].slice(0, 3) + ' ' + U.fmtDateShort(w.date) + ' · ' + (mins ? mins + ' min · ' : '') + w.sets.length + (w.sets.length === 1 ? ' set' : ' sets') + '</small></span>' + (prs ? '<span class="best">' + ui.icon('laurel', '') + prs + '</span>' : '') + ui.icon('chev', 'chev ico') + '</div>');
      { // the WHOOP workout that matches: started within 90 minutes of this one (a session logged afterwards: the day's only one)
        const wd = Opus.whoop && Opus.whoop.day(w.date), all = (wd && wd.workouts) || [];
        const wo = w.catchUp ? (all.length === 1 ? all[0] : null) : all.find(o => o.start && w.started && Math.abs(Date.parse(o.start) - Date.parse(w.started)) < 90 * 60e3);
        const bits = wo ? [wo.strain != null && 'strain ' + wo.strain, wo.avgHr != null && wo.avgHr + (wo.maxHr != null ? '/' + wo.maxHr : '') + ' bpm', wo.kcal != null && wo.kcal.toLocaleString() + ' cal'].filter(Boolean) : [];
        if (bits.length) r.querySelector('.tx').appendChild(h('<small class="num bd-wo"><i></i>WHOOP ' + bits.join(' · ') + '</small>'));
      }
      r.onclick = () => historySheet(w);
      hs.querySelector('.card').appendChild(r);
    });
    v.appendChild(hs);

    // program overview
    const pg = h('<details class="fold sec"><summary class="sh"><span class="r">' + R() + '</span><span class="t">The program</span><span class="c">' + Object.keys(t.workouts || {}).length + ' sessions</span></summary><div class="card" style="margin-top:6px"></div></details>');
    const sched = t.schedule || {};
    Object.entries(t.workouts || {}).forEach(([id, w]) => {
      const days = Object.keys(sched).filter(k => sched[k] === id).map(k => U.DAY_NAMES[U.DAYS.indexOf(k)].slice(0, 3)).join(', ');
      pg.querySelector('.card').appendChild(h('<div class="row" style="align-items:flex-start"><span class="tx"><b>' + U.esc(w.name) + ' · ' + U.esc(w.focus || '') + '</b><small>' + (w.blocks || []).map(b => U.esc(Plan.exercise(b.ex).name) + ' ' + b.sets + '×' + repStr(b.reps)).join(' · ') + (w.conditioning ? ' · then ' + U.esc(w.conditioning.name.toLowerCase()) : '') + '</small></span><span class="tm">' + days + '</span></div>'));
    });
    pg.appendChild(h('<p class="small" style="padding:6px 4px 0">' + U.esc(t.notes || '') + ' Change it in your plan file (Settings › Plan).</p>'));
    v.appendChild(pg);
  }

  function chooseWorkout() {
    ui.sheet({ title: 'Log a workout', render(api) {
      const d = new Date(); let day = U.key(d);
      const chips = h('<div class="field"><label>When</label><div class="chips"><button class="chip" data-k="' + U.key(d) + '" type="button">Today</button><button class="chip" data-k="' + U.key(U.addDays(d, -1)) + '" type="button">Yesterday</button></div></div>');
      const hint = h('<p class="small"></p>');
      const sync = () => { chips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.k === day)); hint.textContent = day === U.key(d) ? 'Log each set as you finish it. The rest timer starts itself.' : 'Catching up on yesterday: enter what you did. No rest timer.'; };
      chips.querySelectorAll('.chip').forEach(c => c.onclick = () => { day = c.dataset.k; sync(); });
      api.body.appendChild(chips); api.body.appendChild(hint); sync();
      const c = h('<div class="card"></div>');
      const sched = (Plan.p.training || {}).schedule || {};
      Object.keys((Plan.p.training || {}).workouts || {}).forEach(id => {
        const w = Plan.workout(id);
        const days = Object.keys(sched).filter(k => sched[k] === id).map(k => U.DAY_NAMES[U.DAYS.indexOf(k)].slice(0, 3)).join(', ');
        const r = h('<div class="row tap"><span class="tx"><b>' + U.esc(w.name) + (w.focus ? ': ' + U.esc(w.focus.toLowerCase()) : '') + '</b><small>' + (w.blocks || []).length + ' exercises' + (days ? ' · ' + days : '') + '</small></span>' + ui.icon('chev', 'chev ico') + '</div>');
        r.onclick = () => { api.close(true); start(id, day); };
        c.appendChild(r);
      });
      const fr = h('<div class="row tap"><span class="tx"><b>Free session</b><small>Start empty and add exercises as you go</small></span>' + ui.icon('chev', 'chev ico') + '</div>');
      fr.onclick = () => { api.close(true); start('free', day); };
      c.appendChild(fr);
      api.body.appendChild(c);
    } });
  }

  Opus.train = { start, openLogger, plateView, logText, savedLine };
  Opus.onBoot(() => { if (A()) ui.toast(A().name + ' is still open', { label: 'Resume', run: () => openLogger() }); });
  Opus.tab({ id: 'train', title: 'Body', icon: 'train', render });
})();
