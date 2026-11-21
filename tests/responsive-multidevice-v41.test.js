import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {MAIN_CATEGORY_ORDER} from '../public/category-art.js';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),css=read('styles.css'),app=read('app.js'),sw=read('sw.js');
const layout=css.slice(css.indexOf('/* v4.1 — viewport-driven adaptive layout;'));

test('phone: retain 3×4 product category grid and approved four-button footer',()=>{
  assert.equal(MAIN_CATEGORY_ORDER.length,12);
  assert.match(css,/@media\(max-width:679px\)\{/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  const nav=html.slice(html.indexOf('<nav class="bottom-nav"'),html.indexOf('</nav>',html.indexOf('<nav class="bottom-nav"')));
  assert.deepEqual([...nav.matchAll(/id="(navHome|navSale|navProducts|navSettings)"/g)].map(m=>m[1]),
    ['navHome','navSale','navProducts','navSettings']);
  assert.doesNotMatch(nav,/id="navCategories"/);
  assert.match(layout,/\.bottom-shell \.bottom-nav\{\s*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(layout,/\.desktop-sidebar,\s*\.dashboard-desktop-categories\{\s*display:none/);
  assert.match(html,/id="homeQuickCategories"/); // browsing remains accessible on home
});

test('portrait tablet: 3-column, four-row pictures and footer, no sidebar',()=>{
  assert.match(layout,/@media \(min-width:680px\) and \(max-width:1279px\) and \(orientation:portrait\)/);
  assert.match(layout,/#homeCategoryShortcuts\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(layout,/#categoryTree\.category-grid-page\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(layout,/\.bottom-shell \.bottom-nav\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/);
});

test('tablet landscape & Full HD: show real sidebar and exactly four category columns',()=>{
  assert.match(layout,/@media \(min-width:800px\) and \(min-height:550px\) and \(orientation:landscape\),\s*\(min-width:1280px\)/);
  assert.match(layout,/\.desktop-sidebar\{\s*display:flex/);
  assert.match(layout,/\.bottom-shell\{display:none!important\}/);
  assert.match(layout,/#homeCategoryShortcuts\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(layout,/#categoryTree\.category-grid-page\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(layout,/\.dashboard-desktop-grid\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(layout,/\.dashboard-desktop-categories\{[\s\S]*?display:block/);
  assert.match(layout,/#productResults \.products\.grid-view\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(layout,/@media \(min-width:1200px\) and \(min-height:550px\) and \(orientation:landscape\),\s*\(min-width:1280px\)/);
  assert.match(layout,/grid-template-areas:"hero metrics" "actions actions" "categories categories"/);
});

test('desktop sidebar controls all link to existing working screens, not fake links',()=>{
  const ids=['desktopNavHome','desktopNavProducts','desktopNavSale',
    'desktopNavStock','desktopNavReports','desktopNavSettings'];
  for(const id of ids)assert.match(html,new RegExp('id="'+id+'" type="button"'));
  for(const pattern of [
    /\$\('desktopNavHome'\)\.addEventListener\('click',\(\)=>setView\('home'\)\)/,
    /\$\('desktopNavProducts'\)\.addEventListener\('click',openProductCategoryHome\)/,
    /\$\('desktopNavSale'\)\.addEventListener\('click',openSale\)/,
    /\$\('desktopNavSettings'\)\.addEventListener\('click',\(\)=>setView\('settings'\)\)/,
    /\$\('desktopNavReports'\)\.addEventListener\('click',showHistory\)/,
    /\$\('desktopNavStock'\)\.addEventListener\('click',openStockProducts\)/
  ]) assert.match(app,pattern);
  assert.doesNotMatch(app,/\$\('navCategories'\)/);
  assert.match(app,/\$\('desktopConnectionText'\)\.textContent = navigator\.onLine/);
});

test('the same 12 category tiles appear in Products and on desktop dashboard',()=>{
  assert.match(html,/id="desktopHomeCategoryGrid"/);
  assert.match(html,/id="homeCategoryShortcuts"/);
  assert.match(app,/target\.append\(categoryTile\(node,Boolean\(node\.children\.length\)\)\)/);
  assert.match(app,/desktop\.append\(categoryTile\(node,Boolean\(node\.children\.length\)\)\)/);
  assert.match(app,/function categoryCover\(path\)/);
  assert.match(app,/categoryOverrideUrl\(path\)\|\|originalCategoryCover\(path\)/);
  assert.match(app,/\$\('homeTotalProducts'\)\.textContent/);
  assert.match(app,/async function refreshHomeSales\(\)/);
});

test('active state is shared by the four mobile tabs and desktop sidebar',()=>{
  const code=app.slice(app.indexOf('function updateNavigation()'),app.indexOf('function navigate('));
  assert.ok(code.startsWith('function updateNavigation()'));
  const els=new Map();
  const makeEl=()=>({
    hidden:false,open:false,attributes:{},
    classList:{values:new Set(),toggle(key,yes){if(yes)this.values.add(key);else this.values.delete(key)},
      remove(key){this.values.delete(key)}},
    setAttribute(k,v){this.attributes[k]=v;},
    removeAttribute(k){delete this.attributes[k]}
  });
  const $=id=>{if(!els.has(id))els.set(id,makeEl());return els.get(id)};
  const state={view:'home',catalogMode:'category-home',catalogEntry:'products'};
  const ctx={
    $,
    state,
    dom:{cartDialog:{open:false}},
    document:{body:{classList:{toggle(){}}}}
  };
  const invoke=()=>runInNewContext(code+';updateNavigation()',ctx);
  invoke();
  assert.equal($('navHome').attributes['aria-current'],'page');
  assert.equal($('desktopNavHome').attributes['aria-current'],'page');
  state.view='catalog';invoke();
  assert.equal($('navProducts').attributes['aria-current'],'page');
  assert.equal($('desktopNavProducts').attributes['aria-current'],'page');
  state.view='settings';invoke();
  assert.equal($('navSettings').attributes['aria-current'],'page');
  assert.equal($('desktopNavSettings').attributes['aria-current'],'page');
  ctx.dom.cartDialog.open=true;invoke();
  assert.equal($('navSale').attributes['aria-current'],'page');
  assert.equal($('desktopNavSale').attributes['aria-current'],'page');
});

test('CSS viewport routing is automatic, PWA cache refreshes and receipt printing excludes sidebar',()=>{
  assert.match(sw,/cep-pos-shell-v35-responsive-multidevice/);
  assert.match(layout,/@media print\{\s*\.desktop-sidebar,\.dashboard-desktop-categories\{display:none!important\}/);
  assert.match(html,/id="cartDialog"/);
  assert.match(html,/id="manageDialog"/);
  assert.match(html,/id="settingsCategoryImages"/);
  assert.match(css,/#manageResults\.manage-photo-grid/);
});
