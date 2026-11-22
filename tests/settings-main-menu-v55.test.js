import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('styles.css'),worker=read('sw.js');
const customers=read('customer-ui.js'),categories=read('category-image-manager.js');
const start=html.indexOf('<section id="settingsView"');
const end=html.indexOf('</section>\n    </main>',start);
const settings=html.slice(start,end);
const menu=settings.slice(settings.indexOf('id="settingsMainMenu"'),
  settings.indexOf('id="settingsPreferences"'));

test('main menu has exactly 8 approved tiles, with Settings beside Backup',()=>{
  const order=[...menu.matchAll(/(?:<button|<a) id="(settings[A-Za-z]+)"/g)].map(m=>m[1]);
  assert.deepEqual(order,[
    'settingsExcel','settingsAdd','settingsHistory','settingsExport',
    'settingsManage','settingsCategoryImages','settingsBackup','settingsOpenPreferences'
  ]);
  assert.ok(!menu.includes('settingsCustomers'));
  assert.ok(!menu.includes('settingsTemplate'));
  assert.ok(!settings.includes('Ana Sayfaya Git'));
  assert.ok(!settings.includes('Başlangıca Dön'));
  assert.ok(!app.includes("$('settingsHome')"));
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});

test('all 8 settings sections retain product, customer, printer and data controls',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  const sections=[...settings.matchAll(/<details id="(settings[A-Za-z]+Group)"/g)].map(m=>m[1]);
  assert.deepEqual(sections,[
    'settingsGeneralGroup','settingsPickerGroup','settingsProductGroup',
    'settingsPrintingGroup','settingsPaymentsGroup','settingsDiscountGroup',
    'settingsDataGroup','settingsCustomerGroup'
  ]);
  for(const id of ['settingsCustomers','settingsTemplate','settingsPrintWidth',
    'settingsReceiptAction','settingsPrinterDetails','settingsPickerMode'])
    assert.ok(ids.includes(id),id);
  assert.ok(settings.indexOf('id="settingsCustomers"')>settings.indexOf('id="settingsCustomerGroup"'));
  assert.ok(settings.indexOf('id="settingsTemplate"')>settings.indexOf('id="settingsDataGroup"'));
  assert.match(customers,/settingsCustomers'\)\.addEventListener\('click',open\)/);
  assert.match(categories,/settingsCategoryImages'\)\.addEventListener\('click',open\)/);
});

test('settings navigation opens and closes the nested preferences without route changes',()=>{
  const from=app.indexOf('function showSettingsMainMenu()');
  const to=app.indexOf('async function setup()',from);
  assert.ok(from>0&&to>from);
  const nodes={
    settingsMainMenu:{hidden:false},
    settingsPageTitle:{hidden:false},
    settingsPreferences:{hidden:true}
  };
  let opened=null;
  const helpers=runInNewContext(
    '(function(get,view){const $=get;const setView=view;'+
    app.slice(from,to)+
    ';return {showSettingsMainMenu,showSettingsPreferences,openSettingsMenu};})'
  )(id=>nodes[id],value=>{opened=value});
  helpers.showSettingsPreferences();
  assert.equal(nodes.settingsMainMenu.hidden,true);
  assert.equal(nodes.settingsPageTitle.hidden,true);
  assert.equal(nodes.settingsPreferences.hidden,false);
  helpers.showSettingsMainMenu();
  assert.equal(nodes.settingsMainMenu.hidden,false);
  assert.equal(nodes.settingsPageTitle.hidden,false);
  assert.equal(nodes.settingsPreferences.hidden,true);
  helpers.showSettingsPreferences();
  helpers.openSettingsMenu();
  assert.equal(opened,'settings');
  assert.equal(nodes.settingsMainMenu.hidden,false);
  assert.equal(nodes.settingsPreferences.hidden,true);
});

test('all relocated controls have active handlers and call existing workflows',()=>{
  const begin=app.indexOf("  $('navSettings').addEventListener");
  const finish=app.indexOf('  // The six approved home shortcuts',begin);
  assert.ok(begin>0&&finish>begin);
  const calls=[],handlers=new Map();
  const elems=new Map();
  const get=id=>{
    if(!elems.has(id))elems.set(id,{
      open:false,addEventListener(event,handler){
        if(event==='click')handlers.set(id,handler);
      },click(){if(handlers.has(id))handlers.get(id)();else calls.push(id)},
      scrollIntoView(){calls.push('scroll:'+id)}
    });
    return elems.get(id);
  };
  const ctx={
    $:get,openSettingsMenu:()=>calls.push('menu'),
    showSettingsMainMenu:()=>calls.push('back'),
    showSettingsPreferences:()=>calls.push('preferences'),
    openSale:()=>calls.push('sale')
  };
  runInNewContext('(function(c){const {$,openSettingsMenu,showSettingsMainMenu,'+
    'showSettingsPreferences,openSale}=c;'+app.slice(begin,finish)+';})')(ctx);
  get('settingsOpenPreferences').click();
  get('settingsBackToMenu').click();
  get('settingsInnerManage').click();
  get('settingsInnerCategoryImages').click();
  get('settingsInnerBackup').click();
  get('settingsInnerExcel').click();
  get('settingsInnerExport').click();
  get('settingsPaymentsOpenSale').click();
  get('settingsDiscountOpenSale').click();
  get('settingsGeneralToPicker').click();
  assert.deepEqual(calls,[
    'preferences','back','settingsManage','settingsCategoryImages','settingsBackup',
    'settingsExcel','settingsExport','sale','sale','scroll:settingsPickerGroup'
  ]);
  assert.equal(get('settingsPickerGroup').open,true);
});

test('new settings shell is precached; scale, payment and sale files are not modified',()=>{
  assert.match(worker,/settings-v55/);
  assert.match(css,/#settingsPreferences\[hidden\]/);
  assert.match(html,/id="settingsCustomers"/);
});
