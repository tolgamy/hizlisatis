import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberProductStatus, rememberBulkStatuses, overlayLifecycleBackup, getBackupStatistics } from '../public/lifecycle-backup.js';
import { productStatus } from '../public/product-lifecycle.js';

function memoryStorage(){
  const data=new Map();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
}
const p=(id, lifecycleStatus='active', at=null, everActivated=false)=>
  ({id,baslik:'Ürün '+id, lifecycleStatus, statusChangedAt:at, everActivated});

test('passive status survives simulated page reload + catalogue replacement',()=>{
  const store=memoryStorage(), id='excel::b:8691234567890';
  const passive=p(id,'later-inactive','2026-11-21T11:00:00Z',true);
  assert.equal(rememberProductStatus(passive,store),true);
  const bundled=p(id);
  const reloaded=overlayLifecycleBackup([bundled],store)[0];
  assert.equal(productStatus(reloaded),'later-inactive');
  assert.equal(reloaded.everActivated,true);
});
test('initial bulk snapshot only applies to known product ids, not new products',()=>{
  const store=memoryStorage();
  const originals=[p('a','initial-inactive','2026-11-21T10:00:00Z'),p('b','later-inactive','2026-11-21T10:00:00Z',true)];
  assert.equal(rememberBulkStatuses(originals,store),true);
  const current=[p('a'),p('b'),p('new')];
  const reload=overlayLifecycleBackup(current,store);
  assert.deepEqual(reload.map(productStatus),['initial-inactive','later-inactive','active']);
  assert.equal(getBackupStatistics(store).bulk,2);
});
test('later activation wins over an older initial deactivation',()=>{
  const store=memoryStorage();
  rememberBulkStatuses([p('a','initial-inactive','2026-11-21T10:00:00Z')],store);
  rememberProductStatus(p('a','active','2026-11-21T11:00:00Z',true),store);
  assert.equal(productStatus(overlayLifecycleBackup([p('a')],store)[0]),'active');
  const newestDb=p('a','later-inactive','2026-11-21T12:00:00Z',true);
  assert.equal(productStatus(overlayLifecycleBackup([newestDb],store)[0]),'later-inactive');
});
test('unavailable storage is nonfatal and never overrides IndexedDB',()=>{
  const broken={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}};
  assert.equal(rememberProductStatus(p('a','initial-inactive'),broken),false);
  const current=p('a','active');
  assert.equal(overlayLifecycleBackup([current],broken)[0],current);
});
