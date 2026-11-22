import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {next200Cash} from '../public/cash-change.js';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('styles.css'),sw=read('sw.js');

test('200 TL suggested tender rounds correctly at exact boundaries and kuruş',()=>{
  for(const [total,expected] of [
    [0,0],[0.01,200],[1,200],[199.99,200],[200,200],[200.01,400],
    [327.50,400],[399,400],[399.99,400],[400,400],[400.01,600],
    [600,600],[1000.01,1200]
  ])assert.equal(next200Cash(total),expected,total+' TL');
  assert.throws(()=>next200Cash(-1),RangeError);
  assert.throws(()=>next200Cash(Infinity),RangeError);
  assert.throws(()=>next200Cash(NaN),RangeError);
});

test('barcode adds one unit once per product, duplicate never increases cart',()=>{
  const from=app.indexOf('function addBarcodeOnce(');
  const until=app.indexOf('function barcodeAdd(',from);
  assert.ok(from>0 && until>from);
  let adds=0,closes=0,stops=0,focus=0;
  const state={cart:new Map()};
  const scan={open:true,close(){closes++;this.open=false}};
  const input={value:'8691000000000'},manual={value:'8691000000000'},sale={value:'8691000000000'};
  const notices=[];
  const ctx={
    state,dom:{scanDialog:scan},
    $:id=>({saleBarcode:sale,scanManualBarcode:manual})[id],
    addToCart:(p,qty)=>{adds++;assert.equal(qty,1);state.cart.set(p.id,{quantity:1});return true;},
    isWeightProduct:()=>false,
    announce:(msg)=>notices.push(msg),stopScanner:()=>stops++,
    focusSaleBarcode:()=>focus++
  };
  const add=runInNewContext(app.slice(from,until)+';addBarcodeOnce',ctx);
  assert.equal(add({id:'a',baslik:'Birinci'},input),true);
  assert.equal(adds,1);assert.equal(state.cart.get('a').quantity,1);
  assert.equal(closes,1);assert.equal(stops,1);
  assert.equal(input.value,'');assert.equal(sale.value,'');assert.equal(manual.value,'');
  assert.equal(focus,1);
  input.value='8691000000000';scan.open=true;
  assert.equal(add({id:'a',baslik:'Birinci'},input),false);
  assert.equal(adds,1,'second barcode must never change quantity');
  assert.equal(state.cart.get('a').quantity,1);
  assert.match(notices[0],/zaten sepette/);
  assert.equal(closes,2);assert.equal(stops,2);
  assert.equal(add({id:'b',baslik:'İkinci'},input),true);
  assert.equal(adds,2);
});

test('camera success closes; no automatic next camera or quantity chooser',()=>{
  const code=app.slice(app.indexOf('function scanned(raw,'),app.indexOf('function updateTorchButton(',app.indexOf('function scanned(raw,')));
  assert.match(code,/addBarcodeOnce\(product,\$\('scanManualBarcode'\)\)/);
  assert.doesNotMatch(code,/selectScannedQuantity\(/);
  assert.doesNotMatch(code,/openCamera\(\)/);
  const barcode=app.slice(app.indexOf('function barcodeAdd('),app.indexOf('function categoryEmoji(',app.indexOf('function barcodeAdd(')));
  assert.match(barcode,/return addBarcodeOnce\(product,sourceInput\)/);
  assert.doesNotMatch(barcode,/selectScannedQuantity\(/);
  const qty=app.slice(app.indexOf('function confirmScannedQuantity()'),app.indexOf('function renderAll()',app.indexOf('function confirmScannedQuantity()')));
  assert.doesNotMatch(qty,/openCamera\(\)/);
});

test('cash modal offers explicit direct, manual and 200 TL options',()=>{
  const dialog=html.slice(html.indexOf('<dialog id="cashPaymentDialog"'),html.indexOf('</dialog>',html.indexOf('<dialog id="cashPaymentDialog"')));
  for(const id of ['cashDirect','cashManual','cashRoundConfirm','cashRoundedAmount','cashRoundedChange',
    'cashManualPanel','cashReceived','cashConfirm','cashBack','cashCancel'])
    assert.match(dialog,new RegExp('id="'+id+'"'));
  assert.match(dialog,/Tam para alındı/);
  assert.match(dialog,/200 TL Katına Yuvarla/);
  assert.match(dialog,/Bu tutarı gerçekten aldıysan tamamla/);
  assert.match(css,/\.cash-mode-direct\{/);
  assert.match(css,/\.cash-mode-manual\{/);
  assert.match(css,/\.cash-mode-round\{/);
  assert.match(app,/\$\('cashDirect'\)\.addEventListener\('click',/);
  assert.match(app,/dom\.cash\.value=totals\(\)\.total\.toFixed\(2\)/);
  assert.match(app,/next200Cash\(totals\(\)\.total\)\.toFixed\(2\)/);
  assert.match(app,/\$\('cashManualPanel'\)\.hidden=false/);
  assert.match(app,/if\(cartCurrency\(\)!=='TRY'\)return/);
  assert.match(app,/if\(\$\('cashPaymentDialog'\)\.open\)announce/);
  assert.match(sw,/cep-pos-shell-v49-cas-stable-frame/);
  assert.match(sw,/\/cash-change\.js/);
});

test('cash options only after Satışı Tamamla, other payment methods complete normally',()=>{
  const begin=app.indexOf("  dom.complete.addEventListener('click',()=>{");
  const end=app.indexOf("\n  });",begin);
  const snippet=app.slice(begin,end+6);
  let callback,shown=0,completed=0,payment='Nakit';
  const state={saving:false,cart:new Map([['sku',{quantity:1}]])};
  const dialog={open:true,close(){this.open=false}};
  const ctx={state,
    dom:{cartDialog:dialog,complete:{addEventListener:(_e,fn)=>callback=fn}},
    document:{querySelector:()=>({value:payment})},
    setView:()=>{},openCashPayment:()=>shown++,completeSale:()=>completed++
  };
  runInNewContext(snippet,ctx);
  callback();
  assert.equal(shown,1);assert.equal(completed,0);
  for(const other of ['Kart','Veresiye','Havale / FAST']){
    payment=other;callback();
  }
  assert.equal(shown,1);assert.equal(completed,3);
  const paymentHooks=app.slice(app.indexOf("document.querySelectorAll('input[name=\"payment\"]')"),
    app.indexOf("dom.cash.addEventListener('input',updatePayment)"));
  assert.doesNotMatch(paymentHooks,/openCashPayment\(\)/);
});

test('direct and rounded cash modes produce correct received and change fields in saved sale',()=>{
  assert.match(app,/cashReceived: cash, change: payment === 'Nakit' \? round2\(cash - sum\.total\) : 0/);
  assert.match(app,/const cash = payment === 'Nakit' \? round2\(parseLocaleNumber\(dom\.cash\.value, NaN\)\) : null/);
  assert.match(app,/dom\.cash\.value=next200Cash\(totals\(\)\.total\)\.toFixed\(2\)/);
  assert.match(app,/\$\('cashConfirm'\)\.addEventListener\('click',completeSale\)/);
});
