/**
 * Veridyen-only central receipts. POST commits receipt and credit debt in ONE
 * InnoDB transaction, with immutable receipt IDs for safe network retries.
 * Does not run on Cloudflare Pages and is disabled without an explicit flag.
 */
import {createHash} from 'node:crypto';
import {currentAccessUser,hasPermission} from '../lib/user-access.js';
import {validateCentralReceipt} from './sales-validation.js';
import {credit125,reportScope125,payment125,dailyScope125,fine125} from '../lib/rights-v125.js';

const h={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200)=>Response.json(data,{status,headers:h});
const active=env=>env?.CENTRAL_SALES_ENABLED==='true'&&Boolean(env?.MYSQL_POOL);
const originOK=request=>{
  const origin=request.headers.get('Origin');
  try{return origin===new URL(request.url).origin;}catch{return false;}
};
async function dbUser(request,env,permission){
  const user=await currentAccessUser(request,env);
  return hasPermission(user,permission)?user:null;
}
async function existingReceipt(conn,id){
  const [rows]=await conn.execute('SELECT payload_hash,cashier_id FROM pos_sales WHERE id=? FOR UPDATE',[id]);
  return rows[0]||null;
}
async function verifyProducts(conn,record,ids,user){
  const marks=ids.map(()=>'?').join(',');
  const [rows]=await conn.execute(
    'SELECT id,payload FROM product_changes WHERE id IN ('+marks+')',ids);
  const products=new Map();
  for(const row of rows){
    const item=JSON.parse(row.payload);
    products.set(row.id,item);
  }
  for(const line of record.items){
    const p=products.get(line.id);
    if(!p)throw Object.assign(Error('Fişteki ürün merkezi katalogda bulunamadı.'),{status:409});
    if((p.lifecycleStatus||'active')!=='active')
      throw Object.assign(Error('Ürün artık aktif değil.'),{status:409});
    if(p.fiyatBelirsiz||!Number.isFinite(p.satisFiyati)||p.satisFiyati<0)
      throw Error('Merkezi ürün fiyatı geçersiz.');
    if(['kg','g','litre'].includes(p.birim)&&!fine125(user,'sale.weight','sales'))
      throw Object.assign(Error('Tartılı satış yetkiniz yok.'),{status:403});
    if(Math.abs(line.unitPrice-p.satisFiyati)>0.011&&!fine125(user,'sale.price','discounts'))
      throw Object.assign(Error('Fiyat değiştirme yetkiniz yok.'),{status:403});
  }
}
async function lockCreditCustomer(conn,customerId,totalCents){
  const [rows]=await conn.execute(
    'SELECT id,opening_debt_cents,credit_limit_cents FROM pos_customers WHERE id=? FOR UPDATE',
    [customerId]);
  const customer=rows[0];
  if(!customer)throw Object.assign(Error('Veresiye müşterisi bulunamadı.'),{status:404});
  const [balances]=await conn.execute(
    'SELECT COALESCE(SUM(amount_cents),0) AS debt FROM pos_customer_ledger WHERE customer_id=?',
    [customerId]);
  const before=Number(customer.opening_debt_cents||0)+Number(balances[0]?.debt||0);
  const limit=Number(customer.credit_limit_cents||0);
  if(limit>0&&before+totalCents>limit)
    throw Object.assign(Error('Müşterinin veresiye limiti aşılıyor.'),{status:409});
}
export async function onRequestGet({request,env}){
  const url=new URL(request.url);
  if(url.searchParams.has('status'))
    return reply({enabled:active(env)});
  if(!active(env))return reply({error:'Merkezi satışlar henüz etkin değil.'},503);
  const user=await currentAccessUser(request,env),scope=reportScope125(user);
  if(url.searchParams.has('stock')){
    if(!user)return reply({error:'Stok sorgusu için oturum gerekli.'},403);
    try{
      const [rows]=await env.MYSQL_POOL.execute(
        'SELECT m.product_id AS id,SUM(m.quantity) AS soldQuantity FROM pos_stock_movements m LEFT JOIN pos_sale_voids v ON v.sale_id=m.sale_id WHERE v.sale_id IS NULL GROUP BY m.product_id');
      return reply({adjustments:rows.map(row=>({id:row.id,soldQuantity:Number(row.soldQuantity)}))});
    }catch{return reply({error:'Merkezi stok hareketleri okunamadı.'},503);}
  }
  if(url.searchParams.has('daily')){
    const daily=dailyScope125(user);if(!daily)return reply({error:'Günlük ciro yetkisi gerekli.'},403);
    try{
      const day=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
      const start=new Date(day+'T00:00:00+03:00').toISOString(),end=new Date(Date.parse(start)+86400000).toISOString();
      const [rows]=await env.MYSQL_POOL.execute('SELECT COALESCE(SUM(s.total_cents),0) AS amount,COUNT(*) AS count FROM pos_sales s LEFT JOIN pos_sale_voids v ON v.sale_id=s.id WHERE v.sale_id IS NULL AND s.currency=? AND s.created_at>=? AND s.created_at<?'+(daily==='own'?' AND s.cashier_id=?':''),['TRY',start,end,...(daily==='own'?[user.id]:[])]);
      return reply({scope:daily,day,totalCents:Number(rows[0]?.amount||0),count:Number(rows[0]?.count||0)});
    }catch{return reply({error:'Günlük ciro okunamadı.'},503)}
  }
  if(!scope)return reply({error:'Rapor görüntüleme yetkisi gerekli.'},403);
  const rawOffset=url.searchParams.get('offset')||'0';
  if(!/^\d{1,6}$/.test(rawOffset)||Number(rawOffset)>50000)
    return reply({error:'Sayfalama geçersiz.'},400);
  const offset=Number(rawOffset),limit=url.searchParams.has('recent')?5:200;
  try{
    const where=scope==='all'?'':scope==='other'?' WHERE s.cashier_id<>?':' WHERE s.cashier_id=?';
    const args=scope==='all'?[]:[user.id];
    const [rows]=await env.MYSQL_POOL.execute(
      'SELECT s.payload,s.cashier_id,v.sale_id AS voided_id,v.voided_at,v.reason AS void_reason FROM pos_sales s LEFT JOIN pos_sale_voids v ON v.sale_id=s.id'+where+' ORDER BY s.created_at DESC,s.id DESC LIMIT ? OFFSET ?',
      [...args,limit,offset]);
    const receipts=rows.map(row=>({...JSON.parse(row.payload),cashierId:row.cashier_id,voided:Boolean(row.voided_id),
      voidedAt:row.voided_at||'',voidReason:row.void_reason||''}));
    return reply({sales:receipts,scope,next:rows.length===limit?offset+limit:null});
  }catch(error){
    console.error('Central sales listing:',error?.code||error?.name);
    return reply({error:'Merkezi satış geçmişi okunamadı.'},503);
  }
}
export async function onRequestPost({request,env}){
  if(!active(env))return reply({error:'Merkezi satış henüz etkin değil.'},503);
  if(!originOK(request))return reply({error:'İzin verilmeyen kaynak.'},403);
  const user=await dbUser(request,env,'sales');
  if(!user)return reply({error:'Satış yetkisi veya oturum gerekli.'},403);
  let input,record,details,payload,hash;
  try{
    const size=Number(request.headers.get('content-length')||0);
    if(size>250000)return reply({error:'Fiş çok büyük.'},413);
    input=await request.json();
    record=input?.record;
    details=validateCentralReceipt(record);
    if(record.cashierId!==undefined&&record.cashierId!==user.id)
      return reply({error:'Fiş başka bir kasiyer oturumuna ait.'},403);
    if(record.items.some(({quantity})=>Math.abs(quantity*1000-Math.round(quantity*1000))>0.000001))
      return reply({error:'Stok miktarında en fazla üç ondalık basamak kullanılabilir.'},400);
    if(details.discounted&&!fine125(user,'sale.discount','discounts'))
      return reply({error:'İndirim yetkisi gerekli.'},403);
    if(!payment125(user,record.payment))return reply({error:'Ödeme yöntemi için yetkiniz yok.'},403);
    if(details.credit&&!credit125(user))
      return reply({error:'Veresiye yetkisi gerekli.'},403);
    payload=JSON.stringify(record);
    if(Buffer.byteLength(payload,'utf8')>200000)
      return reply({error:'Fiş çok büyük.'},413);
    hash=createHash('sha256').update(payload).digest('hex');
  }catch(error){return reply({error:error?.message||'Fiş geçersiz.'},400);}
  let conn;
  try{
    conn=await env.MYSQL_POOL.getConnection();
    await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await conn.beginTransaction();
    // Check idempotency BEFORE credit limit: retrying an already accepted
    // credit sale must not fail because the customer balance later changed.
    const before=await existingReceipt(conn,record.id);
    if(before){
      await conn.commit();
      return before.payload_hash===hash&&before.cashier_id===user.id?
        reply({ok:true,id:record.id,duplicate:true}):
        reply({error:'Fiş numarası başka bir satışta kullanılmış.'},409);
    }
    // Serialize credit limits across devices using the customer row lock.
    // Re-check the receipt after acquiring it to handle concurrent retries.
    if(details.credit){
      await lockCreditCustomer(conn,details.customerId,details.totalCents);
      const concurrent=await existingReceipt(conn,record.id);
      if(concurrent){
        await conn.commit();
        return concurrent.payload_hash===hash&&concurrent.cashier_id===user.id?
          reply({ok:true,id:record.id,duplicate:true}):
          reply({error:'Fiş numarası başka bir satışta kullanılmış.'},409);
      }
    }
    await verifyProducts(conn,record,details.ids,user);
    await conn.execute(
      'INSERT INTO pos_sales (id,created_at,payment,currency,total_cents,customer_id,cashier_id,payload,payload_hash) VALUES (?,?,?,?,?,?,?,?,?)',
      [record.id,record.createdAt,record.payment,record.currency,details.totalCents,
        details.customerId,user.id,payload,hash]);
    if(details.credit){
      await conn.execute(
        'INSERT INTO pos_customer_ledger (id,customer_id,action,amount_cents,created_at,payment,notes) VALUES (?,?,?,?,?,?,?)',
        [record.id,details.customerId,'sale',details.totalCents,record.createdAt,'Veresiye',
          'Fiş: '+record.id.slice(0,12)]);
    }
    const movements=new Map();
    for(const {id,quantity} of record.items)
      movements.set(id,(movements.get(id)||0)+Math.round(quantity*1000));
    await conn.query(
      'INSERT INTO pos_stock_movements (sale_id,product_id,quantity) VALUES ?',
      [[...movements].map(([id,milliunits])=>[record.id,id,milliunits/1000])]);
    await conn.commit();
    return reply({ok:true,id:record.id,duplicate:false},201);
  }catch(error){
    if(conn)try{await conn.rollback();}catch{}
    // A simultaneous identical retry may have committed first.
    if(error?.code==='ER_DUP_ENTRY'&&conn){
      try{
        const [rows]=await conn.execute('SELECT payload_hash,cashier_id FROM pos_sales WHERE id=?',[record.id]);
        if(rows[0])return rows[0].payload_hash===hash&&rows[0].cashier_id===user.id?
          reply({ok:true,id:record.id,duplicate:true}):
          reply({error:'Fiş numarası başka bir satışta kullanılmış.'},409);
      }catch{}
    }
    console.error('Central sales write:',error?.code||error?.name);
    return reply({error:error?.status?error.message:'Merkezi fiş kaydedilemedi; aynı fiş numarasıyla tekrar deneyin.'},
      error?.status||503);
  }finally{conn?.release();}
}
