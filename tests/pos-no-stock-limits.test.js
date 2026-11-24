import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('styles.css'),sw=read('sw.js');

const section=(start,end)=>{
  const i=app.indexOf(start);
  const j=app.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i,start+' section must exist');
  return app.slice(i,j);
};

test('zero-stock registered products can enter the basket without querying stock',()=>{
  const product={
    id:'shelf-1',baslik:'Raftaki ürün',stok:0,stokBelirsiz:false,
    satisFiyati:25.5,fiyatBelirsiz:false,paraBirimi:'TRY',birim:'adet'
  };
  const state={centralReadOnly:false,cart:new Map()};
  const errors=[];
  const context={
    state,isActive:()=>true,
    announce:(message)=>errors.push(message),
    cartCurrency:()=> 'TRY',
    renderCartBar(){},renderCart(){},playCartSound(){},showCartConfirmation(){},
    isSaleActive:()=>false,dom:{cartDialog:{open:false}},
    remaining(){throw Error('Sale must not check remaining stock');}
  };
  const addToCart=runInNewContext(section('function addToCart(', 'function updateCart(')+';addToCart',context);
  assert.equal(addToCart(product,1),true);
  assert.equal(addToCart(product,199),true);
  assert.equal(state.cart.get(product.id).quantity,200);
  assert.deepEqual(errors,[]);
});

test('cart quantity can exceed old stock amount, while invalid quantities are rejected',()=>{
  const product={id:'shelf-1',baslik:'Raftaki ürün',stok:0,birim:'adet'};
  const state={cart:new Map([['shelf-1',{
    id:'shelf-1',product,quantity:1,unitPrice:25.5,discountPct:0
  }]])};
  const errors=[];
  const context={
    state,announce:message=>errors.push(message),
    renderCart(){},renderCartBar(){},playCartSound(){},
    remaining(){throw Error('Cart quantity must not check remaining stock');}
  };
  const updateCart=runInNewContext(section('function updateCart(', 'function renderCart()')+';updateCart',context);
  updateCart('shelf-1','quantity',500);
  assert.equal(state.cart.get('shelf-1').quantity,500);
  updateCart('shelf-1','quantity',-1);
  assert.equal(state.cart.get('shelf-1').quantity,500);
  assert.match(errors[0],/Miktar geçersiz/);
});

test('checkout and product browsing never block a registered item based on stock',()=>{
  const checkout=section('async function completeSale()', 'function renderReceipt(');
  const browse=section('function renderProducts()', '/** Stock state derived');
  const detail=section('function openProductDetail(', '/** Install data');
  assert.doesNotMatch(checkout,/remaining\(|yeterli stok|stok yok/);
  assert.match(checkout,/await saveCentralSale\(record\)/);
  assert.match(checkout,/await recordCustomerCredit\(creditCustomer.id,record\)/);
  assert.match(checkout,/state\.centralReadOnly/);
  assert.match(checkout,/payment==='Veresiye'&&!creditCustomer/);
  assert.doesNotMatch(browse,/if\(state\.stockOnly&&remaining\(p\)<1\)/);
  assert.match(browse,/const available=!state\.centralReadOnly&&!p\.fiyatBelirsiz/);
  assert.match(detail,/state\.centralReadOnly \|\| !isActive\(product\) \|\| product\.fiyatBelirsiz/);
  assert.doesNotMatch(detail,/remaining\(product\)/);
});

test('stock inquiries are hidden but legacy product data and stock tools remain intact',()=>{
  for(const id of ['homeQuickStock','homeStockInsight','sidebarStock','onlyInStock']){
    assert.match(html,new RegExp('id="'+id+'"[^>]*hidden'));
    assert.ok(css.includes('#'+id+'[hidden]'),id+' CSS hiding rule');
  }
  assert.doesNotMatch(html,/<option value="stock">Stok<\/option>/);
  assert.match(html,/id="stockEditDialog"/);
  assert.match(html,/id="manageStock"/);
  assert.match(sw,/no-stock-limits-v82/);
});
