const CACHE_NAME = 'fossflow-v2';

// Get the base path from the service worker's location
const swPath = self.location.pathname;
const basePath = swPath.substring(0, swPath.lastIndexOf('/') + 1);

const urlsToCache = [
  `${basePath}manifest.json`,
  `${basePath}favicon.ico`,
  `${basePath}logo192.png`,
  `${basePath}logo512.png`
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.warn('service-worker: precache failed', err))
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls or non-GET requests: they must always hit the
  // network fresh, otherwise a stale cached response (or a response cached
  // under a since-fixed URL) can get served indefinitely.
  if (request.method !== 'GET' || url.pathname.includes('/api/')) {
    return;
  }

  // Static build assets (content-hashed filenames) never change under a
  // given URL, so cache-first is safe and fast.
  if (url.pathname.includes('/static/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) {
          return cached;
        }
        return fetch(request).then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else (navigation/HTML, manifest, etc.): network-first, so a
  // new deploy is picked up on the very next successful load instead of
  // being stuck behind a stale cached shell. Fall back to cache when
  // offline.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
