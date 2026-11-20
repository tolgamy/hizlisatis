/** Persistent product lifecycle. Absence of a status means a legacy active product. */
export const PRODUCT_STATUS = Object.freeze({
  ACTIVE: 'active',
  INITIAL: 'initial-inactive',
  LATER: 'later-inactive',
  DELETED: 'deleted'
});
const VALUES = new Set(Object.values(PRODUCT_STATUS));
export function productStatus(product) {
  return VALUES.has(product?.lifecycleStatus) ? product.lifecycleStatus : PRODUCT_STATUS.ACTIVE;
}
export function isActive(product) { return productStatus(product) === PRODUCT_STATUS.ACTIVE; }
export function countStatuses(products) {
  const counts = { active: 0, 'initial-inactive': 0, 'later-inactive': 0, deleted: 0 };
  for(const product of products || []) counts[productStatus(product)]++;
  return counts;
}
export function nextProductStatus(product, action) {
  const current = productStatus(product);
  if(action === 'activate') {
    if(current === PRODUCT_STATUS.DELETED) throw Error('Önce silinen ürünü geri yükleyin.');
    return PRODUCT_STATUS.ACTIVE;
  }
  if(action === 'deactivate') {
    if(current === PRODUCT_STATUS.DELETED) throw Error('Silinen ürün pasife alınamaz.');
    // Products that have been activated are NEVER put back into the initial pool.
    return current === PRODUCT_STATUS.INITIAL && !product.everActivated
      ? PRODUCT_STATUS.INITIAL : PRODUCT_STATUS.LATER;
  }
  if(action === 'delete') return PRODUCT_STATUS.DELETED;
  if(action === 'restore') {
    if(current !== PRODUCT_STATUS.DELETED) throw Error('Ürün silinmiş değil.');
    return product.deletedFrom === PRODUCT_STATUS.INITIAL ? PRODUCT_STATUS.INITIAL : PRODUCT_STATUS.LATER;
  }
  throw Error('Geçersiz ürün işlemi.');
}
export function priceWithVat(entered, vat, excluded = false) {
  const price = Number(entered), rate = Number(vat);
  if(!Number.isFinite(price) || price < 0 || ![0,1,10,20].includes(rate))
    throw Error('Fiyat veya KDV oranı geçersiz.');
  const gross = excluded ? Math.round((price * (1 + rate / 100) + Number.EPSILON)*100)/100 : price;
  return { gross, vatAmount: Math.round((gross - gross/(1+rate/100)+Number.EPSILON)*100)/100 };
}
