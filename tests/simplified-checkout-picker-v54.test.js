import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {readPickerMode,savePickerMode} from '../public/picker-preferences.js';
import {buildCategoryTree,categoryMatches} from '../public/category-menu.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('styles.css'),sw=read('sw.js');
const pickStart=app.indexOf("let pickerMode='search'"),pickEnd=app.indexOf('function openCamera()',pickStart);
const payStart=app.indexOf('function updatePayment()'),payEnd=app.indexOf('function openCashPayment()',payStart);

class Element {
  constructor(tag='div'){
    this.tag=tag;this.children=[];this.hidden=false;this.textContent='';
    this.attrs={};this.listeners={};this.dataset={};this.value='';this.open=false;
    this.style={};this.classes=new Set();
    this.classList={toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k),
      contains:k=>this.classes.has(k)};
  }
  append(...children){this.children.push(...children)}
  replaceChildren(){this.children=[];this.textContent=''}
  addEventListener(k,f){this.listeners[k]=f}
  click(){this.listeners.click?.()}
  setAttribute(k,v){this.attrs[k]=String(v)}
  focus(){}
  showModal(){this.open=true}
  close(){this.open=false}
}

test('device-local product picker modes never leak between devices',()=>{
  const store=()=>{const data=new Map();return {
    getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)
  }};
  const a=store(),b=store();
  assert.equal(readPickerMode(a),'search');
  savePickerMode('categories',a);
  savePickerMode('list',b);
  assert.equal(readPickerMode(a),'categories');
  assert.equal(readPickerMode(b),'list');
  assert.throws(()=>savePickerMode('unexpected',a));
});

test('search, category and complete paginated list all use the existing sale routes',()=>{
  assert.ok(pickStart>0&&pickEnd>pickStart);
  const ids=['pickProductSearch','pickProductResults','pickerCategoryBrowser',
    'pickerCategoryGrid','pickerLoadMore','pickProductSearchWrap',
    'pickerCategoryBack','pickerCategoryTitle','pickProductDialog'];
  const els=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const tabs=['search','categories','list'].map(value=>{
    const el=new Element('button');el.dataset.pickerMode=value;return el;
  });
  const products=[
    {id:'barbunya',baslik:'Barbunya',barkod:'111',birim:'kg',satisFiyati:65,
      kategoriYolu:['Manav','Sebzeler'],lifecycleStatus:'active'},
    {id:'sut',baslik:'Süt',barkod:'112',birim:'adet',satisFiyati:30,
      kategoriYolu:['Süt Ürünleri & Kahvaltılık','Süt'],lifecycleStatus:'active'},
    {id:'pasif',baslik:'Pasif',barkod:'113',birim:'adet',satisFiyati:50,
      kategoriYolu:['Manav','Sebzeler'],lifecycleStatus:'initial-inactive'},
    ...Array.from({length:65},(_,i)=>({
      id:'elma-'+i,baslik:'Elma '+i,barkod:'9'+i,birim:'adet',satisFiyati:20,
      kategoriYolu:['Manav','Meyveler'],lifecycleStatus:'active'
    }))
  ];
  const actions=[];
  const ctx={
    state:{products},$:id=>els[id],
    document:{
      createElement:tag=>new Element(tag),
      querySelectorAll:sel=>sel==='[data-picker-mode]'?tabs:[]
    },
    fold:v=>String(v??'').toLocaleLowerCase('tr-TR'),
    isActive:p=>p.lifecycleStatus==='active',
    remaining:()=>10,buildCategoryTree,categoryMatches,
    sortCategoryNodes:roots=>roots,categoryArtwork:path=>'/art/'+path,
    priceLabel:p=>p.satisFiyati+' TL',productPictureEmoji:()=> '🍎',
    applyProductImage(){},isWeightProduct:p=>p.birim==='kg',
    addToCart:p=>{actions.push('add:'+p.id);return true},
    openWeightProduct:p=>actions.push('weight:'+p.id),
    openSale:()=>actions.push('sale'),
    readPickerMode:()=> 'categories'
  };
  const code="(function(c){const {state,$,document,fold,isActive,remaining,"+
    "buildCategoryTree,categoryMatches,sortCategoryNodes,categoryArtwork,"+
    "priceLabel,productPictureEmoji,applyProductImage,isWeightProduct,"+
    "addToCart,openWeightProduct,openSale,readPickerMode}=c;"+
    app.slice(pickStart,pickEnd)+
    "return {openProductPicker,renderProductPicker,changeMode:m=>"+
    "{pickerMode=m;pickerCategoryMain='';pickerCategorySub='';pickerVisibleLimit=60;renderProductPicker()},increase:()=>"+
    "{pickerVisibleLimit+=60;renderProductPicker()},back:()=>"+
    "{if(pickerCategorySub)pickerCategorySub='';else pickerCategoryMain='';renderProductPicker()},view:()=>"+
    "({mode:pickerMode,main:pickerCategoryMain,sub:pickerCategorySub})};})";
  const picker=runInNewContext(code)(ctx);
  picker.openProductPicker();
  assert.equal(picker.view().mode,'categories');
  const manav=els.pickerCategoryGrid.children.find(item=>
    item.children.some(child=>child.textContent==='Manav'));
  assert.ok(manav);
  manav.click();
  const vegetables=els.pickerCategoryGrid.children.find(item=>
    item.children.some(child=>child.textContent==='Sebzeler'));
  assert.ok(vegetables);
  vegetables.click();
  assert.equal(els.pickProductResults.children.length,1,'inactive produce never offered for sale');
  els.pickProductResults.children[0].click();
  assert.ok(actions.includes('weight:barbunya'),'weighed item must open the scale');
  picker.back();assert.equal(picker.view().sub,'');
  picker.back();assert.equal(picker.view().main,'');
  picker.changeMode('list');
  assert.equal(els.pickProductResults.children.length,60);
  assert.equal(els.pickerLoadMore.hidden,false);
  picker.increase();
  assert.equal(els.pickProductResults.children.length,67);
  assert.equal(els.pickerLoadMore.hidden,true);
  picker.changeMode('search');
  els.pickProductSearch.value='Süt';
  picker.renderProductPicker();
  assert.equal(els.pickProductResults.children.length,1);
  els.pickProductResults.children[0].click();
  assert.ok(actions.includes('add:sut'));
  picker.openProductPicker('111');
  assert.equal(picker.view().mode,'search','entered barcode takes priority over default folders');
  assert.equal(els.pickProductResults.children.length,1);
});

