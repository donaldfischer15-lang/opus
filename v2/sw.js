/* Opus service worker: opens Opus from this phone first, so it opens at once even with no signal.
   Bump VERSION when files change: the new version downloads in the background and Opus switches to it. */
const VERSION = 'opus2-1.42.0-b';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/opus.css',
  'js/core.js', 'js/training.js', 'js/ui.js', 'js/example-plan.js', 'js/app.js', 'js/changes.js', 'js/weekahead.js', 'js/notify.js', 'js/desk.js',
  'js/body.js', 'js/pets.js', 'js/supps.js', 'js/tabs/today.js', 'js/foodsearch.js', 'js/snap.js', 'js/receipts.js', 'js/whoop.js', 'js/breath.js', 'js/hair.js', 'js/memory.js', 'js/listen.js', 'js/voice.js', 'js/tabs/food.js', 'js/tabs/train.js', 'js/tabs/money.js', 'js/tabs/home.js', 'js/tabs/growth.js', 'js/tabs/settings.js', 'js/sync.js', 'js/v2.js', 'js/v2b.js', 'js/v2c.js', 'js/v2d.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/cassius.svg'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && !k.startsWith('opus-fonts') && !/^opus-\d/.test(k) && !k.startsWith('opus-vendor') && !k.startsWith('opus-voice')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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
  // the barcode reader (about 1 MB): fetched the first time it's used, then kept across versions
  if (url.pathname.includes('/js/vendor/')) {
    e.respondWith(caches.open('opus-vendor-zxing-3.1.7').then(async c => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(e.request); if (r && r.ok) c.put(e.request, r.clone()); return r;
    }));
    return;
  }
  // a file asked for fresh (the guide Opus copies to GitHub) always comes from the network
  if (e.request.cache === 'no-store') { e.respondWith(fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || Response.error()))); return; }
  // app files: straight from this phone, so Opus opens at once with a weak signal or none.
  // The newest copy is fetched behind it for next time; a new version installs itself (see app.js).
  e.respondWith(caches.open(VERSION).then(async c => {
    const nav = e.request.mode === 'navigate';
    const hit = await c.match(nav ? 'index.html' : e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(r => { if (r && r.ok && r.type === 'basic') c.put(nav ? 'index.html' : e.request, r.clone()); return r; });
    if (hit) { e.waitUntil(fresh.catch(() => null)); return hit; }
    return fresh.catch(() => c.match('index.html'));
  }));
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
