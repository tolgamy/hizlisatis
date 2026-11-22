import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {receiptAsText,escPosReceipt} from '../public/receipt-share.js';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('styles.css'),sw=read('sw.js');

test('checkout exposes exactly four selectable payment methods with preserved default',()=>{
  const checkout=html.slice(html.indexOf('<fieldset class="payment-types"'),
    html.indexOf('</fieldset>',html.indexOf('<fieldset class="payment-types"')));
  const payments=[...checkout.matchAll(/name="payment" value="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(payments,['Nakit','Kart','Veresiye','Havale / FAST']);
  assert.match(checkout,/value="Nakit" checked/);
  assert.match(html,/id="bankPaymentNotice"[^>]*hidden/);
  assert.match(html,/Uygulama banka transferlerini otomatik doğrulamaz/);
  assert.match(html,/id="customerCollectPayment"><option>Nakit<\/option><option>Kart<\/option><option>Havale \/ FAST<\/option>/);
});

test('bank notice only appears on Havale or FAST, credit customer search stays separate',()=>{
  const snippet=app.slice(app.indexOf('function updatePayment() {'),app.indexOf('function openCashPayment(){'));
  assert.ok(snippet.startsWith('function updatePayment() {'));
  let selection='Havale / FAST';
  const creditBox={hidden:null},bankPaymentNotice={hidden:null};
  const elements={creditBox,bankPaymentNotice,cashPayTotal:{textContent:''},
    cashConfirm:{disabled:false}};
  const sandbox={
    document:{querySelector:()=>({value:selection})},
    $:id=>elements[id],dom:{cash:{value:''},change:{textContent:'',style:{}}},
    totals:()=>({total:98}),round2:x=>Math.round(x*100)/100,
    parseLocaleNumber:(_,fallback)=>fallback,
    cartCurrency:()=> 'TRY', money:(n)=>'₺'+n, state:{cart:new Map([['p',1]])}
  };
  for(const [payment,showBank,showCredit] of [
    ['Havale / FAST',true,false],['Kart',false,false],
    ['Nakit',false,false],['Veresiye',false,true]
  ]){
    selection=payment;
    runInNewContext(snippet+'updatePayment()',sandbox);
    assert.equal(bankPaymentNotice.hidden,!showBank,payment);
    assert.equal(creditBox.hidden,!showCredit,payment);
  }
});

test('four payment options fit in one row with scrollable checkout',()=>{
  const newStyles=css.slice(css.indexOf('/* v4.6'));
  assert.match(newStyles,/\.sale-sheet \.payment-types\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(newStyles,/label:nth-of-type\(n\+4\)\{[\s\S]*?grid-column:auto/);
  assert.match(newStyles,/\.sale-sheet \.checkout-area\{[\s\S]*?overflow-y:auto/);
  assert.match(sw,/cep-pos-shell-v48-windows-scale-manual-grams/);
});

test('merged Havale / FAST and old bank methods remain valid in saved history and receipts',()=>{
  assert.match(app,/createdAt: new Date\(\)\.toISOString\(\), payment,/);
  assert.match(app,/sale\.payment/);
  assert.match(app,/sale\.id, sale\.createdAt, sale\.payment/);
  assert.match(app,/\$\('receiptPrint'\)/);
  const pdf=read('receipt-pdf.js');
  assert.match(pdf,/Ödeme: ' \+ safe\(sale\.payment\)/);
  for(const payment of ['Havale / FAST','Havale','FAST']){
    const sale={id:'sale-12345',createdAt:'2026-11-22T11:00:00.000Z',
      payment,currency:'TRY',total:100,items:[{baslik:'Su',quantity:2,unitPrice:50,total:100}]};
    assert.match(receiptAsText(sale),new RegExp('Odeme: '+payment));
    assert.match(new TextDecoder().decode(escPosReceipt(sale)),new RegExp('Odeme: '+payment));
    assert.doesNotMatch(receiptAsText(sale),/Para ustu/);
  }
  assert.match(app,/if\(payment==='Veresiye'\)await recordCustomerCredit/);
  assert.match(app,/const cash = payment === 'Nakit'/);
});
