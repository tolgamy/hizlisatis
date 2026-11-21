import test from 'node:test';
import assert from 'node:assert/strict';
import { getBarcodeLibrary, supportedBarcodeFormats, acceptsBarcodeResult } from '../public/barcode-scanner.js';
import { mergeProductLifecycle } from '../public/idb.js';

test('bundled scanner resolves UMD namespaces and requested 1D/QR/PDF417',()=>{
  class Reader {}
  for(const root of [
    { Html5Qrcode: Reader },
    { html5qrcode: { Html5Qrcode: Reader } },
    { __Html5QrcodeLibrary__: { Html5Qrcode: Reader } }
  ]){
    assert.equal(getBarcodeLibrary(root).Reader,Reader);
    const formats=supportedBarcodeFormats(root);
    for(const format of [0,3,5,9,10,11,14])assert.ok(formats.includes(format));
    assert.ok(!formats.includes(6),'Data Matrix not requested');
  }
  assert.equal(acceptsBarcodeResult({result:{format:{format:0,formatName:'QR_CODE'}}}),true);
  assert.equal(acceptsBarcodeResult({result:{format:{format:11,formatName:'PDF_417'}}}),true);
  assert.equal(acceptsBarcodeResult({result:{format:{format:9,formatName:'EAN_13'}}}),true);
  assert.equal(acceptsBarcodeResult({result:{format:{format:7,formatName:'DATA_MATRIX'}}}),false);
});

test('the separate product state ledger overrides catalog refresh data', () => {
  const catalog={id:'excel::b:869001',source:'bundle',lifecycleStatus:'active',baslik:'Ürün'};
  const ledger={id:catalog.id,lifecycleStatus:'initial-inactive',everActivated:false};
  assert.equal(mergeProductLifecycle(catalog,ledger).lifecycleStatus,'initial-inactive');
  const activated={...ledger,lifecycleStatus:'active',everActivated:true};
  assert.equal(mergeProductLifecycle(catalog,activated).everActivated,true);
  const later={...ledger,lifecycleStatus:'later-inactive',everActivated:true};
  assert.equal(mergeProductLifecycle(catalog,later).lifecycleStatus,'later-inactive');
  assert.equal(mergeProductLifecycle(catalog,null),catalog);
});
