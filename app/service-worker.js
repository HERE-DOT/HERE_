/*
 * HERE — service worker mínimo.
 *
 * Objetivo: dar soporte básico de "instalación" y uso sin conexión (app-shell),
 * sin intentar cachear ni interceptar peticiones a APIs externas (Biblia.com,
 * la capacidad de IA, fuentes de Google, etc.) — esas siempre van directo a
 * la red, y si fallan, el propio index.html ya sabe caer de vuelta al texto
 * bíblico incluido localmente (data/bible-rva.json).
 *
 * El documento HTML (index.html / "./") usa estrategia "red primero": cada
 * vez que hay conexión, se pide la versión más nueva al servidor y ESA es la
 * que se muestra (la copia en caché solo se usa si no hay internet). Así,
 * cuando subas cambios a GitHub, la próxima vez que alguien abra la app con
 * conexión ve la versión nueva de inmediato — sin depender de que alguien
 * recuerde subir el número de CACHE_VERSION.
 *
 * El resto de archivos del "app shell" (manifest, datos de la Biblia) sí
 * siguen sirviéndose desde caché primero, porque cambian poco y así la app
 * carga más rápido.
 */
const CACHE_VERSION = 'here-v2';
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

  // El documento HTML principal: red primero, para que las actualizaciones
  // se vean de inmediato en cuanto hay conexión. Si falla (sin internet),
  // cae de vuelta a la copia guardada.
  const isHTMLDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTMLDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Todo lo demás (manifest, datos de la Biblia, etc.): caché primero, y
  // refresca la caché en segundo plano para la próxima vez.
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
});/*
 * HERE — service worker mínimo.
 *
 * Objetivo: dar soporte básico de "instalación" y uso sin conexión (app-shell),
 * sin intentar cachear ni interceptar peticiones a APIs externas (Biblia.com,
 * la capacidad de IA, fuentes de Google, etc.) — esas siempre van directo a
 * la red, y si fallan, el propio index.html ya sabe caer de vuelta al texto
 * bíblico incluido localmente (data/bible-rva.json).
 *
 * El documento HTML (index.html / "./") usa estrategia "red primero": cada
 * vez que hay conexión, se pide la versión más nueva al servidor y ESA es la
 * que se muestra (la copia en caché solo se usa si no hay internet). Así,
 * cuando subas cambios a GitHub, la próxima vez que alguien abra la app con
 * conexión ve la versión nueva de inmediato — sin depender de que alguien
 * recuerde subir el número de CACHE_VERSION.
 *
 * El resto de archivos del "app shell" (manifest, datos de la Biblia) sí
 * siguen sirviéndose desde caché primero, porque cambian poco y así la app
 * carga más rápido.
 */
const CACHE_VERSION = 'here-v2';
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

  // El documento HTML principal: red primero, para que las actualizaciones
  // se vean de inmediato en cuanto hay conexión. Si falla (sin internet),
  // cae de vuelta a la copia guardada.
  const isHTMLDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTMLDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Todo lo demás (manifest, datos de la Biblia, etc.): caché primero, y
  // refresca la caché en segundo plano para la próxima vez.
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
});/*
 * HERE — service worker mínimo.
 *
 * Objetivo: dar soporte básico de "instalación" y uso sin conexión (app-shell),
 * sin intentar cachear ni interceptar peticiones a APIs externas (Biblia.com,
 * la capacidad de IA, fuentes de Google, etc.) — esas siempre van directo a
 * la red, y si fallan, el propio index.html ya sabe caer de vuelta al texto
 * bíblico incluido localmente (data/bible-rva.json).
 *
 * El documento HTML (index.html / "./") usa estrategia "red primero": cada
 * vez que hay conexión, se pide la versión más nueva al servidor y ESA es la
 * que se muestra (la copia en caché solo se usa si no hay internet). Así,
 * cuando subas cambios a GitHub, la próxima vez que alguien abra la app con
 * conexión ve la versión nueva de inmediato — sin depender de que alguien
 * recuerde subir el número de CACHE_VERSION.
 *
 * El resto de archivos del "app shell" (manifest, datos de la Biblia) sí
 * siguen sirviéndose desde caché primero, porque cambian poco y así la app
 * carga más rápido.
 */
