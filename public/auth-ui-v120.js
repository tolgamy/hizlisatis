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
const can=permission=>activeUser?.role==='admin'||activeUser?.permissions?.includes(permission);
export function userCan(permission){return !enabled||Boolean(can(permission));}
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
  const setPermission=(id,p)=>{
    const node=$(id);if(node)node.hidden=!can(p);
  };
  // UI hiding is for usability only. Server enforces every account right.
  for(const id of ['settingsExcel','settingsAdd','settingsManage','settingsCategoryImages',
    'homeQuickBarcode','homeQuickProducts','settingsInnerExcel','settingsInnerManage',
    'settingsInnerCategoryImages'])setPermission(id,'products');
  for(const id of ['settingsHistory','settingsExport','settingsBackup','settingsInnerExport',
    'settingsInnerBackup','homeQuickReports','homeTodaySalesButton'])setPermission(id,'reports');
  setPermission('checkoutDiscountToggle','discounts');
  for(const id of ['settingsCustomers'])setPermission(id,'customers');
  for(const id of ['navSale','homeQuickSale'])setPermission(id,'sales');
  const manageSettings=['products','customers','reports','users'].some(can);
  for(const id of ['navSettings','homeSettingsShortcut','settingsOpenPreferences']) {
    const node=$(id);if(node)node.hidden=!manageSettings;
  }
  $('settingsAdminGroup').hidden=user.role!=='admin';
}
function release(){
  $('loginGate').hidden=true;
  document.body.classList.remove('auth-locked');
}
async function listUsers(){
  const data=await call('/api/users');
  policyReady120=data.passwordPolicyVersion===120;
  $('accessPolicyVersion120').textContent=policyReady120?'Sunucu parola kuralı: v120 ✓':'Sunucu güncellemesi eksik. v120 dosyalarını yükleyip Node.js’i yeniden başlatın.';
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
  for(const box of document.querySelectorAll('[data-access-permission]'))
    box.checked=user?user.permissions.includes(box.value):box.value==='sales';
  $('accessUserFormStatus').textContent='';
}
async function openUserManager(){
  if(activeUser?.role!=='admin')return;
  policyReady120=false;
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
  $('accessPassword').addEventListener('input',updatePassword118);
  $('accessPasswordToggle118').addEventListener('click',()=>showPassword118($('accessPassword').type==='password'));
  $('accessUsersDialog').addEventListener('close',()=>{
    $('accessPassword').value='';showPassword118(false);updatePassword118();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)showPassword118(false);});
  $('accessRole').addEventListener('change',()=>{
    $('accessPermissions').hidden=$('accessRole').value==='admin';
  });
  $('accessUserForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(activeUser?.role!=='admin'||savingUser118)return;
    if(!policyReady120){$('accessUserFormStatus').textContent='Sunucu v120 parola kuralı doğrulanamadı.';return;}
    if(!updatePassword118()){$('accessPassword').reportValidity();return;}
    savingUser118=true;updatePassword118();
    const permission=[...document.querySelectorAll('[data-access-permission]:checked')]
      .map(box=>box.value);
    const action=selectedId?'update':'create';
    const body={
      action,username:$('accessUsername').value.trim(),role:$('accessRole').value,
      active:$('accessActive').checked,permissions:permission
    };
    if(selectedId)body.id=selectedId;
    if($('accessPassword').value)body.password=$('accessPassword').value;
    try{
      const result=await call('/api/users',{method:'POST',headers,body:JSON.stringify(body)});
      if(result.passwordPolicyVersion!==120){policyReady120=false;throw Error('Sunucu sürümü değişti. Kullanıcı listesini yeniden açıp kontrol edin.');}
      $('accessUserFormStatus').textContent='✓ Kullanıcı kaydedildi.';
      $('accessPassword').value='';showPassword118(false);
      await listUsers();
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
