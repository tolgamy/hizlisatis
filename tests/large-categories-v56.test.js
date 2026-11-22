import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAIN_CATEGORY_ORDER} from '../public/category-art.js';

const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const section=css.slice(css.lastIndexOf('/* Enlarge BOTH the dashboard'));

test('all twelve original category groups remain available on both screens',()=>{
  assert.equal(MAIN_CATEGORY_ORDER.length,12);
  assert.match(html,/id="desktopHomeCategoryGrid"/);
  assert.match(html,/id="homeCategoryShortcuts"/);
  assert.match(html,/id="categoryTree"/);
  assert.match(app,/for\(const node of sortCategoryNodes\(state\.categoryTreeData\)\)/);
  assert.match(app,/target\.append\(categoryTile\(node,hasChildren\)\)/);
});

test('phone main category grids use 3 columns with substantially bigger artwork',()=>{
  assert.match(section,/#homeCategoryShortcuts\.category-photo-grid,/);
  assert.match(section,/#categoryTree\.category-grid-page,/);
  assert.match(section,/#desktopHomeCategoryGrid\.desktop-home-category-grid/);
  assert.match(section,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(section,/min-height:clamp\(147px,34vw,200px\)!important/);
  assert.match(section,/min-height:90px!important/);
});

test('tablet and desktop use 4 columns with bigger photos and scrolling allowed',()=>{
  assert.match(section,/@media\(min-width:680px\)/);
  assert.match(section,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(section,/min-height:210px!important/);
  assert.match(section,/@media\(min-width:1180px\)/);
  assert.match(section,/min-height:245px!important/);
  assert.doesNotMatch(section,/max-height:\s*100vh|overflow:hidden\s*!important/);
  assert.match(worker,/large-categories-v56/);
});
