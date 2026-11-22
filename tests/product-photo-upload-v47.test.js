import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {prepareProductPhoto,validProductPhoto} from '../public/product-photo.js';
import {applyProductImage} from '../public/image-delivery.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const manager=read('product-management.js'),html=read('index.html'),sw=read('sw.js');

test('photo encoder retries JPEG when canvas cannot encode WebP, and releases blob URL',async()=>{
  const originalImage=globalThis.Image;
  const originalDocument=globalThis.document;
  const originalCreate=URL.createObjectURL, originalRevoke=URL.revokeObjectURL;
  let created=0,revoked=0,drawn=0;
  const canvas={
    width:0,height:0,
    getContext:()=>({fillStyle:'',fillRect(){},drawImage(){drawn++;}}),
    toDataURL(type){
      if(type==='image/webp')return 'data:image/png;base64,QUFB'; // WebP not supported.
      return 'data:image/jpeg;base64,QUFB';
    }
  };
  globalThis.Image=class {
    naturalWidth=1200;naturalHeight=800;
    set src(value){assert.equal(value,'blob:photo');queueMicrotask(()=>this.onload());}
  };
  globalThis.document={createElement:tag=>{assert.equal(tag,'canvas');return canvas;}};
  URL.createObjectURL=()=>{created++;return 'blob:photo';};
  URL.revokeObjectURL=url=>{assert.equal(url,'blob:photo');revoked++;};
  try {
    const data=await prepareProductPhoto({type:'image/heic',size:500000});
    assert.equal(data,'data:image/jpeg;base64,QUFB');
    assert.equal(validProductPhoto(data),true);
    assert.equal(created,1);assert.equal(revoked,1);
    assert.ok(drawn>0);
    assert.ok(canvas.width<=640);
  }finally{
    globalThis.Image=originalImage;
    globalThis.document=originalDocument;
    URL.createObjectURL=originalCreate;
    URL.revokeObjectURL=originalRevoke;
  }
});

test('photo validation refuses a large data URI and non-image uploads',async()=>{
  assert.equal(validProductPhoto(''),false);
  assert.equal(validProductPhoto('data:text/html;base64,QUFB'),false);
  assert.equal(validProductPhoto('data:image/png;base64,QUFB'),false);
  assert.equal(validProductPhoto('data:image/webp;base64,QUFB'),true);
  assert.equal(validProductPhoto('data:image/webp;base64,'+'A'.repeat(300000)),false);
  await assert.rejects(prepareProductPhoto({type:'application/pdf',size:15}),/fotoğraf seçiniz/);
  await assert.rejects(prepareProductPhoto({type:'image/png',size:12*1024*1024+1}),/12 MB/);
});

test('product thumbnails display centrally stored base64 directly without deferred observer',()=>{
  const data='data:image/jpeg;base64,QUFB';
  let observed=0;
  const image={
    loading:'',style:{visibility:''},dataset:{},src:'',onload:null,onerror:null
  };
  applyProductImage(image,data,256,'low');
  assert.equal(image.src,data);
  assert.equal(image.style.visibility,'hidden');
  image.onload();
  assert.equal(image.style.visibility,'visible');
  assert.equal(observed,0);
});

function makeFormContext(){
  const nodes={
    manageImageFile:{files:[{type:'image/webp',size:1234}]},
    manageBarcodeInput:{value:'8691234567890'},
    manageName:{value:'Görselli Ürün'},
    manageMainCategory:{value:'Temel Gıda'},
    manageSubCategory:{value:'Baharat'},
    managePrice:{value:'25,50'},
    manageVat:{value:'10'},
    manageVatExcluded:{checked:false},
    manageStock:{value:''},managePurchase:{value:''},
    manageImage:{value:''},manageRemoveImage:{checked:false},
    manageBrand:{value:'Marka'},
    manageUnit:{value:'adet'},manageSaveActivate:{disabled:false},
  };
  const submit={disabled:false};
  const saved=[],warnings=[];
  const sandbox={
    imageTask:null,imageError:null,imageRevision:1,uploadImage:'',
    savingProduct:false,selection:null,form:{querySelector:()=>submit},
    $:id=>nodes[id],state:{products:[]},
    announce:(m)=>warnings.push(m),imageStatus:()=>{},
    parseLocaleNumber:value=>Number(String(value).replace(',','.')),
    safeImageUrl:()=>true,priceWithVat:entered=>({gross:entered}),
    newId:()=> 'manual::photo-test',
    now:()=> '2026-11-22T12:00:00.000Z',
    persist:async product=>saved.push(product)
  };
  const start=manager.indexOf('  async function saveForm(event,activate=false) {');
  const end=manager.indexOf('  function manageScannedBarcode(',start);
  assert.ok(start>0&&end>start);
  const fn=runInNewContext(manager.slice(start,end)+';saveForm',sandbox);
  return {fn,sandbox,saved,warnings,submit,nodes};
}

test('tapping Save during image processing waits, then persists photo in D1 product payload',async()=>{
  const {fn,sandbox,saved,submit}=makeFormContext();
  let finish;
  sandbox.imageTask=new Promise(resolve=>{finish=()=>{
    sandbox.uploadImage='data:image/webp;base64,QUFB';
    resolve();
  };});
  const writing=fn({preventDefault(){}});
  assert.equal(submit.disabled,true,'second save is prevented while photo encodes');
  assert.equal(saved.length,0);
  finish();
  await writing;
  assert.equal(saved.length,1);
  assert.equal(saved[0].gorsel,'data:image/webp;base64,QUFB');
  assert.equal(saved[0].id,'manual::photo-test');
  assert.equal(submit.disabled,false);
});

test('photo conversion errors cannot silently create products without images',async()=>{
  const {fn,sandbox,saved,warnings}=makeFormContext();
  sandbox.imageTask=Promise.resolve();
  sandbox.imageError=Error('Görsel açılamadı.');
  await fn({preventDefault(){}});
  assert.equal(saved.length,0);
  assert.match(warnings.join(' '),/Görsel açılamadı/);
});

test('editor verifies remote photo, explains centralized storage and shows upload status',()=>{
  assert.match(manager,/await imageTask/);
  assert.match(manager,/await prepareProductPhoto\(file\)/);
  assert.match(manager,/imageRevision\+\+/);
  assert.match(manager,/if\(\(action==='create'\|\|action\.startsWith\('edit'\)\)/);
  assert.match(manager,/\(verified\.gorsel\|\|''\)!==\(product\.gorsel\|\|''\)/);
  assert.match(html,/id="manageImageStatus"[^>]+role="status"/);
  assert.match(html,/merkezi veritabanına yüklenir ve diğer cihazlarda da görünür/);
  assert.match(sw,/cep-pos-shell-v49-cas-stable-frame/);
  assert.match(sw,/\/product-photo\.js/);
});
