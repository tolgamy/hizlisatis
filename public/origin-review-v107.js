import {originText} from './product-origin-v99.js';
export const ORIGIN_BATCH107=20;
export function eligibleOrigin107(product){return Boolean(product?.id&&product.lifecycleStatus!=='deleted'&&originText(product)==='MENŞEİ EKSİK');}
export function prepareLocalOrigin107(product){if(!eligibleOrigin107(product))throw Error('Ürün menşei artık eksik değil veya ürün silinmiş.');return {...product,mensei:'Türkiye','menşei':'Türkiye'};}
const fold=x=>String(x??'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
export function setupOriginReview107({getProducts,canEdit,refresh,save,onChanged}){
 const $=id=>document.getElementById(id),dialog=$('originReview107'),search=$('originSearch107'),list=$('originList107'),confirm=$('originConfirm107'),apply=$('originApply107'),status=$('originStatus107');
 if(!dialog||!apply)return;
 let selected=new Set(),visible=[],busy=false;
 function controls(){
  apply.disabled=busy||!canEdit()||!selected.size||!confirm.checked;
  $('originSelect107').disabled=busy||!visible.length;$('originClear107').disabled=busy||!selected.size;
  $('originClose107').disabled=busy;search.disabled=busy;confirm.disabled=busy;
  $('originCount107').textContent=selected.size+' ürün seçildi · Her işlemde en fazla '+ORIGIN_BATCH107;
 }
 function render(){
  const q=fold(search.value),eligible=getProducts().filter(eligibleOrigin107),matches=eligible.filter(p=>!q||[p.baslik,p.marka,p.barkod,p.urunKodu].some(x=>fold(x).includes(q)));
  visible=matches.slice(0,ORIGIN_BATCH107);list.replaceChildren();
  const valid=new Set(eligible.map(p=>p.id));selected=new Set([...selected].filter(id=>valid.has(id)));
  for(const p of visible){
   const row=document.createElement('label');row.className='origin-row107';
   const input=document.createElement('input');input.type='checkbox';input.checked=selected.has(p.id);input.disabled=busy||(!input.checked&&selected.size>=ORIGIN_BATCH107);
   const detail=document.createElement('span'),name=document.createElement('strong'),barcode=document.createElement('small');name.textContent=p.baslik;barcode.textContent=String(p.barkod||p.urunKodu||'Barkod yok');detail.append(name,barcode);row.append(input,detail);list.append(row);
   input.onchange=()=>{if(input.checked&&selected.size<ORIGIN_BATCH107)selected.add(p.id);else selected.delete(p.id);confirm.checked=false;render();};
  }
  if(!visible.length)list.textContent='Bu aramada menşei eksik ürün yok.';
  else if(matches.length>visible.length){const more=document.createElement('p');more.textContent=matches.length+' eşleşmenin ilk '+visible.length+' ürünü. Arayarak veya kayıt sonrası sıradaki grubu seçebilirsiniz.';list.append(more);}
  controls();
 }
 $('originOpen107').onclick=()=>{if(!canEdit()){status.textContent='Merkezi bağlantı ve ürün düzenleme yetkisi gerekli.';}else status.textContent='';selected.clear();confirm.checked=false;search.value='';render();dialog.showModal();};
 $('originClose107').onclick=()=>{if(!busy)dialog.close();};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 search.oninput=()=>{selected.clear();confirm.checked=false;render();};
 $('originSelect107').onclick=()=>{selected=new Set(visible.map(p=>p.id));confirm.checked=false;render();};
 $('originClear107').onclick=()=>{selected.clear();confirm.checked=false;render();};
 confirm.onchange=controls;
 apply.onclick=async()=>{
  if(busy||!canEdit()||!confirm.checked||!selected.size||selected.size>ORIGIN_BATCH107)return;
  const ids=[...selected];busy=true;status.textContent='Merkezi kayıtlar doğrulanıyor…';render();
  let written=0,skipped=0;const failed=[];
  try{
   const snapshot=await refresh();const latest=new Map((snapshot?.products||getProducts()).map(p=>[p.id,p]));
   for(const id of ids){
    if(!canEdit())throw Error('Merkezi bağlantı veya ürün düzenleme yetkisi değişti.');
    const p=latest.get(id);if(!eligibleOrigin107(p)){skipped++;continue;}
    try{const saved=await save(prepareLocalOrigin107(p));if(originText(saved)!=='YERLİ ÜRETİM')throw Error('Menşei kaydı doğrulanamadı.');written++;}
    catch(e){failed.push(String(p.baslik||id)+': '+e.message);break;}
    status.textContent=written+' / '+ids.length+' kayıt doğrulandı.';
   }
  }catch(e){failed.push(e.message);}
  finally{
   try{await refresh();onChanged?.();}catch(e){failed.push('Yenileme: '+e.message);}
   busy=false;selected.clear();confirm.checked=false;render();
   status.textContent='Kaydedilen: '+written+' · Atlanan: '+skipped+(failed.length?' · Durdu: '+failed.join(' / '):' · Tamamlandı.');
  }
 };
}
