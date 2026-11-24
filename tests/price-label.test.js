import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {barcodeSvg,code128Codes,makeEan13Bars,makeEan8Bars,labelMarkup,renderLabelImage,printableHtml,labelPdfBlob} from '../public/price-label-v93.js';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app-v93.js'),sw=read('sw.js');

test('home shortcut appears directly after reports on desktop and mobile grid',()=>{
  assert.ok(html.indexOf('id="homeQuickPriceLabel"')>html.indexOf('id="homeQuickReports"'));
  assert.ok(html.indexOf('id="homeQuickPriceLabel"')<html.indexOf('class="dashboard-metrics"'));
  assert.match(html,/Fiyat Gör \/ Etiket/);
  assert.match(html,/id="priceLabelDialog"/);
  assert.match(html,/id="priceLabelMissingDialog"/);
  assert.match(html,/src="\/app-v93\.js"/);
  assert.match(html,/href="\/price-label-v93\.css"/);
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
test('rasterized Argox output stays on one 38x100mm page per copy',()=>{
  const product={baslik:'Vivident <test>',barkod:'4006381333931',satisFiyati:87.5,birim:'adet',kdv:10};
  const original=JSON.stringify(product);
  const png='data:image/png;base64,AA==';
  const one=printableHtml(product,1,png),two=printableHtml(product,2,png);
  assert.match(one,/@page\{size:38mm 100mm;margin:0\}/);
  assert.match(one,/height:99mm/);
  assert.equal((one.match(/class="pl-printed-label"/g)||[]).length,1);
  assert.equal((two.match(/class="pl-printed-label"/g)||[]).length,2);
  assert.doesNotMatch(one,/class="pl-ticket"/);
  assert.doesNotMatch(one,/rotate\(/);
  assert.doesNotMatch(one,/<footer|about:blank|24\.11\.2026/);
  assert.equal(JSON.stringify(product),original);
});
test('sideways label is baked into 304x800px PNG, not print-CSS transform',()=>{
  const calls=[],ctx={
    save(){},restore(){},translate(...args){calls.push(['translate',...args]);},
    rotate(a){calls.push(['rotate',a]);},fillRect(...args){calls.push(['fillRect',...args]);},
    fillText(){},measureText(t){return {width:t.length*18}},
    fillStyle:'#000',font:'',textAlign:'',textBaseline:''
  };
  const canvas={width:0,height:0,getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,AA=='};
  const product={baslik:'Vivident',barkod:'4006381333931',satisFiyati:87.5,birim:'adet'};
  const out=renderLabelImage(product,()=>canvas);
  assert.equal(canvas.width,304);
  assert.equal(canvas.height,800);
  assert.deepEqual(calls.find(c=>c[0]==='translate'),['translate',304,800]);
  assert.deepEqual(calls.find(c=>c[0]==='rotate'),['rotate',-Math.PI/2]);
  assert.ok(calls.filter(c=>c[0]==='fillRect').length>35);
  assert.match(out,/^data:image\/png;base64,/);
  assert.throws(()=>renderLabelImage({...product,barkod:''},()=>canvas),/Barkod/);
});
test('camera path returns to price dialog without adding anything to basket',()=>{
  assert.match(app,/import \{ createPriceLabelFeature \} from '\.\/price-label-v93\.js'/);
  assert.match(app,/purpose==='price-label'/);
  assert.match(app,/priceLabelFeature\?\.acceptScan\(text\)/);
  assert.match(app,/state\.scanPurpose='price-label'/);
  assert.match(app,/priceLabelFeature\?\.open\(\)/);
  assert.match(app,/from '\.\/central-sales-v88\.js'/);
  assert.match(app,/from '\.\/product-management-v87\.js'/);
  assert.match(sw,/native-pdf-v93/);
  assert.match(sw,/\/app-v93\.js/);
});



test('v93 one page PDF has exact Argox 38x100mm MediaBox with no HTML header',async()=>{
  const context={save(){},restore(){},translate(){},rotate(){},fillRect(){},fillText(){},
    measureText(s){return {width:s.length*18}}};
  const canvas={getContext:()=>context,toDataURL:()=> 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='};
  const product={baslik:'Test',barkod:'4006381333931',satisFiyati:87.5};
  for(const n of [1,2,5]){
    const pdf=labelPdfBlob(product,n,()=>canvas);
    assert.equal(pdf.type,'application/pdf');
    const content=new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    assert.match(content,/%PDF-1\.4/);
    assert.match(content,new RegExp('/Count '+n+'(?![0-9])'));
    assert.equal((content.match(/\/Type \/Page \/Parent/g)||[]).length,n);
    assert.equal((content.match(/\/MediaBox \[0 0 107\.7165 283\.4646\]/g)||[]).length,n);
    assert.equal((content.match(/\/Subtype \/Image/g)||[]).length,1);
    assert.doesNotMatch(content,/about:blank|24\.11\.2026/);
  }
});
test('canvas -90 rotation is fully inside 304x800 pixels',()=>{
  const W=800,H=304,corners=[[0,0],[W,0],[0,H],[W,H]].map(([x,y])=>[H-y,W-x]);
  assert.equal(Math.min(...corners.map(p=>p[0])),0);
  assert.equal(Math.max(...corners.map(p=>p[0])),H);
  assert.equal(Math.min(...corners.map(p=>p[1])),0);
  assert.equal(Math.max(...corners.map(p=>p[1])),W);
});
