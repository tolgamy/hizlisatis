import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
test('retail barcode decoder uses ZXing first, full frame and UPC EAN normalization', () => {
  const scanner = app.slice(app.indexOf('async function startScanner()'),app.indexOf('async function scanBarcodePhoto('));
  assert.ok(scanner.indexOf('await ensureQrLibrary()') < scanner.indexOf('await startNativeScanner(session)'));
  assert.match(scanner, /useBarCodeDetectorIfSupported: false/);
  assert.doesNotMatch(scanner, /qrbox: \{ width: 250/);
  assert.match(app, /choices\.push\('0' \+ code\)/);
});
test('scanner has manual entry, photo entry and retry controls', () => {
  for (const id of ['scanManualForm','scanManualBarcode','scanPhotoFile','scanRetry']) {
    assert.ok(html.includes('id="' + id + '"'));
    assert.ok(app.includes("$('" + id + "')"));
  }
});
