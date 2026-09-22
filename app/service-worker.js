/*
 * HERE — service worker mínimo.
 *
 * Objetivo: dar soporte básico de "instalación" y uso sin conexión (app-shell),
 * sin intentar cachear ni interceptar peticiones a APIs externas (Biblia.com,
 * la capacidad de IA, fuentes de Google, etc.) — esas siempre van directo a
 * la red, y si fallan, el propio index.html ya sabe caer de vuelta al texto
 * bíblico incluido localmente (data/bible-rva.json).
 *
 * Cuando se publique una nueva versión del archivo, sube también el número
 * de CACHE_VERSION para que los teléfonos con la app ya instalada reciban
 * la actualización en su siguiente visita, en vez de quedarse con una copia
 * vieja para siempre.
 */
const CACHE_VERSION = 'here-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/bible-rva.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Solo maneja peticiones al mismo origen (el propio sitio). Todo lo demás
  // (Biblia.com, IA, Google Fonts) pasa directo a la red sin interceptarse.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      // Devuelve la copia en caché de inmediato si existe (rápido y sirve
      // sin conexión), y de todas formas refresca la caché en segundo plano.
      return cached || network;
    })
  );
});
