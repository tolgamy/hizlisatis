const VERSION = 'cep-pos-shell-v13-excel-19096-img';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/idb.js',
  '/normalize.js', '/image-delivery.js', '/receipt-share.js', '/catalog-taxonomy.js', '/category-menu.js', '/barcode-lookup.js', '/bundled-catalog.js', '/xlsx-reader.js', '/excel-products.js', '/urun-yukleme-sablonu.xlsx', '/manifest.json',
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
    // Cache the catalogue alongside the shell for offline use on every device.
    // A failed catalogue fetch never prevents the POS shell from installing.
    try {
      const response = await fetch('/catalog/manifest.json', { cache: 'reload' });
      if (response.ok) {
        const manifest = await response.clone().json();
        await cache.put('/catalog/manifest.json', response);
        if (Array.isArray(manifest.parts) && manifest.parts.length <= 30) {
          await Promise.allSettled(manifest.parts.filter(path =>
            typeof path === 'string' && /^\/catalog\/products-[0-9a-f]{16}-\d{2}\.json$/i.test(path))
            .map(async path => {
              const resource = await fetch(path, { cache: 'reload' });
              if (resource.ok) await cache.put(path, resource);
            }));
        }
      }
    } catch { /* offline shell still works; an earlier IndexedDB catalogue survives */ }
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
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api/image' && url.searchParams.has('url')) {
    event.respondWith((async()=>{
      const cache=await caches.open('cep-pos-image-thumbnails-v1');
      const old=await cache.match(request); if(old) return old;
      try { const res=await fetch(request); if(res.ok && (res.headers.get('content-type')||'').startsWith('image/'))
        await cache.put(request,res.clone()); return res;
      } catch { return Response.error(); }
    })());return;
  }
  if (url.pathname.startsWith('/api/')) return;
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
      if (response.ok && (['script','style','image','manifest'].includes(request.destination) || url.pathname.endsWith('.xlsx') || url.pathname.startsWith('/catalog/'))) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch { return (await cache.match(request)) || Response.error(); }
  })());
});
