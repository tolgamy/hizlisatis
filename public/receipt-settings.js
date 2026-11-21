/** Device-local receipt preferences. Never put private admin secrets here. */
export const DEFAULT_RECEIPT_SETTINGS=Object.freeze({
  width:'80',title:'CEP HIZLI SATIŞ',phone:'',website:''
});
export function normalizeReceiptSettings(value={}) {
  const safe=x=>String(x??'').replace(/[\u0000-\u001f<>]/g,'').trim();
  const width=String(value.width)==='58'?'58':'80';
  return {width,title:safe(value.title).slice(0,80)||DEFAULT_RECEIPT_SETTINGS.title,
    phone:safe(value.phone).slice(0,35),website:safe(value.website).slice(0,110)};
}
export function readReceiptSettings(store=globalThis.localStorage) {
  try{return normalizeReceiptSettings(JSON.parse(store?.getItem('hizlisatis-receipt-settings')||'{}'))}
  catch{return {...DEFAULT_RECEIPT_SETTINGS}}
}
export function saveReceiptSettings(settings,store=globalThis.localStorage) {
  const normalized=normalizeReceiptSettings(settings);
  store.setItem('hizlisatis-receipt-settings',JSON.stringify(normalized));
  return normalized;
}
