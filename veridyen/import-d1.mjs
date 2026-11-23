/**
 * D1 SQL export -> MariaDB STAGING importer.
 *
 * By default this program ONLY inspects its local D1 .sql input.
 * To write to a fresh, isolated MariaDB database: --apply --confirm-empty-staging
 * This tool never connects to Cloudflare or modifies its production D1.
 * WARNING: the SQL backup contains customer and user private information.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import initSqlJs from 'sql.js';
import {createPool} from 'mysql2/promise';

const TABLES=['app_meta','app_users','product_changes','product_audit','pos_customers','pos_customer_ledger'];
const [file,...options]=process.argv.slice(2);
if(!file||!file.toLowerCase().endsWith('.sql')){
  console.error('Usage: node veridyen/import-d1.mjs /private/backup.sql [--apply --confirm-empty-staging]');
  process.exit(2);
}
const apply=options.includes('--apply'),confirm=options.includes('--confirm-empty-staging');
if(apply&&!confirm)throw Error('Refusing import without --confirm-empty-staging');
if(!apply&&options.length)throw Error('Unexpected arguments');
const raw=await readFile(resolve(file),'utf8');
if(raw.length<10_000||raw.length>150_000_000)throw Error('D1 backup size is unexpected');
const SQLite=await initSqlJs();
const db=new SQLite.Database();
try{
  // The trusted local file is a Cloudflare-generated SQLite export; never
  // load arbitrary downloaded SQL from other parties.
  db.run(raw);
}catch(e){
  throw Error('Cloudflare SQLite backup could not be parsed: '+String(e.message||e));
}
function select(sql){
  const result=db.exec(sql);
  if(!result.length)return [];
  return result[0].values.map(row=>Object.fromEntries(result[0].columns.map((c,i)=>[c,row[i]])));
}
const existing=new Set(select("SELECT name FROM sqlite_master WHERE type='table'").map(r=>r.name));
for(const table of TABLES)if(!existing.has(table))throw Error('Source backup missing '+table);
const expected=Object.fromEntries(TABLES.map(table=>[table,Number(select(
  'SELECT COUNT(*) AS n FROM "'+table+'"'
)[0]?.n||0)]));
const seed=select("SELECT value FROM app_meta WHERE key='catalog_seed_count'")[0];
if(Number(seed?.value)!==19096||expected.product_changes<19096||expected.app_users<1)
  throw Error('Source snapshot is incomplete; aborting before any MariaDB write');
console.log('D1 snapshot inspected locally. Table counts:',JSON.stringify(expected));
if(!apply){
  console.log('READ-ONLY inspection complete. No MariaDB connection made.');
  console.log('To import later, use --apply --confirm-empty-staging with PRIVATE DB_* environment variables.');
  process.exit(0);
}
for(const name of ['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'])
  if(!process.env[name])throw Error('Missing '+name);
const pool=createPool({
  host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),
  user:process.env.DB_USER,password:process.env.DB_PASSWORD,
  database:process.env.DB_NAME,waitForConnections:true,
  connectionLimit:2,charset:'utf8mb4',timezone:'Z',multipleStatements:false
});
const conn=await pool.getConnection();
try{
  const columns={};
  // Validate source columns against the pre-created schema. Ignore no fields:
  // missing target columns must not silently destroy user/customer data.
  for(const table of TABLES){
    const sourceColumns=select('PRAGMA table_info("'+table+'")').map(x=>x.name);
    const [targetRows]=await conn.query('SHOW COLUMNS FROM \`'+table+'\`');
    const targetColumns=new Set(targetRows.map(x=>x.Field));
    const missing=sourceColumns.filter(x=>!targetColumns.has(x));
    if(missing.length)throw Error('Schema mismatch in '+table+': '+missing.join(', '));
    columns[table]=sourceColumns;
    const [before]=await conn.query('SELECT COUNT(*) AS n FROM \`'+table+'\`');
    if(Number(before[0].n)!==0)throw Error('Target is NOT EMPTY: '+table+'; refusing to overwrite or merge');
  }
  await conn.beginTransaction();
  const inserted={};
  try{
    for(const table of TABLES){
      const cols=columns[table];
      const sql='INSERT INTO \`'+table+'\` ('+
        cols.map(c=>'\`'+c+'\`').join(',')+
        ') VALUES ('+cols.map(()=>'?').join(',')+')';
      const stmt=db.prepare('SELECT * FROM "'+table+'"');
      let n=0;
      try{
        while(stmt.step()){
          const item=stmt.getAsObject();
          const args=cols.map(c=>item[c]===undefined?null:item[c]);
          await conn.execute(sql,args);
          n++;
          if(n%2000===0)console.log(table,n,'rows staged');
        }
      }finally{stmt.free();}
      if(n!==expected[table])throw Error('Row mismatch for '+table);
      inserted[table]=n;
    }
    // Read back while still in the same transaction.
    for(const table of TABLES){
      const [rows]=await conn.query('SELECT COUNT(*) AS n FROM \`'+table+'\`');
      if(Number(rows[0].n)!==expected[table])throw Error('Verification failed: '+table);
    }
    await conn.commit();
    console.log('STAGING IMPORT COMPLETED. Counts:',JSON.stringify(inserted));
  }catch(e){await conn.rollback();throw e;}
}finally{
  conn.release();await pool.end();db.close();
}
