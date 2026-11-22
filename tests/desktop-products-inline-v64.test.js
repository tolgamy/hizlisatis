import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const load=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=load('app.js'),html=load('index.html'),css=load('styles.css'),sw=load('sw.js');
const v64=css.slice(css.indexOf('/* v64 — approved Products workspace:'),
  css.indexOf('/* v65 — Native desktop Sale & Reports pages.'));
const desktop='(min-width:1024px) and (min-height:600px) and (orientation:landscape) and (hover:hover) and (pointer:fine)';

test('Products landing uses 3 columns × 4 larger rows, with the existing images',()=>{
  assert.ok(v64.startsWith('/* v64'));
  assert.ok(v64.includes('@media '+desktop));
  assert.match(v64,/#productCategoryHome #homeCategoryShortcuts\.category-photo-grid/);
  // Historical v64 CSS remains in the stylesheet but v68 wins by CSS order.
  const v68=css.slice(css.indexOf('/* v68 — approved 3 across'));
  assert.ok(v68.startsWith('/* v68'));
  assert.ok(v68.includes('@media '+desktop));
  assert.match(v68,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(v68,/grid-template-rows:repeat\(4,clamp\(240px,22vw,315px\)\)!important/);
  assert.match(v68,/height:clamp\(240px,22vw,315px\)!important/);
  assert.match(v68,/transform:scale\(1\.30\)!important/);
  assert.match(v68,/font-size:clamp\(15px,1\.22vw,19px\)!important/);
  assert.doesNotMatch(v68,/#desktopHomeCategoryGrid|#cartDialog|#historyDialog|#homeView/);
  assert.match(v64,/object-fit:contain!important/);
  assert.match(app,/target\.append\(categoryTile\(node,hasChildren\)\)/);
  assert.match(app,/categoryCover\(node\.path\)/);
  assert.match(app,/sortCategoryNodes\(state\.categoryTreeData\)/);
  assert.match(sw,/desktop-products-3x4-v68/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});

test('inline subcategories and quick actions stay inside Products, not in extra modal dialogs',()=>{
  const products=html.slice(html.indexOf('<section id="productCategoryHome"'),
    html.indexOf('<section id="productResults"',html.indexOf('<section id="productCategoryHome"')));
  for(const id of ['homeCategoryShortcuts','productCategoryBrowseAll',
    'productCategoryBrowseCategories','productSubcategoriesPanel','productSubcategoriesTitle',
    'productSubcategoryList','productSubcategoriesAll','productSubcategoriesClose']) {
    assert.ok(products.includes('id="'+id+'"'),id);
  }
  assert.match(products,/id="productSubcategoriesPanel"[^>]*hidden/);
  assert.match(v64,/#productSubcategoriesPanel\[hidden\] \{display:none!important\}/);
  assert.match(v64,/\.product-category-quickbar \{\s*display:none/);
  assert.match(app,/\$\('productCategoryBrowseAll'\)\.addEventListener\('click',showAllProducts\)/);
  assert.match(app,/\$\('productCategoryBrowseCategories'\)\.addEventListener\('click',openCategoryBrowser\)/);
  assert.match(app,/\$\('productSubcategoriesAll'\)\.addEventListener/);
});

test('desktop selection renders only real children, closes on second click and stays hidden on mobile',()=>{
  const start=app.indexOf('function renderInlineProductSubcategories()');
  const end=app.indexOf('function renderHomeStockInsights()',start);
  assert.ok(start>0&&end>start);
  const tile=(path)=>({dataset:{categoryPath:path},attributes:{},classList:{toggle(name,enabled){this[name]=enabled;}},setAttribute(name,value){this.attributes[name]=value;}});
  const cards=[tile('Kasap'),tile('Manav')];
  const node=(tag='div')=>({
    tagName:tag.toUpperCase(),hidden:false,textContent:'',children:[],
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=children;},
    scrollIntoView(opts){this.scrolled=opts;},
    querySelectorAll(){return cards;}
  });
  const dom=Object.fromEntries(['productSubcategoriesPanel','productSubcategoryList','homeCategoryShortcuts',
    'productSubcategoriesTitle','productSubcategoriesCount','productSubcategoriesAll'].map(id=>[id,node()]));
  dom.productSubcategoriesPanel.hidden=true;
  const state={view:'catalog',catalogMode:'category-home',expandedProductCategory:'',
    categoryTreeData:[
      {name:'Kasap',path:'Kasap',children:[
        {name:'Kırmızı Et',path:'Kasap > Kırmızı Et',count:8,children:[]},
        {name:'Gizli',path:'Kasap > Gizli',count:0,children:[]},
        {name:'Beyaz Et',path:'Kasap > Beyaz Et',count:5,children:[]},
      ]},
      {name:'Manav',path:'Manav',children:[{name:'Meyve',path:'Manav > Meyve',count:2,children:[]}]}
    ]
  };
  let desktop=true;
  const context={state,$:id=>dom[id],useDesktopWorkspace:()=>desktop,
    sortCategoryNodes:children=>[...children].sort((a,b)=>a.name.localeCompare(b.name,'tr')),
    showCategoryInBrowse:child=>child.count>0,
    categoryTile:(child,hasChildren)=>({path:child.path,hasChildren})};
  const {renderInlineProductSubcategories,toggleProductInlineCategory}=runInNewContext(
    app.slice(start,end)+';({renderInlineProductSubcategories,toggleProductInlineCategory})',context);
  toggleProductInlineCategory('Kasap');
  assert.equal(dom.productSubcategoriesPanel.hidden,false);
  assert.equal(dom.productSubcategoriesTitle.textContent,'Kasap Alt Kategorileri');
  assert.equal(dom.productSubcategoriesCount.textContent,'2 alt kategori');
  assert.deepEqual(dom.productSubcategoryList.children.map(x=>x.path),
    ['Kasap > Beyaz Et','Kasap > Kırmızı Et']);
  assert.equal(cards[0].attributes['aria-expanded'],'true');
  assert.equal(cards[1].attributes['aria-expanded'],'false');
  assert.equal(dom.productSubcategoriesAll.textContent,'Kasap – Tüm Ürünleri Gör');
  toggleProductInlineCategory('Kasap');
  assert.equal(dom.productSubcategoriesPanel.hidden,true);
  assert.equal(state.expandedProductCategory,'');
  toggleProductInlineCategory('Manav');
  assert.equal(dom.productSubcategoryList.children.length,1);
  desktop=false;
  renderInlineProductSubcategories();
  assert.equal(dom.productSubcategoriesPanel.hidden,true);
  assert.equal(dom.productSubcategoryList.children.length,0);
  assert.equal(cards[0].attributes['aria-expanded'],'false');
});

test('category card opens inline only on desktop Products landing; other routes are unchanged',()=>{
  const start=app.indexOf('function categoryTile(node, hasChildren = false)');
  const end=app.indexOf('/** The desktop category landing page',start);
  assert.ok(start>0&&end>start);
  const createElement=tag=>({
    tagName:tag,children:[],dataset:{},attrs:{},classList:{add(){}},
    append(...parts){this.children.push(...parts);},
    setAttribute(name,val){this.attrs[name]=val;},
    addEventListener(type,fn){this[type]=fn;},
  });
  const state={view:'catalog',catalogMode:'category-home',category:''};
  let desktop=true;const calls=[];
  const context={state,document:{createElement},
    categoryEmoji:()=>'',categoryCover:()=>'',originalCategoryCover:()=>'',applyProductImage(){},
    useDesktopWorkspace:()=>desktop,
    toggleProductInlineCategory:path=>calls.push('inline:'+path),
    openCategoryMenu:path=>calls.push('nested:'+path),
    selectCategory:path=>calls.push('product:'+path)};
  const categoryTile=runInNewContext(app.slice(start,end)+';categoryTile',context);
  const main={name:'Kasap',path:'Kasap',count:2},leaf={name:'Kırmızı Et',path:'Kasap > Kırmızı Et',count:1};
  categoryTile(main,true).click();assert.deepEqual(calls,['inline:Kasap']);
  desktop=false;categoryTile(main,true).click();assert.deepEqual(calls,['inline:Kasap','nested:Kasap']);
  desktop=true;state.view='home';categoryTile(main,true).click();
  assert.deepEqual(calls,['inline:Kasap','nested:Kasap','nested:Kasap']);
  state.view='catalog';categoryTile(leaf,false).click();
  assert.equal(calls.at(-1),'product:Kasap > Kırmızı Et');
});

test('Sale, Reports and Home keep the existing working layouts and payment/data safeguards',()=>{
  assert.match(app,/await authorizeCheckout\(record\)/);
  assert.match(app,/renderHistorySummary\(state\.sales\)/);
  assert.match(app,/placeNativeWorkspacePages\(\)/);
  assert.match(app,/navigate\('#sale'\)/);
  assert.match(app,/navigate\('#reports'\)/);
  assert.doesNotMatch(v64,/#cartDialog|#historyDialog|#settingsView|#homeView/);
});
