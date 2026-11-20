/** All mutable product data belongs to Cloudflare D1.
 * Product catalog JSON and IndexedDB may cache reads but must never authorize writes.
 */
let writeKey='';
async function call(method='GET',body=null,query='') {
  const headers={'Accept':'application/json'};
  if(body&&typeof body==='object'){ 
    if(!writeKey){
      const answer=window.prompt('Merkezi veritabanı yönetim anahtarını girin (Cloudflare PRODUCT_WRITE_KEY):');
      if(!answer) throw Error('Sunucu yönetim anahtarı gerekli. Kayıt yapılmadı.');
      writeKey=answer.trim();
    }
    headers['Content-Type']='application/json';
    headers['X-Product-Key']=encodeURIComponent(writeKey);
  }
  let response;
  try {
    response=await fetch('/api/product-state'+query,{
      method,headers,body:body&&typeof body==='object'?JSON.stringify(body):undefined,
      cache:'no-store',credentials:'same-origin'
    });
  } catch {throw Error('Merkezi veritabanına bağlanılamıyor. İnternet bağlantısını kontrol edin.');}
  const json=await response.json().catch(()=>null);
  if(!response.ok){
    if(response.status===401)writeKey='';
    throw Error(json?.error||'Merkezi veritabanı hatası: HTTP '+response.status);
  }
  return json;
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
