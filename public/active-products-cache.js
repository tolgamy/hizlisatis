/** Small, device-local mirror of *active* products only.
 * D1 remains the authority. This file never writes to the server and never
 * stores inactive, deleted, or initial-inactive product data.
 */
export const ACTIVE_PRODUCTS_KEY='hizlisatis-active-products-v1';

export function activeProductsForLocalStorage(products=[]) {
  return (Array.isArray(products)?products:[])
    .filter(product=>product && product.id && product.lifecycleStatus==='active')
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

export function writeActiveProductsLocalStorage(products,storage=null) {
  const active=activeProductsForLocalStorage(products);
  const payload=JSON.stringify({schema:1,savedAt:new Date().toISOString(),products:active});
  let store;
  try {
    store=storage||globalThis.localStorage;
    // Never leave a stale active entry (now passive) behind on quota failure.
    if(payload.length>3_500_000) {
      store?.removeItem(ACTIVE_PRODUCTS_KEY);
      return {saved:false,count:active.length,reason:'Yerel aktif ürün kotası doldu.'};
    }
    store?.setItem(ACTIVE_PRODUCTS_KEY,payload);
    return {saved:Boolean(store),count:active.length};
  } catch {
    try{store?.removeItem(ACTIVE_PRODUCTS_KEY);}catch{}
    return {saved:false,count:active.length,reason:'Tarayıcı yerel kayda izin vermedi.'};
  }
}

export function readActiveProductsLocalStorage(storage=null) {
  try {
    const store=storage||globalThis.localStorage;
    const raw=store?.getItem(ACTIVE_PRODUCTS_KEY);
    if(!raw)return [];
    const data=JSON.parse(raw);
    if(data?.schema!==1 || !Array.isArray(data.products))return [];
    return activeProductsForLocalStorage(data.products);
  } catch { return []; }
}
