import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const css=read('styles.css'),html=read('index.html'),app=read('app.js'),sw=read('sw.js');
const at=css.indexOf('/* v66 — compact, even mobile Sale controls.');
const v66=css.slice(at,css.indexOf('/* v67 — Desktop stock table:'));
function style(selector){
 const escaped=selector.replace(/[.*+?^$\u007b\u007d()|[\]\\]/g,'\\$&');
 const match=v66.match(new RegExp(escaped+'\\s*\\{([^}]*)\\}'));
 assert.ok(match,'missing style '+selector);
 return match[1];
}

test('v66 changes are scoped only to mobile cart dialog and protect desktop section',()=>{
 assert.ok(at>0);
 assert.match(v66,/@media \(max-width:679px\)/);
 assert.match(v66,/@media \(max-width:359px\)/);
 assert.doesNotMatch(v66,/#saleView|#reportsView|#homeView|#catalogView|#stockView|#settingsView/);
 assert.doesNotMatch(v66,/(?:background|color):/);
 assert.equal((css.match(/\u007b/g)||[]).length,(css.match(/\u007d/g)||[]).length);
 assert.match(sw,/mobile-compact-payment-v66/);
});

test('four payment buttons occupy equal 68px heights and four equal columns',()=>{
 const grid=style('#cartDialog.sale-sheet .payment-types.checkout-shortcuts');
 assert.match(grid,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(grid,/gap:6px!important/);
 const label=style('#cartDialog.sale-sheet .checkout-shortcuts > label > span,\n  #cartDialog.sale-sheet .checkout-shortcuts > .payment-shortcut');
 assert.match(label,/height:68px!important/);
 assert.match(label,/min-height:68px!important/);
 assert.match(label,/max-height:68px!important/);
 assert.match(label,/border-radius:12px!important/);
 const name=style('#cartDialog.sale-sheet .checkout-shortcuts > label > span small,\n  #cartDialog.sale-sheet .checkout-shortcuts > .payment-shortcut small');
 assert.match(name,/white-space:normal!important/);
 assert.match(name,/font-size:clamp\(10px,2\.5vw,11px\)!important/);
 const icons=style('#cartDialog.sale-sheet .checkout-shortcuts > label > span b,\n  #cartDialog.sale-sheet .checkout-shortcuts > .payment-shortcut b');
 assert.match(icons,/font-size:21px!important/);
});

test('top actions and empty-cart actions remain equally sized, all labels and click functions survive',()=>{
 const top=style('#cartDialog.sale-sheet .sale-header-actions');
 assert.match(top,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
 assert.match(top,/gap:6px!important/);
 const buttons=style('#cartDialog.sale-sheet .sale-header-actions button');
 assert.match(buttons,/height:40px!important/);
 assert.match(buttons,/min-height:40px!important/);
 const emptyGrid=style('#cartDialog.sale-sheet .sale-empty-actions');
 assert.match(emptyGrid,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
 const emptyButtons=style('#cartDialog.sale-sheet .sale-empty-actions button');
 assert.match(emptyButtons,/height:45px!important/);
 for(const id of ['saleBack','saleCancel','saleClose','checkoutDiscountToggle','checkoutOtherPayment',
   'completeSale','saleBarcode','saleScanButton'])
   assert.ok(html.includes('id="'+id+'"'),id);
 for(const label of ['Nakit','Kart','Sepet İndirimi','Diğer Ödeme','Satışı İptal Et','Geri','Kapat'])
   assert.ok(html.includes(label),label);
 for(const id of ['emptyScanBtn','emptyFindBtn','emptyAddBtn'])
   assert.ok(app.includes("'"+id+"'"),id);
 assert.match(app,/await authorizeCheckout\(record\)/);
 assert.match(app,/\$\('checkoutDiscountToggle'\)\.addEventListener/);
 assert.match(app,/\$\('checkoutOtherPayment'\)\.addEventListener/);
});
