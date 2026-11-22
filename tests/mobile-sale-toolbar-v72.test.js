import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const html=read('index.html'),css=read('styles.css'),app=read('app.js'),sw=read('sw.js');
const marker='/* v72 — approved unified mobile Sale toolbar,';
const idx=css.indexOf(marker);
const v72=css.slice(idx);

function style(selector) {
  const offset=v72.indexOf(selector+' {');
  assert.ok(offset>=0,'missing selector: '+selector);
  const start=v72.indexOf('{',offset);
  const end=v72.indexOf('}',start);
  assert.ok(end>start);
  return v72.slice(start+1,end);
}

test('mobile Sale gets two-row green toolbar with a white cart logo',()=>{
  assert.ok(idx>0);
  assert.match(v72,/@media \(max-width:679px\)/);
  assert.match(style('#cartDialog.sale-sheet .sale-sheet-header'),/display:grid!important/);
  assert.match(style('#cartDialog.sale-sheet .sale-sheet-header'),/grid-template-rows:auto auto!important/);
  assert.match(style('#cartDialog.sale-sheet .mobile-sale-brand'),/grid-column:1\/-1/);
  assert.match(html,/class="mobile-sale-brand" aria-hidden="true"/);
  assert.match(html,/<strong>HızlıSatış<\/strong>/);
  assert.match(style('.mobile-sale-brand'),/display:none/);
});

test('5 Çeşit and 5 Ürün render as distinct live counter cells',()=>{
  for (const name of ['sale-mobile-count','sale-variety-tile','sale-quantity-tile',
     'saleVarietyCount','saleTotalQty']) assert.ok(html.includes(name),name);
  assert.match(html,/id="saleVarietyCount">0<\/b> Çeşit/);
  assert.match(html,/id="saleTotalQty">0<\/b> Ürün/);
  assert.match(style('#cartDialog.sale-sheet .sale-mobile-count'),
    /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(style('#cartDialog.sale-sheet .sale-mobile-count > span + span'),
    /border-left:1px solid/);
  assert.match(app,/\$\('saleVarietyCount'\)\.textContent = String\(new Set\(/);
  assert.match(app,/\$\('saleTotalQty'\)\.textContent = String\(count\)/);
});

test('Geri, İptal and Kapat are exactly equal height with icons and readable captions',()=>{
  for(const id of ['saleBack','saleCancel','saleClose'])assert.ok(html.includes('id="'+id+'"'),id);
  const actions=style('#cartDialog.sale-sheet .sale-header-actions');
  assert.match(actions,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  const buttons=style('#cartDialog.sale-sheet .sale-header-actions button');
  assert.match(buttons,/height:64px!important/);
  assert.match(buttons,/min-height:64px!important/);
  assert.match(buttons,/max-height:64px!important/);
  assert.match(buttons,/flex-direction:column!important/);
  assert.match(style('#cartDialog.sale-sheet .sale-header-actions button .sale-top-text,\n  #cartDialog.sale-sheet .sale-header-actions button .sale-cancel-short'),/display:block!important/);
  assert.match(html,/aria-label="Kategorilere geri dön"/);
  assert.match(html,/aria-label="Satışı iptal et"/);
  assert.match(html,/class="sale-cancel-long">Satışı İptal Et/);
  assert.match(html,/class="sale-cancel-short" aria-hidden="true">İptal/);
  assert.match(app,/\$\('saleBack'\)\.addEventListener\('click'/);
  assert.match(app,/\$\('saleCancel'\)\.addEventListener\('click'/);
  assert.match(app,/\$\('saleClose'\)\.addEventListener\('click'/);
});

test('the plus and barcode-scan buttons keep original functionality and gain labels',()=>{
  for(const label of ['Ürün Ekle','Barkod Oku'])assert.ok(html.includes('>'+label+'</span>'));
  assert.match(style('#cartDialog.sale-sheet .sale-scanner button span'),/display:block!important/);
  assert.match(style('#cartDialog.sale-sheet .sale-scanner .sale-manual-add,\n  #cartDialog.sale-sheet .sale-scanner #saleScanButton'),/height:58px!important/);
  assert.match(app,/\$\('saleScanButton'\)\.addEventListener\('click',openCamera\)/);
  assert.match(app,/\$\('saleBarcodeForm'\)\.addEventListener\('submit'/);
});

test('existing framed cart, 68px payments and desktop Sale/Reports are preserved',()=>{
  assert.doesNotMatch(v72,/#saleView|#reportsView|#homeView|#catalogView|#stockView|#settingsView/);
  assert.doesNotMatch(v72,/\.checkout-area|\.cart-items|\.payment-shortcut|\.cart-line/);
  assert.match(css,/v71 — approved framed mobile Sale design/);
  assert.match(css,/height:68px!important;min-height:68px!important;max-height:68px!important/);
  assert.match(sw,/unified-sale-toolbar-v72/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});
