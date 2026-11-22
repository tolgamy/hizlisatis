import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentAccessUser,createUser} from '../lib/user-access.js';
import {authorizedAdmin} from '../lib/admin-auth.js';
import {onRequestPost as login,onRequestGet as status,onRequestDelete as logout} from '../functions/api/auth.js';
import {onRequestPost as changeUsers} from '../functions/api/users.js';
import {onRequestPost as saleAccess} from '../functions/api/sale-access.js';
import {onRequestPost as legacyLogin} from '../functions/api/admin-session.js';

class MemoryD1 {
  users=new Map();
  prepare(sql){
    let args=[],db=this;
    return {
      bind(...values){args=values;return this;},
      async first(){
        if(sql.includes('COUNT(*)')&&sql.includes("role='admin'"))return {n:[...db.users.values()].filter(x=>x.active&&x.role==='admin').length};
        if(sql.includes('COUNT(*)'))return {n:db.users.size};
        if(sql.includes('SELECT 1 AS ok'))return db.users.size?{ok:1}:null;
        if(sql.includes('WHERE username=?'))return [...db.users.values()].find(x=>x.username===args[0])||null;
        if(sql.includes('WHERE id=?'))return db.users.get(args[0])||null;
        throw Error('Unexpected SELECT: '+sql);
      },
      async all(){
        if(sql.includes('FROM product_changes'))
          return {results:args.map(id=>({id,payload:JSON.stringify({id,satisFiyati:120})}))};
        return {results:[...db.users.values()]};
      },
      async run(){
        if(sql.includes('CREATE TABLE'))return {success:true};
        if(sql.includes('INSERT OR IGNORE INTO app_users')){
          const [id,username,password_hash,created_at]=args;
          if(![...db.users.values()].some(x=>x.username===username))
            db.users.set(id,{id,username,password_hash,created_at,role:'admin',
              permissions:'[]',active:1,session_version:1,failed_logins:0,locked_until:0});
          return {success:true};
        }
        if(sql.includes('INSERT INTO app_users')){
          const [id,username,password_hash,role,permissions,created_at]=args;
          db.users.set(id,{id,username,password_hash,role,permissions,created_at,
            active:1,session_version:1,failed_logins:0,locked_until:0});
          return {success:true};
        }
        if(sql.startsWith('UPDATE app_users SET failed_logins=?,locked_until=?')){
          const [failed_logins,locked_until,id]=args;
          Object.assign(db.users.get(id),{failed_logins,locked_until});return {success:true};
        }
        if(sql.includes('UPDATE app_users SET failed_logins=0')){
          Object.assign(db.users.get(args[0]),{failed_logins:0,locked_until:0});return {success:true};
        }
        if(sql.startsWith('UPDATE app_users SET role=?')){
          const [role,active,permissions,password_hash,id]=args;
          Object.assign(db.users.get(id),{role,active,permissions,password_hash,
            session_version:db.users.get(id).session_version+1});return {success:true};
        }
        throw Error('Unexpected mutation: '+sql);
      }
    };
  }
}
const site='https://hizlisatis.example';
const environment=()=>({AUTH_V2_ENABLED:'true',DB:new MemoryD1(),
  PRODUCT_WRITE_KEY:'server-hmac-secret-kept-only-on-cloudflare-2026',
  ADMIN_INITIAL_USER:'admin',ADMIN_INITIAL_PASSWORD:'OwnerFirstPassword2026!'});
function request(path,method='GET',body=null,cookie=''){
  const headers={'Origin':site};
  if(cookie)headers.Cookie=cookie;
  if(body!==null)headers['Content-Type']='application/json';
  return new Request(site+path,{method,headers,
    body:body===null?undefined:JSON.stringify(body)});
}
const session=res=>res.headers.get('set-cookie').split(';')[0];
const signIn=(env,name,pass)=>login({env,request:request('/api/auth','POST',{username:name,password:pass})});

