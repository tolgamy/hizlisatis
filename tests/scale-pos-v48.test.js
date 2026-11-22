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
  // Actual CAS ER PLUS-2 serial capture supplied by the user:
  // raw data: "S 0.562kg"; the weight is exactly 562 grams.
  assert.deepEqual(parseScaleReading('S 0.562kg'),{grams:562,stable:true});
  assert.deepEqual(parseScaleReading('S 0,562 kg'),{grams:562,stable:true});
  assert.deepEqual(parseScaleReading('S 562g'),{grams:562,stable:true});
  assert.deepEqual(parseScaleReading('0.564 kg'),{grams:564,stable:false});
  assert.deepEqual(parseScaleReading('WEIGHT: 0,750 kg'),{grams:750,stable:false});
  assert.deepEqual(parseScaleReading('564 g'),{grams:564,stable:false});
  assert.deepEqual(parseScaleReading('0.564'),{grams:564,stable:false});
  for(const value of [
    'ST,GS,+000.564 210.00 118.44','-0.564 kg','US,GS,+0.564kg',
    '0.000 kg','Cihaz Hatası','9999.00 kg','0.564 kg 118.44 TRY',
    'U 0.562kg','S -0.562kg','S 0.562kg 36.53','S 0.000kg'
  ])assert.equal(parseScaleReading(value),null,value);
});

test('CAS S 0.562kg stable frame immediately enables capture; U/zero invalidates',()=>{
  const readings=[],raw=[],invalid=[];
  const serial=new ScaleSerialConnection({
    onReading:value=>readings.push(value),onRaw:value=>raw.push(value),
    onUnstable:()=>invalid.push(true),nav:{platform:'Win32',serial:{requestPort(){}}}
  });
  serial.consume('S 0.');
  assert.equal(readings.length,0,'a partial packet must not become a weight');
  serial.consume('562kg\r\n');
  assert.equal(readings.length,1,'one explicit stable S reading is sufficient');
  assert.equal(readings[0].grams,562);
  assert.equal(readings[0].stable,true);
  assert.deepEqual(raw,['S 0.562kg']);
  serial.consume('U 0.561kg\r\n');
  assert.equal(invalid.length,1,'moving scale must invalidate accepted weight');
  assert.equal(serial.lastGrams,null);
  serial.consume('S 0.000kg\r\n');
  assert.equal(invalid.length,2,'empty scale must also clear old weight');
  serial.consume('S 0.750kg\r\n');
  assert.equal(readings.length,2,'new stable weight is immediately available');
  assert.equal(readings[1].grams,750);
});

test('Untagged frames need two identical values; ST stable frames need one',()=>{
  const readings=[];
  const serial=new ScaleSerialConnection({onReading:value=>readings.push(value),
    nav:{platform:'Win32',serial:{requestPort(){}}}});
  serial.consume('0.564 kg\r\n');
  assert.equal(readings.length,0,'untagged first reading cannot be trusted alone');
  serial.consume('0.564 kg\r\n');
  assert.equal(readings.length,1);
  serial.consume('ST,GS,+000.700kg\r\n');
  assert.equal(readings.length,2);
  assert.equal(readings[1].grams,700);
  assert.equal(readings[1].stable,true);
});


test('Three weighed packs of one product appear in a single row with sum of grams',()=>{
  const begin=app.indexOf('function addToCart(product, quantity=1,');
  const end=app.indexOf('function updateCart(',begin);
  assert.ok(begin>0&&end>begin);
  const product={id:'barbunya',birim:'kg',baslik:'Barbunya',satisFiyati:65,
    fiyatBelirsiz:false,paraBirimi:'TRY',stokBelirsiz:false,stok:1};
  const other={...product,id:'domates',baslik:'Domates',stok:2};
  const state={centralReadOnly:false,cart:new Map()},sounds=[];
  const ctx={
    state,dom:{cartDialog:{open:false}},
    isActive:()=>true,remaining:p=>p.stok,cartCurrency:()=> 'TRY',
    renderCartBar(){},renderCart(){},playCartSound:s=>sounds.push(s),
    showCartConfirmation(){},announce:()=>{}
  };
  const add=runInNewContext(app.slice(begin,end)+';addToCart',ctx);
  for(const grams of [200,300,400])
    assert.equal(add(product,grams/1000,{separate:true,grams}),true);
  assert.equal(state.cart.size,1,'three weighed packs appear as one basket row');
  const combined=[...state.cart.values()][0];
  assert.equal(combined.grams,900);
  assert.equal(combined.quantity,.9);
  assert.equal(combined.weighCount,3);
  assert.equal(combined.weighed,true);
  assert.equal(combined.quantity*combined.unitPrice,58.5);
  assert.deepEqual(sounds,['add','increase','increase']);
  assert.equal(add(product,.2,{separate:true,grams:200}),false,
    'stock check uses sum of weighed quantities');
  assert.equal(combined.grams,900,'rejected weighings cannot alter cart');

  assert.equal(add(other,.2,{separate:true,grams:200}),true);
  assert.equal(state.cart.size,2,'different products stay separate');
  assert.equal(add(other,.3,{separate:true,grams:300}),true);
  assert.equal(state.cart.size,2);
  assert.equal([...state.cart.values()].find(l=>l.id==='domates').grams,500);
});

test('Gram-priced repeated weighed products merge and preserve cashier price/discount',()=>{
  const begin=app.indexOf('function addToCart(product, quantity=1,');
  const end=app.indexOf('function updateCart(',begin);
  const product={id:'safran',birim:'g',baslik:'Safran',satisFiyati:2.5,
    fiyatBelirsiz:false,paraBirimi:'TRY',stok:1000};
  const state={centralReadOnly:false,cart:new Map()};
  const ctx={
    state,dom:{cartDialog:{open:false}},
    isActive:()=>true,remaining:()=>1000,cartCurrency:()=> 'TRY',
    renderCartBar(){},renderCart(){},playCartSound(){},showCartConfirmation(){},
    announce:()=>{}
  };
  const add=runInNewContext(app.slice(begin,end)+';addToCart',ctx);
  assert.equal(add(product,200,{separate:true,grams:200}),true);
  const line=[...state.cart.values()][0];
  line.unitPrice=2.0;line.discountPct=10;
  assert.equal(add(product,300,{separate:true,grams:300}),true);
  assert.equal(state.cart.size,1);
  assert.equal(line.quantity,500);
  assert.equal(line.grams,500);
  assert.equal(line.unitPrice,2.0);
  assert.equal(line.discountPct,10);
});

test('Weight modal, receipt and checkout preserve distinct measured line values',()=>{
  for(const id of ['weightDialog','weightSerialPanel','weightBaud','weightDataBits','weightParity',
    'weightStopBits','weightConnect','weightDisconnect','weightLive','weightRaw',
    'weightGrams','weightQuantityPreview','weightTotalPreview','weightAdd'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(html,/id="weightUseLive"/);
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
  assert.match(sw,/cep-pos-shell-v50-one-tap-live-scale/);
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
