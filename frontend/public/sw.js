/*
 * DineDesk dashboard service worker: push alerts only. It caches nothing, so the dashboard is
 * always the latest version (orders and money must never come from a stale copy).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
