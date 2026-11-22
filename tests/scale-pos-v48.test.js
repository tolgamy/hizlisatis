import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
  isWeightProduct,scaleSupported,scaleGramsToQuantity,parseManualGrams,
  calculateWeightTotal,parseScaleReading,ScaleSerialConnection
} from '../public/scale-serial.js';
import {receiptAsText} from '../public/receipt-share.js';
import 'fake-indexeddb/auto';
import {openDB,saveSale} from '../public/idb.js';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('styles.css'),
  idb=read('idb.js'),sw=read('sw.js'),pdf=read('receipt-pdf.js');

test('564 grams at 210 TL/kg is exactly 118.44 TL, with 0.564 kg quantity',()=>{
  assert.equal(scaleGramsToQuantity(564,'kg'),0.564);
  assert.equal(calculateWeightTotal(564,210,'kg'),118.44);
  assert.equal(calculateWeightTotal(750,200,'kg'),150);
  assert.equal(scaleGramsToQuantity(5,'g'),5);
  assert.equal(calculateWeightTotal(5,2.5,'g'),12.5);
  assert.equal(parseManualGrams('564'),564);
  for(const invalid of ['0','0.564','1,5','-2','100001','abc',''])
    assert.throws(()=>parseManualGrams(invalid));
  assert.equal(isWeightProduct({birim:'kg'}),true);
  assert.equal(isWeightProduct({birim:'g'}),true);
  assert.equal(isWeightProduct({birim:'adet'}),false);
});

test('Windows PC with serial API can connect, phones without serial remain manual',()=>{
  assert.equal(scaleSupported({platform:'Win32',serial:{requestPort(){}}}),true);
  assert.equal(scaleSupported({userAgentData:{platform:'Windows'},serial:{requestPort(){}}}),true);
  assert.equal(scaleSupported({platform:'iPhone',serial:{}}),false);
  assert.equal(scaleSupported({platform:'Android',serial:{requestPort(){}}}),false);
  assert.equal(scaleSupported({platform:'Win32'}),false);
  assert.match(html,/id="weightSerialPanel"[^>]+hidden/);
  assert.match(app,/\$\('weightSerialPanel'\)\.hidden=!supported/);
});

test('Serial decoder refuses price-weight ambiguity, negative/unstable and incomplete inputs',()=>{
  assert.deepEqual(parseScaleReading('ST,GS,+000.564kg'),{grams:564,stable:true});
  assert.deepEqual(parseScaleReading('0.564 kg'),{grams:564,stable:false});
  assert.deepEqual(parseScaleReading('WEIGHT: 0,750 kg'),{grams:750,stable:false});
  assert.deepEqual(parseScaleReading('564 g'),{grams:564,stable:false});
  assert.deepEqual(parseScaleReading('0.564'),{grams:564,stable:false});
  for(const value of [
    'ST,GS,+000.564 210.00 118.44','-0.564 kg','US,GS,+0.564kg',
    '0.000 kg','Cihaz Hatası','9999.00 kg','0.564 kg 118.44 TRY'
  ])assert.equal(parseScaleReading(value),null,value);
});

test('Serial stream reads full CRLF frames, requires two matching valid measurements',()=>{
  const readings=[],raw=[];
  const serial=new ScaleSerialConnection({onReading:value=>readings.push(value),
    onRaw:value=>raw.push(value),nav:{platform:'Win32',serial:{requestPort(){}}}});
  serial.consume('ST,GS,+000.');
  assert.equal(readings.length,0);
  serial.consume('564kg\r\n');
  assert.equal(readings.length,0);
  serial.consume('ST,GS,+000.564kg\r\n');
  assert.equal(readings.length,1);
  assert.equal(readings[0].grams,564);
  serial.consume('ST,GS,+000.700kg\r\n');
  assert.equal(readings.length,1,'new weight must not be accepted immediately');
  serial.consume('ST,GS,+000.700kg\r\n');
  assert.equal(readings.length,2);
  assert.deepEqual(raw.slice(0,2),['ST,GS,+000.564kg','ST,GS,+000.564kg']);
});

