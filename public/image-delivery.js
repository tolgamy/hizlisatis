/** Small-phone image delivery: at most three simultaneous product photo loads.
 * Images remain unloaded until near viewport. Browser is free to decode them
 * asynchronously. CDN transforms are used only when explicitly enabled on Pages.
 */
let resized=false;
let busy=0;
const MAX_PARALLEL=3, pending=[];
let observer;
export async function detectImageResizing(fetcher=fetch) {
  try {
    const response=await fetcher('/api/image?status=1',{cache:'no-cache'});
    resized=response.ok && Boolean((await response.json()).enabled);
  } catch { resized=false; }
  return resized;
}
export function optimizedImageUrl(source,width=256) {
  const url=String(source||'');
  if(!resized || !/^https:\/\//i.test(url))return url;
  const allowed=[192,256,320,640,800];
  return `/api/image?w=${allowed.includes(width)?width:256}&url=${encodeURIComponent(url)}`;
}
function drain() {
  while(busy<MAX_PARALLEL&&pending.length) {
    const {image,source,width}=pending.shift();
    if(!image.isConnected)continue; // Old grid was replaced before scrolling to it.
    busy++;
    let done=false,timeout;
    const finish=()=>{
      if(done)return;done=true;
      clearTimeout(timeout);busy--;drain();
    };
    image.onload=()=>{image.style.visibility='visible';finish();};
    image.onerror=()=>{
      if(image.dataset.originalRetry !== '1' && optimizedImageUrl(source,width)!==source){
        image.dataset.originalRetry='1';
        image.src=source;
      } else { image.remove();finish(); }
    };
    timeout=setTimeout(finish,15000);
    image.src=optimizedImageUrl(source,width);
  }
}
function lazyObserver() {
  if(!observer && typeof IntersectionObserver!=='undefined') {
    observer=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){
        observer.unobserve(entry.target);
        const task=entry.target.__photoTask;
        delete entry.target.__photoTask;
        if(task)pending.push(task);
      }
      drain();
    },{rootMargin:'200px 0px'});
  }
  return observer;
}
export function applyProductImage(image,source,width=256,priority='low') {
  image.loading=priority==='high'?'eager':'lazy';
  image.decoding='async';
  image.fetchPriority=priority;
  image.referrerPolicy='no-referrer';
  image.alt='';
  image.style.visibility='hidden'; // Keep the local category icon visible while downloading.
  // User-uploaded D1 product photos are already compact data URIs. Load these
  // immediately: the fallback lazy queue can run before an image is connected
  // to the DOM and permanently discard its task on browsers without IO.
  if(/^data:image\/(?:webp|jpeg|png);base64,/.test(source)){
    image.onload=()=>{image.style.visibility='visible';};
    image.onerror=()=>image.remove();
    image.src=source;
    return image;
  }
  const task={image,source,width};
  if(priority==='high') {
    // Product detail is intentionally loaded immediately, not queued behind grid.
    image.onload=()=>{image.style.visibility='visible';};
    image.onerror=()=>{
      if(image.dataset.originalRetry!=='1'&&optimizedImageUrl(source,width)!==source){
        image.dataset.originalRetry='1';image.src=source;
      }else image.remove();
    };
    image.src=optimizedImageUrl(source,width);
  } else {
    const io=lazyObserver();
    if(io){image.__photoTask=task;io.observe(image);}
    else {pending.push(task);setTimeout(drain,0);}
  }
  return image;
}
