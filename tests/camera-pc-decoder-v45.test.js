import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=read('app.js'),sw=read('sw.js');

test('PC barcode reading routes a matched SKU through the single-add guard',()=>{
  const a=app.indexOf('function addHardwareBarcode(');
  const b=app.indexOf('function categoryEmoji(',a);
  assert.ok(a>=0&&b>a);
  let calls=0,seen='';
  const selected={id:'box',birim:'adet'};
  const field={value:'8691234567890'};
  const sandbox={
    exactProduct:()=>selected,
    barcodeAdd:(code,source)=>{calls++;seen=code;assert.equal(source,field);return true;}
  };
  const fn=runInNewContext(app.slice(a,b)+';addHardwareBarcode',sandbox);
  assert.equal(fn(field.value,field),true);
  assert.equal(seen,'8691234567890');
  assert.equal(calls,1);
});

test('PC barcode with no Enter/Tab is recognized by exact SKU after input pause',()=>{
  assert.match(app,/const value=\$\('saleBarcode'\)\.value\.trim\(\)/);
  assert.match(app,/else if\(!addHardwareBarcode\(value,\$\('saleBarcode'\)\)\)openProductPicker\(value\)/);
  assert.match(app,/event\.key!=='Tab'/);
  assert.match(app,/barcodeInputIdle=setTimeout\(\(\)=>\{/);
  assert.match(app,/if\(!\/\^\(\?:\\d\{8\}\|\\d\{12,14\}\)\$\/\.test\(barcode\)\)return/);
  assert.match(app,/if\(exactProduct\(barcode\)\)addHardwareBarcode\(barcode,\$\('saleBarcode'\)\)/);
  assert.match(sw,/cep-pos-shell-v50-one-tap-live-scale/);
});

test('Camera decoder scans the full video area, with native/ZXing hybrid',()=>{
  const a=app.indexOf('async function startScanner()');
  const b=app.indexOf('async function scanBarcodePhoto',a);
  assert.ok(a>=0 && b>a);
  const scanner=app.slice(a,b);
  assert.match(scanner,/await stopScanner\(\)/);
  assert.match(scanner,/useBarCodeDetectorIfSupported:true/);
  assert.match(scanner,/const config=\{fps:12,disableFlip:true\}/);
  assert.doesNotMatch(scanner,/qrbox:\s*\(/);
  assert.match(scanner,/scanned\(decoded,\{source:'camera',format:/);
  assert.match(scanner,/await optimizeScannerFocus\(session\)/);
});

test('Scanner restart awaits old async stop even when state session was already nulled',async()=>{
  const a=app.indexOf('let scannerStopPromise=Promise.resolve()');
  const b=app.indexOf('let qrLibraryPromise;',a);
  assert.ok(a>=0&&b>a);
  let resumeOldStop;
  let stops=0,clears=0,closed=0,paused=0;
  const stream={getTracks:()=>[{stop(){closed++}}]};
  const session={active:true,stream,lib:{
    stop(){stops++;return new Promise(resolve=>resumeOldStop=resolve);},
    clear(){clears++}
  },timer:null,fallbackTimer:null};
  const state={scanner:session};
  const sandbox={
    state,updateTorchButton(){},
    $:id=>({pause(){paused++},srcObject:{}}),
    clearTimeout(){}
  };
  const stop=runInNewContext(app.slice(a,b)+';stopScanner',sandbox);
  const pending=stop();
  const repeat=stop();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(session.active,false);
  assert.equal(state.scanner,null);
  assert.equal(stops,1);
  assert.equal(clears,0);
  resumeOldStop();
  await Promise.all([pending,repeat]);
  assert.equal(clears,1);
  assert.equal(closed,1);
  assert.equal(paused,1);
});

test('Existing camera loop, receipt, and checkout confirmations remain connected',()=>{
  assert.match(app,/function confirmScannedQuantity\(\)/);
  assert.match(app,/function addBarcodeOnce\(/);
  assert.match(app,/addToCart\(product,1\)/);
  assert.match(app,/function printSale\(sale\)/);
  assert.match(app,/function focusSaleBarcode\(\)/);
  assert.match(app,/\$\('receiptNetworkPrint'\)\.addEventListener/);
});

test('Stale dialog-close events cannot stop the camera of the next product',()=>{
  const start=app.indexOf("dom.scanDialog.addEventListener('close',()=>");
  const end=app.indexOf("document.addEventListener('visibilitychange'",start);
  assert.ok(start>0 && end>start);
  const closeHandler=app.slice(start,end);
  assert.match(closeHandler,/if\(dom\.scanDialog\.open\)return/);
  const qty=app.slice(app.indexOf('function selectScannedQuantity('),app.indexOf('function barcodeAdd(',app.indexOf('function selectScannedQuantity(')));
  assert.match(qty,/dom\.scanDialog\.close\(\);[\s\S]*?stopScanner\(\)/);
});