const CACHE_VERSION = 'here-v2';
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

  // El documento HTML principal: red primero, para que las actualizaciones
  // se vean de inmediato en cuanto hay conexión. Si falla (sin internet),
  // cae de vuelta a la copia guardada.
  const isHTMLDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTMLDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Todo lo demás (manifest, datos de la Biblia, etc.): caché primero, y
  // refresca la caché en segundo plano para la próxima vez.
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
});/*
 * HERE — service worker mínimo.
 *
 * Objetivo: dar soporte básico de "instalación" y uso sin conexión (app-shell),
 * sin intentar cachear ni interceptar peticiones a APIs externas (Biblia.com,
 * la capacidad de IA, fuentes de Google, etc.) — esas siempre van directo a
 * la red, y si fallan, el propio index.html ya sabe caer de vuelta al texto
 * bíblico incluido localmente (data/bible-rva.json).
 *
 * El documento HTML (index.html / "./") usa estrategia "red primero": cada
 * vez que hay conexión, se pide la versión más nueva al servidor y ESA es la
 * que se muestra (la copia en caché solo se usa si no hay internet). Así,
 * cuando subas cambios a GitHub, la próxima vez que alguien abra la app con
 * conexión ve la versión nueva de inmediato — sin depender de que alguien
 * recuerde subir el número de CACHE_VERSION.
 *
 * El resto de archivos del "app shell" (manifest, datos de la Biblia) sí
 * siguen sirviéndose desde caché primero, porque cambian poco y así la app
 * carga más rápido.
 */
const CACHE_VERSION = 'here-v2';
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

  // El documento HTML principal: red primero, para que las actualizaciones
  // se vean de inmediato en cuanto hay conexión. Si falla (sin internet),
  // cae de vuelta a la copia guardada.
  const isHTMLDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTMLDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Todo lo demás (manifest, datos de la Biblia, etc.): caché primero, y
  // refresca la caché en segundo plano para la próxima vez.
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
});/*
 * HERE — service worker mínimo.
 *
 * Objetivo: dar soporte básico de "instalación" y uso sin conexión (app-shell),
 * sin intentar cachear ni interceptar peticiones a APIs externas (Biblia.com,
 * la capacidad de IA, fuentes de Google, etc.) — esas siempre van directo a
 * la red, y si fallan, el propio index.html ya sabe caer de vuelta al texto
 * bíblico incluido localmente (data/bible-rva.json).
 *
 * El documento HTML (index.html / "./") usa estrategia "red primero": cada
 * vez que hay conexión, se pide la versión más nueva al servidor y ESA es la
 * que se muestra (la copia en caché solo se usa si no hay internet). Así,
 * cuando subas cambios a GitHub, la próxima vez que alguien abra la app con
 * conexión ve la versión nueva de inmediato — sin depender de que alguien
 * recuerde subir el número de CACHE_VERSION.
 *
 * El resto de archivos del "app shell" (manifest, datos de la Biblia) sí
 * siguen sirviéndose desde caché primero, porque cambian poco y así la app
 * carga más rápido.
 */
const CACHE_VERSION = 'here-v2';
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

  // El documento HTML principal: red primero, para que las actualizaciones
  // se vean de inmediato en cuanto hay conexión. Si falla (sin internet),
  // cae de vuelta a la copia guardada.
  const isHTMLDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTMLDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Todo lo demás (manifest, datos de la Biblia, etc.): caché primero, y
  // refresca la caché en segundo plano para la próxima vez.
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
});/*
 * HERE — service worker mínimo.
 *
 * Objetivo: dar soporte básico de "instalación" y uso sin conexión (app-shell),
 * sin intentar cachear ni interceptar peticiones a APIs externas (Biblia.com,
 * la capacidad de IA, fuentes de Google, etc.) — esas siempre van directo a
 * la red, y si fallan, el propio index.html ya sabe caer de vuelta al texto
 * bíblico incluido localmente (data/bible-rva.json).
 *
 * El documento HTML (index.html / "./") usa estrategia "red primero": cada
 * vez que hay conexión, se pide la versión más nueva al servidor y ESA es la
 * que se muestra (la copia en caché solo se usa si no hay internet). Así,
 * cuando subas cambios a GitHub, la próxima vez que alguien abra la app con
 * conexión ve la versión nueva de inmediato — sin depender de que alguien
 * recuerde subir el número de CACHE_VERSION.
 *
 * El resto de archivos del "app shell" (manifest, datos de la Biblia) sí
 * siguen sirviéndose desde caché primero, porque cambian poco y así la app
 * carga más rápido.
 */
