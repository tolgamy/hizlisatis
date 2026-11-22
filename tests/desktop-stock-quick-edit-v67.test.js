import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sameProductRecord,prepareStockEdit} from '../public/stock-editor.js';
const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('styles.css'),sw=read('sw.js');

const product={
  id:'p-1',baslik:'Deneme ürün',barkod:'869100001',
  stok:8,stokBelirsiz:false,satisFiyati:40.5,fiyatBelirsiz:false,
  girisFiyati:40.5,kdv:10,kdvExcluded:false,lifecycleStatus:'active',source:'excel'
};
test('stok ekle adds to authoritative base, never deletes previous device sales',()=>{
  const next=prepareStockEdit(product,{mode:'add',quantity:7,soldQuantity:5,price:null});
  assert.equal(next.stok,15);
  assert.equal(next.satisFiyati,40.5);
  assert.equal(product.stok,8);
  assert.equal(next.lifecycleStatus,'active');
  assert.equal(next.barkod,product.barkod);
});
test('set 99 adjusts only selected product and compensates the current device ledger',()=>{
  const next=prepareStockEdit({...product,stok:1},{mode:'set99',soldQuantity:12,price:null});
  assert.equal(next.stok,111);
  assert.equal(next.stok-12,99);
  assert.equal(product.stok,8);
  assert.equal(prepareStockEdit({...product,stokBelirsiz:true},{
    mode:'set99',soldQuantity:0,price:null
  }).stokBelirsiz,false);
});
test('price only: preservers stock, updates gross, net tax input and original product',()=>{
  const next=prepareStockEdit({...product,kdvExcluded:true,girisFiyati:36.82},{
    mode:'add',quantity:0,soldQuantity:5,price:120
  });
  assert.equal(next.stok,8);
  assert.equal(next.satisFiyati,120);
  assert.equal(next.girisFiyati,109.09);
  assert.equal(next.kdvExcluded,true);
  assert.equal(product.satisFiyati,40.5);
});
test('decimal stock and price validation reject invalid or empty operations',()=>{
  assert.equal(prepareStockEdit(product,{mode:'add',quantity:0.125,price:null}).stok,8.125);
  for(const value of [-1,Number.NaN,Infinity,1.12345]){
    assert.throws(()=>prepareStockEdit(product,{mode:'add',quantity:value}),/geçersiz|basamak/);
  }
  assert.throws(()=>prepareStockEdit(product,{mode:'add',quantity:1,price:-1}),/geçersiz/);
  assert.throws(()=>prepareStockEdit(product,{mode:'add',quantity:0,price:null}),/Kaydetmek için/);
  assert.throws(()=>prepareStockEdit({...product,stokBelirsiz:true},{mode:'add',quantity:5}),/Stok takibi/);
  assert.throws(()=>prepareStockEdit(product,{mode:'bulk99',quantity:2}),/işlemi geçersiz/);
});
test('stale server and current product fields are detected before write',()=>{
  assert.equal(sameProductRecord(product,{...product}),true);
  assert.equal(sameProductRecord(product,{...product,stok:7}),false);
  assert.equal(sameProductRecord(product,{...product,satisFiyati:42}),false);
  assert.equal(sameProductRecord(product,{...product,baslik:'Başka ürün'}),false);
  assert.equal(sameProductRecord(product,null),false);
  const reverse=Object.fromEntries(Object.entries(product).reverse());
  assert.equal(sameProductRecord(product,reverse),true);
});
test('desktop stock row exposes authorized edit action and real D1 confirmation',()=>{
  assert.match(app,/function openStockEditor\(productId\)/);
  assert.match(app,/function saveStockEditor\(event\)/);
  assert.match(app,/userCan\('products'\)&&!state\.centralReadOnly/);
  assert.match(app,/item\.product\.baslik\+' stok ve fiyat düzenle'/);
  assert.match(app,/tag\.addEventListener\('click',\(\)=>openStockEditor\(item\.product\.id\)\)/);
  assert.match(app,/edit\.addEventListener\('click',\(\)=>openStockEditor\(item\.product\.id\)\)/);
  assert.match(app,/await checkRemoteProductStates\(\[stockEditProductId\]\)/);
  assert.match(app,/if\(!fresh\|\|!sameProductRecord\(stockEditOriginal,fresh\)\)/);
  assert.match(app,/saveManagedProduct\(next,'stock-overview-edit'\)/);
  assert.match(app,/refreshManagedData\(saved\.id\)/);
  assert.match(app,/state\.sold\.get\(stockEditProductId\)/);
  assert.match(app,/channel\?\.postMessage\('product-managed'\)/);
});
test('stock editor DOM is accessible and no mass 99 mutation exists',()=>{
  for(const id of [
    'stockEditDialog','stockEditForm','stockEditProductTitle','stockEditCurrent',
    'stockEditAmount','stockEditPrice','stockEditSet99','stockEditSave',
    'stockEditClose','stockEditCancel','stockOverviewLowJump'
  ])assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/Bu Ürünü 99’a Ayarla|Seçili Ürünü 99’a Ayarla/);
  assert.match(html,/th>İşlem<\/th/);
  assert.match(html,/name="|stockEditMessage/);
  assert.doesNotMatch(app,/bulk-stock-99|set-all-stocks-to-99/);
  assert.match(sw,/stock-quick-edit-v67/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});
