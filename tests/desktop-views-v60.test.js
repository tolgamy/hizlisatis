import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('styles.css'),sw=read('sw.js');
const IDs=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const newCSS=css.slice(css.indexOf('/* v60: Fix the screen-leak root cause.'));
function domNode(tag='div') {
  return {
    tagName:tag.toUpperCase(),textContent:'',hidden:false,style:{},
    dataset:{},className:'',colSpan:0,children:[],attributes:{},
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(...nodes){this.children=nodes;},
    setAttribute(name,value){this.attributes[name]=value;},
    classList:{toggle(){}},
  };
}

test('all screen panels are distinct, with unique IDs and a dedicated stock page',()=>{
  assert.equal(IDs.length,new Set(IDs).size);
  for(const id of ['homeView','catalogView','settingsView','stockView','stockOverviewRows',
     'stockOverviewSearch','stockOverviewFilters','stockOverviewMore','homeDesktopInsights',
     'homeStockInsightList','homeRecentSalesList','historySummaryEmpty','historySummaryPlot'])
    assert.ok(IDs.includes(id),id);
  assert.match(app,/\$\('stockView'\)\.hidden = state\.view !== 'stock'/);
  assert.match(app,/else if \(fragment==='stock'\) state\.view='stock'/);
  assert.match(app,/if\(state\.view==='stock'\)renderStockOverview\(\)/);
  assert.match(app,/\$\('homeQuickStock'\)\.addEventListener/);
  assert.match(app,/navigate\('#stock'\)/);
});

test('hidden screens, category subpanels and hidden history chart cannot appear behind settings',()=>{
  for(const rule of [
    '#app #mainContent > #homeView[hidden]',
    '#app #mainContent > #catalogView[hidden]',
    '#app #mainContent > #stockView[hidden]',
    '#app #mainContent > #settingsView[hidden]',
    '#app #catalogView #categoryBrowser[hidden]',
    '#app #catalogView #productResults[hidden]',
    '#app #settingsView #settingsMainMenu[hidden]',
    '#historyDialog #historySummaryPlot[hidden]',
  ]) assert.ok(newCSS.includes(rule),rule);
  assert.match(newCSS,/\{display:none!important\}/);
  assert.match(app,/\$\('homeView'\)\.hidden = state\.view !== 'home'/);
  assert.match(app,/\$\('settingsView'\)\.hidden = state\.view !== 'settings'/);
});

