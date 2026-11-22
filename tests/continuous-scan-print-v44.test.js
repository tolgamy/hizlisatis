import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {receiptPrintLayout} from '../public/receipt-settings.js';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=read('app.js'),css=read('styles.css'),sw=read('sw.js');

test('58/80 mm rolls reserve enough right-hand space for full price and change',()=>{
  for(const [selected,paper,content] of [['58',58,48],['80',80,70]]){
    const plan=receiptPrintLayout(selected);
    assert.equal(plan.paperMm,paper);
    assert.equal(plan.contentMm,content);
    assert.ok(plan.contentMm+plan.leftInsetMm<plan.paperMm-5,
      'printer needs at least 5 mm clear at the right');
    assert.ok(plan.innerPaddingMm>=2);
  }
  assert.match(sw,/cep-pos-shell-v49-cas-stable-frame/);
  const print=app.slice(app.indexOf('function printSale(sale)'),app.indexOf('async function printBluetoothReceipt(sale)'));
  assert.match(print,/const printableMm=layout.contentMm/);
  assert.match(print,/const leftInsetMm=layout.leftInsetMm/);
  assert.match(print,/receipt\{width:' \+ printableMm \+ 'mm/);
  assert.match(print,/margin:0 0 0 ' \+ leftInsetMm \+ 'mm!important/);
  assert.match(print,/preview\.addEventListener\?\.\('afterprint'/);
  const fallback=css.slice(css.indexOf('/* v5.0'));
  assert.match(fallback,/width:var\(--receipt-content-width,70mm\)!important/);
  assert.match(fallback,/margin:0 0 0 var\(--receipt-left-inset,2mm\)!important/);
  assert.match(app,/setProperty\('--receipt-content-width',layout\.contentMm\+'mm'\)/);
});

test('opening checkout places focus directly into hardware barcode input',()=>{
  const from=app.indexOf('function focusSaleBarcode(){');
  const to=app.indexOf('// A closed sale never destroys',from);
  assert.ok(from>0&&to>from);
  const source=app.slice(from,to);
  let focused=0,rendered=0,updated=0;
  const field={value:'old',focus(opts){focused++;assert.equal(opts.preventScroll,true)}};
  const cart={open:false,showModal(){this.open=true}};
  const dialogs={receiptActionsDialog:{open:false},scanQuantityDialog:{open:false},
    pickProductDialog:{open:false},weightDialog:{open:false},saleBarcode:field};
  const ctx={dom:{cartDialog:cart,scanDialog:{open:false}},
    $:id=>dialogs[id],renderCart:()=>rendered++,
    updateNavigation:()=>updated++};
  const ops=runInNewContext(source+';({openSale,focusSaleBarcode})',ctx);
  ops.openSale();
  assert.equal(cart.open,true);
  assert.equal(field.value,'');
  assert.equal(focused,1);
  assert.equal(rendered,1);
  assert.equal(updated,1);
  dialogs.scanQuantityDialog.open=true;
  ops.focusSaleBarcode();
  assert.equal(focused,1,'quantity edit overlay must keep focus');
  dialogs.scanQuantityDialog.open=false;
  ops.openSale({preferCamera:true});
  assert.equal(focused,1,'camera path must not pop up keyboard');
});

test('barcode camera reads once and must not auto-restart the scanner',()=>{
  const scanned=app.slice(app.indexOf('function scanned(raw,'),app.indexOf('function updateTorchButton(',app.indexOf('function scanned(raw,')));
  assert.match(scanned,/addBarcodeOnce\(product,\$\('scanManualBarcode'\)\)/);
  assert.doesNotMatch(scanned,/selectScannedQuantity\(/);
  assert.doesNotMatch(scanned,/resumeCamera/);
  const once=app.slice(app.indexOf('function addBarcodeOnce('),app.indexOf('function categoryEmoji(',app.indexOf('function addBarcodeOnce(')));
  assert.match(once,/dom\.scanDialog\.close\(\)/);
  assert.match(once,/stopScanner\(\)/);
  assert.match(once,/if\(state\.cart\.has\(product\.id\)\)/);
  assert.match(once,/addToCart\(product,1\)/);
});
test('legacy quantity editor no longer restarts camera',()=>{
  const qty=app.slice(app.indexOf('function confirmScannedQuantity()'),app.indexOf('function renderAll()',app.indexOf('function confirmScannedQuantity()')));
  assert.doesNotMatch(qty,/openCamera\(\)/);
  assert.match(qty,/focusSaleBarcode\(\)/);
});

test('printing a saved sale immediately prepares a new sale; Bluetooth errors remain visible',()=>{
  const start=app.indexOf('  function beginNextSaleAfterPrint(){');
  const end=app.indexOf("  $('receiptWhatsApp').addEventListener",start);
  assert.ok(start>0&&end>start);
  const snippet=app.slice(start,end);
  assert.match(snippet,/printSale\(state\.lastSale\);\s*beginNextSaleAfterPrint\(\)/);
  assert.match(snippet,/await printBluetoothReceipt\(state\.lastSale\)/);
  assert.match(snippet,/beginNextSaleAfterPrint\(\)/);
  assert.match(snippet,/catch\(error\)\{\$\('receiptActionStatus'\)\.textContent=error\.message/);
  let openSaleCount=0,prints=0;
  const actions={open:true,close(){this.open=false}};
  const net={event:null,addEventListener(_,fn){this.event=fn}};
  const bt={event:null,disabled:false,addEventListener(_,fn){this.event=fn}};
  const status={textContent:''};
  const ctx={
    state:{lastSale:{id:'x'}},
    $:id=>({receiptActionsDialog:actions,receiptNetworkPrint:net,receiptBluetoothPrint:bt,receiptActionStatus:status})[id],
    openSale:()=>openSaleCount++,
    printSale:()=>prints++,
    printBluetoothReceipt:async()=>{},
  };
  runInNewContext(snippet,ctx);
  net.event();
  assert.equal(prints,1);assert.equal(openSaleCount,1);
  assert.equal(actions.open,false);
});
