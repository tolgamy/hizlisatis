import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {normalizeReceiptSettings,readReceiptSettings,saveReceiptSettings} from '../public/receipt-settings.js';
import {receiptAsText,escPosReceipt} from '../public/receipt-share.js';
import {onRequestGet,onRequestPost} from '../functions/api/customers.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),styles=read('styles.css');

test('twelve image-only home categories in three columns and custom artwork for child categories',()=>{
  assert.match(styles,/\.home-category-shortcuts\{display:grid!important;grid-template-columns:repeat\(3/);
  assert.match(styles,/\.home-category-shortcuts \.photo-category-name\{display:none!important\}/);
  assert.match(app,/function categoryCover\(path\) \{[\s\S]*?return categoryArtwork\(path\);/);
  assert.match(app,/sortCategoryNodes\(state\.categoryTreeData\)/);
});
test('barcode scan prompts for one quantity; no repeated scanning for quantities',()=>{
  assert.match(html,/id="scanQuantityDialog"/);
  assert.match(html,/Kaç adet sepete eklensin/);
  assert.match(app,/function selectScannedQuantity\(/);
  assert.match(app,/function addToCart\(product, quantity=1\)/);
  assert.match(app,/addToCart\(product,qty\)/);
  assert.match(app,/active=>selectScannedQuantity/);
});
test('cart adjustments beep on increments, confirm deletion, leave discount blank',()=>{
  assert.match(app,/if\(num>line.quantity\)chirp\(\)/);
  assert.match(app,/if\(!confirm\(line.product.baslik\+' sepetten silinsin mi\?'\)\)/);
  assert.match(app,/line.discountPct\|\|''/);
});
test('sale navigation and cash payment are separate and remove receipt option clutter',()=>{
  assert.match(html,/id="saleQuickHome"/);
  assert.match(html,/id="saleQuickProducts"/);
  assert.match(html,/id="saleQuickSettings"/);
  assert.doesNotMatch(html,/id="cashOption"/);
  assert.doesNotMatch(html,/id="receiptWidth"/);
  assert.match(html,/id="cashPaymentDialog"/);
  assert.match(app,/function openCashPayment\(/);
  assert.match(app,/cashConfirm'\)\.addEventListener\('click',completeSale\)/);
  assert.match(app,/id===.settingsPrintWidth./);
});
test('customer name and required phone saved centrally; sales attach central credit customer id',()=>{
  assert.match(html,/id="settingsCustomers"/);
  assert.match(html,/id="customerPhone"[^>]+required/);
  assert.match(html,/id="creditCustomerSearch"/);
  assert.match(app,/recordCustomerCredit\(creditCustomer.id,record\)/);
  assert.match(app,/state\.pendingCreditSale/);
  assert.match(app,/if\(payment==='Veresiye'&&!creditCustomer\)/);
});
test('receipt settings persist title phone website and thermal 80/58 width',()=>{
  let stored='';
  const store={getItem:()=>stored,setItem:(_k,v)=>{stored=v}};
  assert.deepEqual(readReceiptSettings(store),{
    width:'80',title:'CEP HIZLI SATIŞ',phone:'',website:''});
  saveReceiptSettings({width:'58',title:'TOLGA MARKET',phone:'0555 123 45 67',website:'tolga.com'},store);
  assert.equal(readReceiptSettings(store).width,'58');
  const sale={items:[{baslik:'Pirinç',quantity:2,unitPrice:18,total:36}],id:'receipt-2026',
    createdAt:'2026-11-21T10:00:00.000Z',payment:'Nakit',total:36,change:4,currency:'TRY',
    receiptSettings:readReceiptSettings(store)};
  const text=receiptAsText(sale);
  assert.match(text,/TOLGA MARKET/);
  assert.match(text,/0555 123 45 67/);
  assert.match(text,/tolga.com/);
  assert.match(app,/const prefs=sale.receiptSettings\|\|readReceiptSettings\(\)/);
  assert.match(styles,/\.receipt-product\{margin:0/);
});
test('top brand button returns home; passive manual activation asks optional edit',()=>{
  assert.match(html,/id="brandHome"/);
  assert.match(html,/id="manageActivationDialog"/);
  const manager=read('product-management.js');
  assert.match(manager,/function offerManualActivation\(/);
  assert.match(manager,/manageUpdateActivate/);
  assert.match(manager,/manageDirectActivate/);
});
test('customer account routes protect data without credentials',async()=>{
  const db={prepare(){throw Error('Unauthorized request queried D1')},batch(){throw Error('Should not be called')}};
  const req=(method)=>new Request('https://hizlisatis.pages.dev/api/customers',{method,
    headers:{Origin:'https://hizlisatis.pages.dev'},
    ...(method==='POST'?{body:'{}',headers:{'Content-Type':'application/json',Origin:'https://hizlisatis.pages.dev'}}:{})});
  const env={DB:db,PRODUCT_WRITE_KEY:'very-strong-32-plus-character-cloudflare-secret'};
  const a=await onRequestGet({request:req('GET'),env});
  const b=await onRequestPost({request:req('POST'),env});
  assert.equal(a.status,401);assert.equal(b.status,401);
});
test('phone and website normalizer strips control chars and markup',()=>{
  assert.deepEqual(normalizeReceiptSettings({width:'200',title:'',website:'<script>foo</script>'}),{
    width:'80',title:'CEP HIZLI SATIŞ',phone:'',website:'scriptfoo/script'});
});

test('every changed client and API module parses as valid JavaScript',()=>{
  for(const path of ['app.js','product-management.js','customer-api.js','customer-ui.js',
    'receipt-share.js','receipt-pdf.js','receipt-settings.js']){
    execFileSync(process.execPath,['--check',fileURLToPath(new URL('../public/'+path,import.meta.url))]);
  }
  execFileSync(process.execPath,['--check',fileURLToPath(new URL('../functions/api/customers.js',import.meta.url))]);
});

test('Bluetooth ESC/POS prints dense bold slips and still cuts paper',()=>{
  const bytes=escPosReceipt({items:[{baslik:'Pirinç',quantity:1,unitPrice:10,total:10}],
    id:'bluetooth-receipt',createdAt:'2026-11-21T00:00:00Z',payment:'Nakit',
    total:10,change:0,currency:'TRY',receiptSettings:{title:'TOLGA MARKET',phone:'0555 123',width:'80'}});
  assert.deepEqual(Array.from(bytes.slice(0,8)),[0x1b,0x40,0x1b,0x45,0x01,0x1b,0x33,0x18]);
  assert.deepEqual(Array.from(bytes.slice(-6)),[0x1b,0x45,0,0x1d,0x56,0]);
});
