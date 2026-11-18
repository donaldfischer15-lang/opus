/* Today tab: the arch, the one next thing, the day in three parts, the week (review + trends). */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;

  /* What opens when you tap an item with its own flow. */
  function openFlow(it, after) {
    const done = () => { after && after(); };
    switch (it.kind) {
      case 'workout': return Opus.train && Opus.train.start(it.workout.id);
      case 'writing': return writeSheet(done);
      case 'review': return reviewSheet(done);
      case 'money': return Opus.money && Opus.money.checkIn();
      case 'prep': return Opus.food && Opus.food.prepSheet();
      case 'weigh': return Opus.food && Opus.food.weighIn();
      default: return null;
    }
  }
  const FLOW = { workout: 'Start', writing: 'Write', review: 'Begin', money: 'Open', prep: 'Open', weigh: 'Log' };

  function updateArch(root, items, d) {
    const n = items.length, filled = items.filter(it => Plan.isChecked(d, it.id)).length;
    const hero = root.querySelector('.hero');
    hero.querySelector('.n').textContent = filled;
    const order = []; { let l = 0, r = n - 1; while (l <= r) { order.push(l++); if (l <= r) order.push(r--); } }
    const lit = new Set(order.slice(0, filled));
    hero.querySelectorAll('.st').forEach((s, i) => { s.style.opacity = lit.has(i) ? 1 : .13; s.style.filter = lit.has(i) ? 'drop-shadow(0 0 3px rgba(242,211,160,.5))' : ''; });
    hero.classList.toggle('complete', n > 0 && filled === n);
    hero.querySelector('.lede').textContent = n > 0 && filled === n ? 'Keystone set. The day is built.' : (Plan.p.profile || {}).motto || '';
    root.querySelectorAll('.sec[data-part]').forEach(sec => {
      const ids = items.filter(it => it.part === sec.dataset.part).map(it => it.id);
      sec.querySelector('.c').textContent = ids.filter(id => Plan.isChecked(d, id)).length + ' / ' + ids.length;
    });
  }

  function nextCard(root, items, d) {
    const nx = Plan.nextThing(d);
    const old = root.querySelector('.next');
    let kicker = 'Up next' + (nx.time ? ' · ' + U.fmtTime(nx.time) : '');
    if (nx.overdue) kicker = 'Up next · <span class="late">' + U.fmtTime(nx.time) + '</span>';
    const action = nx.kind === 'sleep' ? '' : (FLOW[nx.kind] || 'Done');
    const el = h('<div class="next"><div class="body"><div class="k">' + kicker + '</div><div class="h">' + U.esc(nx.title) + '</div>' +
      (nx.detail ? '<div class="s">' + U.esc(nx.detail) + '</div>' : '') + '</div>' +
      (action ? '<button class="btn" type="button">' + action + '</button>' : '') + '</div>');
    if (action) el.querySelector('.btn').onclick = () => {
      if (FLOW[nx.kind]) openFlow(nx, () => refreshInPlace(root));
      else { Plan.setChecked(d, nx.id, true); ui.buzz(10); refreshInPlace(root); }
    };
    if (old) old.replaceWith(el); else return el;
  }

  function refreshInPlace(root) {
    const d = new Date(), items = Plan.itemsFor(d);
    root.querySelectorAll('.row[data-id]').forEach(r => r.classList.toggle('done', Plan.isChecked(d, r.dataset.id)));
    updateArch(root, items, d); nextCard(root, items, d);
  }
  Opus.todayRefresh = () => { if (Opus.current() === 'today') { const v = document.getElementById('view'); if (v.querySelector('.hero')) refreshInPlace(v); } };

  function render(v) {
    const d = new Date(), p = Plan.p, items = Plan.itemsFor(d);
    const dateLine = U.DAY_NAMES[d.getDay()].toUpperCase() + ' · ' + U.roman(d.getDate()) + ' ' + U.MONTHS[d.getMonth()].toUpperCase();

    const top = h('<div class="top"><span style="width:40px"></span><div class="eyebrow">' + dateLine + '</div><button class="icon-btn" type="button" aria-label="Settings">' + ui.icon('gear') + '</button></div>');
    top.querySelector('button').onclick = () => Opus.openSettings();
    v.appendChild(top);

    const filled = items.filter(it => Plan.isChecked(d, it.id)).length;
    const hero = h('<div class="hero">' + ui.arch(items.length, filled) + '<div class="big"><div class="n num">' + filled + '</div><div class="l">OF ' + items.length + ' DONE</div></div><div class="lede"></div></div>');
    v.appendChild(hero);

    const rv = (Store.data.reviews || []).slice().sort((a, b) => b.weekOf.localeCompare(a.weekOf))[0];
    if (rv && rv.change && U.daysBetween(U.parseKey(rv.weekOf), d) < 8) v.appendChild(h('<div class="change-line">This week’s change: <b>' + U.esc(rv.change) + '</b></div>'));

    v.appendChild(nextCard(v, items, d));

    const numerals = { morning: 'I', workday: 'II', evening: 'III' };
    for (const part of Plan.PARTS) {
      const its = items.filter(it => it.part === part);
      if (!its.length) continue;
      const sec = h('<div class="sec" data-part="' + part + '"><div class="sh"><span class="r">' + numerals[part] + '</span><span class="t">' + Plan.partLabel(part, d) + '</span><span class="c num"></span></div><div class="card"></div></div>');
      const card = sec.querySelector('.card');
      for (const it of its) {
        const meal = it.kind === 'meal' && it.meal && Opus.food && Opus.food.eatSheet, flow = !!FLOW[it.kind] || meal;
        const ate = meal && Plan.isChecked(d, it.id) ? Opus.food.eatenLine(d, it) : null;
        const row = h('<div class="row tap' + (Plan.isChecked(d, it.id) ? ' done' : '') + (ate ? ' part' : '') + '" data-id="' + U.esc(it.id) + '" role="checkbox" aria-checked="' + Plan.isChecked(d, it.id) + '" tabindex="0">' +
          '<button class="ck" type="button" aria-label="Mark done">' + ui.CK + '</button>' +
          '<span class="tx"><b>' + U.esc(it.title) + '</b>' + (ate || it.detail ? '<small>' + U.esc(ate || it.detail) + '</small>' : '') + '</span>' +
          '<span class="tm num">' + (it.time ? U.fmtTime(it.time) : '') + '</span>' + (flow ? ui.icon('chev', 'chev ico') : '') + '</div>');
        const toggle = () => {
          const on = !Plan.isChecked(d, it.id); Plan.setChecked(d, it.id, on);
          row.setAttribute('aria-checked', on); ui.buzz(on ? 12 : 6); refreshInPlace(v);
        };
        row.querySelector('.ck').onclick = e => { e.stopPropagation(); toggle(); };
        row.onclick = () => (meal ? Opus.food.eatSheet(d, it) : flow ? openFlow(it, () => refreshInPlace(v)) : toggle());
        row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); } };
        card.appendChild(row);
      }
      v.appendChild(sec);
    }
    if (!items.length) v.appendChild(h('<div class="card pad empty"><div class="serif-h">A clear day</div>Nothing is planned for today. Add routine items in your plan file.</div>'));

    // the week
    const isRvDay = (p.review || {}).day === U.dayKey(d);
    const ws = U.key(U.weekStart(d));
    const thisRv = (Store.data.reviews || []).find(r => r.weekOf === ws);
    const week = h('<div class="sec"><div class="sh"><span class="r">IV</span><span class="t">The week</span></div><div class="card"></div></div>');
    const wc = week.querySelector('.card');
    const rvRow = h('<div class="row tap"><span class="tx"><b>Weekly review</b><small>' +
      (thisRv ? 'Done for this week. Tap to read or edit.' : isRvDay ? 'Today. Five minutes: what worked, what slipped, one change.' : 'Sunday. Five minutes: what worked, what slipped, one change.') +
      '</small></span>' + ui.icon('chev', 'chev ico') + '</div>');
    rvRow.onclick = () => reviewSheet(() => refreshInPlace(v));
    wc.appendChild(rvRow);
    const tr = trendsMini();
    const trRow = h('<div class="row tap" style="flex-direction:column;align-items:stretch;gap:10px"><div style="display:flex;align-items:center;gap:14px"><span class="tx"><b>Trends</b><small>Body weight, lifts and debt over time</small></span>' + ui.icon('chev', 'chev ico') + '</div>' + tr + '</div>');
    trRow.onclick = () => trendsSheet();
    wc.appendChild(trRow);
    v.appendChild(week);
    if (Opus.sync && Opus.sync.line()) {
      const sl = h('<p class="syncln" role="status"><i></i><span></span></p>');
      const paint = () => { sl.dataset.st = Opus.sync.status(); sl.querySelector('span').textContent = Opus.sync.line(); };
      paint(); Opus.sync.on(() => { if (sl.isConnected) paint(); });
      sl.onclick = () => Opus.openSettings();
      v.appendChild(sl);
    }

    updateArch(v, items, d);
  }

  /* ---------- trends ---------- */
  function weightPts() { return (Store.data.weights || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map(w => ({ date: w.date, v: w.lb })); }
  function rolling(pts, days) {
    return pts.map(p => { const t = U.parseKey(p.date); const win = pts.filter(q => { const dd = U.daysBetween(U.parseKey(q.date), t); return dd >= 0 && dd < days; }); return { date: p.date, v: U.avg(win.map(q => q.v)) }; });
  }
  function trendsMini() {
    const w = weightPts();
    const lifts = Opus.training.mainLifts(); const lt = lifts.length ? Opus.training.trend(lifts[0]) : [];
    const debt = Opus.money ? Opus.money.debtHistory() : [];
    const cell = (k, v, pts) => '<div class="sp"><span class="k">' + k + '</span><span class="v">' + v + '</span>' + ui.spark(pts) + '</div>';
    const lname = lifts.length ? Plan.exercise(lifts[0]).name.replace(/^(Back|DB) /, '') : 'Lift';
    return '<div class="spark3">' +
      cell('Weight', w.length ? U.wt(w[w.length - 1].v) : '—', w.slice(-30)) +
      cell(lname, lt.length ? U.wt(lt[lt.length - 1].top.weight) + '×' + lt[lt.length - 1].top.reps : '—', lt.slice(-20)) +
      cell('Debt', debt.length ? U.money(debt[debt.length - 1].v) : '—', debt.slice(-20)) + '</div>';
  }
  function trendsSheet() {
    ui.sheet({
      title: 'Trends', kicker: 'Over time', full: true,
      render(api) {
        const b = api.body;
        const w = weightPts(); const goal = (Plan.p.food || {}).goal || {};
        const s1 = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">Body weight</span><span class="c num"></span></div><div class="card pad"></div></div>');
        if (w.length >= 2) {
          const first = w[0], last = w[w.length - 1];
          const wk = Math.max(1, U.daysBetween(U.parseKey(first.date), U.parseKey(last.date)) / 7);
          const avg = rolling(w, 7);
          s1.querySelector('.c').textContent = U.wt(last.v - first.v) + ' lb · ' + U.num((last.v - first.v) / wk, 1) + '/wk';
          s1.querySelector('.card').appendChild(ui.chart(w, { target: goal.target, avg, fmt: v => U.wt(v) }));
          s1.querySelector('.card').appendChild(h('<p class="small">Dashed line: 7-day average, which smooths out water weight.' + (goal.target ? ' Goal ' + goal.target + ' lb.' : '') + '</p>'));
        } else s1.querySelector('.card').appendChild(h('<p class="empty">Log a few weigh-ins and the trend appears here.</p>'));
        b.appendChild(s1);

        const s2 = h('<div class="sec"><div class="sh"><span class="r">II</span><span class="t">Lifts</span><span class="c">best set, as est. 1-rep max</span></div><div class="card pad" style="display:flex;flex-direction:column;gap:18px"></div></div>');
        const lifts = Opus.training.mainLifts(); let any = false;
        for (const ex of lifts) {
          const pts = Opus.training.trend(ex).map(p => ({ date: p.date, v: p.v, note: U.wt(p.top.weight) + ' × ' + p.top.reps }));
          if (!pts.length) continue; any = true;
          const box = h('<div style="display:flex;flex-direction:column;gap:6px"><div class="trend th" style="flex-direction:row"><b>' + U.esc(Plan.exercise(ex).name) + '</b></div></div>');
          box.appendChild(ui.chart(pts, { h: 100, fmt: v => U.num(v, 0) }));
          s2.querySelector('.card').appendChild(box);
        }
        if (!any) s2.querySelector('.card').appendChild(h('<p class="empty">Finish a workout and your main lifts start charting.</p>'));
        b.appendChild(s2);

        const s3 = h('<div class="sec"><div class="sh"><span class="r">III</span><span class="t">Debt</span><span class="c">total of balances</span></div><div class="card pad"></div></div>');
        const dh = Opus.money ? Opus.money.debtHistory() : [];
        if (dh.length) s3.querySelector('.card').appendChild(ui.chart(dh, { fmt: v => U.money(v) }));
        else s3.querySelector('.card').appendChild(h('<p class="empty">Add your debt balances in Money. Each weekly check-in adds a point.</p>'));
        b.appendChild(s3);

        const s4 = h('<div class="sec"><div class="sh"><span class="r">IV</span><span class="t">Days</span><span class="c">share of the day done</span></div><div class="card pad"></div></div>');
        const pts = []; const firstKey = Object.keys(Store.data.checks).filter(k => (Store.data.checks[k] || []).length).sort()[0];
        for (let i = 27; i >= 0; i--) {
          const dd = U.addDays(new Date(), -i); const its = Plan.itemsFor(dd); if (!its.length) continue;
          if (!firstKey || U.key(dd) < firstKey) continue;
          const ck = Plan.checked(dd);
          pts.push({ date: U.key(dd), v: Math.round(its.filter(it => ck.includes(it.id)).length / its.length * 100) });
        }
        s4.querySelector('.card').appendChild(ui.chart(pts, { h: 100, fmt: v => U.num(v, 0) + '%' }));
        b.appendChild(s4);
      }
    });
  }

  /* ---------- weekly review ---------- */
  function weekStats(ws) {
    const days = []; for (let i = 0; i < 7; i++) days.push(U.addDays(ws, i));
    const today = U.key(); let total = 0, done = 0; const missed = {};
    for (const d of days) {
      if (U.key(d) > today) continue;
      for (const it of Plan.itemsFor(d)) {
        total++; if (Plan.isChecked(d, it.id)) done++;
        else { const k = it.kind === 'meal' ? it.title.split(':')[0] : it.title; missed[k] = (missed[k] || 0) + 1; }
      }
    }
    const planned = days.filter(d => Plan.workoutFor(d)).length;
    const wk = Store.data.workouts.filter(w => days.some(d => U.key(d) === w.date)).length;
    const top = Object.entries(missed).sort((a, b) => b[1] - a[1])[0];
    const ww = (Store.data.weights || []).filter(w => w.date >= U.key(ws) && w.date <= U.key(days[6])).sort((a, b) => a.date.localeCompare(b.date));
    const prevW = (Store.data.weights || []).filter(w => w.date < U.key(ws)).sort((a, b) => a.date.localeCompare(b.date)).pop();
    return { pct: total ? Math.round(done / total * 100) : null, planned, wk, missed: top, weight: ww.length ? ww[ww.length - 1].lb : null, prevW: prevW ? prevW.lb : null };
  }
  function reviewSheet(after) {
    const ws = U.weekStart(new Date()), wsk = U.key(ws);
    const qs = (Plan.p.review || {}).questions || ['What worked?', 'What slipped?', 'One change for next week'];
    const prev = (Store.data.reviews || []).filter(r => r.weekOf < wsk).sort((a, b) => b.weekOf.localeCompare(a.weekOf))[0];
    ui.sheet({
      title: 'Weekly review', kicker: 'Week of ' + U.fmtDateShort(ws), foot: true,
      render(api) {
        const b = api.body, st = weekStats(ws);
        const cur = (Store.data.reviews || []).find(r => r.weekOf === wsk) || {};
        b.appendChild(h('<div class="stats"><div class="stat"><span class="v">' + (st.pct == null ? '—' : st.pct + '%') + '</span><span class="k">Day done</span></div>' +
          '<div class="stat"><span class="v">' + st.wk + '/' + st.planned + '</span><span class="k">Workouts</span></div>' +
          '<div class="stat"><span class="v">' + (st.weight == null ? '—' : U.wt(st.weight)) + '</span><span class="k">Weight' + (st.weight != null && st.prevW != null ? ' ' + (st.weight - st.prevW >= 0 ? '+' : '') + U.wt(st.weight - st.prevW) : '') + '</span></div></div>'));
        if (st.missed && st.missed[1] >= 2) b.appendChild(h('<div class="banner gold">Slipped most: <b>' + U.esc(st.missed[0]) + '</b>, ' + st.missed[1] + ' times this week.</div>'));
        if (prev && prev.change) b.appendChild(h('<p class="note">Last week’s change was <b style="color:var(--gold-2);font-weight:500">' + U.esc(prev.change) + '</b>. Did it stick?</p>'));
        const keys = ['worked', 'slipped', 'change'];
        const fields = keys.map((k, i) => {
          const f = h('<div class="field"><label for="rv-' + k + '">' + U.esc(qs[i] || k) + '</label><textarea id="rv-' + k + '" class="input" rows="' + (k === 'change' ? 2 : 3) + '" style="min-height:' + (k === 'change' ? 64 : 88) + 'px"></textarea></div>');
          f.querySelector('textarea').value = cur[k] || (k === 'slipped' && st.missed && !cur[k] ? '' : '');
          b.appendChild(f); return f.querySelector('textarea');
        });
        const save = h('<button class="btn block" type="button">Save review</button>');
        save.onclick = () => {
          const r = { weekOf: wsk, worked: fields[0].value.trim(), slipped: fields[1].value.trim(), change: fields[2].value.trim(), saved: new Date().toISOString() };
          Store.data.reviews = (Store.data.reviews || []).filter(x => x.weekOf !== wsk).concat([r]);
          if ((Plan.p.review || {}).day) { const d = new Date(); if (U.dayKey(d) === Plan.p.review.day) Plan.setChecked(d, 'weekly-review', true); }
          Store.save(); api.close(); ui.toast('Review saved'); after && after();
          const lb = Store.data.settings.lastBackup;
          if (!lb || U.daysBetween(new Date(lb), new Date()) >= 7) setTimeout(() => ui.toast('Last backup was ' + (lb ? U.daysBetween(new Date(lb), new Date()) + ' days ago' : 'never'), { label: 'Back up', run: () => Opus.backupNow() }), 2800);
        };
        api.foot.appendChild(save);
        const past = (Store.data.reviews || []).filter(r => r.weekOf !== wsk).sort((a, b) => b.weekOf.localeCompare(a.weekOf)).slice(0, 6);
        if (past.length) {
          const s = h('<details class="fold"><summary class="sh"><span class="t">Earlier reviews</span><span class="c">' + past.length + '</span></summary><div class="card" style="margin-top:8px"></div></details>');
          past.forEach(r => s.querySelector('.card').appendChild(h('<div class="row"><span class="tx"><b>Week of ' + U.fmtDateShort(r.weekOf) + '</b><small>' + U.esc([r.worked && 'Worked: ' + r.worked, r.slipped && 'Slipped: ' + r.slipped, r.change && 'Change: ' + r.change].filter(Boolean).join(' · ')) + '</small></span></div>')));
          b.appendChild(s);
        }
      }
    });
  }

  /* ---------- writing practice ---------- */
  function countSentences(t) { const m = String(t).trim().match(/[^.!?]+[.!?]+(\s|$)/g); return m ? m.length : 0; }
  /* opts (from Growth): { prompt, kind: 'lesson', title, kicker } — a lesson answer is kept beside the day's writing, not over it */
  function writeSheet(after, opts) {
    opts = opts || {};
    const wr = ((Plan.p.mind || {}).writing) || {}; const need = wr.sentences || 5;
    const kind = opts.kind || '';
    const prompts = opts.prompt ? [opts.prompt] : (Opus.growth && Opus.growth.prompts().length ? Opus.growth.prompts() : (wr.prompts || []));
    const dayNum = Math.floor(U.parseKey(U.key()).getTime() / 864e5);
    let pi = prompts.length ? dayNum % prompts.length : 0;
    const today = U.key();
    if (!opts.prompt && Opus.growth && Opus.growth.todayPrompt()) pi = 0; // Cassius set today's prompt: it comes first
    const same = w => w.date === today && (w.kind || '') === kind;
    const existing = (Store.data.writing || []).find(same);
    if (!opts.prompt && existing && existing.prompt && prompts.includes(existing.prompt)) pi = prompts.indexOf(existing.prompt);
    ui.sheet({
      title: opts.title || 'Write', kicker: opts.kicker || wr.goal || 'Writing practice', foot: true,
      render(api) {
        const b = api.body;
        const pr = h('<div class="card pad" style="display:flex;gap:12px;align-items:flex-start"><div style="flex:1"><div class="tag">' + (kind === 'lesson' ? 'Cassius asks' : 'Today’s prompt') + '</div><div class="serif-h" style="font-size:22px;margin-top:6px"></div></div><button class="mini" type="button" aria-label="Another prompt">' + ui.I.spark.replace(/^/, '<svg viewBox="0 0 24 24">') + '</svg></button></div>');
        const setP = () => { pr.querySelector('.serif-h').textContent = prompts[pi] || 'Write about anything from today.'; };
        if (prompts.length < 2) pr.querySelector('button').hidden = true;
        setP(); pr.querySelector('button').onclick = () => { pi = (pi + 1) % Math.max(1, prompts.length); setP(); };
        b.appendChild(pr);
        const ta = h('<textarea class="input" id="write-text" style="min-height:40vh;font-family:var(--serif);font-size:19px;line-height:1.5" placeholder="Start with one plain sentence."></textarea>');
        ta.value = existing ? existing.text : '';
        b.appendChild(ta);
        const cnt = h('<div class="small num"></div>'); b.appendChild(cnt);
        b.appendChild(h('<p class="note">Clear writing: one idea per sentence, the point first, plain words. Read it once out loud before you save.</p>'));
        const save = h('<button class="btn block" type="button">Save</button>');
        const upd = () => { const n = countSentences(ta.value), w = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0; cnt.textContent = n + ' of ' + need + ' sentences · ' + w + ' words'; cnt.style.color = n >= need ? 'var(--gold-2)' : ''; };
        ta.addEventListener('input', upd); upd();
        save.onclick = () => {
          const text = ta.value.trim(); if (!text) { api.close(); return; }
          const entry = { date: today, text, words: text.split(/\s+/).length, sentences: countSentences(text), prompt: prompts[pi] || '' };
          if (kind) entry.kind = kind;
          Store.data.writing = (Store.data.writing || []).filter(w => !same(w)).concat([entry]);
          if (entry.sentences >= need && Plan.kindId('writing')) Plan.setChecked(new Date(), Plan.kindId('writing'), true);
          Store.save(); api.close(); ui.toast(entry.sentences >= need ? 'Saved. Writing is done for today.' : 'Saved. ' + (need - entry.sentences) + ' more sentences to finish.'); after && after();
        };
        api.foot.appendChild(save);
      }
    });
  }

  Opus.today = { reviewSheet, writeSheet, trendsSheet, openFlow };
  Opus.tab({ id: 'today', title: 'Today', icon: 'today', render });
})();
