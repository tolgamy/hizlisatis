import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const load=filename=>readFileSync(new URL('../public/'+filename,import.meta.url),'utf8');
const app=load('app.js'),css=load('styles.css'),html=load('index.html'),sw=load('sw.js');
const patch=css.slice(css.indexOf('/* v65 — Native desktop Sale & Reports pages.'));
const desktopBreakpoint='(min-width:1024px) and (min-height:600px) and (orientation:landscape) and (hover:hover) and (pointer:fine)';

test('desktop Sale and Reports render in native page sections, not visible dialogs',()=>{
  assert.match(app,/function useDesktopWorkspace\(\)/);
  assert.ok(app.includes(desktopBreakpoint));
  for(const id of ['saleView','reportsView','homeView','catalogView','stockView','settingsView'])
    assert.match(html,new RegExp('<section id="'+id+'"[^>]*'));
  const pages=html.slice(html.indexOf('id="stockView"'),html.indexOf('</main>'));
  assert.ok(pages.includes('id="saleView"'));
  assert.ok(pages.includes('id="reportsView"'));
  assert.match(app,/placeNativeWorkspacePages\(\)/);
  assert.match(app,/navigate\('#sale'\)/);
  assert.match(app,/navigate\('#reports'\)/);
  assert.match(app,/dom\.cartDialog\.showModal\(\)/);
  assert.match(app,/dom\.historyDialog\.showModal\(\)/);
  assert.doesNotMatch(app,/placeDesktopWorkspace\(/);
});

test('only one physical set of cashier/report controls moves between desktop and mobile',()=>{
  const begin=app.indexOf('function placeNativeWorkspacePages()');
  const end=app.indexOf('function returnToPreviousWorkspace()',begin);
  assert.ok(begin>0&&end>begin);
  const mk=(name)=>({name,childNodes:[],append(...nodes){
    for(const node of nodes){
      if(node.parent){const i=node.parent.childNodes.indexOf(node);if(i>=0)node.parent.childNodes.splice(i,1);}
      this.childNodes.push(node);node.parent=this;
    }
  }});
  const dialog=mk('mobile-sale'),reportDialog=mk('mobile-report'),sale=mk('desktop-sale'),reports=mk('desktop-reports');
  const cashier={id:'cashier'},chart={id:'chart'};
  dialog.append(cashier);reportDialog.append(chart);
  let desktop=true;
  const ctx={dom:{cartDialog:dialog,historyDialog:reportDialog},
    $:id=>id==='saleView'?sale:reports,useDesktopWorkspace:()=>desktop,Array};
  const run=runInNewContext(app.slice(begin,end)+';placeNativeWorkspacePages',ctx);
  run();
  assert.deepEqual(sale.childNodes,[cashier]);
  assert.deepEqual(reports.childNodes,[chart]);
  assert.equal(dialog.childNodes.length,0);
  assert.equal(reportDialog.childNodes.length,0);
  run();
  assert.equal(sale.childNodes.length,1,'no duplicate controls');
  desktop=false;run();
  assert.deepEqual(dialog.childNodes,[cashier]);
  assert.deepEqual(reportDialog.childNodes,[chart]);
  assert.equal(sale.childNodes.length,0);
  assert.equal(reports.childNodes.length,0);
});

test('same shell layout and non-modal desktop canvas preserve existing visual design',()=>{
  assert.ok(patch.startsWith('/* v65'));
  assert.ok(patch.includes('@media '+desktopBreakpoint));
  assert.match(patch,/#app #mainContent > #saleView\.workspace-page:not\(\[hidden\]\)/);
  assert.match(patch,/#app #mainContent > #reportsView\.workspace-page:not\(\[hidden\]\)/);
  assert.match(patch,/grid-template-areas:"saleheader saleheader" "salesearch payment" "salelist payment"/);
  assert.match(patch,/#reportsView #historySummary\.history-summary:not\(\[hidden\]\)/);
  assert.match(patch,/#reportsView #historyItems\.history-items/);
  assert.doesNotMatch(patch,/position:fixed!important/);
  assert.doesNotMatch(css,/body\.desktop-workspace #mainContent > :not\(#cartDialog\)/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});

test('navigation, device reports, permission gate and mobile checkout remain intact',()=>{
  assert.match(app,/\$\('saleView'\)\.hidden=!useDesktopWorkspace\(\)\|\|state\.view!=='sale'/);
  assert.match(app,/\$\('reportsView'\)\.hidden=!useDesktopWorkspace\(\)\|\|state\.view!=='reports'/);
  assert.match(app,/state\.sales = \(await getSales\(\)\)/);
  assert.match(app,/renderHistorySummary\(state\.sales\)/);
  assert.match(app,/await authorizeCheckout\(record\)/);
  assert.match(app,/state\.previousWorkspaceHash/);
  assert.match(app,/dom\.cartDialog\.addEventListener\('cancel',event=>\{/);
  for(const id of ['saleBarcode','cartItems','completeSale','historySummary',
    'historySummaryChart','historyItems','exportSales','sidebarReports'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(sw,/native-workspaces-v65/);
});
