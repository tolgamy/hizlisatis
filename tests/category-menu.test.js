import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCategoryTree, categoryMatches, productCategoryPath } from '../public/category-menu.js';
const catalog = [
  { id:'1', kategori:'Kasap > Kırmızı Et', kategoriYolu:['Kasap','Kırmızı Et'] },
  { id:'2', kategori:'Kasap > Tavuk', kategoriYolu:['Kasap','Tavuk'] },
  { id:'3', kategori:'Kasap > Kırmızı Et' },
  { id:'4', kategori:'Manav > Sebze' },
  { id:'5', kategori:'' }
];
test('category hierarchy and missing categories', () => {
  assert.deepEqual(productCategoryPath(catalog[0]),['Kasap','Kırmızı Et']);
  assert.deepEqual(productCategoryPath(catalog[4]),['Diğer']);
});
test('parent includes subcategories without false prefix matching', () => {
  assert.equal(categoryMatches(catalog[0],'Kasap'),true);
  assert.equal(categoryMatches(catalog[1],'Kasap > Tavuk'),true);
  assert.equal(categoryMatches(catalog[1],'Kas'),false);
  assert.equal(categoryMatches(catalog[3],'Kasap'),false);
});
test('count and sort category variants', () => {
  const tree=buildCategoryTree(catalog);
  const butcher=tree.find(x=>x.name==='Kasap');
  assert.equal(butcher.count,3);
  assert.deepEqual(butcher.children.map(x=>[x.name,x.count]),[['Kırmızı Et',2],['Tavuk',1]]);
});
