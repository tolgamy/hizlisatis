import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=filename=>readFileSync(new URL('../public/'+filename,import.meta.url),'utf8');
const app=load('app.js'),css=load('styles.css'),html=load('index.html'),sw=load('sw.js');
const patch=css.slice(css.indexOf('/* v63 — Sales and Reports are actual in-page desktop workspaces'));
const desktopBreakpoint='(min-width:1024px) and (min-height:600px) and (orientation:landscape) and (hover:hover) and (pointer:fine)';

test('desktop Sales and Reports open in document flow, not in the modal top layer',()=>{
  assert.match(app,/function useDesktopWorkspace\(\)/);
  assert.ok(app.includes(desktopBreakpoint));
  assert.match(app,/placeDesktopWorkspace\(dom\.cartDialog\)/);
  assert.match(app,/placeDesktopWorkspace\(dom\.historyDialog\)/);
  assert.match(app,/if\(desktop\) dom\.cartDialog\.show\(\)/);
  assert.match(app,/if\(useDesktopWorkspace\(\)\) dom\.historyDialog\.show\(\)/);
  assert.match(app,/else dom\.cartDialog\.showModal\(\)/);
  assert.match(app,/else dom\.historyDialog\.showModal\(\)/);
});

test('old page is hidden behind desktop workspace and existing design survives',()=>{
  assert.ok(patch.includes('@media '+desktopBreakpoint));
  assert.match(patch,/body\.desktop-workspace #mainContent > :not\(#cartDialog\):not\(#historyDialog\)/);
  assert.match(patch,/position:relative!important/);
  assert.match(patch,/grid-template-areas:"saleheader saleheader" "salesearch payment" "salelist payment"/);
  assert.match(patch,/body\.desktop-reports-workspace #mainContent > #historyDialog\.sheet\[open\]/);
  assert.match(patch,/overflow-y:auto!important/);
  assert.doesNotMatch(patch,/#settingsView|#homeView|#catalogView|#stockView/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});

test('navigation updates, sale cart and real device reports remain intact',()=>{
  assert.match(app,/closeDesktopWorkspaceForNavigation\(\);/);
  assert.match(app,/dom\.historyDialog\.addEventListener\('close',updateNavigation\)/);
  assert.match(app,/dom\.cartDialog\.addEventListener\('close',updateNavigation\)/);
  assert.match(app,/state\.sales = \(await getSales\(\)\)/);
  assert.match(app,/renderHistorySummary\(state\.sales\)/);
  assert.match(app,/await authorizeCheckout\(record\)/);
  for(const id of ['saleBarcode','cartItems','completeSale','historySummary',
    'historySummaryChart','historyItems','exportSales','sidebarReports'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(sw,/inline-workspaces-v63/);
});
