import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('styles.css'),sw=read('sw.js');

test('approved layout keeps 3 real top exit actions and a distinct custom confirmation',()=>{
  const sale=html.slice(html.indexOf('<dialog id="cartDialog"'),html.indexOf('</dialog>',html.indexOf('<dialog id="cartDialog"')));
  for(const id of ['saleBack','saleClose','saleCancel','saleBarcode','saleScanButton',
    'cartItems','completeSale','saleQuickHome','saleQuickProducts','saleQuickSettings'])
    assert.match(sale,new RegExp('id="'+id+'"'));
  for(const id of ['saleExitDialog','saleExitKeep','saleExitStay','saleExitDiscard'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(sale,/data-close="cartDialog"/,'Sale close must protect active cart');
  assert.match(app,/dom\.cartDialog\.addEventListener\('cancel',event=>\{/);
  assert.match(app,/if\(dialog===dom\.cartDialog\)return/);
});

test('close and back preserve products, explicit cancellation discards them only on confirmation',()=>{
  const code=app.slice(app.indexOf("let pendingSaleExitTarget='previous';"),
    app.indexOf('function renderProductPicker()',app.indexOf("let pendingSaleExitTarget='previous';")));
  assert.ok(code.startsWith("let pendingSaleExitTarget='previous';"));
  const products=new Map([['abc',{quantity:2}]]);
  const exit={open:false,showModal(){this.open=true},close(){this.open=false}};
  const cartDialog={open:true,close(){this.open=false}};
  const cash={value:'120'};
  const radio={checked:false};
  const nodes={saleExitDialog:exit,saleExitTitle:{textContent:''}};
  let barRenders=0,cartRenders=0,cleared=0,view='';
  const ctx={
    state:{saving:false,cart:products,pendingCreditSale:{fingerprint:'x'}},
    $:id=>nodes[id],dom:{cartDialog,cash},
    document:{querySelector:()=>radio},
    customerManager:{clearSelection(){cleared++}},
    renderCartBar(){barRenders++},renderCart(){cartRenders++},
    setView(next){view=next}
  };
  const handlers=runInNewContext(code+';({requestSaleExit,finishSaleExit})',ctx);
  handlers.requestSaleExit('home');
  assert.equal(exit.open,true);
  assert.equal(cartDialog.open,true);
  assert.equal(products.size,1);
  assert.match(nodes.saleExitTitle.textContent,/çıkılsın/);
  handlers.finishSaleExit();
  assert.equal(exit.open,false);assert.equal(cartDialog.open,false);
  assert.equal(products.size,1);assert.equal(view,'home');
  cartDialog.open=true;
  handlers.requestSaleExit('cancel');
  assert.equal(exit.open,true);
  assert.match(nodes.saleExitTitle.textContent,/iptal etmek/);
  handlers.finishSaleExit({discard:true});
  assert.equal(products.size,0);
  assert.equal(ctx.state.pendingCreditSale,null);
  assert.equal(cash.value,'');assert.equal(radio.checked,true);
  assert.equal(cleared,1);assert.equal(barRenders,1);assert.equal(cartRenders,1);
});

test('empty state has basket artwork and working search, scan and add handlers',()=>{
  const cart=app.slice(app.indexOf('function renderCart() {'),app.indexOf('function updatePayment() {'));
  assert.match(cart,/sale-empty-premium/);
  assert.match(cart,/Sepetiniz Boş/);
  for(const id of ['emptyScanBtn','emptyFindBtn','emptyAddBtn']){
    assert.match(cart,new RegExp('id="'+id+'"'));
    assert.match(cart,new RegExp("\\$\\('"+id+"'\\)\\.addEventListener"));
  }
  assert.match(app,/function openProductPicker\(initialQuery=''\)/);
  assert.match(app,/else if\(exactProduct\(value\)\)barcodeAdd/);
  assert.match(app,/else openProductPicker\(value\)/);
});

test('all four payment tiles are one row, with premium palette and readable small-screen labels',()=>{
  const sale=html.slice(html.indexOf('<fieldset class="payment-types"'),html.indexOf('</fieldset>',html.indexOf('<fieldset class="payment-types"')));
  const names=[...sale.matchAll(/name="payment" value="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(names,['Nakit','Kart','Veresiye','Havale / FAST']);
  const styles=css.slice(css.indexOf('/* v4.6'));
  assert.match(styles,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(styles,/--pay-strong:/);
  assert.match(styles,/max-width:420px/);
  assert.match(styles,/\.sale-exit-dialog\{/);
  assert.match(sw,/v40-approved-sale-screen/);
});

test('sales functionality is kept: real save path, unchanged barcode and customer flows',()=>{
  assert.match(app,/await serializeMutation\(\(\) => saveSale\(record\)\)/);
  assert.match(app,/if\(payment==='Veresiye'\)await recordCustomerCredit/);
  assert.match(app,/const cash = payment === 'Nakit'/);
  assert.match(app,/\$\('saleScanButton'\)\.addEventListener\('click',openCamera\)/);
  assert.match(app,/\$\('saleQuickHome'\)/);
  assert.match(app,/renderCartBar\(\);renderCart\(\)/);
});
