import {onRequestGet as originalGet,onRequestPost as originalPost,validateProduct} from './product-state.js';
import {currentAccessUser,hasPermission} from '../../lib/user-access.js';
import {fine125} from '../../lib/rights-v125.js';
import {decodePermissions} from '../../lib/permissions-v121.js';
const SAFE=new Set(['id','barkod','urunKodu','baslik','marka','kategori','kategoriYolu','kategoriAna','kategoriAlt','kaynakKategori','aciklama','aciklamaMetin','gorsel','source','stok','stokBelirsiz','satisFiyati','girisFiyati','fiyatBelirsiz','piyasaFiyati','kdv','kdvBelirsiz','kdvExcluded','paraBirimi','birim','variantKey','mensei','menşei','beden','renk','deletedFrom','lifecycleStatus','everActivated','statusChangedAt','importFormat']);
export const safeProduct125=p=>Object.fromEntries(Object.entries(p).filter(([key])=>SAFE.has(key)));
export async function onRequestGet(ctx){
 const user=await currentAccessUser(ctx.request,ctx.env);
 if(!user)return Response.json({error:'Ürün sorgulamak için oturum gerekli.'},{status:403,headers:{'Cache-Control':'no-store'}});
 const res=await originalGet(ctx);
 if(!res.ok||fine125(user,'product.cost','products'))return res;
 const data=await res.json();
 if(Array.isArray(data.products))data.products=data.products.map(safeProduct125);
 return Response.json(data,{status:res.status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}


const groups=[
 ['product.price',['satisFiyati','girisFiyati','fiyatBelirsiz']],
 ['product.barcode',['barkod','urunKodu','variantKey']],
 ['product.category',['kategori','kategoriYolu','kategoriAna','kategoriAlt','kaynakKategori']],
 ['product.tax.origin',['kdv','kdvBelirsiz','kdvExcluded','mensei','menşei']]
];
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const invalid=(message,status)=>Object.assign(Error(message),{status});

function editProduct130(before,input,user){
 const allowed=id=>fine125(user,id);
 if(!before){
  if(!allowed('product.create'))throw invalid('Yeni ürün yetkisi gerekli.',403);
  const created=safeProduct125(input);
  if(created.lifecycleStatus&&created.lifecycleStatus!=='active')
   throw invalid('Yeni ürün etkin olarak oluşturulmalıdır.',403);
  if(Number(created.stok)>0&&!allowed('product.stock.in'))
   throw invalid('Başlangıç stoğu için stok giriş yetkisi gerekli.',403);
  return validateProduct(created);
 }
 const next={...before};
 for(const [permission,fields] of groups){
  for(const key of fields){
   if(!Object.hasOwn(input,key)||JSON.stringify(before[key])===JSON.stringify(input[key]))continue;
   if(!allowed(permission))throw invalid('Ürün alanı için ayrı yetki gerekli.',403);
   next[key]=input[key];
  }
 }
 if((Object.hasOwn(input,'stok')&&input.stok!==before.stok)||
    (Object.hasOwn(input,'stokBelirsiz')&&Boolean(input.stokBelirsiz)!==Boolean(before.stokBelirsiz))){
  const oldStock=Number(before.stok||0),newStock=Number(input.stok??before.stok??0);
  if(!Number.isFinite(newStock)||newStock<0)throw invalid('Stok miktarı geçersiz.',400);
  const trackingOff=input.stokBelirsiz===true&&!before.stokBelirsiz;
  if(!allowed(trackingOff||newStock<oldStock?'product.stock.out':'product.stock.in'))
   throw invalid('Stok işlemi için ayrı yetki gerekli.',403);
  next.stok=newStock;
  if(Object.hasOwn(input,'stokBelirsiz'))next.stokBelirsiz=Boolean(input.stokBelirsiz);
 }
 const previous=before.lifecycleStatus||'active',status=input.lifecycleStatus||previous;
 if(status!==previous){
  const activation=status==='active'&&['initial-inactive','later-inactive'].includes(previous);
  const deletion=status==='deleted'&&previous!=='deleted';
  const restore=previous==='deleted'&&status===(before.deletedFrom||'later-inactive');
  const permission=activation?(previous==='initial-inactive'?'product.activate.initial':'product.activate.later'):
   deletion||restore?'product.delete.restore':null;
  if(!permission||!allowed(permission))throw invalid('Ürün durumu için yetki gerekli.',403);
  if(activation&&(next.fiyatBelirsiz||!(next.satisFiyati>0)))throw invalid('Önce geçerli bir satış fiyatı girin.',409);
  next.lifecycleStatus=status;
  if(activation)next.everActivated=true;
  if(deletion)next.deletedFrom=previous;
  if(restore)next.deletedFrom=null;
 }
 return validateProduct(next);
}

export async function onRequestPost(ctx){
 const {request,env}=ctx;
 const user=await currentAccessUser(request,env);
 if(!user)return response({error:'Ürün işlemi için oturum gerekli.'},401);
 if(hasPermission(user,'products')||!decodePermissions(user.permissions).profile||
    new URL(request.url).searchParams.has('labelQueue'))return originalPost(ctx);
 const pool=env.MYSQL_POOL;
 if(!pool)return response({error:'Merkezi ürün işlemi kullanılamıyor.'},503);
 let body;
 try{body=await request.json();}catch{return response({error:'Geçersiz JSON.'},400);}
 if(body?.action==='label-queue')return originalPost({
  ...ctx,request:new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(body)})
 });
 const importing=body?.action==='import';
 const entries=importing?body.products:body?.action==='upsert'?[body.product]:null;
 if(!entries||importing&&!fine125(user,'product.import'))
  return response({error:'Ürün işlemi için yetki gerekli.'},403);
 if(!Array.isArray(entries)||!entries.length||entries.length>40||
    entries.some(p=>!p||typeof p.id!=='string'||!p.id||p.id.length>180))
  return response({error:'Ürün kaydı geçersiz.'},400);
 let conn;
 try{
  conn=await pool.getConnection();
  await conn.beginTransaction();
  const saved=[];
  const ids=new Set();
  for(const input of entries){
   if(ids.has(input.id))throw invalid('Ürün kimliği yinelenmiş.',400);
   ids.add(input.id);
   const [rows]=await conn.execute('SELECT payload FROM product_changes WHERE id=? FOR UPDATE',[input.id]);
   const before=rows[0]?JSON.parse(rows[0].payload):null;
   const product=editProduct130(before,input,user);
   if(!before||product.barkod!==before.barkod){
    const [duplicates]=await conn.execute('SELECT id FROM product_changes WHERE barcode=? AND id<>? FOR UPDATE',[product.barkod,product.id]);
    if(duplicates.length)throw invalid('Barkod başka bir üründe kayıtlı.',409);
   }
   if(before){
    await conn.execute('UPDATE product_changes SET barcode=?,payload=?,updated_at=? WHERE id=?',
     [product.barkod,JSON.stringify(product),product.statusChangedAt,product.id]);
   }else{
    await conn.execute('INSERT INTO product_changes (id,barcode,payload,updated_at) VALUES (?,?,?,?)',
     [product.id,product.barkod,JSON.stringify(product),product.statusChangedAt]);
   }
   await conn.execute('INSERT INTO product_audit (product_id,action,happened_at) VALUES (?,?,?)',
    [product.id,'product-v130:'+user.id,product.statusChangedAt]);
   saved.push(fine125(user,'product.cost')?product:safeProduct125(product));
  }
  await conn.commit();
  return response(importing?{ok:true,count:saved.length}:{ok:true,product:saved[0]});
 }catch(error){
  if(conn)await conn.rollback().catch(()=>{});
  const status=error.status||(/geçersiz|büyük/.test(error.message)?400:503);
  return response({error:status===503?'Merkezi ürün işlemi tamamlanamadı.':error.message},status);
 }finally{conn?.release();}
}
