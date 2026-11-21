/** Retail barcode formats supported by the bundled ZXing/html5-qrcode decoder.
 * Includes 1D product barcodes plus explicitly requested QR and PDF417.
 * This PWA uses a local browser decoder, not native Android ML Kit.
 */
const BARCODE_FORMATS = Object.freeze({
  QR_CODE: 0, CODABAR: 2, CODE_39: 3, CODE_93: 4, CODE_128: 5,
  ITF: 8, EAN_13: 9, EAN_8: 10, PDF_417: 11, UPC_A: 14, UPC_E: 15
});
const SUPPORTED_NAMES = Object.keys(BARCODE_FORMATS);
const SCAN_HISTORY_KEY = 'hizlisatis-scanned-barcodes-v1';

export function getBarcodeLibrary(root = globalThis) {
  // Existing pinned html5-qrcode build uses different UMD export namespaces.
  const sources = [root, root?.html5qrcode, root?.__Html5QrcodeLibrary__].filter(Boolean);
  return {
    Reader: sources.map(item => item.Html5Qrcode).find(value => typeof value === 'function'),
    formats: sources.map(item => item.Html5QrcodeSupportedFormats).find(Boolean)
  };
}
export function supportedBarcodeFormats(root = globalThis) {
  const actual = getBarcodeLibrary(root).formats || BARCODE_FORMATS;
  return [...new Set(SUPPORTED_NAMES.map(name => actual[name]).filter(Number.isInteger))];
}
export function acceptsBarcodeResult(details) {
  const format = details?.result?.format;
  if (!format) return true; // Decoder may return only the decoded text.
  const name = String(format.formatName || '').toUpperCase();
  if (name && !SUPPORTED_NAMES.includes(name)) return false;
  if (Number.isInteger(format.format) &&
      !Object.values(BARCODE_FORMATS).includes(format.format)) return false;
  return true;
}
export function isRepeatScan(code, previousCode, previousTime, time=Date.now(), cooldown=2200) {
  return Boolean(code && code===previousCode && time-previousTime>=0 &&
    time-previousTime<cooldown);
}
export function readScanHistory(storage=globalThis.localStorage) {
  try {
    const rows=JSON.parse(storage?.getItem(SCAN_HISTORY_KEY)||'[]');
    if(!Array.isArray(rows))return [];
    return rows.filter(row=>row&&typeof row.code==='string'&&row.code.length<=512&&
      typeof row.at==='number'&&Number.isFinite(row.at)).slice(0,20);
  } catch { return []; }
}
export function rememberScan(code,format='',storage=globalThis.localStorage,time=Date.now()) {
  const value=String(code??'').trim();
  if(!value||value.length>512)return readScanHistory(storage);
  const items=readScanHistory(storage).filter(entry=>entry.code!==value);
  items.unshift({code:value,format:String(format||'Barkod').slice(0,40),at:time});
  const history=items.slice(0,20);
  try {storage?.setItem(SCAN_HISTORY_KEY,JSON.stringify(history));}catch{}
  return history;
}
