import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html=file('index.html'),css=file('styles.css'),app=file('app.js'),
  auth=file('auth-ui.js'),sw=file('sw.js');
const marker='/* v61: Desktop account controls live in the top-right';
const i=css.indexOf(marker);
const rules=css.slice(i);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);

test('connection, identity and logout are the SAME existing elements, grouped once',()=>{
  assert.equal(ids.length,new Set(ids).size,'unique HTML ids');
  const before=html.slice(html.indexOf('<div class="brandline">'),html.indexOf('<div class="searchline">'));
  assert.match(before,/id="topbarAccountPanel" class="topbar-account-panel"/);
  for(const id of ['connectionStatus','accessIdentity','accessLogout']){
    assert.ok(before.includes('id="'+id+'"'),id+' remains in header');
    assert.equal(ids.filter(x=>x===id).length,1,id+' never duplicated');
  }
  assert.ok(!before.includes('accessUserButton'),'Users remains under Settings');
  assert.match(auth,/\$\('accessIdentity'\)\.textContent=user\.username/);
  assert.match(auth,/\$\('accessLogout'\)\.addEventListener\('click',async\(\)=>/);
  assert.match(app,/function setConnection\(\)/);
  assert.match(app,/navigator\.onLine \? '● Çevrimiçi' : '● Çevrimdışı'/);
});

test('only desktop pointer landscape has a fixed right-side account area',()=>{
  assert.ok(i>=0,'v61 styling appended after older desktop rules');
  assert.match(rules,/.topbar-account-panel \{ display:contents; \}/);
  assert.match(rules,/@media \(min-width:1024px\) and \(min-height:600px\) and \(orientation:landscape\) and \(hover:hover\) and \(pointer:fine\)/);
  assert.match(rules,/\.clean-topbar \.brandline \.topbar-account-panel \{/);
  assert.match(rules,/position:fixed!important/);
  assert.match(rules,/right:clamp\(16px,2vw,34px\)!important/);
  assert.match(rules,/\.clean-topbar \.brandline #connectionStatus \{/);
  assert.match(rules,/position:static!important/);
  assert.match(rules,/#connectionStatus\.online/);
  assert.match(rules,/#connectionStatus\.offline/);
  assert.match(rules,/#accessIdentity:not\(\[hidden\]\)/);
  assert.match(rules,/#accessLogout:not\(\[hidden\]\)/);
  assert.match(rules,/\.clean-topbar \.searchline \{/);
  assert.match(rules,/calc\(100% - 405px\)/);
});

test('mobile auth and existing desktop 6x2 categories are left intact',()=>{
  assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/);
  assert.match(css,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(html,/id="settingsOpenUsers"/);
  assert.match(auth,/\$\('settingsAdminGroup'\)\.hidden=user\.role!=='admin'/);
  assert.match(rules,/#app \.topbar-account-panel \[hidden\] \{ display:none!important; \}/);
  assert.match(sw,/desktop-account-status-v61/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});
