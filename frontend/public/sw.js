const VERSION = 'v1';
const STATIC_CACHE = `gymgoals-static-${VERSION}`;
const PAGE_CACHE = `gymgoals-pages-${VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [STATIC_CACHE, PAGE_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('gymgoals-') && !keep.includes(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

const isStatic = (url) => url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.endsWith('.webmanifest');

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackPath) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request) ?? (fallbackPath ? await cache.match(fallbackPath) : undefined);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, url.pathname.startsWith('/gym') ? '/gym' : null));
    return;
  }

  if (request.headers.get('RSC') === '1') {
    event.respondWith(networkFirst(request, null));
  }
});
