/**
 * Audited full-receipt cancellation on Veridyen / MariaDB.
 * The receipt in pos_sales remains immutable.
 * Cash: void record excludes it from reporting.
 * Veresiye: the same transaction also appends an equal and opposite ledger entry.
 * External payment methods need provider refunds and are NOT voidable here.
 */
import {currentAccessUser} from '../lib/user-access.js';

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(body,status=200)=>Response.json(body,{status,headers});
const active=env=>env?.CENTRAL_SALES_ENABLED==='true'&&Boolean(env.MYSQL_POOL);
const receiptIdOK=id=>typeof id==='string'&&/^[A-Za-z0-9:_-]{8,100}$/.test(id);
const reasons={
  wrong:'Hatalı satış',
  returned:'Tam ürün iadesi',
  test:'Test işlemi',
  other:'Diğer satış iptali'
};

export async function onRequestPost({request,env}){
  if(!active(env))return reply({error:'Merkezi satışlar etkin değil.'},503);
  if(request.headers.get('Origin')!==new URL(request.url).origin)
    return reply({error:'İzin verilmeyen kaynak.'},403);
  const user=await currentAccessUser(request,env);
  if(!user?.active||user.role!=='admin')
    return reply({error:'Satış iptali yalnızca yönetici tarafından yapılabilir.'},403);
  let saleId,reason;
  try{
    if(Number(request.headers.get('content-length')||0)>2000)
      return reply({error:'İstek çok büyük.'},413);
    const input=await request.json();
    saleId=input?.saleId;
    reason=input?.reason;
    if(!receiptIdOK(saleId)||typeof reason!=='string'||
      !Object.hasOwn(reasons,reason))
      return reply({error:'İptal fişi veya nedeni geçersiz.'},400);
  }catch{return reply({error:'İptal isteği okunamadı.'},400);}
  let conn;
  try{
    conn=await env.MYSQL_POOL.getConnection();
    await conn.beginTransaction();
    const [rows]=await conn.execute(
      'SELECT id,payment,total_cents,customer_id FROM pos_sales WHERE id=? FOR UPDATE',[saleId]);
    const sale=rows[0];
    if(!sale){
      await conn.rollback();
      return reply({error:'Satış fişi bulunamadı.'},404);
    }
    // Check BEFORE the credit ledger balance: an uncertain retry is idempotent.
    const [previous]=await conn.execute(
      'SELECT sale_id FROM pos_sale_voids WHERE sale_id=?',[saleId]);
    if(previous.length){
      await conn.commit();
      return reply({ok:true,saleId,duplicate:true});
    }
    if(!['Nakit','Veresiye'].includes(sale.payment)){
      await conn.rollback();
      return reply({error:'Kart, banka ve diğer ödemeler için harici iade doğrulanmadan satış iptal edilemez.'},409);
    }
    if(sale.payment==='Veresiye'){
      if(!receiptIdOK(sale.customer_id)){
        await conn.rollback();return reply({error:'Veresiye fişinin müşterisi doğrulanamadı.'},409);
      }
      // Synchronize with credit collections and new charges.
      const [customers]=await conn.execute(
        'SELECT id,opening_debt_cents FROM pos_customers WHERE id=? FOR UPDATE',
        [sale.customer_id]);
      if(!customers.length){
        await conn.rollback();return reply({error:'Veresiye müşterisi bulunamadı.'},409);
      }
      const [original]=await conn.execute(
        'SELECT customer_id,action,amount_cents FROM pos_customer_ledger WHERE id=?',
        [saleId]);
      if(original.length!==1||original[0].customer_id!==sale.customer_id||
        original[0].action!=='sale'||
        Number(original[0].amount_cents)!==Number(sale.total_cents)){
        await conn.rollback();
        return reply({error:'Orijinal veresiye borç hareketi fişle eşleşmiyor; iptal yapılmadı.'},409);
      }
      const [balanceRows]=await conn.execute(
        'SELECT COALESCE(SUM(amount_cents),0) AS debt FROM pos_customer_ledger WHERE customer_id=?',
        [sale.customer_id]);
      const balance=Number(customers[0].opening_debt_cents||0)+
        Number(balanceRows[0]?.debt||0);
      if(!Number.isSafeInteger(balance)||balance<Number(sale.total_cents)){
        await conn.rollback();
        return reply({error:'Bu veresiye fişinin borcu tahsil edilmiş olabilir. Önce tahsilatı inceleyin; otomatik iptal yapılmadı.'},409);
      }
      // Same InnoDB transaction as pos_sale_voids below.
      await conn.execute(
        'INSERT INTO pos_customer_ledger (id,customer_id,action,amount_cents,created_at,payment,notes) VALUES (?,?,?,?,?,?,?)',
        ['void:'+saleId,sale.customer_id,'void',-Number(sale.total_cents),
          new Date().toISOString(),'Veresiye','Fiş iptali: '+saleId.slice(0,12)]);
    }
    await conn.execute(
      'INSERT INTO pos_sale_voids (sale_id,voided_at,actor_id,reason) VALUES (?,?,?,?)',
      [saleId,new Date().toISOString(),user.id,reasons[reason]]);
    await conn.commit();
    return reply({ok:true,saleId,duplicate:false},201);
  }catch(error){
    if(conn)try{await conn.rollback();}catch{}
    console.error('Central sale cancellation:',error?.code||error?.name);
    return reply({error:'İptalin durumu doğrulanamadı. İşlemi yeniden göndermeden önce fişi kontrol edin.'},503);
  }finally{conn?.release();}
}
