import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createAccessCookie} from '../lib/user-access.js';
import {onRequestPost} from '../veridyen/sale-voids.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;

const actor={
  id:'11111111-1111-4111-8111-111111111111',
  active:1,session_version:1,role:'admin',permissions:'[]'
};
const saleId='receipt-00001010',customerId='customer-00000001';

function environment({payment='Veresiye',debt=100000,alreadyVoided=false,originalCorrect=true}={}){
  const calls=[],saved={ledger:[],voids:[]};
  const sale={id:saleId,payment,total_cents:48995,customer_id:payment==='Veresiye'?customerId:null};
  let voided=alreadyVoided;
  const conn={
    async beginTransaction(){calls.push('begin');},
    async commit(){calls.push('commit');},
    async rollback(){calls.push('rollback');},
    release(){calls.push('release');},
    async execute(sql,args){
      calls.push(sql);
      if(sql.startsWith('SELECT id,payment,total_cents,customer_id FROM pos_sales'))
        return [[sale]];
      if(sql.startsWith('SELECT sale_id FROM pos_sale_voids'))
        return [voided?[{sale_id:saleId}]:[]];
      if(sql.startsWith('SELECT id,opening_debt_cents FROM pos_customers'))
        return [[{id:customerId,opening_debt_cents:0}]];
      if(sql.startsWith('SELECT customer_id,action,amount_cents FROM pos_customer_ledger'))
        return [[{customer_id:customerId,action:'sale',amount_cents:originalCorrect?48995:123}]];
      if(sql.startsWith('SELECT COALESCE(SUM(amount_cents),0) AS debt'))
        return [[{debt}]];
      if(sql.startsWith('INSERT INTO pos_customer_ledger')){
        saved.ledger.push(args);return [{affectedRows:1}];
      }
      if(sql.startsWith('INSERT INTO pos_sale_voids')){
        saved.voids.push(args);voided=true;return [{affectedRows:1}];
      }
      throw Error('Unexpected SQL '+sql);
    }
  };
  const env={
    CENTRAL_SALES_ENABLED:'true',
    AUTH_V2_ENABLED:'true',
    PRODUCT_WRITE_KEY:'p'.repeat(32),
    ADMIN_INITIAL_PASSWORD:'a'.repeat(16),
    DB:{prepare(sql){return {
      async run(){return {success:true};},
      bind(){return {async first(){return actor;}}}
    };}},
    MYSQL_POOL:{async getConnection(){return conn;}}
  };
  return {calls,saved,env};
}
async function cancel(env,reason='wrong'){
  const cookie=(await createAccessCookie(actor,env)).split(';')[0];
  const request=new Request('https://kolaykasam.com/api/sale-voids',{
    method:'POST',
    headers:{Origin:'https://kolaykasam.com',Cookie:cookie,'Content-Type':'application/json'},
    body:JSON.stringify({saleId,reason})
  });
  const response=await onRequestPost({request,env});
  return {status:response.status,body:await response.json()};
}

test('credit cancellation commits exact debt reversal and audit record together, once',async()=>{
  const {calls,saved,env}=environment();
  const first=await cancel(env,'returned');
  assert.equal(first.status,201);
  assert.equal(first.body.ok,true);
  assert.equal(saved.ledger.length,1);
  assert.deepEqual(saved.ledger[0].slice(0,4),['void:'+saleId,customerId,'void',-48995]);
  assert.equal(saved.voids.length,1);
  assert.equal(saved.voids[0][0],saleId);
  assert.equal(saved.voids[0][3],'Tam ürün iadesi');
  assert.ok(calls.indexOf('commit')>calls.findIndex(s=>s.startsWith('INSERT INTO pos_sale_voids')));
  const retry=await cancel(env,'returned');
  assert.equal(retry.status,200);
  assert.equal(retry.body.duplicate,true);
  assert.equal(saved.ledger.length,1);
  assert.equal(saved.voids.length,1);
});

test('previous collection prevents unsafe negative-balance reversal',async()=>{
  const {calls,saved,env}=environment({debt:20000});
  const result=await cancel(env);
  assert.equal(result.status,409);
  assert.match(result.body.error,/tahsil edilmiş/);
  assert.equal(saved.ledger.length,0);
  assert.equal(saved.voids.length,0);
  assert.ok(calls.includes('rollback'));
});

test('credit entry mismatch prevents an invalid reversal',async()=>{
  const {calls,saved,env}=environment({originalCorrect:false});
  const result=await cancel(env);
  assert.equal(result.status,409);
  assert.match(result.body.error,/eşleşmiyor/);
  assert.equal(saved.ledger.length,0);
  assert.equal(saved.voids.length,0);
  assert.ok(calls.includes('rollback'));
});

test('cash cancellation writes only void record; external card payment is blocked',async()=>{
  const cash=environment({payment:'Nakit'});
  const good=await cancel(cash.env,'wrong');
  assert.equal(good.status,201);
  assert.equal(cash.saved.ledger.length,0);
  assert.equal(cash.saved.voids.length,1);
  const card=environment({payment:'Kart'});
  const blocked=await cancel(card.env,'wrong');
  assert.equal(blocked.status,409);
  assert.match(blocked.body.error,/harici iade/);
  assert.equal(card.saved.ledger.length,0);
  assert.equal(card.saved.voids.length,0);
});

test('invalid cancellation reason does not access transaction',async()=>{
  const {calls,saved,env}=environment();
  const result=await cancel(env,'unapproved-reason');
  assert.equal(result.status,400);
  assert.equal(calls.length,0);
  assert.equal(saved.voids.length,0);
});
