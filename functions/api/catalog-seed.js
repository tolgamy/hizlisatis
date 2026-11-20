/** Administrative first-time D1 catalogue seeding for Cloudflare Pages.
 * Uses Pages ASSETS to read the exact bundled catalogue deployed on the same site.
 * Never accepts a user-provided catalogue URL or writes to browser storage.
 */
import { productFromBundledRow } from '../../public/bundled-catalog.js';

const PAGE_SIZE=250;
function respond(value,status=200) {
  return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
async function permitted(request,env) {
  const secret=String(env?.PRODUCT_WRITE_KEY||'');
  const encoded=request.headers.get('X-Product-Key')||'';
  // Header values cannot contain arbitrary Unicode. The client sends the key
  // percent-encoded as UTF-8; decode before comparing secret digests.
  if(encoded.length>2048)return false;
  let candidate;
  try{candidate=decodeURIComponent(encoded);}
  catch{return false;}
  if(secret.length<24||candidate.length!==secret.length||candidate.length>256)return false;
  const encoder=new TextEncoder();
  const [x,y]=await Promise.all([secret,candidate].map(s=>crypto.subtle.digest('SHA-256',encoder.encode(s))));
  const a=new Uint8Array(x),b=new Uint8Array(y);
  let different=0;
  for(let i=0;i<a.length;i++)different|=a[i]^b[i];
  return different===0;
}
function provider(env) {
  if(!env?.DB?.prepare||!env?.DB?.batch||!env?.ASSETS?.fetch)throw Error('Cloudflare DB veya ASSETS bağlantısı bulunamadı.');
  return env.DB;
}
async function assetJSON(path,env,request) {
  const url=new URL(path,new URL(request.url).origin);
  const res=await env.ASSETS.fetch(new Request(url.href));
  if(!res.ok)throw Error('Katalog dosyası bulunamadı: '+path);
  return res.json();
}
async function manifest(env,request) {
  const data=await assetJSON('/catalog/manifest.json',env,request);
  if(data?.schema!==1||data.count!==19096||!Array.isArray(data.parts)||data.parts.length!==20||
    data.parts.some(path=>typeof path!=='string'||!/^\/catalog\/products-[a-f0-9]{16}-\d{2}\.json$/i.test(path)))
    throw Error('19.096 ürünün başlangıç kataloğu doğrulanamadı.');
  return data;
}
export async function onRequest({request,env}) {
  if(!['GET','POST'].includes(request.method))return respond({error:'İzin verilmeyen yöntem.'},405);
  // Missing/short runtime configuration is not a user's incorrect password.
  // Pages secrets take effect only on deployments made after the secret is saved.
  if(String(env?.PRODUCT_WRITE_KEY||'').length<24)
    return respond({error:'Cloudflare Pages Production ortamındaki PRODUCT_WRITE_KEY bu dağıtımda tanımlı değil veya 24 karakterden kısa. Secret kaydını ve yeniden dağıtımı kontrol edin.'},503);
  if(!await permitted(request,env))
    return respond({error:'Girilen anahtar bu dağıtımdaki Cloudflare Production Secret ile eşleşmiyor. Secret değiştiyse yeni Production dağıtımı yapın; şifreyi bu sohbete göndermeyin.'},401);
  let db;
  try{db=provider(env);}
  catch(e){return respond({error:e.message},503);}
  try{
    if(request.method==='GET') {
      const [count,ready]=await Promise.all([
        db.prepare('SELECT COUNT(*) AS n FROM product_changes').first(),
        db.prepare("SELECT value FROM app_meta WHERE key='catalog_seed_count'").first()
      ]);
      return respond({count:Number(count?.n||0),ready:Number(ready?.value)===19096});
    }
    const body=await request.json();
    const data=await manifest(env,request);
    if(body?.action==='finish') {
      const row=await db.prepare('SELECT COUNT(*) AS n FROM product_changes').first();
      const count=Number(row?.n||0);
      if(count!==data.count)return respond({
        error:'Veritabanında '+count+' ürün var. Beklenen 19096. Önce eksikleri aktarın.'
      },409);
      await db.batch([
        db.prepare("INSERT INTO app_meta(key,value) VALUES('catalog_seed_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(data.version),
        db.prepare("INSERT INTO app_meta(key,value) VALUES('catalog_seed_count',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(data.count))
      ]);
      return respond({ok:true,ready:true,count});
    }
    const part=body?.part,offset=body?.offset;
    if(!Number.isInteger(part)||part<0||part>=data.parts.length||
        !Number.isInteger(offset)||offset<0||offset>1000||offset%PAGE_SIZE!==0)
      return respond({error:'Geçersiz aktarım paketi.'},400);
    const rows=await assetJSON(data.parts[part],env,request);
    if(!Array.isArray(rows)||rows.length===0||rows.length>1000||offset>=rows.length)
      return respond({error:'Geçersiz katalog sayfası veya sayfa konumu.'},400);
    const batch=rows.slice(offset,offset+PAGE_SIZE).map(productFromBundledRow);
    // Re-runs are idempotent and never overwrite any existing product edits.
    const timestamp='1970-01-01T00:00:00.000Z';
    await db.batch(batch.map(p=>db.prepare(
      'INSERT INTO product_changes (id,barcode,payload,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING'
    ).bind(p.id,p.barkod,JSON.stringify(p),timestamp)));
    const next=offset+batch.length;
    return respond({ok:true,count:batch.length,part,offset,nextOffset:next,
      partComplete:next>=rows.length,partTotal:rows.length,partsTotal:data.parts.length});
  }catch(e){
    return respond({error:e?.message||'D1 katalog aktarımı başarısız.'},503);
  }
}
