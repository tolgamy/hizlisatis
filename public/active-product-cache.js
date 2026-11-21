/**
 * Optional read-only device snapshot containing ONLY currently active products.
 * D1 remains authoritative for every lifecycle edit and product write.
 *
 * Never store passive/deleted records, bulk-state lists, admin credentials or
 * large embedded base64 photos in localStorage. A successful D1 read completely
 * replaces this mirror, thereby removing any product later deactivated.
 */
export const ACTIVE_CACHE_KEY = 'hizlisatis-active-products-v1';

const KEEP = [
  'id','barkod','urunKodu','baslik','marka','kategori','kategoriAna',
  'kategoriAlt','kategoriYolu','satisFiyati','alisFiyati','girisFiyati',
  'fiyatBelirsiz','stok','stokBelirsiz','birim','kdv','kdvExcluded',
  'paraBirimi','gorsel','source','everActivated','statusChangedAt',
  'importFormat','variantKey'
];

function compactActiveProduct(product) {
  const row={};
  for (const key of KEEP) {
    if (product[key]!==undefined) row[key]=product[key];
  }
  // Images uploaded as base64 can exceed the 5–10 MB storage quota.
  // They remain in D1 and are not copied to localStorage.
  if (typeof row.gorsel==='string' && row.gorsel.startsWith('data:'))
    delete row.gorsel;
  row.lifecycleStatus='active';
  return row;
}

export function writeActiveCache(products,storage=globalThis.localStorage) {
  if (!storage || !Array.isArray(products)) return false;
  const active=products.filter(p => p && p.lifecycleStatus==='active');
  const payload={
    schema:1,
    savedAt:new Date().toISOString(),
    products:active.map(compactActiveProduct)
  };
  try {
    storage.setItem(ACTIVE_CACHE_KEY,JSON.stringify(payload));
    return active.length;
  } catch(error) {
    // localStorage can be unavailable (private mode) or full; never risk D1 data.
    console.warn('Active product device snapshot unavailable:',error);
    return false;
  }
}

/** Read only; never replay this cache as a D1 write. */
export function readActiveCache(storage=globalThis.localStorage) {
  try {
    const data=JSON.parse(storage?.getItem(ACTIVE_CACHE_KEY)||'null');
    if(data?.schema!==1 || !Array.isArray(data.products)) return [];
    return data.products.filter(p=>p&&typeof p.id==='string'&&
      p.lifecycleStatus==='active'&&typeof p.baslik==='string');
  } catch {return [];}
}
