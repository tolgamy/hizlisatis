import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseBundledCatalog, productFromBundledRow, fetchBundledCatalog } from '../public/bundled-catalog.js';
import { mergeCatalog } from '../public/excel-products.js';
const root = new URL('../public/', import.meta.url);

async function data() {
  const manifest = JSON.parse(await readFile(new URL('catalog/manifest.json',root), 'utf8'));
  const pages = await Promise.all(manifest.parts.map(async part =>
    JSON.parse(await readFile(new URL('.'+part,root),'utf8'))));
  return {manifest, rows:pages.flat()};
}

test('embedded supplier product count, image count, and original barcode are intact',async()=>{
  const {manifest,rows}=await data();
  const parsed=parseBundledCatalog(manifest,rows);
  assert.equal(parsed.products.length,2636);
  assert.equal(parsed.withImages,2634);
  const latte=parsed.products.find(p=>p.barkod==='8692095346327');
  assert.equal(latte.baslik,'Sek Laktozsuz Latte (330 ml)');
  assert.equal(latte.gorsel,'https://locals-media-cdn.getirapi.com/images/6049063_NjA0OTA2Mw_1792497169133.jpg');
  assert.equal(latte.satisFiyati,119.95);
  assert.equal(latte.importFormat,'market-12');
  assert.equal(latte.source,'bundle');
  assert.equal(latte.kdvBelirsiz,true);
});

test('the 2636 products are available without XML, preserving leading zeros',async()=>{
  const {manifest,rows}=await data();
  const parsed=parseBundledCatalog(manifest,rows);
  const unique=new Set(parsed.products.map(x=>x.id));
  assert.equal(unique.size,2636);
  assert.equal(mergeCatalog([],parsed.products).length,2636);
  assert.equal(parsed.products.filter(x=>!x.gorsel).length,2);
});

test('existing XML matching barcode keeps its price, stock, VAT but gets bundled photo',async()=>{
  const {manifest,rows}=await data();
  const products=parseBundledCatalog(manifest,rows).products;
  const latte=products.find(x=>x.barkod==='8692095346327');
  const xml=[{id:'xml-123',urunKodu:'XML-123',baslik:'XML Latte',barkod:latte.barkod,
    stok:12,satisFiyati:99.9,kdv:20,paraBirimi:'TRY',gorsel:''}];
  const merged=mergeCatalog(xml,products);
  assert.equal(merged.length,2636);
  const match=merged.find(x=>x.barkod===latte.barkod);
  assert.equal(match.id,'xml-123');
  assert.equal(match.satisFiyati,99.9);
  assert.equal(match.stok,12);
  assert.equal(match.kdv,20);
  assert.equal(match.gorsel,latte.gorsel);
});

test('incomplete/invalid embedded catalogue is rejected before saving',async()=>{
  const {manifest,rows}=await data();
  assert.throws(()=>parseBundledCatalog(manifest,rows.slice(1)),/ürün sayısı/);
  const dupe=rows.map(r=>r.slice());dupe[0][0]=dupe[1][0];
  assert.throws(()=>parseBundledCatalog(manifest,dupe),/tekrarlı/);
  assert.throws(()=>productFromBundledRow(['','','','', '', -1,0,'','TRY']),/geçersiz/);
});

test('browser fetcher loads exact checked-in manifest and chunks',async()=>{
  const calls=[];
  const fakeFetch=async path=>{
    calls.push(path);
    const content=await readFile(new URL('.'+path,root),'utf8');
    return {ok:true,json:async()=>JSON.parse(content)};
  };
  const result=await fetchBundledCatalog(fakeFetch);
  assert.equal(result.products.length,2636);
  assert.equal(calls.length,9);
});
