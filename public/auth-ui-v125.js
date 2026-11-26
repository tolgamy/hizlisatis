/** Secure login gate and administrator account management (v56).
 * The UI does not store credentials, session tokens or secrets.
 * Authorization is verified again by the server on every protected operation.
 */
const $=id=>document.getElementById(id);
// Browser-default form submission formerly appended the username and password
// to the URL when /api/auth failed. Scrub a leaked query from the current
// history entry as early as possible; a fresh password is still required.
try{
  const url=new URL(location.href);
  if(url.searchParams.has('password')||url.searchParams.has('username')){
    url.searchParams.delete('password');
    url.searchParams.delete('username');
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }
}catch{/* Never break application startup during URL cleanup. */}
const headers={'Content-Type':'application/json','Accept':'application/json'};
let activeUser=null,enabled=false,initialResolved=false;
const accountChannel=typeof window!=='undefined'&&'BroadcastChannel' in window?
  new BroadcastChannel('hizlisatis-auth-v130'):null;
accountChannel?.addEventListener('message',event=>{
  if(activeUser&&event.data!==activeUser.id)location.reload();
});
const can=permission=>activeUser?.role==='admin'||activeUser?.permissions?.includes(permission);
export function userCan(permission){return !enabled||Boolean(can(permission));}
export function fine125(id,legacy){return activeUser?.role==='admin'||(Array.isArray(activeUser?.permissionProfile)?activeUser.permissionProfile.includes(id):Boolean(legacy&&can(legacy)));}
export const lookup125=()=>fine125('customer.lookup','customers');
export const credit125=()=>lookup125()&&fine125('customer.credit','customers')&&Boolean(can('sales'));
export const collect125=()=>lookup125()&&fine125('customer.collect','customers');
export const reportScope125=()=>can('reports')||fine125('report.all')||(fine125('report.own')&&fine125('report.other'))?'all':fine125('report.own')?'own':fine125('report.other')?'other':null;
export const daily125=()=>can('reports')||fine125('report.all')||fine125('report.daily.own');
export const canReprint125=sale=>can('reports')||fine125(sale?.cashierId===activeUser?.id?'sale.reprint.own':'sale.reprint.other');
export const payment125=p=>activeUser?.role==='admin'||!Array.isArray(activeUser?.permissionProfile)||((p==='Nakit'&&fine125('sale.cash'))||(p==='Kart'&&fine125('sale.card'))||(p==='Veresiye'&&credit125()));
export function canActivateInitial124(){return activeUser?.role==='admin'||(Boolean(can('sales'))&&Array.isArray(activeUser?.permissionProfile)&&activeUser.permissionProfile.includes('product.activate.initial'));}
async function call(url,options={}){
  let response;
  try{
    response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});
  }catch{throw Error('Sunucuya bağlanılamıyor. İnternet bağlantısını kontrol edin.')}
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'İşlem başarısız: '+response.status);
  return data;
}
function showGate(message=''){
  document.body.classList.add('auth-locked');
  $('loginGate').hidden=false;
  $('loginError').textContent=message;
  const menu=$('accessAccountMenu');
  if(menu)menu.hidden=true;
  $('accessLogout')?.setAttribute('aria-expanded','false');
  if($('accessLogoutConfirm')?.open)$('accessLogoutConfirm').close();
}
function applyUser(user){
  activeUser=user;
  $('accessIdentity').textContent=user.username+' · '+(user.role==='admin'?'Yönetici':'Çalışan');
  $('accessIdentity').hidden=false;
  $('accessLogout').hidden=false;
  document.querySelector('.access-identity-actions')?.classList.add('has-session');
  $('accessMenuRole').textContent=user.role==='admin'?'Yönetici':'Çalışan';
  $('accessMenuUsername').textContent=user.username;
  $('accessAccountMenu').hidden=true;
  $('accessLogout').setAttribute('aria-expanded','false');
  // Common navigation; operations are guarded by app-v122 and the existing server APIs.
  for(const id of ['settingsExcel','settingsAdd','settingsManage','settingsCategoryImages','settingsHistory','settingsExport','settingsBackup','settingsOpenPreferences','settingsCustomer122','settingsPrinter122','settingsUsers122','settingsSecurity122','homeQuickBarcode','homeQuickProducts','homeQuickReports','homeTodaySalesButton','navSale','homeQuickSale','navSettings','homeSettingsShortcut','settingsAdminGroup','settingsCustomers','settingsInnerExcel','settingsInnerManage','settingsInnerCategoryImages','settingsInnerExport','settingsInnerBackup']){
    const node=$(id);if(node)node.hidden=false;
  }
  const discount=$('checkoutDiscountToggle');if(discount){discount.hidden=false;discount.disabled=!fine125('sale.discount','discounts');discount.title=fine125('sale.discount','discounts')?'':'İndirim yetkiniz yok.';}
}
function release(){
  $('loginGate').hidden=true;
  document.body.classList.remove('auth-locked');
}
async function listUsers(){
  const data=await call('/api/users');
  policyReady120=data.passwordPolicyVersion===120&&data.permissionSchemaVersion===121&&Array.isArray(data.permissionGroups)&&data.permissionGroups.flatMap(g=>g[1]).length===44;
  catalog121=policyReady120?data:null;
  $('accessPolicyVersion120').textContent=policyReady120?'Sunucu: v121 yetki altyapısı ✓ · Parola v120':'Sunucu güncellemesi eksik. v121 dosyalarını yükleyip Node.js’i yeniden başlatın.';
  if(!selectedId&&profile121===null&&catalog121)profile121=new Set(catalog121.standardPermissions);
  renderPermissions121();
  $('accessPolicyVersion120').classList.toggle('met120',policyReady120);
  updatePassword118();
  const list=$('accessUserList');list.replaceChildren();
  for(const user of data.users){
    const line=document.createElement('div');line.className='access-user-line';
    const label=document.createElement('span');
    label.textContent=user.username+' · '+(user.role==='admin'?'Admin':'Kasiyer')+
      (user.active?' · Aktif':' · Kapalı');
    const edit=document.createElement('button');edit.type='button';edit.textContent='Düzenle';
    edit.addEventListener('click',()=>selectUser(user));
    line.append(label,edit);list.append(line);
  }
  if(!data.users.length)list.textContent='Henüz kullanıcı yok.';
}
let selectedId=null,savingUser118=false,policyReady120=false;
let catalog121=null,profile121=null,selectedUser121=null,group121=0;
export function passwordRules118(value){
  return {length:value.length>=10&&value.length<=128,digit:/[0-9]/.test(value),singleLine:!/[\r\n]/.test(value)};
}
function showPassword118(visible){
  const field=$('accessPassword'),toggle=$('accessPasswordToggle118');
  field.type=visible?'text':'password';
  toggle.setAttribute('aria-label',visible?'Parolayı gizle':'Parolayı göster');
  toggle.setAttribute('aria-pressed',String(visible));
  toggle.querySelector('.access-eye-slash118').toggleAttribute('hidden',!visible);
}
function updatePassword118(){
  const field=$('accessPassword'),value=field.value,r=passwordRules118(value);
  const optional=Boolean(selectedId)&&value==='';
  for(const [id,met] of [['accessPasswordLength118',r.length],['accessPasswordDigit118',r.digit]]){
    const row=$(id);row.classList.toggle('met118',met);
    row.firstElementChild.textContent=met?'✓':'○';
    row.querySelector('.access-rule-status118').textContent=met?'Tamam':'Gerekli';
  }
  $('accessPasswordRules118').hidden=optional;
  const message=optional?'':!r.length?'Parola 10–128 karakter olmalı.':!r.digit?'Parola en az bir rakam içermeli.':!r.singleLine?'Parola tek satır olmalı.':'';
  field.setCustomValidity(message);
  $('accessSaveUser').disabled=savingUser118||!policyReady120||Boolean(message);
  return !message;
}
function selectUser(user=null){
  selectedId=user?.id||null;
  $('accessUserFormTitle').textContent=user?'Kullanıcıyı Düzenle':'Yeni Kullanıcı';
  $('accessUsername').value=user?.username||'';
  $('accessUsername').readOnly=Boolean(user);
  $('accessPassword').value='';
  $('accessPassword').required=!user;
  $('accessPasswordHelp').textContent=user?
    'Parolayı değiştirmeyecekseniz boş bırakın. Örnek: Örnek.1234x (kullanmayın).':'Örnek şifre: Örnek.1234x (yalnızca örnek, kullanmayın).';
  showPassword118(false);
  updatePassword118();
  $('accessRole').value=user?.role||'cashier';
  $('accessPermissions').hidden=$('accessRole').value==='admin';
  $('accessActive').checked=user?.active!==false;
  selectedUser121=user;group121=0;
  profile121=user?.role==='cashier'&&!Array.isArray(user.permissionProfile)?null:new Set(user?.role==='cashier'?user.permissionProfile:catalog121?.standardPermissions||[]);
  if(!user&&!catalog121)profile121=null;
  renderPermissions121();
  $('accessUserFormStatus').textContent='';
}
function renderPermissions121(){
 const box=$('accessPermissions'),tabs=$('accessPermissionTabs121'),rows=$('accessPermissionRows121'),info=$('accessPermissionInfo121'),count=$('accessPermissionCount121');
 tabs.replaceChildren();rows.replaceChildren();
 box.hidden=$('accessRole').value==='admin';
 $('accessConvert121').hidden=!(selectedUser121?.role==='cashier'&&profile121===null&&catalog121);
 $('accessStandard121').disabled=!catalog121||profile121===null;
 $('accessClear121').disabled=!catalog121||profile121===null;
 if(!catalog121){info.textContent='Sunucu yetki kataloğu bekleniyor.';count.textContent='';return;}
 if(profile121===null){
  info.textContent='Eski hesap · Mevcut geniş yetkiler: '+(selectedUser121?.permissions?.join(', ')||'yok')+'. Parola/hesap düzenlemesi bunları değiştirmez. Yeni profile geçiş için aşağıdaki düğmeyi kullanın.';
  count.textContent='Eski profil';return;
 }
 const bundle=catalog121.salesBundle.every(id=>profile121.has(id));
 info.textContent='v121: '+(bundle?'Satış ve etiket paketi etkin.':'Satış ve etiket paketi kapalı (6 seçimin tamamı gerekir).')+' Ana pasif aktifleştirme ayrı yetki olarak etkin (satış paketi gerekir). Diğer seçimler sonraki aşamalar için kaydedilir. Mevcut katalog görünürlüğü ve yerel yazıcı/ayar davranışı bu sürümde değişmez.';
 count.textContent=profile121.size+' / 44';
 catalog121.permissionGroups.forEach(([name],i)=>{
  const b=document.createElement('button');b.type='button';b.textContent=name;b.setAttribute('aria-pressed',String(i===group121));b.addEventListener('click',()=>{group121=i;renderPermissions121()});tabs.append(b);
 });
 for(const [id,label] of catalog121.permissionGroups[group121][1]){
  const line=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span'),status=document.createElement('small');
  input.type='checkbox';input.checked=profile121.has(id);input.disabled=catalog121.adminOnly.includes(id);
  name.textContent=label;status.textContent=input.disabled?'Yalnız admin':['sale.cash','sale.card','sale.quantity','sale.clear','sale.void','sale.return','sale.weight','sale.discount','sale.price','product.label','product.price','product.stock.in','product.stock.out','product.create','product.delete.restore','product.barcode','product.category','product.tax.origin','product.cost','product.import','product.export','product.activate.later'].includes(id)?'Etkin':id==='product.activate.initial'?'Etkin · satış yetkisi gerekir':['customer.lookup','customer.credit','customer.collect','customer.create','customer.limit','customer.opening','report.own','report.daily.own','report.all','report.other','sale.reprint.own','sale.reprint.other'].includes(id)?'Etkin · merkezi sistem':'Planlanan';
  input.addEventListener('change',()=>{if(input.checked)profile121.add(id);else profile121.delete(id);renderPermissions121()});
  line.append(input,name,status);rows.append(line);
 }
}
async function openUserManager(){
  if(activeUser?.role!=='admin')return;
  policyReady120=false;catalog121=null;
  $('accessPolicyVersion120').textContent='Sunucu parola kuralı kontrol ediliyor…';
  $('accessPolicyVersion120').classList.remove('met120');
  $('accessUsersDialog').showModal();
  selectUser();
  try{await listUsers()}catch(error){$('accessUserFormStatus').textContent=error.message}
}
function setupUserManager(){
  $('settingsOpenUsers').addEventListener('click',openUserManager);
  $('accessCloseUsers').addEventListener('click',()=>$('accessUsersDialog').close());
  $('accessNewUser').addEventListener('click',()=>selectUser());
  $('accessConvert121').addEventListener('click',()=>{
   if(!catalog121||!confirm('Eski geniş yetkiler kaldırılacak. Bu sürümde yalnız satış ve etiket paketi uygulanır; diğer seçilen yetkiler sonraki aşamalarda etkinleşecektir. Devam edilsin mi?'))return;
   profile121=new Set(catalog121.standardPermissions);renderPermissions121();
  });
  $('accessStandard121').addEventListener('click',()=>{if(catalog121){profile121=new Set(catalog121.standardPermissions);renderPermissions121()}});
  $('accessClear121').addEventListener('click',()=>{profile121=new Set();renderPermissions121()});
  $('accessPassword').addEventListener('input',updatePassword118);
  $('accessPasswordToggle118').addEventListener('click',()=>showPassword118($('accessPassword').type==='password'));
  $('accessUsersDialog').addEventListener('close',()=>{
    $('accessPassword').value='';showPassword118(false);updatePassword118();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)showPassword118(false);});
  $('accessRole').addEventListener('change',()=>{
    if($('accessRole').value==='cashier'&&selectedUser121?.role==='admin'&&profile121===null)profile121=new Set(catalog121?.standardPermissions||[]);
    renderPermissions121();
  });
  $('accessUserForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(activeUser?.role!=='admin'||savingUser118)return;
    if(!policyReady120){$('accessUserFormStatus').textContent='Sunucu v121 yetki kuralı doğrulanamadı.';return;}
    if(!updatePassword118()){$('accessPassword').reportValidity();return;}
    savingUser118=true;updatePassword118();
    const action=selectedId?'update':'create';
    const body={
      action,username:$('accessUsername').value.trim(),role:$('accessRole').value,
      active:$('accessActive').checked,permissionSchemaVersion:121
    };
    if(selectedId)body.id=selectedId;
    if(body.role==='cashier'&&profile121!==null)body.permissionProfile=[...profile121];
    if($('accessPassword').value)body.password=$('accessPassword').value;
    try{
      const result=await call('/api/users',{method:'POST',headers,body:JSON.stringify(body)});
      if(result.passwordPolicyVersion!==120||result.permissionSchemaVersion!==121){policyReady120=false;throw Error('Sunucu sürümü değişti. Kullanıcı listesini yeniden açıp kontrol edin.');}
      $('accessUserFormStatus').textContent='✓ Kullanıcı kaydedildi.';
      $('accessPassword').value='';showPassword118(false);
      await listUsers();
      selectUser();$('accessUserFormStatus').textContent='✓ Kullanıcı kaydedildi.';
    }catch(error){$('accessUserFormStatus').textContent=error.message}
    finally{savingUser118=false;updatePassword118()}
  });
  // First tap opens account details; signing out requires a separate
  // deliberate confirmation. Do not change the secure server logout API.
  const toggle=$('accessLogout');
  const menu=$('accessAccountMenu');
  const dialog=$('accessLogoutConfirm');
  const approve=$('accessLogoutApprove');
  const cancel=$('accessLogoutCancel');
  const errorMessage=$('accessLogoutError');
  let pendingLogout=false;
  const closeMenu=(restoreFocus=false)=>{
    menu.hidden=true;
    toggle.setAttribute('aria-expanded','false');
    if(restoreFocus&&!toggle.hidden)toggle.focus();
  };
  toggle.addEventListener('click',()=>{
    const opening=menu.hidden;
    menu.hidden=!opening;
    toggle.setAttribute('aria-expanded',String(opening));
    if(opening)$('accessMenuLogout').focus();
  });
  $('accessMenuLogout').addEventListener('click',()=>{
    closeMenu();
    errorMessage.textContent='';
    if(!dialog.open)dialog.showModal();
    cancel.focus();
  });
  document.addEventListener('pointerdown',event=>{
    if(!menu.hidden&&!menu.contains(event.target)&&!toggle.contains(event.target))
      closeMenu();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!menu.hidden)closeMenu(true);
  });
  cancel.addEventListener('click',()=>{if(!pendingLogout)dialog.close()});
  dialog.addEventListener('cancel',event=>{if(pendingLogout)event.preventDefault()});
  dialog.addEventListener('close',()=>{
    errorMessage.textContent='';
    if(!toggle.hidden)toggle.focus();
  });
  approve.addEventListener('click',async()=>{
    if(pendingLogout)return;
    pendingLogout=true;
    approve.disabled=true;cancel.disabled=true;
    errorMessage.textContent='';
    try{
      await call('/api/auth',{method:'DELETE'});
      accountChannel?.postMessage(null);
      location.reload();
    }catch(error){
      errorMessage.textContent=error.message;
      pendingLogout=false;
      approve.disabled=false;cancel.disabled=false;
    }
  });
  window.addEventListener('hizlisatis:auth-required',()=>{
    showGate('Oturumunuz sona erdi. Kullanıcı adı ve şifrenizle yeniden giriş yapın.');
  });
}
/** Promise resolves only after a valid signed session is confirmed.
 * If migration is not activated, the existing site stays untouched.
 */
