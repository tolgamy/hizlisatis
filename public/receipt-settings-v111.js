import {accountStorage130} from './account-storage-v130.js';
import {QUOTE_TITLE,QUOTE_FOOTER} from './receipt-quote-v106.js';
/** Device-local receipt preferences. Never put private admin secrets here. */
export const PRINT_WIDTHS109=Object.freeze([52,56,60,64,68,72,75.5]);
export function normalizePrintWidth109(value){const n=Number(value);return PRINT_WIDTHS109.includes(n)?n:64;}
export const DEFAULT_RECEIPT_SETTINGS=Object.freeze({
  width:'80',title:QUOTE_TITLE,phone:'',website:'',footer:QUOTE_FOOTER,printContentMm:64,printLayoutVersion:111
});
export function normalizeReceiptSettings(value={}) {
  const safe=x=>String(x??'').replace(/[\u0000-\u001f<>]/g,'').trim();
  const width=String(value.width)==='58'?'58':'80';
  return {width,title:(safe(value.title)==='CEP HIZLI SATIŞ'?'':safe(value.title).slice(0,80))||DEFAULT_RECEIPT_SETTINGS.title,
    phone:safe(value.phone).slice(0,35),website:safe(value.website).slice(0,110),footer:String(value.footer??QUOTE_FOOTER).replace(/[<>]/g,'').split(/\r?\n/).map(safe).join('\n').trim().slice(0,300)||QUOTE_FOOTER,printContentMm:normalizePrintWidth109(value.printContentMm),printLayoutVersion:111};
}
export function readReceiptSettings(store=accountStorage130()) {
  try{const raw=JSON.parse(store?.getItem('hizlisatis-receipt-settings')||'{}');if(raw.printLayoutVersion!==111&&[56,60].includes(Number(raw.printContentMm)))raw.printContentMm=64;return normalizeReceiptSettings(raw)}
  catch{return {...DEFAULT_RECEIPT_SETTINGS}}
}
export function saveReceiptSettings(settings,store=accountStorage130()) {
  const normalized=normalizeReceiptSettings(settings);
  store.setItem('hizlisatis-receipt-settings',JSON.stringify(normalized));
  return normalized;
}

/** Thermal rolls have unprintable margins and driver offsets. Keep prices within
 * a centered-safe text block, narrower than the nominal physical page size.
 * The print dialog must still use matching 58/80 mm media for full protection.
 */
export function receiptPrintLayout(width='80',printContentMm=readReceiptSettings().printContentMm){
  const paperMm=String(width)==='58'?58:80;
  return {
    paperMm,
    contentMm:paperMm===58?48:normalizePrintWidth109(printContentMm),
    leftInsetMm:paperMm===58?2:1.5,
    innerPaddingMm:paperMm===58?2:0
  };
}

/** Each browser profile keeps its own post-sale receipt action, not a shared D1 setting. */
export const RECEIPT_ACTIONS=Object.freeze(['network','bluetooth','whatsapp','pdf']);
export const DEFAULT_RECEIPT_ACTION='network';
const RECEIPT_ACTION_KEY='hizlisatis-device-receipt-action';
export function readReceiptAction(store=accountStorage130()){
  try{
    const action=store?.getItem(RECEIPT_ACTION_KEY);
    return RECEIPT_ACTIONS.includes(action)?action:DEFAULT_RECEIPT_ACTION;
  }catch{return DEFAULT_RECEIPT_ACTION;}
}
export function saveReceiptAction(action,store=accountStorage130()){
  if(!RECEIPT_ACTIONS.includes(action))throw Error('Geçerli bir fiş yöntemi seçin.');
  store.setItem(RECEIPT_ACTION_KEY,action);
  return action;
}
