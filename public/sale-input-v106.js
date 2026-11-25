// Hardware scanner capture without programmatic focus on a text field.
export function createSaleScanner({active,accept,lookup,looksLike,delay=550,clock=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}){
 let buffer='',last=0,timer=null;
 function clear(){if(timer!==null)cancel(timer);timer=null;buffer='';last=0;}
 function submit(){const code=buffer;clear();if(active()&&code&&(lookup(code)||looksLike(code)))return accept(code);return false;}
 function key(event){
   if(!active()||event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.repeat){clear();return;}
   const target=event.target;
   if(target?.isContentEditable||target?.closest?.('textarea,select,[contenteditable="true"],input:not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="submit"])')){clear();return;}
   const k=event.key;
   if(k==='Enter'||k==='Tab'){if(buffer&&(lookup(buffer)||looksLike(buffer))){event.preventDefault();submit();}else clear();return;}
   if(!/^[A-Za-z0-9._-]$/.test(k)){if(k!=='Shift')clear();return;}
   const now=clock();if(buffer&&now-last>180)clear();last=now;buffer+=k;
   if(buffer.length>64){clear();return;}
   if(timer!==null)cancel(timer);
   timer=schedule(()=>{timer=null;if(/^(?:\d{8}|\d{12,14})$/.test(buffer))submit();else clear();},delay);
 }
 return {key,clear};
}
export function installCategoryFit(){
 const grid=document.getElementById('homeCategoryShortcuts'),root=document.getElementById('productCategoryHome');
 const nav=document.querySelector('.bottom-shell'),header=document.querySelector('.topbar');
 if(!grid||!root||!nav)return;
 let scheduled=false;
 function update(){
   scheduled=false;
   if(!matchMedia('(max-width:599px) and (orientation:portrait)').matches||root.hidden||!grid.getClientRects().length)return;
   const viewport=window.visualViewport,top=grid.getBoundingClientRect().top;
   if(top<0||window.scrollY>15)return;
   const limit=Math.min(nav.getBoundingClientRect().top,(viewport?.height||innerHeight)+(viewport?.offsetTop||0));
   const available=Math.floor(limit-top-5);
   if(available>0)grid.style.setProperty('--v106-grid-height',Math.max(288,available)+'px');
 }
 function queue(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
 const obs=new MutationObserver(queue);obs.observe(root,{attributes:true,attributeFilter:['hidden']});
 const catalog=document.getElementById('catalogView');if(catalog)obs.observe(catalog,{attributes:true,attributeFilter:['hidden']});
 obs.observe(grid,{childList:true});
 if(typeof ResizeObserver!=='undefined'){const ro=new ResizeObserver(queue);if(header)ro.observe(header);ro.observe(nav);}
 window.addEventListener('resize',queue);window.addEventListener('hashchange',queue);window.visualViewport?.addEventListener('resize',queue);queue();
}
