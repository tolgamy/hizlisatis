import {authorizedAdmin} from '../../lib/admin-auth.js';
import {MAIN_CATEGORY_ORDER} from '../../public/category-art.js';
import {subcategoryPhoto} from '../../public/subcategory-photos.js';

/** Category image replacements only. Existing D1 app_meta table is reused;
 * the default static main/child category photographs are never modified.
 * A second tiny revision key avoids sending hundreds of kilobytes of image
 * data when the storefront refreshes the category-image index.
 */
const IMAGE_PREFIX='category-image-data:';
const VERSION_PREFIX='category-image-version:';
const HEADERS={'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
const response=(data,status=200)=>Response.json(data,{status,headers:HEADERS});
const fail=(message,status=400)=>response({error:message},status);
function database(env){return env?.DB?.prepare?env.DB:null;}
function allowedPath(path){
  if(typeof path!=='string'||!path||path.length>140)return false;
  if(MAIN_CATEGORY_ORDER.includes(path))return true;
  const [main,sub,extra]=path.split(' > ');
  return !extra && Boolean(sub)&&MAIN_CATEGORY_ORDER.includes(main)&&Boolean(subcategoryPhoto(path));
}
const validRevision=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(value);
function decodeImage(value) {
  if(typeof value!=='string'||value.length<16||value.length>370000||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Görsel boyutu veya biçimi geçersiz.');
  let binary;
  try {binary=atob(value)}catch{throw Error('Görsel kodlaması geçersiz.')}
  if(binary.length>270000||binary.length<24 ||
     binary.slice(0,4)!=='RIFF'||binary.slice(8,12)!=='WEBP')
    throw Error('Yalnızca optimize edilmiş WebP görseli kabul edilir (en fazla 270 KB).');
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
const imageKey=path=>IMAGE_PREFIX+path;
const versionKey=path=>VERSION_PREFIX+path;

export async function onRequestGet({request,env}){
  const db=database(env);
  if(!db)return fail('Merkezi D1 veritabanı bağlı değil.',503);
  const url=new URL(request.url),path=url.searchParams.get('path');
  try{
    if(path!==null){
      if(!allowedPath(path))return fail('Kategori bulunamadı.',404);
      const row=await db.prepare('SELECT value FROM app_meta WHERE key=?').bind(imageKey(path)).first();
      if(!row?.value)return fail('Bu kategori varsayılan görseli kullanıyor.',404);
      const data=JSON.parse(row.value);
      const bytes=decodeImage(data.base64);
      // Immutable requests include v=revision. A new upload or reset generates
      // a different version; obsolete cached photographs never replace it.
      const cacheable=validRevision(url.searchParams.get('v'));
      return new Response(bytes,{headers:{
        'Content-Type':'image/webp','X-Content-Type-Options':'nosniff',
        'Cache-Control':cacheable?'public,max-age=31536000,immutable':'no-store'
      }});
    }
    const rows=await db.prepare("SELECT key,value FROM app_meta WHERE key LIKE 'category-image-version:%'").all();
    const images=Object.create(null);
    for(const item of rows.results||[]){
      const key=String(item.key||'').slice(VERSION_PREFIX.length);
      if(allowedPath(key)&&validRevision(item.value))images[key]=item.value;
    }
    return response({images});
  }catch{return fail('Kategori görselleri okunamadı.',503)}
}

export async function onRequestPost({request,env}){
  const db=database(env);
  if(!db)return fail('Merkezi D1 veritabanı bağlı değil.',503);
  if(!await authorizedAdmin(request,env))return fail('Yönetim oturumu gerekli.',401);
  if(Number(request.headers.get('Content-Length')||0)>500000)
    return fail('Görsel yüklemesi çok büyük.',413);
  let body;
  try{body=await request.json()}catch{return fail('Geçersiz görsel isteği.')}
  if(!allowedPath(body?.path))return fail('Kategori bulunamadı.');
  let bytes;
  try{bytes=decodeImage(body.base64)}catch(error){return fail(error.message)}
  const updatedAt=new Date().toISOString();
  const revision=crypto.randomUUID().replace(/-/g,'');
  try{
    await db.batch([
      db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        .bind(imageKey(body.path),JSON.stringify({base64:body.base64,updatedAt})),
      db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        .bind(versionKey(body.path),revision)
    ]);
    return response({ok:true,path:body.path,revision,size:bytes.length});
  }catch{return fail('Görsel merkezi veritabanına kaydedilemedi.',503)}
}

export async function onRequestDelete({request,env}){
  const db=database(env);
  if(!db)return fail('Merkezi D1 veritabanı bağlı değil.',503);
  if(!await authorizedAdmin(request,env))return fail('Yönetim oturumu gerekli.',401);
  let body;
  try{body=await request.json()}catch{return fail('Geçersiz sıfırlama isteği.')}
  if(!allowedPath(body?.path))return fail('Kategori bulunamadı.');
  try {
    await db.batch([
      db.prepare('DELETE FROM app_meta WHERE key=?').bind(imageKey(body.path)),
      db.prepare('DELETE FROM app_meta WHERE key=?').bind(versionKey(body.path))
    ]);
    // Original static image was never replaced or deleted.
    return response({ok:true,path:body.path,restoredDefault:true});
  }catch{return fail('İlk kurulum görseli geri yüklenemedi.',503)}
}
