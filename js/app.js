/* Opus app shell: tab registry, tab bar, boot. Each tab lives in js/tabs/<id>.js and calls Opus.tab({...}). */
(function () {
  'use strict';
  const Opus = window.Opus;
  const registry = {};
  const hooks = { boot: [] };
  Opus.tab = def => { registry[def.id] = def; };
  Opus.onBoot = fn => hooks.boot.push(fn);
  Opus.tabsAll = () => registry;

  let current = null;
  const view = () => document.getElementById('view');

  function enabledTabs() {
    const s = Opus.store.data.settings;
    const order = (s.tabs || []).filter(id => registry[id]);
    for (const id of Object.keys(registry)) if (!order.includes(id) && registry[id].inBar !== false) order.push(id);
    return order.filter(id => registry[id].inBar !== false && (id === 'today' || !(s.hidden || []).includes(id)));
  }
  function renderBar() {
    const U = Opus.ui;
    const bar = document.getElementById('tabbar');
    bar.innerHTML = '<div class="in" role="tablist">' + enabledTabs().map(id =>
      '<button class="tab' + (id === current ? ' on' : '') + (id !== current && ((registry[id].badge && registry[id].badge()) || (Opus.changes && Opus.changes.unseen(id))) ? ' new' : '') + '" role="tab" aria-selected="' + (id === current) + '" data-tab="' + id + '" type="button">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + (U.I[registry[id].icon] || '') + '</svg>' + registry[id].title + '</button>').join('') + '</div>';
    bar.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { if (b.dataset.tab === current) { window.scrollTo({ top: 0, behavior: 'smooth' }); } else go(b.dataset.tab); });
  }
  function go(id, opts) {
    opts = opts || {};
    if (!registry[id] || !enabledTabs().includes(id)) id = 'today';
    const changed = id !== current;
    current = id;
    try { if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id); } catch (e) {}
    const v = view();
    v.innerHTML = '';
    v.className = 'view';
    registry[id].render(v, { refresh: !!opts.refresh && !changed });
    if (Opus.changes) Opus.changes.place(id, v);
    if (!(opts.refresh && !changed)) { Opus.ui.stagger(v); window.scrollTo(0, 0); }
    renderBar();
  }
  function refresh() { if (current && !Opus.ui.topSheet()) { const y = window.scrollY; go(current, { refresh: true }); window.scrollTo(0, y); } }
  Opus.go = go;
  Opus.refresh = refresh;
  Opus.current = () => current;
  Opus.renderBar = renderBar;

  function boot() {
    Opus.store.load();
    if (!Opus.store.ok()) {
      const b = document.getElementById('banner');
      b.hidden = false;
      b.textContent = 'This browser is not letting Opus save. Everything works, but it resets when you close the page. On your phone, open Opus from the home screen.';
    }
    const start = (location.hash || '').slice(1);
    go(registry[start] ? start : 'today');
    hooks.boot.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    Opus.rest.resume();
    let lastDay = Opus.util.key();
    setInterval(() => {
      const k = Opus.util.key();
      if (current === 'today' || k !== lastDay) { lastDay = k; refresh(); }
    }, 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { refresh(); Opus.rest.resume(); }
      else Opus.store.flush();
    });
    window.addEventListener('pagehide', () => Opus.store.flush());
    window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (registry[id] && id !== current) go(id); });
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/claudeusercontent|claude\.ai/.test(location.host)) {
      try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {}
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
