/* Settings: tabs on/off and order, sound, plan copy/import, backup, AI summary. Opens from the gear on Today. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;

  function backupNow() {
    const name = 'opus-backup-' + U.key() + '.json';
    ui.saveFile(name, Store.exportJSON()).then(ok => { if (ok) { Store.data.settings.lastBackup = new Date().toISOString(); Store.save(); ui.toast('Backup saved'); } });
  }
  Opus.backupNow = backupNow;

  function aiSummary(days) {
    days = days || 14;
    const L = [], d0 = new Date();
    L.push('OPUS SUMMARY (last ' + days + ' days, made ' + U.key(d0) + ')');
    L.push('Plan: ' + (Plan.p.name || '') + ' · ' + Plan.summary(Plan.p));
    L.push('', 'DAILY CHECKLIST (done / planned, and what was missed)');
    const firstUse = Object.keys(Store.data.checks).filter(k => (Store.data.checks[k] || []).length).sort()[0] || U.key(d0);
    for (let i = days - 1; i >= 0; i--) {
      const d = U.addDays(d0, -i); if (U.key(d) < firstUse) continue;
      const its = Plan.itemsFor(d), ck = Plan.checked(d);
      const miss = its.filter(it => !ck.includes(it.id)).map(it => it.title);
      L.push(U.key(d) + ' ' + U.DAYS[d.getDay()] + ': ' + its.filter(it => ck.includes(it.id)).length + '/' + its.length + (miss.length ? ' · missed: ' + miss.join('; ') : ''));
    }
    const since = U.key(U.addDays(d0, -days));
    L.push('', 'WORKOUTS');
    Store.data.workouts.filter(w => w.date >= since).sort((a, b) => a.date.localeCompare(b.date)).forEach(w => {
      const by = {}; w.sets.forEach(s => (by[s.ex] = by[s.ex] || []).push(U.wt(s.weight) + 'x' + s.reps + (s.pr ? '*' : '')));
      L.push(w.date + ' ' + w.name + ': ' + Object.entries(by).map(([ex, ss]) => Plan.exercise(ex).name + ' ' + ss.join(' ')).join(' | ') + (w.conditioning ? ' | conditioning done' : ''));
    });
    L.push('(* = new best)');
    L.push('', 'BODY WEIGHT (lb)');
    L.push((Store.data.weights || []).filter(w => w.date >= since).sort((a, b) => a.date.localeCompare(b.date)).map(w => w.date + ' ' + w.lb).join(', ') || 'none logged');
    L.push('', 'MONEY WEEKS');
    (Store.data.money.weeks || []).filter(w => w.weekEnding >= since).forEach(w => L.push(w.weekEnding + ': pay ' + (w.paycheck ?? '?') + ', spent ' + U.sum((w.spent || []).map(s => s.amount)).toFixed(2) + ' (' + (w.spent || []).map(s => s.cat + ' ' + s.amount).join(', ') + ')'));
    const c = Opus.money.calc();
    L.push('Free cash estimate per week: ' + (c.free ? U.money(c.free.lo) + (Math.round(c.free.lo) !== Math.round(c.free.hi) ? ' to ' + U.money(c.free.hi) : '') : 'not enough data'));
    L.push('Debts: ' + (Plan.p.money.debts || []).map(d => d.name + ' ' + (d.balance == null ? 'balance unknown' : U.money(d.balance))).join('; '));
    L.push('', 'REVIEWS');
    (Store.data.reviews || []).filter(r => r.weekOf >= since).forEach(r => L.push(r.weekOf + ' worked: ' + r.worked + ' | slipped: ' + r.slipped + ' | change: ' + r.change));
    L.push('', 'WRITING: ' + (Store.data.writing || []).filter(w => w.date >= since).length + ' entries');
    return L.join('\n');
  }

  function importPlanSheet(after) {
    ui.sheet({ title: 'Import plan', kicker: 'From Claude, Grok or a file', full: true, render(api) {
      const b = api.body;
      b.appendChild(h('<p class="note">Paste a whole plan (JSON, "format": "opus-plan"). Opus checks it before anything changes. Your logs, checks and history stay as they are.</p>'));
      const ta = h('<textarea class="input mono" id="plan-import" style="min-height:40vh" placeholder="{ &quot;format&quot;: &quot;opus-plan&quot;, ... }"></textarea>'); b.appendChild(ta);
      const btns = h('<div class="btns"><button class="btn quiet" type="button">Choose a file</button><button class="btn" type="button">Check plan</button></div>'); b.appendChild(btns);
      const out = h('<div style="display:flex;flex-direction:column;gap:10px"></div>'); b.appendChild(out);
      btns.children[0].onclick = async () => { const t = await ui.pickFile(); if (t != null) { ta.value = t; btns.children[1].click(); } };
      btns.children[1].onclick = () => {
        out.innerHTML = '';
        let raw = ta.value.trim();
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) raw = fence[1].trim();
        let p; try { p = JSON.parse(raw); } catch (e) { out.appendChild(h('<div class="banner">That is not valid JSON yet: ' + U.esc(e.message) + '. Ask for the whole plan file, nothing else around it.</div>')); return; }
        if (p && p.format === 'opus-data' && p.plan) p = p.plan;
        const v = Plan.validate(p);
        if (!v.ok) { out.appendChild(h('<div class="banner"><b>Not imported. Fix these first:</b><br>' + v.errors.slice(0, 12).map(U.esc).join('<br>') + (v.errors.length > 12 ? '<br>…and ' + (v.errors.length - 12) + ' more' : '') + '</div>')); return; }
        if (v.warnings.length) out.appendChild(h('<div class="banner gold">' + v.warnings.map(U.esc).join('<br>') + '</div>'));
        out.appendChild(h('<div class="card pad"><div class="tag">' + U.esc(p.name || 'Plan') + (p.updated ? ' · updated ' + U.esc(p.updated) : '') + '</div><p class="note" style="margin-top:6px">' + U.esc(Plan.summary(p)) + '</p><p class="small" style="margin-top:6px">Replaces: ' + U.esc(Plan.summary(Plan.p)) + '</p></div>'));
        const use = h('<button class="btn block" type="button">Use this plan</button>');
        use.onclick = () => { Store.data.plan = p; Store.save(true); api.close(); ui.toast('Plan updated'); Opus.renderBar(); after && after(); Opus.go(Opus.current() || 'today'); };
        out.appendChild(use);
      };
    } });
  }


  /* ---------- Sync with GitHub ---------- */
  function stepsSheet() {
    ui.sheet({ title: 'Set up sync', kicker: 'About 10 minutes, once', full: true, render(api) {
      const b = api.body;
      b.appendChild(h('<p class="note">Your plan and logs go into a private GitHub repo that only you can see. Grok edits the plan there, and Opus picks it up each time it opens. GitHub is free.</p>'));
      const ol = h('<ol class="steps card pad"></ol>');
      Opus.sync.steps().forEach(([t, d]) => ol.appendChild(h('<li><div><b>' + U.esc(t) + '</b><span>' + U.esc(d) + '</span></div></li>')));
      b.appendChild(ol);
      b.appendChild(h('<p class="small">The token is like a key to that one repo. It stays on this phone, isn’t in your backups, and can’t open anything else on GitHub. When it expires, make a new one the same way and paste it in.</p>'));
      const done = h('<button class="btn block" type="button">Got it</button>'); done.onclick = () => api.close(); b.appendChild(done);
    } });
  }

  function syncSection(api) {
    const S = Opus.sync, c = S.cfg();
    const sec = h('<div class="sec"><div class="sh"><span class="r">I</span><span class="t">Sync with GitHub</span><span class="c"></span></div><div class="card pad" style="display:flex;flex-direction:column;gap:12px"></div></div>');
    const card = sec.querySelector('.card'), cnt = sec.querySelector('.c');
    const preview = /claude|anthropic/.test(location.hostname) || location.protocol === 'about:';

    if (!c || !c.token) {
      cnt.textContent = 'off';
      card.appendChild(h('<p class="small">Keep your plan and logs in your own private GitHub repo. Grok updates the plan there, and Opus picks it up every time you open it. What you log here goes back the same way, so Grok always sees it.</p>'));
      const how = h('<button class="btn quiet" type="button">How to set it up</button>'); how.onclick = stepsSheet; card.appendChild(how);
      if (preview) { card.appendChild(h('<div class="banner gold">Sync works in Opus on your home screen. This preview can’t reach GitHub.</div>')); return sec; }
      if ((Plan.p.name || '') === 'Example plan') card.appendChild(h('<div class="banner gold">You’re on the example plan. If your repo is empty, Opus puts this plan there. Import your own plan first (Plan › Import plan), or have Grok write plan.json before you connect.</div>'));
      const f1 = h('<div class="field"><label for="sy-owner">GitHub username</label><input class="input" id="sy-owner" autocomplete="username" autocapitalize="none" spellcheck="false"></div>');
      const f2 = h('<div class="field"><label for="sy-repo">Repo</label><input class="input" id="sy-repo" autocapitalize="none" spellcheck="false" value="opus-data"></div>');
      const f3 = h('<div class="field"><label for="sy-token">Token</label><input class="input mono" id="sy-token" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="github_pat_…"></div>');
      [f1, f2, f3].forEach(x => card.appendChild(x));
      const out = h('<div></div>'); card.appendChild(out);
      const go = h('<button class="btn block" type="button">Connect</button>'); card.appendChild(go);
      go.onclick = async () => {
        const owner = f1.querySelector('input').value.trim().replace(/^@/, ''), repo = f2.querySelector('input').value.trim(), token = f3.querySelector('input').value.trim();
        out.innerHTML = '';
        if (!owner || !repo || !token) { out.appendChild(h('<div class="banner">Fill in all three: your username, the repo and the token.</div>')); return; }
        go.disabled = true; go.textContent = 'Checking…';
        const ck = await S.check(owner, repo, token);
        if (!ck.ok) { go.disabled = false; go.textContent = 'Connect'; out.appendChild(h('<div class="banner">' + U.esc(ck.error) + '</div>')); return; }
        go.textContent = 'Syncing…';
        let res = await S.connect(owner, repo, token);
        if (res && res.choose) {
          const useGit = await ui.ask({ title: 'GitHub already has a plan', text: 'The repo has “' + (res.choose.name || 'a plan') + '”' + (res.choose.updated ? ' from ' + res.choose.updated : '') + ', and it differs from the plan on this phone. Which one should Opus use? Your logs are kept either way.', yes: 'Use GitHub’s plan', no: 'Keep this phone’s' });
          res = await S.connect(owner, repo, token, useGit ? 'github' : 'phone');
        }
        if (res && res.error) ui.toast(res.error.message);
        else ui.toast('Connected to ' + owner + '/' + repo);
        api.rerender();
      };
      return sec;
    }

    const paint = () => { if (!sec.isConnected) return; cnt.textContent = S.status() === 'offline' ? 'offline' : S.status() === 'syncing' ? 'syncing' : 'on'; ln.textContent = S.line(); };
    card.appendChild(h('<div><div class="tag">' + U.esc(c.owner + '/' + c.repo) + '</div></div>'));
    const ln = h('<p class="small" role="status"></p>'); card.appendChild(ln);
    S.on(paint); paint();

    const bl = S.blocked();
    if (bl) {
      const bx = h('<div class="banner"><b>Sync paused to keep your logs safe.</b><br>Syncing now would remove ' + bl.count + ' log' + (bl.count > 1 ? 's' : '') + ' from GitHub that this phone doesn’t have. That usually means this phone lost data. Keep them brings them back here.<div class="btns" style="margin-top:10px"><button class="btn sm" type="button">Keep them</button><button class="btn quiet sm" type="button">Remove them</button></div></div>');
      const [k, r] = bx.querySelectorAll('button');
      k.onclick = async () => { await S.resolveBlocked(true); api.rerender(); };
      r.onclick = () => ui.ask({ title: 'Remove ' + bl.count + ' logs from GitHub?', text: 'They are gone from this phone already. This removes them from GitHub too.', yes: 'Remove', danger: true }).then(async ok => { if (ok) { await S.resolveBlocked(false); api.rerender(); } });
      card.appendChild(bx);
    }
    (c.problems || []).forEach(p => card.appendChild(h('<div class="banner">' + U.esc(p.text) + '</div>')));
    if (c.grokNote) {
      const g = c.grokNote, bits = [];
      if (g.added) bits.push('added ' + g.added); if (g.changed) bits.push('changed ' + g.changed); if (g.removed) bits.push('took back ' + g.removed);
      card.appendChild(h('<p class="small">From Grok, ' + U.esc(U.fmtDateShort(new Date(g.at))) + ': ' + U.esc(bits.join(', ') || 'nothing new') + '.' + (g.kept && g.kept.length ? ' You had already logged ' + U.esc(g.kept.join(', ')) + ', so yours were kept.' : '') + '</p>'));
    }
    const hv = S.helper();
    if (hv.behind) card.appendChild(h('<div class="banner"><b>The Grok helper is behind.</b><br>It’s on ' + U.esc(hv.have) + ', and this Opus needs ' + U.esc(hv.want) + ', so Grok’s newest saves may fail. If Cloudflare is linked to your opus repo, it catches up on its own within the hour. If not, paste the new helper code into Cloudflare once.</div>'));
    const facts = [];
    facts.push('Grok helper: ' + (hv.have ? hv.have + (hv.behind ? ' (needs ' + hv.want + ')' : ', up to date') : 'reports in after its next update'));
    if (c.backupMonth) facts.push('Monthly backup: ' + U.MONTHS[+c.backupMonth.slice(5, 7) - 1] + ' saved in opus-data › backups');
    card.appendChild(h('<p class="small">' + facts.map(U.esc).join('<br>') + '</p>'));
    if (c.undoPlan) {
      const un = h('<button class="btn ghost" type="button">Undo the last plan update from GitHub</button>');
      un.onclick = () => ui.ask({ title: 'Put the earlier plan back?', text: 'Opus goes back to the plan you had before the update on ' + U.fmtDateShort(new Date(c.undoPlan.at)) + ', and saves that to GitHub. Logs stay as they are.', yes: 'Put it back' }).then(ok => { if (ok) { S.undoPlan(); S.sync({ now: true, quiet: true }); api.rerender(); } });
      card.appendChild(un);
    }
    const bb = h('<div class="btns"><button class="btn quiet" type="button">Sync now</button><button class="btn" type="button">Copy Grok setup prompt</button></div>');
    bb.children[0].onclick = async () => { await S.sync({ now: true }); api.rerender(); };
    bb.children[1].onclick = () => ui.copy(S.grokPrompt());
    card.appendChild(bb);
    card.appendChild(h('<p class="small">Paste the setup prompt to Grok once. After that, ask Grok for changes in plain words. Opus picks them up the next time you open it.</p>'));
    const b2 = h('<div class="btns"><button class="btn quiet sm" type="button">How it works</button><button class="btn quiet sm" type="button">Disconnect</button></div>');
    b2.children[0].onclick = stepsSheet;
    b2.children[1].onclick = () => ui.ask({ title: 'Stop syncing?', text: 'Opus forgets the token on this phone and stops syncing. Nothing on this phone or in GitHub is deleted.', yes: 'Disconnect' }).then(ok => { if (ok) { S.disconnect(); api.rerender(); } });
    card.appendChild(b2);
    return sec;
  }

  function open() {
    ui.sheet({ title: 'Settings', kicker: 'Opus ' + Opus.VERSION, full: true, onClose: () => Opus.go(Opus.current() || 'today'), render(api) {
      const b = api.body, s = Store.data.settings, reg = Opus.tabsAll();

      // sync
      b.appendChild(syncSection(api));

      // tabs
      const ts = h('<div class="sec"><div class="sh"><span class="r">II</span><span class="t">Tabs</span><span class="c">on, off and order</span></div><div class="card list-reorder"></div></div>');
      const drawTabs = () => {
        const c = ts.querySelector('.card'); c.innerHTML = '';
        const order = s.tabs.filter(id => reg[id]).concat(Object.keys(reg).filter(id => reg[id].inBar !== false && !s.tabs.includes(id)));
        s.tabs = order;
        order.forEach((id, i) => {
          const on = id === 'today' || !s.hidden.includes(id);
          const r = h('<div class="row"><svg class="ico" viewBox="0 0 24 24" style="color:var(--gold)">' + (ui.I[reg[id].icon] || '') + '</svg><span class="tx"><b>' + reg[id].title + '</b>' + (id === 'today' ? '<small>Always on</small>' : '') + '</span>' +
            '<button class="mini" type="button" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '><svg viewBox="0 0 24 24">' + ui.I.up + '</svg></button><button class="mini" type="button" aria-label="Move down"' + (i === order.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24">' + ui.I.down + '</svg></button>' +
            '<button class="switch' + (on ? ' on' : '') + '" type="button" role="switch" aria-checked="' + on + '" aria-label="Show ' + reg[id].title + '"' + (id === 'today' ? ' disabled style="opacity:.4"' : '') + '></button></div>');
          const [upB, dnB, sw] = r.querySelectorAll('button');
          upB.onclick = () => { order.splice(i - 1, 0, order.splice(i, 1)[0]); s.tabs = order; Store.save(); drawTabs(); Opus.renderBar(); };
          dnB.onclick = () => { order.splice(i + 1, 0, order.splice(i, 1)[0]); s.tabs = order; Store.save(); drawTabs(); Opus.renderBar(); };
          sw.onclick = () => { if (id === 'today') return; const k = s.hidden.indexOf(id); if (k >= 0) s.hidden.splice(k, 1); else s.hidden.push(id); Store.save(); drawTabs(); Opus.renderBar(); };
          c.appendChild(r);
        });
      };
      drawTabs(); b.appendChild(ts);

      // sound
      const so = h('<div class="sec"><div class="sh"><span class="r">III</span><span class="t">Timers</span></div><div class="card"><div class="row"><span class="tx"><b>Chime when rest is up</b><small>When a rest is up</small></span><button class="switch' + (s.sound ? ' on' : '') + '" type="button" role="switch" aria-checked="' + !!s.sound + '" aria-label="Chime"></button></div></div></div>');
      so.querySelector('.switch').onclick = e => { s.sound = !s.sound; e.currentTarget.classList.toggle('on', s.sound); Store.save(); if (s.sound) ui.chime(); };
      const restTypes = { compound: ['Big compound', 'Squat, RDL, bench'], accessory: ['Accessory', 'Rows, presses, machines'], isolation: ['Isolation', 'Curls, raises, calves'] };
      const tr = Plan.p.training || {};
      s.rest = s.rest || {};
      Object.entries(restTypes).forEach(([type, [name, ex]]) => {
        const cur = () => Number(s.rest[type] || (tr.rest || {})[type] || { compound: 180, accessory: 120, isolation: 75 }[type]);
        const row = h('<div class="row"><span class="tx"><b>' + name + ' rest</b><small>' + ex + '</small></span></div>');
        const lbl = h('<span class="tm num" style="min-width:36px;text-align:right">' + U.fmtDuration(cur()) + '</span>');
        const sp = ui.stepper({ label: name + ' rest', value: cur(), step: (v, dir) => U.clamp((v || 0) + 15 * dir, 15, 600), onChange: v => { if (v) { s.rest[type] = v; Store.save(); lbl.textContent = U.fmtDuration(v); } } });
        sp.el.style.width = '150px'; sp.input.id = 'rest-' + type;
        row.appendChild(sp.el); row.appendChild(lbl);
        so.querySelector('.card').appendChild(row);
      });
      so.appendChild(h('<p class="small" style="padding:0 4px">Rest lengths in seconds. The timer starts when you log a set. Adjust a single rest with −15 and +15 on the timer.</p>'));
      b.appendChild(so);

      // plan
      const p = Plan.p;
      const pl = h('<div class="sec"><div class="sh"><span class="r">IV</span><span class="t">Plan</span></div><div class="card pad" style="display:flex;flex-direction:column;gap:12px"></div></div>');
      const pc = pl.querySelector('.card');
      pc.appendChild(h('<div><div class="tag">' + U.esc(p.name || 'Plan') + (p.updated ? ' · ' + U.esc(p.updated) : '') + '</div><p class="note" style="margin-top:4px">' + U.esc(Plan.summary(p)) + '</p></div>'));
      if ((p.name || '') === 'Example plan') pc.appendChild(h('<div class="banner gold">You are on the example plan. Import your own plan file to make Opus yours.</div>'));
      const synced = Opus.sync && Opus.sync.cfg() && Opus.sync.cfg().token;
      pc.appendChild(h('<p class="small">' + (synced ? 'Your meals, workouts, bills, debts and home jobs live in plan.json in your repo. Ask Grok for a change and Opus picks it up when it opens. Without sync: Copy plan, paste it to Claude or Grok with what you want changed, then Import plan with their answer.' : 'Your meals, workouts, bills, debts and home jobs live in one plain file. To change it with Claude or Grok: Copy plan, paste it to them with what you want changed, then Import plan with their answer.') + '</p>'));
      const pb = h('<div class="btns"><button class="btn quiet" type="button">Copy plan</button><button class="btn" type="button">Import plan</button></div>');
      pb.children[0].onclick = () => { p.updated = U.key(); Store.save(); ui.copy(JSON.stringify(p, null, 2)); };
      pb.children[1].onclick = () => importPlanSheet(() => {});
      pc.appendChild(pb);
      const pb2 = h('<div class="btns"><button class="btn quiet sm" type="button">Save plan as file</button><button class="btn quiet sm" type="button">Use example plan</button></div>');
      pb2.children[0].onclick = () => ui.saveFile('opus-plan-' + U.key() + '.json', JSON.stringify(p, null, 2));
      pb2.children[1].onclick = () => ui.ask({ title: 'Switch to the example plan?', text: 'Your current plan is replaced by the example. Copy or save it first if you want it back. Logs stay.', yes: 'Switch', danger: true }).then(ok => { if (ok) { Store.data.plan = U.clone(window.OPUS_EXAMPLE_PLAN); Store.save(true); api.rerender(); } });
      pc.appendChild(pb2);
      b.appendChild(pl);

      // money paste: only needed when Grok can't save on its own
      if (Opus.money && Opus.money.importBox) {
        const mp = h('<details class="fold sec"><summary class="sh"><span class="r">V</span><span class="t">Paste a money week</span><span class="c">if Grok can’t save</span></summary><div class="card pad" style="margin-top:6px"></div></details>');
        mp.querySelector('.card').appendChild(Opus.money.importBox(() => Opus.refresh()));
        b.appendChild(mp);
      }

      // data
      const lb = s.lastBackup ? U.daysBetween(new Date(s.lastBackup), new Date()) : null;
      const da = h('<div class="sec"><div class="sh"><span class="r">VI</span><span class="t">Your data</span><span class="c">' + (lb == null ? 'never backed up' : lb === 0 ? 'backed up today' : 'backup ' + lb + ' day' + (lb > 1 ? 's' : '') + ' ago') + '</span></div><div class="card pad" style="display:flex;flex-direction:column;gap:12px"></div></div>');
      const dc = da.querySelector('.card');
      dc.appendChild(h('<p class="small">Everything stays on this phone. A backup is one file with your plan and every log. Keep one in Files or iCloud Drive each week.</p>'));
      const db = h('<div class="btns"><button class="btn quiet" type="button">Export backup</button><button class="btn quiet" type="button">Import backup</button></div>');
      db.children[0].onclick = () => { backupNow(); };
      db.children[1].onclick = async () => {
        const t = await ui.pickFile(); if (t == null) return;
        const r = Store.importJSON(t);
        if (!r.ok) { ui.toast(r.error); return; }
        const ok = await ui.ask({ title: 'Replace everything with this backup?', text: 'Backup from ' + (r.data.exported ? r.data.exported.slice(0, 10) : 'an unknown date') + ' with ' + r.data.workouts.length + ' workouts. What is on this phone now is replaced.' + (Opus.sync && Opus.sync.cfg() && Opus.sync.cfg().token ? ' Logs in GitHub that the backup lacks are added back on the next sync, never deleted.' : ''), yes: 'Replace', danger: true });
        if (ok) { Store.applyImport(r.data); api.close(true); Opus.renderBar(); Opus.go('today'); ui.toast('Backup restored'); }
      };
      dc.appendChild(db);
      const ai = h('<button class="btn ghost" type="button">Copy a 2-week summary for Claude or Grok</button>');
      ai.onclick = () => ui.copy(aiSummary(14));
      dc.appendChild(ai);
      b.appendChild(da);

      // about
      const ab = h('<div class="sec"><div class="sh"><span class="r">VII</span><span class="t">About</span></div><div class="card pad" style="display:flex;flex-direction:column;gap:12px"><p class="small">Opus ' + Opus.VERSION + '. Works offline once installed. Plan format "opus-plan" v1, data format "opus-data" v1, synced logs "opus-logs" v1, Grok outbox "opus-grok" v1, money import "OPUS MONEY WEEK". The guide for AI helpers is GUIDE.md beside the app.' + (Store.ok() ? '' : ' <span class="warn">Saving is blocked in this browser.</span>') + '</p></div></div>');
      const rs = h('<button class="btn danger" type="button">Erase everything on this phone</button>');
      rs.onclick = () => ui.ask({ title: 'Erase all Opus data?', text: 'Plan, logs, history and settings are deleted from this phone, and sync is turned off. Your GitHub repo is not touched. Export a backup first if you might want them.', yes: 'Erase', danger: true }).then(ok => { if (ok) { Store.reset(); api.close(true); Opus.renderBar(); Opus.go('today'); ui.toast('Erased'); } });
      ab.querySelector('.card').appendChild(rs);
      b.appendChild(ab);
    } });
  }
  Opus.openSettings = open;
  Opus.aiSummary = aiSummary;
  Opus.tab({ id: 'settings', title: 'Settings', icon: 'gear', inBar: false, render: v => { open(); Opus.go('today'); } });
})();
