// Steady service worker.
// HTML/JS/CSS: network-first so a broken build never sticks.
// Other assets: stale-while-revalidate.
const CACHE = 'steady-v95';
const ASSETS = ['./', './index.html', './app.v3.js?b=93', './app.v3.css?b=93', './chars.js?b=93', './manifest.json', './icon.svg', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

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
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isDoc = req.mode === 'navigate' || req.destination === 'document';
  const isCode = /\.(js|css)$/.test(path) || path.endsWith('/sw.js');

  // Always try the network first for the shell and code, so a bad deploy can't lock people out.
  if (isDoc || isCode) {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          const key = isDoc ? './index.html' : req;
          caches.open(CACHE).then(c => c.put(key, copy));
        }
        return res;
      // Offline: the page falls back to the cached shell; a script or stylesheet only ever to its own cached
      // copy (serving index.html in place of app.v3.js gave a confusing module-type error).
      }).catch(() => isDoc ? caches.match('./index.html') : caches.match(req, { ignoreSearch: false }).then(hit => hit || Response.error()))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
