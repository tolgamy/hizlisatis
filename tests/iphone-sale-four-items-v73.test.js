import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const css=read('styles.css'),html=read('index.html'),app=read('app.js'),sw=read('sw.js');
const marker='/* v73 — iPhone compact Sale:';
const start=css.indexOf(marker),layout=css.slice(start);
function rules(selector){
  const needle=selector+' {',pos=layout.indexOf(needle);
  assert.ok(pos>=0,'missing '+selector);
  const first=layout.indexOf('{',pos),last=layout.indexOf('}',first+1);
  assert.ok(first>=0&&last>first);
  return layout.slice(first+1,last);
}
test('only mobile Sale dialog changes, and old logo row is removed',()=>{
  assert.ok(start>0);
  assert.match(layout,/@media \(max-width:679px\)/);
  assert.match(rules('#cartDialog.sale-sheet .mobile-sale-brand'),/display:none!important/);
  const head=rules('#cartDialog.sale-sheet .sale-sheet-header');
  assert.match(head,/grid-template-rows:56px!important/);
  assert.match(head,/min-height:0!important/);
  assert.match(rules('#cartDialog.sale-sheet .sale-heading'),/grid-row:1!important/);
  assert.match(rules('#cartDialog.sale-sheet .sale-header-actions'),/grid-row:1!important/);
  assert.match(rules('#cartDialog.sale-sheet .sale-header-actions button'),/height:56px!important/);
  assert.doesNotMatch(layout,/#homeView|#catalogView|#stockView|#settingsView|#saleView|#reportsView/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
  assert.match(sw,/iphone-four-items-v73/);
});
test('compact scanner retains original input and camera/submit buttons',()=>{
  assert.match(rules('#cartDialog.sale-sheet .sale-scanner input'),/height:45px!important/);
  const scan=rules('#cartDialog.sale-sheet .sale-scanner .sale-manual-add,\n  #cartDialog.sale-sheet .sale-scanner #saleScanButton');
  assert.match(scan,/height:45px!important/);
  assert.ok(html.includes('id="saleScanButton"'));
  assert.ok(html.includes('id="saleBarcodeForm"'));
  assert.match(app,/\$\('saleScanButton'\)\.addEventListener\('click',openCamera\)/);
});
test('four standard cart rows get priority while product edits stay scrollable',()=>{
  const cart=rules('#cartDialog.sale-sheet .cart-items');
  assert.match(cart,/flex:1 1 auto!important/);
  assert.match(cart,/min-height:0!important/);
  assert.match(cart,/overflow-y:auto!important/);
  const line=rules('#cartDialog.sale-sheet .cart-line');
  assert.match(line,/min-height:82px!important/);
  assert.match(line,/grid-template-columns:64px minmax\(0,1fr\)!important/);
  assert.match(line,/padding:5px 6px!important/);
  assert.match(rules('#cartDialog.sale-sheet .sale-cart-media'),/height:65px!important/);
  assert.match(rules('#cartDialog.sale-sheet .sale-line-actions .stepper'),/height:34px!important/);
  assert.doesNotMatch(line,/overflow:hidden|position:fixed|height:82px/);
  // A representative 693px browser viewport leaves at least 4 × 82px
  // plus list padding and small row gaps when the checkout is at its cap.
  const remaining=693-68-58-190-12;
  const fourRows=4*82+3*5+12;
  assert.ok(remaining>=fourRows,`viewport room ${remaining} vs four rows ${fourRows}`);
});
test('compact four-option checkout preserves actions and expanded-panel scrolling',()=>{
  const foot=rules('#cartDialog.sale-sheet .checkout-area');
  assert.match(foot,/max-height:min\(190px,30dvh\)!important/);
  assert.match(foot,/overflow-y:auto!important/);
  const buttons=rules('#cartDialog.sale-sheet .checkout-shortcuts > label > span,\n  #cartDialog.sale-sheet .checkout-shortcuts > .payment-shortcut');
  assert.match(buttons,/height:50px!important/);
  assert.match(buttons,/min-height:50px!important/);
  assert.match(buttons,/max-height:50px!important/);
  assert.match(rules('#cartDialog.sale-sheet #completeSale'),/height:45px!important/);
  assert.match(layout,/payment-discount:not\(\.has-discount\)/);
  assert.match(layout,/payment-other:not\(\.is-selected\)/);
  for(const id of ['completeSale','checkoutDiscountToggle','checkoutOtherPayment','cartTotals','cartItems'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(app,/await authorizeCheckout\(record\)/);
});
