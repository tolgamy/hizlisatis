/** D1 customer accounts and veresiye ledger. All routes require the same
 * signed admin session as D1 product writes. Product tables are untouched.
 */
import {authorizedAdmin} from '../../lib/admin-auth.js';
const h={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const ok=(data,status=200)=>Response.json(data,{status,headers:h});
const fail=(message,status=400)=>ok({error:message},status);
const trim=(v,max=250)=>String(v??'').trim().slice(0,max);
const digits=v=>String(v??'').replace(/\D/g,'');
const phoneKey=v=>{
  const number=digits(v);
  if(number.length<10||number.length>15)return '';
  return number.length===10||number.length===11||number.startsWith('90') ? number.slice(-10) : number;
};
const cents=v=>Math.round(Number(v)*100);
const validMoney=v=>Number.isFinite(Number(v))&&Number(v)>=0&&cents(v)<=100000000000;
const dbFor=env=>env?.DB?.prepare?env.DB:null;
async function ensure(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS pos_customers(
      id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL,
      phone_key TEXT NOT NULL UNIQUE,address TEXT NOT NULL DEFAULT '',
      tax_office TEXT NOT NULL DEFAULT '',tax_number TEXT NOT NULL DEFAULT '',
      credit_limit_cents INTEGER NOT NULL DEFAULT 0,
      opening_debt_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pos_customer_ledger(
      id TEXT PRIMARY KEY,customer_id TEXT NOT NULL,action TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,created_at TEXT NOT NULL,
      payment TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(customer_id) REFERENCES pos_customers(id))`)
  ]);
}
async function balance(db,id) {
  const row=await db.prepare(`SELECT c.opening_debt_cents+
    COALESCE((SELECT SUM(amount_cents) FROM pos_customer_ledger WHERE customer_id=c.id),0) AS debt
    FROM pos_customers c WHERE id=?`).bind(id).first();
  return row ? Number(row.debt||0) : null;
}
export async function onRequestGet({request,env}) {
  const db=dbFor(env);if(!db)return fail('Müşteri veritabanı bağlı değil.',503);
  if(!await authorizedAdmin(request,env,'customers'))return fail('Yönetim oturumu gerekli.',401);
  try {
    await ensure(db);
    const url=new URL(request.url),id=url.searchParams.get('customer');
    if(id){
      if(id.length>120)return fail('Müşteri kodu geçersiz.');
      const rows=await db.prepare(`SELECT id,action,amount_cents,created_at,payment,notes
        FROM pos_customer_ledger WHERE customer_id=? ORDER BY created_at DESC LIMIT 400`).bind(id).all();
      return ok({entries:rows.results||[],balanceCents:await balance(db,id)});
    }
    const rows=await db.prepare(`SELECT c.*,
      (c.opening_debt_cents+COALESCE((SELECT SUM(amount_cents) FROM pos_customer_ledger
        WHERE customer_id=c.id),0)) AS balance_cents
      FROM pos_customers c ORDER BY c.name COLLATE NOCASE LIMIT 5000`).all();
    return ok({customers:rows.results||[]});
  } catch{return fail('Müşteri kayıtları okunamadı.',503);}
}
export async function onRequestPost({request,env}) {
  const db=dbFor(env);if(!db)return fail('Müşteri veritabanı bağlı değil.',503);
  if(!await authorizedAdmin(request,env,'customers'))return fail('Yönetim oturumu gerekli.',401);
  let data;try{data=await request.json();}catch{return fail('Geçersiz veri.');}
  try {
    await ensure(db);
    const action=data?.action;
    if(action==='upsert') {
      const p=data.customer||{},name=trim(p.name,150),phone=trim(p.phone,25),key=phoneKey(phone);
      if(!name||!key)return fail('Ad/işletme adı ve geçerli telefon zorunludur.');
      if(!validMoney(p.creditLimit||0)||!validMoney(p.openingDebt||0))
        return fail('Limit veya açılış borcu geçersiz.');
      const id=trim(p.id,120)||crypto.randomUUID();
      if(!/^[a-zA-Z0-9:_-]{8,120}$/.test(id))return fail('Müşteri kodu geçersiz.');
      const before=await db.prepare('SELECT id FROM pos_customers WHERE id=?').bind(id).first();
      if(before){
        await db.prepare(`UPDATE pos_customers SET name=?,phone=?,phone_key=?,address=?,tax_office=?,
          tax_number=?,credit_limit_cents=?,opening_debt_cents=?,notes=?,updated_at=? WHERE id=?`)
          .bind(name,phone,key,trim(p.address,500),trim(p.taxOffice,100),trim(p.taxNumber,20),
            cents(p.creditLimit||0),cents(p.openingDebt||0),trim(p.notes,500),new Date().toISOString(),id).run();
      }else{
        const now=new Date().toISOString();
        await db.prepare(`INSERT INTO pos_customers
          (id,name,phone,phone_key,address,tax_office,tax_number,
            credit_limit_cents,opening_debt_cents,notes,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id,name,phone,key,trim(p.address,500),trim(p.taxOffice,100),trim(p.taxNumber,20),
            cents(p.creditLimit||0),cents(p.openingDebt||0),trim(p.notes,500),now,now).run();
      }
      return ok({ok:true,id});
    }
    if(action==='sale'||action==='collect') {
      const id=trim(data.customerId,120),ref=trim(data.id,120),amount=Number(data.amount);
      if(!id||!/^[a-zA-Z0-9:_-]{8,120}$/.test(ref)||!validMoney(amount)||amount===0)
        return fail('Müşteri, işlem kodu veya tutar geçersiz.');
      const customer=await db.prepare('SELECT credit_limit_cents FROM pos_customers WHERE id=?').bind(id).first();
      if(!customer)return fail('Kayıtlı müşteri bulunamadı.',404);
      const existing=await db.prepare('SELECT customer_id,action,amount_cents FROM pos_customer_ledger WHERE id=?')
        .bind(ref).first();
      const value=cents(amount);
      if(existing){
        if(existing.customer_id!==id||existing.action!==action||existing.amount_cents!==(action==='sale'?value:-value))
          return fail('İşlem kodu başka bir işleme ait.',409);
        return ok({ok:true,duplicate:true,balanceCents:await balance(db,id)});
      }
      const debt=await balance(db,id);
      if(action==='sale'&&Number(customer.credit_limit_cents)>0&&debt+value>Number(customer.credit_limit_cents))
        return fail('Müşterinin veresiye limiti aşılıyor.',409);
      if(action==='collect'&&value>Math.max(0,debt))return fail('Tahsilat mevcut borcu aşıyor.',409);
      await db.prepare(`INSERT INTO pos_customer_ledger
        (id,customer_id,action,amount_cents,created_at,payment,notes) VALUES(?,?,?,?,?,?,?)`)
        .bind(ref,id,action,action==='sale'?value:-value,
          new Date().toISOString(),action==='collect'?trim(data.payment,30):'Veresiye',
          trim(data.notes,500)).run();
      return ok({ok:true,balanceCents:await balance(db,id)});
    }
    return fail('Bilinmeyen müşteri işlemi.');
  }catch(error){
    if(/UNIQUE constraint/i.test(String(error?.message||'')))return fail('Telefon numarası başka müşteriye kayıtlı.',409);
    return fail('Müşteri işlemi tamamlanamadı.',503);
  }
}
