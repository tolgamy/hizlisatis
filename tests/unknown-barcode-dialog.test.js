import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=read('app.js'),html=read('index.html'),manager=read('product-management.js'),sw=read('sw.js');
function extract(start,end){
  const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Missing '+start);
  return app.slice(a,b);
}
function harness(){
  const nodes=new Map(),calls=[];
  const $=id=>{
    if(!nodes.has(id))nodes.set(id,{
      open:false,value:'',textContent:'',
      showModal(){this.open=true;},close(){this.open=false;}
    });
    return nodes.get(id);
  };
  const ctx={
    $,dom:{scanDialog:{open:false}},state:{centralReadOnly:false,cart:new Map()},
    productManager:{openNew:code=>calls.push(['new',code]),offerSaleActivation:()=>false},
    userCan:()=>true,focusSaleBarcode:()=>calls.push(['focus']),
    stopScanner:()=>Promise.resolve(),
    exactProduct:()=>null,isWeightProduct:()=>false,
    addBarcodeOnce:()=>calls.push(['add']),
    announce:message=>calls.push(['toast',message])
  };
  const f=runInNewContext(extract('// Unknown barcode means','/** USB/Bluetooth scanners')+
    ';({barcodeAdd,resolveUnknownBarcode,looksLikeBarcode})',ctx);
  return {f,$,calls,ctx};
}
test('unknown EAN creates a Yes/No dialog; No clears both barcode fields',()=>{
  const {f,$,calls}=harness();
  $('saleBarcode').value='8690000000001';
  $('scanManualBarcode').value='8690000000001';
  assert.equal(f.barcodeAdd('8690000000001'),true);
  assert.equal($('unknownBarcodeDialog').open,true);
  assert.equal($('unknownBarcodeValue').textContent,'Barkod: 8690000000001');
  f.resolveUnknownBarcode(false);
  assert.equal($('saleBarcode').value,'');
  assert.equal($('scanManualBarcode').value,'');
  assert.equal($('unknownBarcodeDialog').open,false);
  assert.equal(calls.filter(x=>x[0]==='new').length,0);
});
test('Yes opens prefilled product creation, without auto-writing any stock',()=>{
  const {f,$,calls}=harness();
  assert.equal(f.barcodeAdd('8690000000001'),true);
  f.resolveUnknownBarcode(true);
  assert.deepEqual(calls.filter(x=>x[0]==='new'),[['new','8690000000001']]);
  assert.equal($('saleBarcode').value,'');
  assert.match(manager,/openNew:\(barcode=''\)=>\{openManage\(\);editProduct\(null,barcode\);\}/);
  assert.match(manager,/\$\('manageBarcodeInput'\)\.value=product\?\.barkod\|\|barcode/);
});
test('name search remains a search; registered stock has no quantity gate',()=>{
  const {f,ctx,calls}=harness();
  assert.equal(f.barcodeAdd('Nutella'),false);
  assert.equal(calls.length,0);
  ctx.exactProduct=()=>({id:'p1',stok:0});
  assert.equal(f.barcodeAdd('8690000000001'),1); // stub addBarcodeOnce returns pushes array length
  assert.equal(calls[0][0],'add');
  const code=extract('// Unknown barcode means','/** USB/Bluetooth scanners');
  assert.doesNotMatch(code,/remaining\(/);
  assert.match(app,/addHardwareBarcode\(barcode,\$\('saleBarcode'\)\)/);
  assert.match(app,/clearTimeout\(barcodeInputIdle\)/);
  assert.match(app,/promptUnknownBarcode\(text\)/);
});
test('dialog handles Yes/No/Escape; service worker cache version updated',()=>{
  for(const id of ['unknownBarcodeDialog','unknownBarcodeTitle','unknownBarcodeValue','unknownBarcodeYes','unknownBarcodeNo'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/Hayır, Barkodu Temizle/);
  assert.match(html,/Evet, Stok Kartı Aç/);
  assert.match(html,/Stok eklemek istiyor musunuz\?/);
  assert.match(app,/unknownBarcodeDialog'\)\.addEventListener\('cancel'/);
  assert.match(sw,/unknown-barcode-v85/);
});

test('v87 loads unique script/module names, preserving barcode dialog',()=>{
  const pinnedApp=read('app-v87.js');
  const pinnedManager=read('product-management-v87.js');
  assert.ok(html.includes('src="/app-v87.js"'));
  assert.ok(pinnedApp.includes("from './product-management-v87.js'"));
  assert.ok(pinnedApp.includes('function promptUnknownBarcode('));
  assert.ok(pinnedApp.includes('if(looksLikeBarcode(code))return promptUnknownBarcode(code)'));
  assert.ok(pinnedManager.includes("openNew:(barcode='')=>{openManage();editProduct(null,barcode);}"));
  assert.ok(sw.includes('unique-js-v87'));
  assert.ok(sw.includes("'/app-v87.js'"));
  assert.ok(sw.includes("'/product-management-v87.js'"));
});
