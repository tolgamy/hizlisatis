/** Linear retail barcodes only: never ask the decoder to process QR codes. */
const FALLBACK_FORMATS = Object.freeze({
  CODABAR: 2, CODE_39: 3, CODE_93: 4, CODE_128: 5, ITF: 8,
  EAN_13: 9, EAN_8: 10, UPC_A: 14, UPC_E: 15
});
const LINEAR_NAMES = Object.keys(FALLBACK_FORMATS);

export function getBarcodeLibrary(root = globalThis) {
  // The pinned html5-qrcode UMD builds use different global export namespaces.
  const sources = [root, root?.html5qrcode, root?.__Html5QrcodeLibrary__].filter(Boolean);
  return {
    Reader: sources.map(item => item.Html5Qrcode).find(value => typeof value === 'function'),
    formats: sources.map(item => item.Html5QrcodeSupportedFormats).find(Boolean)
  };
}
export function supportedBarcodeFormats(root = globalThis) {
  const actual = getBarcodeLibrary(root).formats || FALLBACK_FORMATS;
  return [...new Set(LINEAR_NAMES.map(name => actual[name]).filter(Number.isInteger))];
}
export function acceptsBarcodeResult(details) {
  const format = details?.result?.format;
  const name = String(format?.formatName || '').toUpperCase();
  if (/QR|AZTEC|DATA.?MATRIX|MAXICODE|PDF.?417/.test(name)) return false;
  if (typeof format?.format === 'number' && !Object.values(FALLBACK_FORMATS).includes(format.format))
    return false;
  return true;
}
