import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const css=file('styles.css'),html=file('index.html'),app=file('app.js'),sw=file('sw.js');
const start=css.indexOf('/* v62: Give Sales and Reports the full');
const patch=css.slice(start);
const block=selector=>{
  const start=patch.indexOf(selector+' {');
  assert.ok(start>=0,'missing '+selector);
  const b=patch.indexOf('{',start);
  const end=patch.indexOf('}',b);
  return patch.slice(b+1,end);
};

test('desktop Sales fills the available viewport down to the bottom edge',()=>{
  const s=block('#cartDialog.sale-sheet[open]');
  assert.match(s,/position:fixed!important/);
  assert.match(s,/top:9px!important/);
  assert.match(s,/bottom:9px!important/);
  assert.match(s,/height:calc\(100dvh - 18px\)!important/);
  assert.match(s,/left:calc\(var\(--hizli-sidebar\) \+ 9px\)!important/);
  assert.match(s,/width:calc\(100vw - var\(--hizli-sidebar\) - 18px\)!important/);
  assert.match(s,/max-height:none!important/);
  assert.match(s,/grid-template-rows:auto auto minmax\(0,1fr\)!important/);
  assert.match(block('#cartDialog.sale-sheet .cart-items'),/overflow-y:auto!important/);
  assert.match(block('#cartDialog.sale-sheet .checkout-area'),/overflow-y:auto!important/);
});

test('desktop Reports is full-height and preserves the real sales controls',()=>{
  const s=block('#historyDialog.sheet[open]');
  assert.match(s,/position:fixed!important/);
  assert.match(s,/top:10px!important/);
  assert.match(s,/bottom:10px!important/);
  assert.match(s,/height:calc\(100dvh - 20px\)!important/);
  assert.match(s,/max-width:none!important/);
  assert.match(s,/width:calc\(100vw - var\(--hizli-sidebar\) - 22px\)!important/);
  assert.match(s,/display:flex!important/);
  assert.match(block('#historyDialog #historyItems.history-items'),/overflow-y:auto!important/);
  assert.match(patch,/#historyDialog:has\(#historySummaryEmpty:not\(\[hidden\]\)\) #historyItems/);
  for(const id of ['historyCount','historySummaryTotal','historySummaryCount','historySummaryAverage',
    'historySummaryEmpty','historySummaryPlot','historySummaryChart','historyItems','exportSales'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(app,/state\.sales = \(await getSales\(\)\)/);
  assert.match(app,/renderHistorySummary\(state\.sales\)/);
});

test('this only styles mouse-and-keyboard desktop, without touching Settings or sale calculations',()=>{
  assert.ok(start>0);
  assert.match(patch,/@media \(min-width:1024px\) and \(min-height:600px\) and \(orientation:landscape\) and \(hover:hover\) and \(pointer:fine\)/);
  assert.doesNotMatch(patch,/#settingsView|#settingsPreferences|#homeView|#stockView/);
  assert.match(html,/id="settingsMainMenu"/);
  assert.match(html,/id="settingsPreferences"/);
  assert.match(html,/id="checkoutOtherPayment"/);
  assert.match(html,/id="basketDiscountPanel"/);
  assert.match(html,/id="creditBox"/);
  assert.match(html,/id="completeSale"/);
  assert.match(app,/await authorizeCheckout\(record\)/);
  assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/);
  assert.match(sw,/sale-history-height-v62/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});
