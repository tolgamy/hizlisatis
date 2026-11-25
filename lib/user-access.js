/** HızlıSatış v56: D1 user accounts and signed, HttpOnly short-lived sessions.
 * Activated ONLY with AUTH_V2_ENABLED=true. No plaintext passwords or access
 * credentials are stored in the browser or read from user content.
 */
import {allowAdminRequestOrigin} from './admin-auth.js';
export const ACCESS_COOKIE='hizlisatis_user';
export const ACCESS_SECONDS=12*60*60;
// Cloudflare Workers production WebCrypto rejects PBKDF2 iterations above
// 100,000. Node tests allow more, so this MUST be capped for deployment.
const ITERATIONS=100000;
const enc=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const decodeHex=s=>new Uint8Array(s.match(/.{2}/g).map(x=>parseInt(x,16)));
const constant=(a,b)=>{
  if(a.length!==b.length)return false;
  let delta=0;for(let i=0;i<a.length;i++)delta|=a[i]^b[i];
  return delta===0;
};
const keyReady=env=>typeof env?.PRODUCT_WRITE_KEY==='string'&&env.PRODUCT_WRITE_KEY.length>=24;
export const accessEnabled=env=>String(env?.AUTH_V2_ENABLED||'').toLowerCase()==='true';
export function accessConfigError(env){
  if(!env?.DB?.prepare)return 'Cloudflare D1 DB bağlantısı bulunamadı.';
  if(!keyReady(env))return 'PRODUCT_WRITE_KEY sunucu sırrı tanımlı değil.';
  if(typeof env?.ADMIN_INITIAL_PASSWORD!=='string'||env.ADMIN_INITIAL_PASSWORD.length<12)
    return 'ADMIN_INITIAL_PASSWORD Cloudflare sırrını en az 12 karakter olarak tanımlayın.';
  return '';
}
const safeName=name=>typeof name==='string'&&/^[a-zA-Z0-9._-]{3,32}$/.test(name);
export const safePassword117=password=>typeof password==='string'&&password.length>=10&&password.length<=128&&/[A-Z]/.test(password)&&/[0-9]/.test(password)&&/\./.test(password)&&/^[A-Z0-9.]+$/.test(password);
const safePassword=safePassword117;
function secret(env){return 'hizlisatis-user-v2:'+env.PRODUCT_WRITE_KEY;}
async function hmac(content,env){
  const key=await crypto.subtle.importKey('raw',enc.encode(secret(env)),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(content))));
}
async function hashPassword(password,salt=crypto.getRandomValues(new Uint8Array(24))){
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},key,256);
  return 'pbkdf2$'+ITERATIONS+'$'+hex(salt)+'$'+hex(new Uint8Array(bits));
}
async function verifyPassword(password,stored){
  const m=/^pbkdf2\$(\d+)\$([a-f0-9]{48})\$([a-f0-9]{64})$/.exec(stored||'');
  if(!m||Number(m[1])<100000||Number(m[1])>100000)return false;
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:decodeHex(m[2]),iterations:Number(m[1]),hash:'SHA-256'},key,256);
  return constant(new Uint8Array(bits),decodeHex(m[3]));
}
export async function ensureUsers(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','cashier')),
    permissions TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1,
    session_version INTEGER NOT NULL DEFAULT 1, failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  )`).run();
}
export const publicUser=user=>({
  id:user.id,username:user.username,role:user.role,
  permissions:user.role==='admin'?['sales','products','customers','reports','discounts','users']:
    parsePermissions(user.permissions),
  active:Boolean(user.active)
});
function parsePermissions(raw){
  try{return Array.isArray(JSON.parse(raw))?JSON.parse(raw).filter(x=>['sales','products','customers','reports','discounts'].includes(x)):[]}
  catch{return []}
}
export function hasPermission(user,permission){
  if(!user||!user.active)return false;
  return user.role==='admin'||parsePermissions(user.permissions).includes(permission);
}
function cookieFrom(request){
  const found=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(ACCESS_COOKIE+'='));
  return found?.slice(ACCESS_COOKIE.length+1)||'';
}
export async function createAccessCookie(user,env,now=Date.now()){
  const data=['v2',user.id,String(now+ACCESS_SECONDS*1000),String(user.session_version),
    hex(crypto.getRandomValues(new Uint8Array(16)))].join('.');
  return ACCESS_COOKIE+'='+data+'.'+await hmac(data,env)+'; Path=/api; Max-Age='+ACCESS_SECONDS+'; Secure; HttpOnly; SameSite=Strict';
}
export function clearAccessCookie(){
  return ACCESS_COOKIE+'=; Path=/api; Max-Age=0; Secure; HttpOnly; SameSite=Strict';
}
export async function currentAccessUser(request,env){
  if(!accessEnabled(env)||accessConfigError(env)||!allowAdminRequestOrigin(request))return null;
  const token=cookieFrom(request);
  const m=/^(v2\.[a-f0-9-]{36}\.[0-9]{13}\.[0-9]+\.[a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
  if(!m)return null;
  const segments=m[1].split('.');
  const expires=Number(segments[2]);
  if(!Number.isSafeInteger(expires)||expires<=Date.now()||expires>Date.now()+ACCESS_SECONDS*1000+60000)return null;
  if(!constant(enc.encode(await hmac(m[1],env)),enc.encode(m[2])))return null;
  await ensureUsers(env.DB);
  const user=await env.DB.prepare('SELECT * FROM app_users WHERE id=?').bind(segments[1]).first();
  if(!user?.active||Number(user.session_version)!==Number(segments[3]))return null;
  return user;
}
export async function authorizedAccess(request,env,permission){
  const user=await currentAccessUser(request,env);
  return hasPermission(user,permission);
}
export async function loginUser(env,username,password){
  if(!safeName(username)||typeof password!=='string'||password.length>128)
    return null;
  await ensureUsers(env.DB);
  let user=await env.DB.prepare('SELECT * FROM app_users WHERE username=?').bind(username).first();
  if(!user){
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM app_users').first();
    const firstName=String(env.ADMIN_INITIAL_USER||'admin').trim();
    if(Number(count?.n||0)!==0||username!==firstName||password.length<12)return null;
    const storedSecret=env.ADMIN_INITIAL_PASSWORD;
    const check1=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(password)));
    const check2=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(storedSecret)));
    if(!constant(check1,check2))return null;
    const id=crypto.randomUUID(),createdAt=new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO app_users (id,username,password_hash,role,permissions,created_at) VALUES (?,?,?,'admin','[]',?)")
      .bind(id,username,await hashPassword(password),createdAt).run();
    user=await env.DB.prepare('SELECT * FROM app_users WHERE username=?').bind(username).first();
  }
  if(!user?.active)return null;
  if(!env.AUTH_SOURCE117&&Number(user.locked_until)>Date.now())return null;
  if(!await verifyPassword(password,user.password_hash)){
    if(!env.AUTH_SOURCE117){
      const attempts=Number(user.failed_logins||0)+1,locked=attempts>=5?Date.now()+15*60*1000:0;
      await env.DB.prepare('UPDATE app_users SET failed_logins=?,locked_until=? WHERE id=?').bind(attempts>=5?0:attempts,locked,user.id).run();
    }
    return null;
  }
  await env.DB.prepare('UPDATE app_users SET failed_logins=0,locked_until=0 WHERE id=?').bind(user.id).run();
  return user;
}
export async function allUsers(env){
  await ensureUsers(env.DB);
  const result=await env.DB.prepare('SELECT * FROM app_users ORDER BY created_at,username').all();
  return (result.results||[]).map(publicUser);
}
export async function createUser(env,input){
  const username=String(input.username||'').trim();
  const password=input.password,role=input.role;
  if(!safeName(username)||!safePassword(password)||!['admin','cashier'].includes(role))
    throw Error('Kullanıcı adı 3–32 karakter; yeni parola 10–128 karakter, büyük harf, rakam ve nokta içermeli.');
  const permissions=role==='admin'?[]:[...new Set((Array.isArray(input.permissions)?input.permissions:[]).filter(x=>['sales','products','customers','reports','discounts'].includes(x)))];
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO app_users (id,username,password_hash,role,permissions,created_at) VALUES (?,?,?,?,?,?)')
    .bind(id,username,await hashPassword(password),role,JSON.stringify(permissions),new Date().toISOString()).run();
  return id;
}
export async function updateUser(env,input,actor){
  const id=String(input.id||'');
  const target=await env.DB.prepare('SELECT * FROM app_users WHERE id=?').bind(id).first();
  if(!target)throw Error('Kullanıcı bulunamadı.');
  if(target.id===actor.id && (input.active===false||input.role==='cashier'))
    throw Error('Kendi yönetici hesabınızı kapatamaz veya düşüremezsiniz.');
  const role=['admin','cashier'].includes(input.role)?input.role:target.role;
  const active=typeof input.active==='boolean'?Number(input.active):Number(target.active);
  const permissions=role==='admin'?[]:[...new Set((Array.isArray(input.permissions)?input.permissions:parsePermissions(target.permissions)).filter(x=>['sales','products','customers','reports','discounts'].includes(x)))];
  const password=input.password;
  if(password!==undefined&&!safePassword(password))throw Error('Yeni parola 10–128 karakter, büyük harf, rakam ve nokta içermeli.');
  const hash=password===undefined?target.password_hash:await hashPassword(password);
  if(target.role==='admin' && (role!=='admin'||!active)){
    const result=await env.DB.prepare("SELECT COUNT(*) AS n FROM app_users WHERE role='admin' AND active=1").first();
    if(Number(result?.n)<=1)throw Error('Son aktif yönetici devre dışı bırakılamaz.');
  }
  await env.DB.prepare('UPDATE app_users SET role=?,active=?,permissions=?,password_hash=?,session_version=session_version+1 WHERE id=?')
    .bind(role,active,JSON.stringify(permissions),hash,id).run();
}
