import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const css=read('styles.css'),sw=read('sw.js'),html=read('index.html'),app=read('app.js');
const marker='/* v71 — approved framed mobile Sale design.';
const at=css.indexOf(marker);
const v71=css.slice(at);

test('framed Sale design applies only to mobile dialog, not desktop or other screens',()=>{
  assert.ok(at>0);
  assert.match(v71,/@media \(max-width:679px\)/);
  assert.match(v71,/#cartDialog\.sale-sheet\[open\]/);
  assert.match(v71,/#cartDialog\.sale-sheet \.cart-items/);
  assert.match(v71,/#cartDialog\.sale-sheet \.checkout-area/);
  assert.doesNotMatch(v71,/#saleView|#reportsView|#homeView|#catalogView|#stockView|#settingsView/);
  assert.doesNotMatch(v71,/height:[0-9]+px!important|max-height:[0-9]+px!important/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
  assert.match(sw,/mobile-sale-frame-v71/);
});

test('basket and checkout have separate rounded blue frames with safe scrolling',()=>{
  assert.match(v71,/border:3px solid #90b9e9!important/);
  assert.match(v71,/border:2px solid #96bbe9!important/);
  assert.match(v71,/border:2px solid #8eb8ec!important/);
  assert.match(v71,/border-radius:21px!important/);
  assert.match(v71,/border-radius:22px!important/);
  assert.match(v71,/overflow-y:auto!important/);
  assert.match(v71,/box-sizing:border-box!important/);
  assert.match(v71,/width:calc\(100% - 16px\)!important/);
  assert.match(v71,/env\(safe-area-inset-bottom\)/);
});

test('existing empty basket, checkout/payment actions and cart behavior remain unchanged',()=>{
  assert.match(app,/dom\.cartItems\.innerHTML = `<div class="sale-empty-premium">/);
  for(const id of ['emptyScanBtn','emptyFindBtn','emptyAddBtn'])
    assert.match(app,new RegExp("'"+id+"'"));
  for(const id of ['cartItems','cartTotals','completeSale','checkoutDiscountToggle',
    'checkoutOtherPayment','saleBack','saleCancel','saleClose'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/class="payment-types checkout-shortcuts"/);
  assert.match(css,/#cartDialog\.sale-sheet \.checkout-shortcuts > \.payment-shortcut \{/);
  assert.doesNotMatch(v71,/payment-shortcut|checkoutDiscountToggle|completeSale|\.cart-line/);
});
