import {allowAdminRequestOrigin} from '../../lib/admin-auth.js';
import {accessEnabled,accessConfigError,currentAccessUser,hasPermission,allUsers,
  createUser,updateUser} from '../../lib/user-access.js';
const hdr={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(value,status=200)=>Response.json(value,{status,headers:hdr});
async function access(request,env){
  if(!accessEnabled(env)||accessConfigError(env)||!allowAdminRequestOrigin(request))return null;
  const actor=await currentAccessUser(request,env);
  return hasPermission(actor,'users')?actor:null;
}
export async function onRequestGet({request,env}){
  if(!await access(request,env))return reply({error:'Yönetici yetkisi gerekli.'},403);
  try{return reply({users:await allUsers(env)})}
  catch{return reply({error:'Kullanıcılar okunamadı.'},503)}
}
export async function onRequestPost({request,env}){
  const actor=await access(request,env);
  if(!actor)return reply({error:'Yönetici yetkisi gerekli.'},403);
  if(Number(request.headers.get('content-length')||0)>4096)return reply({error:'İstek çok büyük.'},413);
  let body;try{body=await request.json()}catch{return reply({error:'Geçersiz istek.'},400)}
  try{
    if(body?.action==='create'){
      const id=await createUser(env,body);
      return reply({ok:true,id},201);
    }
    if(body?.action==='update'){
      await updateUser(env,body,actor);
      return reply({ok:true});
    }
    return reply({error:'Bilinmeyen işlem.'},400);
  }catch(e){
    const constraint=String(e?.message||'').toLowerCase().includes('unique');
    return reply({error:constraint?'Kullanıcı adı zaten kayıtlı.':
      (e?.message||'Kullanıcı kaydedilemedi.')},400);
  }
}
