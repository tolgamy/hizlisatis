const VERSION = 'cep-pos-shell-v50-one-tap-live-scale-buffer-fix1-merged-cart-v51-checkout-v52-active-categories-v53-simplified-pos-v54-settings-v55-large-categories-v56-users-v56-login-safe-v57-desktop-redesign-v58-home-6x2-product-images-v59-desktop-views-v60-desktop-account-status-v61';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/auth-ui.js', '/idb.js',
  '/normalize.js', '/cash-change.js', '/basket-pricing.js', '/picker-preferences.js', '/scale-serial.js', '/active-products-cache.js', '/remote-products.js', '/product-lifecycle.js', '/product-management.js', '/product-photo.js', '/lifecycle-backup.js', '/device-backup.js', '/passive-auth.js', '/receipt-pdf.js', '/barcode-scanner.js', '/category-art.js', '/subcategory-icons.js', '/subcategory-photos.js', '/category-image-overrides.js', '/category-image-manager.js', '/customer-api.js', '/customer-ui.js', '/receipt-settings.js', '/image-delivery.js', '/receipt-share.js', '/catalog-taxonomy.js', '/category-menu.js', '/barcode-lookup.js', '/bundled-catalog.js', '/xlsx-reader.js', '/excel-products.js', '/urun-yukleme-sablonu.xlsx', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/brand-mark.svg', '/icons/favicon.svg', '/icons/placeholder.svg', '/icons/home-grocery-basket.svg',
  '/category-images/kasap.webp', '/category-images/manav.webp', '/category-images/firindan-yiyecek.webp',
  '/category-images/sut-kahvaltilik.webp', '/category-images/atistirmalik.webp', '/category-images/su-icecek.webp',
  '/category-images/dondurma.webp', '/category-images/temel-gida.webp', '/category-images/ev-bakim-anne-bebek.webp',
  '/category-images/kisisel-bakim.webp', '/category-images/ev-yasam.webp', '/category-images/petshop.webp',
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
    // Central D1 is authoritative. Do not download 20 large obsolete JSON
    // catalogue files during SW install: it competes with the D1 mobile fetch.
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
  // Cache only curated public category photography for offline revisits.
  // Browser image responses can be opaque: CacheStorage accepts them.
  if(url.protocol==='https:' && url.hostname==='images.pexels.com' && request.destination==='image'){
    event.respondWith((async()=>{
      const cache=await caches.open('cep-pos-subcategory-photos-v1');
      const stored=await cache.match(request);
      if(stored)return stored;
      try {
        const response=await fetch(request);
        if(response.ok||response.type==='opaque')await cache.put(request,response.clone());
        return response;
      }catch{return Response.error();}
    })());
    return;
  }
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
