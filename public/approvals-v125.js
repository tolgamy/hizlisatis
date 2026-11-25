const $=id=>document.getElementById(id);
async function call(body){
 const r=await fetch('/api/approvals-v125',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Onay isteği başarısız.');return d;
}
export const requestApproval125=(kind,target)=>call({action:'request',kind,target});
const names={later:'Sonradan pasif ürün',initial:'Ana pasif ürün',price:'Eksik satış fiyatı',unknown:'Yeni barkod'};
const statuses={pending:'Bekliyor',approved:'Onaylandı',rejected:'Reddedildi'};
export function installApprovals125({announce,refresh}){
 const dialog=$('approvalsDialog125'),list=$('approvalsList125'),status=$('approvalsStatus125');
 async function load(){
  status.textContent='Talepler alınıyor…';list.replaceChildren();
  try{const data=await call();status.textContent=data.requests.length+' talep';
   for(const r of data.requests){const row=document.createElement('article'),title=document.createElement('strong'),info=document.createElement('p');title.textContent=(names[r.kind]||r.kind)+' · '+r.target;info.textContent=(statuses[r.status]||r.status)+' · '+new Date(r.created_at).toLocaleString('tr-TR')+(data.admin?' · Kullanıcı: '+r.requester_id:'')+(r.note?' · '+r.note:'');row.append(title,info);
    if(data.admin&&r.status==='pending'){for(const decision of ['approved','rejected']){const b=document.createElement('button');b.type='button';b.textContent=decision==='approved'?'Onayla':'Reddet';b.addEventListener('click',async()=>{
      const description=['price','unknown'].includes(r.kind)?'Bu karar fiyatı veya ürünü otomatik oluşturmaz. Gerekli düzenlemeyi Ürün Yönetimi’nde ayrıca yapın.':'Bu onay ürünün durumunu değiştirir, fiyatını değiştirmez.';
      if(!confirm((decision==='approved'?description:'Talebi reddetmek istiyor musunuz?')))return;
      b.disabled=true;try{const result=await call({action:'review',id:r.id,decision,note:''});if(result.activated)await refresh(r.target);announce('Talep kararı kaydedildi.','success');await load();}catch(e){status.textContent=e.message;b.disabled=false}
     });row.append(b)}}
    list.append(row);
   }
  }catch(e){status.textContent=e.message;}
 }
 $('approvalsRefresh125').addEventListener('click',load);
 return ()=>{if(!dialog.open)dialog.showModal();load();};
}
