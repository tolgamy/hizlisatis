import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getBarcodeLibrary,supportedBarcodeFormats,acceptsBarcodeResult,
  isRepeatScan,readScanHistory,rememberScan} from '../public/barcode-scanner.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('styles.css'),sw=read('sw.js');
function storage(){
  const values=new Map();
  return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
}

test('requested barcode types include QR PDF417 Code 39 UPC EAN and Code 128',()=>{
  const formats=supportedBarcodeFormats();
  for(const code of [0,3,5,9,10,11,14])assert.ok(formats.includes(code),String(code));
  assert.equal(acceptsBarcodeResult({result:{format:{format:0,formatName:'QR_CODE'}}}),true);
  assert.equal(acceptsBarcodeResult({result:{format:{format:11,formatName:'PDF_417'}}}),true);
  assert.equal(acceptsBarcodeResult({result:{format:{format:6,formatName:'DATA_MATRIX'}}}),false);
});

test('duplicate detection debounces repeated video frames but accepts a deliberate rescan',()=>{
  assert.equal(isRepeatScan('869001','869001',1000,1500),true);
  assert.equal(isRepeatScan('869001','869001',1000,3201),false);
  assert.equal(isRepeatScan('869002','869001',1000,1500),false);
  assert.equal(isRepeatScan('869001','869001',2000,1999),false);
});

test('history saves on this device, deduplicates, caps at 20 and tolerates storage failure',()=>{
  const mem=storage();
  rememberScan('869001','EAN_13',mem,1000);
  rememberScan('869002','EAN_13',mem,1200);
  rememberScan('869001','EAN_13',mem,1400);
  assert.deepEqual(readScanHistory(mem).map(row=>row.code),['869001','869002']);
  for(let i=0;i<24;i++)rememberScan('code'+i,'QR_CODE',mem,2000+i);
  assert.equal(readScanHistory(mem).length,20);
  assert.deepEqual(readScanHistory({getItem(){throw Error('blocked');}}),[]);
  assert.doesNotThrow(()=>rememberScan('123','EAN_8',{getItem(){return '[]';},setItem(){throw Error('quota');}}));
});

test('premium reader is a functioning full-screen dialog connected to existing sales workflow',()=>{
  for(const id of ['scanDialog','scanTitle','scannerView','html5-reader','scanVideo',
    'scanTorch','scanRetry','scanPhotoFile','scanHistoryButton','scanHistoryPanel',
    'scanHistoryList','scanHistoryClose','scanManualBarcode']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/Barkod Okuyucu/);
  assert.match(html,/Barkodu dikdörtgen çerçeve içine getirin/);
  assert.match(html,/Galeriden Oku/);
  assert.match(html,/Barkod aranıyor/);
  assert.match(css,/@keyframes premium-laser/);
  assert.match(css,/#scanDialog\.is-success \.scan-corner/);
  assert.match(app,/await scanner\.start\(\{ facingMode: 'environment' \}/);
  assert.match(app,/onSuccess = \(decoded, details\) =>/);
  assert.match(app,/scanned\(decoded,\{format:/);
  assert.match(app,/await optimizeScannerFocus\(session\)/);
  assert.match(app,/function torchFeature\(session\)/);
  assert.match(app,/function showScanHistory\(/);
  assert.match(app,/function scanned\(/);
  assert.match(app,/if\(purpose==='manage'\)/);
  assert.match(app,/active=>selectScannedQuantity/);
  assert.match(app,/document\.addEventListener\('visibilitychange'/);
  assert.match(app,/window\.addEventListener\('pagehide'/);
  assert.match(sw,/cep-pos-shell-v38-equal-colorful-tabs/);
});

test('bottom nav retains four routes with vivid real sales cart icon, desktop remains sidebar',()=>{
  const nav=html.slice(html.indexOf('<nav class="bottom-nav"'),html.indexOf('</nav>'));
  for(const id of ['navHome','navSale','navProducts','navSettings'])
    assert.match(nav,new RegExp('id="'+id+'"'));
  assert.match(nav,/class="nav-item nav-sale"/);
  assert.match(nav,/class="nav-glyph"/);
  // Every tab must have identical geometry; individual colors are restrained pastels.
  assert.match(css,/height:68px;min-height:68px;max-height:68px/);
  assert.match(css,/transform:none/);
  for(const id of ['navHome','navSale','navProducts','navSettings'])
    assert.match(css,new RegExp('#'+id+'\\{[\\s\\S]*?--tab-bg:'));
  assert.match(css,/background:var\(--tab-active\)/);
  assert.match(css,/#navHome\{order:1\}/);
});
