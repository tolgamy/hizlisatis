import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {MAIN_CATEGORY_ORDER} from '../public/category-art.js';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('styles.css'),sw=read('sw.js');
const section=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('approved standalone new home has hero illustration, exactly six action cards and two data-driven KPIs',()=>{
  const home=section(html,'<section id="homeView"','<section id="catalogView"');
  assert.match(home,/HızlıSatış’a/);
  assert.match(home,/Hoş Geldiniz/);
  assert.match(home,/\/icons\/home-grocery-basket\.svg/);
  for(const id of ['homeQuickCategories','homeQuickSale','homeQuickProducts','homeQuickBarcode',
    'homeQuickStock','homeQuickReports','homeTodaySales','homeTotalProducts']){
    assert.match(home,new RegExp('id="'+id+'"'));
  }
  assert.equal((home.match(/class="dashboard-action dashboard-action-/g)||[]).length,6);
  assert.doesNotMatch(home,/id="homeCategoryShortcuts"/);
  assert.doesNotMatch(home,/₺1\.199,85|20\.458|12\.847/); // Never demo or invented metrics
  assert.match(css,/\.dashboard-actions\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.dashboard-metrics\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('the original twelve 3x4 picture tiles are moved to Products, without deleting category browser',()=>{
  const products=section(html,'<section id="catalogView"','<section id="settingsView"');
  assert.match(products,/id="catalogCategoryNavigator"/);
  assert.match(products,/id="categorySearch"/);
  assert.match(products,/id="categoryTree"/);
  assert.match(products,/id="productCategoryHome" hidden/);
  assert.match(products,/id="homeCategoryShortcuts" class="home-category-shortcuts category-photo-grid"/);
  assert.equal(MAIN_CATEGORY_ORDER.length,12);
  assert.match(app,/for\(const node of sortCategoryNodes\(state\.categoryTreeData\)\) \{/);
  assert.match(app,/target\.append\(categoryTile\(node,hasChildren\)\)/);
  assert.match(app,/desktop\.append\(card\)/);
  assert.match(app,/\$\('productCategoryHome'\)\.hidden=state\.catalogMode!=='category-home'/);
  assert.match(app,/\$\('catalogCategoryNavigator'\)\.hidden=state\.catalogMode!=='categories'/);
  assert.match(css,/#homeCategoryShortcuts \u002ephoto-category-image\{/);
});

test('approved four-tab mobile footer has no duplicate Categories button',()=>{
  const nav=section(html,'<nav class="bottom-nav"','</nav>');
  const names=[...nav.matchAll(/id="(navHome|navSale|navProducts|navSettings)"/g)].map(x=>x[1]);
  assert.deepEqual(names,['navHome','navSale','navProducts','navSettings']);
  assert.match(css,/\.bottom-shell \.bottom-nav\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(app,/state\.view==='catalog' \? 'products' : state\.view/);
  assert.doesNotMatch(html,/id="navCategories"/);
  assert.match(app,/\$\('navProducts'\)\.addEventListener\('click',openProductCategoryHome\)/);
  assert.match(app,/\$\('navSale'\)\.addEventListener\('click',openSale\)/);
  assert.match(app,/\$\('navSettings'\)\.addEventListener\('click',\(\)=>setView\('settings'\)\)/);
});

test('home buttons open existing workflows, not nonfunctional placeholders',()=>{
  const expected=[
    /\$\('homeQuickCategories'\)\.addEventListener\('click',openProductCategoryHome\)/,
    /\$\('homeQuickSale'\)\.addEventListener\('click',openSale\)/,
    /\$\('homeQuickProducts'\)\.addEventListener\('click',\(\)=>productManager\.openManage\(\)\)/,
    /\$\('homeQuickBarcode'\)\.addEventListener\('click',\(\)=>productManager\.openNew\(\)\)/,
    /\$\('homeQuickStock'\)\.addEventListener\('click'/,
    /\$\('homeQuickReports'\)\.addEventListener\('click',showHistory\)/,
    /\$\('homeTodaySalesButton'\)\.addEventListener\('click',showHistory\)/,
    /\$\('homeTotalProductsButton'\)\.addEventListener\('click',openProductCategoryHome\)/
  ];
  for(const regex of expected)assert.match(app,regex);
});

test('Products category-home deep link and existing nested category/product links still resolve',()=>{
  const code=section(app,'function applyRoute()','function setView(');
  const ctx={
    state:{view:'home',catalogEntry:'categories',catalogMode:'categories',categoryPage:'',category:'',browseAll:false},
    location:{hash:'#product-categories'},
    window:{scrollTo(){}},renderCategoryTree(){},renderProducts(){},updateNavigation(){},
    refreshHomeSales(){return Promise.resolve();},decodeURIComponent
  };
  runInNewContext(code+';applyRoute()',ctx);
  assert.equal(ctx.state.view,'catalog');
  assert.equal(ctx.state.catalogMode,'category-home');
  assert.equal(ctx.state.catalogEntry,'products');
  ctx.location.hash='#categories/Manav';
  runInNewContext(code+';applyRoute()',ctx);
  assert.equal(ctx.state.catalogMode,'categories');
  assert.equal(ctx.state.categoryPage,'Manav');
  ctx.location.hash='#products/Manav%20%3E%20Sebze';
  runInNewContext(code+';applyRoute()',ctx);
  assert.equal(ctx.state.catalogMode,'products');
  assert.equal(ctx.state.category,'Manav > Sebze');
  ctx.location.hash='#home';
  runInNewContext(code+';applyRoute()',ctx);
  assert.equal(ctx.state.view,'home');
});

test('today sales metric uses only true dated local sales and real active D1 catalogue, never example totals',async()=>{
  assert.match(app,/const sales=await getSales\(\)/);
  assert.match(app,/date\.toDateString\(\)===today/);
  assert.match(app,/sale\.currency==='TRY'/);
  assert.match(app,/state\.products\.filter\(product=>productStatus\(product\)!=='deleted'\)/);
  assert.match(app,/refreshHomeSales\(\)\.catch\(\(\)=>\{\}\)/);
  const source=section(app,'let homeSalesReadId=0;','function openProductDetail');
  const today=new Date();
  const yesterday=new Date(today.getTime()-86400000);
  const output={textContent:'—'};
  const ctx={
    $:()=>output,money:(sum)=>'TRY '+sum.toFixed(2),round2:x=>Math.round(x*100)/100,
    getSales:async()=>[
      {createdAt:today.toISOString(),currency:'TRY',total:123.45},
      {createdAt:today.toISOString(),currency:'TRY',total:12.05},
      {createdAt:today.toISOString(),currency:'USD',total:90},
      {createdAt:yesterday.toISOString(),currency:'TRY',total:900}
    ],Date,Number,Promise
  };
  await runInNewContext(source+';refreshHomeSales()',ctx);
  assert.equal(output.textContent,'TRY 135.50');
  assert.doesNotMatch(html,/20\.458|1\.199,85/);
});

test('new grocery illustration is locally available in PWA v34; sale and settings intact',()=>{
  const hero=read('icons/home-grocery-basket.svg');
  assert.match(hero,/<svg/);
  assert.match(hero,/id="basket"/);
  assert.match(sw,/cep-pos-shell-v35-responsive-all-devices/);
  assert.match(sw,/\/icons\/home-grocery-basket\.svg/);
  assert.match(html,/id="cartDialog"/);
  assert.match(html,/id="settingsView"/);
  assert.match(html,/id="settingsManage"/);
  assert.match(html,/id="categoryImageDialog"/);
  assert.match(css,/#manageResults\.manage-photo-grid/);
});
