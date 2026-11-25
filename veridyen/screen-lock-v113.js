// v113: the sole PIN authority is the private Node.js environment.
import {createHash,timingSafeEqual} from 'node:crypto';
import {currentAccessUser,ACCESS_COOKIE} from '../lib/user-access.js';
import {allowAdminRequestOrigin} from '../lib/admin-auth.js';
export const IDLE_MS=300000;
export function delayMs(n){return n<=3?0:n<=5?10000:n<=10?30000:60000;}
export function idleExpired(row,now){return !!Number(row.is_locked)||now-Number(row.last_activity)>=IDLE_MS;}
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const denied=()=>json({error:'Ekran kilitli. PIN ile kilidi açın.',code:'SCREEN_LOCKED'},423);
function session(request,user){
 const token=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(ACCESS_COOKIE+'='))?.slice(ACCESS_COOKIE.length+1)||'';
 return {key:createHash('sha256').update(token).digest('hex'),user:user.id,expires:Number(token.split('.')[2])};
}
export function validScreenPin113(value){return typeof value==='string'&&/^\d{4}$/.test(value)&&value.length===4;}
function pinMatches(pin,env){
 return validScreenPin113(pin)&&validScreenPin113(env.SCREEN_LOCK_PIN)&&timingSafeEqual(Buffer.from(pin,'ascii'),Buffer.from(env.SCREEN_LOCK_PIN,'ascii'));
}
const unavailable=()=>json({error:'Ekran PIN’i sunucuda yapılandırılmamış. Sistem yöneticisine başvurun.',code:'SCREEN_PIN_CONFIG_REQUIRED'},503);
async function audit(conn,s,event,now){await conn.execute('INSERT INTO pos_screen_audit(session_key,user_id,event_type,happened_at) VALUES(?,?,?,?)',[s.key,s.user,event,now]);}
async function transaction(env,fn){
 const conn=await env.MYSQL_POOL.getConnection();
 try{await conn.beginTransaction();const r=await fn(conn);await conn.commit();return r;}
 catch(e){await conn.rollback().catch(()=>{});throw e;}finally{conn.release();}
}
async function loadRow(conn,s,now){
 await conn.execute('INSERT IGNORE INTO pos_screen_sessions(session_key,user_id,last_activity,expires_at) VALUES(?,?,?,?)',[s.key,s.user,now,s.expires]);
 const [rows]=await conn.execute('SELECT * FROM pos_screen_sessions WHERE session_key=? FOR UPDATE',[s.key]);let row=rows[0];
 if(!Number(row.is_locked)&&idleExpired(row,now)){await conn.execute('UPDATE pos_screen_sessions SET is_locked=1 WHERE session_key=?',[s.key]);row={...row,is_locked:1};await audit(conn,s,'idle_lock',now);}
 return row;
}
function state(config,row,now){return {configured:!!config,locked:!!Number(row?.is_locked||0),attempts:Number(row?.attempts||0),retryMs:Math.max(0,Number(row?.retry_at||0)-now),remainingMs:!config?IDLE_MS:Number(row?.is_locked)?0:Math.max(0,IDLE_MS-(now-Number(row?.last_activity||now)))};}
export async function guardScreen113(request,env){
 if(!env.MYSQL_POOL)return null;
 const user=await currentAccessUser(request,env);if(!user)return null;
 const s=session(request,user);
 if(!validScreenPin113(env.SCREEN_LOCK_PIN))return unavailable();
 return transaction(env,async conn=>Number((await loadRow(conn,s,Date.now())).is_locked)?denied():null);
}
export function onRequestGet({request,env}){return handle(request,env,'status',{});}
export async function onRequestPost({request,env}){
 if(!allowAdminRequestOrigin(request))return json({error:'İzin verilmeyen kaynak.'},403);
 let b;try{b=await request.json();}catch{return json({error:'Geçersiz istek.'},400);}
 if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>512)return json({error:'Geçersiz istek.'},400);
 return handle(request,env,b.action,b);
}
async function handle(request,env,action,b){
 if(!env.MYSQL_POOL||!allowAdminRequestOrigin(request))return json({error:'Ekran kilidi hizmeti kullanılamıyor.'},503);
 const user=await currentAccessUser(request,env);if(!user)return json({error:'Kullanıcı oturumu sona erdi.',code:'AUTH_REQUIRED'},401);
 // Explicitly refuse even an authenticated administrator with the old PIN.
 if(action==='configure')return json({error:'Ekran PIN’i yalnızca cPanel üzerinden değiştirilebilir.'},403);
 if(!['status','activity','lock','unlock'].includes(action))return json({error:'Geçersiz işlem.'},400);
 if(!validScreenPin113(env.SCREEN_LOCK_PIN))return unavailable();
 const s=session(request,user);
 try{return await transaction(env,async conn=>{
  const now=Date.now(),config=true;
  let row=await loadRow(conn,s,now);
  if(action==='lock'&&!Number(row.is_locked)){await conn.execute('UPDATE pos_screen_sessions SET is_locked=1 WHERE session_key=?',[s.key]);row={...row,is_locked:1};await audit(conn,s,'manual_lock',now);}
  if(action==='activity'&&!Number(row.is_locked)){await conn.execute('UPDATE pos_screen_sessions SET last_activity=? WHERE session_key=?',[now,s.key]);row={...row,last_activity:now};}
  if(action==='unlock'&&Number(row.is_locked)){
   if(Number(row.retry_at)>now)return json({...state(config,row,now),error:'Bekleme süresi devam ediyor.'},429);
   if(!validScreenPin113(b.pin))return json({...state(config,row,now),error:'PIN tam 4 rakam olmalı.'},400);
   if(!pinMatches(b.pin,env)){
    const attempts=Math.min(1000000,Number(row.attempts)+1),retry=now+delayMs(attempts);
    await conn.execute('UPDATE pos_screen_sessions SET attempts=?,retry_at=? WHERE session_key=?',[attempts,retry,s.key]);
    row={...row,attempts,retry_at:retry};await audit(conn,s,'wrong_pin',now);return json({...state(config,row,now),error:'PIN yanlış. Tekrar deneyin.'},401);
   }
   await conn.execute('UPDATE pos_screen_sessions SET is_locked=0,attempts=0,retry_at=0,last_activity=? WHERE session_key=?',[now,s.key]);
   row={...row,is_locked:0,attempts:0,retry_at:0,last_activity:now};await audit(conn,s,'unlocked',now);
  }
  return json(state(config,row,now));
 });}catch(e){console.error('Screen lock:',e?.code||e?.name);return json({error:'Ekran kilidi sunucu bağlantısı kurulamadı.'},503);}
}
