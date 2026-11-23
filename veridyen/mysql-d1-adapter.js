/**
 * Translate the precise SQLite/D1 statements currently used by HızlıSatış
 * to MariaDB while preserving .prepare().bind().first/.all/.run/.batch().
 * This is intentionally NOT a generic SQLite-to-MySQL SQL translator.
 */
export function translateD1Sql(sql){
  let q=String(sql).trim();
  // D1 handlers create these tables at request time. On MariaDB the schema
  // must already have been applied by a privileged migration administrator.
  if(/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(app_users|pos_customers|pos_customer_ledger)\b/i.test(q))
    return null;
  if(/^CREATE\b|^DROP\b|^ALTER\b/i.test(q))
    throw new Error('Schema changes are disabled through the D1 compatibility layer');
  // key is reserved in MariaDB, while SQLite allows it unquoted.
  if(/\bapp_meta\b/i.test(q))q=q.replace(/\bkey\b/gi,'\`key\`');
  q=q.replace(/\bCOLLATE\s+NOCASE\b/gi,'');
  q=q.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi,'INSERT IGNORE INTO');
  q=q.replace(/ON\s+CONFLICT\s*\(\s*id\s*\)\s+DO\s+NOTHING\b/gi,
    'ON DUPLICATE KEY UPDATE id=id');
  q=q.replace(/ON\s+CONFLICT\s*\(\s*id\s*\)\s+DO\s+UPDATE\s+SET\s+barcode\s*=\s*excluded\.barcode\s*,\s*payload\s*=\s*excluded\.payload\s*,\s*updated_at\s*=\s*excluded\.updated_at/gi,
    'ON DUPLICATE KEY UPDATE barcode=VALUES(barcode), payload=VALUES(payload), updated_at=VALUES(updated_at)');
  q=q.replace(/ON\s+CONFLICT\s*\(\s*\`?key\`?\s*\)\s+DO\s+UPDATE\s+SET\s+value\s*=\s*excluded\.value/gi,
    'ON DUPLICATE KEY UPDATE value=VALUES(value)');
  q=q.replace(/json_extract\s*\(\s*payload\s*,\s*'\$\.everActivated'\s*\)\s*=\s*1/gi,
    "JSON_UNQUOTE(JSON_EXTRACT(payload,'$.everActivated')) IN ('true','1')");
  q=q.replace(/json_extract\s*\(\s*payload\s*,\s*'\$\.lifecycleStatus'\s*\)/gi,
    "JSON_UNQUOTE(JSON_EXTRACT(payload,'$.lifecycleStatus'))");
  q=q.replace(/\bjson_set\s*\(/gi,'JSON_SET(');
  if(/\bON\s+CONFLICT\b/i.test(q)||/\bexcluded\./i.test(q))
    throw new Error('Unsupported D1 UPSERT statement: migration needs explicit SQL mapping');
  return q;
}
function normalizeArgs(args){return args.map(value=>value===undefined?null:value);}
async function executeSql(conn,sql,args){
  const mapped=translateD1Sql(sql);
  if(mapped===null)return {results:[],success:true,meta:{changes:0}};
  const [rows]=await conn.execute(mapped,normalizeArgs(args));
  if(Array.isArray(rows))return {results:rows,success:true,meta:{changes:0}};
  return {results:[],success:true,meta:{changes:Number(rows?.affectedRows||0)}};
}
function statement(pool,sql,args=[]){
  return {
    sql,args,
    bind(...values){return statement(pool,sql,values);},
    async first(){
      const result=await executeSql(pool,sql,args);
      return result.results[0]||null;
    },
    async all(){return executeSql(pool,sql,args);},
    async run(){return executeSql(pool,sql,args);}
  };
}
export function createD1Adapter(pool){
  if(!pool||typeof pool.execute!=='function'||typeof pool.getConnection!=='function')
    throw new Error('A MariaDB mysql2 promise pool is required');
  return {
    prepare(sql){return statement(pool,sql);},
    async batch(statements){
      if(!Array.isArray(statements))throw new Error('D1 batch expects an array');
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        const results=[];
        for(const entry of statements){
          if(!entry||typeof entry.sql!=='string')throw new Error('Invalid prepared SQL');
          results.push(await executeSql(conn,entry.sql,entry.args));
        }
        await conn.commit();
        return results;
      }catch(error){
        await conn.rollback().catch(()=>{});
        throw error;
      }finally{conn.release();}
    }
  };
}
