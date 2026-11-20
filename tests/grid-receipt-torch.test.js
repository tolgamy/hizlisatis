import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {receiptAsText,escPosReceipt} from '../public/receipt-share.js';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
test('category photos and nested grid',()=>{
 assert.match(html,/id="categoryTree" class="category-tree category-photo-grid"/);
 assert.match(css,/\.category-photo-grid\{display:grid/);
 assert.match(app,/function photoCategoryTile/);
 assert.match(html,/id="categoryBack"/);
});
test('empty plus opens product selector',()=>{
 assert.match(app,/if\(value\)barcodeAdd\(value,\$\('saleBarcode'\)\);else openProductPicker\(\)/);
 assert.match(html,/id="pickProductDialog"/);
 assert.match(app,/if\(num===0\)/);
});
test('flash and camera available conditionally',()=>{
 assert.match(html,/id="scanTorch"/);
 assert.match(app,/getRunningTrackCameraCapabilities/);
 assert.match(css,/#scanDialog \.scanner-view/);
});
test('receipt choices and saved sale',()=>{
 for(const id of ['receiptActionsDialog','receiptNetworkPrint','receiptBluetoothPrint','receiptWhatsApp'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/saveSale\(record\)/);
 assert.match(app,/navigator\.bluetooth/);
 assert.match(app,/navigator\.share/);
});
test('receipt output encodes ESC POS and formats sales',()=>{
 const sale={id:'demo',createdAt:'2026-11-20T10:00:00.000Z',items:[{baslik:'Çikolata',quantity:2,unitPrice:12,total:24}],total:24,change:1,payment:'Nakit',currency:'TRY'};
 assert.match(receiptAsText(sale),/24,00/);
 const bytes=escPosReceipt(sale);assert.equal(bytes[0],27);assert.equal(bytes[1],64);assert.ok(bytes.length>40);
});
