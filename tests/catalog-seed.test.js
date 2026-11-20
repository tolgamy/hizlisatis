import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/catalog-seed.js';

const secret='a-different-very-long-secret-admin-code-for-test';
const url='https://example.pages.dev/api/catalog-seed';
const request=(method='GET',body=null,key=secret)=>new Request(url,{
 method,headers:{'X-Product-Key':encodeURIComponent(key),...(body?{'Content-Type':'application/json'}:{})},
 body:body?JSON.stringify(body):undefined
});
test('catalogue import rejects absent and incorrect administrator keys before DB access',async()=>{
 const without=await onRequest({request:request('GET',null,''),env:{}});
 assert.equal(without.status,401);
 const wrong=await onRequest({request:request('POST',{part:0,offset:0},'1453'),env:{PRODUCT_WRITE_KEY:secret}});
 assert.equal(wrong.status,401);
});
test('catalogue import requires an actual DB binding',async()=>{
 const response=await onRequest({request:request(),env:{PRODUCT_WRITE_KEY:secret}});
 assert.equal(response.status,503);
});
test('catalogue import reads bundled Pages assets and never overwrites existing DB rows',async()=>{
 const sqls=[];
 const manifest={schema:1,version:'7f27e3a60ef04e77',count:19096,
  parts:Array.from({length:20},(_,i)=>'/catalog/products-7f27e3a60ef04e77-'+String(i+1).padStart(2,'0')+'.json')};
 const p=['8692095346327','d7438852-0bd6-4877-8aad-834d3cdabb55','Test ürünü','Test','Manav > Sebze',22.1,1,'','TRY'];
 const db={
  prepare(sql){return {sql,bind(...params){return {sql,params}},first:async()=>({n:0})}},
  async batch(items){sqls.push(...items);}
 };
 const env={DB:db,PRODUCT_WRITE_KEY:secret,ASSETS:{
  async fetch(ask){
   const path=new URL(ask.url).pathname;
   return Response.json(path==='/catalog/manifest.json'?manifest:[p]);
  }
 }};
 const page=await onRequest({request:request('POST',{part:0,offset:0}),env});
 assert.equal(page.status,200);
 const result=await page.json();
 assert.equal(result.count,1);
 assert.equal(result.partComplete,true);
 assert.equal(sqls.length,1);
 assert.match(sqls[0].sql,/ON CONFLICT\(id\) DO NOTHING/);
});


test('UTF-8 Turkish administrator key is accepted through an ASCII-only request header',async()=>{
 const turkishKey='Şifre_ıöçğüş_Özel$Anahtar_987654321';
 const env={PRODUCT_WRITE_KEY:turkishKey,DB:{
  prepare(sql){return {first:async()=>sql.includes('COUNT(*)')?{n:0}:null};},
  async batch(){return [];}
 },ASSETS:{fetch:async()=>Response.json({})}};
 const response=await onRequest({request:request('GET',null,turkishKey),env});
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.count,0);
 assert.equal(result.ready,false);
 const bad=await onRequest({request:request('GET',null,turkishKey+'!'),env});
 assert.equal(bad.status,401);
});
test('Malformed percent-encoded admin header is rejected safely',async()=>{
 const bad=new Request(url,{headers:{'X-Product-Key':'%E0%A4%A'}});
 const response=await onRequest({request:bad,env:{PRODUCT_WRITE_KEY:secret}});
 assert.equal(response.status,401);
});
