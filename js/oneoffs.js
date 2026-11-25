/* One-offs: anything you do once, laid out step by step so you don't have to go looking for it.
   A recipe for one night, a move, a trip, a repair. Each one-off lives in the plan (plan.oneoffs) as plain JSON,
   so it can be written by hand here, or by Claude or Grok (see GUIDE.md):
     { id, title, note?, since?, done?,
       lists: [ { id, title, items: [text] } ],                       e.g. what to buy, what to pack
       parts: [ { id, label, date?, time?, note?,                     a dated part shows on Today that day
                  steps: [ { id, text, when?, time?, amount?, sub?: [text], note?, timer? (minutes) } ] } ],
       notes: [text] }
   Ticks are kept with the day's other ticks, under the part's date (or the one-off's own start day if undated). */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const LOOKBACK = 3; // an unfinished part stays on Today this many days after its date

  const all = () => (Plan.p && Array.isArray(Plan.p.oneoffs) ? Plan.p.oneoffs : []);
  const ensure = () => { if (!Array.isArray(Plan.p.oneoffs)) Plan.p.oneoffs = []; return Plan.p.oneoffs; };
  const find = id => all().find(o => o.id === id);
  const parts = o => (Array.isArray(o.parts) ? o.parts : []);
  const lists = o => (Array.isArray(o.lists) ? o.lists : []);
  const steps = p => (Array.isArray(p.steps) ? p.steps : []);

  /* the day a tick is kept under */
  function home(o) {
    if (o.since) return o.since;
    const ds = parts(o).map(p => p.date).filter(Boolean).sort();
    return ds[0] || '2026-01-01';
  }
  const dayOf = (o, p) => (p && p.date) || home(o);
  const stepId = (o, p, s) => 'oneoff:' + o.id + ':' + p.id + ':' + s.id;
  const itemId = (o, l, i) => 'oneoff:' + o.id + ':' + l.id + ':' + i;
  const on = (key, id) => (Store.data.checks[key] || []).includes(id);
  const stepDone = (o, p, s) => on(dayOf(o, p), stepId(o, p, s));
  const setStep = (o, p, s, v) => Plan.setChecked(U.parseKey(dayOf(o, p)), stepId(o, p, s), v);
  const itemDone = (o, l, i) => on(home(o), itemId(o, l, i));
  const setItem = (o, l, i, v) => Plan.setChecked(U.parseKey(home(o)), itemId(o, l, i), v);
  const partLeft = (o, p) => steps(p).filter(s => !stepDone(o, p, s));
  const finished = o => !!o.done || parts(o).every(p => !partLeft(o, p).length);

  /* the parts that belong on a given day: that day's, recent unfinished ones, and undated unfinished ones */
  function partsFor(o, d) {
    if (o.done) return [];
    const k = U.key(d);
    return parts(o).filter(p => {
      if (!steps(p).length) return false;
      if (!p.date) return partLeft(o, p).length > 0 && (!o.since || o.since <= k);
      if (p.date === k) return true;
      return p.date < k && U.daysBetween(U.parseKey(p.date), d) <= LOOKBACK && partLeft(o, p).length > 0;
    });
  }
  function nextPart(o, d) { // the next dated part after today, for a short "next" line
    const k = U.key(d);
    return parts(o).filter(p => p.date && p.date > k && steps(p).length).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }
  const whenDay = k => { const t = U.parseKey(k), today = new Date(); const n = U.daysBetween(today, t); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : U.DAY_NAMES[t.getDay()].slice(0, 3) + ', ' + U.fmtDateShort(k); };
  const stepLine = s => (s.amount ? s.amount + ' · ' : '') + s.text;

  /* ---------- the timer: one at a time, kept so it survives a reload ---------- */
  const tm = () => (Store.data && Store.data.ootimer) || null;
  let tick = null;
  function startTimer(o, s) {
    Store.data.ootimer = { oid: o.id, label: s.text.length > 60 ? s.text.slice(0, 57) + '…' : s.text, mins: s.timer, endAt: Date.now() + s.timer * 60000 };
    Store.save(); ui.buzz(10); ui.toast('Timer set for ' + s.timer + ' min'); loop(); paint();
  }
  function stopTimer() { delete Store.data.ootimer; Store.save(); paint(); }
  const left = () => { const t = tm(); return t ? Math.max(0, t.endAt - Date.now()) : 0; };
  const clock = ms => { const s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + ':' + U.pad(m % 60) + ':' + U.pad(s % 60) : m + ':' + U.pad(s % 60); };
  function paint() {
    const t = tm();
    document.querySelectorAll('[data-oot]').forEach(el => {
      if (!t) { el.hidden = true; return; }
      el.hidden = false;
      const c = el.querySelector('.oot-c'); if (c) c.textContent = clock(left());
      const l = el.querySelector('.oot-l'); if (l) l.textContent = t.label;
    });
  }
  function loop() {
    if (tick) return;
    tick = setInterval(() => {
      const t = tm();
      if (!t) { clearInterval(tick); tick = null; paint(); return; }
      if (Date.now() >= t.endAt) {
        delete Store.data.ootimer; Store.save();
        ui.chime(); ui.buzz([200, 100, 200, 100, 400]); ui.toast('Time’s up: ' + t.label);
      }
      paint();
    }, 1000);
  }
  function timerBar() {
    const el = h('<div class="oot" data-oot hidden><span class="oot-k">Timer</span><span class="oot-l"></span><span class="oot-c num"></span><button class="oot-x" type="button" aria-label="Stop the timer">' + ui.icon('close') + '</button></div>');
    el.querySelector('.oot-x').onclick = e => { e.stopPropagation(); stopTimer(); };
    return el;
  }

  /* ---------- Today ---------- */
  function todayCard(v, d) {
    for (const o of all()) {
      const k = U.key(d), all0 = partsFor(o, d);
      // today's parts lead; last night's unticked steps wait in the sheet unless nothing else is on today
      const mine = all0.filter(p => !p.date || p.date === k), past = all0.filter(p => p.date && p.date < k);
      const ps = mine.some(p => partLeft(o, p).length) ? mine : past;
      if (!ps.length) continue;
      const todo = [], total = [];
      ps.forEach(p => { let last = p.time || null; steps(p).forEach(s => { last = s.time || last; total.push(s); if (!stepDone(o, p, s)) todo.push([p, s, last]); }); });
      if (!todo.length) continue; // all done: it drops away
      // two parts on one day (a roast and its gravy): go by the clock when every step has one
      if (ps.length > 1 && todo.every(x => x[2])) todo.sort((a, b) => (a[0].date || '').localeCompare(b[0].date || '') || a[2].localeCompare(b[2]));
      const [np, ns] = todo[0];
      const late = np.date && np.date < U.key(d);
      const el = h('<div class="oo-card tap" role="button" tabindex="0"><div class="oo-top"><span class="oo-k">One-off · ' + U.esc(np.label || 'Steps') + (late ? ' · <span class="late">' + U.esc(whenDay(np.date)) + '</span>' : '') + '</span><span class="oo-n num">' + (total.length - todo.length) + ' of ' + total.length + '</span></div>' +
        '<div class="oo-t">' + U.esc(o.title) + '</div>' +
        '<div class="oo-step"><button class="ck" type="button" aria-label="Done">' + ui.CK + '</button><span class="tx"><b>' + U.esc(stepLine(ns)) + '</b>' + (ns.when ? '<small>' + U.esc(ns.when) + '</small>' : '') + '</span></div>' +
        '<div class="oo-bar"><i style="width:' + Math.round(100 * (total.length - todo.length) / total.length) + '%"></i></div></div>');
      el.appendChild(timerBar());
      el.onclick = () => open(o.id);
      el.onkeydown = e => { if (e.key === 'Enter') open(o.id); };
      el.querySelector('.ck').onclick = e => {
        e.stopPropagation();
        el.querySelector('.oo-step').classList.add('done');
        setStep(o, np, ns, true); ui.buzz(10);
        setTimeout(() => Opus.refresh(), 420);
      };
      v.appendChild(el);
    }
    paint(); if (tm()) loop();
  }

  /* ---------- the one-off itself ---------- */
  function open(id) {
    const o0 = find(id); if (!o0) return;
    let first = true;
    ui.sheet({ title: o0.title, kicker: 'One-off', onClose: () => Opus.refresh(), render(api) {
      const o = find(id); if (!o) { api.close(); return; }
      const b = api.body;
      b.appendChild(timerBar());
      if (o.note) b.appendChild(h('<p class="oo-note">' + U.esc(o.note) + '</p>'));
      lists(o).forEach(l => {
        const items = Array.isArray(l.items) ? l.items : [];
        if (!items.length) return;
        const got = items.filter((_, i) => itemDone(o, l, i)).length;
        const sec = h('<div class="oo-sec"><div class="oo-sh"><span class="t">' + U.esc(l.title || 'List') + '</span><span class="c num">' + got + ' of ' + items.length + '</span></div><div class="card"></div></div>');
        items.forEach((it, i) => {
          const r = h('<div class="row tap' + (itemDone(o, l, i) ? ' done' : '') + '"><span class="ck sq">' + ui.CK + '</span><span class="tx"><b>' + U.esc(it) + '</b></span></div>');
          r.onclick = () => { const v = !itemDone(o, l, i); setItem(o, l, i, v); r.classList.toggle('done', v); ui.buzz(8); sec.querySelector('.c').textContent = items.filter((_, j) => itemDone(o, l, j)).length + ' of ' + items.length; };
          sec.querySelector('.card').appendChild(r);
        });
        b.appendChild(sec);
      });
      let focus = null;
      parts(o).forEach(p => {
        if (!steps(p).length && !p.note) return;
        const sec = h('<div class="oo-sec"><div class="oo-sh"><span class="t">' + U.esc(p.label || 'Steps') + '</span>' + (p.date ? '<span class="c">' + U.esc(whenDay(p.date)) + (p.time ? ' · ' + U.fmtTimeAP(p.time) : '') + '</span>' : '') + '</div>' +
          (p.note ? '<p class="oo-pnote">' + U.esc(p.note) + '</p>' : '') + '<div class="card"></div></div>');
        const card = sec.querySelector('.card');
        steps(p).forEach((s, i) => {
          const r = h('<div class="row tap oo-row' + (stepDone(o, p, s) ? ' done' : '') + '"><span class="ck">' + ui.CK + '</span><span class="tx">' +
            (s.when ? '<span class="oo-when">' + U.esc(s.when) + '</span>' : '<span class="oo-when num">' + (i + 1) + '</span>') +
            '<b>' + (s.amount ? '<span class="oo-amt">' + U.esc(s.amount) + '</span> ' : '') + U.esc(s.text) + '</b>' +
            (Array.isArray(s.sub) && s.sub.length ? '<ul class="oo-sub">' + s.sub.map(x => '<li>' + U.esc(x) + '</li>').join('') + '</ul>' : '') +
            (s.note ? '<small>' + U.esc(s.note) + '</small>' : '') +
            (s.timer > 0 ? '<button class="oo-timer" type="button">' + ui.icon('timer') + ' Timer ' + s.timer + ' min</button>' : '') + '</span></div>');
          r.onclick = () => { const v = !stepDone(o, p, s); setStep(o, p, s, v); r.classList.toggle('done', v); ui.buzz(8); };
          const tb = r.querySelector('.oo-timer'); if (tb) tb.onclick = e => { e.stopPropagation(); startTimer(o, s); };
          card.appendChild(r);
        });
        if (!focus && p.date === U.key(new Date()) && partLeft(o, p).length) focus = sec;
        b.appendChild(sec);
      });
      const notes = Array.isArray(o.notes) ? o.notes.filter(Boolean) : [];
      if (notes.length) b.appendChild(h('<div class="oo-sec"><div class="oo-sh"><span class="t">Notes</span></div><div class="card pad oo-notes">' + notes.map(n => '<p>' + U.esc(n) + '</p>').join('') + '</div></div>'));
      const btns = h('<div class="btns"><button class="btn quiet" type="button">Edit</button><button class="btn ghost" type="button">' + (o.done ? 'Bring it back' : 'Finished with it') + '</button></div>');
      btns.children[0].onclick = () => edit(o.id, () => { api.setTitle((find(id) || o).title); api.rerender(); });
      btns.children[1].onclick = () => { if (o.done) delete o.done; else o.done = true; Store.save(); ui.toast(o.done ? 'Put away' : 'Back on'); api.close(); };
      b.appendChild(btns);
      paint(); if (tm()) loop();
      // open on today's part, past the list, the first time
      if (first && focus && lists(o).length) requestAnimationFrame(() => { b.scrollTop += focus.getBoundingClientRect().top - b.getBoundingClientRect().top - 8; });
      first = false;
    } });
  }

  /* ---------- writing one by hand ---------- */
  /* steps as plain lines:  "[7:00 am] Take it out {60 min}"  ·  "- a sub-step"  ·  "> a note" */
  function stepsToText(ss) {
    return ss.map(s => (s.when ? '[' + s.when + '] ' : '') + (s.amount ? s.amount + ' | ' : '') + s.text + (s.timer > 0 ? ' {' + s.timer + ' min}' : '') +
      (Array.isArray(s.sub) ? s.sub.map(x => '\n- ' + x).join('') : '') + (s.note ? '\n> ' + s.note : '')).join('\n');
  }
  function timeOf(when) { // first clock time in a "when", e.g. "11:30 am–12:15 pm" → 11:30
    const m = /(\d{1,2})(?::(\d{2}))?\s*(?:[–-]\s*\d{1,2}(?::\d{2})?\s*)?(am|pm|a\.m\.|p\.m\.)?/i.exec(when || '');
    if (!m || (!m[2] && !m[3])) return null;
    let hh = +m[1]; const mm = +(m[2] || 0); if (hh > 23 || mm > 59) return null;
    const rest = (when || '').slice(m.index); const ap = (/\b(am|pm|a\.m\.|p\.m\.)/i.exec(rest) || [])[1];
    if (ap) {
      const pm = /^p/i.test(ap);
      // "11:15–12:15 pm": the first time is still morning
      const two = /(\d{1,2})(?::\d{2})?\s*[–-]\s*(\d{1,2})/.exec(rest);
      const crosses = two && +two[2] === 12 && +two[1] < 12 && +two[1] > 6;
      if (pm && hh < 12 && !crosses) hh += 12;
      if (!pm && hh === 12) hh = 0;
    }
    return U.pad(hh) + ':' + U.pad(mm);
  }
  function textToSteps(txt, old) {
    const out = [], used = new Set();
    for (const raw of String(txt || '').split('\n')) {
      const line = raw.trim(); if (!line) continue;
      const last = out[out.length - 1];
      if (/^[-•]\s+/.test(line) && last) { (last.sub = last.sub || []).push(line.replace(/^[-•]\s+/, '')); continue; }
      if (/^>\s*/.test(line) && last) { last.note = (last.note ? last.note + ' ' : '') + line.replace(/^>\s*/, ''); continue; }
      let t = line, when = null, timer = null, amount = null;
      const w = /^\[([^\]]+)\]\s*/.exec(t); if (w) { when = w[1].trim(); t = t.slice(w[0].length); }
      const tm2 = /\s*\{\s*(\d+)\s*min[a-z]*\s*\}\s*$/i.exec(t); if (tm2) { timer = +tm2[1]; t = t.slice(0, tm2.index); }
      const am = /^([^|]{1,30})\s+\|\s+/.exec(t); if (am) { amount = am[1].trim(); t = t.slice(am[0].length); }
      t = t.trim(); if (!t) continue;
      const prev = (old || []).find(s => s.text === t && !used.has(s.id));
      const s = { id: prev ? prev.id : 's' + U.uid(), text: t };
      used.add(s.id);
      if (when) { s.when = when; const tt = prev && prev.when === when ? prev.time : timeOf(when); if (tt) s.time = tt; } // a step that kept its time keeps its clock time (or none)
      if (amount) s.amount = amount;
      if (timer) s.timer = timer;
      out.push(s);
    }
    return out;
  }
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

  function edit(id, done) {
    const isNew = !id;
    const src = isNew ? { title: '', parts: [{ id: 'p1', label: '', date: U.key(new Date()), steps: [] }], lists: [], notes: [] } : U.clone(find(id));
    const ps = parts(src).map(p => ({ id: p.id, label: p.label || '', date: p.date || '', time: p.time || '', note: p.note || '', old: steps(p), text: stepsToText(steps(p)) }));
    ui.sheet({ title: isNew ? 'New one-off' : 'Edit one-off', kicker: 'One-off', render(api) {
      const b = api.body;
      b.appendChild(h('<div class="field"><label for="oo-title">What it is</label><input class="input" id="oo-title" placeholder="e.g. Thanksgiving turkey, Move the office"></div>'));
      b.querySelector('#oo-title').value = src.title || '';
      b.appendChild(h('<div class="field"><label for="oo-note">Note</label><input class="input" id="oo-note" placeholder="optional"></div>'));
      b.querySelector('#oo-note').value = src.note || '';
      b.appendChild(h('<p class="muted oo-help">One line per step. Put a time in brackets first, like <b>[7:00 am]</b>. Start a line with <b>-</b> for a sub-step, or <b>&gt;</b> for a note under the step. End a step with <b>{20 min}</b> to give it a timer.</p>'));
      const wrap = h('<div class="oo-parts"></div>'); b.appendChild(wrap);
      const draw = () => {
        wrap.innerHTML = '';
        ps.forEach((p, i) => {
          const f = h('<div class="oo-epart"><div class="grid2"><div class="field"><label>Part</label><input class="input" data-k="label" placeholder="e.g. Tonight: prep"></div><div class="field"><label>Day</label><input class="input" type="date" data-k="date"></div></div>' +
            '<div class="field"><label>Steps</label><textarea class="input" rows="7" data-k="text" placeholder="[evening] Pat it dry&#10;- a sub-step&#10;Next step {10 min}"></textarea></div>' +
            '<div class="field"><label>Part note</label><input class="input" data-k="note" placeholder="optional"></div>' +
            (ps.length > 1 ? '<button class="btn quiet oo-rm" type="button">Remove this part</button>' : '') + '</div>');
          f.querySelectorAll('[data-k]').forEach(inp => { inp.value = p[inp.dataset.k] || ''; inp.oninput = () => { p[inp.dataset.k] = inp.value; }; });
          const rm = f.querySelector('.oo-rm'); if (rm) rm.onclick = () => ui.ask({ title: 'Remove "' + (p.label || 'this part') + '"?', yes: 'Remove', danger: true }).then(ok => { if (ok) { ps.splice(i, 1); draw(); } });
          wrap.appendChild(f);
        });
        const add = h('<button class="btn ghost" type="button">+ Add a part</button>');
        add.onclick = () => { const last = ps[ps.length - 1]; ps.push({ id: 'p' + U.uid(), label: '', date: last && last.date ? U.key(U.addDays(U.parseKey(last.date), 1)) : '', time: '', note: '', old: [], text: '' }); draw(); };
        wrap.appendChild(add);
      };
      draw();
      const listTxt = lists(src).map(l => '# ' + (l.title || 'List') + '\n' + (l.items || []).join('\n')).join('\n\n');
      b.appendChild(h('<div class="field"><label for="oo-lists">Lists</label><textarea class="input" id="oo-lists" rows="5" placeholder="# What to buy&#10;Butter&#10;Garlic"></textarea><small class="muted">A line starting with # starts a list. Each line under it is something to tick off.</small></div>'));
      b.querySelector('#oo-lists').value = listTxt;
      b.appendChild(h('<div class="field"><label for="oo-notes">Notes</label><textarea class="input" id="oo-notes" rows="3" placeholder="One per line"></textarea></div>'));
      b.querySelector('#oo-notes').value = (src.notes || []).join('\n');
      const btns = h('<div class="btns">' + (isNew ? '' : '<button class="btn danger" type="button">Delete</button>') + '<button class="btn" type="button">Save</button></div>');
      const sv = btns.lastElementChild, del = isNew ? null : btns.firstElementChild;
      sv.onclick = () => {
        const title = b.querySelector('#oo-title').value.trim(); if (!title) { ui.toast('Give it a name'); return; }
        const out = { id: src.id || slug(title) || U.uid(), title };
        const note = b.querySelector('#oo-note').value.trim(); if (note) out.note = note;
        if (src.since) out.since = src.since; else if (isNew) out.since = U.key(new Date());
        if (src.done) out.done = true;
        // lists keep their ids by title so ticks stay
        const ls = []; let cur = null;
        b.querySelector('#oo-lists').value.split('\n').forEach(raw => {
          const line = raw.trim(); if (!line) return;
          if (/^#/.test(line)) { const t = line.replace(/^#+\s*/, '') || 'List'; const was = lists(src).find(l => l.title === t); cur = { id: was ? was.id : 'l' + (ls.length + 1) + '-' + slug(t).slice(0, 16), title: t, items: [] }; ls.push(cur); return; }
          if (!cur) { cur = { id: 'l1', title: 'List', items: [] }; ls.push(cur); }
          cur.items.push(line.replace(/^[-•]\s*/, ''));
        });
        if (ls.length) out.lists = ls;
        out.parts = ps.map(p => {
          const q = { id: p.id, label: p.label.trim() || 'Steps' };
          if (p.date) q.date = p.date; if (p.time) q.time = p.time;
          if (p.note && p.note.trim()) q.note = p.note.trim();
          q.steps = textToSteps(p.text, p.old);
          return q;
        }).filter(q => q.steps.length || q.note);
        if (!out.parts.length) { ui.toast('Add at least one step'); return; }
        const notes = b.querySelector('#oo-notes').value.split('\n').map(x => x.trim()).filter(Boolean); if (notes.length) out.notes = notes;
        const arr = ensure();
        if (isNew) { while (arr.some(x => x.id === out.id)) out.id += '-2'; arr.push(out); }
        else { const i = arr.findIndex(x => x.id === src.id); if (i >= 0) arr[i] = out; else arr.push(out); }
        Store.save(); api.close(); ui.toast('Saved');
        if (done) done(); else Opus.refresh();
      };
      if (del) del.onclick = () => ui.ask({ title: 'Delete "' + src.title + '"?', text: 'Its steps and ticks go with it.', yes: 'Delete', danger: true }).then(ok => {
        if (!ok) return;
        const arr = ensure(), i = arr.findIndex(x => x.id === src.id); if (i >= 0) arr.splice(i, 1);
        Store.save(); api.close(); ui.topSheet() && ui.topSheet().close(); Opus.refresh();
      });
      b.appendChild(btns);
    } });
  }

  /* ---------- Home: the list of them ---------- */
  function section(v, roman) {
    const sec = h('<div class="sec"><div class="sh"><span class="r">' + roman + '</span><span class="t">One-offs</span><button class="c" type="button">+ Add</button></div><div class="card"></div></div>');
    sec.querySelector('.c').onclick = () => edit(null);
    const card = sec.querySelector('.card'), d = new Date();
    const live = all().filter(o => !finished(o)), past = all().filter(o => finished(o));
    if (!live.length) card.appendChild(h('<p class="empty">Nothing one-off on the go. Add one for anything you do once.</p>'));
    live.forEach(o => {
      const tot = parts(o).reduce((n, p) => n + steps(p).length, 0), dn = parts(o).reduce((n, p) => n + steps(p).length - partLeft(o, p).length, 0);
      const nowP = partsFor(o, d)[0], nx = nowP || nextPart(o, d);
      const sub = (nx ? (nx.date ? whenDay(nx.date) + ' · ' : '') + (nx.label || '') : '') + (tot ? (nx ? ' · ' : '') + dn + ' of ' + tot + ' done' : '');
      const r = h('<div class="row tap"><span class="tx"><b>' + U.esc(o.title) + '</b><small>' + U.esc(sub) + '</small></span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.onclick = () => open(o.id);
      card.appendChild(r);
    });
    if (past.length) {
      const more = h('<details class="oo-past"><summary>Finished (' + past.length + ')</summary></details>');
      past.forEach(o => { const r = h('<div class="row tap"><span class="tx"><b>' + U.esc(o.title) + '</b></span>' + ui.icon('chev', 'chev ico') + '</div>'); r.onclick = () => open(o.id); more.appendChild(r); });
      card.appendChild(more);
    }
    v.appendChild(sec);
  }

  /* ---------- the lock screen: each step that has a time, and a running timer ---------- */
  function events(now, add) {
    for (const o of all()) {
      if (o.done) continue;
      for (const p of parts(o)) {
        if (!p.date) continue;
        const d = U.parseKey(p.date), at = hm => { const m = U.mins(hm); return m == null ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60); };
        const timed = steps(p).filter(s => s.time), seen = new Set();
        timed.forEach(s => !seen.has(s.time) && seen.add(s.time) && add(at(s.time), 'oneoffs', o.title, (s.when ? s.when + ': ' : '') + s.text, { check: { date: p.date, id: stepId(o, p, s) } }));
        if (!timed.length && p.time && steps(p)[0]) add(at(p.time), 'oneoffs', o.title + ' · ' + (p.label || 'Steps'), steps(p)[0].text, { check: { date: p.date, id: stepId(o, p, steps(p)[0]) } });
      }
    }
    const t = tm(); if (t) { const o = find(t.oid); add(new Date(t.endAt), 'oneoffs', 'Time’s up', t.label + (o ? ' · ' + o.title : '')); }
  }

  Opus.oneoffs = { all, todayCard, open, edit, section, events, _: { textToSteps, stepsToText, timeOf, partsFor } };
  if (tm()) setTimeout(loop, 0);
})();
