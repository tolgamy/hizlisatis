import { overlayLifecycleBackup } from './lifecycle-backup.js';
import { fetchRemoteProducts, saveRemoteProduct, deactivateRemoteProducts, importRemoteProducts, checkRemoteProductStates } from './remote-products.js';

const DB_NAME = 'cep-hizli-satis-db';
const DB_VERSION = 4;
let singleton;

/** A separate ledger prevents catalog refresh/import from resetting passive/deleted states. */
function lifecycleRecord(product) {
  return { id: product.id, lifecycleStatus: product.lifecycleStatus || 'active',
    everActivated: Boolean(product.everActivated), deletedFrom: product.deletedFrom || null,
    statusChangedAt: product.statusChangedAt || null };
}
export function mergeProductLifecycle(product, record) {
  if (!record) return product;
  return { ...product, lifecycleStatus: record.lifecycleStatus,
    everActivated: Boolean(record.everActivated), deletedFrom: record.deletedFrom || null,
    statusChangedAt: record.statusChangedAt || null };
}

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
      if (!db.objectStoreNames.contains('productHistory')) {
        const history = db.createObjectStore('productHistory', { keyPath: 'id', autoIncrement: true });
        history.createIndex('productId', 'productId');
      }
      if (!db.objectStoreNames.contains('excelProducts')) {
        const manual = db.createObjectStore('excelProducts', { keyPath: 'id' });
        manual.createIndex('barkod', 'barkod');
        manual.createIndex('variantKey', 'variantKey');
      }
      if (!db.objectStoreNames.contains('productLifecycle')) {
        const lifecycle = db.createObjectStore('productLifecycle', { keyPath: 'id' });
        // One-time upgrade: preserve statuses saved before the independent ledger existed.
        const cursor = req.transaction.objectStore('excelProducts').openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          if (row.value.lifecycleStatus) lifecycle.put(lifecycleRecord(row.value));
          row.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Veritabanı başka bir sekmede kullanımda.'));
  }).catch(error => { singleton = null; throw error; });
  return singleton;
}

export async function getLocalSnapshot() {
  const db = await openDB();
  const tx = db.transaction(['excelProducts', 'adjustments', 'meta', 'productLifecycle'], 'readonly');
  const products = requestPromise(tx.objectStore('excelProducts').getAll());
  const adjustments = requestPromise(tx.objectStore('adjustments').getAll());
  const lifecycle = requestPromise(tx.objectStore('productLifecycle').getAll());
  const bundledMeta = requestPromise(tx.objectStore('meta').get('bundledCatalog'));
  const excelMeta = requestPromise(tx.objectStore('meta').get('excelImport'));
  const lifecycleMeta = requestPromise(tx.objectStore('meta').get('initialDeactivation'));
  const [stored, stock, statuses, bundled, imported, firstPass] =
    await Promise.all([products, adjustments, lifecycle, bundledMeta, excelMeta, lifecycleMeta]);
  const ledger = new Map(statuses.map(row => [row.id, row]));
  const catalog = overlayLifecycleBackup(stored.map(product => mergeProductLifecycle(product, ledger.get(product.id))));
  return { products: catalog, adjustments: stock, meta: null,
    excelCount: catalog.filter(p => p.source !== 'bundle').length,
    bundleCount: catalog.filter(p => p.source === 'bundle').length,
    bundleMeta: bundled?.value ?? null, excelMeta: imported?.value ?? null,
    lifecycleMeta: firstPass?.value ?? null };
}


/** Central D1 is authoritative for lifecycle and managed product edits.
 * Local IndexedDB is only a seed/cache for the versioned catalogue and sales.
 * Legacy local statuses can be read with getLocalSnapshot solely for migration.
 */
/** Cheap device-only sale state. Avoid reading 19,096 redundant local products
 * while the authoritative D1 catalogue is being loaded on a phone.
 * Full device products are still accessible to explicit backup/migration.
 */
