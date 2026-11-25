import {createHmac} from 'node:crypto';
export const WINDOW117=15*60*1000;
export function throttleDelay117(n){return n<=3?0:n<=5?10000:n<=10?30000:60000;}
export function sourceBucket117(env,scope){
 if(!env.AUTH_SOURCE117||!env.PRODUCT_WRITE_KEY)throw Error('Giriş kaynağı tanımlanmadı.');
 return createHmac('sha256',env.PRODUCT_WRITE_KEY).update('v117:'+scope+':'+env.AUTH_SOURCE117).digest('hex');
}
export async function transaction117(env,fn){
 const conn=await env.MYSQL_POOL.getConnection();
 try{await conn.beginTransaction();const r=await fn(conn);await conn.commit();return r;}
 catch(e){await conn.rollback().catch(()=>{});throw e;}finally{conn.release();}
}
export async function readBucket117(conn,env,scope,now){
 const key=sourceBucket117(env,scope);
 await conn.execute('INSERT IGNORE INTO pos_auth_throttle(bucket_key,touched_at) VALUES(?,?)',[key,now]);
 const [rows]=await conn.execute('SELECT attempts,retry_at,touched_at FROM pos_auth_throttle WHERE bucket_key=? FOR UPDATE',[key]);
 const row=rows[0],stale=now-Number(row.touched_at)>=WINDOW117;
 return {key,attempts:stale?0:Number(row.attempts),retryAt:stale?0:Number(row.retry_at)};
}
export async function failBucket117(conn,b,now){
 const attempts=Math.min(1000000,b.attempts+1),retryAt=now+throttleDelay117(attempts);
 await conn.execute('UPDATE pos_auth_throttle SET attempts=?,retry_at=?,touched_at=? WHERE bucket_key=?',[attempts,retryAt,now,b.key]);
 return {...b,attempts,retryAt};
}
export async function reserveLogin117(env){
 return transaction117(env,async conn=>{const now=Date.now(),b=await readBucket117(conn,env,'login',now);
 if(b.retryAt>now)return {retryMs:b.retryAt-now};
 const reserved=await failBucket117(conn,b,now);return {key:reserved.key};
 });
}
export async function refundLogin117(env,reservation){
 if(!reservation?.key)return;
 await transaction117(env,async conn=>{
 const [rows]=await conn.execute('SELECT attempts,retry_at,touched_at FROM pos_auth_throttle WHERE bucket_key=? FOR UPDATE',[reservation.key]);
 if(!rows[0])return;
 const attempts=Math.max(0,Number(rows[0].attempts)-1),now=Date.now(),retryAt=Math.min(Number(rows[0].retry_at),now+throttleDelay117(attempts));
 await conn.execute('UPDATE pos_auth_throttle SET attempts=?,retry_at=?,touched_at=? WHERE bucket_key=?',[attempts,retryAt,now,reservation.key]);
 });
}
