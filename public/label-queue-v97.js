import {readPrinterProfiles} from './printer-profiles-v97.js';
import {pdfFromLabelJpegs} from './argox-pdf-v97.js';
export const MAX_LABELS=20;
export function validBatch(items){return Array.isArray(items)&&items.length>0&&items.every(x=>Number.isInteger(x.count)&&x.count>=1&&x.count<=20)&&items.reduce((n,x)=>n+x.count,0)<=20;}
async function api(body){
  const r=await fetch('/api/product-state?labelQueue=1',{cache:'no-store',credentials:'same-origin',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw Error((data.error||'Merkezi etiket listesine ulaşılamadı.')+' (HTTP '+r.status+')');if(data.queueVersion!==97)throw Error('Etiket sunucusu güncel değil. v97 sunucu dosyalarını yükleyip Node.js uygulamasını yeniden başlatın.');return data;
}
export async function addQueuedLabel(id,count){if(!validBatch([{count}]))throw Error('Adet 1–20 olmalı.');const data=await api({action:'add',id,count});if(data.ok!==true||data.entry?.id!==id||data.entry?.count!==count)throw Error('Merkezi kayıt doğrulanamadı.');return data;}
export function setupLabelQueue(renderLabelImage){
  const $=id=>document.getElementById(id),dialog=$('labelQueueDialog'),list=$('labelQueueItems'),status=$('labelQueueStatus'),print=$('labelQueuePrint'),confirmButton=$('labelQueueConfirm'),cancel=$('labelQueueCancel');
  let items=[],selected=new Set(),pending=null,busy=false;
  const chosen=()=>items.filter(x=>selected.has(x.id));
  function eligible(x){const p=x.product;return p&&p.lifecycleStatus!=='deleted'&&!p.fiyatBelirsiz&&Number.isFinite(p.satisFiyati)&&p.satisFiyati>=0&&String(p.barkod||p.urunKodu||'').trim();}
  function controls(){const n=chosen().reduce((a,x)=>a+x.count,0);$('labelQueueTotal').textContent=n+' / 20 etiket';print.disabled=busy||!!pending||!validBatch(chosen())||!chosen().every(eligible);confirmButton.disabled=busy||!pending;cancel.disabled=busy||!pending;}
  async function refresh(){
    if(busy||pending)return;
    busy=true;controls();status.textContent='Merkezi liste yükleniyor…';
    try{const d=await api();if(!Array.isArray(d.items))throw Error('Geçersiz liste yanıtı.');items=d.items;selected=new Set();draw();status.textContent=items.length?items.length+' ürün bekliyor. Bir baskıda en fazla 20 etiket seçin.':'Bekleyen etiket yok.';}
    catch(e){items=[];selected.clear();draw();status.textContent=e.message;}
    finally{busy=false;controls();}
  }
  async function change(x,action,count){
    if(busy||pending)return;
    busy=true;controls();try{await api({action,id:x.id,version:x.version,count});}catch(e){alert(e.message);}finally{busy=false;await refresh();}
  }
  function draw(){
    list.replaceChildren();
    for(const x of items){
      const row=document.createElement('div');row.className='lq-row';
      const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(x.id);check.disabled=!!pending||!eligible(x);check.setAttribute('aria-label','Ürünü seç');
      check.onchange=()=>{if(check.checked){if(chosen().reduce((n,v)=>n+v.count,0)+x.count>20){check.checked=false;status.textContent='Tek baskıda en fazla 20 etiket seçilebilir.';return;}selected.add(x.id);}else selected.delete(x.id);controls();};
      const name=document.createElement('span');name.textContent=(x.product?.baslik||x.id)+' · '+(eligible(x)?Number(x.product.satisFiyati).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺':'Fiyat veya ürün geçersiz');
      const qty=document.createElement('input');qty.type='number';qty.min='1';qty.max='20';qty.step='1';qty.value=x.count;qty.disabled=!!pending;qty.setAttribute('aria-label','Etiket adedi');qty.onchange=()=>{const n=Number(qty.value);if(!validBatch([{count:n}])){qty.value=x.count;return;}change(x,'set',n);};
      const remove=document.createElement('button');remove.type='button';remove.textContent='Sil';remove.disabled=!!pending;remove.onclick=()=>{if(window.confirm('Bu ürünü etiket listesinden kaldır?'))change(x,'remove');};
      row.append(check,name,qty,remove);list.append(row);
    }
    controls();
  }
  $('homeLabelQueue').onclick=$('priceLabelQueueOpen').onclick=()=>{if(!dialog.open)dialog.showModal();if(!pending)refresh();};
  $('labelQueueClose').onclick=()=>dialog.close();
  $('labelQueueRefresh').onclick=refresh;
  $('labelQueueSelect').onclick=()=>{if(busy||pending)return;selected.clear();let n=0;for(const x of items)if(eligible(x)&&n+x.count<=20){selected.add(x.id);n+=x.count;}draw();};
  print.onclick=async()=>{
    if(busy||pending||!validBatch(chosen()))return;
    const batch=chosen().map(x=>({...x}));const tab=window.open('','_blank');if(!tab){status.textContent='Açılır pencereye izin verin.';return;}
    busy=true;controls();
    try{
      const fresh=await api();const map=new Map(fresh.items.map(x=>[x.id,x]));
      const current=batch.map(x=>map.get(x.id));
      if(current.some((x,i)=>!x||x.version!==batch[i].version||!eligible(x))||!validBatch(current))throw Error('Liste değişti. Yenileyip yeniden seçin.');
      const images=[];for(const x of current){const img=renderLabelImage(x.product,undefined,true);for(let i=0;i<x.count;i++)images.push(img);}
      const url=URL.createObjectURL(pdfFromLabelJpegs(images));tab.location.href=url;
      pending=current.map(x=>({id:x.id,count:x.count,version:x.version,productSignature:JSON.stringify(x.product)}));
      status.textContent='PDF hazır: '+images.length+' etiket. Hedef '+readPrinterProfiles().label+' · 2×4 · 1 kopya. Fiziksel baskıyı kontrol edip onaylayın.';draw();
    }catch(e){tab.close();status.textContent=e.message;}finally{busy=false;controls();}
  };
  confirmButton.onclick=async()=>{
    if(!pending||busy||!window.confirm('Tüm seçilen etiketler doğru basıldı mı?'))return;
    busy=true;controls();try{const d=await api({action:'confirm',items:pending});const expected=pending.length;pending=null;busy=false;await refresh();status.textContent=d.removed===expected?'Baskı onaylandı. Tamamlanan ürünler kaldırıldı.':'Bazı ürünler değişmiş; bunlar listede bırakıldı.';}
    catch(e){status.textContent=e.message;}finally{busy=false;controls();}
  };
  cancel.onclick=()=>{if(!busy){pending=null;selected.clear();refresh();}};
  controls();
}
