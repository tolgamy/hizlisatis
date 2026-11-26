import {listCustomers,getCustomerAccount,upsertCustomer,collectCustomerDebt} from './customer-api.js';
import {parseLocaleNumber} from './normalize.js';
import {lookup125,credit125,collect125,userCan,fine125} from './auth-ui-v125.js';
const mayCreate=()=>fine125('customer.create','customers');
const mayLimit=()=>fine125('customer.limit','customers');
const mayOpening=()=>fine125('customer.opening','customers');
const mayEdit=()=>userCan('customers')||mayLimit()||mayOpening();
const canList=()=>lookup125()||mayLimit()||mayOpening();
const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(n||0);
const moneyFromCents=n=>fmt(Number(n||0)/100);
const fold=t=>String(t||'').toLocaleLowerCase('tr-TR');
export function createCustomerManager({announce}) {
  let customers=[],selectedCustomer=null,currentCustomer=null,editingId='',fromSale=false;
  const dialog=$('customerDialog'),form=$('customerForm'),account=$('customerAccount');
  const fields={name:'customerName',phone:'customerPhone',address:'customerAddress',
    taxOffice:'customerTaxOffice',taxNumber:'customerTaxNumber',creditLimit:'customerLimit',
    openingDebt:'customerOpeningDebt',notes:'customerNotes'};
  const label=c=>c.name+' · '+c.phone;
  const getSelected=()=>selectedCustomer;
  function renderSaleMatches() {
    const box=$('creditCustomerResults');
    box.replaceChildren();
    const text=fold($('creditCustomerSearch').value);
    const digits=text.replace(/\D/g,'');
    const list=customers.filter(c=>!text||fold(c.name).includes(text)||fold(c.phone).includes(text)||
      (digits&&String(c.phone_key).includes(digits))).slice(0,15);
    for(const customer of list) {
      const button=document.createElement('button');button.type='button';
      button.textContent=label(customer)+' · Borç '+moneyFromCents(customer.balance_cents);
      button.addEventListener('click',()=>chooseSale(customer));
      box.append(button);
    }
    if(!list.length)box.textContent=mayCreate()?'Müşteri bulunamadı. Yeni Müşteri ile kaydedebilirsiniz.':'Müşteri bulunamadı. Yeni kayıt için yöneticiye başvurun.';
  }
  function chooseSale(customer) {
    if(!credit125())return announce('Veresiye yetkiniz yok.','error');
    selectedCustomer=customer;
    $('creditName').value=label(customer);
    $('creditCustomerSearch').value=customer.name;
    $('creditCustomerResults').replaceChildren();
  }
  async function load() {
    if(!canList())throw Error('Müşteri sorgulama yetkiniz yok.');
    try{
      customers=await listCustomers();renderList();renderSaleMatches();
      $('customerStatus').textContent=customers.length+' kayıtlı müşteri';
      return customers;
    }catch(error){
      $('customerStatus').textContent=error.message;
      announce('Müşteri kayıtları: '+error.message,'error');
      throw error;
    }
  }
  function renderList() {
    const box=$('customerList');box.replaceChildren();
    const query=fold($('customerSearch').value);
    const found=customers.filter(c=>!query||fold(c.name).includes(query)||fold(c.phone).includes(query));
    for(const customer of found.slice(0,200)) {
      const button=document.createElement('button');button.type='button';
      const left=document.createElement('span'),name=document.createElement('strong'),
        phone=document.createElement('small'),balance=document.createElement('b');
      name.textContent=customer.name;phone.textContent=customer.phone;
      balance.textContent=moneyFromCents(customer.balance_cents);
      left.append(name,phone);button.append(left,balance);
      button.addEventListener('click',()=>showAccount(customer));
      box.append(button);
    }
    if(!found.length)box.textContent='Henüz kayıtlı müşteri bulunmuyor.';
  }
  function showList(){
    form.hidden=true;account.hidden=true;
    $('customerList').hidden=false;document.querySelector('.customer-toolbar').hidden=false;
    renderList();
  }
  function editCustomer(customer=null) {
    if(!(customer?mayEdit():mayCreate()))return announce('Müşteri düzenleme yetkiniz yok.','error');
    editingId=customer?.id||'';
    $('customerFormTitle').textContent=customer?'Müşteri Bilgilerini Düzenle':'Yeni Müşteri';
    for(const [name,id] of Object.entries(fields)){
      const value=name==='creditLimit'?Number(customer?.credit_limit_cents||0)/100:
        name==='openingDebt'?Number(customer?.opening_debt_cents||0)/100:
        customer?.[name==='taxOffice'?'tax_office':name==='taxNumber'?'tax_number':name]||'';
      $(id).value=value||'';
      $(id).disabled=name==='creditLimit'?!mayLimit():name==='openingDebt'?!mayOpening():Boolean(customer&&!userCan('customers'));
    }
    form.hidden=false;account.hidden=true;$('customerList').hidden=true;
    document.querySelector('.customer-toolbar').hidden=true;
    form.querySelector('input:not(:disabled)')?.focus({preventScroll:true});
  }
  async function showAccount(customer) {
    currentCustomer=customer;
    form.hidden=true;$('customerList').hidden=true;
    document.querySelector('.customer-toolbar').hidden=true;account.hidden=false;
    $('customerCollectForm').hidden=true;
    $('customerAccountName').textContent=customer.name;
    $('customerAccountPhone').textContent=customer.phone;
    $('customerAccountBalance').textContent='Kalan borç: '+moneyFromCents(customer.balance_cents);
    const history=$('customerAccountEntries');history.textContent='Hesap hareketleri alınıyor…';
    try{
      const details=await getCustomerAccount(customer.id);
      $('customerAccountBalance').textContent='Kalan borç: '+moneyFromCents(details.balanceCents);
      history.replaceChildren();
      for(const entry of details.entries){
        const row=document.createElement('div'),note=document.createElement('span'),
          amount=document.createElement('strong');
        note.textContent=new Date(entry.created_at).toLocaleString('tr-TR')+' · '+
          (entry.action==='sale'?'Veresiye satış':'Tahsilat '+entry.payment)+(entry.notes?' · '+entry.notes:'');
        amount.textContent=(entry.amount_cents>0?'+':'−')+moneyFromCents(Math.abs(entry.amount_cents));
        row.append(note,amount);history.append(row);
      }
      if(!details.entries.length)history.textContent='Hesap hareketi bulunmuyor.';
    }catch(error){history.textContent=error.message;}
  }
  async function save(event) {
    event.preventDefault();
    if(!(editingId?mayEdit():mayCreate()))return announce('Müşteri düzenleme yetkiniz yok.','error');
    const customer={id:editingId,...Object.fromEntries(Object.entries(fields).filter(([,id])=>!$(id).disabled).map(([name,id])=>[name,$(id).value.trim()]))};
    if(!$(fields.name).disabled&&(!customer.name||customer.phone.replace(/\D/g,'').length<10)) {
      announce('Müşteri adı ve geçerli telefon zorunlu.','error');return;
    }
    for(const key of ['creditLimit','openingDebt']){
      if(!Object.hasOwn(customer,key))continue;
      const amount=customer[key]?parseLocaleNumber(customer[key],NaN):0;
      if(!Number.isFinite(amount)||amount<0)return announce('Limit veya açılış borcu geçersiz.','error');
      customer[key]=amount;
    }
    const existing=customer.phone&&customers.find(c=>c.id!==editingId&&c.phone.replace(/\D/g,'').slice(-10)===
      customer.phone.replace(/\D/g,'').slice(-10));
    if(existing){announce('Bu telefon numarası zaten kayıtlı.','error');return;}
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const answer=await upsertCustomer(customer);
      if(canList())await load();
      const saved=customers.find(c=>c.id===answer.id);
      announce('Müşteri kaydedildi.','success');
      if(fromSale&&saved){
        chooseSale(saved);dialog.close();fromSale=false;
      }else if(saved)await showAccount(saved);else showList();
    }catch(error){announce('Müşteri kaydedilemedi: '+error.message,'error');}
    finally{button.disabled=false;}
  }
  async function collect(event) {
    event.preventDefault();
    if(!currentCustomer||!collect125())return announce('Tahsilat yetkiniz yok.','error');
    const amount=parseLocaleNumber($('customerCollectAmount').value,NaN);
    if(!Number.isFinite(amount)||amount<=0){announce('Geçerli tahsilat tutarı girin.','error');return;}
    const button=$('customerCollectForm').querySelector('button[type="submit"]');button.disabled=true;
    try{
      await collectCustomerDebt(currentCustomer.id,amount,$('customerCollectPayment').value,$('customerCollectNotes').value);
      await load();
      const current=customers.find(c=>c.id===currentCustomer.id);
      if(current)await showAccount(current);
      announce('Tahsilat merkezi hesaba kaydedildi.','success');
      $('customerCollectForm').reset();
    }catch(error){announce(error.message,'error');}
    finally{button.disabled=false;}
  }
  async function open() {
    if(!canList()&&!mayCreate())return announce('Müşteri yetkiniz yok.','error');
    fromSale=false;showList();if(!dialog.open)dialog.showModal();
    if(canList())await load().catch(()=>{});
  }
  async function openNewForSale(){
    if(!mayCreate())return announce('Yeni müşteri oluşturma yetkiniz yok.','error');
    fromSale=true;if(!dialog.open)dialog.showModal();editCustomer();
    if(canList())await load().catch(()=>{});
  }
  for(const id of ['customerNew','customerEdit','creditNewCustomer']){$(id).disabled=!(id==='customerEdit'?mayEdit():mayCreate());if($(id).disabled)$(id).title='Yetkiniz yok.';}
  $('customerCollect').disabled=!collect125();
  $('settingsCustomers').addEventListener('click',open);
  $('creditNewCustomer').addEventListener('click',openNewForSale);
  $('customerSearch').addEventListener('input',renderList);
  $('creditCustomerSearch').addEventListener('input',()=>{
    selectedCustomer=null;$('creditName').value='';renderSaleMatches();
  });
  $('customerNew').addEventListener('click',()=>editCustomer());
  form.addEventListener('submit',save);
  $('customerFormCancel').addEventListener('click',showList);
  $('customerAccountBack').addEventListener('click',showList);
  $('customerEdit').addEventListener('click',()=>editCustomer(currentCustomer));
  $('customerCollect').addEventListener('click',()=>{$('customerCollectForm').hidden=!$('customerCollectForm').hidden;});
  $('customerCollectForm').addEventListener('submit',collect);
  dialog.addEventListener('close',()=>{fromSale=false;});
  return {load,open,openNewForSale,getSelected,renderSaleMatches,
    clearSelection:()=>{selectedCustomer=null;$('creditName').value='';$('creditCustomerSearch').value='';}};
}
