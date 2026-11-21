/** D1 is the only authority for custom category images.
 * Static original pictures are never overwritten. No photos in localStorage.
 */
const ENDPOINT='/api/category-images';
let revisions=new Map();

export function categoryOverrideUrl(path) {
  const revision=revisions.get(path);
  return revision ? ENDPOINT+'?path='+encodeURIComponent(path)+'&v='+encodeURIComponent(revision) : null;
}
export function hasCategoryOverride(path){return revisions.has(path);}
export function categoryOverrideCount(){return revisions.size;}

export async function refreshCategoryOverrides(fetcher=fetch) {
  const response=await fetcher(ENDPOINT,{cache:'no-store',credentials:'same-origin'});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data||typeof data.images!=='object'||Array.isArray(data.images))
    throw Error(data?.error||'Kategori görselleri yüklenemedi.');
  const next=new Map();
  for(const [path,revision] of Object.entries(data.images))
    if(typeof path==='string'&&path.length<150&&
      typeof revision==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(revision))
      next.set(path,revision);
  revisions=next;
  return next.size;
}
async function requestWithAdmin(method,path,base64,fetcher=fetch,promptKey=()=>window.prompt(
  'Kategori görsellerini kaydetmek için yönetim anahtarını girin:')) {
  const options={
    method,cache:'no-store',credentials:'same-origin',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify(base64?{path,base64}:{path})
  };
  const call=()=>fetcher(ENDPOINT,options);
  let res=await call();
  if(res.status===401){
    const key=promptKey();
    if(!key)throw Error('Yönetim oturumu açılmadı. Değişiklik kaydedilmedi.');
    const login=await fetcher('/api/admin-session',{
      method:'POST',cache:'no-store',credentials:'same-origin',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({key})
    });
    const loginData=await login.json().catch(()=>null);
    if(!login.ok)throw Error(loginData?.error||'Yönetim anahtarı doğrulanamadı.');
    res=await call();
  }
  const data=await res.json().catch(()=>null);
  if(!res.ok||!data?.ok)
    throw Error(data?.error||'Merkezi veritabanına kaydedilemedi.');
  if(method==='DELETE')revisions.delete(path);
  else if(typeof data.revision==='string')revisions.set(path,data.revision);
  return data;
}
export function saveCategoryOverride(path,base64,fetcher,promptKey){
  return requestWithAdmin('POST',path,base64,fetcher,promptKey);
}
export function restoreCategoryOriginal(path,fetcher,promptKey){
  return requestWithAdmin('DELETE',path,null,fetcher,promptKey);
}
