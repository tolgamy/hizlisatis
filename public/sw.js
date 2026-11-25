const VERSION = 'cep-pos-shell-v50-one-tap-live-scale-buffer-fix1-merged-cart-v51-checkout-v52-active-categories-v53-simplified-pos-v54-settings-v55-large-categories-v56-users-v56-login-safe-v57-desktop-redesign-v58-home-6x2-product-images-v59-desktop-views-v60-desktop-account-status-v61-sale-history-height-v62-inline-workspaces-v63-products-inline-6x2-v64-native-workspaces-v65-mobile-compact-payment-v66-stock-quick-edit-v67-desktop-products-3x4-v68-sale-header-variety-v70-mobile-sale-frame-v71-unified-sale-toolbar-v72-iphone-four-items-v73-picker-4x4x2-v74-account-signout-confirm-v74-mobile-nav-and-totals-v75-side-by-side-home-summary-white-sales-v78-desktop-continue-stack-v79-central-sales-v80-report-filters-v81-no-stock-limits-v82-audited-void-v83-general-cancel-v84-unknown-barcode-v85-stock-question-v86-unique-js-v87-central-v88-price-label-v89-rotated-label-v90-aligned-v91-one-page-v92-native-pdf-v101-pc-categories-v103-v105-v106-v107-v108-v109-v110-v111-v112-v113-v114';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app-v114.js', '/screen-lock-v114.js', '/screen-lock-v114.css', '/screen-lock-v112.css', '/receipt-settings-v111.js', '/receipt-vector-v110.js', '/local-print-v110.js', '/receipt-settings-v110.js', '/sale-ready-v109.js', '/sale-receipt-v109.css', '/receipt-settings-v109.js', '/receipt-quote-v109.js', '/local-print-v109.js', '/desktop-picker-v107.css', '/desktop-picker-v108.css', '/receipt-portrait-v107.js', '/origin-review-v107.js', '/local-print-v107.js', '/sale-input-v106.js', '/receipt-quote-v106.js', '/layout-v106.css', '/local-print-v106.js', '/reports-v101.css', '/receipt-settings-v106.js', '/product-export-v100.js', '/price-label-v106.js', '/price-label-v106.css', '/argox-pdf-v99.js', '/printer-profiles-v99.js', '/label-queue-v99.js', '/local-print-v99.js', '/product-origin-v99.js', '/central-sales-v88.js', '/report-filters.js', '/auth-ui.js', '/idb.js',
  '/normalize.js', '/stock-editor.js', '/cash-change.js', '/basket-pricing.js', '/picker-preferences.js', '/scale-serial.js', '/active-products-cache.js', '/remote-products.js', '/product-lifecycle.js', '/product-management-v99.js', '/product-photo.js', '/lifecycle-backup.js', '/device-backup.js', '/passive-auth.js', '/receipt-pdf.js', '/barcode-scanner.js', '/category-art.js', '/subcategory-icons.js', '/subcategory-photos.js', '/category-image-overrides.js', '/category-image-manager.js', '/customer-api.js', '/customer-ui.js', '/receipt-settings.js', '/image-delivery.js', '/receipt-share-v106.js', '/catalog-taxonomy.js', '/category-menu.js', '/barcode-lookup.js', '/bundled-catalog.js', '/xlsx-reader.js', '/excel-products.js', '/urun-yukleme-sablonu.xlsx', '/manifest.json',
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
