import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import {createAccessCookie} from '../lib/user-access.js';
import {encodeProfile,STANDARD_PERMISSIONS} from '../lib/permissions-v121.js';
import {onRequestGet,onRequestPost} from '../functions/api/customers-v125.js';
import {sealBackup,openBackup} from '../veridyen/central-backup-v130.mjs';

test('authenticated customer writes keep create, limit and opening debt independent',async()=>{
  const SQL=await initSqlJs();
  const db=new SQL.Database();
  const users=new Map();
  const env={
    AUTH_V2_ENABLED:'true',CENTRAL_SALES_ENABLED:'true',
    PRODUCT_WRITE_KEY:'isolated-test-key-not-for-live-use',ADMIN_INITIAL_PASSWORD:'isolated-test-password',
    DB:{
      prepare(sql){
        return {
          run:()=>db.run(sql),
          bind(...args){
            return {
              async first(){
                if(sql==='SELECT * FROM app_users WHERE id=?')return users.get(args[0])??null;
                const result=await this.all();
                return result.results[0]??null;
              },
              async all(){
                const stmt=db.prepare(sql,args);
                try{
                  const results=[];
                  while(stmt.step())results.push(stmt.getAsObject());
                  return {results};
                }finally{stmt.free();}
              },
              run:()=>db.run(sql,args)
            };
          },
          async all(){
            const [result]=db.exec(sql);
            return {results:result?.values.map(row=>Object.fromEntries(result.columns.map((key,i)=>[key,row[i]])))??[]};
          }
        };
      },
      async batch(statements){for(const stmt of statements)await stmt.run();}
    }
  };
  async function as(role,profile,customer){
    const id=crypto.randomUUID();
    const user={id,active:1,role,permissions:JSON.stringify(encodeProfile(profile)),session_version:1};
    users.set(id,user);
    const cookie=(await createAccessCookie(user,env)).split(';')[0];
    const origin='https://test.invalid';
    const headers={Cookie:cookie,Origin:origin};
    const request=new Request(origin+'/api/customers',customer?{
      headers,method:'POST',body:JSON.stringify({action:'upsert',customer})
    }:{headers});
    return (customer?onRequestPost:onRequestGet)({request,env});
  }
  const customer={id:'customer-v130',name:'Test Müşteri',phone:'5550000100'};
  assert.equal((await as('cashier',STANDARD_PERMISSIONS,customer)).status,403);
  assert.equal((await as('cashier',['customer.create'],{...customer,creditLimit:20})).status,403);
  assert.equal((await as('cashier',['customer.create'],customer)).status,200);
  assert.equal((await as('cashier',['customer.create'],customer)).status,403);
  assert.equal((await as('cashier',['customer.limit'],{id:customer.id,openingDebt:50})).status,403);
  assert.equal((await as('cashier',['customer.opening'],{id:customer.id,openingDebt:50})).status,200);
  assert.equal((await as('cashier',['customer.limit'],{id:customer.id,creditLimit:80})).status,200);
  const standard=(await (await as('cashier',STANDARD_PERMISSIONS)).json()).customers[0];
  assert.equal(standard.balance_cents,5000);
  assert.equal(standard.credit_limit_cents,8000);
  assert.equal(standard.opening_debt_cents,undefined);
  assert.equal((await as('admin',[],{...customer,name:'Yeni Ad'})).status,200);
  const admin=(await (await as('admin',[])).json()).customers[0];
  assert.equal(admin.name,'Yeni Ad');
  assert.equal(admin.opening_debt_cents,5000);
  assert.equal(admin.credit_limit_cents,8000);
  db.close();
});

test('central backup authenticates contents and round-trips SQL',async()=>{
  const key='5f'.repeat(32);
  const sql=Buffer.from("INSERT INTO pos_customers (name) VALUES ('Müşteri');");
  const encrypted=await sealBackup(sql,key);
  assert.equal(encrypted.includes(sql),false);
  assert.deepEqual(await openBackup(encrypted,key),sql);
  assert.notDeepEqual(await sealBackup(sql,key),encrypted);
  await assert.rejects(openBackup(encrypted,'00'.repeat(32)));
  encrypted[encrypted.length-1]^=1;
  await assert.rejects(openBackup(encrypted,key));
});

test('a cash-only profile can sell with cash independently of other sales rights',async()=>{
  const {hasPermission}=await import('../lib/user-access.js');
  const {payment125,fine125}=await import('../lib/rights-v125.js');
  const user={active:1,role:'cashier',permissions:JSON.stringify(encodeProfile(['sale.cash']))};
  assert.equal(hasPermission(user,'sales'),true);
  assert.equal(payment125(user,'Nakit'),true);
  assert.equal(payment125(user,'Kart'),false);
  assert.equal(fine125(user,'sale.weight','sales'),false);
  assert.equal(fine125(user,'product.label','sales'),false);
});

test('device upgrade preserves legacy edits and receipts, scopes owned data, and removes cached costs',async()=>{
  const {IDBFactory}=await import('fake-indexeddb');
  const {setAccountStorage130,accountStorage130}=await import('../public/account-storage-v130.js');
  const {openDB,migrateLocalAccount130,pendingSales130,putPendingSale130,getLocalSnapshot,getSales}=await import('../public/idb.js');
  const store=new Map();
  const previousStorage=globalThis.localStorage,previousDB=globalThis.indexedDB;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)
  }});
  globalThis.indexedDB=new IDBFactory();
  try{
    const legacy=await openDB();
    await new Promise((resolve,reject)=>{
      const tx=legacy.transaction(['sales','excelProducts'],'readwrite');
      tx.oncomplete=resolve;tx.onabort=reject;
      tx.objectStore('sales').add({id:'old-a',cashierId:'a',items:[{alisFiyati:7}]});
      tx.objectStore('sales').add({id:'old-unknown'});
      tx.objectStore('excelProducts').add({id:'manual',baslik:'Edited',alisFiyati:7,internalCost:8,stok:4});
    });
    store.set('hizlisatis-active-products-v1','cached costs');
    setAccountStorage130('a');
    await migrateLocalAccount130();
    const [owned]=await getSales();
    assert.equal(owned.id,'old-a');
    assert.deepEqual(owned.items,[{}]);
    assert.equal(store.has('hizlisatis-active-products-v1'),false);
    accountStorage130().setItem('prefs','a-setting');
    await putPendingSale130({id:'pending-a'});
    setAccountStorage130('b');
    await migrateLocalAccount130();
    assert.deepEqual(await getSales(),[]);
    assert.deepEqual(await pendingSales130(),[]);
    assert.equal(accountStorage130().getItem('prefs'),null);
    const archive=await getLocalSnapshot({legacy:true});
    assert.equal(archive.sales.length,2);
    assert.deepEqual(archive.products,[{id:'manual',baslik:'Edited',stok:4}]);
    setAccountStorage130('a');
    assert.deepEqual(await pendingSales130(),[{id:'pending-a'}]);
    assert.equal(accountStorage130().getItem('prefs'),'a-setting');
  }finally{
    setAccountStorage130('');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:previousStorage});
    globalThis.indexedDB=previousDB;
  }
});
