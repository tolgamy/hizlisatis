const DB_NAME = 'cep-hizli-satis-db';
const DB_VERSION = 3;
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
      if (!db.objectStoreNames.contains('productHistory')) {
        const history = db.createObjectStore('productHistory', { keyPath: 'id', autoIncrement: true });
        history.createIndex('productId', 'productId');
      }
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
  const tx = db.transaction(['excelProducts', 'adjustments', 'meta'], 'readonly');
  const products = requestPromise(tx.objectStore('excelProducts').getAll());
  const adjustments = requestPromise(tx.objectStore('adjustments').getAll());
  const bundledMeta = requestPromise(tx.objectStore('meta').get('bundledCatalog'));
  const excelMeta = requestPromise(tx.objectStore('meta').get('excelImport'));
  const lifecycleMeta = requestPromise(tx.objectStore('meta').get('initialDeactivation'));
  const [catalog, stock, bundled, imported, lifecycle] = await Promise.all([products,adjustments,bundledMeta,excelMeta,lifecycleMeta]);
  return { products: catalog, adjustments: stock, meta: null,
    excelCount: catalog.filter(p => p.source !== 'bundle').length,
    bundleCount: catalog.filter(p => p.source === 'bundle').length,
    bundleMeta: bundled?.value ?? null, excelMeta: imported?.value ?? null, lifecycleMeta: lifecycle?.value ?? null };
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
      for(const old of saved) if(old.source==='bundle'&&!incoming.has(old.id)) manual.delete(old.id);
      for(const product of products) {
        const prior=existing.get(product.id);
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
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['excelProducts', 'meta'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Excel katalog kaydı başarısız.'));
    tx.onerror = () => {};
    const store = tx.objectStore('excelProducts');
    for (const product of products) {
      const oldReq = store.get(product.id);
      oldReq.onsuccess = () => {
        const old = oldReq.result;
        store.put(old && product.lifecycleStatus === undefined ? { ...product,
          lifecycleStatus: old.lifecycleStatus, everActivated: old.everActivated,
          deletedFrom: old.deletedFrom, statusChangedAt: old.statusChangedAt } : product);
      };
    }
    tx.objectStore('meta').put({ key: 'excelImport', value: {
      updatedAt: new Date().toISOString(), filename, importedCount: products.length
    }});
  });
}

export async function saveSale(record) {
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
        const product=productReq.result;
        if(!product || product.lifecycleStatus && product.lifecycleStatus !== 'active') {tx.abort();return;}
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

/** Status changes and product edits are atomic with their short audit trail. */
export async function saveManagedProduct(product, action = 'edit') {
  if (!product || !product.id || !product.baslik) throw Error('Ürün adı veya kimliği eksik.');
  const db = await openDB();
  return new Promise((resolve,reject) => {
    const tx=db.transaction(['excelProducts','productHistory'],'readwrite');
    const store=tx.objectStore('excelProducts'), history=tx.objectStore('productHistory');
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error||Error('Ürün kaydedilemedi veya barkod zaten kayıtlı.'));
    const previousReq=store.get(product.id);
    previousReq.onsuccess=()=>{
      const previous=previousReq.result;
      const check = product.barkod ? store.index('barkod').get(product.barkod) : null;
      const write=()=>{
        store.put(product);
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
}

/** This one-time operation never deletes records and never reclassifies later-passive items. */
export async function initiallyDeactivateAll() {
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['excelProducts','meta','productHistory'],'readwrite');
    const products=tx.objectStore('excelProducts'), meta=tx.objectStore('meta');
    let total=0;
    const at=new Date().toISOString();
    tx.oncomplete=()=>resolve(total);
    tx.onabort=()=>reject(tx.error||Error('Toplu pasife alma iptal edildi.'));
    const already=meta.get('initialDeactivation');
    already.onsuccess=()=>{
      if(already.result) { tx.abort(); return; }
      const cursor=products.openCursor();
      cursor.onsuccess=()=>{
        const entry=cursor.result;
        if(!entry){
          meta.put({key:'initialDeactivation',value:{at,count:total}});
          tx.objectStore('productHistory').add({productId:'*',at,action:'bulk-initial-deactivation',count:total});
          return;
        }
        const p=entry.value;
        if(!p.lifecycleStatus || p.lifecycleStatus==='active') {
          entry.update({...p,lifecycleStatus:'initial-inactive',statusChangedAt:at,
            everActivated:false});
          total++;
        }
        entry.continue();
      };
    };
  });
}

export async function getManagedProductHistory(productId) {
  const db=await openDB();
  return requestPromise(db.transaction('productHistory','readonly')
    .objectStore('productHistory').index('productId').getAll(productId));
}
