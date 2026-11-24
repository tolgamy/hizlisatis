import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {barcodeSvg,code128Codes,makeEan13Bars,makeEan8Bars,labelMarkup,printableHtml} from '../public/price-label-v90.js';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app-v90.js'),sw=read('sw.js');

test('home shortcut appears directly after reports on desktop and mobile grid',()=>{
  assert.ok(html.indexOf('id="homeQuickPriceLabel"')>html.indexOf('id="homeQuickReports"'));
  assert.ok(html.indexOf('id="homeQuickPriceLabel"')<html.indexOf('class="dashboard-metrics"'));
  assert.match(html,/Fiyat Gör \/ Etiket/);
  assert.match(html,/id="priceLabelDialog"/);
  assert.match(html,/id="priceLabelMissingDialog"/);
  assert.match(html,/src="\/app-v90\.js"/);
  assert.match(html,/href="\/price-label-v90\.css"/);
});
test('valid EAN13, EAN8 and Code128 have real bar geometry',()=>{
  assert.equal(makeEan13Bars('4006381333931')?.length,95);
  assert.equal(makeEan13Bars('4006381333932'),null);
  assert.equal(makeEan8Bars('96385074')?.length,67);
  assert.match(barcodeSvg('4006381333931'),/<svg /);
  assert.match(barcodeSvg('8690632772202'),/<rect /);
  assert.match(barcodeSvg('8690632772202'),/8690632772202/);
  assert.ok(code128Codes('1234567890').includes(105));
  assert.equal(code128Codes('1234567890').at(-1),106);
  assert.match(barcodeSvg('USMAR-1234'),/<rect /);
  assert.throws(()=>barcodeSvg(''),/Barkod/);
});
test('38x100mm printable labels use saved price and do not mutate products',()=>{
  const product={baslik:'Vivident <test>',barkod:'4006381333931',satisFiyati:87.5,birim:'adet',kdv:10};
  const before=JSON.stringify(product),markup=labelMarkup(product),printed=printableHtml(product,2);
  assert.match(markup,/87,50/);
  assert.match(markup,/Vivident &lt;test&gt;/);
  assert.doesNotMatch(markup,/<test>/);
  assert.match(printed,/@page\{size:38mm 100mm;margin:0\}/);
  assert.equal((printed.match(/class="pl-ticket"/g)||[]).length,2);
  assert.equal(JSON.stringify(product),before);
  assert.throws(()=>labelMarkup({...product,fiyatBelirsiz:true}),/fiyat/);
  assert.throws(()=>labelMarkup({...product,barkod:''}),/Barkod/);
});
test('camera path returns to price dialog without adding anything to basket',()=>{
  assert.match(app,/import \{ createPriceLabelFeature \} from '\.\/price-label-v90\.js'/);
  assert.match(app,/purpose==='price-label'/);
  assert.match(app,/priceLabelFeature\?\.acceptScan\(text\)/);
  assert.match(app,/state\.scanPurpose='price-label'/);
  assert.match(app,/priceLabelFeature\?\.open\(\)/);
  assert.match(app,/from '\.\/central-sales-v88\.js'/);
  assert.match(app,/from '\.\/product-management-v87\.js'/);
  assert.match(sw,/rotated-label-v90/);
  assert.match(sw,/\/app-v90\.js/);
});

test('physical 38x100mm stock keeps portrait page and rotates artwork -90deg',()=>{
  const p={baslik:'VIVIDENT DAMLA SAKIZI DRAJE 67 G PLST KUTU',barkod:'4006381333931',satisFiyati:87.5,birim:'adet',kdv:10};
  const label=labelMarkup(p),output=printableHtml(p,3),css=read('price-label-v90.css');
  assert.match(label,/class="pl-paper"><article class="pl-ticket">/);
  assert.match(output,/@page\{size:38mm 100mm;margin:0\}/);
  assert.match(output,/\.pl-paper\{position:relative;width:38mm;height:100mm/);
  assert.match(output,/\.pl-ticket\{position:absolute;top:0;left:0;width:100mm;height:38mm;/);
  assert.match(output,/transform:translateY\(100mm\) rotate\(-90deg\)/);
  assert.match(css,/transform:translateY\(100mm\) rotate\(-90deg\)/);
  assert.match(css,/width:38mm;height:100mm/);
  assert.equal((output.match(/class="pl-paper"/g)||[]).length,3);
  assert.equal((output.match(/class="pl-ticket"/g)||[]).length,3);
});
