const DB_NAME = 'cep-hizli-satis-db';
const DB_VERSION = 1;
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Veritabanı başka bir sekmede kullanımda.'));
  }).catch(error => { singleton = null; throw error; });
  return singleton;
}

export async function getSnapshot() {
  const db = await openDB();
  const tx = db.transaction(['products', 'adjustments', 'meta'], 'readonly');
  const products = requestPromise(tx.objectStore('products').getAll());
  const adjustments = requestPromise(tx.objectStore('adjustments').getAll());
  const meta = requestPromise(tx.objectStore('meta').get('catalog'));
  const [catalog, stock, info] = await Promise.all([products, adjustments, meta]);
  return { products: catalog, adjustments: stock, meta: info?.value ?? null };
}

export async function replaceCatalog(products, meta) {
  if (!Array.isArray(products) || !products.length) throw new Error('Boş katalog kaydedilemez.');
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'meta'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Katalog kaydı başarısız.'));
    tx.onerror = () => {}; // abort receives final failure
    const store = tx.objectStore('products');
    store.clear();
    for (const product of products) store.put(product);
    tx.objectStore('meta').put({ key: 'catalog', value: meta });
  });
}

export async function saveSale(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['sales', 'adjustments', 'products'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Satış kaydedilemedi.'));
    tx.onerror = () => {};
    tx.objectStore('sales').add(record);
    const stock = tx.objectStore('adjustments');
    for (const item of record.items) {
      // Validate against the latest catalog and stock within the same IDB
      // write transaction, preventing oversells from concurrent browser tabs.
      const productRequest = tx.objectStore('products').get(item.id);
      productRequest.onsuccess = () => {
        const product = productRequest.result;
        if (!product) { tx.abort(); return; }
        const req = stock.get(item.id);
        req.onsuccess = () => {
          const old = req.result?.soldQuantity ?? 0;
          if (old + item.quantity > product.stok) { tx.abort(); return; }
          stock.put({ id: item.id, soldQuantity: old + item.quantity });
        };
      };
    }
  });
}

export async function getSales() {
  const db = await openDB();
  const tx = db.transaction('sales', 'readonly');
  return requestPromise(tx.objectStore('sales').getAll());
}
