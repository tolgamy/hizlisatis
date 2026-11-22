/** All mutable product data belongs to Cloudflare D1.
 * Product catalog JSON and IndexedDB may cache reads but must never authorize writes.
 */
/** Reads stay public. Writes require a signed HttpOnly admin session.
 * On a new device (or after 30 days), authenticate once; no secret is saved
 * in localStorage, IndexedDB, or JavaScript memory between operations.
 */
async function call(method='GET',body=null,query='') {
  const isWrite=body&&typeof body==='object';
  const options={
    method,headers:{'Accept':'application/json',...(isWrite?{'Content-Type':'application/json'}:{})},
    body:isWrite?JSON.stringify(body):undefined,
    cache:'no-store',credentials:'same-origin'
  };
  const run=async()=>{
    try{return await fetch('/api/product-state'+query,options)}
    catch{throw Error('Merkezi veritabanına bağlanılamıyor. İnternet bağlantısını kontrol edin.')}
  };
  let response=await run();
  if(isWrite && response.status===401) {
    const access=await fetch('/api/auth',{cache:'no-store',credentials:'same-origin'})
      .then(r=>r.json()).catch(()=>({enabled:true,authenticated:false}));
    if(access.enabled) {
      if(!access.authenticated)window.dispatchEvent(new Event('hizlisatis:auth-required'));
      throw Error('Bu işlem için geçerli ürün düzenleme yetkiniz yok. Yönetici hesabınızın izinlerini kontrol edin.');
    }
    // Backward compatibility only BEFORE AUTH_V2_ENABLED is activated.
    const key=window.prompt('Bu cihaz için bir kez merkezi yönetim anahtarını girin. Güvenli oturum 30 gün açık kalır:');
    if(!key)throw Error('Yönetim oturumu açılmadı. Ürün değiştirilmedi.');
    let login;
    try {
      login=await fetch('/api/admin-session',{
        method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({key}),cache:'no-store',credentials:'same-origin'
      });
    }catch{throw Error('Yönetim oturumu açılamadı. İnternet bağlantısını kontrol edin.')}
    const data=await login.json().catch(()=>null);
    if(!login.ok)throw Error(data?.error||'Yönetim anahtarı doğrulanamadı.');
    response=await run();
  }
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error(data?.error||'Merkezi veritabanı hatası: HTTP '+response.status);
  return data;
}
export async function logoutAdminSession() {
  // Legacy product-management logout must also terminate the NEW signed user
  // session; otherwise this misleading button would leave the admin logged in.
  const response=await fetch('/api/auth',{credentials:'same-origin',cache:'no-store'});
  const status=await response.json().catch(()=>null);
  if(!response.ok||!status)throw Error('Giriş durumu doğrulanamadı; oturum kapatma başarısız.');
  const path=status.enabled?'/api/auth':'/api/admin-session';
  const result=await fetch(path,{method:'DELETE',credentials:'same-origin',cache:'no-store'});
  if(!result.ok)throw Error('Yönetim oturumu kapatılamadı.');
  if(status.enabled)location.reload();
}

export async function fetchRemoteProducts(onProgress) {
  const products=[],seen=new Set();
  let after='',bulkAt=null,expected=0;
  for(let page=0;page<50;page++) {
    let data;
    for(let attempt=0;attempt<3;attempt++) {
      try {
        data=await call('GET',null,'?after='+encodeURIComponent(after));
        break;
      }catch(error) {
        if(attempt===2) throw Error(
          'Merkezden ürünler alınamadı ('+products.length.toLocaleString('tr-TR')+
          '/19.096). '+error.message);
        await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
      }
    }
    if(!data||!Array.isArray(data.products))
      throw Error('Sunucudan geçersiz ürün verisi geldi.');
    bulkAt=data.bulkAt||null;
    if(Number.isInteger(data.expected))expected=data.expected;
    for(const item of data.products) {
      if(!item.id||seen.has(item.id))throw Error('Sunucuda yinelenen ürün kimliği.');
      products.push(item);seen.add(item.id);
    }
    onProgress?.({received:products.length,expected:expected||19096});
    if(!data.next) {
      if(expected && products.length<expected)
        throw Error('Merkezi ürün listesinin yalnızca '+products.length+
          ' kaydı geldi. Tamamı gelmeden ekran açılmadı.');
      return {products,bulkAt};
    }
    if(data.next===after||!data.products.length)
      throw Error('Sunucu sayfalama hatası.');
    after=data.next;
  }
  throw Error('Merkezi ürün verisi beklenen sınırı aştı.');
}

export async function checkRemoteProductStates(ids) {
  if(!Array.isArray(ids)||!ids.length||ids.length>60)throw Error('Sepet ürün sayısı geçersiz.');
  const data=await call('GET',null,'?ids='+encodeURIComponent(JSON.stringify(ids)));
  if(!data||!Array.isArray(data.products))throw Error('Merkezi stok doğrulaması yapılamadı.');
  return {products:new Map(data.products.map(p=>[p.id,p])),bulkAt:data.bulkAt};
}
export function saveRemoteProduct(product,reason) {
  return call('POST',{action:'upsert',product,reason});
}
export function deactivateRemoteProducts() {
  return call('POST',{action:'bulk-deactivate'});
}
export async function importRemoteProducts(products) {
  let batch=[],bytes=0,total=0;
  async function flush(){
    if(!batch.length)return;
    await call('POST',{action:'import',products:batch});
    total+=batch.length;batch=[];bytes=0;
  }
  for(const product of products){
    const size=JSON.stringify(product).length;
    if(size>3000000)throw Error('Bir ürün görseli veritabanı sınırını aşıyor.');
    if(batch.length>=30||bytes+size>1800000)await flush();
    batch.push(product);bytes+=size;
  }
  await flush();
  return total;
}
