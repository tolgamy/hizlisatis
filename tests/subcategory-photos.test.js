import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {subcategoryPhoto,SUBCATEGORY_PHOTO_COUNT} from '../public/subcategory-photos.js';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const imageMap=read('subcategory-photos.js');
const app=read('app.js');
const manager=read('product-management.js');
const css=read('styles.css');

test('exactly 86 separate category-matched photos, no product SKU photo selection',()=>{
  assert.equal(SUBCATEGORY_PHOTO_COUNT,86);
  const rows=[...imageMap.matchAll(/^\s*\["([^"]+)",(\d+)\],?$/gm)];
  assert.equal(rows.length,86);
  assert.equal(new Set(rows.map(row=>row[1])).size,86);
  assert.equal(new Set(rows.map(row=>row[2])).size,86);
  for(const row of rows) {
    const url=subcategoryPhoto(row[1]);
    assert.ok(url?.startsWith('https://images.pexels.com/photos/'+row[2]+'/'));
    assert.equal(url.includes('data:image'),false);
  }
  assert.equal(subcategoryPhoto('not-a-category'),null);
  assert.notEqual(subcategoryPhoto('Kasap > Kırmızı Et'),subcategoryPhoto('Kasap > Beyaz Et'));
  assert.notEqual(subcategoryPhoto('Atıştırmalık > Çikolata'),subcategoryPhoto('Atıştırmalık > Sağlıklı Beslenme'));
});

test('approved main category art and management category browser stay unchanged',()=>{
  assert.match(app,/return path\.includes\(' > '\)\?\(subcategoryPhoto\(path\)\|\|categoryArtwork\(path\)\):categoryArtwork\(path\)/);
  assert.match(app,/:categoryArtwork\(path\)/);
  assert.match(manager,/illustration\.src=categoryArtwork\(choice\.path\)/);
  assert.match(css,/#categoryTree\.category-grid-page/);
});