async function getDeviceState() {
  const db=await openDB();
  const tx=db.transaction(['adjustments','meta','productHistory'],'readonly');
  const [adjustments,bulk,excelMeta,history]=await Promise.all([
    requestPromise(tx.objectStore('adjustments').getAll()),
    requestPromise(tx.objectStore('meta').get('initialDeactivation')),
    requestPromise(tx.objectStore('meta').get('excelImport')),
    requestPromise(tx.objectStore('productHistory').count())
  ]);
  return {adjustments,meta:null, lifecycleMeta:bulk?.value||null,
    oldDeviceEdits:Boolean(history || excelMeta?.value)};
}

/** Every product is authoritative from D1. Old IndexedDB products are NOT
 * allowed to override the central catalog; they remain for explicit backup.
 */
export async function getSnapshot(onProgress) {
  const [device,remote]=await Promise.all([
    getDeviceState().catch(error=>{
      // The shared product catalog must remain viewable even if a browser
      // blocks or has a damaged local sales/cache database.
      console.warn('Local sales cache unavailable:',error);
      return {adjustments:[],meta:null,lifecycleMeta:null,oldDeviceEdits:false,
        localUnavailable:true};
    }),fetchRemoteProducts(onProgress)
  ]);
  if(!remote.products.length)
    throw Error('Merkezi D1 kataloğu eksik. Eski cihaz ürünleri otomatik yüklenmedi.');
  const products=remote.products;
  return {...device,products,
    excelCount:products.filter(p=>p.source!=='bundle').length,
    bundleCount:products.filter(p=>p.source==='bundle').length,
    lifecycleMeta:remote.bulkAt?{at:remote.bulkAt}:null,
    legacyPending:Boolean((device.lifecycleMeta&&!remote.bulkAt)||device.oldDeviceEdits)};
}

/** Atomically replace only bundled products and remove the deprecated XML store.
 * Device-specific Excel edits and sales persist. Legacy XML stock movements follow
 * matching barcodes onto their new Excel ids instead of being discarded.
 */
export async function installBundledProducts(products, version) {
  if (!Array.isArray(products) || !products.length || !version) throw Error('Ürün kataloğu geçersiz.');
  const incoming=new Map(products.map(p=>[p.id,p]));
  if (incoming.size !== products.length) throw Error('Tekrarlanan ürün barkodu.');
  const db=await openDB();
  const savedMeta=await requestPromise(db.transaction('meta','readonly').objectStore('meta').get('bundledCatalog'));
  if (savedMeta?.value?.version===version) return {installed:false,count:savedMeta.value.count};
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['excelProducts','products','adjustments','meta'],'readwrite');
    tx.oncomplete=()=>resolve({installed:true,count:products.length});
    tx.onabort=()=>reject(tx.error||Error('Katalog kaydı tamamlanamadı.'));
    const manual=tx.objectStore('excelProducts');
    const legacy=tx.objectStore('products');
    const stock=tx.objectStore('adjustments');
    const request=manual.getAll();
    request.onsuccess=()=>{
      const saved=request.result;
      const existing=new Map(saved.map(p=>[p.id,p]));
      const editedBarcodes=new Set(saved.filter(p=>p.source!=='bundle').map(p=>p.barkod).filter(Boolean));
      for(const old of saved) if(old.source==='bundle'&&!incoming.has(old.id)&&!old.lifecycleStatus) manual.delete(old.id);
      for(const product of products) {
        const prior=existing.get(product.id);
        if(!prior&&editedBarcodes.has(product.barkod)) continue;
        if(!prior||prior.source==='bundle') manual.put(prior ? { ...product,
          lifecycleStatus: prior.lifecycleStatus, everActivated: prior.everActivated,
          deletedFrom: prior.deletedFrom, statusChangedAt: prior.statusChangedAt } : product);
      }
      const legacyReq=legacy.getAll();
      legacyReq.onsuccess=()=>{
        const move=new Map();
        for(const old of legacyReq.result) {
          if (!old.barkod) continue;
          const key=`excel::b:${String(old.barkod).trim()}`;
          if (key!==old.id && (incoming.has(key)||existing.has(key))) move.set(old.id,key);
        }
        const stockReq=stock.getAll();
        stockReq.onsuccess=()=>{
          const all=new Map(stockReq.result.map(x=>[x.id,x.soldQuantity||0]));
          for(const [oldId,newId] of move) {
            const quantity=all.get(oldId)||0;
            if(!quantity) continue;
            all.set(newId,(all.get(newId)||0)+quantity);
            all.delete(oldId);
            stock.delete(oldId);
            stock.put({id:newId,soldQuantity:all.get(newId)});
          }
          legacy.clear();
          const meta=tx.objectStore('meta');
          meta.delete('catalog');
          meta.put({key:'bundledCatalog',value:{version,count:products.length,installedAt:new Date().toISOString()}});
        };
      };
    };
  });
}

