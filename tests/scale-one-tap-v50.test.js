import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseManualGrams,scaleGramsToQuantity,calculateWeightTotal} from '../public/scale-serial.js';

const file=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=file('app.js'),html=file('index.html'),sw=file('sw.js');

function handlerAfter(startNeedle,endNeedle){
  const start=app.indexOf(startNeedle),end=app.indexOf(endNeedle,start+startNeedle.length);
  assert.ok(start>=0 && end>start, 'Cannot find '+startNeedle);
  return app.slice(start+startNeedle.length,end).trim().replace(/,\s*$/,'');
}

function scaleUi(){
  const nodes={
    weightDialog:{open:true,close(){this.open=false}},
    weightGrams:{value:''},weightLive:{textContent:'— kg'},
    weightQuantityPreview:{textContent:'—'},weightTotalPreview:{textContent:'—'},
    weightSerialStatus:{textContent:''},weightAdd:{disabled:true},
    weightError:{hidden:true,textContent:''}
  };
  let timerCallback=null,timeoutMs=0,canceled=0,added=0,opened=0;
  const ctx={
    $:id=>nodes[id],weightProduct:{id:'barbunya',birim:'kg',satisFiyati:65,paraBirimi:'TRY'},
    weightInputMode:'serial',scaleLatest:null,scaleCapturedAt:0,weightFreshnessTimer:null,
    scaleConnection:{connected:true},
    parseManualGrams,scaleGramsToQuantity,calculateWeightTotal,
    money:v=>'₺'+v.toFixed(2),
    setTimeout:(fn,ms)=>{timerCallback=fn;timeoutMs=ms;return 1;},
    clearTimeout:()=>{canceled++;},
    addToCart:(p,qty,opts)=>{added++;assert.equal(p.id,'barbunya');
      assert.equal(qty,0.562);assert.deepEqual(JSON.parse(JSON.stringify(opts)),{separate:true,grams:562});
      return true;},
    openSale:()=>opened++
  };
  const fnStart=app.indexOf('function clearWeightFreshnessTimer()');
  const fnEnd=app.indexOf('function openWeightProduct(',fnStart);
  assert.ok(fnStart>0&&fnEnd>fnStart);
  const fns=runInNewContext(app.slice(fnStart,fnEnd)+
    ';({renderWeightPreview,invalidateAutoWeight,clearWeightFreshnessTimer})',ctx);
  Object.assign(ctx,fns);
  const reading=runInNewContext('('+handlerAfter('onReading:','onUnstable:')+')',ctx);
  const unstable=runInNewContext('('+handlerAfter('onUnstable:','onStatus:')+')',ctx);
  const confirmStart=app.indexOf('function confirmWeight()');
  const confirmEnd=app.indexOf('/** Every decoded barcode',confirmStart);
  assert.ok(confirmStart>0&&confirmEnd>confirmStart);
  const confirm=runInNewContext(app.slice(confirmStart,confirmEnd)+';confirmWeight',ctx);
  return {ctx,nodes,reading,unstable,confirm,getTimer:()=>timerCallback,
    timeout:()=>timeoutMs,counts:()=>({added,opened,canceled})};
}

test('one-tap scale UI contains only Sepete Ekle, no intermediate capture button',()=>{
  const start=html.indexOf('<dialog id="weightDialog"');
  const end=html.indexOf('</dialog>',start);
  assert.ok(start>=0&&end>start);
  const markup=html.slice(start,end);
  assert.doesNotMatch(markup,/id="weightUseLive"|Teraziden Ağırlığı Al/);
  assert.match(markup,/id="weightAdd"[^>]*>Sepete Ekle<\/button>/);
  assert.match(markup,/Sabit ağırlık otomatik alınır/);
  assert.match(app,/weightInputMode=scaleSupported\(\)\?'serial':'manual'/);
  assert.match(sw,/cep-pos-shell-v50-one-tap-live-scale/);
});

test('CAS stable frame auto-populates grams, kg total, and enables Sepete Ekle',()=>{
  const ui=scaleUi(),at=Date.now();
  ui.reading({grams:562,at,stable:true});
  assert.equal(ui.ctx.scaleLatest.grams,562);
  assert.equal(ui.ctx.scaleCapturedAt,at);
  assert.equal(ui.nodes.weightGrams.value,'562');
  assert.equal(ui.nodes.weightLive.textContent,'0,562 kg');
  assert.equal(ui.nodes.weightQuantityPreview.textContent,'0,562 kg');
  assert.equal(ui.nodes.weightTotalPreview.textContent,'₺36.53');
  assert.equal(ui.nodes.weightAdd.disabled,false);
  assert.equal(ui.timeout(),5100,'auto weight must expire if no new frames arrive');
  assert.equal(ui.counts().added,0,'reading must never auto-add to the basket');
});

test('one Sepete Ekle click adds weighed item once, even if pressed again',()=>{
  const ui=scaleUi(),at=Date.now();
  ui.reading({grams:562,at,stable:true});
  ui.confirm();
  ui.confirm();
  assert.deepEqual(ui.counts().added,1);
  assert.equal(ui.counts().opened,1);
  assert.equal(ui.nodes.weightDialog.open,false);
});

test('if weight expires or scale moves, old value cannot be sold with one click',()=>{
  const ui=scaleUi(),at=Date.now();
  ui.reading({grams:562,at,stable:true});
  ui.getTimer()();
  assert.equal(ui.nodes.weightGrams.value,'');
  assert.equal(ui.nodes.weightAdd.disabled,true);
  assert.equal(ui.ctx.scaleLatest,null);
  ui.confirm();
  assert.equal(ui.counts().added,0);
  assert.equal(ui.nodes.weightError.hidden,false);
  assert.match(ui.nodes.weightError.textContent,/Gramaj/);
  ui.reading({grams:562,at:Date.now(),stable:true});
  assert.equal(ui.nodes.weightAdd.disabled,false);
  ui.unstable();
  assert.equal(ui.nodes.weightAdd.disabled,true);
  assert.equal(ui.nodes.weightGrams.value,'');
});

test('deliberate manual gram override is not overwritten by serial events',()=>{
  const ui=scaleUi();
  ui.ctx.weightInputMode='manual';
  ui.nodes.weightGrams.value='400';
  ui.ctx.renderWeightPreview();
  ui.reading({grams:562,at:Date.now(),stable:true});
  assert.equal(ui.nodes.weightGrams.value,'400');
  assert.equal(ui.nodes.weightTotalPreview.textContent,'₺26.00');
  assert.equal(ui.nodes.weightAdd.disabled,false);
  ui.unstable();
  assert.equal(ui.nodes.weightGrams.value,'400');
  assert.equal(ui.nodes.weightAdd.disabled,false,'manual entry remains available during scale motion');
});

test('serial scale cannot complete with a disconnected or different reading',()=>{
  const ui=scaleUi();
  ui.reading({grams:562,at:Date.now(),stable:true});
  ui.ctx.scaleConnection.connected=false;
  ui.confirm();
  assert.equal(ui.counts().added,0);
  assert.match(ui.nodes.weightError.textContent,/güncel sabit ağırlık/);
  ui.ctx.scaleConnection.connected=true;
  ui.ctx.scaleCapturedAt=Date.now()-12000;
  ui.confirm();
  assert.equal(ui.counts().added,0);
});
