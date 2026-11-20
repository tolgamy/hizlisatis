/** Retail barcode candidates: scanners may report UPC-A as EAN-13 with leading zero. */
export function barcodeCandidates(raw) {
  const code = String(raw ?? '').trim().replace(/[\r\n\t]/g, '');
  if (!code) return [];
  const result = [code];
  if (/^\d{12}$/.test(code)) result.push(`0${code}`);
  if (/^0\d{12}$/.test(code)) result.push(code.slice(1));
  return result;
}
export function findBarcodeProduct(index, raw) {
  for (const code of barcodeCandidates(raw)) {
    const product = index.get(code);
    if (product) return product;
  }
  return undefined;
}