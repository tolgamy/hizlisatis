import {allowAdminRequestOrigin} from '../../lib/admin-auth.js';
import {accessEnabled,accessConfigError,currentAccessUser,publicUser,loginUser,
  createAccessCookie,clearAccessCookie} from '../../lib/user-access.js';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(value,status=200,extra={})=>Response.json(value,{status,headers:{...headers,...extra}});
export async function onRequestGet({request,env}){
  if(!accessEnabled(env))return json({enabled:false});
  const missing=accessConfigError(env);
  if(missing)return json({enabled:true,configured:false,error:missing},503);
  try{
    const user=await currentAccessUser(request,env);
    return user?json({enabled:true,authenticated:true,user:publicUser(user)}):
      json({enabled:true,authenticated:false,setupRequired:!Boolean((await env.DB.prepare('SELECT 1 AS ok FROM app_users LIMIT 1').first().catch(()=>null))?.ok)});
  }catch{return json({enabled:true,authenticated:false},200)}
}
export async function onRequestPost({request,env}){
  if(!allowAdminRequestOrigin(request))return json({error:'İzin verilmeyen kaynak.'},403);
  if(!accessEnabled(env))return json({error:'Yeni kullanıcı girişi henüz etkin değil.'},503);
  const missing=accessConfigError(env);
  if(missing)return json({error:missing},503);
  let body;try{body=await request.json()}catch{return json({error:'Geçersiz giriş isteği.'},400)}
  if(Number(request.headers.get('Content-Length')||0)>2048)return json({error:'İstek çok büyük.'},413);
  try{
    const user=await loginUser(env,body?.username,body?.password);
    if(!user)return json({error:'Kullanıcı adı veya parola hatalı ya da hesap geçici olarak kilitli.'},401);
    return json({ok:true,user:publicUser(user)},200,{'Set-Cookie':await createAccessCookie(user,env)});
  }catch{return json({error:'Giriş işlemi tamamlanamadı.'},503)}
}
export async function onRequestDelete({request}){
  if(!allowAdminRequestOrigin(request))return json({error:'İzin verilmeyen kaynak.'},403);
  return json({ok:true},200,{'Set-Cookie':clearAccessCookie()});
}
