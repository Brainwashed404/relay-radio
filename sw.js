const CACHE_NAME = 'relayradio-v5';
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

// Message handler: resolve RadioJar redirect URLs
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'RESOLVE_STREAM_URL') {
    const url = event.data.url;
    fetch(url, { redirect: 'manual' }).then((response) => {
      const location = response.headers.get('Location');
      if (location) {
        const resolved = location.replace(/^http:\/\//, 'https://');
        event.ports[0].postMessage({ resolved });
      } else {
        event.ports[0].postMessage({ resolved: url });
      }
    }).catch(() => {
      event.ports[0].postMessage({ resolved: url });
    });
  }
});

// CDN origins that should be served cache-first (stale-while-revalidate)
const CDN_ORIGINS = [
  'https://unpkg.com',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

const isCDN = (url) => CDN_ORIGINS.some(origin => url.startsWith(origin));

// Fetch handler
self.addEventListener('fetch', (event) => {
  // Navigation requests: network-first, fall back to offline page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Audio streams: always network, never cache
  if (event.request.url.includes('stream') ||
      event.request.url.includes('radiojar.com') ||
      event.request.url.includes('icecast') ||
      event.request.url.includes('.mp3') ||
      event.request.url.includes('.aac') ||
      event.request.url.includes('.ogg')) {
    return;
  }

  // CDN scripts/fonts: cache-first, revalidate in background
  if (isCDN(event.request.url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetchAndUpdate = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          // Return cache immediately if available, else wait for network
          return cached || fetchAndUpdate;
        });
      })
    );
    return;
  }

  // Everything else: network-first, cache on success
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok && event.request.url.startsWith('https://')) {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
