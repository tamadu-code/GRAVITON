const CACHE_NAME = 'graviton-cache-v369';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/style.css?v=369',
  './assets/js/main.js?v=369',
  './assets/js/ui.js?v=369',
  './assets/js/db.js?v=369',
  './assets/js/utils.js?v=369',
  './assets/js/supabase-client.js?v=369',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.mjs',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Opened cache:', CACHE_NAME);
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  // Force the new SW to activate immediately, replacing the old one
  self.skipWaiting();
});

// Activate event - clean up ALL old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately (no reload needed)
  self.clients.claim();
});

// Fetch event - NETWORK FIRST for own assets, cache fallback for offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Don't intercept Supabase API calls at all
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // For our own origin assets (JS, CSS, HTML): Network First
  // This ensures updates propagate immediately while still working offline
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Got a fresh response - cache it and return
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed - serve from cache (offline mode)
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // Last resort: return index.html for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
        })
    );
    return;
  }

  // For external CDN resources: Cache First (they don't change often)
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) return response;

        const fetchRequest = event.request.clone();
        return fetch(fetchRequest).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        }).catch(() => {
          // CDN unavailable and not cached - nothing we can do
          return new Response('', { status: 503 });
        });
      })
  );
});

// --- PWA PUSH NOTIFICATION LISTENERS ---
self.addEventListener('push', (event) => {
  let payload = { title: 'Graviton CMS', body: 'New notice received.' };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = { title: 'Graviton CMS', body: event.data.text() };
    }
  }

  const options = {
    body: payload.body,
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: payload.data || {},
    actions: [
      { action: 'open', title: 'Open Graviton' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing open window
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // If no open window, open a new one
        if (clients.openWindow) {
          return clients.openWindow('./');
        }
      })
  );
});

