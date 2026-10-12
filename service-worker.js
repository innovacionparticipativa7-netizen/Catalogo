/* Catálogo IP — 2026-10-12, caché de archivos estáticos únicamente.
 * Incrementar VERSION al publicar cambios importantes.
 * No consulta Firebase ni descarga usuarios; no recarga pestañas.
 */
const VERSION = 'v3-20261012-cuota';
const CACHE_PREFIX = 'catalogo-ip-';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const BASE = new URL(self.registration.scope);
const CORE_FILES = ['./login.html', './index.html', './sync.js?v=20261012-cuota-v2'];
const OPTIONAL_FILES = ['./', './inventario.html', './Favicon.png', './logo.png', './manifest.json'];
const ALLOWED_PATHS = new Set([...CORE_FILES, ...OPTIONAL_FILES].map(path => new URL(path, BASE).pathname));

function staticKey(url) {
  // Solo estos archivos estáticos: la consulta ?producto= no cambia su HTML.
  return url.origin + url.pathname;
}
async function precache(cache, path) {
  const url = new URL(path, BASE);
  const response = await fetch(new Request(url.href, {cache:'reload', credentials:'same-origin'}));
  if (!response.ok || response.status === 206 || response.type === 'opaque') {
    throw new Error('No se pudo descargar el archivo base: ' + url.pathname);
  }
  await cache.put(staticKey(url), response);
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(CORE_FILES.map(path => precache(cache, path)));
    await Promise.all(OPTIONAL_FILES.map(path => precache(cache, path).catch(error => {
      console.warn('[PWA] Archivo opcional no disponible:', error.message);
    })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // No eliminar cachés de otras aplicaciones del mismo dominio.
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || !ALLOWED_PATHS.has(url.pathname)) return;
  // Firebase, CDN y otras rutas siguen directamente al navegador.
  // Registrar waitUntil de inmediato mantiene vivo el guardado de la copia.
  const network = fetch(request, {cache:'no-cache'});
  const cacheWrite = network.then(async response => {
    if (!response.ok || response.status === 206 || response.type === 'opaque') return;
    const copy = response.clone();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(staticKey(url), copy);
  }).catch(error => console.warn('[PWA] No se actualizó la copia local:', error.message));
  event.waitUntil(cacheWrite);
  event.respondWith(network.catch(async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const saved = await cache.match(staticKey(url));
      if (saved) return saved;
    } catch (error) { console.warn('[PWA] Caché no disponible:', error.message); }
    if (request.mode === 'navigate') {
      return new Response('<!doctype html><html lang="es"><meta charset="UTF-8"><title>Sin conexión | IP</title><h1>Sin conexión</h1><p>Esta página aún no tiene una copia guardada. Conéctate a internet y vuelve a abrirla.</p></html>', {
        status:503, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}
      });
    }
    return Response.error();
  }));
});
self.addEventListener('sync', event => {
  if (event.tag !== 'sync-ingresos') return;
  event.waitUntil((async () => {
    // La cola está en localStorage: solo sync.js en una página puede leerla.
    // Esta señal no confirma el envío; cada registro se retira tras confirmarlo.
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    const targets = windows.filter(client => {
      const url = new URL(client.url);
      return url.origin === BASE.origin && [BASE.pathname, new URL('index.html', BASE).pathname].includes(url.pathname);
    });
    if (!targets.length) throw new Error('No hay un catálogo abierto para sincronizar. Los pendientes se conservan hasta abrirlo.');
    for (const client of targets) client.postMessage({tipo:'sincronizar'});
  })());
});
