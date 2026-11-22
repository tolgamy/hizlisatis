import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAIN_CATEGORY_ORDER} from '../public/category-art.js';

const read=filename=>readFileSync(new URL('../public/'+filename,import.meta.url),'utf8');
const css=read('styles.css'),html=read('index.html'),app=read('app.js'),sw=read('sw.js');
const start=css.indexOf('/* v59 — Approved separate desktop layouts:');
assert.ok(start>0,'v59 desktop rules must be loaded after older legacy rules');
const patch=css.slice(start);

test('desktop Home uses six columns and exactly two rows with 12 existing categories',()=>{
  assert.equal(MAIN_CATEGORY_ORDER.length,12);
  assert.match(html,/id="desktopHomeCategoryGrid"/);
  assert.match(app,/for\(const node of sortCategoryNodes\(state.categoryTreeData\)\)/);
  assert.match(app,/desktop\.append\(card\)/);
  const start=patch.indexOf('#desktopHomeCategoryGrid.desktop-home-category-grid {');
  const end=patch.indexOf('  #desktopHomeCategoryGrid .photo-category-tile',start);
  const grid=patch.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(grid,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/);
  assert.match(grid,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.doesNotMatch(grid,/grid-template-columns:repeat\(4/);
});

test('Home uses a compact welcome, real sales metrics and short action row',()=>{
  assert.match(patch,/#homeView\.dashboard-home \{/);
  assert.match(patch,/grid-template-areas:"hero metrics" "actions actions" "categories categories"/);
  assert.match(patch,/#homeView \.dashboard-hero \{/);
  assert.match(patch,/height:108px!important/);
  assert.match(patch,/#homeView \.dashboard-actions \{/);
  assert.match(patch,/height:49px!important/);
  assert.match(patch,/#desktopHomeCategories h2/);
  assert.match(html,/id="homeTodaySales"/);
  assert.match(html,/id="homeTotalProducts"/);
});

test('Products retains four columns and has bigger category photos than Home',()=>{
  for(const id of ['categoryTree','homeCategoryShortcuts'])
    assert.match(html,new RegExp('id="'+id+'"'));
  const categoryRules=patch.slice(patch.indexOf('/* Product categories: 4x3'));
  assert.match(categoryRules,/#categoryTree\.category-grid-page,/);
  assert.match(categoryRules,/#homeCategoryShortcuts\.category-photo-grid/);
  assert.match(categoryRules,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(categoryRules,/height:clamp\(220px,20vw,280px\)!important/);
  assert.match(categoryRules,/transform:scale\(1\.38\)!important/);
  assert.match(patch,/object-fit:contain!important/);
  assert.match(patch,/#desktopHomeCategoryGrid \.photo-category-image img/);
  assert.match(patch,/transform:scale\(1\.18\)!important/);
});

test('only desktop mouse landscapes change; mobile three columns remain',()=>{
  assert.match(patch,/@media \(min-width:1024px\) and \(min-height:600px\) and \(orientation:landscape\) and \(hover:hover\) and \(pointer:fine\)/);
  const earlyCSS=css.slice(0,start);
  assert.match(earlyCSS,/#homeCategoryShortcuts\.category-photo-grid,/);
  assert.match(earlyCSS,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(sw,/home-6x2-product-images-v59/);
  assert.match(html,/id="cartDialog"/);
  assert.match(html,/id="settingsOpenUsers"/);
  assert.match(app,/await authorizeCheckout\(record\)/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});
