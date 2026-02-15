const CACHE_NAME = 'relayradio-v2';
const OFFLINE_URL = '/offline.html';

// Files to cache for offline fallback
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/favicon.ico',
  '/icons/icon-192x192.png'
];

// Install: precache offline page and essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first strategy, fall back to offline page for navigation
self.addEventListener('fetch', (event) => {
  // Only handle navigation requests (page loads) for offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // RadioJar streams: intercept and upgrade HTTP redirects to HTTPS
  if (event.request.url.includes('radiojar.com')) {
    event.respondWith(
      fetch(event.request.url, { redirect: 'manual' }).then((response) => {
        if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
          const location = response.headers.get('Location');
          if (location && location.startsWith('http://')) {
            // Upgrade HTTP redirect to HTTPS
            const httpsUrl = location.replace('http://', 'https://');
            return fetch(httpsUrl);
          }
          if (location) {
            return fetch(location);
          }
        }
        return response;
      })
    );
    return;
  }

  // For audio streams, always go to network (never cache)
  if (event.request.url.includes('stream') ||
      event.request.url.includes('icecast') ||
      event.request.url.includes('.mp3') ||
      event.request.url.includes('.aac') ||
      event.request.url.includes('.ogg')) {
    return;
  }

  // For other requests: try network, fall back to cache
  event.respondWith(
    fetch(event.request).then((response) => {
      // Cache successful responses for fonts, icons etc
      if (response.ok && event.request.url.startsWith('https://')) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
      }
      return response;
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});
