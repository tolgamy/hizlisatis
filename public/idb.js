import { mergeCatalog, variantKey } from './excel-products.js';
const DB_NAME = 'cep-hizli-satis-db';
const DB_VERSION = 2;
let singleton;

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDB() {
  if (singleton) return singleton;
  singleton = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sales')) {
        const sales = db.createObjectStore('sales', { keyPath: 'id' });
        sales.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('adjustments')) db.createObjectStore('adjustments', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('excelProducts')) {
        const manual = db.createObjectStore('excelProducts', { keyPath: 'id' });
        manual.createIndex('barkod', 'barkod');
        manual.createIndex('variantKey', 'variantKey');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Veritabanı başka bir sekmede kullanımda.'));
  }).catch(error => { singleton = null; throw error; });
  return singleton;
}

export async function getSnapshot() {
  const db = await openDB();
  const tx = db.transaction(['products', 'excelProducts', 'adjustments', 'meta'], 'readonly');
  const products = requestPromise(tx.objectStore('products').getAll());
  const excelProducts = requestPromise(tx.objectStore('excelProducts').getAll());
  const adjustments = requestPromise(tx.objectStore('adjustments').getAll());
  const meta = requestPromise(tx.objectStore('meta').get('catalog'));
  const excelMeta = requestPromise(tx.objectStore('meta').get('excelImport'));
  const bundledMeta = requestPromise(tx.objectStore('meta').get('bundledCatalog'));
  const [catalog, manual, stock, info, imported, bundled] = await Promise.all([
    products, excelProducts, adjustments, meta, excelMeta, bundledMeta
  ]);
  return { products: mergeCatalog(catalog, manual), adjustments: stock, meta: info?.value ?? null,
    excelCount: manual.filter(p => p.source !== 'bundle').length,
    bundleCount: manual.filter(p => p.source === 'bundle').length,
    bundleMeta: bundled?.value ?? null, excelMeta: imported?.value ?? null };
}

/** Install the built-in catalogue exactly once per version, without replacing manually
 * uploaded Excel products or deleting offline sales / stock adjustments. */
export async function installBundledProducts(products, version) {
  if (!Array.isArray(products) || products.length < 1 || typeof version !== 'string')
    throw new Error('Yerleşik ürün kataloğu geçersiz.');
  const db = await openDB();
  const current = await requestPromise(db.transaction('meta', 'readonly')
    .objectStore('meta').get('bundledCatalog'));
  if (current?.value?.version === version) return { installed: false, count: current.value.count };
  const incoming = new Map(products.map(p => [p.id, p]));
  if (incoming.size !== products.length) throw new Error('Yerleşik ürün barkodları tekrarlı.');
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['excelProducts','meta'], 'readwrite');
    tx.oncomplete = () => resolve({ installed: true, count: products.length });
    tx.onabort = () => reject(tx.error || new Error('Yerleşik katalog kaydı başarısız.'));
    const store = tx.objectStore('excelProducts');
    // A newer bundle replaces only previously bundled rows, not user imports.
    const getAll = store.getAll();
    getAll.onsuccess = () => {
      for (const saved of getAll.result) {
        if (saved.source === 'bundle' && !incoming.has(saved.id)) store.delete(saved.id);
      }
      const existing = new Map(getAll.result.map(p => [p.id, p]));
      for (const product of products) {
        const old = existing.get(product.id);
        if (!old || old.source === 'bundle') store.put(product);
      }
      tx.objectStore('meta').put({ key: 'bundledCatalog', value: {
        version, count: products.length, installedAt: new Date().toISOString()
      }});
    };
  });
}

/** Source-only catalog is needed to compare an Excel feed without existing Excel overrides. */
export async function getXmlCatalog() {
  const db = await openDB();
  const tx = db.transaction('products', 'readonly');
  return requestPromise(tx.objectStore('products').getAll());
}

