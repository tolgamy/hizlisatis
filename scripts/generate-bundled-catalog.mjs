/** Generates the public, offline-first starter catalogue from the supplier's XLSX extract.
 * Source XLSX / extract stay out of the public GitHub repository.
 * Usage: node scripts/generate-bundled-catalog.mjs /private/path/rows.json
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseExcelProducts } from '../public/excel-products.js';

const sourcePath = process.argv[2];
if (!sourcePath) throw Error('Expected user-provided supplier rows JSON.');
const parsed = parseExcelProducts(JSON.parse(await readFile(resolve(sourcePath), 'utf8')));
if (parsed.errors.length || parsed.products.length !== 2636 || parsed.format !== 'market-12')
  throw Error(`Unexpected data: ${parsed.products.length} products; ${parsed.errors.slice(0, 5).join('; ')}`);

// Compact wire format: [barcode, sku, title, brand, category, price, stock, image, currency]
// Excel contains no VAT; runtime marks non-XML-matched rows as VAT unknown.
const rows = parsed.products.map(p => [
  p.barkod, p.urunKodu, p.baslik, p.marka, p.kategori, p.satisFiyati, p.stok, p.gorsel, p.paraBirimi
]);
const withImages = rows.filter(p => p[7]).length;
if (withImages !== 2634) throw Error(`Unexpected photo count ${withImages}`);
const version = createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
const perFile = 350;
const output = resolve('public/catalog');
await mkdir(output,{recursive:true});
const parts=[];
for (let index=0;index<rows.length;index+=perFile) {
  const name=`products-${version}-${String(index/perFile+1).padStart(2,'0')}.json`;
  parts.push('/catalog/'+name);
  await writeFile(resolve(output,name), JSON.stringify(rows.slice(index,index+perFile))+'\n');
}
const manifest={schema:1,version,count:rows.length,withImages,parts};
await writeFile(resolve(output,'manifest.json'), JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({version,count:rows.length,withImages,parts:parts.length,bytes:Buffer.byteLength(JSON.stringify(rows))}));
