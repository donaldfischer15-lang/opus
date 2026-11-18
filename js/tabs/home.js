/* Home tab: house, pets and vehicle jobs, shown when they matter, and a section for each pet. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const items = () => (Plan.p.home = Plan.p.home || { items: [] }).items = (Plan.p.home.items || []);

  function when(it) {
    let s;
    if (it.monthDay) s = 'Day ' + it.monthDay + ' of each month';
    else if (!it.days || it.days === 'all') s = 'Every day';
    else if (it.days === 'workdays') s = 'Workdays';
    else if (it.days === 'daysoff' || it.days === 'weekends') s = 'Days off';
    else s = [].concat(it.days).map(d => U.DAY_NAMES[U.DAYS.indexOf(d)] + 's').join(', ');
    return s + (it.time ? ' · ' + U.fmtTime(it.time) : it.part ? ' · ' + it.part : '');
  }

  function editItem(idx) {
    const isNew = idx == null;
    const it = isNew ? { id: '', title: '', area: 'House', days: 'all', part: 'evening', time: '' } : U.clone(items()[idx]);
    ui.sheet({ title: isNew ? 'New home item' : 'Edit item', render(api) {
      const b = api.body;
      b.appendChild(h('<div class="field"><label for="hi-title">What</label><input class="input" id="hi-title" placeholder="e.g. Change the furnace filter"></div>'));
      b.appendChild(h('<div class="grid2"><div class="field"><label for="hi-area">Area</label><input class="input" id="hi-area" placeholder="House, Pets, Vehicle"></div><div class="field"><label for="hi-time">Time</label><input class="input" id="hi-time" type="time"></div></div>'));
      b.querySelector('#hi-title').value = it.title; b.querySelector('#hi-area').value = it.area || ''; b.querySelector('#hi-time').value = it.time || '';
      let mode = it.monthDay ? 'month' : (Array.isArray(it.days) ? 'days' : 'every');
      let days = Array.isArray(it.days) ? it.days.slice() : [];
      const modeChips = h('<div class="field"><label>How often</label><div class="chips"><button class="chip" data-m="every" type="button">Every day</button><button class="chip" data-m="days" type="button">Some days</button><button class="chip" data-m="month" type="button">Monthly</button></div></div>');
      const dayChips = h('<div class="chips">' + U.DAYS.map(d => '<button class="chip" data-d="' + d + '" type="button">' + U.DAY_NAMES[U.DAYS.indexOf(d)].slice(0, 3) + '</button>').join('') + '</div>');
      const md = h('<div class="field"><label for="hi-md">Day of the month</label><input class="input" id="hi-md" inputmode="numeric" placeholder="1"></div>'); md.querySelector('input').value = it.monthDay || '';
      const partChips = h('<div class="field"><label>Part of day</label><div class="chips">' + Plan.PARTS.map(p => '<button class="chip" data-p="' + p + '" type="button">' + Plan.partLabel(p, new Date(2026, 10, 23)) + '</button>').join('') + '</div></div>');
      let part = it.part || 'evening';
      const draw = () => {
        modeChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.m === mode));
        dayChips.hidden = mode !== 'days'; md.hidden = mode !== 'month';
        dayChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', days.includes(c.dataset.d)));
        partChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.p === part));
      };
      modeChips.querySelectorAll('.chip').forEach(c => c.onclick = () => { mode = c.dataset.m; draw(); });
      dayChips.querySelectorAll('.chip').forEach(c => c.onclick = () => { const i = days.indexOf(c.dataset.d); if (i >= 0) days.splice(i, 1); else days.push(c.dataset.d); draw(); });
      partChips.querySelectorAll('.chip').forEach(c => c.onclick = () => { part = c.dataset.p; draw(); });
      b.appendChild(modeChips); b.appendChild(dayChips); b.appendChild(md); b.appendChild(partChips);
      b.appendChild(h('<div class="field"><label for="hi-note">Note</label><input class="input" id="hi-note" placeholder="optional"></div>')); b.querySelector('#hi-note').value = it.note || '';
      draw();
      const btns = h('<div class="btns">' + (isNew ? '' : '<button class="btn danger" type="button">Delete</button>') + '<button class="btn" type="button">Save</button></div>');
      const [del, sv] = isNew ? [null, btns.children[0]] : btns.children;
      sv.onclick = () => {
        const title = b.querySelector('#hi-title').value.trim(); if (!title) { ui.toast('Give it a name'); return; }
        const out = { id: it.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || U.uid(), title, area: b.querySelector('#hi-area').value.trim() || 'House', part };
        const t = b.querySelector('#hi-time').value; if (t) out.time = t;
        if (mode === 'days') { if (!days.length) { ui.toast('Pick at least one day'); return; } out.days = U.DAYS.filter(d => days.includes(d)); }
        if (mode === 'month') { const n = parseInt(b.querySelector('#hi-md').value, 10); if (!(n >= 1 && n <= 28)) { ui.toast('Pick a day from 1 to 28'); return; } out.monthDay = n; }
        const note = b.querySelector('#hi-note').value.trim(); if (note) out.note = note;
        if (isNew) { while (items().some(x => x.id === out.id)) out.id += '-2'; items().push(out); } else items()[idx] = out;
        Store.save(); api.close(); ui.toast('Saved'); Opus.refresh();
      };
      if (del) del.onclick = () => ui.ask({ title: 'Delete "' + it.title + '"?', yes: 'Delete', danger: true }).then(ok => { if (ok) { items().splice(idx, 1); Store.save(); api.close(); Opus.refresh(); } });
      b.appendChild(btns);
    } });
  }

  function render(v) {
    const d = new Date();
    v.appendChild(h('<div class="top"><div><div class="eyebrow">' + U.DAY_NAMES[d.getDay()] + '</div><div class="title">Home</div></div></div>'));

    const due = Plan.homeDue(d).sort((a, b) => (U.mins(a.time) ?? 2000) - (U.mins(b.time) ?? 2000));
    const now = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">Today</span><span class="c num"></span></div><div class="card"></div></div>');
    // pet care that is due today (or was done today) sits with the rest of today's jobs
    const petDue = Plan.itemsFor(d).filter(it => it.kind === 'pet');
    const cnt = () => { now.querySelector('.c').textContent = (due.filter(it => Plan.isChecked(d, 'home:' + it.id)).length + petDue.filter(it => Plan.isChecked(d, it.id)).length) + ' / ' + (due.length + petDue.length); };
    if (!due.length && !petDue.length) now.querySelector('.card').appendChild(h('<p class="empty">Nothing at home today.</p>'));
    due.forEach(it => {
      const id = 'home:' + it.id, on = Plan.isChecked(d, id);
      const r = h('<div class="row tap' + (on ? ' done' : '') + '"><span class="ck">' + ui.CK + '</span><span class="tx"><b>' + U.esc(it.title) + '</b>' + (it.note ? '<small>' + U.esc(it.note) + '</small>' : '') + '</span><span class="tm num">' + (it.time ? U.fmtTime(it.time) : '') + '</span></div>');
      r.onclick = () => { const n = !Plan.isChecked(d, id); Plan.setChecked(d, id, n); r.classList.toggle('done', n); ui.buzz(10); cnt(); };
      now.querySelector('.card').appendChild(r);
    });
    petDue.forEach(it => {
      const r = h('<div class="row tap' + (Plan.isChecked(d, it.id) ? ' done' : '') + '"><span class="ck">' + ui.CK + '</span><span class="tx"><b>' + U.esc(it.title) + '</b><small>' + U.esc(it.detail) + '</small></span><span class="tm num">' + (it.time ? U.fmtTime(it.time) : '') + '</span></div>');
      r.onclick = () => { const n = !Plan.isChecked(d, it.id); Plan.setChecked(d, it.id, n); ui.buzz(10); Opus.refresh(); };
      now.querySelector('.card').appendChild(r);
    });
    cnt(); v.appendChild(now);

    // coming up: anything that is not daily, over the next 7 days
    const up = h('<div class="sec"><div class="sh"><span class="r">II</span><span class="t">Coming up</span></div><div class="card"></div></div>');
    let any = false;
    for (let i = 1; i <= 7; i++) {
      const dd = U.addDays(d, i);
      const its = Plan.homeDue(dd).filter(it => it.monthDay || Array.isArray(it.days) || typeof it.days === 'string' && it.days !== 'all').map(it => it.title)
        .concat(Opus.pets ? Opus.pets.upcoming(dd) : []);
      if (!its.length) continue; any = true;
      up.querySelector('.card').appendChild(h('<div class="row"><span class="tag" style="min-width:44px">' + U.DAY_NAMES[dd.getDay()].slice(0, 3) + '</span><span class="tx"><b>' + its.map(t => U.esc(t)).join(' · ') + '</b></span></div>'));
    }
    if (!any) up.querySelector('.card').appendChild(h('<p class="empty">Only daily items this week.</p>'));
    v.appendChild(up);

    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    let n = 2;
    if (Opus.pets) Opus.pets.list().forEach(p => Opus.pets.section(v, ROMAN[n++], p));

    const all = items();
    const areas = {}; all.forEach((it, i) => (areas[it.area || 'House'] = areas[it.area || 'House'] || []).push([it, i]));
    const allSec = h('<div class="sec"><div class="sh"><span class="r">' + ROMAN[n] + '</span><span class="t">Everything</span><button class="c" type="button">+ Add</button></div></div>');
    allSec.querySelector('button').onclick = () => editItem(null);
    Object.keys(areas).sort().forEach(a => {
      const c = h('<div class="card" style="margin-top:6px"><div class="row" style="min-height:0;padding:10px 0 4px"><span class="tag">' + U.esc(a) + '</span></div></div>');
      areas[a].forEach(([it, i]) => { const r = h('<div class="row tap"><span class="tx"><b>' + U.esc(it.title) + '</b><small>' + U.esc(when(it)) + '</small></span>' + ui.icon('chev', 'chev ico') + '</div>'); r.onclick = () => editItem(i); c.appendChild(r); });
      allSec.appendChild(c);
    });
    if (!all.length) allSec.appendChild(h('<div class="card"><p class="empty">Add the jobs that keep the house running.</p></div>'));
    v.appendChild(allSec);
  }

  Opus.tab({ id: 'home', title: 'Home', icon: 'home', render });
})();
