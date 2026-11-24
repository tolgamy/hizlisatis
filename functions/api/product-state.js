import {labelQueueRequest} from './label-queue.js';
import {authorizedAdmin} from '../../lib/admin-auth.js';
/** Cloudflare Pages + D1 authoritative product changes.
 * Static bundled catalogue is a read-only baseline; all edits and status
 * changes live in D1. No browser storage is used as server-side authority.
 */
const VALID_STATUS = new Set(['active','initial-inactive','later-inactive','deleted']);
const headers = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
function json(data, status=200) {
  return Response.json(data, {status, headers});
}
function error(message, status=400) { return json({error:message},status); }
function database(env) { return env?.DB?.prepare ? env.DB : null; }

function validateProduct(product) {
  if(!product || typeof product!=='object' || Array.isArray(product)) throw Error('Ürün kaydı geçersiz.');
  if(typeof product.id!=='string'||!product.id.trim()||product.id.length>180) throw Error('Ürün kimliği geçersiz.');
  if(typeof product.baslik!=='string'||!product.baslik.trim()||product.baslik.length>450) throw Error('Ürün adı geçersiz.');
  if(typeof product.barkod!=='string'||product.barkod.length>100) throw Error('Barkod geçersiz.');
  const status=product.lifecycleStatus||'active';
  if(!VALID_STATUS.has(status)) throw Error('Ürün durumu geçersiz.');
  if(!Number.isFinite(product.satisFiyati)||product.satisFiyati<0) throw Error('Fiyat geçersiz.');
  if(product.kdv!==undefined && ![0,1,10,20].includes(Number(product.kdv))) throw Error('KDV oranı geçersiz.');
  if(typeof product.gorsel==='string'&&product.gorsel.length>350000) throw Error('Görsel çok büyük.');
  return {...product, lifecycleStatus:status, everActivated:Boolean(product.everActivated),
    statusChangedAt: new Date().toISOString()};
}
function productStatement(db, product) {
  const saved=validateProduct(product);
  return { saved, statement:db.prepare(
    `INSERT INTO product_changes(id,barcode,payload,updated_at) VALUES(?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET barcode=excluded.barcode,
       payload=excluded.payload, updated_at=excluded.updated_at`
  ).bind(saved.id,saved.barkod,JSON.stringify(saved),saved.statusChangedAt) };
}
export async function onRequestGet({request,env}) {
  if(new URL(request.url).searchParams.has('labelQueue'))return labelQueueRequest({request,env});
  const db=database(env);
  if(!db) return error('D1 veritabanı bağlı değil. DB binding gerekli.',503);
  try {
    const seeded=await db.prepare("SELECT value FROM app_meta WHERE key='catalog_seed_count'").first();
    if(!seeded || Number(seeded.value)!==19096)
      return error('Merkezi katalog D1 üzerine yüklenmemiş. 19.096 ürün seed dosyalarını tamamlayın.',503);
    const url=new URL(request.url);
    if(url.searchParams.has('health')) {
      const row=await db.prepare('SELECT COUNT(*) AS count FROM product_changes').first();
      return json({ready:true,count:Number(row?.count||0),
        baseline:19096,central:true});
    }
    if(url.searchParams.has('ids')) {
      let ids;
      try {ids=JSON.parse(url.searchParams.get('ids'));}
      catch {return error('Geçersiz ürün kimlikleri.');}
      if(!Array.isArray(ids)||ids.length<1||ids.length>60||
          ids.some(id=>typeof id!=='string'||!id||id.length>180))
        return error('Geçersiz ürün kimlikleri.');
      const placeholders=ids.map(()=>'?').join(',');
      const [rows,meta]=await Promise.all([
        db.prepare('SELECT id,payload FROM product_changes WHERE id IN ('+placeholders+')')
          .bind(...ids).all(),
        db.prepare("SELECT value FROM app_meta WHERE key='bulk_at'").first()
      ]);
      return json({products:(rows.results||[]).map(row=>JSON.parse(row.payload)),
        bulkAt:meta?.value||null});
    }
    const cursor=url.searchParams.get('after')||'';
    if(cursor.length>180) return error('Geçersiz sayfalama anahtarı.');
    const [rows,meta]=await Promise.all([
      db.prepare('SELECT id, payload FROM product_changes WHERE id > ? ORDER BY id LIMIT 1001')
        .bind(cursor).all(),
      db.prepare("SELECT value FROM app_meta WHERE key='bulk_at'").first()
    ]);
    const results=rows.results||[];
    const page=results.slice(0,1000);
    return json({products:page.map(row=>JSON.parse(row.payload)), bulkAt:meta?.value||null,
      next:results.length>1000?page[page.length-1].id:null,expected:19096});
  } catch {
    return error('Merkezi veritabanı okunamadı; D1 şemasını kontrol edin.',503);
  }
}
export async function onRequestPost({request,env}) {
  if(new URL(request.url).searchParams.has('labelQueue'))return labelQueueRequest({request,env});
  const db=database(env);
  if(!db) return error('D1 veritabanı bağlı değil.',503);
  const seeded=await db.prepare("SELECT value FROM app_meta WHERE key='catalog_seed_count'").first().catch(()=>null);
  if(!seeded || Number(seeded.value)!==19096)
    return error('D1 katalog başlangıç verisi yüklenmemiş.',503);
  if(!await authorizedAdmin(request,env)) return error('Yönetim oturumu gerekli.',401);
  if(Number(request.headers.get('content-length')||0)>3500000)
    return error('Tek istekte çok fazla veri var.',413);
  let body;
  try {body=await request.json();} catch {return error('Geçersiz JSON.');}
  const action=body?.action;
  try {
    if(action==='upsert') {
      const {saved,statement}=productStatement(db,body.product);
      await db.batch([statement,db.prepare(
        'INSERT INTO product_audit(product_id,action,happened_at) VALUES(?,?,?)'
      ).bind(saved.id,String(body.reason||'edit').slice(0,80),saved.statusChangedAt)]);
      return json({ok:true,product:saved});
    }
    if(action==='import') {
      if(!Array.isArray(body.products)||!body.products.length||body.products.length>40)
        return error('İçe aktarma paketi 1–40 ürün içermeli.');
      const rows=body.products.map(product=>productStatement(db,product));
      if(JSON.stringify(body).length>3500000)return error('İçe aktarma paketi çok büyük.',413);
      await db.batch(rows.map(r=>r.statement));
      return json({ok:true,count:rows.length});
    }
    if(action==='bulk-deactivate') {
      const previous=await db.prepare("SELECT value FROM app_meta WHERE key='bulk_at'").first();
      if(previous) return error('Toplu pasife alma daha önce yapıldı.',409);
      const at=new Date().toISOString();
      await db.batch([
        db.prepare("INSERT INTO app_meta(key,value) VALUES('bulk_at',?)").bind(at),
        db.prepare(`UPDATE product_changes
          SET payload=json_set(payload, '$.lifecycleStatus',
              CASE WHEN json_extract(payload,'$.everActivated')=1
                THEN 'later-inactive' ELSE 'initial-inactive' END,
              '$.statusChangedAt', ?),
              updated_at=?
          WHERE COALESCE(json_extract(payload,'$.lifecycleStatus'),'active')='active'`).bind(at,at),
        db.prepare('INSERT INTO product_audit(product_id,action,happened_at) VALUES(?,?,?)')
          .bind('*','bulk-initial-deactivation',at)
      ]);
      return json({ok:true,at});
    }
    return error('Bilinmeyen işlem.');
  } catch(error) {
    if(String(error?.message||'').includes('UNIQUE constraint')) return error('Barkod başka bir üründe kayıtlı.',409);
    if(error instanceof TypeError || String(error?.message||'').includes('geçersiz')||
        String(error?.message||'').includes('büyük'))
      return error(error.message,400);
    return error('Merkezi veritabanına kayıt yapılamadı.',503);
  }
}
