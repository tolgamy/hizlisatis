/** Read-only D1 readiness check; no customer data, no mutation endpoints. */
export async function onRequestGet({env}) {
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const json=(body,status=200)=>Response.json(body,{status,headers});
 if(!env?.DB?.prepare)
   return json({ready:false,error:'Production DB binding missing'},503);
 try {
   const [seed,rows]=await Promise.all([
     env.DB.prepare("SELECT value FROM app_meta WHERE key='catalog_seed_count'").first(),
     env.DB.prepare('SELECT COUNT(*) AS n FROM product_changes').first()
   ]);
   const count=Number(rows?.n||0), expected=19096;
   const ready=Number(seed?.value)===expected&&count>=expected;
   return json({ready,count,expected},ready?200:503);
 } catch {
   return json({ready:false,error:'D1 schema unavailable'},503);
 }
}
