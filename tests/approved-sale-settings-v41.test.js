import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {readFileSync} from 'node:fs';
import {createDeviceBackup,parseDeviceBackup} from '../public/device-backup.js';
import {restoreSalesBackup,getSales,getLocalSnapshot} from '../public/idb.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html=read('index.html'),css=read('styles.css'),app=read('app.js'),sw=read('sw.js');

test('Settings has nine functional tiles plus home with responsive 3x3 and 5x2 arrangements',()=>{
  const start=html.indexOf('class="settings-links settings-card-grid"');
  const end=html.indexOf('</div>',start);
  const tiles=html.slice(start,end);
  const ids=[...tiles.matchAll(/<(?:button|a) id="(settings\w+)"[^>]+class="settings-tile/g)].map(m=>m[1]);
  assert.deepEqual(ids,['settingsExcel','settingsAdd','settingsManage','settingsCategoryImages',
    'settingsCustomers','settingsHistory','settingsExport','settingsBackup','settingsTemplate','settingsHome']);
  assert.match(css,/\/\* v4\.9 — approved device-specific Settings grid/);
  assert.match(css,/\.settings-view \.settings-card-grid\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media \(min-width:900px\) and \(hover:hover\) and \(pointer:fine\)\{[\s\S]*?grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/\.settings-view \.settings-card-grid>\.settings-tile-home\{[\s\S]*?grid-column:1\/-1/);
  assert.match(html,/id="settingsTemplate"[^>]+href="\/urun-yukleme-sablonu.xlsx"/);
  assert.match(html,/<details id="settingsPrinterDetails" class="settings-printer-details">/);
  assert.doesNotMatch(html,/<details id="settingsPrinterDetails"[^>]*\sopen\b/);
  assert.match(html,/id="settingsReceiptSave"/);
  assert.match(html,/id="backupDialog"/);
  assert.match(app,/\$\('settingsHome'\)\.addEventListener\('click',\(\)=>setView\('home'\)\)/);
  assert.match(app,/classList\.toggle\('view-settings', state\.view === 'settings'\)/);
});
test('Sale has one-line header and image-led cart without redundant screen shortcuts',()=>{
  const sale=html.slice(html.indexOf('<dialog id="cartDialog"'),html.indexOf('</dialog>',html.indexOf('<dialog id="cartDialog"')));
  assert.doesNotMatch(sale,/class="sale-quick-nav"|saleQuickHome|saleQuickProducts|saleQuickSettings/);
  assert.match(css,/\.sale-sheet \.sale-sheet-header\{[\s\S]*?flex-wrap:nowrap/);
  assert.match(css,/\.sale-sheet \.sale-heading\{[\s\S]*?white-space:nowrap/);
  assert.match(app,/className='sale-cart-product-image'/);
  assert.match(app,/applyProductImage\(image,line\.product\.gorsel,192,'high'\)/);
  assert.match(app,/class="sale-cart-emoji"/);
  assert.match(css,/\.sale-sheet \.cart-line\{[\s\S]*?grid-template-columns:clamp\(68px,20vw,98px\)/);
  assert.match(css,/\.sale-sheet \.cart-items\{[\s\S]*?overflow-y:auto/);
  for(const id of ['saleBack','saleCancel','saleClose','completeSale'])
    assert.match(sale,new RegExp('id="'+id+'"'));
  assert.match(sw,/v46-one-scan-cash-modes/);
});

test('Device backup rejects foreign, broken or duplicate sales and carries settings safely',()=>{
  const settings={width:'80',title:'Mağazam',phone:'',website:''};
  const sale={id:'test-b41-1',createdAt:'2026-11-22T09:00:00.000Z',payment:'Havale / FAST',
    total:30,currency:'TRY',items:[{id:'item-41-a',baslik:'Ürün',quantity:2,unitPrice:15,total:30}]};
  const text=createDeviceBackup([sale],settings);
  const parsed=parseDeviceBackup(text);
  assert.deepEqual(parsed.sales,[sale]);
  assert.deepEqual(parsed.receiptSettings,settings);
  assert.equal(parseDeviceBackup(createDeviceBackup([sale,sale],settings)).sales.length,1);
  assert.throws(()=>parseDeviceBackup('not-json'),/Geçerli/);
  assert.throws(()=>parseDeviceBackup('{"format":"random","sales":[]}'),/yedeği/);
  assert.throws(()=>parseDeviceBackup(createDeviceBackup([{...sale,items:[{id:'a',quantity:-3}]}],settings)),/satış satırı/);
});

test('Import restores new local sales and sold counters without duplicating existing receipts',async()=>{
  const rows=[
    {id:'restore-v41-one',createdAt:'2026-11-22T10:00:00Z',payment:'Nakit',
      total:50,items:[{id:'product-v41-a',quantity:2,baslik:'A',unitPrice:25,total:50}]},
    {id:'restore-v41-two',createdAt:'2026-11-22T11:00:00Z',payment:'Kart',
      total:20,items:[{id:'product-v41-a',quantity:1,baslik:'A',unitPrice:20,total:20}]}
  ];
  const first=await restoreSalesBackup(rows);
  assert.deepEqual(first,{added:2,skipped:0});
  assert.equal((await getSales()).filter(s=>s.id.startsWith('restore-v41')).length,2);
  assert.equal((await getLocalSnapshot()).adjustments.find(x=>x.id==='product-v41-a')?.soldQuantity,3);
  const second=await restoreSalesBackup(rows);
  assert.deepEqual(second,{added:0,skipped:2});
  assert.equal((await getLocalSnapshot()).adjustments.find(x=>x.id==='product-v41-a')?.soldQuantity,3);
});

test('Device backup is locally scoped and never promises to modify central inventory',()=>{
  assert.match(html,/Merkezi D1 ürünleri, müşteri borçları ve yönetici şifreleri bu yedeğe dahil değildir/);
  assert.match(app,/await restoreSalesBackup\(data\.sales\)/);
  assert.match(app,/await getLocalSnapshot\(\)/);
  assert.match(app,/saveReceiptSettings\(data\.receiptSettings\)/);
  assert.match(app,/async function exportHistory\(\) \{[\s\S]*?const savedSales=await getSales\(\)/);
  assert.match(sw,/\'\/device-backup\.js\'/);
});
