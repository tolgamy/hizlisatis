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
  assert.match(sw,/cep-pos-shell-v45-camera-pc-decoder/);
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
    pickProductDialog:{open:false},saleBarcode:field};
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

test('quantity confirmation resumes camera scanning or keyboard barcode input automatically',()=>{
  const begin=app.indexOf('function confirmScannedQuantity()');
  const end=app.indexOf('function renderAll()',begin);
  assert.ok(begin>0&&end>begin);
  const source=app.slice(begin,end);
  for(const resumeCamera of [true,false]){
    let camera=0,focus=0,cartOpened=0,chirps=0,closed=0;
    const barcode={value:'123'};
    const input={value:'1'};
    const pending={product:{id:'sku-1'},sourceInput:barcode,resumeCamera};
    const ctx={
      pendingScanProduct:pending,lastScanText:'123',lastScanTime:123,
      $:id=>({
        scanQuantityInput:input,
        scanQuantityDialog:{close(){closed++}},
        saleBarcode:{value:'123'}
      })[id],
      dom:{cartDialog:{open:true}},
      addToCart:()=>true,chirp:()=>chirps++,
      openSale:()=>cartOpened++,openCamera:()=>camera++,
      focusSaleBarcode:()=>focus++
    };
    const result=runInNewContext(source+';confirmScannedQuantity();({lastScanText,lastScanTime,pendingScanProduct})',ctx);
    assert.equal(closed,1);
    assert.equal(chirps,1);
    assert.equal(barcode.value,'');
    assert.equal(result.pendingScanProduct,null);
    assert.equal(camera,resumeCamera?1:0);
    assert.equal(focus,resumeCamera?0:1);
    assert.equal(cartOpened,0);
    if(resumeCamera)assert.equal(result.lastScanTime,0,'permit deliberate rescan of same item');
  }
});

test('camera path reopens only after successful add, not for gallery/history',()=>{
  const begin=app.indexOf('function scanned(raw,');
  const end=app.indexOf('function updateTorchButton(',begin);
  const source=app.slice(begin,end);
  assert.match(source,/const resumeCamera=source==='camera' && dialogWasOpen/);
  assert.match(source,/selectScannedQuantity\(product,\$\('scanManualBarcode'\),resumeCamera\)/);
  assert.match(app,/function selectScannedQuantity\(product,sourceInput=null,resumeCamera=false\)/);
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
