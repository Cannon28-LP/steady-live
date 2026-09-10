// Steady service worker.
// Stale-while-revalidate: the app opens instantly from cache, and a new build
// downloads in the background and is used on the next open. Best of both —
// no launch delay, and no cache version to bump by hand.
const CACHE = 'steady-v2';
const ASSETS = ['./', './index.html', './app.v2.js', './app.v2.css', './manifest.json', './icon.svg'];

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

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  const key = (req.mode === 'navigate' || req.destination === 'document') ? './index.html' : req;

  e.respondWith(
    caches.match(key, { ignoreSearch: true }).then(hit => {
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
