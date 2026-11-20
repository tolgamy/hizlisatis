import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

// Mock the network boundary; IndexedDB is intentionally not authoritative.
const server=new Map();
let bulkAt=null;
globalThis.window={prompt:()=>'test-secret-with-more-than-24-characters'};
globalThis.fetch=async (url,options={})=>{
  const parsed=new URL(url,'https://example.test');
  if(options.method==='GET'){
    const after=parsed.searchParams.get('after')||'';
    return Response.json({products:[...server.values()].filter(p=>p.id>after),
      bulkAt,next:null});
  }
  const body=JSON.parse(options.body);
  if(body.action==='upsert'){
    server.set(body.product.id,body.product);
    return Response.json({ok:true,product:body.product});
  }
  if(body.action==='bulk-deactivate'){
    bulkAt=new Date().toISOString();
    return Response.json({ok:true,at:bulkAt});
  }
  if(body.action==='import'){
    for(const p of body.products)server.set(p.id,p);
    return Response.json({ok:true,count:body.products.length});
  }
  return Response.json({error:'unknown'},{status:400});
};

test('passive state persists after DB is reopened and catalogue is refreshed', async () => {
  const idb = await import('../public/idb.js');
  const initial = {
    id:'excel::b:8691234567890',barkod:'8691234567890',baslik:'Süt',
    source:'bundle',satisFiyati:39,kdv:1,stokBelirsiz:true
  };
  await idb.installBundledProducts([initial],'integration-catalog-v1');
  const passive = {...initial,lifecycleStatus:'initial-inactive',
    statusChangedAt:'2026-11-21T09:00:00.000Z',everActivated:false};
  await idb.saveManagedProduct(passive,'deactivate');
  assert.equal((await idb.getSnapshot()).products[0].lifecycleStatus,'initial-inactive');
  // Simulate a full page reload with a new module instance & IndexedDB connection.
  const db=await idb.openDB();db.close();
  const reloaded = await import('../public/idb.js?test-reload=true');
  assert.equal((await reloaded.getSnapshot()).products[0].lifecycleStatus,'initial-inactive');
  // A version bump must not reactivate the same barcode.
  await reloaded.installBundledProducts([initial],'integration-catalog-v2');
  assert.equal((await reloaded.getSnapshot()).products[0].lifecycleStatus,'initial-inactive');
  const active = {...passive,lifecycleStatus:'active',everActivated:true,
    statusChangedAt:'2026-11-21T10:00:00.000Z'};
  await reloaded.saveManagedProduct(active,'activate');
  assert.equal((await reloaded.getSnapshot()).products[0].lifecycleStatus,'active');
  const later = {...active,lifecycleStatus:'later-inactive',
    statusChangedAt:'2026-11-21T11:00:00.000Z'};
  await reloaded.saveManagedProduct(later,'deactivate');
  assert.equal((await reloaded.getSnapshot()).products[0].lifecycleStatus,'later-inactive');
});
