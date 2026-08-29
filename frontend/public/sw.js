/* eslint-disable no-undef */
/**
 * Service worker EDEN VTC.
 *
 * Stratégies retenues pour un usage réseau 3G / Android d'entrée de gamme :
 * - Navigations : network-first avec repli sur le cache (puis page hors ligne).
 * - Assets statiques (JS/CSS/images/polices) : stale-while-revalidate.
 * - Appels API et authentification : jamais mis en cache.
 */

const CACHE_VERSION = 'eden-vtc-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon-eden.svg',
  '/icon-eden-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // addAll échoue en bloc si une seule URL est absente : on tolère les erreurs unitaires.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/** Requêtes qui ne doivent jamais être servies depuis le cache. */
function isBypassed(request, url) {
  if (request.method !== 'GET') return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname.startsWith('/auth')) return true;
  if (url.pathname.includes('/callback')) return true;
  if (url.pathname.endsWith('/config.json')) return true;
  return false;
}

function isStaticAsset(url) {
  return /\.(?:js|mjs|css|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|ico)$/i.test(
    url.pathname
  );
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    const shell = await caches.match('/');
    if (shell) return shell;

    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;

    return new Response('Hors ligne', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    // Revalidation en arrière-plan : réponse immédiate depuis le cache.
    network.catch(() => undefined);
    return cached;
  }

  const response = await network;
  if (response) return response;

  return new Response('', { status: 504, statusText: 'Asset indisponible' });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (isBypassed(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(handleStaticAsset(request));
  }
});