export async function replaceCatalog(products, meta) {
  if (!Array.isArray(products) || !products.length) throw new Error('Boş katalog kaydedilemez.');
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'meta', 'adjustments'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Katalog kaydı başarısız.'));
    tx.onerror = () => {}; // abort receives final failure
    const store = tx.objectStore('products');
    store.clear();
    for (const product of products) store.put(product);
    // Preserve sales made from the built-in catalogue if a matching XML SKU
    // arrives later under a different product ID. Never clear sales or totals.
    const barcodeToXmlId = new Map(products.filter(p => p.barkod).map(p => [p.barkod, p.id]));
    const adjustments = tx.objectStore('adjustments');
    const existing = adjustments.getAll();
    existing.onsuccess = () => {
      for (const sold of existing.result) {
        if (!sold.id.startsWith('excel::b:') || !sold.soldQuantity) continue;
        const barcode = sold.id.slice('excel::b:'.length);
        const xmlId = barcodeToXmlId.get(barcode);
        if (!xmlId || xmlId === sold.id) continue;
        const current = adjustments.get(xmlId);
        current.onsuccess = () => {
          adjustments.put({ id: xmlId, soldQuantity: (current.result?.soldQuantity || 0) + sold.soldQuantity });
          adjustments.delete(sold.id);
        };
      }
    };
    tx.objectStore('meta').put({ key: 'catalog', value: meta });
  });
}


export async function upsertExcelProducts(products, filename) {
  if (!Array.isArray(products) || !products.length) throw new Error('İçe aktarılacak ürün bulunamadı.');
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['excelProducts', 'meta'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Excel katalog kaydı başarısız.'));
    tx.onerror = () => {};
    for (const product of products) tx.objectStore('excelProducts').put(product);
    tx.objectStore('meta').put({ key: 'excelImport', value: {
      updatedAt: new Date().toISOString(), filename, importedCount: products.length
    }});
  });
}

export async function saveSale(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['sales', 'adjustments', 'products', 'excelProducts'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Satış kaydedilemedi. Stok değişmiş olabilir.'));
    tx.onerror = () => {};
    tx.objectStore('sales').add(record);
    const stock = tx.objectStore('adjustments');
    const baseStore = tx.objectStore('products');
    const excelStore = tx.objectStore('excelProducts');
    for (const item of record.items) {
      // All reads and stock writes are in the same transaction. Manual Excel
      // products survive XML sync and their stock overrides XML matches.
      const baseRequest = baseStore.get(item.id);
      baseRequest.onsuccess = () => {
        const base = baseRequest.result;
        const finish = manual => {
          const product = (manual?.importFormat === 'market-12' && base) ? base : (manual || base);
          if (!product) { tx.abort(); return; }
          const stockRequest = stock.get(item.id);
          stockRequest.onsuccess = () => {
            const soldQuantity = stockRequest.result?.soldQuantity ?? 0;
            if (soldQuantity + item.quantity > product.stok) { tx.abort(); return; }
            stock.put({ id: item.id, soldQuantity: soldQuantity + item.quantity });
          };
        };
        if (!base) {
          const req = excelStore.get(item.id);
          req.onsuccess = () => finish(req.result);
        } else if (base.barkod) {
          const req = excelStore.index('barkod').get(base.barkod);
          req.onsuccess = () => {
            if (req.result) finish(req.result);
            else if (base.urunKodu) {
              const fallback = excelStore.index('variantKey').get(variantKey(base));
              fallback.onsuccess = () => finish(fallback.result || base);
            } else finish(base);
          };
        } else if (base.urunKodu) {
          const req = excelStore.index('variantKey').get(variantKey(base));
          req.onsuccess = () => finish(req.result || base);
        } else finish(base);
      };
    }
  });
}

export async function getSales() {
  const db = await openDB();
  const tx = db.transaction('sales', 'readonly');
  return requestPromise(tx.objectStore('sales').getAll());
}