export async function upsertExcelProducts(products, filename) {
  if (!Array.isArray(products) || !products.length) throw new Error('İçe aktarılacak ürün bulunamadı.');
  await importRemoteProducts(products); // Server write must succeed before caching locally.
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['excelProducts', 'meta', 'productLifecycle'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Excel katalog kaydı başarısız.'));
    const store = tx.objectStore('excelProducts');
    const statuses = tx.objectStore('productLifecycle').getAll();
    statuses.onsuccess = () => {
      const ledger = new Map(statuses.result.map(row => [row.id, row]));
      for (const product of products) {
        const oldReq = product.barkod ? store.index('barkod').get(product.barkod) : store.get(product.id);
        oldReq.onsuccess = () => {
          const old = oldReq.result;
          const target = old && old.id !== product.id ? { ...product, id: old.id } : product;
          const previous = old && product.lifecycleStatus === undefined
            ? { ...target, lifecycleStatus: old.lifecycleStatus, everActivated: old.everActivated,
                deletedFrom: old.deletedFrom, statusChangedAt: old.statusChangedAt } : target;
          store.put(mergeProductLifecycle(previous, ledger.get(target.id)));
        };
      }
      tx.objectStore('meta').put({ key: 'excelImport', value: {
        updatedAt: new Date().toISOString(), filename, importedCount: products.length
      }});
    };
  });
}

export async function saveSale(record) {
  // Refresh server state before sale. Local lifecycle flags may be stale on a
  // second phone and must not override D1.
  const current=await checkRemoteProductStates(record.items.map(item=>item.id));
  for(const item of record.items) {
    const product=current.products.get(item.id);
    if(!product)throw Error('Ürün merkezi veritabanında bulunamadı. Listeyi yenileyin.');
    const status=product.lifecycleStatus||(current.bulkAt?'initial-inactive':'active');
    if(status!=='active')throw Error('Ürün artık aktif değil. Listeyi yenileyin.');
  }
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['sales','adjustments','excelProducts'],'readwrite');
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error||Error('Satış kaydedilemedi.'));
    tx.objectStore('sales').add(record);
    const stock=tx.objectStore('adjustments');
    const catalog=tx.objectStore('excelProducts');
    for(const item of record.items) {
      const productReq=catalog.get(item.id);
      productReq.onsuccess=()=>{
        const product=current.products.get(item.id)||productReq.result;
        if(!product) {tx.abort();return;}
        if(!productReq.result)catalog.put(product);
        const stockReq=stock.get(item.id);
        stockReq.onsuccess=()=>{
          const sold=stockReq.result?.soldQuantity||0;
          if(!product.stokBelirsiz && sold+item.quantity>product.stok) {tx.abort();return;}
          stock.put({id:item.id,soldQuantity:sold+item.quantity});
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

/** Import device sales by their immutable receipt IDs, without rewriting D1
 * product records or the customer ledger. Only genuinely new receipts affect
 * this device's soldQuantity totals. Existing receipts are always skipped.
 */
export async function restoreSalesBackup(records) {
  if(!Array.isArray(records))throw Error('Yedek satış listesi geçersiz.');
  if(records.length>50000)throw Error('Yedekte çok fazla satış var.');
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['sales','adjustments'],'readwrite');
    const sales=tx.objectStore('sales'),adjustments=tx.objectStore('adjustments');
    let added=0,skipped=0,index=0;
    const sold=new Map();
    tx.oncomplete=()=>resolve({added,skipped});
    tx.onabort=()=>reject(tx.error||Error('Yedek geri yüklenemedi.'));
    tx.onerror=()=>{}; // onabort supplies the error once, and rolls back atomically
    function reconcileStock(){
      for(const [id,quantity] of sold){
        const request=adjustments.get(id);
        request.onsuccess=()=>{
          const previous=request.result?.soldQuantity||0;
          adjustments.put({id,soldQuantity:previous+quantity});
        };
      }
    }
    function next(){
      if(index>=records.length){reconcileStock();return;}
      const record=records[index++];
      const check=sales.get(record.id);
      check.onsuccess=()=>{
        if(check.result)skipped++;
        else{
          sales.add(record);added++;
          for(const item of record.items){
            if(typeof item.id==='string'&&Number.isFinite(item.quantity)&&item.quantity>0)
              sold.set(item.id,(sold.get(item.id)||0)+item.quantity);
          }
        }
        next();
      };
    }
    next();
  });
}

