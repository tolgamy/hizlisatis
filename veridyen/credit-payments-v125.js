/** Veridyen-only centrally transactional veresiye collections.
 * Customer-row lock serializes concurrent collections and sale charges.
 * Idempotency key prevents repeat charges after ambiguous network errors.
 */
import {randomUUID} from 'node:crypto';
import {currentAccessUser} from '../lib/user-access.js';
import {collect125} from '../lib/rights-v125.js';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(v,s=200)=>Response.json(v,{status:s,headers});
const idOK=id=>typeof id==='string'&&/^[a-zA-Z0-9:_-]{8,120}$/.test(id);
const cents=x=>Math.round((Number(x)+Number.EPSILON)*100);
export async function onRequestPost({request,env}){
  if(env?.CENTRAL_SALES_ENABLED!=='true'||!env.MYSQL_POOL)
    return reply({error:'Merkezi veresiye işlemleri henüz etkin değil.'},503);
  if(request.headers.get('Origin')!==new URL(request.url).origin)
    return reply({error:'İzin verilmeyen kaynak.'},403);
  const user=await currentAccessUser(request,env);
  if(!collect125(user))
    return reply({error:'Tahsilat için müşteri yetkisi gerekiyor.'},403);
  let data,id,customerId,amountCents,payment,notes;
  try{
    if(Number(request.headers.get('content-length')||0)>6000)
      return reply({error:'Tahsilat isteği çok büyük.'},413);
    data=await request.json();
    id=data.id;customerId=data.customerId;
    amountCents=cents(data.amount);
    payment=String(data.payment||'').trim();
    notes=String(data.notes||'').trim();
    if(!idOK(id)||!idOK(customerId)||
       typeof data.amount!=='number'||!Number.isFinite(data.amount)||data.amount<=0||
       !Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>100_000_000_000||
       !payment||payment.length>30||notes.length>500)
      return reply({error:'Tahsilat bilgileri geçersiz.'},400);
  }catch{return reply({error:'Tahsilat verisi geçersiz.'},400);}
  let conn;
  try{
    conn=await env.MYSQL_POOL.getConnection();
    await conn.beginTransaction();
    const [customers]=await conn.execute(
      'SELECT id,opening_debt_cents FROM pos_customers WHERE id=? FOR UPDATE',[customerId]);
    if(!customers.length){
      await conn.rollback();return reply({error:'Müşteri bulunamadı.'},404);
    }
    const [prior]=await conn.execute(
      'SELECT customer_id,action,amount_cents FROM pos_customer_ledger WHERE id=?',[id]);
    if(prior.length){
      await conn.commit();
      return prior[0].customer_id===customerId&&prior[0].action==='collect'&&
        Number(prior[0].amount_cents)===-amountCents?
        reply({ok:true,id,duplicate:true}):
        reply({error:'Tahsilat numarası başka bir işlemin.'},409);
    }
    const [totals]=await conn.execute(
      'SELECT COALESCE(SUM(amount_cents),0) AS debt FROM pos_customer_ledger WHERE customer_id=?',
      [customerId]);
    const balance=Number(customers[0].opening_debt_cents||0)+Number(totals[0]?.debt||0);
    if(amountCents>Math.max(0,balance)){
      await conn.rollback();
      return reply({error:'Tahsilat müşteri borcunu aşıyor.'},409);
    }
    await conn.execute(
      'INSERT INTO pos_customer_ledger (id,customer_id,action,amount_cents,created_at,payment,notes) VALUES (?,?,?,?,?,?,?)',
      [id,customerId,'collect',-amountCents,new Date().toISOString(),payment,notes]);
    await conn.execute('INSERT INTO pos_audit_events(id,actor_id,action,target,happened_at) VALUES(?,?,?,?,?)',[randomUUID(),user.id,'customer-collect',id,new Date().toISOString()]);
    await conn.commit();
    return reply({ok:true,id,duplicate:false,balanceCents:balance-amountCents},201);
  }catch(error){
    if(conn)try{await conn.rollback();}catch{}
    console.error('Central collection:',error?.code||error?.name);
    return reply({error:'Tahsilat durumu doğrulanamadı; aynı işlem numarasıyla tekrar deneyin.'},503);
  }finally{conn?.release();}
}
