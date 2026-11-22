import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('styles.css'),sw=read('sw.js');

test('initial empty cart action is active, clearly labeled Ana Sayfaya Dön and visually blue',()=>{
  const button=html.match(/<button id="completeSale"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(button);
  assert.match(button,/class="primary-button is-empty-cart"/);
  assert.match(button,/aria-label="Ana Sayfaya Dön"/);
  assert.match(button,/id="checkoutActionLabel">Ana Sayfaya Dön/);
  assert.match(button,/checkout-home-icon/);
  assert.match(button,/checkout-complete-icon/);
  assert.doesNotMatch(button,/\sdisabled(?:\s|>)/);
  const styles=css.slice(css.indexOf('/* v4.8'));
  assert.match(styles,/#completeSale\.is-empty-cart\{/);
  assert.match(styles,/color:#075bae/);
  assert.match(styles,/#completeSale\.is-empty-cart \.checkout-home-icon\{display:block\}/);
  assert.match(styles,/#completeSale\.is-empty-cart \.checkout-complete-icon\{display:none\}/);
  assert.match(sw,/v46-one-scan-cash-modes/);
});

test('cart renderer switches label/icon and enabled state without moving footer',()=>{
  const begin=app.indexOf('  const hasCartItems=state.cart.size>0;');
  const end=app.indexOf('  updatePayment();',begin);
  assert.ok(begin>0&&end>begin);
  const source=app.slice(begin,end);
  const button={
    disabled:true,attributes:{},classes:new Set(),
    classList:{toggle(name,enabled){if(enabled)button.classes.add(name);else button.classes.delete(name);}},
    setAttribute(name,value){this.attributes[name]=value;}
  };
  const label={textContent:''};
  const state={saving:false,cart:new Map()};
  const ctx={state,dom:{complete:button},$:id=>id==='checkoutActionLabel'?label:null};
  function render(){runInNewContext('{\n'+source+'\n}',ctx);}
  render();
  assert.equal(button.disabled,false);
  assert.equal(label.textContent,'Ana Sayfaya Dön');
  assert.ok(button.classes.has('is-empty-cart'));
  assert.equal(button.attributes['aria-label'],'Ana Sayfaya Dön');
  state.cart.set('barkod-1',{quantity:1});
  render();
  assert.equal(button.disabled,false);
  assert.equal(label.textContent,'Satışı Tamamla');
  assert.ok(!button.classes.has('is-empty-cart'));
  assert.equal(button.attributes['aria-label'],'Satışı Tamamla');
  state.saving=true;render();assert.equal(button.disabled,true);
  state.cart.clear();state.saving=false;render();
  assert.equal(label.textContent,'Ana Sayfaya Dön');
  assert.equal(button.disabled,false);
});

test('empty cart click navigates home; nonempty click still performs sale',()=>{
  const begin=app.indexOf("  dom.complete.addEventListener('click',()=>{");
  const end=app.indexOf("\n  });",begin);
  assert.ok(begin>0&&end>begin);
  let handler,views=[],completed=0,closed=0;
  const state={saving:false,cart:new Map()};
  const ctx={
    state,
    dom:{complete:{addEventListener(event,cb){assert.equal(event,'click');handler=cb;}},
      cartDialog:{open:true,close(){this.open=false;closed++;}}},
    setView:view=>views.push(view),
    completeSale:()=>completed++,
    openCashPayment:()=>completed++,
    document:{querySelector:()=>({value:'Nakit'})}
  };
  runInNewContext(app.slice(begin,end+6),ctx);
  assert.equal(typeof handler,'function');
  handler();
  assert.deepEqual(views,['home']);
  assert.equal(closed,1);
  assert.equal(completed,0);
  state.cart.set('barkod-1',{quantity:1});
  handler();
  assert.equal(completed,1);
  assert.deepEqual(views,['home']);
  state.saving=true;
  handler();
  assert.equal(completed,1);
});
