import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=file('index.html'),css=file('styles.css'),auth=file('auth-ui.js'),sw=file('sw.js');

async function sessionFixture(role='admin'){
  const original={document:globalThis.document,location:globalThis.location,
    window:globalThis.window,history:globalThis.history,fetch:globalThis.fetch};
  const elements=new Map(),listeners=new Map();
  let focused='',deletions=0,reloads=0,rejectDelete=false;
  const make=id=>{
    if(elements.has(id))return elements.get(id);
    const events=new Map(),classes=new Set();
    const node={
      id,hidden:['accessIdentity','accessLogout','accessAccountMenu'].includes(id),
      open:false,disabled:false,textContent:'',value:'',
      attributes:new Map(),
      classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},
      setAttribute(name,value){this.attributes.set(name,String(value))},
      getAttribute(name){return this.attributes.get(name)},
      addEventListener(name,cb){
        const list=events.get(name)||[];list.push(cb);events.set(name,list);
      },
      async fire(name,event={}){
        for(const fn of events.get(name)||[])await fn(event);
      },
      contains(target){return target===this},
      focus(){focused=id},
      showModal(){this.open=true},
      close(){
        this.open=false;
        for(const fn of events.get('close')||[])fn({});
      }
    };
    elements.set(id,node);
    return node;
  };
  const documentListeners=new Map();
  const document={
    body:{classList:make('body').classList},
    getElementById:make,
    querySelector:selector=>selector==='.access-identity-actions'?make('identityContainer'):null,
    querySelectorAll:()=>[],
    addEventListener(name,fn){
      const list=documentListeners.get(name)||[];list.push(fn);documentListeners.set(name,list);
    },
    fire(name,event){
      for(const fn of documentListeners.get(name)||[])fn(event);
    }
  };
  globalThis.document=document;
  globalThis.location={href:'https://hizlisatis.pages.dev/',reload(){reloads++}};
  globalThis.window={addEventListener(){},dispatchEvent(){}};
  globalThis.history={state:null,replaceState(){}};
  globalThis.fetch=async(url,opts={})=>{
    if(url!=='/api/auth')throw Error('Unexpected URL '+url);
    if(opts.method==='DELETE'){
      deletions++;
      if(rejectDelete)return new Response(JSON.stringify({error:'Sunucu hatası'}),{
        status:503,headers:{'content-type':'application/json'}
      });
      return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
    }
    return new Response(JSON.stringify({enabled:true,authenticated:true,
      user:{username:role==='admin'?'admin':'kasa1',role,permissions:role==='admin'?[]:['sales']}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  const {requireAccess}=await import('../public/auth-ui.js?account-flow-v74-'+role);
  await requireAccess();
  return {
    e:make,document,
    get focused(){return focused},
    get deletions(){return deletions},
    get reloads(){return reloads},
    set deleteFails(value){rejectDelete=value},
    restore(){
      for(const [name,value] of Object.entries(original)){
        if(value===undefined)delete globalThis[name];else globalThis[name]=value;
      }
    }
  };
}

test('the header only says Çıkış and uses true session user and role inside a popup',async()=>{
  const t=await sessionFixture();
  try{
    assert.equal(t.e('accessMenuRole').textContent,'Yönetici');
    assert.equal(t.e('accessMenuUsername').textContent,'admin');
    assert.equal(t.e('accessIdentity').textContent,'admin · Yönetici');
    assert.equal(t.e('identityContainer').classList.contains('has-session'),true);
    assert.equal(t.e('accessAccountMenu').hidden,true);
    assert.equal(t.e('accessLogout').hidden,false);
    assert.equal(t.e('accessLogout').getAttribute('aria-expanded'),'false');
    await t.e('accessLogout').fire('click');
    assert.equal(t.e('accessAccountMenu').hidden,false);
    assert.equal(t.e('accessLogout').getAttribute('aria-expanded'),'true');
    assert.equal(t.focused,'accessMenuLogout');
    assert.equal(t.deletions,0,'menu does not sign out');
    t.document.fire('keydown',{key:'Escape'});
    assert.equal(t.e('accessAccountMenu').hidden,true);
    assert.equal(t.focused,'accessLogout');
    await t.e('accessLogout').fire('click');
    t.document.fire('pointerdown',{target:t.e('otherPlace')});
    assert.equal(t.e('accessAccountMenu').hidden,true);
  }finally{t.restore()}
});

test('account menu and confirmation require three deliberate taps before logout',async()=>{
  const t=await sessionFixture();
  try{
    await t.e('accessLogout').fire('click');
    await t.e('accessMenuLogout').fire('click');
    assert.equal(t.e('accessAccountMenu').hidden,true);
    assert.equal(t.e('accessLogoutConfirm').open,true);
    assert.equal(t.deletions,0,'opening confirmation does not log out');
    await t.e('accessLogoutCancel').fire('click');
    assert.equal(t.e('accessLogoutConfirm').open,false);
    assert.equal(t.deletions,0,'cancel keeps session');
    assert.equal(t.reloads,0);
    await t.e('accessLogout').fire('click');
    await t.e('accessMenuLogout').fire('click');
    await t.e('accessLogoutApprove').fire('click');
    assert.equal(t.deletions,1);
    assert.equal(t.reloads,1);
  }finally{t.restore()}
});

test('a failing sign-out request does not falsely log the user out',async()=>{
  const t=await sessionFixture('cashier');
  try{
    assert.equal(t.e('accessMenuRole').textContent,'Çalışan');
    assert.equal(t.e('accessMenuUsername').textContent,'kasa1');
    t.deleteFails=true;
    await t.e('accessLogout').fire('click');
    await t.e('accessMenuLogout').fire('click');
    await t.e('accessLogoutApprove').fire('click');
    assert.equal(t.reloads,0);
    assert.equal(t.e('accessLogoutConfirm').open,true);
    assert.equal(t.e('accessLogoutApprove').disabled,false);
    assert.match(t.e('accessLogoutError').textContent,/Sunucu hatası/);
    t.deleteFails=false;
    await t.e('accessLogoutApprove').fire('click');
    assert.equal(t.deletions,2);
    assert.equal(t.reloads,1);
  }finally{t.restore()}
});

test('responsive popup and confirm only affect account interface',()=>{
  const part=css.slice(css.indexOf('/* v74 — focused account / logout flow.'));
  assert.ok(part.startsWith('/* v74'));
  assert.match(part,/@media \(max-width:430px\)/);
  assert.match(part,/width:min\(304px,calc\(100vw - 24px\)\)/);
  assert.match(part,/width:min\(92vw,430px\)/);
  assert.match(part,/max-height:min\(85dvh,560px\)/);
  assert.match(part,/#app \.clean-topbar \.access-identity-actions\.has-session #accessIdentity:not\(\[hidden\]\)/);
  assert.doesNotMatch(part,/#settingsView|#homeView|#cartDialog|#productCategoryHome|#stockView|#reportsView/);
  assert.match(sw,/account-signout-confirm-v74/);
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
  for(const id of ['accessLogout','accessMenuLogout','accessMenuRole',
      'accessMenuUsername','accessLogoutConfirm','accessLogoutCancel','accessLogoutApprove']){
    assert.ok(html.includes('id="'+id+'"'),id);
    assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
  }
  assert.match(html,/Çıkmak istiyor musunuz\?/);
  assert.match(auth,/await call\('\/api\/auth',\{method:'DELETE'\}\)/);
});
