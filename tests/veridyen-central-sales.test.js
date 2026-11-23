import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCentralReceipt} from '../veridyen/sales-validation.js';

function receipt(){
  return {
    id:'test-receipt-0001',
    createdAt:'2026-11-24T09:00:00.000Z',
    payment:'Nakit',currency:'TRY',total:90,basketDiscountPct:10,
    creditCustomerId:'',
    items:[{id:'test-product-1',quantity:1,unitPrice:100,discountPct:0}]
  };
}
test('cash receipt validation performs integer-cent recomputation',()=>{
  const checked=validateCentralReceipt(receipt());
  assert.equal(checked.totalCents,9000);
  assert.deepEqual(checked.ids,['test-product-1']);
  assert.equal(checked.credit,false);
  assert.equal(checked.discounted,true);
});
test('forged total cannot produce a smaller central credit charge',()=>{
  const r=receipt();
  r.total=1;
  assert.throws(()=>validateCentralReceipt(r),/toplamı/);
});
test('veresiye requires a stable customer id and positive amount',()=>{
  const r=receipt();
  r.payment='Veresiye';
  assert.throws(()=>validateCentralReceipt(r),/müşteri/);
  r.creditCustomerId='customer-0001';
  const checked=validateCentralReceipt(r);
  assert.equal(checked.credit,true);
  assert.equal(checked.customerId,'customer-0001');
});
test('reject wrong payment type, negative quantities, and invalid discounts',()=>{
  for(const invalid of [
    r=>{r.payment='Hediye';},
    r=>{r.items[0].quantity=-1;},
    r=>{r.basketDiscountPct=101;},
    r=>{r.items[0].discountPct=-10;},
    r=>{r.items=[];},
    r=>{r.id='x';}
  ]){
    const r=receipt();invalid(r);
    assert.throws(()=>validateCentralReceipt(r));
  }
});
test('veresiye charge and receipt total agree to exact cents',()=>{
  const r=receipt();
  r.payment='Veresiye';r.creditCustomerId='customer-0001';
  r.items=[{id:'test-product-1',quantity:2,unitPrice:12.5,discountPct:0}];
  r.basketDiscountPct=0;r.total=25;
  assert.equal(validateCentralReceipt(r).totalCents,2500);
});
