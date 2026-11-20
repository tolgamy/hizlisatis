import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseBundledCatalog, productFromBundledRow, fetchBundledCatalog } from '../public/bundled-catalog.js';
const root=new URL('../public/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('catalog/manifest.json',root),'utf8'));
const rows=(await Promise.all(manifest.parts.map(async p=>JSON.parse(await readFile(new URL('.'+p,root),'utf8'))))).flat();

test('all 19,096 barcode-unique product rows are installed without XML',()=>{
  const parsed=parseBundledCatalog(manifest,rows);
  assert.equal(parsed.products.length,19096);
  assert.equal(parsed.withImages,14525);
  assert.equal(new Set(parsed.products.map(p=>p.barkod)).size,19096);
  assert.equal(parsed.products.filter(p=>p.stokBelirsiz).length,16460);
  assert.equal(parsed.products.filter(p=>p.fiyatBelirsiz).length,0);
});
test('old product survives barcode match and exact source photo',()=>{
  const parsed=parseBundledCatalog(manifest,rows);
  const latte=parsed.products.find(p=>p.barkod==='8692095346327');
  assert.equal(latte.baslik,'Sek Laktozsuz Latte (330 ml)');
  assert.equal(latte.satisFiyati,119.95);
  assert.equal(latte.gorsel,'https://locals-media-cdn.getirapi.com/images/6049063_NjA0OTA2Mw_1792497169133.jpg');
});
test('unknown stock and price are explicit and not falsified',()=>{
  const first=productFromBundledRow(['123','123','Dondurma','Marka','Dondurma',null,null,'','TRY']);
  assert.equal(first.fiyatBelirsiz,true);assert.equal(first.stokBelirsiz,true);
  assert.equal(first.kategoriAna,'Dondurma');
});
test('corrupt bundled data is rejected',()=>{
  assert.throws(()=>parseBundledCatalog(manifest,rows.slice(1)),/ürün sayısı/);
  assert.throws(()=>productFromBundledRow(['','','','', '',-1,0,'','TRY']),/geçersiz/);
});
test('fetch uses bundled chunks and one manifest',async()=>{
  const calls=[];const fetcher=async path=>{
    calls.push(path);return {ok:true,json:async()=>JSON.parse(await readFile(new URL('.'+path,root),'utf8'))};
  };
  const data=await fetchBundledCatalog(fetcher);
  assert.equal(data.products.length,19096);assert.equal(calls.length,21);
});
