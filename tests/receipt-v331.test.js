import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const print=app.slice(app.indexOf('function printSale(sale) {'),app.indexOf('async function printBluetoothReceipt(sale)'));
test('80 and 58 mm roll receipt opens in a separate tab',()=>{
  assert.match(print,/window\.open\('', '_blank'\)/);
  assert.match(print,/mm = \$\('receiptWidth'\)\.value === '58' \? 58 : 80/);
  assert.match(print,/preview\.document\.write\(page\)/);
});
test('paper height follows printed receipt and does not include POS page',()=>{
  assert.match(print,/sheet\.scrollHeight \* 25\.4 \/ 96/);
  assert.match(print,/@page\{size:/);
  assert.match(print,/print-controls\{display:none!important\}/);
  assert.match(print,/id="doPrint"/);
});
test('native print fallback is preserved if iPhone blocks popup',()=>{
  assert.match(print,/if \(!preview\)/);
  assert.match(print,/window\.print\(\)/);
});