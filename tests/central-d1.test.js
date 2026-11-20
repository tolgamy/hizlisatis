import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/product-state.js';

const url='https://example.pages.dev/api/product-state';
const secret='Şifre-Ürün-Yönetim-Güçlü-987654321';
function req(method='GET',body=null,key=secret,params='') {
 const headers=body?{'Content-Type':'application/json','X-Product-Key':encodeURIComponent(key)}:{};
 return new Request(url+params,{method,headers,body:body?JSON.stringify(body):undefined});
}
function mockDb(){
 const batches=[];
 const db={
   prepare(sql){return {
     sql,
     bind(...args){return {sql,args,
       first:async()=>({value:'19096'}),all:async()=>({results:[]})}},
     first:async()=>sql.includes('COUNT(*)')?{count:19096}:{value:sql.includes('catalog_seed_count')?'19096':null},
     all:async()=>({results:[]})
   }},
   batch:async(items)=>{batches.push(items);return []}
 };
 return {db,batches};
}
test('Central D1 health endpoint is read-only and confirms the seeded catalogue',async()=>{
 const {db}=mockDb();
 const r=await onRequestGet({request:req('GET',null,secret,'?health=1'),env:{DB:db}});
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ready:true,count:19096,baseline:19096,central:true});
});
test('No DB fails closed and 1453 is not a central write password',async()=>{
 const result=await onRequestGet({request:req(),env:{}});
 assert.equal(result.status,503);
 const {db}=mockDb();
 const blocked=await onRequestPost({request:req('POST',{action:'bulk-deactivate'},'1453'),env:{DB:db,PRODUCT_WRITE_KEY:secret}});
 assert.equal(blocked.status,401);
});
test('UTF-8 secret works for central writes and D1 is the source of truth',async()=>{
 const {db,batches}=mockDb();
 const p={id:'excel::b:8691234567890',barkod:'8691234567890',baslik:'Süt',
   satisFiyati:39,kdv:1,source:'bundle',lifecycleStatus:'initial-inactive'};
 const r=await onRequestPost({request:req('POST',{action:'upsert',product:p,reason:'deactivate'}),env:{DB:db,PRODUCT_WRITE_KEY:secret}});
 assert.equal(r.status,200);
 assert.equal((await r.json()).product.lifecycleStatus,'initial-inactive');
 assert.equal(batches.length,1);
 assert.equal(batches[0].length,2);
 assert.match(batches[0][0].sql,/INSERT INTO product_changes/);
});
test('Bulk deactivation includes initial imported rows without an explicit active field',async()=>{
 const {db,batches}=mockDb();
 const r=await onRequestPost({request:req('POST',{action:'bulk-deactivate'}),env:{DB:db,PRODUCT_WRITE_KEY:secret}});
 assert.equal(r.status,200);
 assert.equal(batches.length,1);
 assert.match(batches[0][1].sql,/COALESCE\(json_extract\(payload,'\$\.lifecycleStatus'\),'active'\)='active'/);
});
test('Empty DB status endpoint fails closed even if a default catalogue exists on phone',async()=>{
 const {db}=mockDb();
 db.prepare=sql=>({first:async()=>sql.includes('catalog_seed_count')?null:{count:0},all:async()=>({results:[]})});
 const r=await onRequestGet({request:req('GET',null,secret,'?health=1'),env:{DB:db}});
 assert.equal(r.status,503);
});
