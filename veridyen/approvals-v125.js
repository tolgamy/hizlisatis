import {randomUUID} from 'node:crypto';
import {currentAccessUser,hasPermission} from '../lib/user-access.js';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const kinds=new Set(['later','price','unknown','initial']);
const validTarget=(kind,target)=>typeof target==='string'&&target.length>0&&target.length<=(kind==='unknown'?64:180)&&(kind!=='unknown'||/^[a-zA-Z0-9._-]{6,64}$/.test(target));
const admin=u=>u?.role==='admin'&&u.active;
export async function onRequestGet({request,env}){
 const u=await currentAccessUser(request,env);if(!u||!hasPermission(u,'sales'))return reply({error:'Satış oturumu gerekli.'},403);
 try{const [rows]=await env.MYSQL_POOL.execute('SELECT id,requester_id,kind,target,status,created_at,reviewer_id,reviewed_at,note FROM pos_approval_requests'+(admin(u)?'':' WHERE requester_id=?')+' ORDER BY created_at DESC LIMIT 200',admin(u)?[]:[u.id]);return reply({requests:rows,admin:admin(u)});}
 catch{return reply({error:'Onay tablosu hazır değil. v125 SQL kurulumunu kontrol edin.'},503)}
}
export async function onRequestPost({request,env}){
 const u=await currentAccessUser(request,env);if(!u||!hasPermission(u,'sales'))return reply({error:'Satış oturumu gerekli.'},403);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'İzin verilmeyen kaynak.'},403);
 if(Number(request.headers.get('content-length')||0)>4096)return reply({error:'İstek çok büyük.'},413);
 let data;try{data=await request.json()}catch{return reply({error:'Geçersiz istek.'},400)}
 if(data?.action==='request'){
  if(!kinds.has(data.kind)||!validTarget(data.kind,data.target))return reply({error:'Talep bilgisi geçersiz.'},400);
  try{
   if(data.kind!=='unknown'){
    const [rows]=await env.MYSQL_POOL.execute('SELECT payload FROM product_changes WHERE id=?',[data.target]);
    if(!rows.length)return reply({error:'Ürün bulunamadı.'},404);
    const p=typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload;
    if(p.lifecycleStatus==='deleted')return reply({error:'Silinmiş ürün için yöneticiye başvurun.'},409);
    if(data.kind==='later'&&p.lifecycleStatus!=='later-inactive'||data.kind==='initial'&&p.lifecycleStatus!=='initial-inactive'||data.kind==='price'&&!p.fiyatBelirsiz&&Number.isFinite(p.satisFiyati)&&p.satisFiyati>0)return reply({error:'Ürün artık bu talebe uygun değil. Yeniden sorgulayın.'},409);
   }
   const key=data.kind+':'+data.target;
   await env.MYSQL_POOL.execute('INSERT INTO pos_approval_requests(id,requester_id,kind,target,status,pending_key,created_at) VALUES(?,?,?,?,?,?,?)',[randomUUID(),u.id,data.kind,data.target,'pending',key,new Date().toISOString()]);
   return reply({ok:true},201);
  }catch(e){return e?.code==='ER_DUP_ENTRY'?reply({error:'Bu ürün için zaten bekleyen talep var.'},409):reply({error:'Talep kaydedilemedi. SQL kurulumu ve bağlantıyı kontrol edin.'},503)}
 }
 if(data?.action!=='review'||!admin(u))return reply({error:'Yalnız yönetici talebi değerlendirebilir.'},403);
 if(typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id)||!['approved','rejected'].includes(data.decision)||typeof(data.note??'')!=='string'||(data.note||'').length>250)return reply({error:'Karar geçersiz.'},400);
 let conn;
 try{
  conn=await env.MYSQL_POOL.getConnection();await conn.beginTransaction();
  const [rows]=await conn.execute('SELECT * FROM pos_approval_requests WHERE id=? FOR UPDATE',[data.id]);const r=rows[0];
  if(!r||r.status!=='pending'){await conn.rollback();return reply({error:'Bekleyen talep bulunamadı.'},409)}
  const at=new Date().toISOString();
  if(data.decision==='approved'&&['later','initial'].includes(r.kind)){
   const [products]=await conn.execute('SELECT payload FROM product_changes WHERE id=? FOR UPDATE',[r.target]);
   const p=products[0]&&(typeof products[0].payload==='string'?JSON.parse(products[0].payload):products[0].payload);
   if(!p||p.lifecycleStatus!==(r.kind==='later'?'later-inactive':'initial-inactive')||p.fiyatBelirsiz||!Number.isFinite(p.satisFiyati)||p.satisFiyati<=0){await conn.rollback();return reply({error:'Ürün durumu veya fiyatı değişmiş. Önce ürünü yönetici olarak kontrol edin.'},409)}
   await conn.execute("UPDATE product_changes SET payload=JSON_SET(payload,'$.lifecycleStatus','active','$.everActivated',JSON_EXTRACT('true','$'),'$.statusChangedAt',?),updated_at=? WHERE id=?",[at,at,r.target]);
   await conn.execute('INSERT INTO product_audit(product_id,action,happened_at) VALUES(?,?,?)',[r.target,'approval-activate-v125:'+u.id,at]);
  }
  await conn.execute('UPDATE pos_approval_requests SET status=?,pending_key=NULL,reviewer_id=?,reviewed_at=?,note=? WHERE id=?',[data.decision,u.id,at,(data.note||'').trim(),r.id]);
  await conn.commit();return reply({ok:true,activated:data.decision==='approved'&&['later','initial'].includes(r.kind)});
 }catch{if(conn)try{await conn.rollback()}catch{}return reply({error:'Karar kaydedilemedi.'},503)}
 finally{conn?.release()}
}