test('first admin bootstraps from a normal password and receives an HttpOnly session',async()=>{
  const env=environment();
  const state=await status({request:request('/api/auth'),env});
  assert.equal((await state.json()).setupRequired,true);
  assert.equal((await signIn(env,'admin','badpassword!123')).status,401);
  const response=await signIn(env,'admin',env.ADMIN_INITIAL_PASSWORD);
  assert.equal(response.status,200);
  assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const account=env.DB.users.values().next().value;
  assert.match(account.password_hash,/^pbkdf2\$100000\$/);
  assert.doesNotMatch(account.password_hash,/OwnerFirstPassword/);
  const user=await currentAccessUser(request('/api/auth','GET',null,session(response)),env);
  assert.equal(user.username,'admin');
});

test('cashier can sell, but cannot edit products, users or make discounts',async()=>{
  const env=environment(),owner=await signIn(env,'admin',env.ADMIN_INITIAL_PASSWORD);
  const cookie=session(owner);
  const created=await changeUsers({env,request:request('/api/users','POST',
    {action:'create',username:'cashier1',password:'CashierPass2026!',role:'cashier',
      permissions:['sales']},cookie)});
  assert.equal(created.status,201);
  const cashier=await signIn(env,'cashier1','CashierPass2026!');
  const c=session(cashier);
  assert.equal(await authorizedAdmin(request('/api/product-state','POST',null,c),env),false);
  const record={id:'test1',total:120,payment:'Nakit',basketDiscountPct:0,items:[{id:'a',quantity:1,unitPrice:120,discountPct:0}]};
  const sale=await saleAccess({env,request:request('/api/sale-access','POST',{record},c)});
  assert.equal(sale.status,200);
  const discount=await saleAccess({env,request:request('/api/sale-access','POST',
    {record:{...record,basketDiscountPct:10}},c)});
  assert.equal(discount.status,403);
  const priceOverride=await saleAccess({env,request:request('/api/sale-access','POST',
    {record:{...record,items:[{...record.items[0],unitPrice:10}]}},c)});
  assert.equal(priceOverride.status,403);
  assert.equal((await changeUsers({env,request:request('/api/users','POST',
    {action:'create',username:'other',password:'OtherPass2026!',role:'admin'},c)})).status,403);
});

test('account deactivation immediately invalidates old sessions',async()=>{
  const env=environment(),owner=await signIn(env,'admin',env.ADMIN_INITIAL_PASSWORD);
  const id=await createUser(env,{username:'cashier2',password:'CashierPass2026!',role:'cashier',permissions:['sales']});
  const cashier=await signIn(env,'cashier2','CashierPass2026!');
  assert.ok(await currentAccessUser(request('/api/auth','GET',null,session(cashier)),env));
  const disabled=await changeUsers({env,request:request('/api/users','POST',
    {action:'update',id,active:false},session(owner))});
  assert.equal(disabled.status,200);
  assert.equal(await currentAccessUser(request('/api/auth','GET',null,session(cashier)),env),null);
});

test('legacy shared product key no longer provides access in secure mode',async()=>{
  const env=environment();
  const old=await legacyLogin({env,request:request('/api/admin-session','POST',
    {key:env.PRODUCT_WRITE_KEY})});
  assert.equal(old.status,403);
  const forged=request('/api/product-state','POST');
  forged.headers.set('X-Product-Key',encodeURIComponent(env.PRODUCT_WRITE_KEY));
  assert.equal(await authorizedAdmin(forged,env),false);
  const bye=await logout({request:request('/api/auth','DELETE')});
  assert.match(bye.headers.get('set-cookie'),/Max-Age=0/);
});

test('12 categories remain and cards have phone 3 / tablet-PC 4 columns',()=>{
  const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
  const css=read('styles.css'),html=read('index.html'),app=read('app.js'),sw=read('sw.js');
  assert.match(css,/#homeCategoryShortcuts\.category-photo-grid,/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css,/@media\(min-width:680px\)/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(html,/id="loginGate"/);
  assert.match(html,/id="settingsAdminGroup"/);
  assert.match(app,/await authorizeCheckout\(record\)/);
  assert.match(app,/requireAccess\(\)\.then\(\(\)=>setup\(\)\)/);
  assert.match(sw,/users-v56/);
});
