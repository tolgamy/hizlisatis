import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { onRequestGet, onRequestPost } from '../functions/api/product-state.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('D1 API is unavailable without database binding and cannot be written with 1453 PIN',async()=>{
  const get=await onRequestGet({request:new Request('https://example.test/api/product-state'),env:{}});
  assert.equal(get.status,503);
  const db={prepare:()=>({first:async()=>({value:'19096'})})};
  const post=await onRequestPost({
    request:new Request('https://example.test/api/product-state',{
      method:'POST',headers:{'X-Product-Key':'1453','Content-Type':'application/json'},
      body:JSON.stringify({action:'bulk-deactivate'})}),
    env:{DB:db,PRODUCT_WRITE_KEY:'super-secret-random-d1-write-key-12345'}
  });
  assert.equal(post.status,401);
});

test('D1 seed builds SQL for exactly all 19,096 catalogue products and final readiness marker',()=>{
  execFileSync(process.execPath,['scripts/generate-d1-seed.mjs'],{cwd:root,stdio:'pipe'});
  const dir=join(root,'d1-seed-generated');
  const files=readdirSync(dir).sort();
  assert.equal(files.length,65);
  assert.equal(files.at(-1),'seed-999-ready.sql');
  const statements=files.filter(f=>f!=='seed-999-ready.sql')
    .reduce((total,f)=>total+(readFileSync(join(dir,f),'utf8').match(/INSERT INTO product_changes/g)||[]).length,0);
  assert.equal(statements,19096);
  const last=readFileSync(join(dir,'seed-999-ready.sql'),'utf8');
  assert.match(last,/catalog_seed_count/);
  assert.match(last,/19096/);
});
