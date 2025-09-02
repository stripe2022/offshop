// service-worker.js — Blindado

const CACHE_NAME = 'ventas-cache-v1';

const ASSETS = [
  '/offshop/',
  '/offshop/index.html',
  '/offshop/styles.css',
  '/offshop/app.js',
  '/offshop/manifest.json',
  '/offshop/icons/icon-192.png',
  '/offshop/icons/icon-512.png',
  '/offshop/libs/jspdf.umd.min.js',
  '/offshop/libs/jspdf.plugin.autotable.min.js'
];

// ===== INSTALACIÓN =====
self.addEventListener('install', event => {
  console.log('[SW] Instalando -> precache de assets');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
      .catch(err => console.error('[SW] Error precache:', err))
  );
  // No skipWaiting: dejamos que el SW nuevo espere
});

// ===== ACTIVACIÓN =====
self.addEventListener('activate', event => {
  console.log('[SW] Activado -> no se borran caches antiguos');
  event.waitUntil(self.clients.claim());
});

// ===== FETCH =====
self.addEventListener('fetch', event => {
  const req = event.request;

  // Navegación: siempre servimos el index.html desde caché
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/offshop/index.html').then(res => {
        if (res) return res;
        return fetch(req).catch(() =>
          new Response('<h1>⚠️ Sin conexión</h1><p>No hay index.html en caché.</p>', {
            headers: { 'Content-Type': 'text/html' }
          })
        );
      })
    );
    return;
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  // Si está en la lista de ASSETS → cache-only
  if (ASSETS.includes(pathname)) {
    event.respondWith(
      caches.match(req).then(res => {
        if (res) return res;
        return fetch(req).then(netRes => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(req, netRes.clone());
            return netRes;
          });
        }).catch(() =>
          new Response('', { status: 504, statusText: 'Offline y sin caché' })
        );
      })
    );
    return;
  }

  // Para otros recursos (ej. imágenes de productos) → cache-first
  event.respondWith(
    caches.match(req).then(res => {
      return res || fetch(req).catch(() =>
        new Response('', { status: 504, statusText: 'Offline y sin caché' })
      );
    })
  );
});

// ===== MENSAJES OPCIONALES =====
self.addEventListener('message', async (event) => {
  const { type } = event.data || {};

  if (type === 'CLEAR_CACHE') {
    const ok = await caches.delete(CACHE_NAME);
    console.log('[SW] CLEAR_CACHE ->', ok);
    event.source?.postMessage({ tipo: 'cache', estado: ok ? 'borrado' : 'no-existia' });
  }

  if (type === 'WARMUP_CACHE') {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    console.log('[SW] WARMUP_CACHE -> recargado');
    event.source?.postMessage({ tipo: 'cache', estado: 'precargado' });
  }

  if (type === 'SKIP_WAITING') {
    await self.skipWaiting();
    console.log('[SW] SKIP_WAITING -> forzado');
  }
});
