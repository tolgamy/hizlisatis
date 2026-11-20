/** Generate the public catalogue from a private, already-validated JSON rows export.
 * Source supplier workbook and source rows are NEVER committed to public git.
 * Usage: node scripts/generate-bundled-catalog.mjs /private/path/rows.json
 */
import { readFile, mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const src = process.argv[2];
if (!src) throw Error('Expected private supplier row array JSON.');
const rows = JSON.parse(await readFile(resolve(src), 'utf8'));
if (!Array.isArray(rows) || rows.length < 1 || rows.length > 30000 ||
    rows.some(r => !Array.isArray(r) || r.length !== 9)) throw Error('Invalid supplier rows.');
if (new Set(rows.map(r => r[0])).size !== rows.length) throw Error('Duplicated barcode in source rows.');
const version = createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
const out=resolve('public/catalog'); await mkdir(out,{recursive:true});
for (const file of await readdir(out)) if (/^products-[0-9a-f]{16}-\d{2}\.json$/i.test(file)) await unlink(resolve(out,file));
const parts=[];
for (let i=0;i<rows.length;i+=1000) {
 const name=`products-${version}-${String(i/1000+1).padStart(2,'0')}.json`;
 parts.push('/catalog/'+name);
 await writeFile(resolve(out,name),JSON.stringify(rows.slice(i,i+1000))+'\n');
}
const manifest={schema:1,version,count:rows.length,withImages:rows.filter(r=>r[7]).length,
  withoutStock:rows.filter(r=>r[6]===null).length,withoutPrice:rows.filter(r=>r[5]===null).length,parts};
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({version,...manifest,parts:parts.length}));
