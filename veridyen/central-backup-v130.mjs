import {execFile} from 'node:child_process';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {gzip,gunzip} from 'node:zlib';
import {createConnection} from 'mysql2/promise';

const magic=Buffer.from('HIZLISATIS-BACKUP-1\n');
const maxBytes=128*1024*1024;
const zip=promisify(gzip);
const unzip=promisify(gunzip);

function backupKey(value){
  if(!/^[a-f0-9]{64}$/i.test(value||''))throw Error('BACKUP_KEY 64 onaltılık karakter olmalıdır.');
  return Buffer.from(value,'hex');
}

export async function sealBackup(sql,key){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',backupKey(key),iv);
  cipher.setAAD(magic);
  const encrypted=Buffer.concat([cipher.update(await zip(sql)),cipher.final()]);
  return Buffer.concat([magic,iv,cipher.getAuthTag(),encrypted]);
}

export async function openBackup(data,key){
  if(data.length<=magic.length+28||data.length>maxBytes||!data.subarray(0,magic.length).equals(magic))
    throw Error('Yedek biçimi geçersiz.');
  const iv=data.subarray(magic.length,magic.length+12);
  const tag=data.subarray(magic.length+12,magic.length+28);
  const decipher=createDecipheriv('aes-256-gcm',backupKey(key),iv);
  decipher.setAAD(magic);
  decipher.setAuthTag(tag);
  const compressed=Buffer.concat([decipher.update(data.subarray(magic.length+28)),decipher.final()]);
  return unzip(compressed,{maxOutputLength:maxBytes});
}

function run(program,args,password,input){
  return new Promise((resolve,reject)=>{
    const child=execFile(program,args,{
      encoding:'buffer',maxBuffer:maxBytes,
      env:{...process.env,MYSQL_PWD:password}
    },(error,stdout)=>{
      if(error)reject(Error(program+' başarısız ('+(error.code||'işlem hatası')+').'));
      else resolve(stdout);
    });
    child.stdin.on('error',reject);
    child.stdin.end(input);
  });
}

async function main([action,file,target],env){
  if(!['backup','restore'].includes(action)||!file||(action==='restore')!==Boolean(target))
    throw Error('Kullanım: node veridyen/central-backup-v130.mjs backup DOSYA | restore DOSYA HEDEF_DB');
  const {DB_HOST:host,DB_USER:user,DB_PASSWORD:password,DB_NAME:source,BACKUP_KEY:key}=env;
  const port=Number(env.DB_PORT||3306);
  if(!host||!user||!password||!/^[a-zA-Z0-9_]+$/.test(source||'')||!Number.isInteger(port)||port<1||port>65535)
    throw Error('DB_HOST, DB_USER, DB_PASSWORD, DB_NAME ve geçerli DB_PORT gereklidir.');
  backupKey(key);
  const args=['--no-defaults','--protocol=TCP','--host='+host,'--port='+port,'--user='+user,
    '--default-character-set=utf8mb4'];
  if(action==='backup'){
    const sql=await run('mariadb-dump',[...args,'--single-transaction','--quick','--skip-lock-tables',
      '--skip-add-drop-table','--hex-blob','--',source],password);
    const encrypted=await sealBackup(sql,key);
    if(encrypted.length>maxBytes)throw Error('Şifreli yedek boyut sınırını aşıyor.');
    await writeFile(file,encrypted,{flag:'wx',mode:0o600});
    console.log('Şifreli merkezi yedek oluşturuldu.');
    return;
  }
  if(!/^[a-zA-Z0-9_]+$/.test(target)||target.toLowerCase()===source.toLowerCase())
    throw Error('Kaynak veritabanından farklı, boş bir hedef veritabanı belirtin.');
  if((await stat(file)).size>maxBytes)throw Error('Yedek boyut sınırını aşıyor.');
  const sql=await openBackup(await readFile(file),key);
  const connection=await createConnection({host,port,user,password,database:target});
  try{
    const [tables]=await connection.query('SHOW FULL TABLES');
    if(tables.length)throw Error('Geri yükleme hedefi boş olmalıdır.');
    await run('mariadb',[...args,'--binary-mode','--',target],password,sql);
    const [restored]=await connection.query('SHOW FULL TABLES');
    if(!restored.length)throw Error('Geri yüklenen tablolar bulunamadı.');
    console.log(restored.length+' tablo geri yüklendi.');
  }finally{
    await connection.end();
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main(process.argv.slice(2),process.env).catch(error=>{
    console.error(error.message);
    process.exitCode=1;
  });
}
