// Steady service worker.
// Stale-while-revalidate: the app opens instantly from cache, and a new build
// downloads in the background and is used on the next open. Best of both —
// no launch delay, and no cache version to bump by hand.
const CACHE = 'steady-v5';
const ASSETS = ['./', './index.html', './app.v3.js?b=3', './app.v3.css?b=3', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// ---- reminders ----
self.addEventListener('push', e => {
  let d = { title: 'Steady', body: 'Time to tick something off.' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (err) { if (e.data) d.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: './icon.svg', badge: './icon.svg',
    tag: d.tag || 'steady', renotify: false, data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  const key = (req.mode === 'navigate' || req.destination === 'document') ? './index.html' : req;

  e.respondWith(
    caches.match(key, { ignoreSearch: (key === './index.html') }).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(key, copy));
        }
        return res;
      }).catch(() => hit);
      // Serve the cached copy straight away; refresh it behind the scenes.
      return hit || net;
    })
  );
});
