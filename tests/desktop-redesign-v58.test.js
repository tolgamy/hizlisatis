import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {MAIN_CATEGORY_ORDER} from '../public/category-art.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html=read('index.html'),css=read('styles.css');
const app=read('app.js'),auth=read('auth-ui.js'),sw=read('sw.js');
const desktop=css.slice(css.indexOf('/* v58 — approved large-screen POS redesign.'));
const reportStyles=css.slice(css.indexOf('/* v58 report widgets'));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);

test('no header Users button; user editor is reachable under Settings for admin only',()=>{
  assert.equal(ids.length,new Set(ids).size,'HTML IDs must be unique');
  assert.equal(html.includes('id="accessUserButton"'),false);
  const topbar=html.slice(html.indexOf('class="topbar'),html.indexOf('id="mainContent"'));
  assert.equal(topbar.includes('Kullanıcılar</button>'),false);
  assert.match(topbar,/id="accessIdentity"/);
  assert.match(topbar,/id="accessLogout"/);
  const settings=html.slice(html.indexOf('id="settingsPreferences"'),html.indexOf('</main>'));
  assert.match(settings,/<details id="settingsAdminGroup"[^>]*hidden>/);
  assert.match(settings,/<strong>Kullanıcı Yönetimi<\/strong>/);
  assert.match(settings,/id="settingsOpenUsers"/);
  assert.match(auth,/\$\('settingsOpenUsers'\)\.addEventListener\('click',openUserManager\)/);
  assert.match(auth,/\$\('settingsAdminGroup'\)\.hidden=user\.role!=='admin'/);
  assert.doesNotMatch(auth,/accessUserButton/);
});

test('desktop category cards use real twelve labels, 4x3 grid and contain artwork',()=>{
  assert.equal(MAIN_CATEGORY_ORDER.length,12);
  for(const id of ['desktopHomeCategoryGrid','homeCategoryShortcuts','categoryTree'])
    assert.ok(ids.includes(id),id);
  assert.match(desktop,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(desktop,/#desktopHomeCategoryGrid \.photo-category-image img/);
  assert.match(desktop,/object-fit:contain!important/);
  assert.match(desktop,/max-height:188px!important/);
  assert.match(desktop,/#catalogView\.clean-catalog,/);
  assert.match(app,/desktop\.append\(card\)/);
  assert.match(app,/target\.append\(categoryTile\(node,!term&&node\.children\.length>0\)\)/);
});

test('desktop checkout has wide independent basket and checkout area',()=>{
  const s=desktop.slice(desktop.indexOf('#cartDialog.sale-sheet\[open\]'));
  assert.match(s,/grid-template-areas:"saleheader saleheader" "salesearch payment" "salelist payment"/);
  assert.match(s,/width:calc\(100vw - var\(--hizli-sidebar\) - 34px\)!important/);
  assert.match(s,/#cartDialog\.sale-sheet \.cart-items/);
  assert.match(s,/#cartDialog\.sale-sheet \.checkout-area/);
  assert.match(s,/grid-template-columns:1fr!important/);
  assert.match(s,/#cartDialog\.sale-sheet #completeSale/);
  assert.match(html,/id="saleBarcode"/);
  assert.match(html,/id="cartItems"/);
  assert.match(html,/id="creditBox"/);
  assert.match(html,/id="checkoutOtherPayment"/);
  assert.match(html,/id="basketDiscountPanel"/);
  assert.match(html,/id="completeSale"/);
});

test('desktop reports summarize only actual device sales, never mockup figures',()=>{
  for(const id of ['historySummary','historySummaryTotal','historySummaryCount',
     'historySummaryAverage','historySummaryChart','desktopStockHint'])
    assert.ok(ids.includes(id),id);
  const start=app.indexOf('function renderHistorySummary(sales){');
  const end=app.indexOf('async function showHistory()',start);
  assert.ok(start>0&&end>start);
  const elements=new Map();
  const make=tag=>({
    tagName:tag.toUpperCase(),children:[],style:{},textContent:'',
    append(...items){this.children.push(...items)},
    replaceChildren(...items){this.children=items},
  });
  const $=id=>{
    if(!elements.has(id))elements.set(id,make('div'));
    return elements.get(id);
  };
  const money=(n)=>'₺'+Number(n).toFixed(2);
  const ctx={money,round2:n=>Math.round(n*100)/100,
    document:{createElement:make},
    Date,Intl,Map,Math,Number,String};
  const run=runInNewContext('(function($){'+app.slice(start,end)+
    ';return renderHistorySummary;})',ctx)($);
  run([
    {total:100,currency:'TRY',createdAt:new Date().toISOString()},
    {total:50,currency:'TRY',createdAt:new Date().toISOString()},
    {total:999,currency:'USD',createdAt:new Date().toISOString()},
    {total:999,currency:'TRY',createdAt:'invalid'}
  ]);
  assert.equal($('historySummaryTotal').textContent,'₺150.00');
  assert.equal($('historySummaryCount').textContent,'2');
  assert.equal($('historySummaryAverage').textContent,'₺75.00');
  assert.equal($('historySummaryChart').children.length,7);
  assert.equal($('historySummary').hidden,false);
  assert.match(reportStyles,/\.history-summary:not\(\[hidden\]\)/);
});

test('desktop-only styling does not change handheld or touch tablet cart grids',()=>{
  assert.match(desktop,/@media \(min-width:1024px\) and \(min-height:600px\) and \(orientation:landscape\) and \(hover:hover\) and \(pointer:fine\)/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(desktop,/#historyDialog\.sheet/);
  assert.match(desktop,/#accessUsersDialog\[open\]/);
  assert.match(desktop,/#manageDialog\.sheet/);
  assert.match(desktop,/#pickProductDialog\.product-picker/);
  assert.match(app,/await authorizeCheckout\(record\)/);
  assert.match(app,/requireAccess\(\)\.then\(\(\)=>setup\(\)\)/);
  assert.ok(!html.includes('id="settingsHome"'));
  const balance=[...css].reduce((n,ch)=>n+(ch==='{')-(ch==='}'),0);
  assert.equal(balance,0,'CSS braces');
  assert.match(sw,/desktop-redesign-v58/);
});
