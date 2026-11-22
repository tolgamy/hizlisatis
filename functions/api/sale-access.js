/** Online authorization gate for device-local sales. Fails closed offline.
 * The existing receipts remain in device IndexedDB; this endpoint does NOT
 * pretend to provide a centralized sales ledger or stock synchronization.
 */
import {allowAdminRequestOrigin} from '../../lib/admin-auth.js';
import {accessEnabled,accessConfigError,currentAccessUser,hasPermission} from '../../lib/user-access.js';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(v,status=200)=>Response.json(v,{status,headers});
export async function onRequestPost({request,env}){
  if(!allowAdminRequestOrigin(request))return reply({error:'Kaynak doğrulanamadı.'},403);
  if(!accessEnabled(env)||accessConfigError(env))
    return reply({error:'Güvenli giriş henüz etkin değil veya kurulumu eksik.'},503);
  if(Number(request.headers.get('content-length')||0)>120000)return reply({error:'Satış isteği çok büyük.'},413);
  const user=await currentAccessUser(request,env);
  if(!hasPermission(user,'sales'))
    return reply({error:'Satış işlemi için geçerli bir kullanıcı oturumu ve yetki gerekli.'},403);
  let body;try{body=await request.json()}catch{return reply({error:'Satış verileri geçersiz.'},400)}
  const r=body?.record;
  if(!r||typeof r.id!=='string'||r.id.length>100||!Array.isArray(r.items)||
      !r.items.length||r.items.length>150||!Number.isFinite(r.total)||r.total<0||
      r.items.some(item=>!item||!item.id||!Number.isFinite(item.quantity)||item.quantity<=0))
    return reply({error:'Satış bilgileri geçersiz.'},400);
  const discounted=Number(r.basketDiscountPct)>0 ||
    r.items.some(line=>Number(line.discountPct)>0||Number(line.basketDiscount)>0);
  if(discounted&&!hasPermission(user,'discounts'))
    return reply({error:'Bu kullanıcıda indirim yetkisi bulunmuyor.'},403);
  if(r.payment==='Veresiye'&&!hasPermission(user,'customers'))
    return reply({error:'Bu kullanıcıda veresiye yetkisi bulunmuyor.'},403);
  return reply({ok:true,authorizedBy:user.id});
}
