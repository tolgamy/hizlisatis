import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 ACTIVE_PRODUCTS_KEY,activeProductsForLocalStorage,
 writeActiveProductsLocalStorage,readActiveProductsLocalStorage
} from '../public/active-products-cache.js';

function storage() {
 const map=new Map();
 return {
  getItem:key=>map.has(key)?map.get(key):null,
  setItem:(key,value)=>map.set(key,value),
  map
 };
}
const sample=(id,status)=>({
 id,barkod:'999'+id,baslik:'Ürün '+id,satisFiyati:19,
 kategoriYolu:['Atıştırmalık','Sağlıklı Beslenme'],
 lifecycleStatus:status,gorsel:'https://example.com/'+id+'.jpg'
});
test('localStorage mirror contains ONLY active records and mirrors a deactivation',()=>{
 const db=storage();
 const records=[sample('a','active'),sample('b','initial-inactive'),sample('c','later-inactive'),sample('d','deleted')];
 assert.equal(writeActiveProductsLocalStorage(records,db).saved,true);
 const data=JSON.parse(db.getItem(ACTIVE_PRODUCTS_KEY));
 assert.deepEqual(data.products.map(p=>p.id),['a']);
 assert.equal(data.products[0].baslik,'Ürün a');
 assert.deepEqual(readActiveProductsLocalStorage(db).map(p=>p.id),['a']);
 const next=records.map(p=>p.id==='a'?{...p,lifecycleStatus:'later-inactive'}:p);
 writeActiveProductsLocalStorage(next,db);
 assert.deepEqual(readActiveProductsLocalStorage(db),[]);
 assert.equal(JSON.parse(db.getItem(ACTIVE_PRODUCTS_KEY)).products.length,0);
});
test('active-only mirror never stores base64 photos and survives malformed storage',()=>{
 const db=storage();
 const active=sample('ok','active');active.gorsel='data:image/webp;base64,AAAA';
 writeActiveProductsLocalStorage([active],db);
 const saved=readActiveProductsLocalStorage(db);
 assert.equal(saved.length,1);
 assert.equal(saved[0].gorsel,'');
 db.setItem(ACTIVE_PRODUCTS_KEY,'not json');
 assert.deepEqual(readActiveProductsLocalStorage(db),[]);
 db.setItem(ACTIVE_PRODUCTS_KEY,JSON.stringify({schema:1,products:[sample('x','deleted')]}));
 assert.deepEqual(readActiveProductsLocalStorage(db),[]);
 assert.deepEqual(activeProductsForLocalStorage([sample('q','initial-inactive')]),[]);
});
test('a storage quota failure does not modify D1 products or abort catalog updates',()=>{
 const records=[sample('a','active')];
 const store={setItem:()=>{throw Error('Quota exceeded')},getItem:()=>null};
 const result=writeActiveProductsLocalStorage(records,store);
 assert.equal(result.saved,false);
 assert.equal(records[0].gorsel,'https://example.com/a.jpg');
 assert.equal(records[0].lifecycleStatus,'active');
});
test('the approved passive subcategory uses exactly four photographic columns',()=>{
 const manager=readFileSync(new URL('../public/product-management.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(manager,/const photoGrid=hasCategoryNavigation\(\)&&Boolean\(manageCategorySub\)&&!q/);
 assert.match(manager,/const hasCategoryNavigation=\(\)=>filter==='active'\|\|isPassiveList\(\)/);
 assert.match(manager,/results\.classList\.toggle\('manage-photo-grid',photoGrid\)/);
 assert.match(manager,/picture\.loading='lazy'/);
 assert.match(manager,/offerManualActivation\(product\)/);
 assert.match(manager,/manageVisibleLimit\+=60/);
 assert.match(css,/#manageResults\.manage-photo-grid\{/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(css,/\.manage-product-badge/);
 assert.match(app,/writeActiveProductsLocalStorage\(products\)/);
});
