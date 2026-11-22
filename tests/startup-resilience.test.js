import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=read('app.js');
const html=read('index.html');

test('empty cart summary is hidden at first paint and changes with quantity',()=>{
  assert.match(html,/<button id="openCart" class="cart-summary" type="button" hidden/);
  const snippet=app.slice(app.indexOf('function renderCartBar()'),
    app.indexOf('function addToCart('));
  assert.ok(snippet.startsWith('function renderCartBar()'));
  let count=0;
  const bar={hidden:false,classList:{toggle(){}}};
  const fields={openCart:bar,saleLineCount:{},cartCount:{},cartItemLabel:{},cartTotal:{}};
  const title={textContent:''};
  const ctx={
    $:id=>fields[id],dom:fields,document:{querySelector:()=>title},
    cartQty:()=>count,money:()=> '₺0,00',totals:()=>({total:0}),cartCurrency:()=> 'TRY'
  };
  runInNewContext(snippet+';renderCartBar()',ctx);
  assert.equal(bar.hidden,true);
  assert.equal(title.textContent,'Yeni Satış');
  count=2;
  runInNewContext(snippet+';renderCartBar()',ctx);
  assert.equal(bar.hidden,false);
  assert.equal(title.textContent,'Satışa Devam Et');
  assert.equal(fields.cartItemLabel.textContent,'2 adet ürün');
});

test('D1 outage loads bundled read-only catalog without presenting it as authoritative',()=>{
  assert.match(html,/id="catalogNotice"[^>]*hidden/);
  assert.match(html,/id="catalogRetry"/);
  const fallback=app.slice(app.indexOf("const snapshot=await refreshManagedData();"),
    app.indexOf('  applyRoute();',app.indexOf("const snapshot=await refreshManagedData();")));
  assert.match(fallback,/await fetchBundledCatalog\(\)/);
  assert.match(fallback,/setCatalog\(products,\[\],null,0,products.length,null,false\)/);
  assert.doesNotMatch(fallback,/announce\('Merkezi ürünler yüklenemedi/);
  const set=app.slice(app.indexOf('function setCatalog('),
    app.indexOf('/** Navigation and home'));
  assert.match(set,/state\.centralReadOnly = !verified/);
  assert.match(set,/if \(verified\) writeActiveProductsLocalStorage\(products\)/);
  assert.match(app,/const available=!state\.centralReadOnly/);
  assert.match(app,/if \(state\.centralReadOnly\) \{ announce\('Merkezi ürün bağlantısı yok\. Satış kaydedilemez\./);
  assert.match(app,/\$\('catalogRetry'\)\.addEventListener\('click',async/);
  assert.match(read('sw.js'),/cep-pos-shell-v47-product-photo-upload/);
});
