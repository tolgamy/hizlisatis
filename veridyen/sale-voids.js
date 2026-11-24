/**
 * Veridyen-only audit-safe cash/test sale cancellation.
 * Receipt remains immutable in pos_sales, never altered or deleted.
 * Non-cash receipts (especially veresiye) are deliberately not cancellable
 * here: they require a separately audited refund/debt-reversal process.
 */
import {currentAccessUser} from '../lib/user-access.js';

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(body,status=200)=>Response.json(body,{status,headers});
const active=env=>env?.CENTRAL_SALES_ENABLED==='true'&&Boolean(env.MYSQL_POOL);
const receiptIdOK=id=>typeof id==='string'&&/^[A-Za-z0-9:_-]{8,100}$/.test(id);

export async function onRequestPost({request,env}){
  if(!active(env))return reply({error:'Merkezi satışlar etkin değil.'},503);
  if(request.headers.get('Origin')!==new URL(request.url).origin)
    return reply({error:'İzin verilmeyen kaynak.'},403);
  const user=await currentAccessUser(request,env);
  if(!user?.active||user.role!=='admin')
    return reply({error:'Satış iptali yalnızca yönetici tarafından yapılabilir.'},403);
  let saleId;
  try{
    if(Number(request.headers.get('content-length')||0)>2000)
      return reply({error:'İstek çok büyük.'},413);
    const input=await request.json();
    saleId=input?.saleId;
    if(!receiptIdOK(saleId)||input?.reason!=='test')
      return reply({error:'İptal fişi veya nedeni geçersiz.'},400);
  }catch{return reply({error:'İptal isteği okunamadı.'},400);}
  let conn;
  try{
    conn=await env.MYSQL_POOL.getConnection();
    await conn.beginTransaction();
    const [rows]=await conn.execute(
      'SELECT id,payment,total_cents FROM pos_sales WHERE id=? FOR UPDATE',[saleId]);
    const sale=rows[0];
    if(!sale){
      await conn.rollback();
      return reply({error:'Satış fişi bulunamadı.'},404);
    }
    if(sale.payment!=='Nakit'){
      await conn.rollback();
      return reply({error:'Bu özellik yalnızca nakit test satışını iptal edebilir; veresiye veya kart fişine dokunulmadı.'},409);
    }
    const [previous]=await conn.execute(
      'SELECT sale_id FROM pos_sale_voids WHERE sale_id=?',[saleId]);
    if(previous.length){
      await conn.commit();
      return reply({ok:true,saleId,duplicate:true});
    }
    await conn.execute(
      'INSERT INTO pos_sale_voids (sale_id,voided_at,actor_id,reason) VALUES (?,?,?,?)',
      [saleId,new Date().toISOString(),user.id,'Test satışı']);
    await conn.commit();
    return reply({ok:true,saleId,duplicate:false},201);
  }catch(error){
    if(conn)try{await conn.rollback();}catch{}
    console.error('Central cash sale void:',error?.code||error?.name);
    return reply({error:'İptal kaydedilemedi. Veritabanındaki iptal durumunu kontrol edin; aynı fiş için tekrar işlemi zorlamayın.'},503);
  }finally{conn?.release();}
}
