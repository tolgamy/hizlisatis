const VERSION = 'cep-pos-shell-v5-category-drawer';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/idb.js',
  '/normalize.js', '/xml-local.js', '/category-menu.js', '/xlsx-reader.js', '/excel-products.js', '/urun-yukleme-sablonu.xlsx', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/placeholder.svg',
  '/vendor/html5-qrcode.min.js'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // A failed optional resource must not stop PWA installation.
    await Promise.allSettled(SHELL.map(async url => {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('cep-pos-shell-') && key !== VERSION)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        if (res.ok) await (await caches.open(VERSION)).put('/index.html', res.clone());
        return res;
      } catch { return (await caches.match('/index.html')) || Response.error(); }
    })());
    return;
  }
  // Network-first avoids stale JS/CSS after a new GitHub / Pages deployment.
  // Cache fallback still serves the application entirely offline.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const response = await fetch(request);
      if (response.ok && (['script','style','image','manifest'].includes(request.destination) || url.pathname.endsWith('.xlsx'))) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch { return (await cache.match(request)) || Response.error(); }
  })());
});
