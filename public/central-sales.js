/** Feature-gated central receipts on Veridyen.
 * If central mode is enabled, NEVER fall back to local-only checkout on error.
 * Local IndexedDB still serves as an optional device mirror and backup.
 */
async function call(url,options={}){
  let response;
  try{response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});}
  catch{throw Error('Merkezi satış sunucusuna ulaşılamıyor. İşlemi tekrar deneyin.');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Merkezi satış hatası: '+response.status);
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
  if(!data.ok||data.id!==record.id)throw Error('Fişin merkezi kaydı doğrulanamadı.');
  return data;
}
export async function voidCentralTestSale(saleId){
  const data=await call('/api/sale-voids',{
    method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({saleId,reason:'test'})
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
export async function getSalesForReports(localReader){
  if(await isCentralSalesEnabled())return {sales:await readCentralSales(),central:true};
  return {sales:await localReader(),central:false};
}