test('all payment modes preserve original cash, credit and external-payment notice',()=>{
  assert.ok(payStart>0&&payEnd>payStart);
  const elements={};
  const $=id=>elements[id]??(elements[id]=new Element());
  let selected='Nakit';
  const state={basketDiscountPct:10,basketDiscountInvalid:false,cart:new Map([['x',{}]])};
  const dom={cash:{value:'100'},change:{textContent:'',style:{}}};
  const ctx={
    document:{querySelector:()=>({value:selected})},dom,$,state,
    totals:()=>({total:90}),cartCurrency:()=> 'TRY',
    parseLocaleNumber:value=>Number(value),round2:v=>Math.round(v*100)/100,
    money:v=>v.toFixed(2)
  };
  const code="(function(c){const {document,dom,$,state,totals,cartCurrency,parseLocaleNumber,"+
    "round2,money}=c;"+app.slice(payStart,payEnd)+";return updatePayment;})";
  const update=runInNewContext(code)(ctx);
  for(const [mode,credit,external] of [
    ['Nakit',false,false],['Kart',false,false],['Veresiye',true,false],
    ['Havale / FAST',false,true],['Yemek Kartı',false,true],['Diğer',false,true]
  ]){
    selected=mode;update();
    assert.equal($('creditBox').hidden,!credit,mode+' customer pane');
    assert.equal($('bankPaymentNotice').hidden,!external,mode+' external notice');
    assert.equal($('checkoutOtherLabel').textContent,
      ['Nakit','Kart'].includes(mode)?'Diğer Ödeme':mode);
    assert.equal($('cashPayTotal').textContent,'90.00');
  }
  assert.equal($('checkoutDiscountLabel').textContent,'İndirim %10');
});

test('only four checkout buttons, expanded discount and shared settings are present',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ['checkoutDiscountToggle','checkoutOtherPayment','basketDiscountPanel',
    'otherPaymentDialog','settingsPickerMode','settingsPrintingGroup',
    'pickerCategoryBrowser','pickerLoadMore','homeSettingsShortcut'])
    assert.ok(ids.includes(id),id);
  assert.ok(!html.includes('Ek Seçenekler'));
  assert.ok(html.includes('data-payment-option="Veresiye"'));
  assert.ok(html.includes('data-payment-option="Havale / FAST"'));
  assert.ok(css.includes('.sale-edit-price{display:none!important}'),
    'line-item price editing stays accessible from the existing three-dot menu');
  assert.ok(sw.includes('/picker-preferences.js'));
  assert.ok(sw.includes('simplified-pos-v54'));
});
