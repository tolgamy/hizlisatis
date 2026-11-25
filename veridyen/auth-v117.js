import * as old from '../functions/api/auth.js';
import {allowAdminRequestOrigin} from '../lib/admin-auth.js';
import {reserveLogin117,refundLogin117} from './auth-throttle-v117.js';
export const onRequestGet=old.onRequestGet;
export const onRequestDelete=old.onRequestDelete;
export async function onRequestPost(ctx){
 const {request,env}=ctx;
 if(!allowAdminRequestOrigin(request))return old.onRequestPost(ctx);
 const res=await reserveLogin117(env);
 if(res.retryMs)return Response.json({error:'Bu bağlantıdan çok fazla giriş denemesi yapıldı. '+Math.ceil(res.retryMs/1000)+' saniye sonra tekrar deneyin.'},{status:429,headers:{'Cache-Control':'no-store','Retry-After':String(Math.ceil(res.retryMs/1000))}});
 const response=await old.onRequestPost(ctx);
 if(response.ok)await refundLogin117(env,res);
 return response;
}
