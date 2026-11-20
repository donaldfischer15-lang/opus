/* Notifications on the lock screen, even when Opus is closed.
   This phone works out what should buzz and when for the next seven days (the day's items at their times,
   bills the evening before, pet care, payday, the week ahead) and saves that list, with its push address,
   as push.json in the opus-data repo on each sync. The helper on Cloudflare checks the list every five minutes
   and sends whatever is due, skipping anything already ticked off. It also sends a line when Grok or Cassius
   saves a change. Nothing here costs money. Each kind has its own switch in Settings. */
(function () {
  'use strict';
  const Opus = window.Opus, U = Opus.util, Plan = Opus.plan, Store = Opus.store, ui = Opus.ui, h = ui.h;
  const FILE = 'push.json', DAYS = 7;

  /* the kinds, in the order Settings shows them: [id, name, what it sends] */
  const KINDS = [
    ['workouts', 'Workouts', 'At the workout’s time, with what’s on'],
    ['meals', 'Meals and prep', 'At each meal’s time, and prep day'],
    ['supps', 'Supplements', 'When they’re due'],
    ['weigh', 'Weigh-ins', 'At the weigh-in time'],
    ['home', 'Home and chores', 'Chores and jobs on your day'],
    ['pets', 'Pets', 'Care that comes due, at 6 PM, and birthdays'],
    ['bills', 'Bills and payday', 'The evening before a bill comes out, and payday morning'],
    ['money', 'Money check-in', 'At check-in time'],
    ['review', 'Week ahead and review', 'Sunday morning’s week ahead, and the weekly review'],
    ['growth', 'Writing and lessons', 'At writing time'],
    ['day', 'Everything else on your day', 'Any other item that has a time'],
    ['changes', 'Changes from Grok and Cassius', 'Right when they save one']
  ];
  const KIND_OF = { meal: 'meals', prep: 'meals', workout: 'workouts', supp: 'supps', weigh: 'weigh', home: 'home', pet: 'pets', money: 'money', review: 'review', writing: 'growth', lesson: 'growth' };
  const TAB_OF = { meals: 'food', workouts: 'train', supps: 'today', weigh: 'food', home: 'home', pets: 'home', bills: 'money', money: 'money', review: 'today', growth: 'growth', day: 'today' };

  const st = () => { const s = Store.data.settings; s.notify = s.notify || { on: false, kinds: {} }; s.notify.kinds = s.notify.kinds || {}; return s.notify; };
  const kindOn = k => st().kinds[k] !== false; // every kind is on until switched off
  const supported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const standalone = () => { try { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; } };
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  const helperKey = () => { const c = Opus.sync && Opus.sync.cfg(); return c && c.helper && c.helper.push ? c.helper.push : null; };
  const at = (d, hm) => { const m = U.mins(hm); if (m == null) return null; const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60); return x; };
  const lower1 = s => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

  /* ---------- the schedule ---------- */
  function events(now) {
    now = now || new Date();
    const out = [], soon = U.addDays(now, DAYS);
    const add = (when, kind, title, body, extra) => {
      if (!when || when <= now || when > soon || !kindOn(kind)) return;
      out.push(Object.assign({ at: when.toISOString(), kind, title: String(title).slice(0, 80), body: String(body || '').slice(0, 160), tab: TAB_OF[kind] || 'today' }, extra || {}));
    };
    // each day's items at their times; the helper skips any already ticked off
    for (let i = 0; i <= DAYS; i++) {
      const d = U.addDays(now, i);
      let items = []; try { items = Plan.itemsFor(d); } catch (e) { items = []; }
      for (const it of items) {
        if (!it.time) continue;
        const kind = KIND_OF[it.kind] || (String(it.id).startsWith('home:') ? 'home' : String(it.id).startsWith('supp') ? 'supps' : String(it.id).startsWith('pet') ? 'pets' : 'day');
        add(at(d, it.time), kind, it.title, it.detail || '', { check: { date: U.key(d), id: it.id } });
      }
    }
    // bills the evening before, payday in the morning, pet care at 6 PM, the week ahead on its morning
    if (Opus.weekAhead) {
      const w = Opus.weekAhead.gather(now), w2 = Opus.weekAhead.gather(U.addDays(now, 7));
      const bills = w.bills.concat(w2.bills), seen = new Set();
      bills.forEach(b => { const k = b.name + U.key(b.date); if (seen.has(k)) return; seen.add(k); add(at(U.addDays(b.date, -1), '19:00'), 'bills', b.name + ' comes out tomorrow', b.amount != null ? U.money(b.amount, { cents: true }) : ''); });
      [w.payday, w2.payday].filter(Boolean).forEach(p => add(at(p, '07:00'), 'bills', 'Payday', 'Your paycheck lands today.'));
      const pets = w.pets.concat(w2.pets), ps = new Set();
      pets.forEach(p => { const k = p.name + U.key(p.date); if (ps.has(k)) return; ps.add(k); add(at(p.date, p.turns ? '08:00' : '18:00'), 'pets', p.name, p.late ? 'Already due' : p.turns ? 'Turns ' + p.turns + ' today' : 'Due today'); });
      for (let i = 0; i <= DAYS; i++) {
        const d = U.addDays(now, i);
        if (!Opus.weekAhead.isDay(d)) continue;
        const wk = Opus.weekAhead.gather(d), bits = [];
        if (wk.training.length) bits.push(wk.training.length + ' training day' + (wk.training.length === 1 ? '' : 's'));
        const due = wk.bills.filter(b => b.amount != null); if (due.length) bits.push(U.money(U.sum(due.map(b => b.amount)), { cents: true }) + ' in bills');
        if (wk.payday) bits.push('payday ' + U.DAY_NAMES[wk.payday.getDay()]);
        if (wk.pets.length) bits.push(wk.pets.length + ' pet job' + (wk.pets.length === 1 ? '' : 's'));
        add(at(d, '08:00'), 'review', 'The week ahead', bits.length ? lower1(bits.join(', ')).replace(/^./, c => c.toUpperCase()) + '.' : 'A quiet week.');
      }
    }
    const t = st().test;
    // pinned to 20 seconds after the tap, so every sync writes the same time and the helper sends it exactly once
    if (t && new Date(t).getTime() > now.getTime() - 15 * 60000) out.push({ at: new Date(new Date(t).getTime() + 20000).toISOString(), kind: 'test', title: 'Opus', body: 'Notifications work. You can switch each kind on or off in Settings.', tab: 'today' });
    out.sort((a, b) => a.at.localeCompare(b.at));
    return out;
  }

  function doc(now) {
    const n = st();
    return { format: 'opus-push', version: 1, app: Opus.VERSION, tz: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || null,
      subs: n.on && n.sub ? [n.sub] : [], kinds: Object.fromEntries(KINDS.map(([k]) => [k, kindOn(k)])), events: n.on && n.sub ? events(now) : [] };
  }
  const hash = o => { const s = JSON.stringify([o.subs, o.kinds, o.events]); let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return String(x >>> 0); };

  /* called from the sync with its GitHub file reader and writer; writes push.json only when the schedule changed or is a day old */
  async function afterSync(getFile, putFile) {
    const n = st();
    if (!n.on && !n.wasOn) return;
    if (n.on && n.sub && helperKey() && n.sub.key !== helperKey()) await resubscribe().catch(() => {});
    const cur = await getFile(FILE);
    // the helper takes out an address the push service has dropped; ask for a new one
    if (n.on && n.sub && !cur.missing) {
      let remote = null; try { remote = JSON.parse(cur.text); } catch (e) {}
      if (remote && remote.dropped && !(remote.subs || []).some(x => x.endpoint === n.sub.endpoint)) { n.sub.key = null; await resubscribe().catch(() => {}); n.written = null; }
    }
    const o = doc();
    const hh = hash(o), age = n.writtenAt ? Date.now() - new Date(n.writtenAt).getTime() : Infinity;
    if (hh === n.written && age < 20 * 36e5 && !cur.missing) return;
    o.updated = new Date().toISOString();
    await putFile(FILE, JSON.stringify(o, null, 1) + '\n', cur.missing ? null : cur.sha, 'Opus: notification schedule ' + o.updated.slice(0, 16).replace('T', ' '));
    n.written = hh; n.writtenAt = o.updated; if (!n.on) n.wasOn = false;
    Store.save();
  }

  /* ---------- the push address ---------- */
  const b64u = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); const pad = s.length % 4 ? 4 - s.length % 4 : 0; const b = atob(s + '='.repeat(pad)); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  async function subscribe() {
    const key = helperKey(); if (!key) throw new Error('nokey');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && (!st().sub || st().sub.key !== key)) { try { await sub.unsubscribe(); } catch (e) {} sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
    const j = sub.toJSON();
    st().sub = { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, key, added: new Date().toISOString(), device: isIOS() ? 'iPhone' : 'phone' };
    Store.save();
  }
  async function resubscribe() { if (Notification.permission === 'granted') await subscribe(); }

  async function turnOn() {
    if (!supported()) { ui.toast(isIOS() && !standalone() ? 'Open Opus from your home screen first' : 'This phone can’t show web notifications'); return false; }
    if (!(Opus.sync && Opus.sync.cfg() && Opus.sync.cfg().token)) { ui.toast('Turn on sync first'); return false; }
    if (!helperKey()) { ui.toast('Waiting for the helper to update. Try again in a few minutes.'); Opus.sync.sync({ quiet: true }); return false; }
    const p = await Notification.requestPermission();
    if (p !== 'granted') { ui.toast(p === 'denied' ? 'Notifications are blocked. Allow them in iPhone Settings › Notifications › Opus.' : 'Not turned on'); return false; }
    try { await subscribe(); } catch (e) { ui.toast('Couldn’t set up notifications: ' + (e && e.message || e)); return false; }
    const n = st(); n.on = true; n.wasOn = true; n.test = new Date().toISOString(); n.written = null; Store.save();
    await Opus.sync.sync({ quiet: true });
    return true;
  }
  async function turnOff() {
    const n = st(); n.on = false; n.wasOn = true; n.written = null;
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) {}
    n.sub = null; Store.save();
    if (Opus.sync) await Opus.sync.sync({ quiet: true });
  }
  async function test() { const n = st(); n.test = new Date().toISOString(); Store.save(); await Opus.sync.sync({ quiet: true }); ui.toast('A test is on its way. It arrives within five minutes.'); }

  /* ---------- Settings ---------- */
  function section(numeral) {
    const s = h('<div class="sec nt"><div class="sh"><span class="r">' + numeral + '</span><span class="t">Notifications</span><span class="c"></span></div><div class="card"></div></div>');
    const draw = () => {
      const c = s.querySelector('.card'), n = st(); c.innerHTML = '';
      const on = n.on && n.sub;
      s.querySelector('.sh .c').textContent = on ? 'on' : 'off';
      const top = h('<div class="row"><span class="tx"><b>On the lock screen</b><small></small></span><button class="switch' + (on ? ' on' : '') + '" type="button" role="switch" aria-checked="' + !!on + '" aria-label="Notifications"></button></div>');
      const why = on ? 'Buzzes even when Opus is closed. Ticked-off items stay quiet.' : !supported() ? (isIOS() && !standalone() ? 'Open Opus from your home screen to turn these on.' : 'This browser can’t show web notifications. On iPhone it needs iOS 16.4 or later, opened from the home screen.')
        : !(Opus.sync && Opus.sync.cfg() && Opus.sync.cfg().token) ? 'Needs sync with GitHub, which sends them.'
        : !helperKey() ? 'Waiting for the helper to update on Cloudflare.'
        : 'Buzzes even when Opus is closed. Free.';
      top.querySelector('small').textContent = why;
      const sw = top.querySelector('.switch');
      sw.onclick = async () => { sw.disabled = true; if (on) { await turnOff(); ui.toast('Notifications off'); } else if (await turnOn()) ui.toast('On. A test notification arrives within five minutes.'); sw.disabled = false; draw(); };
      c.appendChild(top);
      if (!on) return;
      KINDS.forEach(([k, name, what]) => {
        const r = h('<div class="row"><span class="tx"><b>' + U.esc(name) + '</b><small>' + U.esc(what) + '</small></span><button class="switch' + (kindOn(k) ? ' on' : '') + '" type="button" role="switch" aria-checked="' + kindOn(k) + '" aria-label="' + U.esc(name) + '"></button></div>');
        r.querySelector('.switch').onclick = e => { n.kinds[k] = !kindOn(k); e.currentTarget.classList.toggle('on', kindOn(k)); e.currentTarget.setAttribute('aria-checked', kindOn(k)); Store.save(); Opus.sync.sync({ quiet: true }); };
        c.appendChild(r);
      });
      const next = events().filter(e => e.kind !== 'test')[0];
      const tb = h('<div class="row" style="gap:10px"><span class="tx"><small></small></span><button class="btn quiet sm" type="button">Send a test</button></div>');
      tb.querySelector('small').textContent = next ? 'Next: ' + next.title + ', ' + (U.key(new Date(next.at)) === U.key() ? 'today' : U.DAY_NAMES[new Date(next.at).getDay()]) + ' ' + U.fmtTimeAP(U.pad(new Date(next.at).getHours()) + ':' + U.pad(new Date(next.at).getMinutes())) : 'Nothing due in the next week.';
      tb.querySelector('button').onclick = test;
      c.appendChild(tb);
    };
    draw();
    return s;
  }

  Opus.notify = { KINDS, events, doc, afterSync, section, turnOn, turnOff, test, state: st };
})();
