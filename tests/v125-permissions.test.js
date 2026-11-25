import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeProfile,STANDARD_PERMISSIONS} from '../lib/permissions-v121.js';
import {lookup125,credit125,collect125,reportScope125,dailyScope125,payment125} from '../lib/rights-v125.js';
import {safeProduct125} from '../functions/api/product-state-v125.js';
const user=ids=>({id:'11111111-1111-4111-8111-111111111111',role:'cashier',active:1,permissions:JSON.stringify(encodeProfile(ids))});
test('standard profile customer operations and own reports without broad rights',()=>{
 const u=user(STANDARD_PERMISSIONS);
 assert.equal(lookup125(u),true);assert.equal(credit125(u),true);assert.equal(collect125(u),true);
 assert.equal(reportScope125(u),'own');assert.equal(dailyScope125(u),'own');
 assert.equal(payment125(u,'Nakit'),true);assert.equal(payment125(u,'Kart'),true);assert.equal(payment125(u,'Havale / FAST'),false);
});
test('daily only is aggregate, not receipt access; other and all are separate',()=>{
 assert.equal(reportScope125(user(['report.daily.own'])),null);
 assert.equal(dailyScope125(user(['report.daily.own'])),'own');
 assert.equal(reportScope125(user(['report.other'])),'other');
 assert.equal(reportScope125(user(['report.all'])),'all');
});
test('lookup alone never grants collection or credit',()=>{
 const u=user(['customer.lookup']);
 assert.equal(lookup125(u),true);assert.equal(credit125(u),false);assert.equal(collect125(u),false);
 assert.equal(lookup125({...u,active:0}),false);
});
test('cost and arbitrary private fields removed from restricted response',()=>{
 assert.deepEqual(safeProduct125({id:'sku',baslik:'ÜRÜN',satisFiyati:30,alisFiyati:12,internalCost:11,lifecycleStatus:'active'}),{id:'sku',baslik:'ÜRÜN',satisFiyati:30,lifecycleStatus:'active'});
});
test('legacy permissions preserved without implicit profile upgrades',()=>{
 const u={role:'cashier',active:1,permissions:'["customers","reports","sales"]'};
 assert.equal(credit125(u),true);assert.equal(reportScope125(u),'all');
 assert.equal(dailyScope125(u),'all');
});
