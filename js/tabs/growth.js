/* Growth tab: Cassius's page. Words for the day at the top, then the lesson, writing, creed, reading, subjects and notes.
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
          const r = h('<div class="row tap"><span class="tx"><b>' + U.esc(l.title || 'Lesson') + '</b><small>' + U.esc([U.fmtDateShort(l.date), l.subject].filter(Boolean).join(' · ')) + (learned(l) ? ' · learned' : '') + '</small></span>' + ui.icon('chev', 'chev ico') + '</div>');
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
        const r = h('<div class="row tap"><span class="tx"><b>' + U.esc(w.prompt || 'Free writing') + '</b><small>' + U.esc(U.fmtDateShort(w.date) + (w.kind === 'lesson' ? ' · lesson answer' : '') + ' · ' + w.words + ' words') + '</small></span>' + ui.icon('chev', 'chev ico') + '</div>');
        r.onclick = () => ui.sheet({ title: U.fmtDateShort(w.date), kicker: w.kind === 'lesson' ? 'Lesson answer' : 'Writing', render(a2) {
          a2.body.appendChild(h('<div class="card pad"><div class="tag">' + (w.kind === 'lesson' ? 'Cassius asked' : 'Prompt') + '</div><div class="serif-h" style="font-size:20px;margin-top:6px">' + U.esc(w.prompt || 'Free writing') + '</div></div>'));
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
    const want = (w.kind === 'lesson' ? 'lesson:' : 'writing:') + w.date;
    return arr(g.notes).filter(n => n.on === want || (!w.kind && n.on === 'writing' && n.date >= w.date)).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  }

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

  function lessonCard(g, v) {
    const l = g && g.lesson;
    const s = sec('I', 'Today’s lesson', arr(g && g.lessons).length ? '<button class="c" type="button">Past</button>' : '');
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
    c.onclick = () => lessonSheet(l, () => Opus.refresh());
    s.appendChild(c);
    return s;
  }

  function writingCard(g) {
    const s = sec('II', 'Writing', arr(Store.data.writing).length ? '<button class="c" type="button">All</button>' : '');
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
    let last = null, n = null;
    for (const w of arr(Store.data.writing).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)) { const x = noteOn(w); if (x && (!n || x.date > n.date)) { n = x; last = w; } }
    if (n) { const nc = h('<div class="g-take"><div class="tag">Cassius on your ' + (last.kind === 'lesson' ? 'answer' : 'writing') + ' · ' + U.esc(ago(n.date)) + '</div><div></div></div>'); nc.lastChild.textContent = n.text; s.appendChild(nc); }
    return s;
  }

  function creedCard(g) {
    const lines = arr(g && g.creed && g.creed.lines).filter(Boolean);
    const s = sec('III', 'Creed');
    if (!lines.length) { s.appendChild(h('<div class="card pad"><p class="empty" style="padding:6px 0">Your creed lives here.<br>Shape it with Cassius and he’ll set it in stone.</p></div>')); return s; }
    const c = h('<div class="card pad g-creed"></div>');
    lines.forEach((t, i) => { const r = h('<div class="g-cl"><span class="n">' + U.roman(i + 1) + '</span><span class="t"></span></div>'); r.querySelector('.t').textContent = t; c.appendChild(r); });
    s.appendChild(c);
    return s;
  }

  function readingCard(g) {
    const books = arr(g && g.reading).filter(b => b && b.title);
    const s = sec('IV', 'Reading');
    if (!books.length) { s.appendChild(h('<div class="card pad"><p class="empty" style="padding:6px 0">Cassius’s reading list goes here.</p></div>')); return s; }
    const isDone = b => b.status === 'done' || !!(pageOf(b.id) || {}).done;
    const now = books.filter(b => b.status === 'reading' && !isDone(b)), next = books.filter(b => b.status === 'next' && !isDone(b)), done = books.filter(isDone);
    const c = h('<div class="card"></div>');
    now.forEach(b => {
      const pg = pageOf(b.id), pct = pg && pg.page != null && b.pages ? U.clamp(pg.page / b.pages, 0, 1) : null;
      const r = h('<div class="row tap g-book"><span class="tx"><b></b><small></small>' + (pct != null ? '<div class="bar" style="margin-top:8px"><i style="width:' + Math.round(pct * 100) + '%"></i></div>' : '') + '</span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.querySelector('b').textContent = b.title;
      r.querySelector('small').textContent = [b.author, pg && pg.page != null ? 'page ' + pg.page + (b.pages ? ' of ' + b.pages : '') : 'tap to set your page'].filter(Boolean).join(' · ');
      r.onclick = () => bookSheet(b); c.appendChild(r);
    });
    next.slice(0, 3).forEach(b => {
      const r = h('<div class="row tap"><span class="tag" style="min-width:44px">Next</span><span class="tx"><b></b><small></small></span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.querySelector('b').textContent = b.title; r.querySelector('small').textContent = b.author || '';
      r.onclick = () => bookSheet(b); c.appendChild(r);
    });
    if (done.length) c.appendChild(h('<div class="row"><span class="tx"><small>' + done.length + ' finished: ' + U.esc(done.slice(0, 3).map(b => b.title).join(', ')) + (done.length > 3 ? '…' : '') + '</small></span></div>'));
    s.appendChild(c);
    return s;
  }

  function subjectsCard(g) {
    const subs = arr(g && g.subjects).filter(x => x && x.name);
    const s = sec('V', 'Subjects');
    if (!subs.length) return null;
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

  function notesCard(g) {
    const notes = arr(g && g.notes).filter(n => n && n.text && !/^(writing|lesson):/.test(n.on || '') && n.on !== 'writing').sort((a, b) => b.date.localeCompare(a.date));
    if (!notes.length) return null;
    const s = sec('VI', 'From Cassius');
    const c = h('<div class="card"></div>');
    notes.slice(0, 4).forEach(n => { const r = h('<div class="row g-note"><span class="tx"><b></b><small></small></span></div>'); r.querySelector('b').textContent = n.text; r.querySelector('small').textContent = U.fmtDateShort(n.date); c.appendChild(r); });
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
      '- read_opus_file with file "logs" shows what I did: my writing (with lesson answers marked "kind": "lesson"), the lessons I marked as learned ("growth-lesson" in checks on that lesson’s date), my page in each book ("reading"), and the words I kept ("kept").',
      '',
      'When I ask you to fill my Growth page:',
      '- energy: one short piece of positive energy for today, motivational or just good. If it is a quote, put who said it in "from" and make sure it is real and worded right. If it is yours, leave "from" empty.',
      '- lesson: today’s lesson, with a subject, a title, the lesson itself and one question for me to answer in writing. The old lesson is filed away on its own.',
      '- prompt: today’s writing prompt. Keep prompts away from my job.',
      '- notes: when I have written something, read it in my logs and leave one honest note on it, with "on" set to "writing:" or "lesson:" and the date of the piece.',
      '- reading, subjects and creed: change these only when we have talked about it.',
      '',
      'Never make anything up about me. Tell me what you changed after each save.'
    ].join('\n');
  }

  function render(v) {
    const g = G(), d = new Date();
    if (Store.data.growth && Store.data.growth.updated && Store.data.settings.growthSeen !== Store.data.growth.updated) { Store.data.settings.growthSeen = Store.data.growth.updated; Store.save(); setTimeout(() => Opus.renderBar(), 0); }
    v.appendChild(h('<div class="top"><div><div class="eyebrow">' + U.DAY_NAMES[d.getDay()] + ' · with Cassius</div><div class="title">Growth</div></div></div>'));
    v.appendChild(energy(g));
    v.appendChild(lessonCard(g, v));
    v.appendChild(writingCard(g));
    v.appendChild(creedCard(g));
    v.appendChild(readingCard(g));
    const sc = subjectsCard(g); if (sc) v.appendChild(sc);
    const nc = notesCard(g); if (nc) v.appendChild(nc);

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
