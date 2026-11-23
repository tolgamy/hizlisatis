import test from 'node:test';
import assert from 'node:assert/strict';
import {translateD1Sql,createD1Adapter} from '../veridyen/mysql-d1-adapter.js';

test('D1 SQLite insert-or-ignore is mapped without dropping bound arguments',()=>{
 const sql="INSERT OR IGNORE INTO app_users (id,username) VALUES (?,?)";
 assert.match(translateD1Sql(sql),/^INSERT IGNORE INTO app_users/);
});
test('upserts map to MariaDB primary key conflict handling',()=>{
 const item="INSERT INTO product_changes(id,barcode,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET barcode=excluded.barcode, payload=excluded.payload, updated_at=excluded.updated_at";
 assert.match(translateD1Sql(item),/ON DUPLICATE KEY UPDATE barcode=VALUES\(barcode\)/);
 const meta="INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value";
 assert.match(translateD1Sql(meta),/ON DUPLICATE KEY UPDATE value=VALUES\(value\)/);
 assert.match(translateD1Sql(meta),/\`key\`/);
});
test('SQLite JSON boolean and NOCASE are explicitly converted',()=>{
 const input="UPDATE product_changes SET payload=json_set(payload,'$.statusChangedAt',?) WHERE json_extract(payload,'$.everActivated')=1 AND COALESCE(json_extract(payload,'$.lifecycleStatus'),'active')='active'";
 const output=translateD1Sql(input);
 assert.match(output,/JSON_SET\(/);
 assert.match(output,/JSON_UNQUOTE\(JSON_EXTRACT\(payload,'\$\.everActivated'\)\) IN \('true','1'\)/);
 assert.match(output,/JSON_UNQUOTE\(JSON_EXTRACT\(payload,'\$\.lifecycleStatus'\)\)/);
 assert.equal(translateD1Sql('SELECT name FROM pos_customers ORDER BY name COLLATE NOCASE').includes('NOCASE'),false);
});
test('schema writes beyond whitelisted legacy ensures are rejected',()=>{
 assert.equal(translateD1Sql('CREATE TABLE IF NOT EXISTS app_users (id TEXT PRIMARY KEY)'),null);
 assert.throws(()=>translateD1Sql('DROP TABLE app_users'));
 assert.throws(()=>translateD1Sql('ALTER TABLE product_changes ADD key INT'));
});
test('first/all use mysql2 execute, batch commits using one connection',async()=>{
 const statements=[];
 const conn={
  execute:async(sql,args)=>{statements.push({sql,args});return [[{n:7}],[]]},
  beginTransaction:async()=>{statements.push({begin:true})},
  commit:async()=>{statements.push({commit:true})},
  rollback:async()=>{throw Error('unexpected rollback')},
  release:()=>{statements.push({release:true})}
 };
 const db=createD1Adapter({...conn,getConnection:async()=>conn});
 const row=await db.prepare('SELECT COUNT(*) AS n FROM product_changes WHERE id=?').bind('x').first();
 assert.equal(row.n,7);
 const a=await db.batch([db.prepare('SELECT COUNT(*) AS n FROM product_changes').bind()]);
 assert.equal(a.length,1);
 assert.ok(statements.some(x=>x.begin));
 assert.ok(statements.some(x=>x.commit));
 assert.ok(statements.some(x=>x.release));
});
test('batch failures roll back rather than partially committing',async()=>{
 let rollback=0,commit=0,release=0;
 const conn={
  execute:async()=>{throw Error('DB unavailable')},
  beginTransaction:async()=>{},
  commit:async()=>{commit++},
  rollback:async()=>{rollback++},
  release:()=>{release++}
 };
 const db=createD1Adapter({...conn,getConnection:async()=>conn});
 await assert.rejects(db.batch([db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind('x','y')]));
 assert.equal(rollback,1);
 assert.equal(commit,0);
 assert.equal(release,1);
});
