/** Local-only sales product picker preference. No product or server changes. */
export const PICKER_MODES=Object.freeze(['search','categories','list']);
const KEY='hizlisatis-product-picker-mode';
export function readPickerMode(store=globalThis.localStorage){
  try{
    const mode=store?.getItem(KEY);
    return PICKER_MODES.includes(mode)?mode:'search';
  }catch{return 'search';}
}
export function savePickerMode(mode,store=globalThis.localStorage){
  if(!PICKER_MODES.includes(mode))throw Error('Geçersiz ürün görünümü.');
  store.setItem(KEY,mode);
  return mode;
}
