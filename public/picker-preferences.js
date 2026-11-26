import {accountStorage130} from './account-storage-v130.js';
/** Local-only sales product picker preference. No product or server changes. */
export const PICKER_MODES=Object.freeze(['search','categories','list']);
const KEY='hizlisatis-product-picker-mode';
export function readPickerMode(store=accountStorage130()){
  try{
    const mode=store?.getItem(KEY);
    return PICKER_MODES.includes(mode)?mode:'search';
  }catch{return 'search';}
}
export function savePickerMode(mode,store=accountStorage130()){
  if(!PICKER_MODES.includes(mode))throw Error('Geçersiz ürün görünümü.');
  store.setItem(KEY,mode);
  return mode;
}
