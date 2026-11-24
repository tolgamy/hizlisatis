import test from 'node:test';
import assert from 'node:assert/strict';
import {filterReportSales,quickReportRange,localDateKey} from '../public/report-filters.js';

const sales=[
  {id:'receipt-a',createdAt:'2026-11-24T08:00:00+03:00',payment:'Nakit',currency:'TRY',total:489.95,
    items:[{baslik:'Nutella Kakaolu Fındık Kreması',barkod:'8690001',urunKodu:'SKU-01'}]},
  {id:'receipt-b',createdAt:'2026-11-23T12:00:00+03:00',payment:'Kart',currency:'TRY',total:1200,
    items:[{baslik:'Dana Kıyma',barkod:'8690002',urunKodu:'SKU-02'}]},
  {id:'receipt-c',createdAt:'2026-11-01T23:59:59+03:00',payment:'Veresiye',currency:'TRY',total:55,
    creditName:'Ali Veli',items:[{baslik:'Süt',barkod:'8690003'}]}
];
test('date range includes both local calendar boundaries',()=>{
  assert.deepEqual(filterReportSales(sales,{from:'2026-11-23',to:'2026-11-24'}).map(s=>s.id),
    ['receipt-a','receipt-b']);
  assert.equal(localDateKey('2026-11-24T00:30:00+03:00'),localDateKey(new Date('2026-11-23T21:30:00Z')));
});
test('quick date ranges use local day arithmetic',()=>{
  const now=new Date('2026-11-24T12:00:00');
  assert.deepEqual(quickReportRange('today',now),{from:'2026-11-24',to:'2026-11-24'});
  assert.deepEqual(quickReportRange('7',now),{from:'2026-11-18',to:'2026-11-24'});
  assert.deepEqual(quickReportRange('month',now),{from:'2026-11-01',to:'2026-11-24'});
  assert.deepEqual(quickReportRange('30',now),{from:'2026-10-26',to:'2026-11-24'});
});
test('filters payment, product name/barcode, customer, receipt ID',()=>{
  assert.deepEqual(filterReportSales(sales,{payment:'Kart'}).map(s=>s.id),['receipt-b']);
  assert.deepEqual(filterReportSales(sales,{query:'nutella'}).map(s=>s.id),['receipt-a']);
  assert.deepEqual(filterReportSales(sales,{query:'8690002'}).map(s=>s.id),['receipt-b']);
  assert.deepEqual(filterReportSales(sales,{query:'Ali Veli'}).map(s=>s.id),['receipt-c']);
  assert.deepEqual(filterReportSales(sales,{query:'receipt-c'}).map(s=>s.id),['receipt-c']);
});
test('sorting and amount ranges never mutate original receipt ordering',()=>{
  assert.deepEqual(filterReportSales(sales,{sort:'highest'}).map(s=>s.id),['receipt-b','receipt-a','receipt-c']);
  assert.deepEqual(filterReportSales(sales,{sort:'oldest'}).map(s=>s.id),['receipt-c','receipt-b','receipt-a']);
  assert.deepEqual(filterReportSales(sales,{min:'100',max:'500'}).map(s=>s.id),['receipt-a']);
  assert.deepEqual(sales.map(s=>s.id),['receipt-a','receipt-b','receipt-c']);
});
test('invalid range fails visibly instead of reporting misleading totals',()=>{
  assert.throws(()=>filterReportSales(sales,{from:'2026-11-24',to:'2026-11-01'}),/tarihi/);
  assert.throws(()=>filterReportSales(sales,{min:'501',max:'100'}),/Tutar/);
  assert.deepEqual(filterReportSales(sales,{payment:'Havale \/ FAST'}),[]);
});
