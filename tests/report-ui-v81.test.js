import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read = file => readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const html=read('index.html'), app=read('app.js'), css=read('styles.css'), sw=read('sw.js');

test('filters, summary, then history list are in that exact order',()=>{
  const from=html.indexOf('id="historyFilters"');
  const summary=html.indexOf('id="historySummary"');
  const title=html.indexOf('class="history-list-title"');
  const list=html.indexOf('id="historyItems"');
  assert.ok(from>0 && from<summary && summary<title && title<list);
  for(const id of ['historyFrom','historyTo','historyPayment','historyQuery','historySort',
    'historyMin','historyMax','historyReset','historyCashTotal','historyCardTotal',
    'historyCreditTotal','historyOtherTotal']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.match(app,/filterReportSales\(allReportSales,filters\)/);
  assert.match(app,/getSalesForReports\(getSales\)/);
  assert.match(app,/currentReportFilters=/);
  assert.match(app,/reportsPageLoaded && isReportsActive\(\)\?state\.sales/);
  assert.match(sw,/report-filters\.js/);
});

test('mobile summaries are visible but hidden empty state stays hidden',()=>{
  assert.match(css,/#historyDialog \.history-summary:not\(\[hidden\]\)/);
  assert.match(css,/#reportsView \.history-summary-empty\[hidden\]/);
  assert.match(css,/#historyDialog \.history-summary-empty\[hidden\]/);
});

test('payment summary uses only actual TRY receipt amounts',()=>{
  const begin=app.indexOf('function renderHistorySummary(sales){');
  const end=app.indexOf('let reportsPageLoaded=false;',begin);
  assert.ok(begin>0&&end>begin);
  const map=new Map();
  const $=id=>{
    if(!map.has(id))map.set(id,{
      textContent:'',hidden:false,children:[],style:{},
      replaceChildren(...nodes){this.children=nodes;}
    });
    return map.get(id);
  };
  const domNode=()=>({
    textContent:'',style:{},children:[],
    append(...nodes){this.children.push(...nodes);}
  });
  const fn=runInNewContext('(()=>{'+app.slice(begin,end)+';return renderHistorySummary;})()',{
    $, Date, Map, Math, Number, Intl,
    round2:n=>Math.round(n*100)/100,
    money:n=>'TRY '+Number(n).toFixed(2),
    document:{createElement:domNode}
  });
  const createdAt=new Date().toISOString();
  fn([
    {createdAt,total:489.95,currency:'TRY',payment:'Nakit'},
    {createdAt,total:25,currency:'TRY',payment:'Kart'},
    {createdAt,total:55,currency:'TRY',payment:'Veresiye'},
    {createdAt,total:10,currency:'TRY',payment:'Havale / FAST'},
    {createdAt,total:999,currency:'USD',payment:'Nakit'}
  ]);
  assert.equal($('historyCashTotal').textContent,'TRY 489.95');
  assert.equal($('historyCardTotal').textContent,'TRY 25.00');
  assert.equal($('historyCreditTotal').textContent,'TRY 55.00');
  assert.equal($('historyOtherTotal').textContent,'TRY 10.00');
  assert.equal($('historySummaryTotal').textContent,'TRY 579.95');
  assert.equal($('historySummaryCount').textContent,'4');
});
