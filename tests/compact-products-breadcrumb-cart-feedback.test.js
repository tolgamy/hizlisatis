import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=read('app.js'),css=read('styles.css'),html=read('index.html'),sw=read('sw.js');

test('compact grid removes excessive card height and flexible blank area; list layout preserved',()=>{
  const segment=css.slice(css.indexOf('/* v3.9 approved improvements:'),css.indexOf('/* v4.0 — approved dedicated home dashboard.'));
  assert.ok(segment.startsWith('/* v3.9 approved improvements:'));
  assert.match(segment,/#productResults \.products\.grid-view \.product-card\{[\s\S]*?min-height:0!important/);
  assert.match(segment,/#productResults \.products\.grid-view \.product-info\{[\s\S]*?flex:0 0 auto!important/);
  assert.match(segment,/#productResults \.products\.grid-view \.product-photo\{[\s\S]*?height:clamp\(112px,35vw,150px\)!important/);
  assert.doesNotMatch(segment,/\.bottom-shell\{|\.bottom-nav\{|\.products\.list-view\{/);
  assert.match(app,/row\.querySelector\('\.add-button'\)\.addEventListener\('click',\(\)=>addToCart\(p\)\)/);
});

test('main and subcategory names are clickable, not selectable label-only text',()=>{
  const start=app.indexOf('function renderProductBreadcrumb(');
  const end=app.indexOf('function fold(text)',start);
  assert.ok(start>=0&&end>start);
  const code=app.slice(start,end);
  const calls=[],heading={children:[],textContent:'',replaceChildren(){this.children=[]},append(node){this.children.push(node)}};
  const makeElement=tag=>({
    tag,cls:'',textContent:'',attributes:{},listeners:{},
    set className(value){this.cls=value;},
    setAttribute(k,v){this.attributes[k]=v;},
    addEventListener(k,fn){this.listeners[k]=fn;}
  });
  const sandbox={
    document:{createElement:makeElement},
    $:()=>heading,
    selectCategory:path=>calls.push(['products',path]),
    openCategoryMenu:path=>calls.push(['children',path])
  };
  runInNewContext(code+';renderProductBreadcrumb("Manav > Sebze","Ürünler");',sandbox);
  assert.equal(heading.children.length,3);
  assert.equal(heading.children[0].textContent,'Manav');
  assert.equal(heading.children[1].textContent,'›');
  assert.equal(heading.children[2].textContent,'Sebze');
  assert.equal(heading.children[2].attributes['aria-current'],'page');
  heading.children[0].listeners.click();
  heading.children[2].listeners.click();
  assert.deepEqual(calls,[['children','Manav'],['products','Manav > Sebze']]);
  assert.match(app,/\$\('catalogBack'\)\.addEventListener\('click',\(\)=>openCategoryMenu\(state\.category\.split\(' > '\)\.slice\(0,-1\)\.join\(' > '\)\)\)/);
  assert.match(app,/\$\('categoryBack'\)\.addEventListener/);
  assert.match(app,/if \(fragment\.startsWith\('categories'\)\)/);
  assert.match(app,/if\(state\.view!=='catalog'\|\|state\.catalogMode!=='products'\) return/);
});

test('approved cart confirmation is beneath the sticky search, never above bottom nav',()=>{
  const header=html.slice(html.indexOf('<header'),html.indexOf('</header>'));
  assert.ok(header.indexOf('class="searchline"')<header.indexOf('id="cartToast"'));
  assert.ok(header.includes('id="cartToastText"'));
  assert.ok(header.includes('id="cartToastClose"'));
  const segment=css.slice(css.indexOf('/* v3.9 approved improvements:'),css.indexOf('/* v4.0 — approved dedicated home dashboard.'));
  assert.match(segment,/\.clean-topbar \.cart-confirm-toast\{[\s\S]*?top:calc\(100% \+ 7px\);bottom:auto/);
  assert.match(app,/function showCartConfirmation\(product\)/);
  assert.match(app,/showCartConfirmation\(product\);[\s\n]*return true/);
  const shell=html.slice(html.indexOf('class="bottom-shell"'),html.indexOf('</nav>',html.indexOf('class="bottom-shell"')));
  assert.match(shell,/id="openCart"/);
  assert.match(shell,/id="navHome"/);
  assert.match(shell,/id="navSettings"/);
});

test('every successful cart add, increase and decrease plays a distinct short sound',()=>{
  assert.match(app,/function playCartSound\(action='add'\)/);
  assert.match(app,/action==='decrease'\?\[670,490\]:action==='increase'\?\[920,1190\]:\[870,1100\]/);
  assert.match(app,/playCartSound\(current\?'increase':'add'\)/);
  assert.match(app,/if\(num!==line\.quantity\)playCartSound\(num>line\.quantity\?'increase':'decrease'\)/);
  assert.match(app,/state\.cart\.delete\(id\);playCartSound\('decrease'\)/);
  assert.match(app,/state\.cart\.delete\(line\.id\); playCartSound\('decrease'\)/);
  assert.match(app,/function chirp\(\)/); // original barcode audio retained
  assert.match(sw,/cep-pos-shell-v39-bank-payments/);
});
