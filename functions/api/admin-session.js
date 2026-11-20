import {validAdminKey,makeSessionCookie,clearSessionCookie,allowAdminRequestOrigin} from '../../lib/admin-auth.js';
const shared={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function onRequestPost({request,env}) {
  if(!allowAdminRequestOrigin(request))return Response.json({error:'İzin verilmeyen kaynak.'},{status:403,headers:shared});
  const value=String(env?.PRODUCT_WRITE_KEY||'');
  let body;try{body=await request.json()}catch{return Response.json({error:'Geçersiz oturum isteği.'},{status:400,headers:shared})}
  if(!await validAdminKey(body?.key,value))
    return Response.json({error:'Yönetim anahtarı eşleşmedi.'},{status:401,headers:shared});
  const cookie=await makeSessionCookie(value);
  return Response.json({ok:true,expiresInDays:30},{headers:{...shared,'Set-Cookie':cookie}});
}
export async function onRequestDelete({request}) {
  if(!allowAdminRequestOrigin(request))return Response.json({error:'İzin verilmeyen kaynak.'},{status:403,headers:shared});
  return Response.json({ok:true},{headers:{...shared,'Set-Cookie':clearSessionCookie()}});
}
