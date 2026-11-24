import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {onRequestPost} from '../veridyen/sale-voids.js';

const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=file('public/app.js');
const salesApi=file('veridyen/central-sales.js');
const cancelApi=file('veridyen/sale-voids.js');
const client=file('public/central-sales.js');
const server=file('server.js');
const sql=file('veridyen/migrations/002-sale-voids.sql');

test('sale void migration is additive, retains immutable receipts, and requires existing sale',()=>{
  assert.match(sql,/CREATE TABLE IF NOT EXISTS pos_sale_voids/);
  assert.match(sql,/FOREIGN KEY \(sale_id\)/);
  assert.match(sql,/REFERENCES pos_sales\(id\) ON DELETE RESTRICT/);
  assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|DELETE FROM|UPDATE pos_sales/i);
  assert.match(server,/\['\/api\/sale-voids',saleVoids\]/);
});

test('only admin can cancel; cash and credit are supported with a transactional reversal',()=>{
  assert.match(cancelApi,/user\.role!=='admin'/);
  assert.match(cancelApi,/!\['Nakit','Veresiye'\]\.includes\(sale\.payment\)/);
  assert.match(cancelApi,/Object\.hasOwn\(reasons,reason\)/);
  assert.match(cancelApi,/FOR UPDATE/);
  assert.match(cancelApi,/SELECT sale_id FROM pos_sale_voids WHERE sale_id=\?/);
  assert.match(cancelApi,/INSERT INTO pos_sale_voids/);
  assert.match(cancelApi,/await conn\.commit\(\)/);
  assert.match(cancelApi,/await conn\.rollback\(\)/);
  assert.doesNotMatch(cancelApi,/DELETE\s+FROM\s+pos_sales|UPDATE\s+pos_sales/i);
  assert.match(client,/voidCentralSale/);
  assert.match(app,/userCan\('users'\)/);
});

test('unauthenticated/cross-origin cancellation cannot touch any database rows',async()=>{
  const pool={getConnection(){throw Error('must not access database');}};
  const env={CENTRAL_SALES_ENABLED:'true',MYSQL_POOL:pool};
  const endpoint='https://kolaykasam.com/api/sale-voids';
  let response=await onRequestPost({request:new Request(endpoint,{
    method:'POST',headers:{Origin:'https://another.invalid'},
    body:JSON.stringify({saleId:'receipt-test-01',reason:'test'})
  }),env});
  assert.equal(response.status,403);
  response=await onRequestPost({request:new Request(endpoint,{
    method:'POST',headers:{Origin:'https://kolaykasam.com'},
    body:JSON.stringify({saleId:'receipt-test-01',reason:'test'})
  }),env});
  assert.equal(response.status,403);
});

test('historical cancelled receipt appears in central reports but does not inflate cash revenue',()=>{
  assert.match(salesApi,/LEFT JOIN pos_sale_voids v/);
  assert.match(salesApi,/voided:Boolean\(row\.voided_id\)/);
  const start=app.indexOf('function renderHistorySummary(sales){');
  const end=app.indexOf('let reportsPageLoaded=false;',start);
  assert.ok(start>0&&end>start);
  const nodes=new Map();
  const $=id=>{
    if(!nodes.has(id))nodes.set(id,{
      textContent:'',hidden:false,style:{},children:[],
      replaceChildren(...children){this.children=children;},
      append(...children){this.children.push(...children);}
    });
    return nodes.get(id);
  };
  const renderer=runInNewContext(app.slice(start,end)+';renderHistorySummary',{
    $,Date,Math,Number,Intl,Map,
    document:{createElement:()=>({
      textContent:'',style:{},children:[],
      append(...children){this.children.push(...children);}
    })},
    round2:value=>Math.round((value+Number.EPSILON)*100)/100,
    money:value=>'TRY '+Number(value).toFixed(2)
  });
  const createdAt=new Date().toISOString();
  renderer([
    {createdAt,currency:'TRY',payment:'Nakit',total:489.95,voided:false},
    {createdAt,currency:'TRY',payment:'Veresiye',total:489.95,voided:false},
    {createdAt,currency:'TRY',payment:'Nakit',total:5050,voided:true}
  ]);
  assert.equal($('historySummaryTotal').textContent,'TRY 979.90');
  assert.equal($('historyCashTotal').textContent,'TRY 489.95');
  assert.equal($('historyCreditTotal').textContent,'TRY 489.95');
  assert.equal($('historySummaryCount').textContent,'2');
  assert.match(app,/if\(sale\.voided\)return sum/);
  assert.match(app,/const recent=sales\.filter\(s=>s&&!s\.voided/);
});

test('cancelled receipt stays visible with audit text and CSV status but cannot be cancelled twice',()=>{
  assert.match(app,/if\(sale\.voided\)\{/);
  assert.match(app,/Ciroya dahil değil/);
  assert.match(app,/Satışı İptal Et/);
  assert.match(app,/await voidCentralSale\(id,\$\('saleVoidReason'\)\.value\)/);
  assert.match(app,/sale\.voided\?'İptal':'Geçerli'/);
  assert.match(app,/sale\.voidReason/);
  assert.match(cancelApi,/duplicate:true/);
  assert.match(file('public/sw.js'),/audited-void-v83/);
});

test('veresiye cancellation inserts an exact negative ledger movement in the same transaction',()=>{
  assert.match(cancelApi,/SELECT id,opening_debt_cents FROM pos_customers WHERE id=\? FOR UPDATE/);
  assert.match(cancelApi,/original\[0\]\.action!=='sale'/);
  assert.match(cancelApi,/original\[0\]\.customer_id!==sale\.customer_id/);
  assert.match(cancelApi,/original\[0\]\.amount_cents/);
  assert.match(cancelApi,/balance<Number\(sale\.total_cents\)/);
  assert.match(cancelApi,/INSERT INTO pos_customer_ledger/);
  assert.match(cancelApi,/\-Number\(sale\.total_cents\)/);
  assert.match(cancelApi,/INSERT INTO pos_sale_voids/);
  assert.match(cancelApi,/await conn\.commit\(\)/);
  assert.doesNotMatch(cancelApi,/DELETE FROM pos_customer_ledger|UPDATE pos_customer_ledger/i);
  assert.match(app,/\['Nakit','Veresiye'\]\.includes\(sale\.payment\)/);
  assert.match(file('public/index.html'),/id="saleVoidReason"/);
  assert.match(file('public/index.html'),/Satışı Kesin İptal Et/);
});