const CACHE_VERSION = 'here-v2';
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

  // El documento HTML principal: red primero, para que las actualizaciones
  // se vean de inmediato en cuanto hay conexión. Si falla (sin internet),
  // cae de vuelta a la copia guardada.
  const isHTMLDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTMLDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Todo lo demás (manifest, datos de la Biblia, etc.): caché primero, y
  // refresca la caché en segundo plano para la próxima vez.
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
});/*
 * HERE — service worker mínimo.
 *
 * Objetivo: dar soporte básico de "instalación" y uso sin conexión (app-shell),
 * sin intentar cachear ni interceptar peticiones a APIs externas (Biblia.com,
 * la capacidad de IA, fuentes de Google, etc.) — esas siempre van directo a
 * la red, y si fallan, el propio index.html ya sabe caer de vuelta al texto
 * bíblico incluido localmente (data/bible-rva.json).
 *
 * El documento HTML (index.html / "./") usa estrategia "red primero": cada
 * vez que hay conexión, se pide la versión más nueva al servidor y ESA es la
 * que se muestra (la copia en caché solo se usa si no hay internet). Así,
 * cuando subas cambios a GitHub, la próxima vez que alguien abra la app con
 * conexión ve la versión nueva de inmediato — sin depender de que alguien
 * recuerde subir el número de CACHE_VERSION.
 *
 * El resto de archivos del "app shell" (manifest, datos de la Biblia) sí
 * siguen sirviéndose desde caché primero, porque cambian poco y así la app
 * carga más rápido.
 */
const CACHE_VERSION = 'here-v2';
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

  // El documento HTML principal: red primero, para que las actualizaciones
  // se vean de inmediato en cuanto hay conexión. Si falla (sin internet),
  // cae de vuelta a la copia guardada.
  const isHTMLDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTMLDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Todo lo demás (manifest, datos de la Biblia, etc.): caché primero, y
  // refresca la caché en segundo plano para la próxima vez.
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
});/*
 * HERE — service worker mínimo.
 *
 * Objetivo: dar soporte básico de "instalación" y uso sin conexión (app-shell),
 * sin intentar cachear ni interceptar peticiones a APIs externas (Biblia.com,
 * la capacidad de IA, fuentes de Google, etc.) — esas siempre van directo a
 * la red, y si fallan, el propio index.html ya sabe caer de vuelta al texto
 * bíblico incluido localmente (data/bible-rva.json).
 *
 * El documento HTML (index.html / "./") usa estrategia "red primero": cada
 * vez que hay conexión, se pide la versión más nueva al servidor y ESA es la
 * que se muestra (la copia en caché solo se usa si no hay internet). Así,
 * cuando subas cambios a GitHub, la próxima vez que alguien abra la app con
 * conexión ve la versión nueva de inmediato — sin depender de que alguien
 * recuerde subir el número de CACHE_VERSION.
 *
 * El resto de archivos del "app shell" (manifest, datos de la Biblia) sí
 * siguen sirviéndose desde caché primero, porque cambian poco y así la app
 * carga más rápido.
 */
const CACHE_VERSION = 'here-v2';
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

  // El documento HTML principal: red primero, para que las actualizaciones
  // se vean de inmediato en cuanto hay conexión. Si falla (sin internet),
  // cae de vuelta a la copia guardada.
  const isHTMLDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTMLDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Todo lo demás (manifest, datos de la Biblia, etc.): caché primero, y
  // refresca la caché en segundo plano para la próxima vez.
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
