/*
 * Service worker for a business website installed as an app. It only makes the site
 * installable; it caches nothing, so menus, prices and order status are always live.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
