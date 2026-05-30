// Build ID is replaced at Docker build time. Locally / in dev it stays
// 'dev' so the cache is still namespaced.
const BUILD_ID = '{{BUILD_ID}}';
const CACHE_NAME = `vexara-${BUILD_ID}`;

// Install: cache critical shell assets under the build-scoped cache
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/manifest.json', '/vexara-icon-v2-192.png', '/vexara-icon-v2-512.png']).catch(() => {}),
    ),
  );
});

// Activate: delete every cache that isn't the current build's
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Fetch: hands-off for Next.js hashed assets (HTTP cache + immutable headers
// already do the right thing). Network-only for navigations so a redeploy
// can never serve a stale HTML shell. Cache-first only for the manifest /
// icons listed in install.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/')) return;
  if (event.request.mode === 'navigate') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        }
        return response;
      });
    }),
  );
});

// Push: show notification
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Vexara', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Vexara';
  const options = {
    body: data.body || '',
    icon: data.icon || '/vexara-icon-v2-192.png',
    badge: '/vexara-icon-v2-192.png',
    tag: data.tag || 'vexara',
    data: data.data || { url: '/' },
    requireInteraction: false,
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: focus or open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          return existing.navigate(targetUrl);
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
