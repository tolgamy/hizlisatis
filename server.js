/**
 * Veridyen / cPanel Passenger Node.js entry point.
 * This is a STAGING adapter, not an automatic production migration.
 * Cloudflare Pages production remains unchanged.
 */
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPool} from 'mysql2/promise';
import {createD1Adapter} from './veridyen/mysql-d1-adapter.js';

import * as auth from './functions/api/auth.js';
import * as users from './functions/api/users.js';
import * as productState from './functions/api/product-state.js';
import * as customers from './functions/api/customers.js';
import * as categoryImages from './functions/api/category-images.js';
import * as centralHealth from './functions/api/central-health.js';
import * as saleAccess from './functions/api/sale-access.js';
import * as catalogSeed from './functions/api/catalog-seed.js';
import * as adminSession from './functions/api/admin-session.js';
import * as image from './functions/api/image.js';
import * as centralSales from './veridyen/central-sales.js';

const ROOT=resolve(fileURLToPath(new URL('./public/',import.meta.url)));
const API=new Map([
  ['/api/auth',auth],['/api/users',users],['/api/product-state',productState],
  ['/api/customers',customers],['/api/category-images',categoryImages],
  ['/api/central-health',centralHealth],['/api/sale-access',saleAccess],
  ['/api/catalog-seed',catalogSeed],['/api/admin-session',adminSession],
  ['/api/image',image],['/api/sales',centralSales]
]);
const MIME={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon',
  '.woff':'font/woff','.woff2':'font/woff2','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf':'application/pdf','.txt':'text/plain; charset=utf-8'
};
const REQUIRED=['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD','PUBLIC_ORIGIN','PRODUCT_WRITE_KEY','ADMIN_INITIAL_PASSWORD'];
const missing=REQUIRED.filter(key=>!process.env[key]);
const secretsValid=String(process.env.PRODUCT_WRITE_KEY||'').length>=24
  && String(process.env.ADMIN_INITIAL_PASSWORD||'').length>=12;
const configured=missing.length===0&&secretsValid&&process.env.AUTH_V2_ENABLED==='true';
const origin=process.env.PUBLIC_ORIGIN||'https://mobilsatis.com.tr';
if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin))throw new Error('PUBLIC_ORIGIN must be an HTTPS origin');
const pool=configured?createPool({
  host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),
  user:process.env.DB_USER,password:process.env.DB_PASSWORD,
  database:process.env.DB_NAME,waitForConnections:true,connectionLimit:6,
  charset:'utf8mb4',decimalNumbers:true,timezone:'Z',multipleStatements:false
}):null;
const DB=pool?createD1Adapter(pool):null;
const env={
  DB,PRODUCT_WRITE_KEY:process.env.PRODUCT_WRITE_KEY,
  ADMIN_INITIAL_PASSWORD:process.env.ADMIN_INITIAL_PASSWORD,
  ADMIN_INITIAL_USER:process.env.ADMIN_INITIAL_USER||'admin',
  AUTH_V2_ENABLED:process.env.AUTH_V2_ENABLED,
  // Cloudflare image transformations are not available on generic Node hosting.
  ENABLE_IMAGE_RESIZE:'false',
  MYSQL_POOL:pool,
  CENTRAL_SALES_ENABLED:process.env.CENTRAL_SALES_ENABLED
};
const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>Response.json(data,{status,headers:HEADERS});
let checkCache={until:0,valid:false};
async function ready(){
  if(!configured||process.env.VERIDYEN_READY!=='true')return false;
  if(Date.now()<checkCache.until)return checkCache.valid;
  try{
    const [count,seed,user]=await Promise.all([
      DB.prepare('SELECT COUNT(*) AS n FROM product_changes').first(),
      DB.prepare("SELECT value FROM app_meta WHERE key='catalog_seed_count'").first(),
      DB.prepare('SELECT COUNT(*) AS n FROM app_users').first()
    ]);
    checkCache.valid=Number(count?.n)>=19096&&Number(seed?.value)===19096&&Number(user?.n)>=1;
  }catch{checkCache.valid=false;}
  checkCache.until=Date.now()+5000;
  return checkCache.valid;
}
async function dynamicRequest(req,url){
  const mod=API.get(url.pathname);
  if(!mod)return json({error:'Bilinmeyen API.'},404);
  const method=req.method?.toUpperCase()||'GET';
  const handler=mod['onRequest'+method[0]+method.slice(1).toLowerCase()]
    ||mod.onRequest;
  if(typeof handler!=='function')return json({error:'İzin verilmeyen yöntem.'},405);
  const chunks=[];let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>4_000_000)return json({error:'İstek çok büyük.'},413);
    chunks.push(chunk);
  }
  const headers=new Headers();
  for(const [key,value] of Object.entries(req.headers)){
    if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):String(value));
  }
  const body=Buffer.concat(chunks);
  const request=new Request(url.href,{
    method,headers,...(method==='GET'||method==='HEAD'?{}:{body,duplex:'half'})
  });
  return handler({request,env});
}
async function staticRequest(url){
  let path;
  try {path=decodeURIComponent(url.pathname);}
  catch {return new Response('Bad path',{status:400});}
  if(path.includes('\0')||path.includes('\\'))return new Response('Bad path',{status:400});
  const file=resolve(ROOT,'.'+(path.endsWith('/')?path+'index.html':path));
  if(!file.startsWith(ROOT+sep)&&file!==ROOT)return new Response('Forbidden',{status:403});
  try{
    const fileStat=await stat(file);
    if(!fileStat.isFile())return new Response('Not Found',{status:404});
    const bytes=await readFile(file);
    const ext=extname(file).toLowerCase();
    return new Response(bytes,{headers:{
      'Content-Type':MIME[ext]||'application/octet-stream',
      'Cache-Control':ext==='.html'||url.pathname==='/sw.js'?'no-store':'public, max-age=300',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin'
    }});
  }catch{return new Response('Not Found',{status:404});}
}
async function app(req,res){
  let response;
  try{
    const url=new URL(req.url||'/',origin);
    const isReady=await ready();
    if(url.pathname==='/__veridyen/health'){
      response=json({configured,ready:isReady,mode:'staging',
        message:isReady?'Ready for isolated testing':'Not ready; no production migration performed'});
    }else if(!isReady){
      response=json({ready:false,error:'Veridyen staging kurulumu henüz etkin değil.'},503);
    }else if(url.pathname.startsWith('/api/')){
      response=await dynamicRequest(req,url);
    }else if(req.method==='GET'||req.method==='HEAD'){
      response=await staticRequest(url);
    }else{
      response=new Response('Method Not Allowed',{status:405});
    }
  }catch(error){
    console.error('Veridyen request failure',error?.name||'Error');
    response=json({error:'İstek tamamlanamadı.'},500);
  }
  const headers=Object.fromEntries(response.headers.entries());
  res.writeHead(response.status,headers);
  if(req.method==='HEAD'){res.end();return;}
  res.end(Buffer.from(await response.arrayBuffer()));
}
const server=createServer((req,res)=>{app(req,res).catch(()=>{
  if(!res.headersSent)res.writeHead(500,HEADERS);res.end('Internal error');
});});
server.listen(Number(process.env.PORT||3000),()=>console.log('HızlıSatış Veridyen staging adapter started'));
