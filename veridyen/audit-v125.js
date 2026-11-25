import {currentAccessUser} from '../lib/user-access.js';
const reply=(d,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequestGet({request,env}){
 const u=await currentAccessUser(request,env);if(u?.role!=='admin'||!u.active)return reply({error:'Yalnız yönetici işlem kayıtlarına erişebilir.'},403);
 try{
  const pool=env.MYSQL_POOL;
  const [[sales],[products],[collections],[approvals]]=await Promise.all([
   pool.execute('SELECT id,cashier_id,created_at FROM pos_sales ORDER BY created_at DESC,id DESC LIMIT 100'),
   pool.execute('SELECT product_id,action,happened_at FROM product_audit ORDER BY happened_at DESC LIMIT 100'),
   pool.execute('SELECT actor_id,action,target,happened_at FROM pos_audit_events ORDER BY happened_at DESC LIMIT 100'),
   pool.execute('SELECT id,requester_id,kind,target,status,created_at,reviewer_id,reviewed_at FROM pos_approval_requests ORDER BY created_at DESC LIMIT 100')
  ]);
  const events=[...sales.map(r=>({actor:r.cashier_id,action:'Satış',target:r.id,at:r.created_at})),...products.map(r=>{const m=/^(activate-initial-v124|approval-activate-v125):([a-f0-9-]{36})$/.exec(r.action);return {actor:m?.[2]||'',action:m?'Ürün aktifleştirme':r.action,target:r.product_id,at:r.happened_at}}),...collections.map(r=>({actor:r.actor_id,action:r.action==='customer-collect'?'Tahsilat':r.action,target:r.target,at:r.happened_at})),...approvals.flatMap(r=>[{actor:r.requester_id,action:'Onay talebi: '+r.kind,target:r.target,at:r.created_at},...(r.reviewed_at?[{actor:r.reviewer_id,action:'Talep kararı: '+r.status,target:r.target,at:r.reviewed_at}]:[])])];
  const [users]=await pool.execute('SELECT id,username FROM app_users');
  const names=new Map(users.map(r=>[r.id,r.username]));
  return reply({events:events.sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,200).map(r=>({...r,actorName:names.get(r.actor)||r.actor||'Eski kayıtta kullanıcı yok'}))});
 }catch{return reply({error:'İşlem kayıtları okunamadı. v125 SQL kurulumunu kontrol edin.'},503)}
}
