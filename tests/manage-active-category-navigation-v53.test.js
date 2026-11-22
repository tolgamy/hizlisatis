import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const app=read('product-management.js'),html=read('index.html'),css=read('styles.css'),sw=read('sw.js');
const start=app.indexOf('  const isPassiveList=');
const end=app.indexOf('  function syncCategories(',start);
assert.ok(start>0&&end>start,'manager category and card render functions must exist');
const source=app.slice(start,end);

class Element {
  constructor(tag='div'){
    this.tag=tag;this.children=[];this.textContent='';this.hidden=false;
    this.disabled=false;this.listeners={};this.attributes={};this.classes=new Set();
    this.classList={toggle:(name,enabled)=>{
      if(enabled)this.classes.add(name);else this.classes.delete(name);
    },contains:name=>this.classes.has(name)};
  }
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=[...children];this.textContent=''}
  setAttribute(name,value){this.attributes[name]=String(value)}
  addEventListener(type,listener){this.listeners[type]=listener}
  click(){this.listeners.click?.()}
}

function scenario(filter){
  const ids=['manageCategoryBrowser','manageCategoryGrid','manageCategoryBack',
    'manageCategoryTitle','manageCategoryHelp','manageResultCount','manageResults'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const products=[
    {id:'barbunya',lifecycleStatus:'active',baslik:'Barbunya',
      barkod:'1001',satisFiyati:65,kategoriYolu:['Manav','Sebzeler']},
    {id:'elma',lifecycleStatus:'initial-inactive',baslik:'Elma',
      barkod:'2002',satisFiyati:30,kategoriYolu:['Manav','Meyveler']},
    {id:'patlican',lifecycleStatus:'later-inactive',baslik:'Patlıcan',
      barkod:'3003',satisFiyati:40,kategoriYolu:['Manav','Sebzeler']},
    {id:'silinen',lifecycleStatus:'deleted',baslik:'Silinen',
      barkod:'4004',satisFiyati:50,kategoriYolu:['Manav','Sebzeler']}
  ];
  const state={products,catalogLoading:false,catalogError:null};
  const events=[],search={value:''};
  const ctx={
    filter,state,search,results:elements.manageResults,
    document:{createElement:tag=>new Element(tag)},
    MAIN_CATEGORY_ORDER:['Manav','Kasap','Fırından & Yiyecek'],
    productCategoryPath:product=>product.kategoriYolu,
    categoryArtwork:category=>'/images/'+category,
    productStatus:product=>product.lifecycleStatus,
    format:price=>price+' TL',
    safeImageUrl:()=>null,
    text:value=>String(value??''),
    offerManualActivation:product=>events.push(['activate',product.id]),
    editProduct:product=>events.push(['edit',product.id]),
    $:id=>elements[id]
  };
  const runner=runInNewContext(
    '(function(ctx){'+
    'const {state,search,results,document,MAIN_CATEGORY_ORDER,productCategoryPath,'+
    'categoryArtwork,productStatus,format,safeImageUrl,text,offerManualActivation,'+
    'editProduct,$}=ctx;'+
    'let filter=ctx.filter,manageCategoryRoot="",manageCategorySub="",manageVisibleLimit=40;'+
    'function counts(){};'+source+
    'return {renderResults,getCategory:()=>({root:manageCategoryRoot,sub:manageCategorySub})};'+
    '})',{}
  );
  const manager=runner(ctx);
  const initial=JSON.stringify(state.products);
  manager.renderResults();
  assert.equal(elements.manageCategoryBrowser.hidden,false,'category browser visible for '+filter);
  assert.match(elements.manageResultCount.textContent,filter==='active'?/aktif ürün/:/pasif ürün/);
  const tile=elements.manageCategoryGrid.children.find(item=>
    item.children.some(child=>child.textContent==='Manav'));
  assert.ok(tile,'Manav category card visible');
  assert.equal(tile.disabled,false);
  assert.match(tile.children.find(child=>child.tag==='small').textContent,
    filter==='active'?/aktif ürün/:/pasif ürün/);
  tile.click();
  assert.equal(manager.getCategory().root,'Manav');
  const subName=filter==='initial-inactive'?'Meyveler':'Sebzeler';
  const sub=elements.manageCategoryGrid.children.find(item=>
    item.children.some(child=>child.textContent===subName));
  assert.ok(sub,'subcategory present');
  sub.click();
  assert.equal(manager.getCategory().sub,subName);
  assert.equal(elements.manageResults.classList.contains('manage-photo-grid'),true,
    'same photo layout as passive products');
  const card=elements.manageResults.children.find(item=>item.className==='manage-product-card');
  assert.ok(card,'photo product card present');
  const photo=card.children.find(item=>item.className==='manage-product-photo');
  const badge=photo.children.find(item=>item.className?.startsWith('manage-product-badge'));
  assert.equal(badge.textContent,filter==='active'?'Aktif':'Pasif');
  if(filter==='active')assert.match(badge.className,/is-active/);
  else assert.doesNotMatch(badge.className,/is-active/);
  card.click();
  const id=filter==='active'?'barbunya':filter==='initial-inactive'?'elma':'patlican';
  assert.deepEqual(events,[[filter==='active'?'edit':'activate',id]]);

  elements.manageCategoryBack.onclick();
  assert.equal(manager.getCategory().sub,'');
  elements.manageCategoryBack.onclick();
  assert.equal(manager.getCategory().root,'');
  search.value=filter==='active'?'Barbunya':filter==='initial-inactive'?'Elma':'Patlıcan';
  manager.renderResults();
  assert.equal(elements.manageCategoryBrowser.hidden,true,
    'search keeps the existing text list and bypasses folders');
  assert.equal(elements.manageResults.classList.contains('manage-photo-grid'),false);
  assert.equal(elements.manageResults.children.length,1);
  assert.equal(JSON.stringify(products),initial,'navigation must not mutate product status or data');
}

test('active products use exact passive categories, photo cards, editing and back navigation',
  ()=>scenario('active'));
test('initial passive products retain their same photo cards and activation behavior',
  ()=>scenario('initial-inactive'));
test('later passive products retain their same photo cards and activation behavior',
  ()=>scenario('later-inactive'));
test('markup and styling reuse existing passive grid; new PWA cache is versioned',()=>{
  assert.match(html,/id="manageCategoryBrowser"/);
  assert.match(html,/id="manageCategoryHelp"/);
  assert.match(css,/#manageResults\.manage-photo-grid/);
  assert.match(css,/#manageResults \.manage-product-badge\.is-active/);
  assert.match(sw,/active-categories-v53/);
  assert.doesNotMatch(app,/saveManagedProduct\([^)]*manageCategoryRoot/);
});
