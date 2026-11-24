/* Growth tab: Cassius's room. Only the parts in use show, top to bottom: the Lamp, the sitting (with Back again),
   his notes, the Course, Talk, the Scroll (your words), The Ledger, and the Library.
   Everything but conversation happens here: answering, the unit's piece and teach-back, replies to his notes, pages, kept lines.
   Cassius writes growth.json. The phone only reads it; what you do here goes in the logs (writing, kept, reading).
   The Season, Map, Glimpses, Lexicon, Made, Portrait and creed stay in the file but aren't shown.
   Nothing here counts streaks or scores: only what you write or log shows, and a blank stays blank. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;

  const G = () => Store.data.growth || ((Plan.p && Plan.p.name === 'Example plan') || window.OPUS_PREVIEW ? window.OPUS_EXAMPLE_GROWTH : null) || null;
  const today = () => U.key();
  const arr = x => (Array.isArray(x) ? x : []);
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const words = t => (String(t || '').trim() ? String(t).trim().split(/\s+/).length : 0);
  const ago = k => { const n = U.daysBetween(U.parseKey(k), new Date()); return n === 0 ? 'today' : n === 1 ? 'yesterday' : n === -1 ? 'tomorrow' : n > 1 && n < 7 ? U.DAY_NAMES[U.parseKey(k).getDay()] : U.fmtDateShort(k); };
  const longDay = k => U.DAY_NAMES[U.parseKey(k).getDay()] + ', ' + U.fmtDateShort(k);
  const set = (el, sel, text) => { const x = sel ? el.querySelector(sel) : el; if (x) x.textContent = text; return x; };
  const hash = s => { let x = 2166136261; for (const c of String(s)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }; // a stable place in the sky for each id
  /* press and hold: fn runs after ms. Returns a check that says whether the last press was a hold, so its click can be ignored */
  const hold = (el, fn, ms) => {
    let t = null, held = false;
    el.addEventListener('pointerdown', () => { held = false; clearTimeout(t); t = setTimeout(() => { held = true; fn(); }, ms || 550); });
    ['pointerup', 'pointerleave', 'pointercancel', 'scroll'].forEach(e => el.addEventListener(e, () => clearTimeout(t)));
    el.addEventListener('contextmenu', e => e.preventDefault());
    return () => { const was = held; held = false; return was; };
  };

  /* Cassius may write a little markdown: paragraphs, "- " lists, "> " quotes, "### " headings, **bold**, *italic* */
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
  const firstPara = t => (String(t || '').trim().split(/\n\s*\n/)[0] || '').replace(/[*>#]/g, '').replace(/^\s*-\s+/gm, '').trim();

  /* ---------- what the rest of Opus asks of Growth (the Today tab's writing sheet) ---------- */
  function todayPrompt() { const g = G(); return g && g.prompt && g.prompt.text && g.prompt.date === today() ? g.prompt.text : null; }
  function prompts() {
    const g = G(); if (!g) return [];
    const list = arr(g.prompts).map(p => (typeof p === 'string' ? p : p && p.text)).filter(Boolean);
    const t = todayPrompt();
    return t ? [t].concat(list.filter(x => x !== t)) : list;
  }

  /* ---------- the logs this page reads and writes ---------- */
  const writing = () => arr(Store.data.writing).filter(w => w && w.date && w.text);
  const glimpses = () => arr(Store.data.glimpses).filter(x => x && x.id && x.line).sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
  const kept = () => arr(Store.data.kept).filter(k => k && k.text);
  const pageOf = id => arr(Store.data.reading).find(r => r.id === id) || null;

  /* the kind of writing a sitting asks for decides where the answer is filed in the logs */
  const FORM_KIND = { 'teach-back': 'teachback', teachback: 'teachback', workshop: 'workshop', walk: 'walk', seal: 'seal' };
  const kindFor = l => FORM_KIND[String((l && l.form) || '').toLowerCase()] || 'lesson';
  const KIND_NAME = { lesson: 'Answer', recall: 'Explained again', teachback: 'Teach-back', workshop: 'Workshop', walk: 'From the Walk', seal: 'Sealed question', piece: 'The unit’s piece', reply: 'Reply to Cassius', '': 'Writing' };
  // a Thought (Friday) and a Quiet day are there to read; they never ask anything of you
  const readOnly = l => /^(thought|quiet)/i.test(String((l && l.form) || ''));
  const asks = l => !!(l && l.question && !readOnly(l));
  const answerTo = (kind, q) => q ? writing().filter(w => (w.kind || '') === kind && w.prompt === q).sort((a, b) => b.date.localeCompare(a.date))[0] || null : null;

  /* ---------- notes from Cassius: each can be "on" something ("lesson:DATE", "glimpse:ID", "book:ID", "seal:DATE" ...) ---------- */
  const notes = () => arr((G() || {}).notes).filter(n => n && n.text && isDate(n.date));
  const noteFor = on => notes().filter(n => n.on === on).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const noteOnWriting = w => noteFor((w.kind || 'writing') + ':' + w.date) || (!w.kind ? noteFor('writing') : null);
  const noteKey = n => n.date + '|' + (n.on || '') + '|' + String(n.text || '').slice(0, 40);
  // a note stays marked new for the whole visit, so a sync or a save that redraws the page doesn't take the dot away before you've read it
  let unread = new Set();
  const clearUnread = () => { unread = new Set(); };
  window.addEventListener('hashchange', () => { if (!/growth/.test(location.hash)) clearUnread(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearUnread(); });
  const dot = n => (unread.has(noteKey(n)) ? '<i class="g-unread" aria-label="New"></i>' : '');
  function noteBox(n, label) {
    const el = h('<div class="g-take g-noteon"><div class="tag">' + dot(n) + U.esc(label) + '</div><div></div></div>');
    el.children[1].textContent = n.text; el.appendChild(replyBox(noteRef(n), n.text)); return el;
  }

  /* ---------- replies: a box under each of his notes. A reply goes in logs writing as kind "reply", on that note ---------- */
  const noteRef = n => 'note:' + (n.id ? n.id : n.date + (n.on ? ':' + n.on : ''));
  const replyTo = ref => writing().filter(w => w.kind === 'reply' && w.on === ref).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const sentences = t => Math.max(1, (String(t).match(/[.!?…]+(\s|$)/g) || []).length);
  function replyBox(ref, about) {
    const box = h('<div class="g-reply"></div>');
    ['click', 'pointerdown'].forEach(e => box.addEventListener(e, ev => ev.stopPropagation()));
    const draw = editing => {
      const r = replyTo(ref); box.innerHTML = '';
      if (!editing) {
        if (r) {
          const m = h('<button class="g-rmine" type="button"><span class="tag"></span><span class="g-prose"></span></button>');
          set(m, '.tag', 'You wrote back · ' + ago(r.date)); m.querySelector('.g-prose').innerHTML = prose(r.text);
          m.onclick = () => draw(true); box.appendChild(m);
        } else { const b = h('<button class="g-ropen" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/></svg>Write back</button>'); b.onclick = () => draw(true); box.appendChild(b); }
        return;
      }
      const ta = h('<textarea class="input g-rta" rows="3" placeholder="Write back. He reads it next time he writes."></textarea>');
      ta.value = r ? r.text : '';
      const row = h('<div class="g-rrow"><span class="small num"></span><button class="link" type="button">Cancel</button><button class="btn sm" type="button">Save</button></div>');
      const cnt = row.querySelector('.small'), upd = () => { cnt.textContent = words(ta.value) ? words(ta.value) + ' words' : ''; };
      ta.addEventListener('input', () => { upd(); ta.style.height = 'auto'; ta.style.height = Math.min(320, ta.scrollHeight + 2) + 'px'; }); upd();
      row.children[1].onclick = () => draw(false);
      row.children[2].onclick = () => {
        const t = ta.value.trim(); if (!t) { ta.focus(); return; }
        saveWriting({ date: r ? r.date : today(), kind: 'reply', on: ref, prompt: String(about || '').replace(/\s+/g, ' ').trim().slice(0, 160), text: t, words: words(t), sentences: sentences(t) });
        ui.buzz(10); ui.toast('Saved. Cassius reads it when he next writes.'); draw(false);
      };
      box.appendChild(ta); box.appendChild(row); setTimeout(() => ta.focus(), 60);
    };
    draw(false);
    return box;
  }
  /* one piece of writing per day, kind and the thing it's on: saving again that day replaces it */
  function saveWriting(entry) {
    const ref = w => w.on || w.unit || '';
    Store.data.writing = arr(Store.data.writing).filter(w => !(w.date === entry.date && (w.kind || '') === (entry.kind || '') && ref(w) === ref(entry))).concat([entry]);
    Store.save();
  }
  function take(label, text, cls) {
    const el = h('<div class="g-take' + (cls ? ' ' + cls : '') + '"><div class="tag"></div><div></div></div>');
    set(el, '.tag', label); el.lastChild.textContent = text; return el;
  }

  /* ---------- the season: which week we're in ---------- */
  function seasonNow(g) {
    const s = g && g.season; if (!s || !isDate(s.start)) return null;
    const weeks = arr(s.weeks).filter(w => w && isDate(w.from) && isDate(w.to));
    const t = today();
    const wk = weeks.find(w => t >= w.from && t <= w.to) || null;
    const fallow = !!(s.fallow && isDate(s.fallow.from) && t >= s.fallow.from && t <= s.fallow.to);
    const end = (s.fallow && s.fallow.to) || (weeks.length ? weeks[weeks.length - 1].to : s.start);
    return { s, weeks, wk, fallow, before: t < s.start, after: t > end, day: U.daysBetween(U.parseKey(s.start), new Date()) + 1 };
  }
  const seasonName = s => 'Season ' + U.roman(s.n || 1);

  /* ---------- sheets ---------- */
  function writeAnswer(after, o) {
    Opus.today.writeSheet(after, Object.assign({ free: true, placeholder: 'Plain sentences. Say it the way you’d say it to a friend.' }, o));
  }

  /* "Your task": the first thing on a sitting, so what's asked of him is never buried in the letter.
     growth.json lesson.task is Cassius's own plain line of what to do; without it Opus says it from the form */
  function taskHow(l) {
    if (typeof l.task === 'string' && l.task.trim()) return l.task.trim();
    if (!asks(l)) return /^quiet/i.test(l.form || '') ? 'Nothing to write today. Read it, then let it sit.' : 'Just read it. Nothing to write today.';
    return (/cold/i.test(l.form || '') ? 'Answer from your own head first. Don’t look anything up. ' : '') +
      'Tap Answer in writing below, or talk it through with Cassius. A few plain sentences is enough.';
  }
  function taskBox(l, ans) {
    const ask = asks(l);
    const el = h('<div class="g-task' + (ans ? ' done' : '') + '"><div class="gt-head"><span class="tag">Your task</span><span class="small num"></span></div>' +
      (ask ? '<div class="gt-q"></div>' : '') + '<p class="gt-how"></p>' + (ans ? '<div class="gt-done small"></div>' : '') + '</div>');
    set(el, '.gt-head .small', 'About ' + readMins(l) + ' min');
    if (ask) set(el, '.gt-q', l.question);
    set(el, '.gt-how', taskHow(l));
    if (ans) set(el, '.gt-done', 'Done. You answered ' + ago(ans.date) + ' (' + ans.words + ' words). Your answer is at the bottom.');
    return el;
  }
  /* what Listen reads for a sitting: the title, the letter, what to take with you, and the question */
  const listenTo = l => ({ who: 'Cassius', title: l.title || 'The sitting', pieces: [l.title, l.body, l.takeaway ? 'Take with you. ' + l.takeaway : null, asks(l) ? 'Cassius asks. ' + l.question : null] });
  function lessonSheet(l, after) {
    const kind = kindFor(l), ans = answerTo(kind, l.question);
    ui.sheet({
      title: l.title || 'The sitting', kicker: [l.form || 'The sitting', ago(l.date) === 'today' ? null : ago(l.date), readMins(l) + ' min'].filter(Boolean).join(' · '), foot: true,
      render(api) {
        const b = api.body;
        b.appendChild(taskBox(l, ans));
        b.appendChild(h('<div class="g-prose">' + (l.body ? '<div class="g-lh">Cassius’s letter</div>' : '') + (prose(l.body) || '<p class="note">Cassius left a title and nothing more today. Some days that is the lesson.</p>') + '</div>'));
        if (l.takeaway) b.appendChild(take('Take with you', l.takeaway));
        if (ans) b.appendChild(h('<div class="g-mine g-prose"><div class="g-lh">Your answer</div>' + prose(ans.text) + '</div>'));
        const n = noteFor('lesson:' + l.date) || (ans && noteOnWriting(ans)); if (n) b.appendChild(noteBox(n, ans ? 'Cassius on your answer' : 'Cassius on this'));
        if (l.why) { const w = h('<details class="g-why2"><summary>Why this, today?</summary><p></p></details>'); set(w, 'p', l.why); b.appendChild(w); }
        const btns = h('<div class="btns">' + (asks(l) ? '<button class="btn" type="button">' + (ans ? 'Read or edit your answer' : 'Answer in writing') + '</button>' : '') + '</div>');
        // keep hold of the answer button itself: Listen and Talk go in front of it, so its place in the row moves
        const wb = btns.firstElementChild;
        btns.insertBefore(talkLink('btn quiet', 'Talk it through'), btns.firstChild);
        if (Opus.voice && l.body) btns.insertBefore(Opus.voice.button(l, 'btn quiet', 'Listen'), btns.firstChild);
        if (wb) wb.onclick = () => { api.close(true); writeAnswer(after, { prompt: l.question, kind, title: KIND_NAME[kind], kicker: l.title || 'The sitting', tag: 'Cassius asks' }); };
        api.foot.appendChild(btns);
      }
    });
  }
  /* the real conversation happens with Cassius himself, in Claude Duet: one tap from anywhere on the tab.
     growth.json "talk": { "url" } can point it at his own chat; anything not on claude.ai falls back to the app's front door */
  const TALK = 'https://claude.ai/messages';
  const talkUrl = () => { const u = ((G() || {}).talk || {}).url; return typeof u === 'string' && /^https:\/\/claude\.ai\/[\w\-\/.?=&#%]*$/.test(u) ? u : TALK; };
  // plain same-window links: a home-screen web app drops target=_blank and script-opened windows, so the tap just goes there
  const talkLink = (cls, label) => { const a = document.createElement('a'); a.className = cls; a.href = talkUrl(); a.textContent = label; return a; };

  function writingSheet(w) {
    ui.sheet({ title: U.fmtDateShort(w.date), kicker: KIND_NAME[w.kind || ''] || 'Writing', render(api) {
      const c = h('<div class="card pad"><div class="tag"></div><div class="serif-h" style="font-size:20px;margin-top:6px"></div></div>');
      set(c, '.tag', w.kind ? 'Cassius asked' : 'Prompt'); set(c, '.serif-h', w.prompt || 'Free writing');
      api.body.appendChild(c);
      api.body.appendChild(h('<div class="g-prose g-mine">' + prose(w.text) + '</div>'));
      const n = noteOnWriting(w); if (n) api.body.appendChild(noteBox(n, 'Cassius on this'));
    } });
  }
  function allWriting() {
    const list = writing().slice().sort((a, b) => b.date.localeCompare(a.date) || (a.kind ? 1 : -1));
    ui.sheet({ title: 'Your writing', kicker: list.length + ' pieces · ' + U.sum(list.map(w => w.words)).toLocaleString() + ' words', render(api) {
      if (!list.length) { api.body.appendChild(h('<p class="empty">What you write lands here, newest first.</p>')); return; }
      const card = h('<div class="card"></div>');
      list.forEach(w => {
        const r = h('<div class="row tap"><span class="tx"><b></b><small></small></span>' + ui.icon('chev', 'chev ico') + '</div>');
        set(r, 'b', w.prompt || 'Free writing'); set(r, 'small', U.fmtDateShort(w.date) + (w.kind ? ' · ' + (KIND_NAME[w.kind] || w.kind).toLowerCase() : '') + ' · ' + w.words + ' words');
        r.onclick = () => writingSheet(w); card.appendChild(r);
      });
      api.body.appendChild(card);
    } });
  }

  /* ---------- the Lamp: one real line, worded exactly, its speaker named. Tap for why; press and hold to keep it ---------- */
  const LAMP = '<svg class="g-lampic" viewBox="0 0 48 32" aria-hidden="true"><path class="fl" d="M38 3c2.6 3 3.4 5.6 1.4 8.2-1.4 1.8-4.2 1.6-5-.6-.7-2 .9-3.5 1.8-4.6.8-1 1.4-2 1.8-3z"/>' +
    '<path d="M6 17c4-4 13-5 21-3 5 1.3 8.4 1 10.6-1.6.6-.7 1.6-.2 1.4.7-1 4.6-5 8-11 9.4C21 24 12 23.4 6 17z"/><path d="M14 23.6 12.5 28h15l-1.6-4.4M10 28h20"/><path d="M6 17c-2.6-.4-4 1-3.6 3 .4 1.8 2.6 2.4 4.6 1.4"/></svg>';
  function keepLamp(e) {
    const list = kept(), at = list.findIndex(k => k.text === e.text && k.date === today());
    if (at >= 0) { Store.data.kept = list.filter((_, i) => i !== at); ui.toast('Taken out of your Commonplace'); }
    else { Store.data.kept = list.filter(k => !(k.date === today() && (!k.id || /^lamp:/.test(k.id)))).concat([{ id: 'lamp:' + today(), date: today(), text: e.text, from: e.from || null }]); ui.toast('Kept in your Commonplace.'); }
    Store.save(); ui.buzz(14);
  }
  function lamp(g) {
    const e = g && g.energy, has = e && e.text, isToday = has && e.date === today();
    const el = h('<div class="g-lamp' + (has ? '' : ' none') + '">' + LAMP + (has ? '<blockquote class="g-words"></blockquote><div class="g-from"></div><div class="g-lwhy" hidden></div><div class="g-acts"></div>' :
      '<div class="g-words wait">The Lamp is lit before dawn.</div><div class="g-from">One true line a day, from someone who said it.</div>') + '</div>');
    if (!has) return el;
    set(el, '.g-words', e.text);
    set(el, '.g-from', '— ' + (e.from || 'Cassius') + (isToday ? '' : '   ·   from ' + ago(e.date)));
    // "Lamps you keep come back": if you kept this line before, the tap says so
    const before = kept().filter(k => k.text === e.text && k.date < e.date).sort((a, b) => a.date.localeCompare(b.date))[0];
    const why = el.querySelector('.g-lwhy');
    why.innerHTML = (e.why ? '<div class="tag">Why today</div><p class="w"></p>' : '') + (before ? '<p class="g-back"></p>' : '') + (!e.why && !before ? '<p class="small">Cassius didn’t say why. Ask him.</p>' : '');
    if (e.why) set(why, '.w', e.why);
    if (before) set(why, '.g-back', 'You kept this on ' + U.fmtDateShort(before.date) + '. He brought it back.');
    const acts = el.querySelector('.g-acts');
    const isKept = () => kept().some(k => k.text === e.text && k.date === today());
    const kb = h('<button class="g-act" type="button"><svg viewBox="0 0 24 24" aria-hidden="true">' + ui.I.laurel + '</svg><span></span></button>');
    const draw = () => { kb.classList.toggle('on', isKept()); set(kb, 'span', isKept() ? 'Kept' : 'Keep'); el.classList.toggle('kept', isKept()); };
    kb.onclick = () => { keepLamp(e); draw(); };
    acts.appendChild(kb); draw();
    const wasHeld = hold(el, () => { keepLamp(e); draw(); }, 600);
    el.addEventListener('click', ev => { if (wasHeld() || ev.target.closest('button')) return; why.hidden = !why.hidden; el.classList.toggle('open', !why.hidden); });
    return el;
  }
  function commonplace() {
    const list = kept().slice().sort((a, b) => b.date.localeCompare(a.date));
    ui.sheet({ title: 'Commonplace', kicker: list.length + (list.length === 1 ? ' line kept' : ' lines kept'), render(api) {
      api.body.appendChild(h('<p class="note" style="margin-bottom:8px">The lines that landed: Lamps you kept, and lines you copied from your books.</p>'));
      if (!list.length) { api.body.appendChild(h('<p class="empty">Press and hold the Lamp to keep a line.</p>')); return; }
      list.forEach(k => { const r = h('<div class="g-kept"><div class="q"></div><div class="small"></div></div>'); set(r, '.q', k.text); set(r, '.small', (k.from ? k.from + ' · ' : '') + U.fmtDateShort(k.date)); api.body.appendChild(r); });
    } });
  }

  /* ---------- sections ---------- */
  function sec(num, title, right) {
    const s = h('<div class="sec"><div class="sh"><span class="r">' + num + '</span><span class="t"></span>' + (right || '') + '</div></div>');
    set(s, '.sh .t', title); return s;
  }

  /* The sitting: today's lesson, ready by lunch, then Back again, and the Seal while it waits on you */
  function sitting(g, num, sn) {
    const l = g && g.lesson, past = arr(g && g.lessons).length;
    const s = sec(num, 'The sitting', past ? '<button class="c" type="button">Earlier</button>' : '');
    const pb = s.querySelector('button.c'); if (pb) pb.onclick = pastLessons;
    if (!l || !l.title) {
      const opens = sn && sn.before ? longDay(sn.s.start) : null;
      s.appendChild(h('<div class="card pad g-class empty-c"><div class="serif-h"></div><p class="g-first"></p></div>'));
      set(s, '.serif-h', opens ? 'The room opens ' + opens + '.' : 'Nothing waiting yet.');
      set(s, '.g-first', opens ? 'Every day at lunch there will be something here. The first day is a letter and one task.' : 'Today’s sitting is set before dawn and waiting by 11:45.');
      const sl = sealCard(g); if (sl) s.appendChild(sl);
      return s;
    }
    const kind = kindFor(l), ask = asks(l), ans = ask ? answerTo(kind, l.question) : null, old = l.date !== today();
    const u = unitById(g, l.unit);
    const c = h('<div class="card pad g-class tap' + (ans ? ' answered' : '') + (readOnly(l) ? ' g-read' : '') + '">' +
      '<div class="g-meta"><span class="tag"></span><span class="small num"></span></div><div class="serif-h" style="margin-top:6px"></div>' +
      (firstPara(l.body) ? '<p class="g-first"></p>' : '') + (ask ? '<div class="g-q"><span class="tag">Cassius asks</span><div></div></div>' : '') +
      '<div class="g-cfoot"><span class="g-state small"></span><span class="g-cbtns">' + (l.why ? '<button class="link g-whyb" type="button">Why this, today?</button>' : '') + '</span></div>' +
      (l.why ? '<p class="g-whyt" hidden></p>' : '') + '</div>');
    set(c, '.g-meta .tag', l.form || 'The sitting');
    set(c, '.g-meta .small', [u ? u.subject.name + ' ' + U.roman(u.n) : null, readMins(l) + ' min', old ? ago(l.date) : null].filter(Boolean).join(' · '));
    set(c, '.serif-h', l.title);
    if (firstPara(l.body)) set(c, '.g-first', firstPara(l.body));
    if (ask) set(c, '.g-q div', l.question);
    set(c, '.g-state', ans ? 'Answered · ' + ans.words + ' words' : ask ? 'Tap to sit down' : /^quiet/i.test(l.form || '') ? 'Nothing asked of you today' : 'Tap to read');
    if (l.why) {
      const wb = c.querySelector('.g-whyb'), wt = c.querySelector('.g-whyt'); wt.textContent = l.why;
      wb.onclick = ev => { ev.stopPropagation(); wt.hidden = !wt.hidden; wb.textContent = wt.hidden ? 'Why this, today?' : 'Hide the why'; };
    }
    if (Opus.voice && l.body) c.querySelector('.g-cbtns').prepend(Opus.voice.button(l, 'link g-listen', 'Listen'));
    const n = noteFor('lesson:' + l.date) || (ans && noteOnWriting(ans));
    if (n) c.appendChild(noteBox(n, (ans ? 'Cassius on your answer' : 'Cassius on this') + ' · ' + ago(n.date)));
    c.onclick = () => lessonSheet(l, () => Opus.refresh());
    s.appendChild(c);
    // a question from an earlier sitting, back for you to explain again from memory
    const r = g.recall;
    if (r && r.question) {
      const ra = answerTo('recall', r.question), src = lessonByRef(g, r.from);
      if (!ra || ra.date === today()) {
        const rc = h('<div class="card pad g-back2"><div class="g-meta"><span class="tag">Back again</span><span class="small"></span></div><div class="g-rq"></div><div class="g-row"><span class="small"></span><button class="btn sm" type="button"></button></div></div>');
        set(rc, '.g-meta .small', src ? (src.title || 'An earlier sitting') + ' · ' + U.fmtDateShort(src.date) : '');
        set(rc, '.g-rq', r.question);
        set(rc, '.g-row .small', ra ? 'Explained · ' + ra.words + ' words' : 'From memory. No looking back.');
        set(rc, '.btn', ra ? 'Check it' : 'Explain');
        rc.querySelector('.btn').onclick = () => ra ? recallSheet(r, ra, src) : writeAnswer(() => Opus.refresh(), { prompt: r.question, kind: 'recall', title: 'Explain it again', kicker: 'From memory', tag: 'Explain it from start to finish', placeholder: 'Don’t look it up. Explain it as if to someone who wasn’t there.', saved: 'Saved. Now check it against what you learned.' });
        s.appendChild(rc);
      }
    }
    const sl = sealCard(g); if (sl) s.appendChild(sl);
    return s;
  }
  function lessonByRef(g, ref) {
    const m = /^lesson:(\d{4}-\d{2}-\d{2})$/.exec(String(ref || '')); if (!m) return null;
    return arr(g && g.lessons).concat(g && g.lesson ? [g.lesson] : []).find(l => l && l.date === m[1]) || null;
  }
  function recallSheet(r, ra, src) {
    ui.sheet({ title: 'Explained again', kicker: src ? src.title || 'From memory' : 'From memory', render(api) {
      const b = api.body;
      set(b.appendChild(h('<div class="serif-h" style="font-size:21px"></div>')), null, r.question);
      b.appendChild(h('<div class="g-mine g-prose">' + prose(ra.text) + '</div>'));
      if (src && src.takeaway) b.appendChild(take('What the sitting said', src.takeaway));
      const n = noteOnWriting(ra); if (n) b.appendChild(noteBox(n, 'Cassius on your explanation'));
      const btns = h('<div class="btns" style="margin-top:14px">' + (src ? '<button class="btn quiet" type="button">Read the sitting</button>' : '') + '<button class="btn ghost" type="button">Edit</button></div>');
      const bs = btns.querySelectorAll('.btn');
      if (src) bs[0].onclick = () => lessonSheet(src, () => Opus.refresh());
      bs[bs.length - 1].onclick = () => { api.close(true); writeAnswer(() => Opus.refresh(), { prompt: r.question, kind: 'recall', title: 'Explain it again', kicker: 'From memory' }); };
      b.appendChild(btns);
    } });
  }
  function pastLessons() {
    const g = G(), list = arr(g && g.lessons).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    ui.sheet({ title: 'Earlier sittings', kicker: list.length + ' before today', render(api) {
      const card = h('<div class="card"></div>');
      list.forEach(l => {
        const r = h('<div class="row tap"><span class="tx"><b></b><span class="g-tk"></span><small></small></span>' + ui.icon('chev', 'chev ico') + '</div>');
        set(r, 'b', l.title || 'A sitting');
        if (l.takeaway) set(r, '.g-tk', l.takeaway); else r.querySelector('.g-tk').remove();
        set(r, 'small', [U.fmtDateShort(l.date), l.form || l.subject].filter(Boolean).join(' · ') + (answerTo(kindFor(l), l.question) ? ' · answered' : ''));
        r.onclick = () => lessonSheet(l); card.appendChild(r);
      });
      api.body.appendChild(card);
    } });
  }

  /* the Seal: a question with Cassius's own answer locked inside. It opens on its date or once you've answered */
  const SEAL = '<svg class="g-wax" viewBox="0 0 64 64" aria-hidden="true"><path class="wx" d="M32 4c5 0 7 3 11 4s8 0 10 4-1 7 1 11 5 6 4 11-5 6-6 10 1 8-3 11-8 1-12 3-6 5-11 5-7-3-11-4-8 0-10-4 1-7-1-11-5-6-4-11 5-6 6-10-1-8 3-11 8-1 12-3 6-5 11-5z"/><circle cx="32" cy="32" r="15"/><path d="M38 25.5a9 9 0 1 0 0 13"/><path class="ck" d="M30 4.6 33 22l-6 9 7 9-3 19.4"/></svg>';
  function sealCard(g) {
    const sl = g && g.seal; if (!sl || !sl.question) return null;
    const mine = answerTo('seal', sl.question), open = !!mine || (isDate(sl.opens) && sl.opens <= today());
    // the Seal shows only while it's live: waiting on your answer, or for a week after it breaks
    const broke = mine ? mine.date : isDate(sl.opens) ? sl.opens : null;
    if (open && (!broke || U.daysBetween(U.parseKey(broke), new Date()) > 7)) return null;
    const s = h('<div class="g-sealwrap"></div>');
    const c = h('<div class="card pad g-seal' + (open ? ' open' : '') + '">' + SEAL + '<div class="tag"></div><div class="serif-h"></div><div class="g-sealb"></div></div>');
    set(c, '.tag', 'Cassius sealed his answer ' + ago(sl.date));
    set(c, '.serif-h', sl.question);
    const body = c.querySelector('.g-sealb');
    if (!open) {
      set(body.appendChild(h('<p class="small"></p>')), null, 'It opens ' + (isDate(sl.opens) ? longDay(sl.opens) : 'when you answer') + ', or as soon as you answer, whichever comes first. His answer can’t change once you’ve written yours.');
      const b = h('<button class="btn" type="button">Answer before it opens</button>');
      b.onclick = () => writeAnswer(() => Opus.refresh(), { prompt: sl.question, kind: 'seal', title: 'Before the seal breaks', kicker: 'The Seal', tag: 'Cassius sealed his answer', saved: 'Saved. The seal is broken.' });
      body.appendChild(b);
    } else {
      if (mine) { const m = h('<div class="g-mine"><div class="tag"></div><div class="g-prose"></div></div>'); set(m, '.tag', 'You wrote · ' + ago(mine.date)); m.querySelector('.g-prose').innerHTML = prose(mine.text); body.appendChild(m); }
      const his = h('<div class="g-take"><div class="tag"></div><div class="g-prose"></div></div>'); set(his, '.tag', 'His answer, sealed ' + U.fmtDateShort(sl.date)); his.querySelector('.g-prose').innerHTML = prose(sl.answer || 'He left it blank. Ask him why.'); body.appendChild(his);
      const n = noteFor('seal:' + sl.date); if (n) body.appendChild(noteBox(n, 'Cassius, after'));
      if (!mine) { const b = h('<button class="btn ghost" type="button" style="margin-top:12px">Write yours anyway</button>'); b.onclick = () => writeAnswer(() => Opus.refresh(), { prompt: sl.question, kind: 'seal', title: 'Your answer', kicker: 'The Seal' }); body.appendChild(b); }
    }
    s.appendChild(c);
    return s;
  }

  /* From Cassius: notes that aren't about one thing on the page. A letter shows as folded paper; a piece of his story is marked */
  const elsewhere = n => /^(writing|lesson|recall|teachback|workshop|walk|seal|glimpse|book|made|unit|piece|reply|changelog):/.test(n.on || '') || n.on === 'writing';
  function fromCassius(g, num) {
    const all = notes().filter(n => !elsewhere(n)).sort((a, b) => b.date.localeCompare(a.date));
    const list = all.filter(n => U.daysBetween(U.parseKey(n.date), new Date()) <= 14 || unread.has(noteKey(n)));
    if (!list.length) return null;
    const s = sec(num(), 'From Cassius', all.length > 3 ? '<button class="c" type="button">All</button>' : '');
    const more = s.querySelector('button.c'); if (more) more.onclick = () => allNotes(all);
    list.slice(0, 3).forEach(n => s.appendChild(noteCard(n)));
    return s;
  }
  function noteCard(n) {
    if (n.kind === 'letter') {
      const c = h('<button class="g-letter" type="button"><span class="g-fold" aria-hidden="true"></span><span class="tag"></span><span class="serif-h"></span><span class="small">Tap to unfold</span></button>');
      c.querySelector('.tag').innerHTML = dot(n) + 'A letter · ' + U.esc(ago(n.date));
      set(c, '.serif-h', n.title || (((Plan.p && Plan.p.profile && Plan.p.profile.firstName) || (Plan.p && Plan.p.profile && Plan.p.profile.name) || '').split(' ')[0] || 'A letter') + (n.title ? '' : '.'));
      c.onclick = () => ui.sheet({ title: n.title || 'A letter', kicker: 'From Cassius · ' + U.fmtDateShort(n.date), render(api) { api.body.appendChild(h('<div class="g-prose g-paper">' + prose(n.text) + '</div>')); api.body.appendChild(replyBox(noteRef(n), n.title || n.text)); } });
      if (replyTo(noteRef(n))) c.querySelector('.small').textContent = 'Tap to unfold · you wrote back';
      return c;
    }
    const c = h('<div class="card pad g-note2' + (n.kind === 'story' ? ' story' : '') + '"><div class="tag"></div><div class="g-ntext g-prose"></div></div>');
    c.querySelector('.tag').innerHTML = dot(n) + (n.kind === 'story' ? 'From his life' : 'A note') + ' · ' + U.esc(ago(n.date));
    c.querySelector('.g-ntext').innerHTML = prose(n.text);
    c.appendChild(replyBox(noteRef(n), n.text));
    return c;
  }
  function allNotes(list) {
    ui.sheet({ title: 'From Cassius', kicker: list.length + ' notes and letters', render(api) { list.forEach(n => { const c = noteCard(n); c.style.marginBottom = '10px'; api.body.appendChild(c); }); } });
  }

  /* the Season: one big question, seven weeks and a fallow week. A week stays faint until you've explained its ground start to finish */
  function seasonCard(g, num, sn) {
    if (!sn) return null;
    const { s, weeks, wk } = sn;
    const right = sn.before ? 'opens ' + U.fmtDateShort(s.start) : sn.fallow ? 'fallow week' : sn.after ? 'complete' : 'day ' + sn.day + ' of ' + (weeks.length * 7);
    const s2 = sec(num(), seasonName(s), '<span class="c"></span>'); set(s2, '.sh .c', right);
    const c = h('<div class="card pad g-season"><div class="serif-h g-sq"></div><div class="g-road" role="list"></div><div class="g-now"></div></div>');
    set(c, '.g-sq', s.question || 'The season’s question');
    const road = c.querySelector('.g-road');
    weeks.forEach(w => {
      const state = w.solid ? 'solid' : wk && wk.n === w.n ? 'now' : today() > w.to ? 'past' : 'ahead';
      const b = h('<button class="g-wp ' + state + '" type="button" role="listitem"><i></i><span>' + U.roman(w.n) + '</span></button>');
      b.setAttribute('aria-label', 'Week ' + w.n + ': ' + (w.name || '') + (state === 'solid' ? ', explained start to finish' : state === 'now' ? ', this week' : ''));
      b.onclick = () => weekSheet(s, w);
      road.appendChild(b);
    });
    if (s.fallow && isDate(s.fallow.from)) { const f = h('<button class="g-wp fallow' + (sn.fallow ? ' now' : '') + '" type="button" role="listitem" aria-label="Fallow week: rest"><i></i><span>rest</span></button>'); f.onclick = () => weekSheet(s, Object.assign({ name: 'Fallow', fallow: true }, s.fallow)); road.appendChild(f); }
    const now = c.querySelector('.g-now');
    const show = sn.before ? weeks[0] : wk;
    if (show) {
      now.innerHTML = '<div class="g-meta"><span class="tag"></span><span class="small"></span></div><p></p>';
      set(now, '.tag', (sn.before ? 'First · ' : 'This week · ') + (show.name || 'Week ' + U.roman(show.n)));
      set(now, '.small', U.fmtDateShort(show.from) + ' to ' + U.fmtDateShort(show.to));
      set(now, 'p', show.ground || '');
    } else if (sn.fallow) {
      now.innerHTML = '<div class="tag">Fallow</div><p>No new ground this week. Look back at your Glimpses and choose the next question together.</p>';
    } else if (sn.after) {
      now.innerHTML = '<div class="tag">The season is done</div><p>Then sits beside Now. Read them both.</p>';
    }
    const book = s.book && arr(g.reading).find(b => b.id === s.book);
    if (book) { const bk = h('<button class="g-sbook" type="button"><span class="small">Reading with it</span><b></b></button>'); set(bk, 'b', book.title + (s.bookPart ? ', ' + s.bookPart : '')); bk.onclick = () => bookSheet(book); c.appendChild(bk); }
    s2.appendChild(c);
    return s2;
  }
  function weekSheet(s, w) {
    ui.sheet({ title: w.fallow ? 'Fallow' : 'Week ' + U.roman(w.n) + (w.name ? ': ' + w.name : ''), kicker: seasonName(s) + ' · ' + U.fmtDateShort(w.from) + ' to ' + U.fmtDateShort(w.to), render(api) {
      const b = api.body;
      set(b.appendChild(h('<p class="g-prose"></p>')), null, w.ground || (w.fallow ? 'A week with no new ground, like a field left to rest. You look back at your Glimpses and choose the next question together.' : ''));
      const proof = /^writing:(\d{4}-\d{2}-\d{2})(?::(\w+))?$/.exec(w.proof || '');
      const p = proof && writing().find(x => x.date === proof[1] && (!proof[2] || (x.kind || '') === proof[2]));
      if (w.solid && p) { b.appendChild(h('<div class="tag" style="margin-top:6px">Your explanation, start to finish</div>')); b.appendChild(h('<div class="g-mine g-prose">' + prose(p.text) + '</div>')); }
      else if (!w.fallow) set(b.appendChild(h('<p class="note"></p>')), null, w.solid ? 'You explained this one start to finish.' : 'This stays faint until you can explain it from start to finish, in your own words.');
    } });
  }

  /* the Map: eight regions, lit where you've been, under fog where you haven't. Only what you explain or answer lights it */
  function mapCard(g, num) {
    const regions = arr(g && g.map && g.map.regions).filter(r => r && r.name);
    if (!regions.length) return null;
    const litN = r => arr(r.solid).filter(x => !x.faded).length + arr(r.thin).length * 0.4 + arr(r.opened).length * 0.3;
    const lit = regions.filter(r => litN(r) > 0).length;
    const s = sec(num(), 'The Map', '<span class="c"></span>'); set(s, '.sh .c', lit ? lit + ' of ' + regions.length + ' lit' : 'all under fog');
    const grid = h('<div class="g-map"></div>');
    regions.forEach(r => {
      const l = U.clamp(litN(r) / 6, 0, 1), sol = arr(r.solid).filter(x => !x.faded).length, thin = arr(r.thin).length + arr(r.solid).filter(x => x.faded).length;
      const t = h('<button class="g-reg" type="button"><span class="nm"></span><span class="st"></span></button>');
      t.style.setProperty('--lit', l.toFixed(2)); t.style.setProperty('--fx', (hash(r.id || r.name) * 100).toFixed(0) + '%'); t.style.setProperty('--fy', (hash((r.id || r.name) + 'y') * 100).toFixed(0) + '%');
      set(t, '.nm', r.name); set(t, '.st', sol || thin ? [sol ? sol + ' solid' : null, thin ? thin + ' thin' : null].filter(Boolean).join(' · ') : arr(r.opened).length ? 'newly opened' : 'fog');
      if (l > 0) t.classList.add('lit');
      t.onclick = () => regionSheet(r);
      grid.appendChild(t);
    });
    s.appendChild(grid);
    return s;
  }
  function regionSheet(r) {
    ui.sheet({ title: r.name, kicker: 'The Map', render(api) {
      const b = api.body;
      if (r.about) set(b.appendChild(h('<p class="note" style="margin-bottom:10px"></p>')), null, r.about);
      const group = (label, items, cls) => {
        if (!items.length) return;
        const sh = h('<div class="sh" style="margin-top:12px"><span class="t"></span></div>'); set(sh, '.t', label); b.appendChild(sh);
        const c = h('<div class="card"></div>');
        items.forEach(x => { const row = h('<div class="row ' + (cls || '') + (x.faded ? ' faded' : '') + '"><span class="tx"><b></b><small></small></span></div>'); set(row, 'b', x.text); set(row, 'small', (x.faded ? 'faded back · ' : '') + (isDate(x.date) ? U.fmtDateShort(x.date) : '')); c.appendChild(row); });
        b.appendChild(c);
      };
      const solid = arr(r.solid).filter(x => !x.faded), faded = arr(r.solid).filter(x => x.faded);
      group('Solid ground', solid, 'g-solid'); group('Thin ground', faded.concat(arr(r.thin))); group('Newly opened', arr(r.opened), 'g-opened');
      if (!solid.length && !faded.length && !arr(r.thin).length && !arr(r.opened).length) b.appendChild(h('<p class="empty">Fog. Nothing is marked here yet. Only what you explain or answer lights it.</p>'));
    } });
  }

  /* ---------- the Course: five subjects, each a row of tiles laid like a mosaic. Gold is solid, cracked is thin, the lit one is now ---------- */
  function courseOf(g) {
    const c = g && g.course; if (!c || !Array.isArray(c.subjects)) return null;
    const subjects = c.subjects.filter(x => x && x.id && x.name).map(sb => {
      const o = Object.assign({}, sb);
      o.units = arr(sb.units).filter(u => u && u.title).map((u, i) => Object.assign({}, u, { n: Number(u.n) || i + 1, id: sb.id + '-' + (Number(u.n) || i + 1), subject: o }));
      return o;
    });
    if (!subjects.length) return null;
    const all = subjects.flatMap(x => x.units);
    const cur = all.find(u => u.id === c.current) || all.find(u => u.state === 'current') || null;
    all.forEach(u => { u.st = u.state === 'solid' || u.state === 'thin' ? u.state : cur && u.id === cur.id ? 'current' : 'ahead'; });
    return { subjects, all, cur };
  }
  function unitById(g, id) { const c = id && courseOf(g); return c ? c.all.find(u => u.id === id) || null : null; }
  const ST_NAME = { solid: 'Solid', thin: 'Thin', current: 'Now', ahead: 'Ahead' };
  const ST_SAY = { solid: 'You can explain it start to finish.', thin: 'Some of it holds. It comes back around.', current: 'The unit you’re on.', ahead: 'Not yet. It opens when you get there.' };
  const PIECES = [
    { kind: 'piece', name: 'The piece', verb: 'Write the piece', ask: u => u.piece || 'Write what “' + u.title + '” comes to, in your own words.' },
    { kind: 'teachback', name: 'Teach-back', verb: 'Teach it back', ask: u => u.teachback || 'Teach “' + u.title + '” to someone who wasn’t there, start to finish.' }
  ];
  const pieceOf = (u, kind) => writing().filter(w => w.unit === u.id && w.kind === kind).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const proofOf = ref => { const m = /^writing:(\d{4}-\d{2}-\d{2})(?::(\w+))?(?::([\w-]+))?$/.exec(ref || ''); return m ? writing().find(x => x.date === m[1] && (!m[2] || (x.kind || '') === m[2]) && (!m[3] || x.unit === m[3])) || null : null; };
  function writeUnit(u, p, after) {
    const mine = pieceOf(u, p.kind);
    Opus.today.writeSheet(after || (() => Opus.refresh()), { free: true, prompt: p.ask(u), kind: p.kind, unit: u.id, date: mine ? mine.date : null,
      title: p.name, kicker: u.subject.name + ' ' + U.roman(u.n), tag: p.kind === 'teachback' ? 'Teach it back' : 'The piece',
      placeholder: p.kind === 'teachback' ? 'Explain it as if to someone who wasn’t there. Start at the beginning.' : 'Plain sentences. Say what you think, then why.',
      saved: 'Saved with ' + u.subject.name + ' ' + U.roman(u.n) + '.' });
  }
  const pieceBtn = (u, p) => {
    const mine = pieceOf(u, p.kind);
    const b = h('<button class="g-pbtn' + (mine ? ' done' : '') + '" type="button"><i aria-hidden="true"></i><span class="tx"><b></b><small></small></span></button>');
    set(b, 'b', mine ? p.name : p.verb); set(b, 'small', mine ? mine.words + ' words · ' + ago(mine.date) : p.kind === 'teachback' ? 'From memory' : 'In your own words');
    b.onclick = ev => { ev.stopPropagation(); writeUnit(u, p); };
    return b;
  };
  function tile(u, big) {
    const t = h('<button class="g-tile ' + u.st + (big ? ' big' : '') + '" type="button"><span>' + U.roman(u.n) + '</span></button>');
    t.setAttribute('aria-label', u.subject.name + ' ' + u.n + ': ' + u.title + ', ' + ST_NAME[u.st].toLowerCase());
    t.onclick = () => unitSheet(u);
    return t;
  }
  // until Cassius lays the course out, the page still shows its shape: the five subjects, units to come
  const SUBJECTS = [['logic', 'Logic'], ['ethics', 'Ethics'], ['people', 'People'], ['world', 'The world'], ['why', 'The why']];
  function courseCard(g, num) {
    const c = courseOf(g) || { subjects: SUBJECTS.map(([id, name]) => ({ id, name, units: [] })), all: [], cur: null, empty: true };
    const solid = c.all.filter(u => u.st === 'solid').length;
    const s = sec(num(), 'The Course', '<span class="c"></span>'); set(s, '.sh .c', c.empty ? '' : solid ? solid + ' of ' + c.all.length + ' solid' : c.all.length + ' units');
    if (c.empty) s.appendChild(h('<div class="card pad g-unow g-wait"><div class="tag">Being laid out</div><p class="small">Cassius is setting the units for each subject. They appear here as tiles as he does, with the one you’re on lit.</p></div>'));
    const u = c.cur;
    if (u) {
      const now = h('<div class="card pad g-unow tap"><div class="g-meta"><span class="tag"></span><span class="small"></span></div><div class="serif-h"></div><p class="g-uq"></p><div class="g-pbtns"></div></div>');
      set(now, '.tag', 'Now · ' + u.subject.name + ' ' + U.roman(u.n));
      set(now, '.g-meta .small', isDate(u.date) ? 'since ' + U.fmtDateShort(u.date) : '');
      set(now, '.serif-h', u.title);
      if (u.subject.question) set(now, '.g-uq', u.subject.question); else now.querySelector('.g-uq').remove();
      PIECES.forEach(p => now.querySelector('.g-pbtns').appendChild(pieceBtn(u, p)));
      now.onclick = () => unitSheet(u);
      s.appendChild(now);
    }
    const m = h('<div class="card pad g-course"></div>');
    c.subjects.forEach(sb => {
      const row = h('<div class="g-subj' + (u && u.subject.id === sb.id ? ' now' : '') + '"><button class="g-sname" type="button"><span class="t"></span><span class="small"></span></button><div class="g-tiles" role="list"></div></div>');
      set(row, '.t', sb.name);
      const so = sb.units.filter(x => x.st === 'solid').length;
      set(row, '.small', sb.units.length ? so + '/' + sb.units.length : '');
      if (c.empty) row.querySelector('.g-sname').disabled = true; else row.querySelector('.g-sname').onclick = () => subjectSheet(sb);
      sb.units.forEach(x => { const t = tile(x); t.setAttribute('role', 'listitem'); row.querySelector('.g-tiles').appendChild(t); });
      if (!sb.units.length) row.querySelector('.g-tiles').appendChild(h('<span class="small g-tnone">Units to come</span>'));
      m.appendChild(row);
    });
    m.appendChild(h('<div class="g-legend" aria-hidden="true"><span><i class="g-tile solid"></i>Solid</span><span><i class="g-tile thin"></i>Thin</span><span><i class="g-tile current"></i>Now</span><span><i class="g-tile ahead"></i>Ahead</span></div>'));
    s.appendChild(m);
    return s;
  }
  function subjectSheet(sb) {
    ui.sheet({ title: sb.name, kicker: sb.units.length + (sb.units.length === 1 ? ' unit' : ' units'), render(api) {
      const b = api.body;
      if (sb.question) set(b.appendChild(h('<div class="serif-h g-squest"></div>')), null, sb.question);
      const card = h('<div class="card"></div>');
      sb.units.forEach(u => {
        const r = h('<div class="row tap g-urow"><span class="g-tile ' + u.st + '"><span>' + U.roman(u.n) + '</span></span><span class="tx"><b></b><small></small></span>' + ui.icon('chev', 'chev ico') + '</div>');
        set(r, 'b', u.title); set(r, 'small', ST_NAME[u.st] + (isDate(u.date) ? ' · ' + U.fmtDateShort(u.date) : ''));
        r.onclick = () => unitSheet(u); card.appendChild(r);
      });
      if (!sb.units.length) card.appendChild(h('<p class="empty" style="padding:16px">Cassius hasn’t laid out these units yet.</p>'));
      b.appendChild(card);
    } });
  }
  /* a unit, whole: Cassius's mark, what it covered, and everything you wrote for it */
  function unitSheet(u) {
    const g = G();
    ui.sheet({ title: u.title, kicker: u.subject.name + ' ' + U.roman(u.n) + ' · ' + ST_NAME[u.st], render(api) {
      const b = api.body;
      const mk = h('<div class="card pad g-mark ' + u.st + '"><div class="g-mrow"><span class="g-tile ' + u.st + ' big"><span>' + U.roman(u.n) + '</span></span><span class="tx"><span class="tag"></span><span class="g-msay"></span></span></div></div>');
      set(mk, '.tag', 'Cassius’s mark · ' + ST_NAME[u.st] + (isDate(u.date) && u.st !== 'ahead' ? ' · ' + U.fmtDateShort(u.date) : ''));
      set(mk, '.g-msay', u.mark || ST_SAY[u.st]);
      b.appendChild(mk);
      const un = noteFor('unit:' + u.id); if (un) b.appendChild(noteBox(un, 'Cassius on this unit'));
      // what it covered: his summary, then the sittings that belonged to it
      const sits = arr(g && g.lessons).concat(g && g.lesson ? [g.lesson] : []).filter(l => l && l.unit === u.id && l.title).sort((a, z) => String(a.date).localeCompare(String(z.date)));
      if (u.covered || sits.length) {
        b.appendChild(h('<div class="sh" style="margin-top:16px"><span class="t">What it covered</span></div>'));
        if (u.covered) b.appendChild(h('<div class="g-prose g-cov">' + prose(u.covered) + '</div>'));
        if (sits.length) {
          const card = h('<div class="card" style="margin-top:8px"></div>');
          sits.forEach(l => { const r = h('<div class="row tap"><span class="tx"><b></b><small></small></span>' + ui.icon('chev', 'chev ico') + '</div>'); set(r, 'b', l.title); set(r, 'small', [U.fmtDateShort(l.date), l.form].filter(Boolean).join(' · ') + (asks(l) && answerTo(kindFor(l), l.question) ? ' · answered' : '')); r.onclick = () => lessonSheet(l, () => Opus.refresh()); card.appendChild(r); });
          b.appendChild(card);
        }
      } else if (u.st !== 'ahead') b.appendChild(h('<p class="note" style="margin-top:12px">Cassius hasn’t written up what this unit covered yet.</p>'));
      // your writing for it
      const proof = proofOf(u.proof);
      const mine = writing().filter(w => w.unit === u.id && w.kind !== 'reply').concat(proof && proof.unit !== u.id ? [proof] : []).sort((a, z) => z.date.localeCompare(a.date));
      if (u.st !== 'ahead' || mine.length) {
        b.appendChild(h('<div class="sh" style="margin-top:18px"><span class="t">Your writing for it</span></div>'));
        if (u.st !== 'ahead') { const pb = h('<div class="g-pbtns" style="margin-top:6px"></div>'); PIECES.forEach(p => { const x = pieceBtn(u, p); x.onclick = () => { api.close(true); writeUnit(u, p, () => { Opus.refresh(); unitSheet(Object.assign(u, {})); }); }; pb.appendChild(x); }); b.appendChild(pb); }
        mine.forEach(w => {
          const c = h('<div class="g-uw"><div class="g-meta"><span class="tag"></span><span class="small"></span></div><div class="g-mine g-prose"></div></div>');
          set(c, '.tag', (KIND_NAME[w.kind || ''] || 'Writing') + (proof && w === proof ? ' · his proof' : ''));
          set(c, '.small', U.fmtDateShort(w.date) + ' · ' + w.words + ' words');
          c.querySelector('.g-prose').innerHTML = prose(w.text);
          b.appendChild(c);
          const n = noteOnWriting(w); if (n) b.appendChild(noteBox(n, 'Cassius on this'));
        });
      }
      const tb = h('<div class="btns" style="margin-top:18px"></div>');
      tb.appendChild(talkLink('btn quiet', 'Talk it through')); b.appendChild(tb);
    } });
  }

  /* ---------- Talk: the conversation lives in Claude Duet. One tap here, and a quiet coin at the corner once you scroll past ---------- */
  function talkCard(g, num, v) {
    const s = sec(num(), 'Talk');
    const a = h('<a class="card g-talk"><img src="icons/cassius.svg" alt=""><span class="tx"><b>Talk with Cassius</b><small>Opens your chat with him in Claude Duet. Questions, pushback, anything that needs a back and forth.</small></span><svg class="g-out" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg></a>');
    a.href = talkUrl(); s.appendChild(a);
    const fab = h('<a class="g-talkfab" aria-label="Talk with Cassius"><img src="icons/cassius.svg" alt=""><span>Talk</span></a>');
    fab.href = talkUrl(); v.appendChild(fab);
    // the coin waits in the corner whenever the Talk card itself isn't in view
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => es.forEach(e => fab.classList.toggle('show', e.intersectionRatio < 0.5)), { threshold: [0, 0.5, 1] }); io.observe(a); }
    else fab.classList.add('show');
    return s;
  }

  /* ---------- The Ledger: Cassius's teaching log, kept honestly, and his monthly letters ---------- */
  const changelog = g => arr(g && g.changelog).filter(x => x && isDate(x.date) && (x.text || x.tried || x.happened || x.changing)).sort((a, b) => b.date.localeCompare(a.date));
  const clRef = x => 'changelog:' + x.date + ':' + (x.kind === 'letter' ? 'letter' : 'entry');
  function changeCard(x) {
    if (x.kind === 'letter') {
      const c = h('<button class="g-letter" type="button"><span class="g-fold" aria-hidden="true"></span><span class="tag"></span><span class="serif-h"></span><span class="small"></span></button>');
      set(c, '.tag', 'His letter · ' + U.MONTHS[U.parseKey(x.date).getMonth()]); set(c, '.serif-h', x.title || 'How the month went');
      set(c, '.small', replyTo(clRef(x)) ? 'Tap to unfold · you wrote back' : 'Tap to unfold');
      c.onclick = () => ui.sheet({ title: x.title || 'A letter', kicker: 'From Cassius · ' + U.fmtDateShort(x.date), render(api) { api.body.appendChild(h('<div class="g-prose g-paper">' + prose(x.text || '') + '</div>')); api.body.appendChild(replyBox(clRef(x), x.title || x.text)); } });
      return c;
    }
    const c = h('<div class="card pad g-log"><div class="g-meta"><span class="tag"></span></div></div>');
    set(c, '.tag', 'Teaching log · ' + ago(x.date));
    if (x.title) set(c.appendChild(h('<div class="serif-h"></div>')), null, x.title);
    [['tried', 'I tried'], ['happened', 'What happened'], ['changing', 'What I’m changing']].forEach(([k, lab]) => {
      if (!x[k]) return; const r = h('<div class="g-lrow"><span class="tag"></span><div class="g-prose"></div></div>'); set(r, '.tag', lab); r.querySelector('.g-prose').innerHTML = prose(x[k]); c.appendChild(r);
    });
    if (x.text) c.appendChild(h('<div class="g-prose g-ltext">' + prose(x.text) + '</div>'));
    c.appendChild(replyBox(clRef(x), x.title || x.changing || x.text));
    return c;
  }
  function changedCard(g, num) {
    const list = changelog(g);
    if (!list.length) { const e = sec(num(), 'The Ledger'); e.appendChild(h('<div class="card pad g-wait"><p class="small">Cassius’s teaching log and his monthly letters land here: what he tried with you, what happened, and what he’s changing. Nothing written yet.</p></div>')); return e; }
    const s = sec(num(), 'The Ledger', list.length > 3 ? '<button class="c" type="button">All</button>' : '');
    const more = s.querySelector('button.c'); if (more) more.onclick = () => ui.sheet({ title: 'The Ledger', kicker: 'Cassius’s teaching log · ' + list.length, render(api) { list.forEach(x => { const c = changeCard(x); c.style.marginBottom = '10px'; api.body.appendChild(c); }); } });
    list.slice(0, 3).forEach(x => s.appendChild(changeCard(x)));
    return s;
  }

  /* ---------- the Scroll: every word you write, as a scroll that grows ---------- */
  const ownedWords = g => { // a taught word turns gold the first time you use it in your own writing, unprompted
    const ws = writing().slice().sort((a, b) => a.date.localeCompare(b.date));
    return arr(g && g.lexicon).filter(x => x && x.word).map(x => {
      const re = new RegExp('\\b' + String(x.word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w{0,3}\\b', 'i');
      const hit = ws.find(w => (!x.taught || w.date >= x.taught) && re.test(w.text) && !re.test(w.prompt || ''));
      return Object.assign({}, x, { owned: hit ? hit.date : null });
    });
  };
  function scrollCard(g, num, sn) {
    const ws = writing();
    const byDay = {}; ws.forEach(w => { byDay[w.date] = (byDay[w.date] || 0) + (w.words || words(w.text)); });
    const days = Object.keys(byDay).sort(), total = U.sum(days.map(d => byDay[d]));
    const lex = ownedWords(g), owned = lex.filter(x => x.owned);
    const gilded = arr(g && g.gilded).filter(x => x && x.text && isDate(x.date));
    const s = sec(num(), 'The Scroll', ws.length ? '<button class="c" type="button">All writing</button>' : '');
    const ab = s.querySelector('button.c'); if (ab) ab.onclick = allWriting;
    const c = h('<div class="card pad g-scrollc"><div class="g-scroll" data-noswipe><span class="rod l" aria-hidden="true"></span><div class="g-paper2"></div><span class="rod r" aria-hidden="true"></span></div>' +
      '<div class="g-stotal"><b class="num"></b><span class="small"></span></div><div class="g-smarks"></div><div class="btns g-sbtns"></div></div>');
    const paper = c.querySelector('.g-paper2');
    // milestones: the length of a book on your shelf, only once Cassius has checked its real word count
    const books = arr(g && g.reading).filter(b => b && b.title && Number(b.words) > 0).sort((a, b) => a.words - b.words);
    let run = 0; const passed = [];
    if (!days.length) paper.appendChild(h('<span class="g-blank">Your first words will be the first ink here.</span>'));
    const start1 = sn && sn.s && sn.s.start;
    days.forEach(d => {
      const n = byDay[d], age = U.daysBetween(U.parseKey(d), new Date());
      const col = h('<button class="g-col" type="button"><span class="ink"></span></button>');
      col.style.setProperty('--w', Math.round(U.clamp(n / 6, 10, 64)) + 'px');
      col.style.setProperty('--dry', U.clamp(age / 10, 0, 1).toFixed(2));
      col.style.setProperty('--fill', U.clamp(0.3 + n / 300, 0.3, 1).toFixed(2));
      col.dataset.band = start1 && d >= start1 ? 's1' : 's0';
      if (age === 0) col.classList.add('wet');
      if (gilded.some(x => x.date === d)) col.appendChild(h('<i class="gold" aria-hidden="true"></i>'));
      const before = run; run += n;
      books.forEach(b => { if (before < b.words && run >= b.words) { passed.push({ b, d }); col.appendChild(h('<i class="mile" aria-hidden="true"></i>')); } });
      col.setAttribute('aria-label', longDay(d) + ': ' + n + ' words');
      col.onclick = () => daySheet(d, g);
      paper.appendChild(col);
    });
    set(c, '.g-stotal b', total.toLocaleString());
    const wk = []; for (let i = 0; i < 7; i++) wk.push(byDay[U.key(U.addDays(new Date(), -i))] || 0);
    set(c, '.g-stotal .small', total ? (total === 1 ? 'word' : 'words') + ' on the scroll · ' + U.sum(wk).toLocaleString() + ' this week' : 'words so far');
    const marks = c.querySelector('.g-smarks');
    const mark = (cls, text) => { const m = h('<span class="g-mk"><i class="' + cls + '"></i><span></span></span>'); set(m, 'span span', text); marks.appendChild(m); };
    if (gilded.length) mark('gold', gilded.length + ' gilded');
    if (passed.length) mark('mile', 'Longer than ' + passed[passed.length - 1].b.title);
    if (!marks.children.length) marks.remove();
    const bt = c.querySelector('.g-sbtns');
    const wb = h('<button class="btn quiet" type="button">Write</button>'); wb.onclick = () => Opus.today.writeSheet(() => Opus.refresh()); bt.appendChild(wb);
    // press and hold the scroll to see it in seasonal bands
    const sc = c.querySelector('.g-scroll');
    hold(sc, () => { sc.classList.toggle('bands'); ui.buzz(10); ui.toast(sc.classList.contains('bands') ? (start1 ? 'Seasons: before Cassius, then ' + seasonName(sn.s) : 'One season so far') : 'Back to ink'); }, 600);
    requestAnimationFrame(() => { sc.scrollLeft = sc.scrollWidth; });
    s.appendChild(c);
    return s;
  }
  function daySheet(d, g) {
    const ws = writing().filter(w => w.date === d), gl = arr(g && g.gilded).filter(x => x.date === d), own = ownedWords(g).filter(x => x.owned === d);
    ui.sheet({ title: longDay(d), kicker: U.sum(ws.map(w => w.words)) + ' words', render(api) {
      const b = api.body;
      gl.forEach(x => b.appendChild(take('Gilded · the sentence Cassius quoted back', x.text, 'g-gild')));
      own.forEach(x => b.appendChild(take('A word became yours', x.word + (x.meaning ? ': ' + x.meaning : ''))));
      const card = h('<div class="card" style="margin-top:10px"></div>');
      ws.forEach(w => { const r = h('<div class="row tap"><span class="tx"><b></b><small></small></span>' + ui.icon('chev', 'chev ico') + '</div>'); set(r, 'b', w.prompt || 'Free writing'); set(r, 'small', (KIND_NAME[w.kind || ''] || 'Writing') + ' · ' + w.words + ' words'); r.onclick = () => writingSheet(w); card.appendChild(r); });
      b.appendChild(card);
    } });
  }
  function lexiconSheet(lex) {
    ui.sheet({ title: 'Lexicon', kicker: lex.filter(x => x.owned).length + ' of ' + lex.length + ' yours', render(api) {
      api.body.appendChild(h('<p class="note" style="margin-bottom:8px">Words Cassius has taught you. Each turns gold the first time you use it in your own writing without being asked to.</p>'));
      const c = h('<div class="card"></div>');
      lex.slice().sort((a, b) => (b.owned ? 1 : 0) - (a.owned ? 1 : 0) || String(b.taught || '').localeCompare(String(a.taught || ''))).forEach(x => {
        const r = h('<div class="row g-lex' + (x.owned ? ' owned' : '') + '"><span class="tx"><b></b><small></small></span><span class="tm small"></span></div>');
        set(r, 'b', x.word); set(r, 'small', x.meaning || ''); set(r, '.tm', x.owned ? 'yours since ' + U.fmtDateShort(x.owned) : x.taught ? 'taught ' + U.fmtDateShort(x.taught) : '');
        c.appendChild(r);
      });
      api.body.appendChild(c);
    } });
  }

  /* ---------- Glimpses: a night sky, one star for each moment it all came together. Never asked for ---------- */
  function addGlimpse() {
    const who = [], known = [...new Set(glimpses().flatMap(x => arr(x.who)))].slice(-10);
    let day = today();
    ui.sheet({ title: 'A Glimpse', kicker: 'One line, when it comes together', foot: true, render(api) {
      const b = api.body;
      const ta = h('<textarea class="input g-gin" maxlength="280" placeholder="What happened, in one line."></textarea>'); b.appendChild(ta);
      const dc = h('<div class="chips" style="margin-top:10px"><button class="chip on" type="button">Today</button><button class="chip" type="button">Yesterday</button></div>');
      dc.querySelectorAll('.chip').forEach((c, i) => c.onclick = () => { day = U.key(U.addDays(new Date(), -i)); dc.querySelectorAll('.chip').forEach((x, j) => x.classList.toggle('on', i === j)); });
      b.appendChild(dc);
      const f = h('<div class="field" style="margin-top:14px"><label>Who was there</label></div>'); b.appendChild(f);
      const wc = h('<div class="chips"></div>');
      const drawW = () => { wc.innerHTML = ''; [...new Set(known.concat(who))].forEach(n => { const c = h('<button class="chip' + (who.includes(n) ? ' on' : '') + '" type="button"></button>'); c.textContent = n; c.onclick = () => { const i = who.indexOf(n); if (i >= 0) who.splice(i, 1); else who.push(n); drawW(); }; wc.appendChild(c); }); };
      const add = h('<input class="input" placeholder="Add a name, or leave it blank" maxlength="40">');
      add.addEventListener('keydown', e => { if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); who.push(add.value.trim()); add.value = ''; drawW(); } });
      f.appendChild(wc); f.appendChild(add); drawW();
      b.appendChild(h('<p class="note" style="margin-top:10px">Nobody will ever remind you to log one. A Glimpse only counts when something real happened.</p>'));
      const sv = h('<button class="btn block" type="button">Add the star</button>');
      sv.onclick = () => {
        const line = ta.value.trim().replace(/\s+/g, ' '); if (!line) { ta.focus(); return; }
        if (add.value.trim()) who.push(add.value.trim());
        const x = { id: day + '-' + Math.random().toString(36).slice(2, 6), date: day, line, who: [...new Set(who)], at: new Date().toISOString() };
        Store.data.glimpses = arr(Store.data.glimpses).concat([x]); Store.save(); ui.buzz([8, 40, 8]); api.close(); ui.toast('A new star. Cassius will read it.'); Opus.refresh();
      };
      api.foot.appendChild(sv);
      setTimeout(() => ta.focus(), 350);
    } });
  }
  function glimpseSheet(x, fig) {
    ui.sheet({ title: longDay(x.date), kicker: fig ? 'Glimpse · ' + fig.name : 'Glimpse', render(api) {
      const b = api.body;
      set(b.appendChild(h('<div class="g-gline"></div>')), null, x.line);
      if (arr(x.who).length) set(b.appendChild(h('<p class="small"></p>')), null, 'With ' + arr(x.who).join(', '));
      if (fig && fig.about) b.appendChild(take(fig.name, fig.about));
      const n = noteFor('glimpse:' + x.id); if (n) b.appendChild(noteBox(n, 'Cassius on this'));
      const del = h('<button class="btn ghost" type="button" style="margin-top:18px">Take this star out</button>');
      del.onclick = async () => {
        if (!(await ui.ask({ title: 'Take it out?', text: 'This Glimpse leaves the sky and your logs.', yes: 'Take it out', danger: true }))) return;
        const dl = Store.data.deleted = Store.data.deleted || {}; dl.glimpses = dl.glimpses || {}; dl.glimpses[x.id] = new Date().toISOString();
        Store.data.glimpses = arr(Store.data.glimpses).filter(y => y.id !== x.id); Store.save(); api.close(); Opus.refresh();
      };
      b.appendChild(del);
    } });
  }
  function glimpsesCard(g, num) {
    const list = glimpses(), figs = arr(g && g.constellations).filter(f => f && f.name && arr(f.glimpses).length);
    const s = sec(num(), 'Glimpses', list.length ? '<span class="c"></span>' : ''); if (list.length) set(s, '.sh .c', list.length + (list.length === 1 ? ' star' : ' stars'));
    const sky = h('<div class="g-sky"><svg class="g-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg><div class="g-dust" aria-hidden="true"></div><button class="g-plus" type="button" aria-label="Log a Glimpse">' + ui.icon('plus') + '</button></div>');
    let dd = '';
    for (let i = 0; i < 46; i++) dd += '<i style="left:' + (hash('d' + i) * 100).toFixed(1) + '%;top:' + (hash('e' + i) * 100).toFixed(1) + '%;opacity:' + (0.1 + hash('f' + i) * 0.22).toFixed(2) + '"></i>';
    sky.querySelector('.g-dust').innerHTML = dd;
    const pos = {};
    const figOf = id => figs.find(f => f.glimpses.includes(id)) || null;
    // a star sits where its id puts it; stars in a figure gather toward the figure's own part of the sky
    list.forEach(x => {
      const f = figOf(x.id);
      let px = 8 + hash(x.id) * 84, py = 12 + hash(x.id + 'y') * 72;
      if (f) { const cx = 16 + hash(f.name) * 68, cy = 22 + hash(f.name + 'y') * 50; px = cx + (px - 50) * 0.34; py = cy + (py - 50) * 0.42; }
      pos[x.id] = [U.clamp(px, 5, 90), U.clamp(py, 8, 88)];
      const st = h('<button class="g-star" type="button"></button>');
      st.style.left = pos[x.id][0] + '%'; st.style.top = pos[x.id][1] + '%';
      st.style.setProperty('--s', (0.8 + Math.min(1, x.line.length / 140) * 0.7).toFixed(2));
      st.style.setProperty('--tw', (2.5 + hash(x.id + 't') * 4).toFixed(1) + 's');
      if (U.daysBetween(U.parseKey(x.date), new Date()) <= 1) st.classList.add('new');
      st.setAttribute('aria-label', 'Glimpse, ' + U.fmtDateShort(x.date) + ': ' + x.line);
      st.onclick = () => glimpseSheet(x, f);
      sky.appendChild(st);
    });
    let lines = '';
    figs.forEach(f => {
      const pts = f.glimpses.map(id => pos[id]).filter(Boolean);
      for (let i = 1; i < pts.length; i++) lines += '<line x1="' + pts[i - 1][0] + '" y1="' + pts[i - 1][1] + '" x2="' + pts[i][0] + '" y2="' + pts[i][1] + '"/>';
      if (pts.length > 1) { const lb = h('<span class="g-fig"></span>'); lb.textContent = f.name; lb.style.left = (U.sum(pts.map(p => p[0])) / pts.length) + '%'; lb.style.top = Math.min(93, Math.max(...pts.map(p => p[1])) + 7) + '%'; sky.appendChild(lb); }
    });
    sky.querySelector('.g-lines').innerHTML = lines;
    if (!list.length) sky.appendChild(h('<p class="g-skye">When a moment comes together, tap + and write one line about it. Each one becomes a star.</p>'));
    sky.querySelector('.g-plus').onclick = addGlimpse;
    s.appendChild(sky);
    return s;
  }

  /* ---------- the Portrait, and your creed beside it ---------- */
  function evidenceSheet(line, p) {
    ui.sheet({ title: 'Where this line comes from', kicker: (p.sketch ? 'Sketch' : 'Portrait') + ' · ' + U.fmtDateShort(p.date), render(api) {
      const b = api.body;
      set(b.appendChild(h('<div class="serif-h" style="font-size:22px;margin-bottom:12px"></div>')), null, line.text);
      const ev = arr(line.evidence);
      if (!ev.length) { b.appendChild(h('<p class="note">Cassius left no evidence under this line. Ask him for it. He owes you some.</p>')); return; }
      ev.forEach(e => {
        const m = /^(glimpse|writing|lesson|recall|teachback|workshop|walk|seal|talk):(.+)$/.exec(e.on || '');
        const what = !m ? 'Evidence' : m[1] === 'glimpse' ? 'A Glimpse' : m[1] === 'talk' ? 'Something you said' : KIND_NAME[m[1] === 'writing' ? '' : m[1]] || 'Your writing';
        const when = m && isDate(m[2].slice(0, 10)) ? ' · ' + U.fmtDateShort(m[2].slice(0, 10)) : '';
        const t = take(what + when, e.quote || '', 'g-ev');
        const gl = m && m[1] === 'glimpse' ? glimpses().find(x => x.id === m[2]) : null;
        const wr = m && !gl && m[1] !== 'talk' ? writing().find(x => x.date === m[2].slice(0, 10) && (m[1] === 'writing' ? !x.kind : x.kind === m[1])) : null;
        if (gl || wr) { t.classList.add('tap'); t.onclick = () => (gl ? glimpseSheet(gl) : writingSheet(wr)); }
        b.appendChild(t);
      });
    } });
  }
  function portraitSheet(versions) {
    ui.sheet({ title: 'Earlier portraits', kicker: versions.length + (versions.length === 1 ? ' version' : ' versions'), render(api) {
      versions.forEach(p => { const c = h('<div class="card pad g-pold"><div class="tag"></div></div>'); set(c, '.tag', (p.sketch ? 'Sketch' : 'Portrait') + (p.season ? ' · Season ' + U.roman(p.season) : '') + ' · ' + U.fmtDateShort(p.date)); arr(p.lines).forEach(l => set(c.appendChild(h('<p class="g-pline"></p>')), null, l.text)); api.body.appendChild(c); });
    } });
  }
  function portraitCard(g, num, sn) {
    const p = g && g.portrait, past = arr(g && g.portraits);
    const s = sec(num(), 'The Portrait', past.length ? '<button class="c" type="button">Earlier</button>' : '');
    const pb = s.querySelector('button.c'); if (pb) pb.onclick = () => portraitSheet(past.slice().sort((a, b) => b.date.localeCompare(a.date)));
    const c = h('<div class="card pad g-portrait"><span class="g-corner tl" aria-hidden="true"></span><span class="g-corner br" aria-hidden="true"></span><div class="tag"></div><div class="g-plines"></div></div>');
    if (p && arr(p.lines).length) {
      set(c, '.tag', (p.sketch ? 'A sketch' : 'The man the evidence points to') + ' · ' + (p.season ? 'Season ' + U.roman(p.season) + ' · ' : '') + U.fmtDateShort(p.date));
      arr(p.lines).forEach(l => { const r = h('<button class="g-pline" type="button"></button>'); r.textContent = l.text; r.onclick = () => evidenceSheet(l, p); c.querySelector('.g-plines').appendChild(r); });
      c.appendChild(h('<p class="small g-pnote">Tap a line for its evidence. Argue with any of them.</p>'));
    } else {
      const first = sn && sn.s && isDate(sn.s.start) ? U.key(U.addDays(U.parseKey(sn.s.start), 6)) : null;
      set(c, '.tag', 'Not drawn yet');
      set(c.querySelector('.g-plines').appendChild(h('<p class="g-pempty"></p>')), null, first ? 'The first sketch comes ' + longDay(first) + ', after a week of evidence. Every line will have something you wrote or lived under it.' : 'The first sketch comes after a week of evidence.');
    }
    s.appendChild(c);
    const cr = creedCard(g); if (cr) s.appendChild(cr);
    return s;
  }
  /* the creed: the Oct 28 lines, being rewritten in plain words. One line a day; the new words sit over the old */
  function creedCard(g) {
    const cr = g && g.creed, lines = arr(cr && cr.lines).filter(Boolean); if (!lines.length) return null;
    const plain = {}; arr(cr.plain).forEach(x => { if (x && Number.isInteger(x.i) && x.text) plain[x.i] = x; });
    const done = Object.keys(plain).length;
    const t = cr.today, i = Number.isInteger(t) && t >= 0 && t < lines.length ? t : Math.floor(U.parseKey(today()).getTime() / 864e5) % lines.length;
    const c = h('<div class="card pad g-creed2"><div class="g-meta"><span class="tag">Your creed · line ' + U.roman(i + 1) + '</span><span class="small num"></span></div><div class="g-cnew"></div><div class="g-cold"></div><button class="link" type="button"></button></div>');
    set(c, '.g-meta .small', done ? done + ' of ' + lines.length + ' in your words' : 'plain words begin Saturday');
    if (plain[i]) { set(c, '.g-cnew', plain[i].text); set(c, '.g-cold', lines[i]); } else { set(c, '.g-cnew', lines[i]); c.querySelector('.g-cold').remove(); }
    set(c, '.link', 'Read all ' + lines.length + ' lines');
    c.querySelector('.link').onclick = () => ui.sheet({ title: 'Your creed', kicker: 'Written ' + (isDate(cr.written) ? U.fmtDateShort(cr.written) : 'with Cassius') + (done ? ' · ' + done + ' rewritten' : ''), render(api) {
      api.body.appendChild(h('<p class="note" style="margin-bottom:10px">You’re putting it in plain words this season, a line or two each Saturday. The new words sit over the old.</p>'));
      lines.forEach((l, k) => { const r = h('<div class="g-cl"><span class="n">' + U.roman(k + 1) + '</span><span class="t"><span class="nw"></span><span class="od"></span></span></div>'); if (plain[k]) { set(r, '.nw', plain[k].text); set(r, '.od', l); } else { set(r, '.nw', l); r.querySelector('.od').remove(); } api.body.appendChild(r); });
    } });
    return c;
  }

  /* ---------- the Library: the foundation book and the novel, four shelves, honest verdicts ---------- */
  const SHELF = { foundation: 'Foundation', workbench: 'Workbench', tribunal: 'The Tribunal shelf', fire: 'The fire' };
  const SHELF_NOTE = { foundation: 'Read slowly, with Cassius', workbench: 'Tools. Take what works', tribunal: 'Claims to put on trial', fire: 'For the love of it' };
  function bookSheet(bk) {
    const pg = pageOf(bk.id);
    ui.sheet({ title: bk.title, kicker: [bk.author, SHELF[bk.shelf]].filter(Boolean).join(' · ') || 'Reading', render(api) {
      const b = api.body;
      if (bk.verdict) { const v = take('Cassius’s verdict', bk.verdict); v.style.marginTop = '0'; b.appendChild(v); }
      if (bk.why) set(b.appendChild(h('<p class="note" style="margin:10px 0 4px"></p>')), null, bk.why);
      const n = noteFor('book:' + bk.id); if (n) b.appendChild(noteBox(n, 'Cassius on this book'));
      const f = h('<div class="field" style="margin-top:14px"><label>Page you’re on</label></div>'); b.appendChild(f);
      const st = ui.stepper({ label: 'Page', value: pg ? pg.page : null, placeholder: '0', unit: bk.pages ? 'of ' + bk.pages : 'pages', step: (v, dir) => Math.max(0, (v || 0) + dir * 10) });
      f.appendChild(st.el);
      const btns = h('<div class="btns" style="margin-top:12px"><button class="btn quiet" type="button">' + (pg && pg.done ? 'Not finished' : 'Finished it') + '</button><button class="btn" type="button">Save page</button></div>');
      const [fin, sv] = btns.children;
      const put = (page, done) => {
        const rec = { id: bk.id, page: page == null ? null : Math.round(page), date: today() }; if (done) rec.done = true;
        Store.data.reading = arr(Store.data.reading).filter(r => r.id !== bk.id).concat([rec]); Store.save(); api.close(); Opus.refresh();
      };
      sv.onclick = () => { const v = st.get(); put(bk.pages && v > bk.pages ? bk.pages : v, false); ui.toast('Page saved'); };
      fin.onclick = () => { if (pg && pg.done) { put(st.get(), false); return; } put(bk.pages || st.get(), true); ui.toast('Finished. Tell Cassius what stayed with you.'); };
      b.appendChild(btns);
      // a line that struck you goes in the Commonplace
      const f2 = h('<div class="field" style="margin-top:22px"><label>A line that struck you</label></div>'); b.appendChild(f2);
      const ta = h('<textarea class="input" style="min-height:84px;font-family:var(--serif);font-size:18px" placeholder="Copy it exactly."></textarea>'); f2.appendChild(ta);
      const kb = h('<button class="btn ghost" type="button" style="margin-top:8px">Keep it in your Commonplace</button>');
      kb.onclick = () => { const t = ta.value.trim(); if (!t) { ta.focus(); return; } const p = st.get(); Store.data.kept = kept().concat([{ id: 'line:' + Date.now().toString(36), date: today(), text: t, from: bk.title + (bk.author ? ', ' + bk.author : '') + (p ? ', p. ' + p : '') }]); Store.save(); ta.value = ''; ui.buzz(10); ui.toast('Kept.'); };
      f2.appendChild(kb);
    } });
  }
  function libraryCard(g, num) {
    const books = arr(g && g.reading).filter(b => b && b.title);
    if (!books.length) return null;
    const isDone = b => b.status === 'done' || !!(pageOf(b.id) || {}).done;
    const now = books.filter(b => b.status === 'reading' && !isDone(b));
    // always one book with Cassius beside the novel: if none is open yet, the season's book (or the next one) waits here
    if (!now.some(b => b.shelf !== 'fire')) { const sb = (g.season && books.find(b => b.id === g.season.book && !isDone(b))) || books.find(b => b.status === 'next' && b.shelf !== 'fire'); if (sb) now.push(sb); }
    now.sort((a, b) => (a.shelf === 'fire') - (b.shelf === 'fire'));
    const s = sec(num(), 'The Library', '<button class="c" type="button">Shelves</button>');
    s.querySelector('button.c').onclick = () => shelvesSheet(books, isDone);
    const c = h('<div class="card"></div>');
    (now.length ? now : books.filter(b => b.status === 'next').slice(0, 2)).forEach(b => {
      const sbk = g.season && g.season.book === b.id;
      const pg = pageOf(b.id), page = pg && pg.page != null ? pg.page : null, pct = page != null && b.pages ? U.clamp(page / b.pages, 0, 1) : null;
      const r = h('<div class="row tap g-book"><span class="g-spine" aria-hidden="true"></span><span class="tx"><span class="tag"></span><b></b><small></small>' +
        (pct != null ? '<span class="g-prog"><span class="bar"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></span><span class="small num">' + Math.round(pct * 100) + '%</span></span>' : '') + '</span>' + ui.icon('chev', 'chev ico') + '</div>');
      r.querySelector('.g-spine').dataset.shelf = b.shelf || '';
      set(r, '.tag', b.shelf === 'fire' ? 'For the love of it' : b.status === 'reading' ? 'With Cassius' : sbk && g.season.start > today() ? 'With Cassius from ' + U.fmtDateShort(g.season.start) : 'Next');
      set(r, 'b', b.title);
      set(r, 'small', [b.author, page != null ? 'page ' + page + (b.pages ? ' of ' + b.pages : '') : sbk && g.season.bookPart ? g.season.bookPart : b.status === 'reading' ? 'tap to log your page' : null].filter(Boolean).join(' · '));
      r.onclick = () => bookSheet(b); c.appendChild(r);
    });
    const kp = kept().length;
    const cp = h('<div class="row tap"><span class="g-spine cp" aria-hidden="true"></span><span class="tx"><b>Commonplace</b><small></small></span>' + ui.icon('chev', 'chev ico') + '</div>');
    set(cp, 'small', kp ? kp + (kp === 1 ? ' line that landed' : ' lines that landed') : 'Lines that strike you, kept');
    cp.onclick = commonplace; c.appendChild(cp);
    s.appendChild(c);
    return s;
  }
  function shelvesSheet(books, isDone) {
    ui.sheet({ title: 'Your shelves', kicker: books.length + ' books, judged honestly', render(api) {
      ['foundation', 'workbench', 'tribunal', 'fire', ''].forEach(k => {
        const list = books.filter(b => (b.shelf || '') === k); if (!list.length) return;
        const sh = h('<div class="sh" style="margin-top:14px"><span class="t"></span><span class="c"></span></div>'); set(sh, '.t', SHELF[k] || 'Other'); set(sh, '.c', SHELF_NOTE[k] || ''); api.body.appendChild(sh);
        const c = h('<div class="card"></div>');
        list.forEach(b => { const r = h('<div class="row tap' + (isDone(b) ? ' g-done' : '') + '"><span class="tx"><b></b><small></small></span><span class="tm small"></span></div>'); set(r, 'b', b.title); set(r, 'small', b.verdict || b.author || ''); set(r, '.tm', isDone(b) ? 'read' : b.status === 'reading' ? 'now' : b.status === 'next' ? 'next' : ''); r.onclick = () => bookSheet(b); c.appendChild(r); });
        api.body.appendChild(c);
      });
    } });
  }

  /* ---------- Made: what exists now that didn't before ---------- */
  function madeCard(g, num, sn) {
    const list = arr(g && g.made).filter(m => m && m.title);
    const s = sec(num(), 'Made', list.length ? '<span class="c"></span>' : ''); if (list.length) set(s, '.sh .c', String(list.length));
    const shelf = h('<div class="g-made"><span class="g-plank" aria-hidden="true"></span></div>');
    if (!list.length) {
      const mk = sn && sn.weeks.find(w => w.makes);
      set(shelf.insertBefore(h('<p class="g-madee"></p>'), shelf.firstChild), null, mk ? 'Nothing made yet. The first thing on this shelf is ' + mk.makes + ', in week ' + U.roman(mk.n) + ' (from ' + U.fmtDateShort(mk.from) + ').' : 'What you make lands on this shelf.');
    }
    list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(m => {
      const b = h('<button class="g-vol" type="button"><span class="ti"></span><span class="yr"></span></button>');
      b.style.setProperty('--h', (112 + hash(m.id || m.title) * 36).toFixed(0) + 'px'); b.style.setProperty('--tone', (hash(m.title) * 0.5).toFixed(2));
      set(b, '.ti', m.title); set(b, '.yr', m.season ? U.roman(m.season) : '');
      b.onclick = () => ui.sheet({ title: m.title, kicker: [m.kind, m.season ? 'Season ' + U.roman(m.season) : null, isDate(m.date) ? U.fmtDateShort(m.date) : null].filter(Boolean).join(' · '), render(api) {
        api.body.appendChild(h('<div class="g-prose g-paper">' + prose(m.text || m.summary || '') + '</div>'));
        const then = /^writing:(\d{4}-\d{2}-\d{2})(?::(\w+))?$/.exec(m.then || ''), tw = then && writing().find(x => x.date === then[1] && (!then[2] || (x.kind || '') === then[2]));
        if (tw) { set(api.body.appendChild(h('<div class="tag" style="margin-top:16px"></div>')), null, 'Then: where it started, ' + U.fmtDateShort(tw.date)); api.body.appendChild(h('<div class="g-mine g-prose">' + prose(tw.text) + '</div>')); }
        const n = noteFor('made:' + (m.id || '')); if (n) api.body.appendChild(noteBox(n, 'Cassius on it'));
      } });
      shelf.insertBefore(b, shelf.lastChild);
    });
    s.appendChild(shelf);
    return s;
  }

  /* ---------- Cassius himself: his portrait in the corner, and the pieces of his story he's told you ---------- */
  function cassiusSheet() {
    const told = notes().filter(n => n.kind === 'story').sort((a, b) => a.date.localeCompare(b.date));
    ui.sheet({ title: 'Cassius', kicker: 'Your teacher', render(api) {
      const b = api.body;
      b.appendChild(h('<img class="g-medal-big" src="icons/cassius.svg" alt="Cassius, drawn as a profile on an old coin">'));
      b.appendChild(h('<p class="lede" style="margin:6px 0 16px">An old man with a Roman name and a Greek education. He tells his story slowly.</p>'));
      if (!told.length) { b.appendChild(h('<p class="empty">He hasn’t told you anything about himself yet. When he does, it collects here.</p>')); return; }
      b.appendChild(h('<div class="sh"><span class="t">What he’s told you</span></div>'));
      told.forEach(n => { const c = h('<div class="g-take"><div class="tag"></div><div class="g-prose"></div></div>'); set(c, '.tag', U.fmtDateShort(n.date)); c.querySelector('.g-prose').innerHTML = prose(n.text); b.appendChild(c); });
    } });
  }

  function render(v) {
    const g = G(), d = new Date(), sn = seasonNow(g);
    if (Store.data.growth && Store.data.growth.updated && Store.data.settings.growthSeen !== Store.data.growth.updated) { Store.data.settings.growthSeen = Store.data.growth.updated; Store.save(); setTimeout(() => Opus.renderBar(), 0); }
    // notes you haven't seen yet carry a gold dot this time; after that they're read
    const seen = new Set(arr(Store.data.settings.notesSeen)), all = notes();
    const fresh = Store.data.growth ? all.map(noteKey).filter(k => !seen.has(k)) : [];
    fresh.forEach(k => unread.add(k));
    if (fresh.length) { Store.data.settings.notesSeen = all.map(noteKey).slice(-80); Store.save(); }
    let n = 0; const num = () => U.roman(++n);
    const cu = (courseOf(g) || {}).cur, where = cu ? cu.subject.name + ' ' + U.roman(cu.n) : 'with Cassius';
    const top = h('<div class="top"><div><div class="eyebrow"></div><div class="title">Growth</div></div><button class="g-medal" type="button" aria-label="Cassius"><img src="icons/cassius.svg" alt=""></button></div>');
    set(top, '.eyebrow', U.DAY_NAMES[d.getDay()] + ' · ' + where);
    top.querySelector('.g-medal').onclick = cassiusSheet;
    v.appendChild(top);
    v.appendChild(lamp(g));
    v.appendChild(sitting(g, num(), sn));
    // the parts in use, in order. The Season, Seal (but while it's live), Map, Glimpses, Portrait, creed and Made are kept in the file, not shown
    [fromCassius(g, num), courseCard(g, num), talkCard(g, num, v), scrollCard(g, num, sn), changedCard(g, num), libraryCard(g, num)].forEach(x => { if (x) v.appendChild(x); });

    const foot = h('<div class="g-foot"><div class="rule"></div><p class="small"></p></div>');
    const up = g && g.updated ? new Date(g.updated) : null;
    set(foot, 'p', !Store.data.growth && g ? 'This is an example page. Cassius fills in yours.' :
      up && !isNaN(up) ? 'Cassius last wrote here ' + (U.key(up) === U.key() ? 'today' : ago(U.key(up))) + ', ' + U.fmtTimeAP(U.pad(up.getHours()) + ':' + U.pad(up.getMinutes())) + '.' :
      'Cassius hasn’t written here yet.');
    v.appendChild(foot);
  }

  Opus.growth = { prompts, todayPrompt, prose };
  Opus.tab({ id: 'growth', title: 'Growth', icon: 'laurel', render,
    badge: () => !!(Store.data.growth && Store.data.growth.updated && Store.data.settings.growthSeen !== Store.data.growth.updated) });
})();
