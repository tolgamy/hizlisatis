import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('startup does not redundantly import the 19,096-product bundled catalogue',()=>{
 const app=read('../public/app.js');
 const setup=app.slice(app.indexOf('async function setup()'));
 assert.ok(setup.startsWith('async function setup()'));
 assert.doesNotMatch(setup,/installBuiltInCatalog\(\)/);
 assert.match(setup,/await refreshManagedData\(\)/);
 const sw=read('../public/sw.js');
 assert.doesNotMatch(sw,/fetch\('\/catalog\/manifest\.json'/);
 assert.match(sw,/v29-active-grid-categories/);
});

test('mobile D1 loading is explicit and dangerous bulk actions are disabled until completion',()=>{
 const manager=read('../public/product-management.js');
 assert.match(manager,/Merkezi ürünler yükleniyor/);
 assert.match(manager,/manageBulkDeactivate'\)\.disabled=unavailable/);
 assert.match(manager,/state\.products\.length<19096/);
 const app=read('../public/app.js');
 assert.match(app,/catalogLoading:true/);
 assert.match(app,/catalogProgress:0/);
 assert.match(app,/catalogError:''/);
});

test('central catalog runtime never loads local duplicate full catalogue automatically',()=>{
 const db=read('../public/idb.js');
 const segment=db.slice(db.indexOf('export async function getSnapshot('),
   db.indexOf('/** Atomically replace'));
 assert.match(segment,/getDeviceState\(\)/);
 assert.doesNotMatch(segment,/getLocalSnapshot\(\)/);
 assert.match(segment,/fetchRemoteProducts\(onProgress\)/);
});
