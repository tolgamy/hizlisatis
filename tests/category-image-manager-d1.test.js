import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequestGet,onRequestPost,onRequestDelete} from '../functions/api/category-images.js';
import {
  categoryOverrideUrl,refreshCategoryOverrides,
  saveCategoryOverride,restoreCategoryOriginal
} from '../public/category-image-overrides.js';
import {MAIN_CATEGORY_ORDER} from '../public/category-art.js';
import {SUBCATEGORY_PATHS} from '../public/subcategory-photos.js';

const secret='a-strong-production-session-secret-longer-than-32';
const host='https://hizlisatis.pages.dev';
const webp=Buffer.from('RIFF'+String.fromCharCode(16,0,0,0)+'WEBP'+String.fromCharCode(0,0,0,0,0,0,0,0,0,0,0,0)).toString('base64');
function mockD1() {
  const rows=new Map([['catalog_seed_count','19096'],['bulk_at','2026-11-20']]);
  const prepare=sql=>({
    bind(...params){
      return {
        async first(){
          if(sql.startsWith('SELECT value FROM app_meta WHERE key='))return rows.has(params[0])?{value:rows.get(params[0])}:null;
          throw Error('Unexpected first query: '+sql);
        },
        async all(){
          if(sql.includes('category-image-version:%'))return {
            results:[...rows].filter(([key])=>key.startsWith('category-image-version:'))
              .map(([key,value])=>({key,value}))
          };
          throw Error('Unexpected all query: '+sql);
        },
        async run(){
          if(sql.startsWith('INSERT INTO app_meta'))rows.set(params[0],params[1]);
          else if(sql.startsWith('DELETE FROM app_meta'))rows.delete(params[0]);
          else throw Error('Unexpected write: '+sql);
        }
      };
    }
  });
  const db={prepare,async batch(statements){for(const stmt of statements)await stmt.run();}};
  return {db,rows};
}
function req(method,path='',body,auth=false,origin=host){
  return new Request(host+'/api/category-images'+path,{
    method,headers:{
      Origin:origin,'Content-Type':'application/json',
      ...(auth?{'X-Product-Key':encodeURIComponent(secret)}:{})
    },...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
}
const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');

test('all 12 main and 86 existing child paths available without taxonomy changes',()=>{
  assert.equal(MAIN_CATEGORY_ORDER.length,12);
  assert.equal(SUBCATEGORY_PATHS.length,86);
  assert.equal(new Set([...MAIN_CATEGORY_ORDER,...SUBCATEGORY_PATHS]).size,98);
  const html=read('index.html'),app=read('app.js'),css=read('styles.css');
  assert.match(html,/id="settingsCategoryImages"/);
  assert.match(html,/id="categoryImageDialog"/);
  assert.match(html,/id="imageEditSave"/);
  assert.match(html,/id="imageEditReset"/);
  assert.match(app,/categoryOverrideUrl\(path\)\|\|originalCategoryCover\(path\)/);
  assert.match(app,/createCategoryImageManager\(/);
  assert.match(css,/\.category-image-previews/);
  assert.match(read('category-image-manager.js'),/640 × 640 px/);
  assert.match(read('category-image-manager.js'),/720 × 640 px/);
});
test('category photo endpoint rejects unauthorized edits, invalid paths, invalid WebP',async()=>{
  const {db,rows}=mockD1(),env={DB:db,PRODUCT_WRITE_KEY:secret};
  const base64=webp;
  const bad=await onRequestPost({env,request:req('POST','',{path:'Kasap',base64})});
  assert.equal(bad.status,401);
  const origin=await onRequestPost({env,request:req('POST','',{path:'Kasap',base64},true,'https://evil.test')});
  assert.equal(origin.status,401);
  const invalid=await onRequestPost({env,request:req('POST','',{path:'Uydurma > Gizli',base64},true)});
  assert.equal(invalid.status,400);
  const invalidPhoto=await onRequestPost({env,request:req('POST','',{path:'Kasap',base64:Buffer.from('fake image file contents long enough').toString('base64')},true)});
  assert.equal(invalidPhoto.status,400);
  assert.equal(rows.has('category-image-data:Kasap'),false);
  assert.equal(rows.get('catalog_seed_count'),'19096');
});
test('save, list, fetch image, reset and leave first-install image untouched',async()=>{
  const {db,rows}=mockD1(),env={DB:db,PRODUCT_WRITE_KEY:secret};
  const category='Atıştırmalık > Sağlıklı Beslenme';
  const saved=await onRequestPost({env,request:req('POST','',{path:category,base64:webp},true)});
  assert.equal(saved.status,200);
  const info=await saved.json();
  assert.equal(info.ok,true);
  assert.match(info.revision,/^[a-f0-9]{32}$/);
  assert.equal(rows.get('catalog_seed_count'),'19096');
  const listed=await onRequestGet({env,request:req('GET')});
  assert.equal(listed.status,200);
  const index=await listed.json();
  assert.equal(index.images[category],info.revision);
  assert.equal(JSON.stringify(index).includes(webp),false);
  const image=await onRequestGet({env,request:req('GET','?path='+encodeURIComponent(category)+'&v='+info.revision)});
  assert.equal(image.status,200);
  assert.equal(image.headers.get('content-type'),'image/webp');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(webp,'base64'));
  const another=await onRequestPost({env,request:req('POST','',{path:'Kasap',base64:webp},true)});
  assert.equal(another.status,200);
  const unauthReset=await onRequestDelete({env,request:req('DELETE','',{path:category})});
  assert.equal(unauthReset.status,401);
  const reset=await onRequestDelete({env,request:req('DELETE','',{path:category},true)});
  assert.equal(reset.status,200);
  assert.equal((await reset.json()).restoredDefault,true);
  assert.equal(rows.has('category-image-data:'+category),false);
  assert.equal(rows.has('category-image-version:'+category),false);
  const after=await (await onRequestGet({env,request:req('GET')})).json();
  assert.equal(after.images[category],undefined);
  assert.equal(typeof after.images.Kasap,'string');
  const missing=await onRequestGet({env,request:req('GET','?path='+encodeURIComponent(category))});
  assert.equal(missing.status,404);
});
test('client updates preview URL after saving and removes it after default restore',async()=>{
  let posts=0,logins=0;
  const fetcher=async(_url,options={})=>{
    if(options.method==='POST'&&_url==='/api/admin-session'){
      logins++;return Response.json({ok:true});
    }
    if(options.method==='POST') {
      posts++;
      if(posts===1)return Response.json({error:'login'},{status:401});
      return Response.json({ok:true,revision:'revision20261121'});
    }
    if(options.method==='DELETE')return Response.json({ok:true,restoredDefault:true});
    return Response.json({images:{'Kasap':'olderrevision'}});
  };
  await refreshCategoryOverrides(fetcher);
  assert.match(categoryOverrideUrl('Kasap'),/olderrevision/);
  await saveCategoryOverride('Kasap',webp,fetcher,()=>secret);
  assert.equal(logins,1);
  assert.match(categoryOverrideUrl('Kasap'),/revision20261121/);
  await restoreCategoryOriginal('Kasap',fetcher,()=>secret);
  assert.equal(categoryOverrideUrl('Kasap'),null);
});
