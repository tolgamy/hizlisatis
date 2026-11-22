/** Signed, HttpOnly, SameSite=Strict admin sessions.
 * Keep public D1 product reads separate from authorized modifications.
 * Never persist PRODUCT_WRITE_KEY in browser storage or responses.
 */
export const SESSION_COOKIE='hizlisatis_admin';
export const SESSION_SECONDS=30*24*60*60;

function strong(secret){return typeof secret==='string'&&secret.length>=24&&secret.length<=256;}
function validOrigin(request) {
  const origin=request.headers.get('Origin');
  const site=request.headers.get('Sec-Fetch-Site');
  if(site && !['same-origin','none'].includes(site))return false;
  if(!origin)return true;
  try{return new URL(origin).origin===new URL(request.url).origin;}catch{return false;}
}
async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
}
function constantTimeEqual(a,b) {
  if(a.length!==b.length)return false;
  let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
  return difference===0;
}
export async function validAdminKey(value, secret) {
  if(!strong(secret)||typeof value!=='string'||value.length!==secret.length)return false;
  return constantTimeEqual(await digest(value),await digest(secret));
}
async function signature(secret, content) {
  const key=await crypto.subtle.importKey('raw',
    new TextEncoder().encode('hizlisatis-session-v1:'+secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const result=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(content)));
  return Array.from(result,byte=>byte.toString(16).padStart(2,'0')).join('');
}
function readCookie(request) {
  const cookies=request.headers.get('Cookie')||'';
  const raw=cookies.split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='));
  return raw?.slice(SESSION_COOKIE.length+1)||'';
}
export async function validAdminSession(request,secret,now=Date.now()) {
  if(!strong(secret)||!validOrigin(request))return false;
  const raw=readCookie(request);
  const match=/^v1\.(\d{10,13})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(raw);
  if(!match)return false;
  const expires=Number(match[1]);
  if(!Number.isSafeInteger(expires)||expires<=now||
    expires>now+SESSION_SECONDS*1000+60000)return false;
  const unsigned='v1.'+match[1]+'.'+match[2];
  const expected=await signature(secret,unsigned);
  return constantTimeEqual(new TextEncoder().encode(expected),new TextEncoder().encode(match[3]));
}
export async function authorizedAdmin(request,env,permission='products') {
  if(String(env?.AUTH_V2_ENABLED||'').toLowerCase()==='true') {
    // The former shared-key cookie/header NEVER bypasses user permissions.
    const {authorizedAccess}=await import('./user-access.js');
    return authorizedAccess(request,env,permission);
  }
  if(!validOrigin(request))return false;
  const secret=String(env?.PRODUCT_WRITE_KEY||'');
  if(await validAdminSession(request,secret))return true;
  const encoded=request.headers.get('X-Product-Key')||'';
  if(encoded.length>2048)return false;
  let supplied='';try{supplied=decodeURIComponent(encoded)}catch{return false}
  return validAdminKey(supplied,secret);
}
export async function makeSessionCookie(secret,now=Date.now()) {
  if(!strong(secret))throw Error('PRODUCT_WRITE_KEY tanımlı değil veya zayıf.');
  const random=Array.from(crypto.getRandomValues(new Uint8Array(16)),
    byte=>byte.toString(16).padStart(2,'0')).join('');
  const content='v1.'+(now+SESSION_SECONDS*1000)+'.'+random;
  const token=content+'.'+await signature(secret,content);
  return SESSION_COOKIE+'='+token+'; Path=/api; Max-Age='+SESSION_SECONDS+
    '; Secure; HttpOnly; SameSite=Strict';
}
export function clearSessionCookie() {
  return SESSION_COOKIE+'=; Path=/api; Max-Age=0; Secure; HttpOnly; SameSite=Strict';
}
export function allowAdminRequestOrigin(request){return validOrigin(request)}
