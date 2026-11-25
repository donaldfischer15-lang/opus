/* The desk: notes between Grok, Cassius and Claude (who builds Opus), kept in desk.json in the opus-data repo.
   Grok and Cassius leave notes through the helper; Claude answers there and asks the owner before building anything.
   Opus only reads it: a copy is fetched on each sync and shown in Settings › Desk. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const WHO = { grok: 'Grok', cassius: 'Cassius', claude: 'Claude' };
  const notes = () => (Store.data.desk && Array.isArray(Store.data.desk.notes) ? Store.data.desk.notes : []);

  async function afterSync(getFile) {
    const r = await getFile('desk.json');
    if (r.missing) { if (Store.data.desk) { Store.data.desk = null; Store.save(); } return; }
    let o = null; try { o = JSON.parse(r.text); } catch (e) { return; }
    if (!o || !Array.isArray(o.notes)) return;
    if (JSON.stringify(o) !== JSON.stringify(Store.data.desk)) { Store.data.desk = o; Store.save(); }
  }
  /* the shared memory: memory.md, what Grok, Cassius and Claude know about the owner (read only here) */
  async function memorySync(getFile) {
    const r = await getFile('memory.md');
    const t = r.missing ? null : String(r.text || '');
    if (t !== (Store.data.memory || null)) { Store.data.memory = t; Store.save(); }
  }
  function memoryParse(t) {
    const out = []; if (!t) return out;
    t.replace(/\r/g, '').split(/\n(?=## )/).forEach(p => {
      if (!p.startsWith('## ')) return;
      const lines = p.split('\n'), facts = lines.slice(1).filter(l => /^\s*[-*]\s+\S/.test(l)).map(l => {
        const x = l.replace(/^\s*[-*]\s+/, '').trim(), m = x.match(/^(.*?)\s*\((grok|cassius|claude),?\s*(\d{4}-\d{2}-\d{2})?\)\s*$/i);
        return m ? { text: m[1], by: m[2].toLowerCase(), date: m[3] || null } : { text: x, by: null, date: null };
      });
      if (facts.length) out.push({ name: lines[0].slice(3).trim(), facts });
    });
    return out;
  }
  function memorySheet() {
    ui.sheet({ title: 'Shared memory', kicker: 'What Grok and Claude know', render(api) {
      const b = api.body, secs = memoryParse(Store.data.memory);
      b.appendChild(h('<p class="small" style="padding:0 4px">Grok, Cassius and Claude keep what they know about you here, so each knows what the others learned. Tell any of them to change or forget something.</p>'));
      if (!secs.length) { b.appendChild(h('<div class="card pad"><p class="empty">Nothing yet. Grok fills this in first.</p></div>')); return; }
      secs.forEach(sc => {
        const c = h('<div class="card mm"><div class="mm-h"><b></b><span class="small num"></span></div></div>');
        c.querySelector('b').textContent = sc.name; c.querySelector('.num').textContent = sc.facts.length;
        sc.facts.forEach(f => { const r = h('<div class="mm-f"><p></p>' + (f.by ? '<span class="small"></span>' : '') + '</div>'); r.querySelector('p').textContent = f.text; if (f.by) r.querySelector('.small').textContent = (WHO[f.by] || f.by) + (f.date ? ' · ' + U.fmtDateShort(f.date) : ''); c.appendChild(r); });
        b.appendChild(c);
      });
    } });
  }
  function memoryRow() {
    const secs = memoryParse(Store.data.memory), n = secs.reduce((a, x) => a + x.facts.length, 0);
    const r = h('<div class="row tap"><span class="tx"><b>Shared memory</b><small></small></span>' + (n ? '<span class="tag num">' + n + '</span>' : '') + ui.icon('chev', 'chev ico') + '</div>');
    r.querySelector('small').textContent = n ? 'What Grok, Cassius and Claude know about you, in ' + secs.length + ' part' + (secs.length === 1 ? '' : 's') : 'What Grok and Claude know about you. Nothing yet.';
    r.onclick = memorySheet;
    return r;
  }
  const open = () => notes().filter(n => n.status === 'open' && !n.re);
  const when = iso => { const d = new Date(iso); if (isNaN(d)) return ''; const k = U.key(d); return (k === U.key() ? 'Today' : k === U.key(U.addDays(new Date(), -1)) ? 'Yesterday' : U.fmtDateShort(k)) + ', ' + U.fmtTimeAP(U.pad(d.getHours()) + ':' + U.pad(d.getMinutes())); };

  function noteEl(n, reply) {
    const el = h('<div class="dk-n' + (reply ? ' dk-r' : '') + (n.status === 'done' ? ' dk-done' : '') + '"><div class="dk-h"><b></b><span class="small"></span></div><p></p></div>');
    el.querySelector('b').textContent = WHO[n.from] || n.from || 'Note';
    el.querySelector('.small').textContent = [when(n.at), !reply && n.status === 'done' ? 'settled' : !reply && n.status === 'answered' ? 'answered' : !reply ? 'open' : ''].filter(Boolean).join(' · ');
    el.querySelector('p').textContent = n.text || '';
    return el;
  }
  function sheet() {
    ui.sheet({ title: 'Desk', kicker: 'Grok, Cassius and Claude', render(api) {
      const b = api.body, all = notes();
      b.appendChild(h('<p class="small" style="padding:0 4px">Grok and Cassius leave notes here about the app. Claude answers each evening and asks you before building anything.</p>'));
      const tops = all.filter(n => !n.re || !all.some(x => x.id === n.re)).slice().reverse();
      if (!tops.length) { b.appendChild(h('<div class="card pad"><p class="empty">No notes yet.</p></div>')); return; }
      tops.forEach(n => {
        const c = h('<div class="card dk"></div>');
        c.appendChild(noteEl(n));
        const kids = []; const walk = id => all.filter(x => x.re === id).forEach(x => { kids.push(x); walk(x.id); }); walk(n.id);
        kids.forEach(x => c.appendChild(noteEl(x, true)));
        b.appendChild(c);
      });
    } });
  }
  function row() {
    const n = open().length, all = notes().length;
    const r = h('<div class="row tap"><span class="tx"><b>Desk</b><small></small></span>' + (n ? '<span class="tag num">' + n + ' open</span>' : '') + ui.icon('chev', 'chev ico') + '</div>');
    r.querySelector('small').textContent = all ? 'Notes between Grok, Cassius and Claude about the app' : 'Where Grok and Cassius leave notes for Claude. Nothing yet.';
    r.onclick = sheet;
    return r;
  }
  Opus.desk = { afterSync, sheet, row, notes, open, memorySync, memoryParse, memorySheet, memoryRow };
})();
