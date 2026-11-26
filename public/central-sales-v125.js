// v88: Preserve central sale and cancellation functions on a fresh static URL.
/** Feature-gated central receipts on Veridyen.
 * If central mode is enabled, NEVER fall back to local-only checkout on error.
 * Local IndexedDB still serves as an optional device mirror and backup.
 */
async function call(url,options={}){
  let response;
  try{response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});}
  catch{throw Object.assign(Error('Merkezi satış sunucusuna ulaşılamıyor.'),{retryable:true});}
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(Error(data.error||'Merkezi satış hatası: '+response.status),{retryable:response.status>=500});
  return data;
}
export async function isCentralSalesEnabled(){
  const result=await call('/api/sales?status=1');
  return result.enabled===true;
}
export async function saveCentralSale(record){
  const data=await call('/api/sales',{
    method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({record})
  });
  if(!data.ok||data.id!==record.id)throw Object.assign(Error('Fişin merkezi kaydı doğrulanamadı.'),{retryable:true});
  return data;
}
export async function voidCentralSale(saleId,reason){
  const data=await call('/api/sale-voids',{
    method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({saleId,reason})
  });
  if(!data.ok||data.saleId!==saleId)throw Error('Satış iptali merkezi olarak doğrulanamadı.');
  return data;
}
export async function readCentralSales(){
  const sales=[];
  let offset=0;
  // 50,000 receipts safety cap, never silently substitute device records.
  do {
    const data=await call('/api/sales?offset='+offset);
    if(!Array.isArray(data.sales))throw Error('Merkezi satış yanıtı geçersiz.');
    sales.push(...data.sales);
    if(data.next==null)break;
    if(!Number.isSafeInteger(data.next)||data.next<=offset||data.next>50000)
      throw Error('Merkezi rapor sınırına ulaşıldı. Sayfalama gerekiyor.');
    offset=data.next;
  }while(true);
  return sales;
}
export async function getSalesForReports(localReader,{centralOnly=false}={}){
  if(await isCentralSalesEnabled())return {sales:await readCentralSales(),central:true};
  if(centralOnly)throw Error('Kasiyer raporları için merkezi satış sistemi etkin olmalıdır.');
  return {sales:await localReader(),central:false};
}

export async function readDaily125(){const d=await call('/api/sales?daily=1');if(!Number.isSafeInteger(d.totalCents)||d.totalCents<0)throw Error('Günlük ciro yanıtı geçersiz.');return d;}

export async function readRecent125(){const d=await call('/api/sales?recent=1');if(!Array.isArray(d.sales))throw Error('Son satış yanıtı geçersiz.');return d.sales;}


export async function readCentralStock130(){
  const {adjustments}=await call('/api/sales?stock=1');
  if(!Array.isArray(adjustments))throw Error('Merkezi stok yanıtı geçersiz.');
  return adjustments;
}
