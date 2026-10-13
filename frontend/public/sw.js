/*
 * DineDesk dashboard service worker: push alerts, and just enough to open the POS with no internet.
 * Data is never cached (orders and money always come from the server). Pages always come from the
 * network; the last copy of the dashboard is used only when there is no connection. Built files
 * carry their version in the name, so a kept copy is never out of date.
 */
const SHELL = 'dd-shell-v1';
const SHELL_PAGE = '/__dashboard-shell';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/storage/')) return;

  if (req.mode === 'navigate') {
    if (!url.pathname.startsWith('/dashboard')) return;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(SHELL).then((c) => c.put(SHELL_PAGE, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL_PAGE).then((hit) => hit || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'DineDesk', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'DineDesk', {
      body: data.body || '',
      tag: data.tag,
      renotify: !!data.tag,
      icon: '/icons/dd-192.png',
      badge: '/icons/dd-badge-96.png',
      data: { url: data.url || '/dashboard' },
      requireInteraction: false,
    }),
  );
});

// Tapping the alert opens (or focuses) the dashboard on the right page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        open.focus();
        return open.navigate ? open.navigate(url) : undefined;
      }
      return self.clients.openWindow(url);
    }),
  );
});
