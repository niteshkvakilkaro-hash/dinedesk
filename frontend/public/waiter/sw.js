/*
 * Waiter app service worker (scope /waiter/).
 * - The app shell (page + built JS/CSS) is cached, so the app opens quickly and on bad Wi-Fi.
 * - API calls are never cached: orders and table states must always be live.
 */
const CACHE = 'dd-waiter-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/waiter/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: network first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/waiter/', copy));
          return res;
        })
        .catch(() => caches.match('/waiter/')),
    );
    return;
  }

  // Built assets (hashed file names): cache first, then keep a copy.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/waiter/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