/** Status changes and product edits are atomic with their short audit trail. */
export async function saveManagedProduct(product, action = 'edit') {
  if (!product || !product.id || !product.baslik) throw Error('Ürün adı veya kimliği eksik.');
  // Persist to D1 first; IndexedDB below is a disposable local cache.
  const result=await saveRemoteProduct(product,action);
  product=result.product;
  // Server commit succeeds before any optional local cache writes.
  try {
    const db = await openDB();
    await new Promise((resolve,reject) => {
    const tx=db.transaction(['excelProducts','productHistory','productLifecycle'],'readwrite');
    const store=tx.objectStore('excelProducts'), history=tx.objectStore('productHistory');
    const lifecycle=tx.objectStore('productLifecycle');
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error||Error('Ürün kaydedilemedi veya barkod zaten kayıtlı.'));
    const previousReq=store.get(product.id);
    previousReq.onsuccess=()=>{
      const previous=previousReq.result;
      const check = product.barkod ? store.index('barkod').get(product.barkod) : null;
      const write=()=>{
        store.put(product);
        lifecycle.put(lifecycleRecord(product));
        const summary=p=>p ? { name:p.baslik, barcode:p.barkod, price:p.satisFiyati,
          category:p.kategori, vat:p.kdv, status:p.lifecycleStatus||'active' } : null;
        history.add({ productId:product.id, at:new Date().toISOString(), action,
          before:summary(previous), after:summary(product) });
      };
      if(check) check.onsuccess=()=> {
        if(check.result && check.result.id!==product.id) tx.abort();
        else write();
      };
      else write();
    };
    });
  } catch(error) {
    console.warn('Local product cache unavailable; central D1 write already succeeded:',error);
  }
  return result.product;
}

/** This one-time operation never deletes records and never reclassifies later-passive items. */
export async function initiallyDeactivateAll() {
  const snapshot=await getSnapshot();
  if(snapshot.lifecycleMeta)throw Error('Toplu işlem daha önce yapılmış.');
  const count=snapshot.products.filter(p=>p.lifecycleStatus==='active').length;
  await deactivateRemoteProducts();
  // No 19,000-row browser storage mirror: D1 bulk_at is authoritative.
  return count;
}

export async function getManagedProductHistory(productId) {
  const db=await openDB();
  return requestPromise(db.transaction('productHistory','readonly')
    .objectStore('productHistory').index('productId').getAll(productId));
}