test('stock table/search and counts are computed from actual product records without writes',()=>{
  const start=app.indexOf('function stockState(product){');
  const end=app.indexOf('function renderCartBar()',start);
  assert.ok(start>0&&end>start);
  const elements=new Map();
  const $=id=>{
    if(!elements.has(id))elements.set(id,domNode());
    return elements.get(id);
  };
  const buttons=['all','low','empty'].map(filter=>({...domNode('button'),dataset:{stockFilter:filter}}));
  const products=[
    {id:'zero',baslik:'Stok Bitti',kategori:'Kasap',barkod:'100',stok:0,birim:'adet',satisFiyati:10},
    {id:'low',baslik:'Az Kalan',kategori:'Manav',barkod:'200',stok:3,birim:'kg',satisFiyati:20},
    {id:'fine',baslik:'Normal Ürün',kategori:'Gıda',barkod:'300',stok:15,birim:'adet',satisFiyati:30},
    {id:'unknown',baslik:'Bilinmeyen',kategori:'Ev',barkod:'400',stokBelirsiz:true,birim:'adet',satisFiyati:40}
  ];
  const state={products,stockOverviewFilter:'all',stockOverviewLimit:60};
  $('stockOverviewSearch').value='';
  const ctx={$,
    state,isActive:p=>true,remaining:p=>p.stokBelirsiz?Infinity:p.stok,
    priceLabel:p=>'₺'+p.satisFiyati,fold:t=>String(t).toLocaleLowerCase('tr-TR'),
    document:{createElement:domNode,querySelectorAll:()=>buttons},
    Infinity,Number,String,Math,Map,Set,Intl
  };
  const fn=runInNewContext('(()=>{'+app.slice(start,end)+';return renderStockOverview;})()',ctx);
  fn();
  assert.equal($('stockOverviewTracked').textContent,'3');
  assert.equal($('stockOverviewEmpty').textContent,'1');
  assert.equal($('stockOverviewLow').textContent,'1');
  assert.equal($('stockOverviewRows').children.length,4);
  assert.match($('stockOverviewRows').children[0].children[0].children[0].textContent,/Stok Bitti/);
  assert.equal($('stockOverviewMore').hidden,true);
  state.stockOverviewFilter='low';fn();
  assert.equal($('stockOverviewRows').children.length,1);
  assert.match($('stockOverviewRows').children[0].children[0].children[0].textContent,/Az Kalan/);
  $('stockOverviewSearch').value='yanlış';fn();
  assert.equal($('stockOverviewRows').children.length,1);
  assert.match($('stockOverviewRows').children[0].children[0].textContent,/bulunamadı/);
  assert.doesNotMatch(app.slice(start,end),/saveSale\(|saveProduct\(|saveStock\(|fetch\(/);
});

test('Home insights are real and recent sales respect report permission',()=>{
  const begin=app.indexOf('function renderHomeStockInsights(){');
  const end=app.indexOf('function renderHome() {',begin);
  assert.ok(begin>0&&end>begin);
  const elements=new Map();
  const $=id=>{
    if(!elements.has(id))elements.set(id,domNode());
    return elements.get(id);
  };
  const state={products:[
    {id:'a',baslik:'Sıfır',stok:0,birim:'adet'},
    {id:'b',baslik:'Azalan',stok:4,birim:'adet'},
    {id:'c',baslik:'Bol',stok:25,birim:'adet'},
  ]};
  const ctx={$,
    state,isActive:p=>true,remaining:p=>p.stok,
    userCan:()=>false,fmtDate:d=>String(d).slice(0,10),
    money:(n)=>'₺'+Number(n).toFixed(2),
    document:{createElement:domNode},
    Intl,Number,String,Date,Math
  };
  const x=runInNewContext('(()=>{'+
    app.slice(app.indexOf('function stockState(product){'),app.indexOf('function renderStockOverview(){'))+
    app.slice(begin,end)+
    ';return {renderHomeStockInsights,renderHomeRecentSales};})()',ctx);
  x.renderHomeStockInsights();
  assert.match($('homeStockInsightCount').textContent,/2 üründe/);
  assert.equal($('homeStockInsightList').children.length,2);
  x.renderHomeRecentSales([{createdAt:'2026-11-22T10:00:00',total:123}]);
  assert.equal($('homeRecentSalesCard').hidden,true);
  assert.equal($('homeRecentSalesList').children.length,0);
  ctx.userCan=()=>true;
  x.renderHomeRecentSales([{createdAt:'2026-11-22T10:00:00',total:123,currency:'TRY'}]);
  assert.equal($('homeRecentSalesCard').hidden,false);
  assert.equal($('homeRecentSalesList').children.length,1);
  assert.equal($('homeRecentSalesList').children[0].children[1].textContent,'₺123.00');
});

test('history shows a meaningful empty state rather than an empty graph',()=>{
  const begin=app.indexOf('function renderHistorySummary(sales){');
  const end=app.indexOf('async function showHistory()',begin);
  assert.ok(begin>0&&end>begin);
  const elements=new Map();
  const $=id=>{
    if(!elements.has(id))elements.set(id,domNode());
    return elements.get(id);
  };
  const fn=runInNewContext('(()=>{'+app.slice(begin,end)+
    ';return renderHistorySummary;})()',{
    $,Date,Map,Math,Number,Intl,
    round2:n=>Math.round(n*100)/100,
    money:n=>'₺'+Number(n).toFixed(2),
    document:{createElement:domNode}
  });
  fn([]);
  assert.equal($('historySummaryEmpty').hidden,false);
  assert.equal($('historySummaryPlot').hidden,true);
  assert.equal($('historySummaryTotal').textContent,'₺0.00');
  fn([{createdAt:new Date().toISOString(),total:10,currency:'TRY'}]);
  assert.equal($('historySummaryEmpty').hidden,true);
  assert.equal($('historySummaryPlot').hidden,false);
  assert.equal($('historySummaryChart').children.length,7);
});

test('existing 6x2 Home/4x3 Products, mobile three columns and sale authorization are preserved',()=>{
  assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/);
  assert.match(css,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(newCSS,/@media \(min-width:1024px\) and \(min-height:600px\) and \(orientation:landscape\) and \(hover:hover\) and \(pointer:fine\)/);
  assert.match(newCSS,/#historyDialog\.sheet\[open\]/);
  assert.match(newCSS,/#cartDialog\.sale-sheet \.sale-empty-premium/);
  assert.match(app,/await authorizeCheckout\(record\)/);
  assert.match(app,/requireAccess\(\)\.then\(\(\)=>setup\(\)\)/);
  assert.match(sw,/desktop-views-v60/);
});
