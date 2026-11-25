// A visual readiness indicator, NOT an automatically focused input.
export function scannerReady109({sale,blocked,visible,focused,field,editing}){
 return Boolean(sale&&!blocked&&visible&&focused&&(!editing||field));
}
export function installSaleReady109({active}){
 const form=document.getElementById('saleBarcodeForm'),input=document.getElementById('saleBarcode'),status=document.getElementById('saleReadyText109');
 if(!form||!input||!status)return;
 let frame=0;
 function update(){
  frame=0;
  const desktop=document.body.classList.contains('desktop-sale-workspace'),el=document.activeElement;
  const editing=!!(el?.isContentEditable||el?.closest?.('textarea,select,[contenteditable="true"],input:not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="submit"])'));
  const ready=desktop&&scannerReady109({sale:active(),blocked:false,visible:!document.hidden,focused:document.hasFocus(),field:el===input,editing});
  form.dataset.scannerReady=String(ready);form.dataset.scannerEmpty=String(!input.value);
  const placeholder=desktop?'Barkod okutun veya ürün adı yazın…':'Barkod / ürün adı / kodu ara';
  if(input.placeholder!==placeholder)input.placeholder=placeholder;
  const label=ready?'Okutmaya Hazır':'Beklemede';
  if(status.textContent!==label)status.textContent=label;
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(update);}
 for(const type of ['focusin','focusout','input','change','click','visibilitychange'])document.addEventListener(type,schedule,true);
 for(const type of ['focus','blur','hashchange','resize','pageshow'])window.addEventListener(type,schedule);
 const observer=new MutationObserver(schedule);observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 for(const dialog of document.querySelectorAll('dialog'))observer.observe(dialog,{attributes:true,attributeFilter:['open']});
 schedule();
 return {update,schedule};
}
