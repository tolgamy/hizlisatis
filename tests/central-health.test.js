import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/central-health.js';

test('D1 readiness requires the exact imported seed marker and at least 19,096 rows',async()=>{
 const db={
  prepare(sql){return {first:async()=>{
   if(sql.includes('catalog_seed_count'))return {value:'19096'};
   if(sql.includes('COUNT(*)'))return {n:19096};
   throw Error('Unexpected SQL');
  }}}
 };
 const response=await onRequestGet({env:{DB:db}});
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ready:true,count:19096,expected:19096});
});
test('Missing D1 binding fails closed, no mutation happens',async()=>{
 const result=await onRequestGet({env:{}});
 assert.equal(result.status,503);
 assert.equal((await result.json()).ready,false);
});
