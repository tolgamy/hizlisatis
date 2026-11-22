import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('styles.css'),sw=read('sw.js');
const patch=css.slice(css.indexOf('/* v70 — approved compact mobile Sale header only.'));
function runCartBar(cart) {
  const ui=Object.fromEntries(['openCart','saleLineCount','saleVarietyCount',
    'saleTotalQty'].map(id=>[id,{hidden:false,textContent:'',classList:{toggle(){}}}]));
  const label={textContent:''};
  const dom={cartCount:{textContent:''},cartItemLabel:{textContent:''},cartTotal:{textContent:''}};
  const state={cart};
  const begin=app.indexOf('function renderCartBar()');
  const end=app.indexOf('function addToCart(',begin);
  assert.ok(begin>0&&end>begin,'cart bar function boundaries');
  const ctx={state,dom,$:id=>ui[id],
    cartQty:()=>[...cart.values()].reduce((sum,line)=>sum+(line.weighed?1:line.quantity),0),
    totals:()=>({total:100}),money:x=>'₺'+x,cartCurrency:()=> 'TRY',
    document:{querySelector:()=>label}};
  runInNewContext(app.slice(begin,end)+';renderCartBar()',ctx);
  return {ui,dom,label};
}

test('mobile Sale header displays 6 unique product types and 10 total items',()=>{
  const cart=new Map([2,2,2,2,1,1].map((quantity,i)=>
    ['line'+i,{id:'product'+i,quantity,weighed:false}]));
  const {ui,dom}=runCartBar(cart);
  assert.equal(ui.saleVarietyCount.textContent,'6');
  assert.equal(ui.saleTotalQty.textContent,'10');
  assert.equal(ui.saleLineCount.textContent,'10','desktop count still means item quantity');
  assert.equal(dom.cartCount.textContent,'10');
});
test('repeated weighed packages count as the same variety, preserving cart quantity behavior',()=>{
  const cart=new Map([
    ['a',{id:'rice',quantity:2,weighed:false}],
    ['b',{id:'rice',quantity:1,weighed:false}],
    ['c',{id:'cheese',quantity:0.5,weighed:true}],
    ['d',{id:'cheese',quantity:0.4,weighed:true}]
  ]);
  const first=runCartBar(cart);
  assert.equal(first.ui.saleVarietyCount.textContent,'2');
  assert.equal(first.ui.saleTotalQty.textContent,'5');
  cart.clear();
  const empty=runCartBar(cart);
  assert.equal(empty.ui.saleVarietyCount.textContent,'0');
  assert.equal(empty.ui.saleTotalQty.textContent,'0');
  assert.equal(empty.ui.openCart.hidden,true);
});
test('only mobile header hides cart symbol, uses enlarged counter and shortened İptal label',()=>{
  assert.ok(patch.startsWith('/* v70'));
  assert.match(patch,/@media \(max-width:679px\)/);
  assert.match(patch,/#cartDialog\.sale-sheet \.sale-heading-icon \{display:none!important\}/);
  assert.match(patch,/#cartDialog\.sale-sheet \.sale-mobile-count \{display:inline!important\}/);
  assert.match(patch,/#cartDialog\.sale-sheet \.sale-cancel-long \{display:none!important\}/);
  assert.match(patch,/#cartDialog\.sale-sheet \.sale-cancel-short \{display:inline!important\}/);
  assert.match(patch,/font-size:clamp\(13px,3\.5vw,15px\)!important/);
  assert.doesNotMatch(patch,/#saleView|#reportsView|#stockView|#catalogView|#homeView/);
  assert.match(html,/id="saleVarietyCount"/);
  assert.match(html,/id="saleTotalQty"/);
  assert.match(html,/class="sale-cancel-short" aria-hidden="true">İptal</);
  assert.match(html,/class="sale-cancel-long">Satışı İptal Et</);
  assert.match(sw,/sale-header-variety-v70/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});
