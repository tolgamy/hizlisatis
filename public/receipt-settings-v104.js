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

/** Thermal rolls have unprintable margins and driver offsets. Keep prices within
 * a centered-safe text block, narrower than the nominal physical page size.
 * The print dialog must still use matching 58/80 mm media for full protection.
 */
export function receiptPrintLayout(width='80'){
  const paperMm=String(width)==='58'?58:80;
  return {
    paperMm,
    contentMm:paperMm===58?48:75.5,
    leftInsetMm:paperMm===58?2:1.5,
    innerPaddingMm:paperMm===58?2:0
  };
}

/** Each browser profile keeps its own post-sale receipt action, not a shared D1 setting. */
export const RECEIPT_ACTIONS=Object.freeze(['network','bluetooth','whatsapp','pdf']);
export const DEFAULT_RECEIPT_ACTION='network';
const RECEIPT_ACTION_KEY='hizlisatis-device-receipt-action';
export function readReceiptAction(store=globalThis.localStorage){
  try{
    const action=store?.getItem(RECEIPT_ACTION_KEY);
    return RECEIPT_ACTIONS.includes(action)?action:DEFAULT_RECEIPT_ACTION;
  }catch{return DEFAULT_RECEIPT_ACTION;}
}
export function saveReceiptAction(action,store=globalThis.localStorage){
  if(!RECEIPT_ACTIONS.includes(action))throw Error('Geçerli bir fiş yöntemi seçin.');
  store.setItem(RECEIPT_ACTION_KEY,action);
  return action;
}
