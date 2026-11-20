import { MAIN_CATEGORY_ORDER } from './category-art.js';
import { productCategoryPath } from './category-menu.js';
import { parseLocaleNumber, safeImageUrl } from './normalize.js';
import { getLocalSnapshot, getManagedProductHistory, saveManagedProduct, initiallyDeactivateAll } from './idb.js';
import { fetchRemoteProducts, deactivateRemoteProducts, importRemoteProducts  ,logoutAdminSession } from './remote-products.js';
import { PRODUCT_STATUS, productStatus, isActive, countStatuses, nextProductStatus, priceWithVat } from './product-lifecycle.js';
import { verifyPassivePin } from './passive-auth.js';

const $ = id => document.getElementById(id);
const text = value => String(value ?? '');
const format = price => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(price||0);
const now = () => new Date().toISOString();
const statusLabels = {
  active:'Aktif Ürünler', 'initial-inactive':'Ana Pasif Ürünler',
  'later-inactive':'Aktif Sonrası Pasif', deleted:'Silinen Ürünler'
};
function newId() {
  return 'manual::'+(globalThis.crypto?.randomUUID?.() ||
    (Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)));
}
function fillOptions(element,values,placeholder) {
  element.replaceChildren();
  for (const value of [placeholder,...values]) {
    const option=document.createElement('option');
    option.value=value||''; option.textContent=value||'Seçiniz'; element.append(option);
  }
}
function compressImage(file) {
  if(!file || !file.type.startsWith('image/')) return Promise.reject(Error('Görsel dosyası seçiniz.'));
  if(file.size>12*1024*1024) return Promise.reject(Error('Görsel en fazla 12 MB olabilir.'));
  return new Promise((resolve,reject)=>{
    const blob=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(blob);
      const maxSide=512,scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const result=canvas.toDataURL('image/webp',0.68);
      if(!/^data:image\/webp;base64,/.test(result) || result.length>320000)
        reject(Error('Görsel sıkıştırılamadı; daha küçük fotoğraf seçiniz.'));
      else resolve(result);
    };
    img.onerror=()=>{URL.revokeObjectURL(blob);reject(Error('Görsel açılamadı.'));};
    img.src=blob;
  });
}
export function createProductManager({state,serializeMutation,refresh,announce,channel,openManageScanner}) {
  let filter='active',selection=null,created=false,uploadImage='',pendingSale=null;
  const managementDialog=$('manageDialog'), activationDialog=$('passiveProductDialog');
  const search=$('manageSearch'), form=$('manageEditForm'), results=$('manageResults');

  function authorizePassiveAction() {
    const pin=prompt('Pasif işlemi şifresini girin:');
    if(pin===null)return false;
    if(!verifyPassivePin(pin)){announce('Şifre yanlış. İşlem yapılmadı.','error');return false;}
    return true;
  }
  function counts() {
    const counts=countStatuses(state.products);
    const unavailable=Boolean(state.catalogLoading||state.catalogError||!state.products.length);
    $('manageStatusCounts').replaceChildren();
    for(const key of Object.values(PRODUCT_STATUS)){
      const button=document.createElement('button');
      button.type='button';
      button.className='manage-status-card'+(key===filter?' selected':'');
      const number=document.createElement('strong');number.textContent=unavailable?'—':counts[key].toLocaleString('tr-TR');
      button.disabled=unavailable;
      const caption=document.createElement('small');caption.textContent=statusLabels[key];
      button.append(number,caption);
      button.addEventListener('click',()=>{filter=key;countsView();});
      $('manageStatusCounts').append(button);
    }
    $('manageBulkDeactivate').disabled=unavailable;
    $('manageNew').disabled=unavailable;
    // Bulk deactivation was a one-time secured setup operation; hide once completed.
    $('manageBulkDeactivate').hidden=!!state.lifecycleMeta;
    $('manageBulkInfo').textContent=state.lifecycleMeta
      ? 'İlk toplu pasife alma '+new Date(state.lifecycleMeta.at).toLocaleString('tr-TR')+' tarihinde yapıldı.'
      : 'İlk toplu pasife alma henüz yapılmadı. Ürünler silinmez.';
  }
  function countsView() { counts();renderResults(); }
  function renderResults() {
    const q=search.value.trim().toLocaleLowerCase('tr-TR');
    results.replaceChildren();
    const matching=state.products.filter(p=>productStatus(p)===filter &&
      (!q || [p.baslik,p.barkod,p.urunKodu,p.marka].some(v=>text(v).toLocaleLowerCase('tr-TR').includes(q))));
    if(state.catalogLoading||state.catalogError||!state.products.length) {
      $('manageResultCount').textContent=state.catalogLoading
        ? 'Merkezi ürünler yükleniyor: '+Number(state.catalogProgress||0).toLocaleString('tr-TR')+' / 19.096'
        : 'Merkezi ürünler yüklenemedi';
      results.textContent=state.catalogLoading
        ? 'Ürünler merkezi veritabanından alınıyor. Tamamlanınca listelenecek.'
        : (state.catalogError||'Ürünler henüz yüklenmedi. Merkezi Veritabanından Yenile düğmesini kullanın.');
      return;
    }
    $('manageResultCount').textContent=matching.length.toLocaleString('tr-TR')+' ürün';
    for(const product of matching.slice(0,40)) {
      const button=document.createElement('button');button.type='button';
      const body=document.createElement('span'),name=document.createElement('strong'),sub=document.createElement('small');
      name.textContent=product.baslik;
      sub.textContent=[product.barkod,format(product.satisFiyati)].filter(Boolean).join(' · ');
      body.append(name,sub);button.append(body);
      const mark=document.createElement('span');mark.textContent='›';button.append(mark);
      button.addEventListener('click',()=>editProduct(product));
      results.append(button);
    }
    if(!matching.length) results.textContent='Bu bölümde ürün bulunamadı.';
    if(matching.length>40) {
      const note=document.createElement('p');note.textContent='İlk 40 ürün gösteriliyor. Daha fazlası için arama yapın.';
      results.append(note);
    }
  }
  function syncCategories(selectedMain='',selectedSub='') {
    fillOptions($('manageMainCategory'),MAIN_CATEGORY_ORDER,'');
    $('manageMainCategory').value=MAIN_CATEGORY_ORDER.includes(selectedMain)?selectedMain:'';
    const allSub=new Set(state.products.filter(p=>productCategoryPath(p)[0]===$('manageMainCategory').value)
      .map(p=>productCategoryPath(p)[1]).filter(Boolean));
    const data=$('manageSubSuggestions');data.replaceChildren();
    for(const label of [...allSub].sort((a,b)=>a.localeCompare(b,'tr'))) {
      const option=document.createElement('option');option.value=label;data.append(option);
    }
    $('manageSubCategory').value=selectedSub||'';
  }
  function imagePreview(source) {
    const img=$('manageImagePreview');
    const url=source && (/^data:image\/webp;base64,/.test(source)?source:safeImageUrl(source));
    img.hidden=!url;
    if(url) img.src=url;
    else img.removeAttribute('src');
  }
  function editProduct(product=null,barcode='') {
    selection=product;created=!product;uploadImage='';
    $('manageFormTitle').textContent=created?'Yeni Ürün Ekle':'Ürünü Düzenle';
    $('manageBarcodeInput').value=product?.barkod||barcode;
    $('manageName').value=product?.baslik||'';
    $('manageBrand').value=product?.marka||'';
    $('managePurchase').value=product?.alisFiyati??'';
    $('managePrice').value=product?.kdvExcluded?(product.girisFiyati??product.satisFiyati):product?.fiyatBelirsiz?'':product?.satisFiyati??'';
    $('manageStock').value=product?.stokBelirsiz?'':product?.stok??'';
    $('manageVat').value=[0,1,10,20].includes(Number(product?.kdv))?String(product.kdv):'0';
    $('manageVatExcluded').checked=Boolean(product?.kdvExcluded);
    $('manageUnit').value=product?.birim||'adet';
    $('manageImage').value=product?.gorsel?.startsWith('data:')?'':product?.gorsel||'';
    $('manageImageFile').value='';
    $('manageRemoveImage').checked=false;
    imagePreview(product?.gorsel);
    const parts=product?productCategoryPath(product):[];
    syncCategories(parts[0]||'',parts[1]||'');
    $('manageCurrentStatus').textContent=created?'Yeni ürün':statusLabels[productStatus(product)];
    $('manageDelete').hidden=created||productStatus(product)==='deleted';
    $('manageRestore').hidden=created||productStatus(product)!=='deleted';
    $('manageActivate').hidden=created||isActive(product)||productStatus(product)==='deleted';
    $('manageDeactivate').hidden=created||!isActive(product);
    $('manageSaveActivate').hidden=!created&&productStatus(product)==='deleted';
    $('manageHistory').replaceChildren();
    if(product) getManagedProductHistory(product.id).then(events=>{
      if(selection?.id!==product.id)return;
      for(const event of events.slice(-12).reverse()) {
        const row=document.createElement('p');
        row.textContent=new Date(event.at).toLocaleString('tr-TR')+' · '+event.action;
        $('manageHistory').append(row);
      }
    }).catch(()=>{});
    $('manageOverview').hidden=true;form.hidden=false;results.hidden=true;
  }
  function showOverview() {
    selection=null;created=false;
    form.hidden=true;$('manageOverview').hidden=false;results.hidden=false;
    countsView();
  }
  function openManage(product=null,barcode='') {
    search.value='';filter=product?productStatus(product):'active';
    if(!managementDialog.open)managementDialog.showModal();
    if(state.legacyPending)
      announce('Bu cihazdaki bazı eski ürün değişiklikleri henüz merkezde değil. Önce Eski Cihaz Yedeğini İndir, sonra Kayıtları Taşı.','error');
    if(product||barcode)editProduct(product,barcode);else showOverview();
  }
  async function updateStatus(action) {
    if(!selection)return;
    const current=selection;
    if(action==='delete'&&!confirm('Ürün Silinen Ürünler bölümüne taşınacak. Devam edilsin mi?'))return;
    // Activation is a one-tap action. A server-side admin session still protects D1 edits.
    if(action==='deactivate'&&!authorizePassiveAction())return;
    const status=nextProductStatus(current,action);
    const updated={...current,lifecycleStatus:status,source:'excel',statusChangedAt:now(),
      everActivated:current.everActivated||action==='activate',
      deletedFrom:action==='delete'?productStatus(current):current.deletedFrom};
    await persist(updated,action);
  }
  async function persist(product,action) {
    try {
      await serializeMutation(()=>saveManagedProduct(product,action));
      const snapshot=await refresh(product.id);
      const verified=snapshot.products.find(item=>item.id===product.id);
      if(!verified || productStatus(verified)!==productStatus(product))
        throw Error('Kaydedilen ürün durumu yeniden okunamadı. Ürün değiştirilmedi.');
      channel?.postMessage('product-managed');
      if(product.lifecycleStatus==='active')filter='active';
      else filter=product.lifecycleStatus;
      showOverview();
      announce('Ürün kaydedildi: '+statusLabels[product.lifecycleStatus||'active'],'success');
    } catch(error) { announce('İşlem başarısız: '+error.message,'error'); }
  }
  async function saveForm(event,activate=false) {
    event?.preventDefault?.();
    const barcode=$('manageBarcodeInput').value.trim(),baslik=$('manageName').value.trim(),
      main=$('manageMainCategory').value,sub=$('manageSubCategory').value.trim();
    if(!baslik||!main||!sub||!barcode) {announce('Barkod, ad, ana ve alt kategori gerekli.','error');return;}
    if(state.products.some(p=>p.barkod===barcode && p.id!==selection?.id)){
      announce('Bu barkod başka bir üründe kayıtlı.','error');return;
    }
    const priceString=$('managePrice').value.trim();
    const entered=parseLocaleNumber(priceString,NaN),vat=Number($('manageVat').value),
      excluded=$('manageVatExcluded').checked;
    if(!Number.isFinite(entered)||entered<0) {announce('Geçerli satış fiyatı girin.','error');return;}
    const stockString=$('manageStock').value.trim(),stock=stockString?Number(stockString):0;
    if(!Number.isFinite(stock)||stock<0) {announce('Stok miktarı geçersiz.','error');return;}
    const purchaseString=$('managePurchase').value.trim();
    const purchase=purchaseString?parseLocaleNumber(purchaseString,NaN):null;
    if(purchase!==null&&(!Number.isFinite(purchase)||purchase<0)){
      announce('Alış fiyatı geçersiz.','error');return;
    }
    const url=$('manageImage').value.trim();
    if(url&&!safeImageUrl(url)) {announce('Geçerli HTTPS görsel adresi giriniz.','error');return;}
    const old=selection,finalStatus=activate?'active':old?.lifecycleStatus||'active';
    // No on-device PIN on product activation; secure admin session protects writes.
    const updated={...(old||{}),id:old?.id||newId(),barkod,baslik,
      marka:$('manageBrand').value.trim(),alisFiyati:purchase,
      satisFiyati:priceWithVat(entered,vat,excluded).gross,
      girisFiyati:entered,kdv:vat,kdvBelirsiz:false,kdvExcluded:excluded,
      fiyatBelirsiz:false,stok,stokBelirsiz:!stockString,
      birim:$('manageUnit').value,
      kategoriAna:main,kategoriAlt:sub,kategoriYolu:[main,sub],
      kategori:main+' > '+sub,kaynakKategori:main+' > '+sub,
      gorsel:uploadImage||url||($('manageRemoveImage').checked?'':old?.gorsel||''),
      lifecycleStatus:finalStatus,everActivated:old?.everActivated||activate,
      statusChangedAt:activate?now():old?.statusChangedAt,source:'excel',
      importFormat:'hizlisatis',
      paraBirimi:old?.paraBirimi||'TRY',urunKodu:old?.urunKodu||barcode,
      variantKey:old?.variantKey||barcode};
    await persist(updated,old?'edit'+(activate?'-activate':''):'create');
  }
  function manageScannedBarcode(barcode) {
    const exact=state.products.find(p=>p.barkod===barcode||p.urunKodu===barcode);
    if(managementDialog.open)managementDialog.close();
    openManage(exact||null,exact?'':barcode);
    announce(exact?'Ürün bulundu; düzenleyebilirsiniz.':'Yeni barkod; ürün ekleme ekranı açıldı.');
  }
  function offerSaleActivation(product,addAfter) {
    if(isActive(product))return false;
    if(productStatus(product)==='deleted') {
      announce('Bu ürün silinmiş. Ayarlar > Ürün Yönetimi bölümünden geri yükleyin.','error');
      return true;
    }
    pendingSale={product,addAfter};
    $('passiveProductName').textContent=product.baslik;
    $('passiveProductBarcode').textContent='Barkod: '+(product.barkod||'—');
    $('passiveProductStatus').textContent=statusLabels[productStatus(product)];
    if(!activationDialog.open)activationDialog.showModal();
    return true;
  }
  async function confirmSaleActivation() {
    if(!pendingSale)return;
    const {product,addAfter}=pendingSale;
    // Do not interrupt scan-to-sale with the old 1453 PIN prompt.
    $('passiveActivate').disabled=true;
    try{
      const updated={...product,lifecycleStatus:'active',everActivated:true,source:'excel',statusChangedAt:now()};
      await serializeMutation(()=>saveManagedProduct(updated,'scan-activate'));
      const snapshot=await refresh(product.id);
      if(productStatus(snapshot.products.find(item=>item.id===product.id))!=='active')
        throw Error('Aktif durumu kalıcı olarak doğrulanamadı.');
      channel?.postMessage('product-activated');
      activationDialog.close();pendingSale=null;
      announce('Ürün aktifleştirildi.','success');
      addAfter?.(state.byId.get(product.id));
    }catch(error){announce('Aktifleştirilemedi: '+error.message,'error');}
    finally{$('passiveActivate').disabled=false;}
  }
  async function bulkDeactivate() {
    if(state.catalogLoading||state.catalogError||state.products.length<19096) {
      announce('Merkezi ürünler tamamen yüklenmeden toplu işlem yapılamaz.','error');return;
    }
    if(state.lifecycleMeta){announce('İlk toplu işlem daha önce yapılmış.','error');return;}
    const yes=confirm('Tüm aktif ürünler Ana Pasif listesine taşınacak. Kayıtlar silinmez. Devam edilsin mi?');
    if(!yes)return;
    if(!authorizePassiveAction())return;
    $('manageBulkDeactivate').disabled=true;
    try{
      const count=await serializeMutation(()=>initiallyDeactivateAll());
      const snapshot=await refresh();
      if(count > 0 && snapshot.products.filter(item=>productStatus(item)!=='active').length<count)
        throw Error('Toplu pasife alma kontrolü başarısız. Lütfen yeniden yüklemeden önce yedek alın.');
      channel?.postMessage('bulk-deactivated');filter='initial-inactive';
      countsView();announce(count.toLocaleString('tr-TR')+' ürün ana pasife alındı.','success');
    }catch(error){announce('Toplu işlem başarısız: '+error.message,'error');}
    finally{$('manageBulkDeactivate').disabled=false;}
  }
  async function migrateLocalData() {
    const button=$('migrateLocalToServer');
    button.disabled=true;
    try {
      const local=await getLocalSnapshot();
      const remote=await fetchRemoteProducts();
      if(remote.products.some(p=>p.source!=='bundle'||p.lifecycleStatus) || (remote.bulkAt&&!local.lifecycleMeta)) {
        throw Error('Merkezi veritabanında zaten kayıt var. Otomatik üzerine yazma güvenlik için engellendi.');
      }
      const changed=local.products.filter(p=>p.source!=='bundle'||
        (p.lifecycleStatus&&p.lifecycleStatus!=='active'&&
         !(p.lifecycleStatus==='initial-inactive'&&local.lifecycleMeta))||
        Boolean(p.everActivated));
      const total=changed.length;
      const first=remote.bulkAt===null && Boolean(local.lifecycleMeta);
      if(!first && !total)throw Error('Taşınacak yerel değişiklik bulunamadı.');
      if(!confirm('Bu cihazdaki '+total+' ürün düzenlemesi ve '+
        (first?'toplu pasif durumu':'mevcut ürün durumları')+
        ' merkezi veritabanına aktarılacak. İşleme başlamadan önce aşağıdaki Yerel Yedek düğmesiyle yedek alın. Devam edilsin mi?'))return;
      if(first)await deactivateRemoteProducts();
      if(total)await importRemoteProducts(changed);
      const verified=await fetchRemoteProducts();
      const remoteById=new Map(verified.products.map(p=>[p.id,p]));
      if(local.lifecycleMeta&&!verified.bulkAt)
        throw Error('Merkezi toplu pasif durumu doğrulanamadı.');
      if(changed.some(p=>remoteById.get(p.id)?.lifecycleStatus !== (p.lifecycleStatus||'active')))
        throw Error('Aktarılan ürün durumları sunucudan doğrulanamadı. Eski yedeği silmeyin.');
      await refresh();
      // Keep legacy local backups intact, even after server verification:
      // customers can still recover them if a second device has stale edits.
      channel?.postMessage('product-migrated');
      countsView();
      announce('Yerel ürün değişiklikleri sunucuya aktarıldı.','success');
    }catch(error){announce('Taşıma başarısız: '+error.message,'error');}
    finally{button.disabled=false;}
  }
  async function exportLocalBackup() {
    try {
      const local=await getLocalSnapshot();
      const blob=new Blob([JSON.stringify({exportedAt:now(),source:'device',
        ...local})],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='hizlisatis-eski-cihaz-yedegi.json';
      document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      announce('Eski cihaz yedeği oluşturuldu. Dosyayı güvenli yerde saklayın.','success');
    }catch(error){announce('Yerel yedek indirilemedi: '+error.message,'error');}
  }
  function exportBackup() {
    const payload={exportedAt:now(),products:state.products};
    const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='hizlisatis-urun-yedegi-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function attach() {
    const button=document.createElement('button');
    button.id='migrateLocalToServer';button.type='button';
    button.textContent='Eski Cihaz Kayıtlarını Veritabanına Taşı';
    $('manageExportBackup').after(button);
    button.addEventListener('click',migrateLocalData);
    const backup=document.createElement('button');
    backup.type='button';backup.textContent='Eski Cihaz Yedeğini İndir (JSON)';
    button.after(backup);backup.addEventListener('click',exportLocalBackup);
    const sync=document.createElement('button');sync.type='button';
    sync.textContent='Merkezi Veritabanından Yenile';
    backup.after(sync);
    const logout=document.createElement('button');
    logout.type='button';logout.textContent='Bu Cihazda Yönetim Oturumunu Kapat';
    sync.after(logout);
    logout.addEventListener('click',async()=>{
      if(!confirm('Bu cihazdaki yönetim oturumu kapatılsın mı? Sonraki düzenlemede yeniden giriş gerekir.'))return;
      try{await logoutAdminSession();announce('Yönetim oturumu kapatıldı.','success');}
      catch(error){announce(error.message,'error');}
    });
    sync.addEventListener('click',async()=>{
      sync.disabled=true;
      try {await refresh();countsView();announce('Ürünler merkezi veritabanından yenilendi.','success');}
      catch(error){announce('Yenileme başarısız: '+error.message,'error');}
      finally{sync.disabled=false;}
    });
    $('manageNew').addEventListener('click',()=>editProduct());
    $('manageBulkDeactivate').addEventListener('click',bulkDeactivate);
    $('manageExportBackup').addEventListener('click',exportBackup);
    search.addEventListener('input',renderResults);
    $('manageCancel').addEventListener('click',showOverview);
    form.addEventListener('submit',event=>saveForm(event,false));
    $('manageSaveActivate').addEventListener('click',event=>saveForm(event,true));
    $('manageActivate').addEventListener('click',()=>updateStatus('activate'));
    $('manageDeactivate').addEventListener('click',()=>updateStatus('deactivate'));
    $('manageDelete').addEventListener('click',()=>updateStatus('delete'));
    $('manageRestore').addEventListener('click',()=>updateStatus('restore'));
    $('manageMainCategory').addEventListener('change',()=>syncCategories($('manageMainCategory').value));
    $('manageImage').addEventListener('input',()=>{
      const url=safeImageUrl($('manageImage').value);
      if(url)imagePreview(url);
    });
    $('manageImageFile').addEventListener('change',async event=>{
      if(!event.target.files?.[0])return;
      try{ uploadImage=await compressImage(event.target.files[0]);imagePreview(uploadImage);
        announce('Görsel küçültülüp hazırlandı.','success');}
      catch(error){announce(error.message,'error');}
    });
    $('manageScan').addEventListener('click',openManageScanner);
    $('passiveActivate').addEventListener('click',confirmSaleActivation);
    $('passiveEdit').addEventListener('click',()=>{
      if(!pendingSale)return;
      const product=pendingSale.product;pendingSale=null;activationDialog.close();
      if($('scanDialog').open)$('scanDialog').close();
      openManage(product);
    });
    $('passiveCancel').addEventListener('click',()=>{pendingSale=null;activationDialog.close();});
    activationDialog.addEventListener('close',()=>{pendingSale=null;});
  }
  attach();
  return {openManage,openNew:()=>{openManage();editProduct();},manageScannedBarcode,offerSaleActivation,render:countsView};
}
