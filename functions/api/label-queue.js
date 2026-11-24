import {authorizedAdmin} from '../../lib/admin-auth.js';
const prefix='label_queue:';
const json=(data,status=200)=>Response.json({...data,queueVersion:97},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const idOk=id=>typeof id==='string'&&id.length>0&&id.length<=180;
const countOk=n=>Number.isInteger(n)&&n>=1&&n<=20;
const tokenOk=t=>typeof t==='string'&&/^[a-f0-9-]{36}$/.test(t);
const key=id=>prefix+id;
function cleanProduct(row){
  if(!row)return null;
  const p=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;
  return {id:p.id,baslik:p.baslik,barkod:p.barkod,urunKodu:p.urunKodu,satisFiyati:p.satisFiyati,fiyatBelirsiz:p.fiyatBelirsiz,birim:p.birim,kdv:p.kdv,mensei:p.mensei,menşei:p.menşei,lifecycleStatus:p.lifecycleStatus};
}
function validProduct(p){return p&&p.lifecycleStatus!=='deleted'&&!p.fiyatBelirsiz&&typeof p.satisFiyati==='number'&&Number.isFinite(p.satisFiyati)&&p.satisFiyati>=0&&String(p.barkod||p.urunKodu||'').trim();}
async function readEntry(db,id){const row=await db.prepare('SELECT value FROM app_meta WHERE key=?').bind(key(id)).first();return row?JSON.parse(row.value):null;}
async function product(db,id){return cleanProduct(await db.prepare('SELECT payload FROM product_changes WHERE id=?').bind(id).first());}
export async function labelQueueRequest({request,env}){
  const db=env?.DB;
  if(!db)return json({error:'Merkezi bağlantı yok.'},503);
  try{
    if(!await authorizedAdmin(request,env,'products')&&!await authorizedAdmin(request,env,'sales'))return json({error:'Ürün veya satış yetkisi gerekli.'},403);
    if(request.method==='GET'){
      const rows=await db.prepare('SELECT key,value FROM app_meta WHERE key LIKE ? ORDER BY key').bind(prefix+'%').all();
      const entries=(rows.results||[]).filter(r=>String(r.key).startsWith(prefix)).map(r=>JSON.parse(r.value));
      const products=[];
      for(let i=0;i<entries.length;i+=40){
        const ids=entries.slice(i,i+40).map(x=>x.id);
        const found=await db.prepare('SELECT payload FROM product_changes WHERE id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all();
        products.push(...(found.results||[]).map(cleanProduct));
      }
      const byId=new Map(products.map(p=>[p.id,p]));
      return json({items:entries.sort((a,b)=>a.at.localeCompare(b.at)).map(e=>({...e,product:byId.get(e.id)||null}))});
    }
    if(request.method!=='POST')return json({error:'Yöntem geçersiz.'},405);
    const raw=await request.text();if(raw.length>20000)return json({error:'İstek çok büyük.'},413);
    let b;try{b=JSON.parse(raw)}catch{return json({error:'Geçersiz istek.'},400)}
    if(b?.action==='add'){
      if(!idOk(b.id)||!countOk(b.count))return json({error:'Ürün veya adet geçersiz.'},400);
      if(!validProduct(await product(db,b.id)))return json({error:'Ürün veya güncel fiyat geçersiz.'},409);
      const entry={id:b.id,count:b.count,version:crypto.randomUUID(),at:new Date().toISOString()};
      const value=JSON.stringify(entry);
      if(env.MYSQL_POOL){await env.MYSQL_POOL.execute('INSERT INTO app_meta (`key`, `value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)',[key(b.id),value]);}
      else await db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key(b.id),value).run();
      const saved=await readEntry(db,b.id);if(saved?.version!==entry.version)return json({error:'Merkezi kayıt doğrulanamadı; tekrar deneyin.'},409);
      return json({ok:true,entry});
    }
    if(b?.action==='set'||b?.action==='remove'){
      if(!idOk(b.id)||!tokenOk(b.version)||(b.action==='set'&&!countOk(b.count)))return json({error:'Geçersiz kayıt.'},400);
      const old=await readEntry(db,b.id);
      if(!old||old.version!==b.version)return json({error:'Liste değişti, yenileyin.'},409);
      const oldRaw=JSON.stringify(old);
      const statement=b.action==='remove'?db.prepare('DELETE FROM app_meta WHERE key=? AND value=?').bind(key(b.id),oldRaw):db.prepare('UPDATE app_meta SET value=? WHERE key=? AND value=?').bind(JSON.stringify({...old,count:b.count,version:crypto.randomUUID()}),key(b.id),oldRaw);
      const r=await statement.run();
      return Number(r.meta?.changes)===1?json({ok:true}):json({error:'Liste değişti, yenileyin.'},409);
    }
    if(b?.action==='confirm'){
      const items=b.items;
      if(!Array.isArray(items)||!items.length||items.length>20||items.some(x=>!idOk(x?.id)||!tokenOk(x.version)||!countOk(x.count))||new Set(items.map(x=>x.id)).size!==items.length||items.reduce((n,x)=>n+x.count,0)>20)return json({error:'Bir baskı en fazla 20 etikettir.'},400);
      const statements=[];
      for(const x of items){
        const old=await readEntry(db,x.id);
        if(old&&old.version===x.version&&old.count===x.count){
          const p=await product(db,x.id);
          if(p&&JSON.stringify(p)===x.productSignature)statements.push(db.prepare('DELETE FROM app_meta WHERE key=? AND value=?').bind(key(x.id),JSON.stringify(old)));
        }
      }
      const results=statements.length?await db.batch(statements):[];
      return json({ok:true,removed:results.reduce((n,r)=>n+Number(r.meta?.changes||0),0)});
    }
    return json({error:'Bilinmeyen işlem.'},400);
  }catch(e){console.error('Label queue v97 failure',e?.code||e?.name||'Error');return json({error:'Merkezi etiket listesi işlemi tamamlanamadı. Sunucu bağlantısını ve v97 kurulumunu kontrol edin.'},503);}
}
