// Shared menu; never converts a configured future right to a broad effective right.
import {lookup125,reportScope125} from './auth-ui-v125.js';
const $=id=>document.getElementById(id);
let account=null,hooks=null,bypass=null;
export const admin122=()=>account?.role==='admin';
export const effective122=p=>admin122()||Boolean(account?.permissions?.includes(p));
const allowedOperation125=(id,p)=>id==='settingsCustomers'?lookup125():id==='settingsHistory'?Boolean(reportScope125()):effective122(p);
export const printer122=()=>admin122()||(Array.isArray(account?.permissionProfile)?account.permissionProfile.includes('system.printer'):effective122('sales'));
const workflow={
 settingsExcel:['Excel Ürün Yükle','Excel dosyası seç ve ürünleri yükle','products'],
 settingsAdd:['Yeni Ürün Ekle','Yeni ürün kaydı oluştur','products'],
 settingsHistory:['Satış Geçmişi','Satış kayıtlarını görüntüle','reports'],
 settingsExport:['Satışları CSV İndir','CSV dosyası oluştur ve indir','reports'],
 settingsManage:['Ürün Yönetimi','Ürün yönetimi ekranını aç','products'],
 settingsCategoryImages:['Kategori Görselleri','Kategori görsellerini düzenle','products'],
 settingsBackup:['Yedekle / Geri Yükle','Cihaz yedeğini yönet','reports'],
 settingsSale122:['Satış','Satış ekranını aç','sales']
};
const shortcuts={homeQuickBarcode:'settingsAdd',homeQuickProducts:'settingsManage',homeQuickReports:'settingsHistory',homeTodaySalesButton:'settingsHistory',homeRecentSalesOpen:'settingsHistory',sidebarReports:'settingsHistory'};
const direct={settingsCustomers:'customers',settingsOpenUsers:'users',exportProducts100:'products',namesPreview99:'products',namesApply99:'products',backupDownload:'reports',exportSales:'reports',settingsReceiptSave:'users'};
function disable(id,locked){
 const el=$(id);if(!el)return;
 if(locked){el.disabled=true;el.classList.add('locked122');el.title='Bu işlem için yetkiniz yok.';el.setAttribute('aria-disabled','true');}
}
export function filterPreferences122(group=null,title='⚙ Ayarlar'){
 const moved=['settingsPrintingGroup','settingsCustomerGroup','settingsAdminGroup'];
 const list=$('settingsPreferences').querySelector('.settings-inner-list');
 for(const detail of list.children){if(detail.tagName!=='DETAILS')continue;detail.hidden=group?detail.id!==group:moved.includes(detail.id);if(group&&detail.id===group)detail.open=true;}
 $('settingsPreferencesTitle').textContent=title;
}
function action(label,description,allowed,fn){
 const b=document.createElement('button'),strong=document.createElement('strong'),small=document.createElement('small');
 b.type='button';b.className='hub-action122';b.disabled=!allowed;
 strong.textContent=(allowed?'':'🔒 ')+label;small.textContent=description;
 b.append(strong,small);if(allowed)b.addEventListener('click',fn);$('settingsHubActions122').append(b);
}
function original(id){bypass=id;try{$(id)?.click()}finally{bypass=null}}
export function openHub122(id){
 if(!hooks)return;
 hooks.openSettingsMenu();
 $('settingsMainMenu').hidden=true;$('settingsPageTitle').hidden=true;$('settingsPreferences').hidden=true;$('settingsHub122').hidden=false;
 $('settingsHubActions122').replaceChildren();
 if(id==='settingsSecurity122'){
  $('settingsHubTitle122').textContent='Güvenlik ve İşlem Takibi';
  $('settingsHubNote122').textContent=admin122()?'Yönetici PIN doğrulaması ve 5 dakika ekran kilidi etkin. PIN cPanel üzerinden yönetilir.':'Kasiyer oturumu kullanıcı adı ve parola ile açılır; yönetici PIN’i gerekmez.';
  action('Oturum bilgisi','Oturum ve parola yönetimi',admin122(),()=>original('accessLogout'));
  action('Yönetici onay talepleri',admin122()?'Bekleyen talepleri incele ve karar ver.':'Kendi taleplerinizi takip edin.',effective122('sales'),()=>hooks.openApprovals());
  action('Kullanıcı işlem geçmişi','Sonraki sürümde etkinleşecek.',false);
  return;
 }
 const item=workflow[id];if(!item)return;
 const allowed=allowedOperation125(id,item[2]);
 $('settingsHubTitle122').textContent=item[0];
 $('settingsHubNote122').textContent=allowed?'Bu bölümde mevcut yetkinize göre işlem yapabilirsiniz.':'Bu bölüm görünür; işlem yetkisi bulunmuyor. Henüz uygulanmayan ayrıntılı yetkiler sonraki sürümlerde etkinleşecek.';
 if(id==='settingsManage'||id==='settingsCategoryImages')action('Ürün ve kategorileri görüntüle','Mevcut satış kataloğunu aç.',true,hooks.openProductCategoryHome);
 action(item[1],allowed?'Mevcut yetkinizle devam edin.':'Yetkiniz yok veya ilgili ayrı yetki henüz uygulanmadı.',allowed,()=>id==='settingsSale122'?original('navSale'):original(id));
 if(id==='settingsManage'&&!allowed){const activate=effective122('sales')&&Array.isArray(account?.permissionProfile)&&account.permissionProfile.includes('product.activate.initial');action('Ana pasif ürünü aktifleştir',activate?'Satış ekranında kayıtlı barkodu okutun.':'Bu işlem için ana pasif aktifleştirme ve satış yetkisi gerekir.',activate,()=>original('navSale'));}

}
export function installCommonMenu122(user,options){
 account=user;hooks=options;
 $('settingsHubBack122').addEventListener('click',hooks.showSettingsMainMenu);
 for(const [id,permission] of Object.entries(direct))disable(id,!allowedOperation125(id,permission));
 for(const id of ['backupUpload'])disable(id,!effective122('reports'));
 const p=printer122();
 for(const id of ['settingsLabelPrinterName','settingsReceiptPrinterName','testLabelPrint','testReceiptPrint','settingsPrinterProfilesSave','settingsReceiptAction'])disable(id,!p);
 for(const id of ['localPrintEnabled','localPrintToken','settingsPrintWidth','settingsPrintContent109','settingsReceiptTitle','settingsReceiptFooter106','settingsReceiptPhone','settingsReceiptWebsite','settingsReceiptSave'])disable(id,!admin122());
 for(const [id,allowed,note] of [['settingsPrintingGroup',p,'Yazıcı seçme ve test baskısı yetkiniz yok.'],['settingsPrinterDetails',admin122(),'Fiş tasarımını yalnız yönetici değiştirebilir.'],['settingsCustomerGroup',lookup125(),'Müşteri sorgulama yetkisi yok.'],['settingsAdminGroup',admin122(),'Kullanıcı listesi ve düzenleme yalnız yöneticiye açıktır.']]){
  if(allowed)continue;const el=$(id),n=document.createElement('p');n.className='lock-note122';n.textContent='🔒 '+note;el?.append(n);
 }
 document.addEventListener('click',event=>{
  const target=event.target?.closest?.('button,a');const id=target?.id;
  if(!id||id===bypass)return;
  const stop=()=>{event.preventDefault();event.stopImmediatePropagation()};
  if(workflow[id]){stop();openHub122(id);return;}
  if(shortcuts[id]){stop();openHub122(shortcuts[id]);return;}
  if(id==='settingsSecurity122'){stop();openHub122(id);return;}
  const group={settingsCustomer122:['settingsCustomerGroup','Müşteri ve Veresiye'],settingsPrinter122:['settingsPrintingGroup','Fiş ve Etiket'],settingsUsers122:['settingsAdminGroup','Kullanıcı Yönetimi']}[id];
  if(group){stop();hooks.openSettingsMenu();hooks.showSettingsPreferences(...group);return;}
  if((id==='navSale'||id==='homeQuickSale'||id==='settingsPaymentsOpenSale'||id==='settingsDiscountOpenSale')&&!effective122('sales')){stop();openHub122('settingsSale122');return;}
  if(direct[id]&&!allowedOperation125(id,direct[id])){stop();return;}
 },true);
}
