import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/auth-ui.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

test('login form never has a native GET or active submit button',()=>{
  assert.match(html,/<form id="loginForm"[^>]*method="post"[^>]*action="\/api\/auth"/);
  assert.match(html,/<button id="loginSubmit" type="button" disabled>/);
  assert.doesNotMatch(html,/<form id="loginForm" autocomplete="on">/);
  assert.match(sw,/login-safe-v57/);
});

test('invalid HTML login API response never exposes credentials as URL params',async()=>{
  const saved={
    document:globalThis.document,fetch:globalThis.fetch,
    location:globalThis.location,history:globalThis.history
  };
  let scrubbedUrl='';
  const handlers=[];
  const form={addEventListener(name,handler){if(name==='submit')handlers.push(handler)}};
  const loginButton={type:'button',disabled:true};
  const error={textContent:''};
  const body={classList:{add(){},remove(){}}};
  const elements={loginGate:{hidden:false},loginForm:form,loginSubmit:loginButton,loginError:error};
  try{
    globalThis.document={getElementById:id=>elements[id],body};
    globalThis.location={href:'https://example.invalid/?username=someone&password=exposed-value'};
    globalThis.history={state:null,replaceState(_state,_title,url){scrubbedUrl=url}};
    globalThis.fetch=async()=>new Response('<!doctype html><html></html>',{
      headers:{'content-type':'text/html'},status:200
    });
    const {requireAccess}=await import('../public/auth-ui.js?login-prevent-query-test');
    assert.equal(scrubbedUrl,'/');
    await assert.rejects(requireAccess(),/giriş servisi bulunamadı/i);
    assert.equal(loginButton.type,'button');
    assert.equal(loginButton.disabled,true);
    assert.equal(handlers.length,1);
    let prevented=false;
    handlers[0]({preventDefault(){prevented=true}});
    assert.equal(prevented,true);
    assert.match(error.textContent,/hizlisatis\.pages\.dev/);
  }finally{
    for(const [name,value] of Object.entries(saved)){
      if(value===undefined)delete globalThis[name];else globalThis[name]=value;
    }
  }
});

test('login controls only become active after the server returns valid JSON',()=>{
  assert.match(source,/loginButton\.type='submit';/);
  assert.match(source,/loginButton\.disabled=false;/);
  assert.match(source,/type\.includes\('application\/json'\)/);
  assert.match(source,/form\.addEventListener\('submit',event=>event\.preventDefault\(\)\)/);
});
