import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
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
 assert.equal(without.status,503);
 const config=await without.json();
 assert.match(config.error,/PRODUCT_WRITE_KEY/);
 const wrong=await onRequest({request:request('POST',{part:0,offset:0},'1453'),env:{PRODUCT_WRITE_KEY:secret}});
 assert.equal(wrong.status,401);
});
test('catalogue import requires an actual DB binding',async()=>{
 const response=await onRequest({request:request(),env:{PRODUCT_WRITE_KEY:secret}});
 assert.equal(response.status,503);
});
test('catalogue import uses DB without ASSETS and preserves previously edited rows',async()=>{
 const statements=[];
 const p=['8692095346327','d7438852-0bd6-4877-8aad-834d3cdabb55','Test ürünü','Test','Manav > Sebze',22.1,1,'','TRY'];
 const db={
  prepare(sql){return {sql,bind(...params){return {sql,params}},first:async()=>sql.includes('COUNT(*)')?{n:0}:null}},
  async batch(items){statements.push(...items);}
 };
 const env={DB:db,PRODUCT_WRITE_KEY:secret};
 const status=await onRequest({request:request(),env});
 assert.equal(status.status,200,'DB read must succeed without ASSETS');
 assert.deepEqual(await status.json(),{count:0,ready:false});
 const page=await onRequest({request:request('POST',{
   part:0,offset:0,rows:[p],partTotal:1,version:'7f27e3a60ef04e77'
 }),env});
 assert.equal(page.status,200);
 const result=await page.json();
 assert.equal(result.count,1);
 assert.equal(result.nextOffset,1);
 assert.equal(result.partComplete,true);
 assert.equal(statements.length,1);
 assert.match(statements[0].sql,/ON CONFLICT\\(id\\) DO NOTHING/);
});

test('catalogue import rejects invalid batch and mismatched source version',async()=>{
 const env={PRODUCT_WRITE_KEY:secret,DB:{
  prepare(){throw Error('No writes expected');},batch(){throw Error('No writes expected');}
 }};
 const mismatch=await onRequest({request:request('POST',{
    version:'invalid',part:0,offset:0,partTotal:1,rows:[['x']]
 }),env});
 assert.equal(mismatch.status,409);
 const invalid=await onRequest({request:request('POST',{
    version:'7f27e3a60ef04e77',part:0,offset:0,partTotal:1,rows:[['x']]
 }),env});
 assert.equal(invalid.status,400);
});

test('UTF-8 Turkish administrator key is accepted through an ASCII-only request header',async()=>{
 const turkishKey='Şifre_ıöçğüş_Özel$Anahtar_987654321';
 const env={PRODUCT_WRITE_KEY:turkishKey,DB:{
  prepare(sql){return {first:async()=>sql.includes('COUNT(*)')?{n:0}:null};},
  async batch(){return [];}
 }};
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

test('short/missing production secret explains Cloudflare configuration instead of blaming the user',async()=>{
 const short=await onRequest({request:request('GET',null,'a-long-enough-user-entered-key'),env:{PRODUCT_WRITE_KEY:'123456789'}});
 assert.equal(short.status,503);
 assert.match((await short.json()).error,/Production/);
});

test('admin import inline JavaScript parses and validates static catalog URLs',()=>{
 const html=readFileSync(new URL('../public/admin-import.html',import.meta.url),'utf8');
 const inline=html.match(/<script type="module">([\\s\\S]*?)<\\/script>/)?.[1];
 assert.ok(inline,'inline importer module must exist');
 assert.doesNotThrow(()=>new Script(inline),'client-side code must be syntactically valid');
 assert.match(inline,/partTotal:rows.length/);
 assert.match(inline,/part,offset,rows:batch/);
});
