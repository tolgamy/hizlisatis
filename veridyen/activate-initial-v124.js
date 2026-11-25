import {currentAccessUser,hasPermission} from '../lib/user-access.js';
import {decodePermissions} from '../lib/permissions-v121.js';
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function canActivateInitial124(user){
 return Boolean(user?.active&&(user.role==='admin'||(user.role==='cashier'&&hasPermission(user,'sales')&&decodePermissions(user.permissions).profile?.includes('product.activate.initial'))));
}
export function activationPlan124(product,id){
 if(!product||product.id!==id)return {status:404,error:'Kayıtlı ürün bulunamadı.'};
 if(product.lifecycleStatus!=='initial-inactive'||product.everActivated===true||product.everActivated===1||product.everActivated==='true'||product.everActivated==='1')return {status:409,error:'Ürün ana pasif durumda değil. Yönetici kontrolü gerekli.'};
 if(product.fiyatBelirsiz||typeof product.satisFiyati!=='number'||!Number.isFinite(product.satisFiyati)||product.satisFiyati<=0)return {status:409,error:'Geçerli satış fiyatı yok. Yönetici fiyat belirlemelidir.'};
 return {status:200};
}
export async function onRequestPost({request,env}){
 const user=await currentAccessUser(request,env);
 if(!canActivateInitial124(user))return reply({error:'Ana pasif ürün aktifleştirme yetkiniz yok.'},403);
 if(!env.MYSQL_POOL)return reply({error:'Merkezi bağlantı gerekli.'},503);
 if(Number(request.headers.get('content-length')||0)>1024)return reply({error:'İstek çok büyük.'},413);
 let body;try{body=await request.json()}catch{return reply({error:'Geçersiz istek.'},400)}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||typeof body.id!=='string'||!body.id.trim()||body.id.length>180)return reply({error:'Yalnız kayıtlı ürün kimliği gönderilebilir.'},400);
 let conn;
 try{
  conn=await env.MYSQL_POOL.getConnection();await conn.beginTransaction();
  const [rows]=await conn.execute('SELECT id,payload FROM product_changes WHERE id=? FOR UPDATE',[body.id]);
  if(!rows.length){await conn.rollback();return reply({error:'Kayıtlı ürün bulunamadı.'},404)}
  const old=typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload;
  const result=activationPlan124(old,body.id);
  if(result.status!==200){await conn.rollback();return reply({error:result.error},result.status)}
  const at=new Date().toISOString();
  const [updated]=await conn.execute("UPDATE product_changes SET payload=JSON_SET(payload,'$.lifecycleStatus','active','$.everActivated',JSON_EXTRACT('true','$'),'$.statusChangedAt',?),updated_at=? WHERE id=?",[at,at,body.id]);
  if(updated.affectedRows!==1)throw Error('update');
  await conn.execute('INSERT INTO product_audit(product_id,action,happened_at) VALUES(?,?,?)',[body.id,'activate-initial-v124:'+user.id,at]);
  await conn.commit();return reply({ok:true,id:body.id,status:'active'});
 }catch(e){if(conn)try{await conn.rollback()}catch{};return reply({error:'Merkezi aktifleştirme doğrulanamadı. Ürünü yeniden sorgulayın.'},503)}
 finally{conn?.release()}
}
