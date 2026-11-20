import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validAdminSession,validAdminKey,makeSessionCookie,clearSessionCookie,authorizedAdmin} from '../lib/admin-auth.js';
import {onRequestPost as login,onRequestDelete as logout} from '../functions/api/admin-session.js';
import {onRequestPost as writeProduct} from '../functions/api/product-state.js';

const secret='t0P!üRüN-2026-Admin-P4ss-9-5-7-1';
const root='https://hizlisatis.pages.dev';
function request(route,method,body=null,cookie='',origin=root){
 const headers={'Origin':origin};
 if(body)headers['Content-Type']='application/json';
 if(cookie)headers.Cookie=cookie;
 return new Request(root+route,{method,headers,body:body?JSON.stringify(body):undefined});
}
function dbMock() {
 const writes=[];
 return {writes,prepare(sql){return {
   sql,first:async()=>sql.includes('catalog_seed_count')?{value:'19096'}:null,
   bind(...params){return {sql,params}}}
 },batch:async statements=>{writes.push(...statements);return []}};
}
const getToken=res=>res.headers.get('set-cookie')?.split(';')[0]||'';

test('one correct 32+ character key establishes a signed 30 day HttpOnly session',async()=>{
 const response=await login({request:request('/api/admin-session','POST',{key:secret}),env:{PRODUCT_WRITE_KEY:secret}});
 assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie');
 assert.match(cookie,/HttpOnly/);
 assert.match(cookie,/Secure/);
 assert.match(cookie,/SameSite=Strict/);
 assert.match(cookie,/Max-Age=2592000/);
 assert.equal(cookie.includes(secret),false);
 const token=getToken(response);
 assert.equal(await validAdminSession(request('/api/product-state','POST',null,token),secret),true);
 assert.equal(await authorizedAdmin(request('/api/product-state','POST',null,token),{PRODUCT_WRITE_KEY:secret}),true);
});
test('tampered or expired cookie and wrong password fail closed',async()=>{
 assert.equal(await validAdminKey('1453',secret),false);
 const wrong=await login({request:request('/api/admin-session','POST',{key:'incorrect'}),env:{PRODUCT_WRITE_KEY:secret}});
 assert.equal(wrong.status,401);
 const cookie=await makeSessionCookie(secret);
 const raw=cookie.split(';')[0];
 const tampered=raw.slice(0,-1)+(raw.endsWith('a')?'b':'a');
 assert.equal(await validAdminSession(request('/api/product-state','POST',null,tampered),secret),false);
 const past=await makeSessionCookie(secret,Date.now()-32*24*3600*1000);
 assert.equal(await validAdminSession(request('/api/product-state','POST',null,past.split(';')[0]),secret),false);
});
test('cross-site requests cannot use session cookies',async()=>{
 const cookie=(await makeSessionCookie(secret)).split(';')[0];
 assert.equal(await validAdminSession(request('/api/product-state','POST',null,cookie,'https://evil.example'),secret),false);
 const bad=await login({request:request('/api/admin-session','POST',{key:secret},'', 'https://evil.example'),env:{PRODUCT_WRITE_KEY:secret}});
 assert.equal(bad.status,403);
});
test('secure cookie can update products but unauthenticated anonymous POST cannot',async()=>{
 const cookie=getToken(await login({request:request('/api/admin-session','POST',{key:secret}),env:{PRODUCT_WRITE_KEY:secret}}));
 const db=dbMock();
 const p={id:'excel::b:8691234567890',barkod:'8691234567890',baslik:'Deneme',
   satisFiyati:25,source:'bundle',lifecycleStatus:'active'};
 const body={action:'upsert',reason:'scan-activate',product:p};
 const allowed=await writeProduct({request:request('/api/product-state','POST',body,cookie),
   env:{DB:db,PRODUCT_WRITE_KEY:secret}});
 assert.equal(allowed.status,200);
 assert.equal(db.writes.length,2);
 const denied=await writeProduct({request:request('/api/product-state','POST',body),
   env:{DB:db,PRODUCT_WRITE_KEY:secret}});
 assert.equal(denied.status,401);
 assert.equal(db.writes.length,2);
});
test('logout deletes the HttpOnly cookie',async()=>{
 const response=await logout({request:request('/api/admin-session','DELETE')});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('set-cookie'),clearSessionCookie());
});
test('activation never prompts for 1453 but manual deactivation retains its PIN',()=>{
 const text=readFileSync(new URL('../public/product-management.js',import.meta.url),'utf8');
 const sale=text.slice(text.indexOf('async function confirmSaleActivation()'),text.indexOf('async function bulkDeactivate()'));
 assert.doesNotMatch(sale,/authorizePassiveAction\(/);
 const handler=text.slice(text.indexOf('async function updateStatus(action)'),text.indexOf('async function persist('));
 assert.match(handler,/action==='deactivate'&&\!authorizePassiveAction\(\)/);
 const form=text.slice(text.indexOf('async function saveForm('),text.indexOf('function manageScannedBarcode('));
 assert.doesNotMatch(form,/activate&&old&&!isActive\(old\)&&!authorizePassiveAction\(/);
});
test('scanner keeps linear-only decoding and uses a mobile native fallback',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/useBarCodeDetectorIfSupported: false/);
 assert.match(app,/8500/);
 assert.match(app,/await startNativeScanner\(session\)/);
 assert.match(app,/window\.BarcodeDetector/);
 assert.doesNotMatch(app,/\['qr_code'/);
});
