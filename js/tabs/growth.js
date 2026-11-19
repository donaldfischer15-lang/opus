/* Growth tab: Cassius's page. Words for the day at the top, then the lesson, his notes, writing, the ledger, recall, the creed of the day, reading and subjects.
   Cassius writes growth.json (through the Opus helper). The phone only reads it; what you do here goes in the logs. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;

  const G = () => Store.data.growth || ((Plan.p && Plan.p.name === 'Example plan') || window.OPUS_PREVIEW ? window.OPUS_EXAMPLE_GROWTH : null) || null;
  const today = () => U.key();
  const arr = x => (Array.isArray(x) ? x : []);
  const words = t => (String(t || '').trim() ? String(t).trim().split(/\s+/).length : 0);
  const ago = k => { const n = U.daysBetween(U.parseKey(k), new Date()); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 7 ? U.DAY_NAMES[U.parseKey(k).getDay()] : U.fmtDateShort(k); };
  const LESSON_ID = 'growth-lesson';

  /* Cassius may write a little markdown: paragraphs, "- " lists, "> " quotes, **bold**, *italic* */
  function prose(text) {
    const inline = s => U.esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
    return String(text || '').trim().split(/\n\s*\n/).map(block => {
      const lines = block.split('\n');
      if (lines.every(l => /^\s*[-•]\s+/.test(l))) return '<ul>' + lines.map(l => '<li>' + inline(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') + '</ul>';
      if (lines.every(l => /^\s*>\s?/.test(l))) return '<blockquote>' + inline(lines.map(l => l.replace(/^\s*>\s?/, '')).join(' ')) + '</blockquote>';
      if (/^#{1,3}\s/.test(lines[0]) && lines.length === 1) return '<h4>' + inline(lines[0].replace(/^#+\s/, '')) + '</h4>';
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  }
  const readMins = l => (l && l.minutes) || Math.max(1, Math.round(words(l && l.body) / 200));

  /* ---------- what the rest of Opus asks of Growth ---------- */
  function todayPrompt() { const g = G(); return g && g.prompt && g.prompt.text && g.prompt.date === today() ? g.prompt.text : null; }
  function prompts() {
    const g = G(); if (!g) return [];
    const list = arr(g.prompts).map(p => (typeof p === 'string' ? p : p && p.text)).filter(Boolean);
    const t = todayPrompt();
    return t ? [t].concat(list.filter(x => x !== t)) : list;
  }
  const learned = l => !!(l && l.date && (Store.data.checks[l.date] || []).includes(LESSON_ID));
  const answerOf = l => l && l.question ? arr(Store.data.writing).filter(w => w.kind === 'lesson' && w.prompt === l.question).sort((a, b) => b.date.localeCompare(a.date))[0] : null;
  const pageOf = id => arr(Store.data.reading).find(r => r.id === id) || null;

  /* ---------- sheets ---------- */
  function lessonSheet(l, after) {
    ui.sheet({
      title: l.title || 'Lesson', kicker: [l.subject, ago(l.date) === 'today' ? null : ago(l.date), readMins(l) + ' min'].filter(Boolean).join(' · '), foot: !!l.question,
      render(api) {
        const b = api.body;
        b.appendChild(h('<div class="g-prose">' + (prose(l.body) || '<p class="note">Cassius left a title but no lesson yet.</p>') + '</div>'));
        if (l.takeaway) b.appendChild(h('<div class="g-take"><div class="tag">Take with you</div><div>' + U.esc(l.takeaway) + '</div></div>'));
        if (l.question) {
          const ans = answerOf(l);
          b.appendChild(h('<div class="card pad g-ask"><div class="tag">Cassius asks</div><div class="serif-h">' + U.esc(l.question) + '</div>' +
            (ans ? '<div class="small" style="margin-top:8px">You answered ' + ago(ans.date) + ' · ' + ans.words + ' words</div>' : '') + '</div>'));
          const an = lessonNote(l, ans); if (an) b.appendChild(noteBox(an, ans ? 'Cassius on your answer' : 'Cassius on this lesson'));
          const btns = h('<div class="btns"><button class="btn quiet" type="button"></button><button class="btn" type="button">' + (ans ? 'Read or edit your answer' : 'Answer in writing') + '</button></div>');
          const [lb, wb] = btns.children;
          const drawL = () => { lb.textContent = learned(l) ? 'Learned ✓' : 'I learned it'; };
          drawL();
          lb.onclick = () => { const on = !learned(l); Plan.setChecked(U.parseKey(l.date), LESSON_ID, on); ui.buzz(10); drawL(); if (on) ui.toast('Marked as learned. Cassius will see it.'); after && after(); };
          wb.onclick = () => { api.close(true); Opus.today.writeSheet(after, { prompt: l.question, kind: 'lesson', title: 'Answer', kicker: l.title || 'Cassius asks' }); };
          api.foot.appendChild(btns);
        }
      }
    });
  }

  function pastLessons() {
    const g = G(), list = arr(g && g.lessons).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    ui.sheet({ title: 'Past lessons', kicker: list.length + ' from Cassius', render(api) {
      const b = api.body;
      if (!list.length) { b.appendChild(h('<p class="empty">Lessons collect here once Cassius has taught a few.</p>')); return; }
      const subs = [...new Set(list.map(l => l.subject).filter(Boolean))];
      let pick = null;
      const chips = h('<div class="chips" style="margin-bottom:10px"></div>');
      const card = h('<div class="card"></div>');
      const draw = () => {
        chips.innerHTML = ['All'].concat(subs).map(s => '<button class="chip' + ((s === 'All' ? !pick : s === pick) ? ' on' : '') + '" type="button">' + U.esc(s) + '</button>').join('');
        chips.querySelectorAll('.chip').forEach((c, i) => c.onclick = () => { pick = i ? subs[i - 1] : null; draw(); });
        card.innerHTML = '';
        list.filter(l => !pick || l.subject === pick).forEach(l => {
          const r = h('<div class="row tap"><span class="tx"><b>' + U.esc(l.title || 'Lesson') + '</b>' + (l.takeaway ? '<span class="g-tk">' + U.esc(l.takeaway) + '</span>' : '') + '<small>' + U.esc([U.fmtDateShort(l.date), l.subject].filter(Boolean).join(' · ')) + (learned(l) ? ' · learned' : '') + '</small></span>' + ui.icon('chev', 'chev ico') + '</div>');
          r.onclick = () => lessonSheet(l); card.appendChild(r);
        });
      };
      if (subs.length > 1) b.appendChild(chips);
      b.appendChild(card); draw();
    } });
  }

  function pastWriting() {
    const list = arr(Store.data.writing).slice().sort((a, b) => b.date.localeCompare(a.date) || (a.kind ? 1 : -1));
    ui.sheet({ title: 'Your writing', kicker: list.length + ' pieces · ' + U.sum(list.map(w => w.words)) + ' words', render(api) {
      const b = api.body;
      if (!list.length) { b.appendChild(h('<p class="empty">What you write lands here, newest first.</p>')); return; }
      const card = h('<div class="card"></div>');
      list.forEach(w => {
        const r = h('<div class="row tap"><span class="tx"><b>' + U.esc(w.prompt || 'Free writing') + '</b><small>' + U.esc(U.fmtDateShort(w.date) + (w.kind === 'lesson' ? ' · lesson answer' : w.kind === 'recall' ? ' · from memory' : '') + ' · ' + w.words + ' words') + '</small></span>' + ui.icon('chev', 'chev ico') + '</div>');
        r.onclick = () => ui.sheet({ title: U.fmtDateShort(w.date), kicker: w.kind === 'lesson' ? 'Lesson answer' : w.kind === 'recall' ? 'Recall' : 'Writing', render(a2) {
          a2.body.appendChild(h('<div class="card pad"><div class="tag">' + (w.kind === 'lesson' || w.kind === 'recall' ? 'Cassius asked' : 'Prompt') + '</div><div class="serif-h" style="font-size:20px;margin-top:6px">' + U.esc(w.prompt || 'Free writing') + '</div></div>'));
          a2.body.appendChild(h('<div class="g-prose g-mine">' + prose(w.text) + '</div>'));
          const n = noteOn(w); if (n) a2.body.appendChild(h('<div class="g-take"><div class="tag">Cassius on this</div><div>' + U.esc(n.text) + '</div></div>'));
        } });
        card.appendChild(r);
      });
      b.appendChild(card);
    } });
  }
  /* a note from Cassius about a piece of writing: on "writing:DATE" (or "lesson:DATE" for an answer) */
  function noteOn(w) {
    const g = G(); if (!g) return null;
    const want = (w.kind === 'lesson' ? 'lesson:' : w.kind === 'recall' ? 'recall:' : 'writing:') + w.date;
    return arr(g.notes).filter(n => n.on === want || (!w.kind && n.on === 'writing' && n.date >= w.date)).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  }

  const noteFor = key => arr((G() || {}).notes).filter(n => n && n.text && n.on === key).sort((a, b) => b.date.localeCompare(a.date))[0] || null;

  function bookSheet(bk) {
    const pg = pageOf(bk.id);
    ui.sheet({ title: bk.title, kicker: bk.author || 'Reading', render(api) {
      const b = api.body;
      if (bk.why) b.appendChild(h('<div class="g-take" style="margin-top:0"><div class="tag">Why Cassius chose it</div><div>' + U.esc(bk.why) + '</div></div>'));
      b.appendChild(h('<div class="field"><label>Page you’re on</label></div>'));
      const st = ui.stepper({ label: 'Page', value: pg ? pg.page : null, placeholder: '0', unit: bk.pages ? 'of ' + bk.pages : 'pages', step: (v, dir) => Math.max(0, (v || 0) + dir * 10) });
      b.lastChild.appendChild(st.el);
      b.appendChild(h('<p class="note">The buttons move ten pages. Type the page for an exact number.</p>'));
      const btns = h('<div class="btns"><button class="btn quiet" type="button">' + (pg && pg.done ? 'Not finished' : 'Finished it') + '</button><button class="btn" type="button">Save</button></div>');
      const [fin, sv] = btns.children;
      const put = (page, done) => {
        const rec = { id: bk.id, page: page == null ? null : Math.round(page), date: today() };
        if (done) rec.done = true;
        Store.data.reading = arr(Store.data.reading).filter(r => r.id !== bk.id).concat([rec]);
        Store.save(); api.close(); Opus.refresh();
      };
      sv.onclick = () => { const v = st.get(); put(bk.pages && v > bk.pages ? bk.pages : v, false); ui.toast('Page saved'); };
      fin.onclick = () => { if (pg && pg.done) { put(st.get(), false); return; } put(bk.pages || st.get(), true); ui.toast('Finished. Ask Cassius what’s next.'); };
      b.appendChild(btns);
    } });
  }

  function keepWords(e) {
    const kept = arr(Store.data.kept), at = kept.findIndex(k => k.text === e.text);
    if (at >= 0) { Store.data.kept = kept.filter((_, i) => i !== at); ui.toast('Taken out of kept words'); }
    else { Store.data.kept = kept.filter(k => k.date !== today()).concat([{ date: today(), text: e.text, from: e.from || null }]); ui.toast('Kept. Cassius will see what lands with you.'); }
    Store.save(); ui.buzz(10);
  }
  function keptSheet() {
    const list = arr(Store.data.kept).slice().sort((a, b) => b.date.localeCompare(a.date));
    ui.sheet({ title: 'Words you kept', kicker: list.length ? list.length + ' kept' : 'Kept words', render(api) {
      if (!list.length) { api.body.appendChild(h('<p class="empty">Tap the laurel under the words at the top of Growth to keep the ones that land.</p>')); return; }
      list.forEach(k => api.body.appendChild(h('<div class="g-kept"><div class="q">' + U.esc(k.text) + '</div><div class="small">' + U.esc((k.from ? k.from + ' · ' : '') + U.fmtDateShort(k.date)) + '</div></div>')));
    } });
  }

  /* ---------- the page ---------- */
  function energy(g) {
    const e = g && g.energy;
    const has = e && e.text;
    const isToday = has && e.date === today();
    const el = h('<div class="g-energy' + (has ? '' : ' empty-e') + '">' +
      '<svg class="g-wreath" viewBox="0 0 24 24" aria-hidden="true">' + ui.I.laurel + '</svg>' +
      (has ? '<blockquote class="g-words"></blockquote><div class="g-from"></div>' :
        '<div class="g-words wait">Today’s words come from Cassius.</div><div class="g-from">Ask him for something to carry into the day.</div>') +
      '<div class="g-acts"></div></div>');
    const acts = el.querySelector('.g-acts');
    if (has) {
      el.querySelector('.g-words').textContent = e.text;
      el.querySelector('.g-from').textContent = (e.from ? '— ' + e.from : '— Cassius') + (isToday ? '' : '  ·  from ' + ago(e.date));
      const kept = arr(Store.data.kept).some(k => k.text === e.text);
      const kb = h('<button class="g-act' + (kept ? ' on' : '') + '" type="button"><svg viewBox="0 0 24 24" aria-hidden="true">' + ui.I.laurel + '</svg><span>' + (kept ? 'Kept' : 'Keep') + '</span></button>');
      kb.onclick = () => { keepWords(e); const on = arr(Store.data.kept).some(k => k.text === e.text); kb.classList.toggle('on', on); kb.querySelector('span').textContent = on ? 'Kept' : 'Keep'; };
      acts.appendChild(kb);
    }
    if (!isToday) {
      const ab = h('<button class="g-act" type="button">' + ui.icon('spark') + '<span>Copy ask</span></button>');
      ab.onclick = () => ui.copy('Cassius, put today’s words at the top of my Growth page in Opus.');
      acts.appendChild(ab);
    }
    if (arr(Store.data.kept).length) { const kl = h('<button class="g-act" type="button"><span>' + arr(Store.data.kept).length + ' kept</span></button>'); kl.onclick = keptSheet; acts.appendChild(kl); }
    return el;
  }

  function sec(num, title, right) {
    return h('<div class="sec"><div class="sh"><span class="r">' + num + '</span><span class="t">' + U.esc(title) + '</span>' + (right || '') + '</div></div>');
  }

  function lessonCard(g, num) {
    const l = g && g.lesson;
    const s = sec(num, 'Today’s lesson', arr(g && g.lessons).length ? '<button class="c" type="button">Past</button>' : '');
    const past = s.querySelector('button.c'); if (past) past.onclick = pastLessons;
    if (!l || !l.title) {
      s.appendChild(h('<div class="card pad"><p class="empty" style="padding:6px 0"><span class="serif-h">No lesson yet.</span><br>Cassius sets one here each day.</p></div>'));
      return s;
    }
    const old = l.date !== today(), done = learned(l), ans = answerOf(l);
    const first = (String(l.body || '').trim().split(/\n\s*\n/)[0] || '').replace(/[*>#-]/g, '').trim();
    const c = h('<div class="card pad g-lesson tap' + (done ? ' done' : '') + '">' +
      '<div class="g-meta"><span class="tag">' + U.esc(l.subject || 'Lesson') + '</span><span class="small num">' + readMins(l) + ' min' + (old ? ' · ' + ago(l.date) : '') + '</span></div>' +
      '<div class="serif-h" style="margin-top:6px"></div>' +
      (first ? '<p class="g-first"></p>' : '') +
      (l.question ? '<div class="g-q"><span class="tag">Cassius asks</span><div></div></div>' : '') +
      '<div class="g-state small"></div></div>');
    c.querySelector('.serif-h').textContent = l.title;
    if (first) c.querySelector('.g-first').textContent = first;
    if (l.question) c.querySelector('.g-q div').textContent = l.question;
    c.querySelector('.g-state').textContent = [done ? 'Learned' : null, ans ? 'Answered · ' + ans.words + ' words' : null].filter(Boolean).join(' · ') || 'Tap to read';
    const ln = lessonNote(l, ans); if (ln) c.appendChild(noteBox(ln, (ans ? 'Cassius on your answer' : 'Cassius on this lesson') + ' · ' + ago(ln.date)));
    c.onclick = () => lessonSheet(l, () => Opus.refresh());
    s.appendChild(c);
    return s;
  }

  function writingCard(g, num) {
    const s = sec(num, 'Writing', arr(Store.data.writing).length ? '<button class="c" type="button">All</button>' : '');
    const all = s.querySelector('button.c'); if (all) all.onclick = pastWriting;
    const ps = prompts(), wr = ((Plan.p.mind || {}).writing) || {};
    const list = ps.length ? ps : arr(wr.prompts);
    const dayNum = Math.floor(U.parseKey(today()).getTime() / 864e5);
    const tp = todayPrompt() || (list.length ? list[dayNum % list.length] : null);
    const mine = arr(Store.data.writing).find(w => w.date === today() && !w.kind);
    const c = h('<div class="card pad"><div class="tag">' + (todayPrompt() ? 'Cassius’s prompt for today' : 'Today’s prompt') + '</div><div class="serif-h" style="font-size:22px;margin-top:6px"></div>' +
      '<div class="g-row"><span class="small"></span><button class="btn" type="button"></button></div></div>');
    c.querySelector('.serif-h').textContent = tp || 'Write about anything from today.';
    c.querySelector('.g-row .small').textContent = mine ? 'Written today · ' + mine.words + ' words' : (wr.sentences || 5) + ' sentences';
    c.querySelector('.btn').textContent = mine ? 'Open' : 'Write';
    c.querySelector('.btn').onclick = () => Opus.today.writeSheet(() => Opus.refresh());
    s.appendChild(c);

    // the week, as a quiet trend (no streaks)
    const days = []; for (let i = 6; i >= 0; i--) days.push(U.addDays(new Date(), -i));
    const per = days.map(d => U.sum(arr(Store.data.writing).filter(w => w.date === U.key(d)).map(w => w.words)));
    const total = U.sum(per), wrote = per.filter(n => n > 0).length, max = Math.max(1, ...per);
    if (arr(Store.data.writing).length) {
      const bars = days.map((d, i) => {
        const hgt = per[i] ? Math.max(4, Math.round(per[i] / max * 34)) : 2;
        return '<div class="g-day' + (i === 6 ? ' now' : '') + '"><div class="g-b"><i style="height:' + hgt + 'px' + (per[i] ? '' : ';opacity:.35') + '"></i></div><span>' + U.DAY_NAMES[d.getDay()][0] + '</span></div>';
      }).join('');
      const wk = h('<div class="card pad g-week"><div class="g-bars" role="img" aria-label="Words written each day this week"></div><div class="g-wk"><b class="num"></b><span class="small"></span></div></div>');
      wk.querySelector('.g-bars').innerHTML = bars;
      wk.querySelector('b').textContent = total.toLocaleString();
      wk.querySelector('.small').textContent = 'words this week · wrote on ' + wrote + ' of 7 days';
      s.appendChild(wk);
    }
    // Cassius's latest word on your writing
    // (notes on today's lesson answer and on the recall answer sit in those cards)
    const elsewhere = w => (w.kind === 'lesson' && g && g.lesson && w.prompt === g.lesson.question) || (w.kind === 'recall' && g && g.recall && w.prompt === g.recall.question);
    let last = null, n = null;
    for (const w of arr(Store.data.writing).filter(x => !elsewhere(x)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)) { const x = noteOn(w); if (x && (!n || x.date > n.date)) { n = x; last = w; } }
    if (n) c.appendChild(noteBox(n, 'Cassius on your ' + (last.kind === 'lesson' ? 'answer' : last.kind === 'recall' ? 'recall' : 'writing') + (last.date === today() ? '' : ' from ' + ago(last.date)) + ' · ' + ago(n.date)));
    return s;
  }

  /* the creed, one line a day: Cassius can pick the day's line with creed.today, otherwise the lines take turns in order */
  function creedIndex(g) {
    const lines = arr(g && g.creed && g.creed.lines).filter(Boolean), t = g && g.creed && g.creed.today;
    if (!lines.length) return -1;
    if (Number.isInteger(t) && t >= 0 && t < lines.length) return t;
    return Math.floor(U.parseKey(today()).getTime() / 864e5) % lines.length;
  }
  function creedCard(g, num) {
    const lines = arr(g && g.creed && g.creed.lines).filter(Boolean);
    const s = sec(num, 'Creed');
    if (!lines.length) { s.appendChild(h('<div class="card pad"><p class="empty" style="padding:6px 0">Your creed lives here.<br>Shape it with Cassius and he’ll set it in stone.</p></div>')); return s; }
    const i = creedIndex(g);
    const c = h('<div class="card pad g-creed g-cotd"><div class="g-meta"><span class="tag">Creed of the day</span><span class="small num"></span></div><div class="g-cline"></div>' +
      (lines.length > 1 ? '<div class="g-all" hidden></div><button class="link g-call" type="button" aria-expanded="false"></button>' : '') + '</div>');
    c.querySelector('.g-meta .small').textContent = U.roman(i + 1) + ' of ' + U.roman(lines.length);
    c.querySelector('.g-cline').textContent = lines[i];
    const btn = c.querySelector('.g-call');
    if (btn) {
      const all = c.querySelector('.g-all');
      lines.forEach((t, k) => { const r = h('<div class="g-cl' + (k === i ? ' now' : '') + '"><span class="n">' + U.roman(k + 1) + '</span><span class="t"></span></div>'); r.querySelector('.t').textContent = t; all.appendChild(r); });
      const draw = open => { all.hidden = !open; btn.setAttribute('aria-expanded', String(open)); btn.textContent = open ? 'Show today’s line only' : 'Read all ' + lines.length + ' lines'; };
      draw(false);
      btn.onclick = () => draw(all.hidden);
    }
    s.appendChild(c);
    return s;
  }

  /* ---------- the ledger: one virtue a week, after Franklin's book. Each night a box: clean, or a black dot for a fault ---------- */
  const monday = d => { d = d || new Date(); const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const marks = () => arr(Store.data.ledger);
  const markOn = k => marks().find(m => m.date === k) || null;
  function setMark(k, week, virtue, mark) {
    const dl = Store.data.deleted = Store.data.deleted || {}; dl.ledger = dl.ledger || {};
    Store.data.ledger = marks().filter(m => m.date !== k);
    if (mark) { Store.data.ledger.push({ week, virtue, date: k, mark, at: new Date().toISOString() }); delete dl.ledger[k]; }
    else dl.ledger[k] = new Date().toISOString();
    Store.save();
  }
  function ledgerCard(g, num) {
    const L = g && g.ledger, wk = monday(), wkKey = U.key(wk);
    const s = sec(num, 'The Ledger', marks().some(m => m.week !== wkKey) ? '<button class="c" type="button">Past</button>' : '');
    const past = s.querySelector('button.c'); if (past) past.onclick = ledgerPast;
    if (!L || !L.virtue) { s.appendChild(h('<div class="card pad"><p class="empty" style="padding:6px 0"><span class="serif-h">No virtue this week yet.</span><br>Cassius sets one each Monday. You mark each night.</p></div>')); return s; }
    const stale = L.week && L.week < wkKey;
    const c = h('<div class="card pad g-ledger"><div class="g-meta"><span class="tag">This week’s virtue</span><span class="small num"></span></div><div class="serif-h g-virtue"></div>' +
      (L.why ? '<p class="g-first g-why"></p>' : '') + '<div class="g-days" role="group" aria-label="This week, one box a night"></div><div class="g-lsum small"></div></div>');
    c.querySelector('.g-meta .small').textContent = stale ? 'Set ' + U.fmtDateShort(L.week) + ' · new one comes Monday' : 'Week of ' + U.fmtDateShort(wkKey);
    c.querySelector('.g-virtue').textContent = L.virtue;
    if (L.why) c.querySelector('.g-why').textContent = L.why;
    const box = c.querySelector('.g-days'), sum = c.querySelector('.g-lsum');
    const draw = () => {
      box.innerHTML = '';
      for (let i = 0; i < 7; i++) {
        const d = U.addDays(wk, i), k = U.key(d), m = markOn(k), future = k > today();
        const b = h('<button class="g-dbox' + (m ? ' ' + m.mark : '') + (k === today() ? ' now' : '') + '" type="button"' + (future ? ' disabled' : '') + '><span class="d">' + U.DAY_NAMES[d.getDay()].slice(0, 3) + '</span><span class="m" aria-hidden="true"></span></button>');
        b.setAttribute('aria-label', U.DAY_NAMES[d.getDay()] + ': ' + (m ? (m.mark === 'clean' ? 'clean' : 'a fault') : future ? 'not yet' : 'not marked'));
        b.onclick = () => { const cur = markOn(k), next = !cur ? 'clean' : cur.mark === 'clean' ? 'dot' : null; setMark(k, wkKey, L.virtue, next); ui.buzz(8); draw(); };
        box.appendChild(b);
      }
      const wm = marks().filter(m => m.week === wkKey), cl = wm.filter(m => m.mark === 'clean').length, dt = wm.filter(m => m.mark === 'dot').length;
      sum.textContent = wm.length ? cl + ' clean · ' + dt + (dt === 1 ? ' dot' : ' dots') + ' this week' : 'Each night: tap once for clean, twice for a fault, again to clear.';
    };
    draw();
    s.appendChild(c);
    return s;
  }
  function ledgerPast() {
    const by = {};
    marks().forEach(m => { const w = by[m.week] = by[m.week] || { week: m.week, virtue: m.virtue, clean: 0, dot: 0 }; w[m.mark === 'dot' ? 'dot' : 'clean']++; if (m.virtue) w.virtue = m.virtue; });
    const weeks = Object.values(by).sort((a, b) => b.week.localeCompare(a.week));
    const vs = {};
    weeks.forEach(w => { const name = w.virtue || 'Virtue', v = vs[name] = vs[name] || { virtue: name, weeks: 0, dot: 0, clean: 0 }; v.weeks++; v.dot += w.dot; v.clean += w.clean; });
    const virtues = Object.values(vs).sort((a, b) => b.dot - a.dot || a.virtue.localeCompare(b.virtue));
    ui.sheet({ title: 'The Ledger', kicker: weeks.length + (weeks.length === 1 ? ' week kept' : ' weeks kept'), render(api) {
      const b = api.body;
      if (!weeks.length) { b.appendChild(h('<p class="empty">Weeks collect here once you’ve marked a few nights.</p>')); return; }
      b.appendChild(h('<div class="sh"><span class="t">By virtue</span><span class="c">most dots first</span></div>'));
      const vc = h('<div class="card"></div>');
      virtues.forEach(v => {
        const r = h('<div class="row"><span class="tx"><b></b><small></small></span><span class="num g-dots"></span></div>');
        r.querySelector('b').textContent = v.virtue;
        r.querySelector('small').textContent = v.weeks + (v.weeks === 1 ? ' week' : ' weeks') + ' · ' + v.clean + ' clean';
        r.querySelector('.g-dots').textContent = v.dot + (v.dot === 1 ? ' dot' : ' dots');
        vc.appendChild(r);
      });
      b.appendChild(vc);
      b.appendChild(h('<div class="sh"><span class="t">Week by week</span></div>'));
      const wc = h('<div class="card"></div>');
      weeks.forEach(w => {
        const days = []; for (let i = 0; i < 7; i++) { const m = markOn(U.key(U.addDays(U.parseKey(w.week), i))); days.push('<i class="' + (m ? m.mark : '') + '"></i>'); }
        const r = h('<div class="row"><span class="tx"><b></b><small></small></span><span class="g-mini" aria-hidden="true">' + days.join('') + '</span></div>');
        r.querySelector('b').textContent = w.virtue || 'Virtue';
        r.querySelector('small').textContent = 'Week of ' + U.fmtDateShort(w.week) + ' · ' + w.clean + ' clean · ' + w.dot + (w.dot === 1 ? ' dot' : ' dots');
        wc.appendChild(r);
      });
      b.appendChild(wc);
    } });
  }

  /* ---------- recall: one question from a past lesson, answered from memory, then the lesson's takeaway to check against ---------- */
  function lessonByRef(g, ref) {
    const m = /^lesson:(\d{4}-\d{2}-\d{2})$/.exec(String(ref || '')); if (!m) return null;
    return arr(g && g.lessons).concat(g && g.lesson ? [g.lesson] : []).find(l => l && l.date === m[1]) || null;
  }
  const recallAnswer = r => r && r.question ? arr(Store.data.writing).filter(w => w.kind === 'recall' && w.prompt === r.question).sort((a, b) => b.date.localeCompare(a.date))[0] || null : null;
  function recallCard(g, num) {
    const r = g && g.recall;
    const s = sec(num, 'Recall');
    if (!r || !r.question) { s.appendChild(h('<div class="card pad"><p class="empty" style="padding:6px 0"><span class="serif-h">No question yet.</span><br>Cassius asks one here from a past lesson. You answer from memory, then check.</p></div>')); return s; }
    const src = lessonByRef(g, r.from), ans = recallAnswer(r);
    const c = h('<div class="card pad g-recall"><div class="g-meta"><span class="tag">From memory</span><span class="small"></span></div><div class="serif-h" style="margin-top:6px"></div><div class="g-rbody"></div></div>');
    c.querySelector('.g-meta .small').textContent = src ? (src.title || 'Lesson') + ' · ' + U.fmtDateShort(src.date) : '';
    c.querySelector('.serif-h').textContent = r.question;
    const body = c.querySelector('.g-rbody');
    const write = () => Opus.today.writeSheet(() => Opus.refresh(), { prompt: r.question, kind: 'recall', title: 'Recall', kicker: 'From memory', tag: 'Answer from memory', placeholder: 'Don’t look it up. Write what you remember.', free: true, saved: 'Saved. Now check it against the lesson.' });
    if (!ans) {
      const row = h('<div class="g-row"><span class="small">No peeking. Then check.</span><button class="btn" type="button">Answer</button></div>');
      row.querySelector('.btn').onclick = write; body.appendChild(row);
    } else {
      const mine = h('<div class="g-mine"><div class="tag">You wrote · ' + U.esc(ago(ans.date)) + ' · ' + ans.words + ' words</div><p></p></div>');
      mine.querySelector('p').textContent = ans.text.length > 240 ? ans.text.slice(0, 240).replace(/\s+\S*$/, '') + '…' : ans.text;
      body.appendChild(mine);
      if (src && src.takeaway) { const t = h('<div class="g-take"><div class="tag">The lesson said</div><div></div></div>'); t.lastChild.textContent = src.takeaway; body.appendChild(t); }
      const an = noteOn(ans); if (an) body.appendChild(noteBox(an, 'Cassius on your recall'));
      const btns = h('<div class="btns" style="margin-top:12px">' + (src ? '<button class="btn quiet" type="button">Read the lesson</button>' : '') + '<button class="btn ghost" type="button">Edit your answer</button></div>');
      const bs = btns.querySelectorAll('.btn');
      if (src) bs[0].onclick = () => lessonSheet(src, () => Opus.refresh());
      bs[bs.length - 1].onclick = write;
      body.appendChild(btns);
    }
    s.appendChild(c);
    return s;
  }

  /* a note from Cassius, set inside the card it is about. New ones carry a gold dot the first time you see them. */
  const noteKey = n => n.date + '|' + (n.on || '') + '|' + String(n.text || '').slice(0, 40);
  // a note stays marked new for the whole visit, so a sync or a save that redraws the page doesn't take the dot away before you've read it
  let unread = new Set();
  const clearUnread = () => { unread = new Set(); };
  window.addEventListener('hashchange', () => { if (!/growth/.test(location.hash)) clearUnread(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearUnread(); });
  function noteBox(n, label) {
    const el = h('<div class="g-take g-noteon"><div class="tag">' + (unread.has(noteKey(n)) ? '<i class="g-unread" aria-label="New"></i>' : '') + U.esc(label) + '</div><div></div></div>');
    el.lastChild.textContent = n.text; return el;
  }
  const lessonNote = (l, ans) => noteFor('lesson:' + l.date) || (ans && ans.date !== l.date ? noteOn(ans) : null);

  /* every book on Cassius's list shows: the one you're reading first, with your page and a bar once the page count is known */
  function readingCard(g, num) {
    const books = arr(g && g.reading).filter(b => b && b.title);
    const s = sec(num, 'Reading', books.length > 1 ? '<span class="c">' + books.length + ' books</span>' : '');
    if (!books.length) { s.appendChild(h('<div class="card pad"><p class="empty" style="padding:6px 0">Cassius’s reading list goes here.</p></div>')); return s; }
    const isDone = b => b.status === 'done' || !!(pageOf(b.id) || {}).done;
    const now = books.filter(b => b.status === 'reading' && !isDone(b)), next = books.filter(b => b.status === 'next' && !isDone(b)), done = books.filter(isDone);
    const other = books.filter(b => !now.includes(b) && !next.includes(b) && !done.includes(b));
    const c = h('<div class="card"></div>');
    now.forEach(b => {
      const pg = pageOf(b.id), page = pg && pg.page != null ? pg.page : null, pct = page != null && b.pages ? U.clamp(page / b.pages, 0, 1) : null;
      const r = h('<div class="row tap g-book"><span class="tag" style="min-width:44px">Now</span><span class="tx"><b></b><small></small>' +
        (pct != null ? '<span class="g-prog"><span class="bar"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></span><span class="small num">' + Math.round(pct * 100) + '%</span></span>' : '') + '</span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.querySelector('b').textContent = b.title;
      r.querySelector('small').textContent = [b.author, page != null ? 'page ' + page + (b.pages ? ' of ' + b.pages : '') : 'tap to log your page'].filter(Boolean).join(' · ');
      r.onclick = () => bookSheet(b); c.appendChild(r);
    });
    const plain = (b, tag) => {
      const r = h('<div class="row tap' + (tag === 'Done' ? ' g-done' : '') + '"><span class="tag" style="min-width:44px"></span><span class="tx"><b></b><small></small></span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.querySelector('.tag').textContent = tag; r.querySelector('b').textContent = b.title;
      const sm = [b.author, b.pages ? b.pages + ' pages' : null].filter(Boolean).join(' · ');
      if (sm) r.querySelector('small').textContent = sm; else r.querySelector('small').remove();
      r.onclick = () => bookSheet(b); c.appendChild(r);
    };
    next.forEach(b => plain(b, 'Next'));
    other.forEach(b => plain(b, 'Later'));
    done.forEach(b => plain(b, 'Done'));
    s.appendChild(c);
    return s;
  }

  function subjectsCard(g, num) {
    const subs = arr(g && g.subjects).filter(x => x && x.name);
    if (!subs.length) return null;
    const s = sec(num(), 'Subjects');
    const c = h('<div class="card"></div>');
    const lastBy = {}; arr(g.lessons).concat(g.lesson ? [g.lesson] : []).forEach(l => { if (l && l.subject && (!lastBy[l.subject] || l.date > lastBy[l.subject])) lastBy[l.subject] = l.date; });
    subs.forEach(x => {
      const lk = Object.keys(lastBy).find(k => k.toLowerCase() === x.name.toLowerCase() || k.toLowerCase() === String(x.id || '').toLowerCase());
      const r = h('<div class="row g-sub"><span class="tx"><b></b><small></small></span><span class="tm small"></span></div>');
      r.querySelector('b').textContent = x.name;
      r.querySelector('small').textContent = [x.now ? 'Now: ' + x.now : null, x.next ? 'Next: ' + x.next : null].filter(Boolean).join(' · ') || 'Cassius hasn’t started this one yet';
      r.querySelector('.tm').textContent = lk ? ago(lastBy[lk]) : '';
      c.appendChild(r);
    });
    s.appendChild(c);
    return s;
  }

  /* notes that aren't about one piece of writing: right under today's lesson */
  const generalNotes = g => arr(g && g.notes).filter(n => n && n.text && !/^(writing|lesson|recall):/.test(n.on || '') && n.on !== 'writing').sort((a, b) => b.date.localeCompare(a.date));
  function notesCard(g, num) {
    const notes = generalNotes(g);
    if (!notes.length) return null;
    const s = sec(num(), 'From Cassius', notes.length > 3 ? '<button class="c" type="button">All ' + notes.length + '</button>' : '');
    const c = h('<div class="card"></div>');
    const row = n => {
      const r = h('<div class="row g-note"><span class="tx"><b></b><small></small></span></div>');
      if (unread.has(noteKey(n))) r.insertBefore(h('<i class="g-unread" aria-label="New"></i>'), r.firstChild);
      r.querySelector('b').textContent = n.text; r.querySelector('small').textContent = U.fmtDateShort(n.date); return r;
    };
    notes.slice(0, 3).forEach(n => c.appendChild(row(n)));
    const more = s.querySelector('button.c');
    if (more) more.onclick = () => ui.sheet({ title: 'From Cassius', kicker: notes.length + ' notes', render(api) { const cc = h('<div class="card"></div>'); notes.forEach(n => cc.appendChild(row(n))); api.body.appendChild(cc); } });
    s.appendChild(c);
    return s;
  }

  function setupPrompt() {
    return [
      'You are Cassius, my teacher. You can now write to my Growth page in Opus, my phone app, through the "opus" connector.',
      '',
      'How it works:',
      '- read_opus_file with file "guide" explains everything. Read it first, then read "growth" to see what is on the page now.',
      '- update_growth saves to the Growth page. Send only the sections you are changing. It never touches my logs.',
      '- read_opus_file with file "logs" shows what I did: my writing (lesson answers marked "kind": "lesson", recall answers "kind": "recall"), my ledger marks ("ledger"), the lessons I marked as learned ("growth-lesson" in checks on that lesson’s date), my page in each book ("reading"), and the words I kept ("kept").',
      '',
      'When I ask you to fill my Growth page:',
      '- energy: one short piece of positive energy for today, motivational or just good. If it is a quote, put who said it in "from" and make sure it is real and worded right. If it is yours, leave "from" empty.',
      '- lesson: today’s lesson, with a subject, a title, the lesson itself and one question for me to answer in writing. The old lesson is filed away on its own.',
      '- prompt: today’s writing prompt. Keep prompts away from my job.',
      '- notes: when I have written something, read it in my logs and leave one honest note on it, with "on" set to "writing:", "lesson:" or "recall:" and the date of the piece. A note without "on" shows under today’s lesson.',
      '- ledger: each Monday, one virtue for the week ("week" is that Monday, "virtue" its name, "why" one line on why this one now). Read my marks in logs "ledger" first and lean toward what keeps collecting dots.',
      '- recall: one question from a past lesson for me to answer from memory, with "from" set to "lesson:" and that lesson’s date. Make sure that lesson has a takeaway, because I check my answer against it.',
      '- creed: "today" can pick the line of the day by its number, counting from 0. Leave it out and the lines take turns.',
      '- reading, subjects and creed lines: change these only when we have talked about it. Give each book its page count when you know it.',
      '',
      'Never make anything up about me. Tell me what you changed after each save.'
    ].join('\n');
  }

  function render(v) {
    const g = G(), d = new Date();
    if (Store.data.growth && Store.data.growth.updated && Store.data.settings.growthSeen !== Store.data.growth.updated) { Store.data.settings.growthSeen = Store.data.growth.updated; Store.save(); setTimeout(() => Opus.renderBar(), 0); }
    // notes you haven't seen yet carry a gold dot this time; after that they're read
    const seen = new Set(arr(Store.data.settings.notesSeen)), all = arr(g && g.notes).filter(n => n && n.text);
    const fresh = Store.data.growth ? all.map(noteKey).filter(k => !seen.has(k)) : [];
    fresh.forEach(k => unread.add(k));
    if (fresh.length) { Store.data.settings.notesSeen = all.map(noteKey).slice(-80); Store.save(); }
    let n = 0; const num = () => U.roman(++n);
    v.appendChild(h('<div class="top"><div><div class="eyebrow">' + U.DAY_NAMES[d.getDay()] + ' · with Cassius</div><div class="title">Growth</div></div></div>'));
    v.appendChild(energy(g));
    v.appendChild(lessonCard(g, num()));
    const nc = notesCard(g, num); if (nc) v.appendChild(nc);
    v.appendChild(writingCard(g, num()));
    v.appendChild(ledgerCard(g, num()));
    v.appendChild(recallCard(g, num()));
    v.appendChild(creedCard(g, num()));
    v.appendChild(readingCard(g, num()));
    const sc = subjectsCard(g, num); if (sc) v.appendChild(sc);

    const foot = h('<div class="g-foot"><div class="rule"></div><p class="small"></p><button class="btn quiet" type="button">Copy setup for Cassius</button></div>');
    const up = g && g.updated ? new Date(g.updated) : null;
    foot.querySelector('p').textContent = !Store.data.growth && g ? 'This is an example page. Cassius fills in yours.' :
      up && !isNaN(up) ? 'Cassius last wrote here ' + (U.key(up) === U.key() ? 'today' : ago(U.key(up))) + ', ' + U.fmtTimeAP(U.pad(up.getHours()) + ':' + U.pad(up.getMinutes())) + '.' :
      'Cassius hasn’t written here yet. Paste the setup into his chat once.';
    foot.querySelector('button').onclick = () => ui.copy(setupPrompt());
    v.appendChild(foot);
  }

  Opus.growth = { prompts, todayPrompt, setupPrompt, prose };
  Opus.tab({ id: 'growth', title: 'Growth', icon: 'laurel', render,
    badge: () => !!(Store.data.growth && Store.data.growth.updated && Store.data.settings.growthSeen !== Store.data.growth.updated) });
})();
