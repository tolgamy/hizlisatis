/** Administrative first-time D1 catalogue seeding for Cloudflare Pages.
 * Product rows are read from deployed static catalogue by the authorized admin UI;
 * the API validates bounded batches and writes to D1 (no ASSETS binding needed).
 * Never accepts catalogue URLs or writes to browser storage.
 */
import { productFromBundledRow } from '../../public/bundled-catalog.js';
import {authorizedAccess,accessEnabled} from '../../lib/user-access.js';

const PAGE_SIZE=100;
const CATALOG_VERSION='7f27e3a60ef04e77';
const CATALOG_TOTAL=19096;
const CATALOG_PARTS=20;
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
  if(!env?.DB?.prepare||!env?.DB?.batch)
    throw Error('Cloudflare Pages Production ortamında DB adlı D1 bağlantısı bulunamadı. hizlisatis.pages.dev Pages projesinde Settings → Bindings → DB ayarını kontrol edin ve yeniden dağıtın.');
  return env.DB;
}
export async function onRequest({request,env}) {
  if(!['GET','POST'].includes(request.method))return respond({error:'İzin verilmeyen yöntem.'},405);
  // Missing/short runtime configuration is not a user's incorrect password.
  // Pages secrets take effect only on deployments made after the secret is saved.
  if(String(env?.PRODUCT_WRITE_KEY||'').length<24)
    return respond({error:'Cloudflare Pages Production ortamındaki PRODUCT_WRITE_KEY bu dağıtımda tanımlı değil veya 24 karakterden kısa. Secret kaydını ve yeniden dağıtımı kontrol edin.'},503);
  if(!(accessEnabled(env) ? await authorizedAccess(request,env,'products') : await permitted(request,env)))
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
    if(Number(request.headers.get('content-length')||0)>400000)
      return respond({error:'Aktarım paketi çok büyük.'},413);
    if(body?.action==='finish') {
      const row=await db.prepare('SELECT COUNT(*) AS n FROM product_changes').first();
      const count=Number(row?.n||0);
      if(count!==CATALOG_TOTAL)return respond({
        error:'Veritabanında '+count+' ürün var. Beklenen 19096. Önce eksikleri aktarın.'
      },409);
      await db.batch([
        db.prepare("INSERT INTO app_meta(key,value) VALUES('catalog_seed_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(CATALOG_VERSION),
        db.prepare("INSERT INTO app_meta(key,value) VALUES('catalog_seed_count',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(CATALOG_TOTAL))
      ]);
      return respond({ok:true,ready:true,count});
    }
    const part=body?.part,offset=body?.offset,rows=body?.rows,partTotal=body?.partTotal;
    if(body?.version!==CATALOG_VERSION)
      return respond({error:'Katalog sürümü uyuşmuyor; sayfayı yenileyin.'},409);
    if(!Number.isInteger(part)||part<0||part>=CATALOG_PARTS||
        !Number.isInteger(partTotal)||partTotal<1||partTotal>1000||
        !Number.isInteger(offset)||offset<0||offset>=partTotal||offset%PAGE_SIZE!==0||
        !Array.isArray(rows)||rows.length!==Math.min(PAGE_SIZE,partTotal-offset))
      return respond({error:'Geçersiz katalog aktarım paketi.'},400);
    // Restrict raw rows to the nine scalar fields of our bundled catalogue.
    if(rows.some(row=>!Array.isArray(row)||row.length!==9||
        row.some(value=>value!==null&&!['string','number'].includes(typeof value))))
      return respond({error:'Geçersiz ürün satırı.'},400);
    const batch=rows.map(productFromBundledRow);
    // Re-runs are idempotent and never overwrite any existing product edits.
    const timestamp='1970-01-01T00:00:00.000Z';
    await db.batch(batch.map(p=>db.prepare(
      'INSERT INTO product_changes (id,barcode,payload,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING'
    ).bind(p.id,p.barkod,JSON.stringify(p),timestamp)));
    const next=offset+batch.length;
    return respond({ok:true,count:batch.length,part,offset,nextOffset:next,
      partComplete:next>=partTotal,partTotal,partsTotal:CATALOG_PARTS});
  }catch(e){
    return respond({error:e?.message||'D1 katalog aktarımı başarısız.'},503);
  }
}