export async function requireAccess(){
  const gate=$('loginGate'),form=$('loginForm');
  const loginButton=$('loginSubmit');
  // Register before ANY await, including network/API failures. A browser must
  // never perform a native form submission with credentials.
  form.addEventListener('submit',event=>event.preventDefault());
  let status;
  try{
    const response=await fetch('/api/auth',{cache:'no-store',credentials:'same-origin'});
    const type=(response.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('application/json'))
      throw Error('Bu adreste giriş servisi bulunamadı. HızlıSatış sitesini https://hizlisatis.pages.dev/ adresinden açın.');
    status=await response.json().catch(()=>{throw Error('Giriş hizmeti geçerli yanıt vermedi.');});
    if(!response.ok)throw Error(status.error||'Giriş yapılandırması eksik.');
  }catch(error){
    showGate(error.message);
    throw error;
  }
  if(status.enabled===false){
    enabled=false;gate.hidden=true;document.body.classList.remove('auth-locked');
    $('accessIdentity').textContent='⚠ Güvenli giriş henüz etkin değil';
    $('accessIdentity').hidden=false;
    return {enabled:false};
  }
  enabled=true;
  setupUserManager();
  if(status.authenticated&&status.user){
    applyUser(status.user);initialResolved=true;release();return status.user;
  }
  showGate(status.setupRequired?
    'İlk kurulum: Cloudflare üzerinde tanımlı başlangıç yöneticisi ve parolasıyla giriş yapın.':'');
  return new Promise(resolve=>{
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=$('loginSubmit');button.disabled=true;$('loginError').textContent='';
      try{
        const response=await call('/api/auth',{method:'POST',headers,body:JSON.stringify({
          username:$('loginUsername').value.trim(),password:$('loginPassword').value
        })});
        $('loginPassword').value='';
        applyUser(response.user);
        accountChannel?.postMessage(response.user.id);
        release();
        if(initialResolved)location.reload();
        else{initialResolved=true;resolve(response.user)}
      }catch(error){showGate(error.message)}
      finally{button.disabled=false}
    });
    // Only a verified API response enables the submit button. Without JS or
    // when the login endpoint returns HTML/error, credentials cannot be sent.
    loginButton.type='submit';
    loginButton.disabled=false;
  });
}
/** Call before committing sales to any local store. This fails offline,
 * instead of letting an unauthenticated device invent receipts.
 */
export async function authorizeCheckout(record){
  if(!enabled)return; // Legacy site until AUTH_V2_ENABLED is activated.
  try{
    await call('/api/sale-access',{method:'POST',headers,body:JSON.stringify({record})});
  }catch(error){
    if(/yetki|oturum/i.test(error.message))window.dispatchEvent(new Event('hizlisatis:auth-required'));
    throw error;
  }
}
