import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBasketDiscountPercent,calculateBasketTotals} from '../public/basket-pricing.js';
import {readReceiptAction,saveReceiptAction} from '../public/receipt-settings.js';
import {receiptAsText} from '../public/receipt-share.js';

const source=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const row=(base,discounted,total,vatRate)=>({base,discounted,total,vatRate});

test('product discount then cart discount yields correct payment and VAT',()=>{
  const x=calculateBasketTotals([row(100,10,90,10)],10);
  assert.equal(x.base,100);
  assert.equal(x.lineDiscount,10);
  assert.equal(x.basketDiscount,9);
  assert.equal(x.discount,19);
  assert.equal(x.total,81);
  assert.equal(x.vat,7.36);
  assert.equal(x.allocations[0].netTotal,81);
});
test('cent-exact allocations, 100% basket discount, weighed stock totals',()=>{
  const tiny=calculateBasketTotals([row(.01,0,.01,10),row(.01,0,.01,20)],50);
  assert.equal(tiny.basketDiscount,.01);
  assert.equal(tiny.allocations.reduce((sum,line)=>sum+line.basketDiscount,0),.01);
  assert.equal(tiny.allocations.reduce((sum,line)=>sum+line.netTotal,0),.01);
  const full=calculateBasketTotals([row(100,0,100,20)],100);
  assert.equal(full.total,0);
  assert.equal(full.vat,0);
  assert.equal(calculateBasketTotals([row(58.5,0,58.5,1)],0).total,58.5);
});
test('comma percent parser rejects any invalid or >100% value',()=>{
  assert.equal(parseBasketDiscountPercent('10,50'),10.5);
  assert.equal(parseBasketDiscountPercent(''),0);
  for(const invalid of ['-1','101','12.345','abc','1e4'])
    assert.throws(()=>parseBasketDiscountPercent(invalid));
});
test('each device independently remembers its selected post-sale action',()=>{
  const mock=()=>{const map=new Map();return {
    getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)
  }};
  const first=mock(),second=mock();
  assert.equal(readReceiptAction(first),'network');
  saveReceiptAction('whatsapp',first);
  saveReceiptAction('bluetooth',second);
  assert.equal(readReceiptAction(first),'whatsapp');
  assert.equal(readReceiptAction(second),'bluetooth');
  assert.throws(()=>saveReceiptAction('bad',first));
});
test('price edit, percent discount and post-sale receipt modes are wired',()=>{
  const app=source('app.js'),html=source('index.html'),
    css=source('styles.css'),sw=source('sw.js');
  for(const snippet of ['data-edit-price','parseBasketDiscountPercent(input.value)',
    'const {allocations,...saleTotals}=sum','vat:allocations[index].vat',
    'applyReceiptActionPreference()'])
    assert.ok(app.includes(snippet),snippet);
  for(const id of ['settingsReceiptAction','receiptActionsGrid','basketDiscountPct'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(css.includes('.receipt-actions-grid button[hidden]'));
  assert.ok(sw.includes('/basket-pricing.js'));
});
test('information receipt shows item discount, cart discount, correct total',()=>{
  const slip=receiptAsText({
    id:'sale-test',createdAt:'2026-11-22T12:00:00Z',payment:'Kart',
    currency:'TRY',base:100,lineDiscount:10,basketDiscount:9,
    basketDiscountPct:10,discount:19,total:81,
    items:[{baslik:'Elma',quantity:1,unitPrice:100,total:90}]
  });
  for(const snippet of ['Urun iskontosu: -10,00','Sepet iskontosu (%10): -9,00','TOPLAM: 81,00'])
    assert.ok(slip.includes(snippet),snippet);
});
