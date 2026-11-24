import {config,saveConfig} from './local-print-v98.js';
const KEY='hizlisatis-device-printer-profiles';
export const DEFAULT_PRINTER_PROFILES=Object.freeze({label:'Argox Raf Etiketi',receipt:'GP-H80300'});
export function normalizePrinterProfiles(value){
  const v=value||{};
  const clean=(x,f)=>String(x??'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,120)||f;
  return {label:clean(v.label,DEFAULT_PRINTER_PROFILES.label),receipt:clean(v.receipt,DEFAULT_PRINTER_PROFILES.receipt)};
}
export function readPrinterProfiles(store){
  try{return normalizePrinterProfiles(JSON.parse((store??globalThis.localStorage).getItem(KEY)||'{}'))}
  catch{return {...DEFAULT_PRINTER_PROFILES}}
}
export function savePrinterProfiles(value,store){
  const profiles=normalizePrinterProfiles(value);
  if(profiles.label.toLowerCase()===profiles.receipt.toLowerCase())throw Error('Raf etiketi ve fiş için farklı yazıcı profilleri girin.');
  (store??globalThis.localStorage).setItem(KEY,JSON.stringify(profiles));
  return profiles;
}
export function setupPrinterProfiles(doc=document){
  const $=id=>doc.getElementById(id);
  const label=$('settingsLabelPrinterName'),receipt=$('settingsReceiptPrinterName'),status=$('settingsPrinterProfilesStatus');
  const show=profiles=>{label.value=profiles.label;receipt.value=profiles.receipt;const hint=$('priceLabelPrinterHint');if(hint)hint.textContent='Hedef: '+profiles.label+' · Kağıt: 2×4 · PDF tek etiket sayfası (38 × 100 mm). Chrome hedefini ve 2×4 seçimini kontrol edin.';};
  show(readPrinterProfiles());$('localPrintEnabled').checked=config().enabled===true;$('localPrintToken').value=config().token||'';
  $('settingsPrinterProfilesSave').addEventListener('click',()=>{
    try{saveConfig($('localPrintEnabled').checked,$('localPrintToken').value.trim());show(savePrinterProfiles({label:label.value,receipt:receipt.value}));status.textContent='Bu cihazın yazıcı tercihleri kaydedildi.'}
    catch(e){status.textContent=e.message}
  });
}