test('Two weighings from same product use distinct cart rows and stock sum',()=>{
  const begin=app.indexOf('function addToCart(product, quantity=1,');
  const end=app.indexOf('function updateCart(',begin);
  assert.ok(begin>0&&end>begin);
  const product={id:'muz',birim:'kg',baslik:'Muz KG',satisFiyati:210,
    fiyatBelirsiz:false,paraBirimi:'TRY',stokBelirsiz:false,stok:2};
  const state={centralReadOnly:false,cart:new Map()};
  const ctx={
    state,dom:{cartDialog:{open:false}},
    isActive:()=>true,remaining:()=>2,cartCurrency:()=> 'TRY',
    renderCartBar(){},renderCart(){},playCartSound(){},showCartConfirmation(){},
    announce:()=>{}
  };
  const add=runInNewContext(app.slice(begin,end)+';addToCart',ctx);
  assert.equal(add(product,.564,{separate:true,grams:564}),true);
  assert.equal(add(product,.750,{separate:true,grams:750}),true);
  assert.equal(state.cart.size,2,'two labels remain separate in the cart');
  assert.ok([...state.cart.values()].every(l=>l.id==='muz'));
  assert.equal([...state.cart.values()].reduce((n,l)=>n+l.quantity,0),1.314);
  // Remaining stock is checked across all existing weighed lines.
  assert.equal(add(product,.8,{separate:true,grams:800}),false);
});

test('Weight modal, receipt and checkout preserve distinct measured line values',()=>{
  for(const id of ['weightDialog','weightSerialPanel','weightBaud','weightDataBits','weightParity',
    'weightStopBits','weightConnect','weightDisconnect','weightLive','weightUseLive','weightRaw',
    'weightGrams','weightQuantityPreview','weightTotalPreview','weightAdd'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(app,/function openWeightProduct\(product\)/);
  assert.match(app,/function confirmWeight\(\)/);
  assert.match(app,/addToCart\(product,quantity,\{separate:true,grams\}\)/);
  assert.match(app,/openWeightProduct\(product\)/);
  assert.match(app,/if\(isWeightProduct\(product\)\)/);
  assert.match(app,/const requested=new Map\(\)/);
  assert.match(app,/requested\.set\(line\.id,\(requested\.get\(line\.id\)\|\|0\)\+line\.quantity\)/);
  assert.match(idb,/for\(const \[productId,quantity\] of totalByProduct\)/);
  assert.match(idb,/checkRemoteProductStates\(\[\.\.\.totalByProduct\.keys\(\)\]\)/);
  assert.match(app,/birim:line\.product\.birim,grams:line\.weighed\?line\.grams:null/);
  assert.match(pdf,/item\.birim==='kg'/);
  assert.match(css,/\.weight-dialog/);
  assert.match(sw,/cep-pos-shell-v48-windows-scale-manual-grams/);
  assert.match(sw,/\/scale-serial\.js/);
  const sale={id:'scale-test',createdAt:new Date().toISOString(),items:[
    {baslik:'Muz KG',birim:'kg',quantity:.564,unitPrice:210,total:118.44}
  ],total:118.44,currency:'TRY',payment:'Kart'};
  const text=receiptAsText(sale);
  assert.match(text,/0,564 kg x 210,00\/kg = 118,44/);
});

test('saving two weighed packages of the same D1 product records one summed stock movement',async()=>{
  const id='scale::stock::integration';
  const product={id,barkod:'9780010000234',baslik:'Muz KG',
    birim:'kg',satisFiyati:210,stok:2,stokBelirsiz:false,
    lifecycleStatus:'active',paraBirimi:'TRY'};
  const originalFetch=globalThis.fetch;
  let askedIds;
  globalThis.fetch=async url=>{
    const u=new URL(url,'https://example.com');
    askedIds=JSON.parse(u.searchParams.get('ids'));
    return Response.json({products:[product],bulkAt:null});
  };
  try{
    const sale={id:'scale-sale-integration',payment:'Kart',createdAt:new Date().toISOString(),
      items:[{id,quantity:.564,unitPrice:210,total:118.44},
        {id,quantity:.750,unitPrice:210,total:157.50}],total:275.94};
    await saveSale(sale);
    assert.deepEqual(askedIds,[id],'remote reads unique products only');
    const db=await openDB();
    const req=db.transaction('adjustments','readonly').objectStore('adjustments').get(id);
    const row=await new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    assert.equal(row.soldQuantity,1.314,'no lost stock update from two rows sharing an id');
  }finally{globalThis.fetch=originalFetch;}
});
