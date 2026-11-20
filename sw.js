/* Opus service worker: keeps the app working offline. Bump VERSION when files change. */
const VERSION = 'opus-1.14.1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/opus.css',
  'js/core.js', 'js/training.js', 'js/ui.js', 'js/example-plan.js', 'js/app.js', 'js/changes.js', 'js/weekahead.js', 'js/notify.js', 'js/desk.js',
  'js/body.js', 'js/pets.js', 'js/supps.js', 'js/tabs/today.js', 'js/tabs/food.js', 'js/tabs/train.js', 'js/tabs/money.js', 'js/tabs/home.js', 'js/tabs/growth.js', 'js/tabs/settings.js', 'js/sync.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/cassius.svg'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && !k.startsWith('opus-fonts')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // fonts: cache after first load so the Roman type works offline
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.open('opus-fonts').then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try { const r = await fetch(e.request); c.put(e.request, r.clone()); return r; } catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // app files: network first so updates arrive, cache when offline
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

// notifications sent by the helper (see js/notify.js): show them, and open Opus on the right tab when tapped
self.addEventListener('push', e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch (err) { m = { title: 'Opus', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Opus', { body: m.body || '', tag: m.tag || undefined, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { tab: m.tab || 'today' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const tab = String((e.notification.data || {}).tab || 'today').replace(/[^a-z]/g, '');
  const url = new URL('./#' + tab, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.postMessage({ opus: 'go', tab }); return c.focus(); } }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
