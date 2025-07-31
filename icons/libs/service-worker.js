const CACHE_NAME = 'ventas-cache-v1'; // Cambia la versión cuando actualices
const ASSETS = [
  '/offshop/',
  '/offshop/index.html',
  '/offshop/styles.css',
  '/offshop/app.js',
  '/offshop/manifest.json',
  '/offshop/icons/icon-192.png',
  '/offshop/icons/icon-512.png',
  '/offshop/libs/jspdf.min.js',
  '/offshop/libs/jspdf.plugin.autotable.min.js'
];

// INSTALACIÓN
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ASSETS).catch(err =>
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ tipo: 'offline-error', mensaje: err.message });
          });
        })
      )
    )
  );
});

// ACTIVACIÓN
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// FETCH (maneja navegación y recursos)
self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/offshop/index.html')
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(res => {
      return res || fetch(req).catch(() => {
        return new Response('<h1>⚠️ Sin conexión y recurso no disponible offline</h1>', {
          headers: { 'Content-Type': 'text/html' }
        });
      });
    })
  );
});
