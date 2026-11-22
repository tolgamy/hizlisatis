/** Authenticated D1 customer account requests, sharing the existing 30-day
 * signed HttpOnly administration session with product editing.
 */
async function requestCustomer(method='GET',data=null,query='') {
  const options={
    method,cache:'no-store',credentials:'same-origin',
    headers:{Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},
    body:data?JSON.stringify(data):undefined
  };
  let response;
  try{response=await fetch('/api/customers'+query,options)}
  catch{throw Error('Müşteri veritabanına bağlanılamıyor.')}
  if(response.status===401) {
    const access=await fetch('/api/auth',{cache:'no-store',credentials:'same-origin'})
      .then(r=>r.json()).catch(()=>({enabled:true,authenticated:false}));
    if(access.enabled) {
      if(!access.authenticated)window.dispatchEvent(new Event('hizlisatis:auth-required'));
      throw Error('Müşteri / Veresiye işlemi için yetkiniz yok veya oturum süreniz doldu.');
    }
    // The legacy shared key remains solely during a controlled migration.
    const key=window.prompt('Müşteri kayıtları için bir defa yönetim anahtarını girin (oturum 30 gün geçerli):');
    if(!key)throw Error('Yönetim oturumu açılmadı.');
    const login=await fetch('/api/admin-session',{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key}),cache:'no-store'});
    const result=await login.json().catch(()=>({}));
    if(!login.ok)throw Error(result.error||'Yönetim anahtarı doğrulanamadı.');
    response=await fetch('/api/customers'+query,options);
  }
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Müşteri veritabanı hatası: '+response.status);
  return result;
}
export async function listCustomers(){return (await requestCustomer()).customers;}
export async function getCustomerAccount(id){return requestCustomer('GET',null,'?customer='+encodeURIComponent(id));}
export async function upsertCustomer(customer){return requestCustomer('POST',{action:'upsert',customer});}
export async function recordCustomerCredit(customerId,sale) {
  return requestCustomer('POST',{action:'sale',id:sale.id,customerId,amount:sale.total,
    notes:'Fiş: '+sale.id.slice(0,12)});
}
export async function collectCustomerDebt(customerId,amount,payment,notes) {
  return requestCustomer('POST',{action:'collect',id:crypto.randomUUID(),customerId,amount,payment,notes});
}
