/** Generate idempotent SQL seed files for all 19,096 bundled products.
 * Execute every seed-XXX.sql on Cloudflare D1, then seed-999-ready.sql LAST.
 */
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { productFromBundledRow, parseBundledCatalog } from '../public/bundled-catalog.js';

const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(join(root,'public/catalog/manifest.json'),'utf8'));
const rows=manifest.parts.flatMap(part=>{
  if(typeof part!=='string'||!/^\/catalog\/products-[0-9a-f]{16}-\d{2}\.json$/i.test(part))
    throw Error('Beklenmeyen katalog dosyası: '+part);
  return JSON.parse(readFileSync(join(root,'public',part.slice(1)),'utf8'));
});
const {products}=parseBundledCatalog(manifest,rows);
if(products.length!==19096)throw Error('Beklenen ürün sayısı bulunamadı.');
const directory=join(root,'d1-seed-generated');
rmSync(directory,{recursive:true,force:true});
mkdirSync(directory,{recursive:true});
const sql=value=>"'"+String(value).replaceAll("'","''")+"'";
const perFile=300;
for(let i=0;i<products.length;i+=perFile){
  const batch=products.slice(i,i+perFile);
  const lines=['-- Generated D1 catalog seed: '+manifest.version+'; non-destructive, skips managed existing rows'];
  for(const p of batch){
    // Baseline rows contain no lifecycleStatus: bulk_at determines their default.
    lines.push('INSERT INTO product_changes(id,barcode,payload,updated_at) VALUES ('+
      [sql(p.id),sql(p.barkod),sql(JSON.stringify(p)),sql('1970-01-01T00:00:00.000Z')].join(',')+
      ') ON CONFLICT(id) DO NOTHING;');
  }
  const filename='seed-'+String(1+Math.floor(i/perFile)).padStart(3,'0')+'.sql';
  writeFileSync(join(directory,filename),lines.join('\n')+'\n','utf8');
}
const final=[
  '-- Execute ONLY after all seed-XXX.sql files succeeded.',
  'INSERT INTO app_meta(key,value) VALUES (\'catalog_seed_version\','+sql(manifest.version)+')',
  ' ON CONFLICT(key) DO UPDATE SET value=excluded.value;',
  'INSERT INTO app_meta(key,value) VALUES (\'catalog_seed_count\','+sql(String(products.length))+')',
  ' ON CONFLICT(key) DO UPDATE SET value=excluded.value;'
].join('\n');
writeFileSync(join(directory,'seed-999-ready.sql'),final+'\n','utf8');
console.log(products.length+' ürün için '+Math.ceil(products.length/perFile)+' SQL paketi hazır: '+directory);
