import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {MAIN_CATEGORY_ORDER} from '../public/category-art.js';

const load=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=load('index.html'),css=load('styles.css'),app=load('app.js'),sw=load('sw.js');
const responsive=css.slice(css.indexOf('/* v4.1 adaptive shell'));

test('layout adapts via viewport media queries, not user-agent or device brand',()=>{
  assert.ok(responsive.startsWith('/* v4.1 adaptive shell'));
  assert.match(html,/name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
  assert.match(responsive,/@media \(min-width:600px\) and \(orientation:portrait\)/);
  assert.match(responsive,/@media \(min-width:900px\) and \(min-height:600px\) and \(orientation:landscape\), \(min-width:1440px\)/);
  assert.match(responsive,/@media \(min-width:1440px\)/);
  assert.doesNotMatch(responsive,/navigator\.userAgent|iPhone|iPad|Android|deviceType/);
});
test('phone navigation is four buttons with no separate redundant Categories tab',()=>{
  const nav=html.slice(html.indexOf('<nav class="bottom-nav"'),html.indexOf('</nav>')+6);
  const mobileIds=[...nav.matchAll(/id="(navHome|navSale|navProducts|navSettings)"/g)].map(x=>x[1]);
  assert.deepEqual(mobileIds,['navHome','navSale','navProducts','navSettings']);
  assert.doesNotMatch(nav,/id="navCategories"/);
  assert.match(responsive,/\.desktop-only-nav\{display:none!important\}/);
  assert.match(responsive,/\.bottom-shell \.bottom-nav\{\s*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(app,/\$\('homeQuickCategories'\)\.addEventListener\('click',openProductCategoryHome\)/);
  assert.match(app,/state\.view==='catalog' \? 'products' : state\.view/);
});
test('portrait tablets preserve the 3-column and 4-row main category grid',()=>{
  const portrait=responsive.slice(responsive.indexOf('@media (min-width:600px) and (orientation:portrait)'),
    responsive.indexOf('/* Tablet landscape'));
  assert.match(portrait,/#homeCategoryShortcuts\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(portrait,/#categoryTree\.category-grid-page\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.equal(MAIN_CATEGORY_ORDER.length,12);
  assert.match(css,/#homeCategoryShortcuts\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
});
test('original landscape tablet layout remains; desktop Product landing gets the v64 six-column override',()=>{
  assert.match(html,/id="desktopHomeCategoryGrid"/);
  assert.match(html,/id="sidebarStock"/);
  assert.match(html,/id="sidebarReports"/);
  assert.match(responsive,/#app::before\{/);
  assert.match(responsive,/\.bottom-shell \.bottom-nav\{[\s\S]*?position:fixed!important/);
  assert.match(responsive,/#desktopHomeCategoryGrid\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(responsive,/#homeCategoryShortcuts\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(responsive,/#categoryTree\.category-grid-page\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  const latest=css.slice(css.indexOf('/* v64 — approved Products workspace:'));
  assert.match(latest,/#productCategoryHome #homeCategoryShortcuts\.category-photo-grid/);
  assert.match(latest,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/);
  assert.match(responsive,/\.bottom-shell \.bottom-nav \.desktop-only-nav\{\s*display:flex!important/);
  assert.match(responsive,/#navHome\{order:1\}[\s\S]*?#navProducts\{order:2\}[\s\S]*?#navSale\{order:3\}/);
  assert.match(responsive,/grid-template-areas:"hero metrics" "actions actions" "categories categories"/);
});
test('desktop and mobile categories use the exact same twelve source nodes and clicks',()=>{
  const start=app.indexOf('function renderHome()');
  const end=app.indexOf('let homeSalesReadId=0;',start);
  assert.ok(start>=0&&end>start);
  const code=app.slice(start,end);
  const tile=()=>({nodes:[],replaceChildren(){this.nodes=[]},append(child){this.nodes.push(child)}});
  const mobile=tile(),desktop=tile(),total={textContent:''};
  let inlineRefreshes=0;
  const nodes=MAIN_CATEGORY_ORDER.map(name=>({name,path:name,children:[{name:'child'}]}));
  const state={categoryTreeData:nodes,products:[{id:'a',lifecycleStatus:'active'},{id:'b',lifecycleStatus:'deleted'}]};
  const sandbox={
    state,
    $:id=>({homeCategoryShortcuts:mobile,desktopHomeCategoryGrid:desktop,homeTotalProducts:total})[id],
    document:{createElement:tag=>({tag,className:'',setAttribute(){},textContent:''})},
    categoryTile:(node,hasChildren)=>({path:node.path,hasChildren,children:[],append(value){this.children.push(value)}}),
    sortCategoryNodes:n=>n,productStatus:p=>p.lifecycleStatus,
    renderInlineProductSubcategories:()=>{inlineRefreshes++;}
  };
  runInNewContext(code+';renderHome()',sandbox);
  assert.equal(inlineRefreshes,1);
  assert.equal(mobile.nodes.length,12);
  assert.equal(desktop.nodes.length,12);
  assert.deepEqual(mobile.nodes.map(x=>x.path),[...MAIN_CATEGORY_ORDER]);
  assert.deepEqual(desktop.nodes.map(x=>x.path),[...MAIN_CATEGORY_ORDER]);
  assert.equal(total.textContent,'1');
  assert.equal(desktop.nodes[0].children[0].textContent,'›');
});
test('sidebar buttons route to existing stock and reports workflows',()=>{
  assert.match(app,/\$\('sidebarStock'\)\.addEventListener\('click',\(\)=>\$\('homeQuickStock'\)\.click\(\)\)/);
  assert.match(app,/\$\('sidebarReports'\)\.addEventListener\('click',\(\)=>\$\('homeQuickReports'\)\.click\(\)\)/);
  assert.match(app,/\$\('navProducts'\)\.addEventListener\('click',openProductCategoryHome\)/);
  assert.match(app,/state\.catalogMode='categories';state\.catalogEntry='products'/);
  assert.match(html,/id="settingsView"/);
  assert.match(html,/id="cartDialog"/);
  assert.match(sw,/cep-pos-shell-v50-one-tap-live-scale/);
});
