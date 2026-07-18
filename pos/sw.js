// sw.js — Service worker: cachea el app-shell para funcionar sin conexión.
// Estrategia: cache-first para estáticos propios; los datos viven en IndexedDB.
const CACHE = 'snackpos-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/data.js',
  './js/store.js',
  './js/router.js',
  './js/sync.js',
  './js/seed.js',
  './js/ui.js',
  './js/money.js',
  './js/i18n.js',
  './js/views/login.js',
  './js/views/pos.js',
  './js/views/payment.js',
  './js/views/receipt.js',
  './js/views/dashboard.js',
  './js/views/products.js',
  './js/views/inventory.js',
  './js/views/customers.js',
  './js/views/cash.js',
  './js/views/reports.js',
  './js/views/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // no interceptar terceros (ej. futuro Supabase)
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Revalida en segundo plano (stale-while-revalidate) para archivos propios
        fetch(request).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone())); }).catch(() => {});
        return cached;
      }
      return fetch(request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
