/* Pets: a profile for each pet in plan.home.pets, care that comes due on its own schedule,
   weigh-ins and vet visits. What was done lives in logs `pets`, so Grok can read and add to it. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;

  const list = () => (((Plan.p.home || {}).pets) || []);
  const pet = id => list().find(p => p.id === id) || null;
  const log = () => (Store.data.pets = Store.data.pets || []);
  const iso = () => new Date().toISOString();
  const UNIT = { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'] };
  const lower1 = s => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  const cmp = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.at || '') < String(b.at || '') ? -1 : 1);

  function bury(id) { const dl = Store.data.deleted = Store.data.deleted || {}; (dl.pets = dl.pets || {})[id] = iso(); }
  function entries(pid, care) { return log().filter(e => e.pet === pid && (!care || e.care === care)).sort(cmp); }
  function last(pid, care) { const L = entries(pid, care); return L[L.length - 1] || null; }
  function put(e) { const L = log(); const i = L.findIndex(x => x.id === e.id); if (i >= 0) L[i] = e; else L.push(e); const dl = (Store.data.deleted || {}).pets; if (dl) delete dl[e.id]; }
  function drop(id) { const L = log(); const i = L.findIndex(x => x.id === id); if (i < 0) return null; const [x] = L.splice(i, 1); bury(id); return x; }
  function mark(pid, care, date, extra) { const e = Object.assign({ id: date + ':' + pid + ':' + care, date, pet: pid, care, at: iso() }, extra || {}); put(e); return e; }

  function addMonths(d, n) { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); x.setDate(Math.min(d.getDate(), new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x; }
  function every(c) { if (!c.every) return ''; const n = Number(c.every.n), u = UNIT[c.every.unit] || UNIT.day; return n === 1 ? 'Every ' + u[0] : 'Every ' + n + ' ' + u[1]; }
  function nextDue(pid, c) {
    if (!c.every) return null; const l = last(pid, c.id); if (!l) return null;
    const d = U.parseKey(l.date), n = Number(c.every.n);
    return c.every.unit === 'month' ? addMonths(d, n) : U.addDays(d, c.every.unit === 'week' ? 7 * n : n);
  }
  /* where one care item stands: tone is due | over | soon | ok | none */
  function status(pid, c, today) {
    today = today || new Date();
    const l = last(pid, c.id), nx = nextDue(pid, c);
    const ago = l ? U.daysBetween(U.parseKey(l.date), today) : null;
    const lastTxt = l ? (ago === 0 ? 'Done today' : 'Last ' + U.fmtDateShort(l.date) + ' · ' + (ago === 1 ? 'yesterday' : ago + ' days ago')) : 'Not logged yet';
    if (!nx) return { tone: l ? 'ok' : 'none', text: lastTxt + (c.every || !l ? '' : ' · set how often'), last: l, next: null };
    const left = U.daysBetween(today, nx);
    if (left < 0) return { tone: 'over', text: (-left === 1 ? '1 day overdue' : -left + ' days overdue') + ' · last ' + U.fmtDateShort(l.date), last: l, next: nx, left };
    if (left === 0) return { tone: 'due', text: 'Due today · last ' + U.fmtDateShort(l.date), last: l, next: nx, left };
    return { tone: left <= 3 ? 'soon' : 'ok', text: (ago === 0 ? 'Done today' : 'Last ' + U.fmtDateShort(l.date)) + ' · next ' + (left === 1 ? 'tomorrow' : U.fmtDateShort(nx)), last: l, next: nx, left };
  }

  /* age, from a birthday when known, else from the age given and when it was given */
  function age(p, today) {
    today = today || new Date();
    if (p.born) {
      const b = U.parseKey(p.born); let y = today.getFullYear() - b.getFullYear(), m = today.getMonth() - b.getMonth();
      if (today.getDate() < b.getDate()) m--; if (m < 0) { y--; m += 12; }
      return y < 2 ? (y * 12 + m) + ' months' : y + ' yrs';
    }
    if (p.age == null) return '';
    const since = p.ageAsOf ? Math.floor(U.daysBetween(U.parseKey(p.ageAsOf), today) / 365.25) : 0;
    return (since > 0 ? 'about ' : '') + (p.age + since) + ' yrs';
  }
  function nextBirthday(p, today) {
    if (!p.born) return null; today = today || new Date();
    const b = U.parseKey(p.born); let n = new Date(today.getFullYear(), b.getMonth(), b.getDate());
    if (U.daysBetween(today, n) < 0) n = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate());
    return { date: n, turns: n.getFullYear() - b.getFullYear(), days: U.daysBetween(today, n) };
  }
  function weight(p) {
    const w = entries(p.id, 'weight').filter(e => typeof e.lb === 'number');
    if (w.length) return { lb: w[w.length - 1].lb, date: w[w.length - 1].date, pts: w.map(e => ({ v: e.lb })) };
    return p.weightLb != null ? { lb: p.weightLb, date: null, pts: [] } : null;
  }
  function facts(p) {
    const w = weight(p);
    return [p.breed || (p.kind && p.kind !== 'other' ? p.kind[0].toUpperCase() + p.kind.slice(1) : ''), p.sex ? p.sex[0].toUpperCase() + p.sex.slice(1) : '', age(p), w ? (w.date ? '' : 'about ') + U.wt(w.lb) + ' lb' : ''].filter(Boolean).join(' · ');
  }
  const you = w => (w === 'me' ? 'you' : w);
  function feedingLine(p) {
    const f = p.feeding || [];
    const who = f.length ? f.map(x => you(x.who) + (x.when ? ' ' + x.when : '')).join(', ') : '';
    const food = p.food ? p.food + (p.amount ? ', ' + p.amount : '') : '';
    if (!f.length && !food) return '';
    return (f.length ? 'Fed ' + (f.length === 2 ? 'twice' : f.length === 1 ? 'once' : f.length + ' times') + ' a day: ' + who : '') + (food ? (f.length ? ' · ' : '') + food : '');
  }
  /* what the profile does not know yet, so Grok can be asked */
  function blanks(p) {
    const out = [];
    if (!p.breed && p.kind !== 'other') out.push('breed');
    if (!p.sex) out.push('sex');
    if (!p.born) out.push('birthday');
    if (p.age == null && !p.born) out.push('age');
    if (!weight(p)) out.push('weight');
    if (!p.food) out.push('food'); else if (!p.amount) out.push('how much');
    if (!(p.vet || {}).name) out.push('vet'); else if (!(p.vet || {}).phone) out.push('vet’s phone');
    const loose = (p.care || []).filter(c => !c.every).map(c => lower1(c.title));
    if (loose.length) out.push('how often for ' + loose.join(', '));
    return out;
  }
  /* daily home items that belong to this pet (home item "pet": id or [ids]) */
  function daily(p) { return (((Plan.p.home || {}).items) || []).filter(it => it.pet === p.id || (Array.isArray(it.pet) && it.pet.includes(p.id))); }
  function weekDots(it, today) {
    const ws = U.weekStart(today); let n = 0, due = 0, dots = '';
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(ws, i), future = U.daysBetween(today, d) > 0, isDue = Plan.homeDue(d).some(x => x.id === it.id);
      const on = isDue && Plan.isChecked(d, 'home:' + it.id); if (isDue && !future) { due++; if (on) n++; }
      dots += '<i class="' + (on ? 'on' : '') + (future ? ' fut' : '') + (isDue ? '' : ' off') + '" title="' + U.DAY_NAMES[d.getDay()] + '"></i>';
    }
    return { html: '<span class="wdots" aria-label="' + n + ' of ' + due + ' this week">' + dots + '</span>', n, due };
  }
  function roundel(p, big) {
    const k = p.kind === 'cat' ? 'cat' : p.kind === 'dog' ? 'dog' : 'pet';
    return '<span class="roundel' + (big ? ' big' : '') + ' ' + k + '" aria-hidden="true"><span>' + U.esc((p.name || '?')[0].toUpperCase()) + '</span></span>';
  }

  /* ---------- Today: care that is due shows up, and stays (ticked) on the day it was done ---------- */
  Plan.mods.push({
    prefix: 'pet',
    items(d) {
      const k = U.key(d), out = [], isToday = U.key(new Date()) === k;
      for (const p of list()) for (const c of (p.care || [])) {
        const doneHere = log().some(e => e.date === k && e.pet === p.id && e.care === c.id);
        let show = doneHere, st = null;
        if (!show && c.every) { const nx = nextDue(p.id, c); show = !!nx && U.daysBetween(nx, d) >= 0 && (isToday || U.daysBetween(nx, d) === 0); }
        if (!show) continue;
        st = status(p.id, c, d);
        out.push({ id: 'pet:' + p.id + ':' + c.id, title: p.name + ': ' + lower1(c.title), part: c.part || 'evening', time: c.time || null, kind: 'pet', detail: doneHere ? (every(c) || 'Logged') : st.tone === 'over' ? st.text : every(c) + ' · due today', pet: p.id });
      }
      return out;
    },
    checked(d) { const k = U.key(d); return log().filter(e => e.date === k && e.care !== 'weight' && e.care !== 'vet').map(e => 'pet:' + e.pet + ':' + e.care); },
    set(d, id, on) {
      const [, pid, care] = id.split(':'); const k = U.key(d);
      if (on) mark(pid, care, k); else drop(k + ':' + pid + ':' + care);
    }
  });

  /* ---------- sheets ---------- */
  function careSheet(p, c, after) {
    ui.sheet({ title: c.title, kicker: p.name, render(api) {
      const b = api.body, st = status(p.id, c);
      b.appendChild(h('<div class="card pad"><div class="kv"><span>Where it stands</span><span class="num">' + U.esc(st.text) + '</span></div></div>'));
      // how often
      const often = h('<div class="field"><label>How often</label><div class="chips"></div><div class="grid2" style="margin-top:8px"></div></div>');
      let n = c.every ? Number(c.every.n) : null, unit = c.every ? c.every.unit : 'month';
      const chips = often.querySelector('.chips'), row = often.querySelector('.grid2');
      const step = ui.stepper({ label: 'Every', value: n, step: (v, s) => Math.max(1, (v || 0) + s), onChange: v => { n = v; } });
      const units = h('<div class="chips">' + Object.keys(UNIT).map(u => '<button class="chip" type="button" data-u="' + u + '">' + UNIT[u][1] + '</button>').join('') + '</div>');
      const draw = () => { units.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x.dataset.u === unit)); row.hidden = n == null; chips.querySelector('.chip').classList.toggle('on', n == null); };
      chips.appendChild(h('<button class="chip" type="button">Not set</button>')); chips.lastChild.onclick = () => { n = null; step.set(null, true); draw(); };
      [[1, 'month', 'Monthly'], [2, 'week', 'Every 2 weeks'], [1, 'week', 'Weekly']].forEach(([nn, uu, t]) => { const x = h('<button class="chip" type="button">' + t + '</button>'); x.onclick = () => { n = nn; unit = uu; step.set(nn, true); draw(); }; chips.appendChild(x); });
      units.querySelectorAll('.chip').forEach(x => x.onclick = () => { unit = x.dataset.u; draw(); });
      row.appendChild(step.el); row.appendChild(units); b.appendChild(often); draw();
      // done on another day
      const dd = h('<div class="field"><label for="pc-date">Done on</label><div style="display:flex;gap:8px"><input class="input" id="pc-date" type="date" style="flex:1"><button class="btn ghost sm" type="button">Log it</button></div></div>');
      const di = dd.querySelector('input'); di.value = U.key(); di.max = U.key();
      dd.querySelector('button').onclick = () => { if (!/^\d{4}-\d{2}-\d{2}$/.test(di.value)) { ui.toast('Pick a date'); return; } mark(p.id, c.id, di.value); Store.save(); ui.buzz(10); api.rerender(); after && after(); };
      b.appendChild(dd);
      // history
      const hist = entries(p.id, c.id).reverse().slice(0, 6);
      if (hist.length) {
        const hc = h('<div class="sec"><div class="sh"><span class="t">Done</span><span class="c num">' + entries(p.id, c.id).length + '</span></div><div class="card"></div></div>');
        hist.forEach(e => { const r = h('<div class="row"><span class="tx"><b>' + U.esc(U.DAY_NAMES[U.parseKey(e.date).getDay()] + ', ' + U.fmtDateShort(e.date)) + '</b></span><button class="mini" type="button" aria-label="Remove">' + ui.icon('close') + '</button></div>'); r.querySelector('button').onclick = () => { const gone = drop(e.id); Store.save(); api.rerender(); after && after(); ui.toast('Removed ' + U.fmtDateShort(e.date), { label: 'Undo', run: () => { gone.at = iso(); put(gone); Store.save(); api.rerender(); after && after(); } }); }; hc.querySelector('.card').appendChild(r); });
        b.appendChild(hc);
      }
      const sv = h('<div class="btns"><button class="btn" type="button">Save</button></div>');
      sv.firstChild.onclick = () => { if (n != null && !(n > 0)) { ui.toast('How often: a number above 0'); return; } c.every = n == null ? null : { n: Math.round(n), unit }; Plan.p.updated = U.key(); Store.save(); api.close(); after && after(); ui.toast('Saved'); };
      b.appendChild(sv);
    } });
  }

  function weightSheet(p, after) {
    ui.sheet({ title: 'Log weight', kicker: p.name, render(api) {
      const w = weight(p);
      const st = ui.stepper({ label: 'Weight', unit: 'lb', value: w ? w.lb : null, step: (v, s) => Math.max(0, Math.round(((v || 0) + s * 0.5) * 2) / 2) });
      api.body.appendChild(h('<div class="field"><label>Weight</label></div>')).appendChild(st.el);
      const dd = h('<div class="field"><label for="pw-date">Date</label><input class="input" id="pw-date" type="date"></div>'); dd.querySelector('input').value = U.key(); dd.querySelector('input').max = U.key(); api.body.appendChild(dd);
      api.body.appendChild(h('<p class="note">Most vets weigh at every visit; the number on the receipt works.</p>'));
      const sv = h('<div class="btns"><button class="btn" type="button">Save</button></div>');
      sv.firstChild.onclick = () => { const lb = st.get(), date = dd.querySelector('input').value; if (!(lb > 0)) { ui.toast('Enter a weight'); return; } if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { ui.toast('Pick a date'); return; } mark(p.id, 'weight', date, { lb }); Store.save(); api.close(); after && after(); ui.toast('Saved ' + U.wt(lb) + ' lb'); };
      api.body.appendChild(sv);
    } });
  }

  function vetSheet(p, after) {
    ui.sheet({ title: 'Vet visit', kicker: p.name, render(api) {
      const dd = h('<div class="field"><label for="pv-date">Date</label><input class="input" id="pv-date" type="date"></div>'); dd.querySelector('input').value = U.key(); api.body.appendChild(dd);
      api.body.appendChild(h('<div class="field"><label for="pv-note">What happened</label><input class="input" id="pv-note" placeholder="e.g. Checkup, shots, all good"></div>'));
      const sv = h('<div class="btns"><button class="btn" type="button">Save</button></div>');
      sv.firstChild.onclick = () => { const date = dd.querySelector('input').value, note = api.body.querySelector('#pv-note').value.trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { ui.toast('Pick a date'); return; } mark(p.id, 'vet', date, note ? { note } : {}); Store.save(); api.close(); after && after(); ui.toast('Saved'); };
      api.body.appendChild(sv);
    } });
  }

  function editSheet(p, after) {
    ui.sheet({ title: 'Edit ' + p.name, render(api) {
      const b = api.body, f = (id, label, val, ph, type) => { const x = h('<div class="field"><label for="pe-' + id + '">' + label + '</label><input class="input" id="pe-' + id + '"' + (type ? ' type="' + type + '"' : '') + ' placeholder="' + U.esc(ph || '') + '"></div>'); x.querySelector('input').value = val == null ? '' : val; b.appendChild(x); return x.querySelector('input'); };
      const name = f('name', 'Name', p.name), breed = f('breed', 'Breed', p.breed, p.kind === 'cat' ? 'e.g. Domestic shorthair' : 'e.g. Labrador');
      let sex = p.sex || null;
      const sx = h('<div class="field"><label>Sex</label><div class="chips"><button class="chip" data-s="male" type="button">Male</button><button class="chip" data-s="female" type="button">Female</button></div></div>');
      const drawS = () => sx.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.s === sex));
      sx.querySelectorAll('.chip').forEach(c => c.onclick = () => { sex = sex === c.dataset.s ? null : c.dataset.s; drawS(); }); b.appendChild(sx); drawS();
      const born = f('born', 'Birthday', p.born, '', 'date');
      const food = f('food', 'Food', p.food, 'Brand and kind'), amount = f('amount', 'How much per meal', p.amount, 'e.g. 1½ cups');
      const vn = f('vet', 'Vet', (p.vet || {}).name, 'Clinic name'), vp = f('vetphone', 'Vet’s phone', (p.vet || {}).phone, '', 'tel');
      const nt = h('<div class="field"><label for="pe-notes">Notes</label><textarea class="input" id="pe-notes" rows="3" placeholder="One per line"></textarea></div>'); nt.querySelector('textarea').value = (p.notes || []).join('\n'); b.appendChild(nt);
      const sv = h('<div class="btns"><button class="btn" type="button">Save</button></div>');
      sv.firstChild.onclick = () => {
        const nm = name.value.trim(); if (!nm) { ui.toast('Give a name'); return; }
        const t = s => s.value.trim() || null;
        Object.assign(p, { name: nm, breed: t(breed), sex, born: t(born), food: t(food), amount: t(amount), vet: { name: t(vn), phone: t(vp) }, notes: nt.querySelector('textarea').value.split('\n').map(s => s.trim()).filter(Boolean) });
        Plan.p.updated = U.key(); Store.save(); api.close(); after && after(); ui.toast('Saved');
      };
      b.appendChild(sv);
    } });
  }

  function profile(p) {
    const s = ui.sheet({ title: p.name, kicker: 'Profile', full: true, render(api) {
      const b = api.body, re = () => { api.rerender(); Opus.refresh(); }, today = new Date();
      b.appendChild(h('<div class="pet-hero">' + roundel(p, true) + '<div class="tx"><div class="serif-h">' + U.esc(p.name) + '</div><div class="small">' + U.esc(facts(p)) + '</div></div></div>'));
      // about
      const ab = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">About</span></div><div class="card pad"></div></div>'), ac = ab.querySelector('.card');
      const bd = nextBirthday(p, today), w = weight(p);
      ac.appendChild(h('<div class="kv"><span>Age</span><span class="num">' + U.esc(age(p) || '—') + '</span></div>'));
      if (bd) ac.appendChild(h('<div class="kv"><span>Birthday</span><span class="num">' + U.fmtDateShort(bd.date) + (bd.days === 0 ? ' · today, turns ' + bd.turns : bd.days <= 30 ? ' · turns ' + bd.turns + ' in ' + bd.days + ' days' : '') + '</span></div>'));
      const wr = h('<div class="kv"><span>Weight</span><span class="num">' + (w ? (w.date ? '' : 'about ') + U.wt(w.lb) + ' lb' + (w.date ? ' · ' + U.fmtDateShort(w.date) : '') : '—') + '</span></div>');
      if (w && w.pts.length > 1) { const first = w.pts[0].v, d = w.lb - first; wr.lastChild.insertAdjacentHTML('afterbegin', ui.spark(w.pts.slice(-12), { w: 64, h: 18 }) + ' '); wr.insertAdjacentHTML('afterend', '<p class="small" style="text-align:right">' + (d === 0 ? 'Steady' : (d > 0 ? '+' : '') + U.wt(d) + ' lb') + ' since ' + U.fmtDateShort(entries(p.id, 'weight')[0].date) + '</p>'); }
      ac.appendChild(wr);
      const lw = h('<button class="btn ghost sm" type="button" style="margin-top:8px">Log weight</button>'); lw.onclick = () => weightSheet(p, re); ac.appendChild(lw);
      b.appendChild(ab);
      // food
      const fl = feedingLine(p);
      const fo = h('<div class="sec"><div class="sh"><span class="r">II</span><span class="t">Food</span></div><div class="card pad"></div></div>'), fc = fo.querySelector('.card');
      (p.feeding || []).forEach(x => fc.appendChild(h('<div class="kv"><span>' + U.esc(x.when ? x.when[0].toUpperCase() + x.when.slice(1) : 'Feeding') + '</span><span>' + U.esc(x.who === 'me' ? 'You' : x.who) + '</span></div>')));
      fc.appendChild(h('<div class="kv"><span>Food</span><span>' + U.esc(p.food || '—') + '</span></div>'));
      fc.appendChild(h('<div class="kv"><span>Per meal</span><span>' + U.esc(p.amount || '—') + '</span></div>'));
      if (fl || p.food || (p.feeding || []).length) b.appendChild(fo);
      // care
      const cs = h('<div class="sec"><div class="sh"><span class="r">III</span><span class="t">Care</span></div><div class="card"></div></div>'), cc = cs.querySelector('.card');
      (p.care || []).forEach(c => cc.appendChild(careRow(p, c, re, true)));
      daily(p).forEach(it => { const wd = weekDots(it, today); cc.appendChild(h('<div class="row"><span class="tx"><b>' + U.esc(it.title) + '</b><small>' + U.esc(it.days && it.days !== 'all' ? 'Home item' : 'Every day') + (it.time ? ' · ' + U.fmtTime(it.time) : '') + ' · ' + wd.n + ' of ' + wd.due + ' this week</small></span>' + wd.html + '</div>')); });
      if (!(p.care || []).length && !daily(p).length) cc.appendChild(h('<p class="empty">No care items yet.</p>'));
      b.appendChild(cs);
      // vet
      const v = p.vet || {}, lv = last(p.id, 'vet');
      const vs = h('<div class="sec"><div class="sh"><span class="r">IV</span><span class="t">Vet</span></div><div class="card pad"></div></div>'), vc = vs.querySelector('.card');
      vc.appendChild(h('<div class="kv"><span>Clinic</span><span>' + U.esc(v.name || '—') + '</span></div>'));
      if (v.phone) { const pr = h('<div class="kv"><span>Phone</span><span><a class="link num" href="tel:' + U.esc(String(v.phone).replace(/[^\d+]/g, '')) + '">' + U.esc(v.phone) + '</a></span></div>'); vc.appendChild(pr); }
      vc.appendChild(h('<div class="kv"><span>Last visit</span><span class="num">' + (lv ? U.fmtDateShort(lv.date) + (lv.note ? ' · ' + U.esc(lv.note) : '') : '—') + '</span></div>'));
      const vb = h('<button class="btn ghost sm" type="button" style="margin-top:8px">Log a visit</button>'); vb.onclick = () => vetSheet(p, re); vc.appendChild(vb);
      b.appendChild(vs);
      // notes
      if ((p.notes || []).length) { const ns = h('<div class="sec"><div class="sh"><span class="r">V</span><span class="t">Notes</span></div><div class="card"></div></div>'); p.notes.forEach(x => ns.querySelector('.card').appendChild(h('<div class="row"><span class="tx"><small style="font-size:13.5px;color:var(--ink-2)">' + U.esc(x) + '</small></span></div>'))); b.appendChild(ns); }
      const bl = blanks(p);
      if (bl.length) b.appendChild(h('<p class="note" style="padding:0 4px">Not known yet: ' + U.esc(bl.join(', ')) + '. Tell Grok and it fills them in, or tap Edit.</p>'));
      const eb = h('<div class="btns"><button class="btn quiet" type="button">Edit</button></div>'); eb.firstChild.onclick = () => editSheet(p, () => { s.setTitle(p.name); re(); }); b.appendChild(eb);
    } });
  }

  function careRow(p, c, after, inSheet) {
    const st = status(p.id, c), doneToday = st.last && st.last.date === U.key();
    const r = h('<div class="row tap pet-care ' + st.tone + '"><span class="tx"><b>' + U.esc(c.title) + '</b><small>' + U.esc(st.text) + (c.every && inSheet ? ' · ' + U.esc(every(c).toLowerCase()) : '') + '</small></span>' +
      (doneToday ? '<span class="tm">' + ui.icon('check', 'ico') + '</span>' : '<button class="btn ' + (st.tone === 'due' || st.tone === 'over' ? '' : 'ghost ') + 'sm" type="button">Done</button>') + '</div>');
    const btn = r.querySelector('button');
    if (btn) btn.onclick = e => {
      e.stopPropagation(); const k = U.key(); mark(p.id, c.id, k); Store.save(); ui.buzz(12); after && after();
      ui.toast(p.name + ': ' + lower1(c.title) + ' done', { label: 'Undo', run: () => { drop(k + ':' + p.id + ':' + c.id); Store.save(); after && after(); } });
    };
    r.onclick = () => careSheet(p, c, after);
    return r;
  }

  /* ---------- Home tab section, one per pet ---------- */
  function section(v, numeral, p) {
    const today = new Date(), re = () => Opus.refresh();
    const sec = h('<div class="sec pet"><div class="sh"><span class="r">' + numeral + '</span><span class="t">' + U.esc(p.name) + '</span><button class="c" type="button">Profile</button></div><div class="card"></div></div>');
    const card = sec.querySelector('.card');
    const head = h('<div class="row tap pet-head">' + roundel(p) + '<span class="tx"><b>' + U.esc(facts(p) || p.name) + '</b>' + (feedingLine(p) ? '<small>' + U.esc(feedingLine(p)) + '</small>' : '') + '</span>' + ui.icon('chev', 'chev ico') + '</div>');
    head.onclick = () => profile(p); sec.querySelector('.sh button').onclick = () => profile(p);
    card.appendChild(head);
    daily(p).forEach(it => {
      const wd = weekDots(it, today);
      card.appendChild(h('<div class="row"><span class="tx"><b>' + U.esc(it.title) + '</b><small>' + wd.n + ' of ' + wd.due + ' this week</small></span>' + wd.html + '</div>'));
    });
    // care, soonest first; things never logged last
    const rank = c => { const s = status(p.id, c); return s.next ? s.left : s.last ? 900 : 1000; };
    (p.care || []).slice().sort((a, b) => rank(a) - rank(b)).forEach(c => card.appendChild(careRow(p, c, re)));
    const bd = nextBirthday(p, today);
    if (bd && bd.days <= 14) card.appendChild(h('<div class="row"><span class="tx"><b>' + (bd.days === 0 ? 'Birthday today' : 'Birthday ' + U.DAY_NAMES[bd.date.getDay()] + ', ' + U.fmtDateShort(bd.date)) + '</b><small>Turns ' + bd.turns + '</small></span></div>'));
    v.appendChild(sec);
  }

  /* care and birthdays coming in the next days, for Home's Coming up */
  function upcoming(d) {
    const out = [];
    for (const p of list()) {
      for (const c of (p.care || [])) { const nx = nextDue(p.id, c); if (nx && U.key(nx) === U.key(d)) out.push(p.name + ': ' + lower1(c.title)); }
      const bd = nextBirthday(p, d); if (bd && bd.days === 0) out.push(p.name + '’s birthday');
    }
    return out;
  }

  Opus.pets = { list, pet, status, nextDue, age, facts, blanks, section, profile, upcoming, entries };
})();
