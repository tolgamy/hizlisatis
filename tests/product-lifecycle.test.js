import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRODUCT_STATUS, productStatus, isActive, countStatuses, nextProductStatus, priceWithVat } from '../public/product-lifecycle.js';

test('legacy products remain active until initial mass action is explicitly approved',()=>{
  assert.equal(productStatus({id:'old'}),PRODUCT_STATUS.ACTIVE);
  assert.equal(isActive({id:'old'}),true);
  const idb=readFileSync(new URL('../public/idb.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../public/product-management.js',import.meta.url),'utf8');
  assert.match(idb,/export async function initiallyDeactivateAll/);
  assert.match(ui,/prompt\('Güvenlik onayı: PASİF yazın'\)/);
  assert.doesNotMatch(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),/initiallyDeactivateAll\(/);
});
test('initially inactive -> active -> later inactive never returns to initial pool',()=>{
  const initial={lifecycleStatus:PRODUCT_STATUS.INITIAL,everActivated:false};
  assert.equal(nextProductStatus(initial,'activate'),PRODUCT_STATUS.ACTIVE);
  const active={...initial,lifecycleStatus:PRODUCT_STATUS.ACTIVE,everActivated:true};
  assert.equal(nextProductStatus(active,'deactivate'),PRODUCT_STATUS.LATER);
  assert.equal(nextProductStatus({...active,lifecycleStatus:PRODUCT_STATUS.LATER},'activate'),PRODUCT_STATUS.ACTIVE);
});
test('deleting hides records but restoring keeps them passive',()=>{
  assert.equal(nextProductStatus({lifecycleStatus:PRODUCT_STATUS.ACTIVE},'delete'),PRODUCT_STATUS.DELETED);
  assert.equal(nextProductStatus({lifecycleStatus:PRODUCT_STATUS.DELETED,deletedFrom:PRODUCT_STATUS.INITIAL},'restore'),PRODUCT_STATUS.INITIAL);
  assert.equal(nextProductStatus({lifecycleStatus:PRODUCT_STATUS.DELETED,deletedFrom:PRODUCT_STATUS.ACTIVE},'restore'),PRODUCT_STATUS.LATER);
  assert.throws(()=>nextProductStatus({lifecycleStatus:PRODUCT_STATUS.DELETED},'activate'));
});
test('four distinct lists account for every record',()=>{
  assert.deepEqual(countStatuses([
    {},{lifecycleStatus:PRODUCT_STATUS.INITIAL},{lifecycleStatus:PRODUCT_STATUS.LATER},
    {lifecycleStatus:PRODUCT_STATUS.DELETED}
  ]),{active:1,'initial-inactive':1,'later-inactive':1,deleted:1});
});
test('0, 1, 10 and 20 VAT rates correctly calculate tax inclusive and exclusive',()=>{
  for(const rate of [0,1,10,20]){
    const inclusive=priceWithVat(100,rate);
    const exclusive=priceWithVat(100,rate,true);
    assert.equal(inclusive.gross,100);
    assert.equal(exclusive.gross,100+rate);
    assert.equal(exclusive.vatAmount,rate);
  }
  assert.throws(()=>priceWithVat(100,8),/KDV/);
  assert.throws(()=>priceWithVat(-1,20),/Fiyat/);
});
test('editor offers brand, barcode, category, file image, stock and VAT choices',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  for(const id of ['manageBarcodeInput','manageBrand','manageMainCategory','manageSubCategory','manageImageFile','managePrice','managePurchase','manageStock','manageVat','manageVatExcluded','manageActivate','manageDeactivate','manageDelete','manageRestore','passiveProductDialog','manageBulkDeactivate']) {
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  for(const rate of [0,1,10,20])assert.match(html,new RegExp('<option value="'+rate+'">%'+rate+'</option>'));
});
