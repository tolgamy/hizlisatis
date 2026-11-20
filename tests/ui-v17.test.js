import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('v1.7 mobile navigation and sale scanner retain unique IDs', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'Repeated HTML id causes broken event handling');
  for (const id of ['homeView','catalogView','navHome','navProducts','navSale','navHistory',
    'viewGrid','viewList','onlyInStock','loadMoreProducts','toggleBarcodePanel','quickBarcode',
    'saleBarcode','saleBarcodeForm','productDetailDialog','excelImportButton','scanButton',
    'completeSale','cartItems','receiptPrint','categoryDialog']) {
    assert.ok(ids.includes(id), `${id} is missing`);
    assert.ok(app.includes(`'${id}'`), `${id} is not wired in app.js`);
  }
});

test('PWA offline shell remains enabled after UI upgrade', () => {
  assert.match(sw, /cep-pos-shell-v\d+-/);
  assert.match(sw, /'\/app\.js'/);
  assert.match(sw, /'\/idb\.js'/);
  assert.match(sw, /'\/bundled-catalog\.js'/);
});
