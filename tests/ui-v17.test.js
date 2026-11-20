import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
test('mobile storefront has unique ids, settings navigation and minimal sale',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const id of ['homeView','catalogView','settingsView','navSettings','categoryBrowser',
  'productResults','viewGrid','viewList','settingsExcel','settingsManage','settingsHistory',
  'cartDialog','completeSale','saleBarcodeForm','scanTorch','receiptWhatsApp']){
   assert.ok(ids.includes(id),`${id} missing`);
 }
 assert.doesNotMatch(html,/XML'i Şimdi Yenile|Yerel XML Yükle|Barkodla hızlı satış/);
 assert.doesNotMatch(html,/id="navHistory"/);
});
test('website-style category navigation uses hash and browser back, not a modal drawer',()=>{
 assert.match(app,/window\.addEventListener\('hashchange',applyRoute\)/);
 assert.match(app,/location\.hash/);
 assert.match(app,/function openCategoryMenu\(path/);
 assert.doesNotMatch(html,/id="categoryDialog"/);
});
test('PWA caches source-independent catalogue without XML API',()=>{
 assert.match(sw,/cep-pos-shell-v\d+-/);
 assert.match(sw,/catalog-taxonomy\.js/);
 assert.doesNotMatch(sw,/xml-local/);
});
