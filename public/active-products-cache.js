/** Small, device-local mirror of *active* products only.
 * D1 remains the authority. This file never writes to the server and never
 * stores inactive, deleted, or initial-inactive product data.
 */
import { isActive } from './product-lifecycle.js';

export const ACTIVE_PRODUCTS_KEY='hizlisatis-active-products-v1';

export function activeProductsForLocalStorage(products=[]) {
  return (Array.isArray(products)?products:[])
    .filter(product=>product && product.id && isActive(product))
    .map(product=>{
      // Keep active product data usable after a reload without copying large
      // base64 photos or allowing image blobs to fill localStorage.
      const {gorsel,...record}=product;
      return {
        ...record,
        lifecycleStatus:'active',
        gorsel:typeof gorsel==='string'&&/^https:\/\//i.test(gorsel)?gorsel:''
      };
    });
}

export function writeActiveProductsLocalStorage(products,storage=globalThis.localStorage) {
  const active=activeProductsForLocalStorage(products);
  const payload=JSON.stringify({schema:1,savedAt:new Date().toISOString(),products:active});
  // Device storage commonly has a 5 MB quota. A failed mirror must NEVER
  // interfere with authoritative D1 data, sales or a completed activation.
  if(payload.length>3_500_000)
    return {saved:false,count:active.length,reason:'Yerel aktif ürün kotası doldu.'};
  try {
    storage.setItem(ACTIVE_PRODUCTS_KEY,payload);
    return {saved:true,count:active.length};
  } catch {
    return {saved:false,count:active.length,reason:'Tarayıcı yerel kayda izin vermedi.'};
  }
}

export function readActiveProductsLocalStorage(storage=globalThis.localStorage) {
  try {
    const raw=storage.getItem(ACTIVE_PRODUCTS_KEY);
    if(!raw)return [];
    const data=JSON.parse(raw);
    if(data?.schema!==1 || !Array.isArray(data.products))return [];
    // Reject non-active records even if a browser extension or older script
    // has written invalid data under our key.
    return activeProductsForLocalStorage(data.products);
  } catch { return []; }
}
