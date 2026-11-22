import { MAIN_CATEGORY_ORDER,categoryArtwork } from './category-art.js';
import { productCategoryPath } from './category-menu.js';
import { parseLocaleNumber, safeImageUrl } from './normalize.js';
import { getLocalSnapshot, getManagedProductHistory, saveManagedProduct, initiallyDeactivateAll } from './idb.js';
import { fetchRemoteProducts, deactivateRemoteProducts, importRemoteProducts  ,logoutAdminSession } from './remote-products.js';
import { PRODUCT_STATUS, productStatus, isActive, countStatuses, nextProductStatus, priceWithVat } from './product-lifecycle.js';
import { verifyPassivePin } from './passive-auth.js';
import { prepareProductPhoto } from './product-photo.js';

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
export function createProductManager({state,serializeMutation,refresh,announce,channel,openManageScanner}) {
  let filter='active',selection=null,created=false,uploadImage='',pendingSale=null,pendingManualActivation=null;
  // A selected photo may still be encoding when the operator taps Save.
  // Keep that promise and its revision tied to the current edit form.
  let imageTask=null,imageError=null,imageRevision=0,savingProduct=false;
  let manageCategoryRoot='',manageCategorySub='',manageVisibleLimit=40;
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
      button.addEventListener('click',()=>{
        filter=key;manageCategoryRoot='';manageCategorySub='';manageVisibleLimit=40;search.value='';countsView();
      });
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
  const isPassiveList=()=>filter==='initial-inactive'||filter==='later-inactive';
  function countsView() { counts();renderResults(); }
  function drawCategoryNavigation(products) {
    const browser=$('manageCategoryBrowser'),grid=$('manageCategoryGrid');
    const active=isPassiveList()&&!search.value.trim()&&
      !state.catalogLoading&&!state.catalogError&&state.products.length>0;
    browser.hidden=!active;
    if(!active)return false;
    const entries=products.map(product=>({product,path:productCategoryPath(product)}));
    const back=$('manageCategoryBack');
    back.hidden=!manageCategoryRoot;
    back.onclick=()=>{
      if(manageCategorySub)manageCategorySub='';
      else manageCategoryRoot='';
      manageVisibleLimit=40;
      renderResults();
    };
    const heading=$('manageCategoryTitle');
    heading.textContent=manageCategorySub||manageCategoryRoot||'12 Ana Kategori';
    grid.replaceChildren();
    const listing=Boolean(manageCategorySub);
    if(listing){
      // A selected subcategory opens the regular product list below.
      browser.hidden=false;grid.hidden=true;
      return false;
    }
    grid.hidden=false;
    const counts=new Map(),subCounts=new Map();
    for(const entry of entries) {
      const [main,sub]=entry.path;
      if(!main)continue;
      counts.set(main,(counts.get(main)||0)+1);
      if(sub){
        const key=main+' > '+sub;
        subCounts.set(key,(subCounts.get(key)||0)+1);
      }
    }
    const choices=manageCategoryRoot?
      [...subCounts].filter(([path])=>path.startsWith(manageCategoryRoot+' > ')).map(([path,count])=>({path,count,name:path.split(' > ').at(-1)}))
      : MAIN_CATEGORY_ORDER.map(name=>({name,path:name,count:counts.get(name)||0}));
    for(const choice of choices) {
      const item=document.createElement('button');item.type='button';
      item.className='manage-category-tile';
      const illustration=document.createElement('img');
      illustration.alt='';illustration.decoding='async';illustration.loading='lazy';
      illustration.src=categoryArtwork(choice.path);
      const name=document.createElement('strong');name.textContent=choice.name;
      const count=document.createElement('small');
      count.textContent=choice.count.toLocaleString('tr-TR')+' pasif ürün';
      item.append(illustration,name,count);
      item.disabled=!choice.count;
      item.addEventListener('click',()=>{
        if(manageCategoryRoot)manageCategorySub=choice.name;
        else manageCategoryRoot=choice.name;
        manageVisibleLimit=40;
        renderResults();
      });
      grid.append(item);
    }
    if(!choices.length)grid.textContent='Bu kategoride pasif alt kategori bulunamadı.';
    return true;
  }
  function renderResults() {
    const q=search.value.trim().toLocaleLowerCase('tr-TR');
    results.replaceChildren();
    if(state.catalogLoading||state.catalogError||!state.products.length) {
      $('manageCategoryBrowser').hidden=true;
      $('manageResultCount').textContent=state.catalogLoading
        ? 'Merkezi ürünler yükleniyor: '+Number(state.catalogProgress||0).toLocaleString('tr-TR')+' / 19.096'
        : 'Merkezi ürünler yüklenemedi';
      results.textContent=state.catalogLoading
        ? 'Ürünler merkezi veritabanından alınıyor. Tamamlanınca listelenecek.'
        : (state.catalogError||'Ürünler henüz yüklenmedi. Merkezi Veritabanından Yenile düğmesini kullanın.');
      return;
    }
    const inStatus=state.products.filter(p=>productStatus(p)===filter);
    const browsing=drawCategoryNavigation(inStatus);
    if(browsing){
      $('manageResultCount').textContent=inStatus.length.toLocaleString('tr-TR')+' pasif ürün · Kategori seçiniz';
      return;
    }
    const matching=inStatus.filter(p=>{
      if(q)return [p.baslik,p.barkod,p.urunKodu,p.marka].some(v=>text(v).toLocaleLowerCase('tr-TR').includes(q));
      if(isPassiveList()&&manageCategoryRoot){
        const [main,sub]=productCategoryPath(p);
        return main===manageCategoryRoot&&sub===manageCategorySub;
      }
      return true;
    });
    $('manageResultCount').textContent=matching.length.toLocaleString('tr-TR')+' ürün';
    // Only the selected passive subcategory becomes the approved four-across
    // photo grid. Management overview, category tiles and other statuses stay as-is.
    const photoGrid=isPassiveList()&&Boolean(manageCategorySub)&&!q;
    results.classList.toggle('manage-photo-grid',photoGrid);
    for(const product of matching.slice(0,manageVisibleLimit)) {
      const button=document.createElement('button');button.type='button';
      if(photoGrid) {
        button.className='manage-product-card';
        button.setAttribute('aria-label',product.baslik+', '+(product.barkod||'barkodsuz')+', '+format(product.satisFiyati));
        const media=document.createElement('span');media.className='manage-product-photo';
        const placeholder=document.createElement('span');
        placeholder.className='manage-product-photo-empty';
        placeholder.textContent='▧';placeholder.setAttribute('aria-hidden','true');
        media.append(placeholder);
        const src=product.gorsel;
        if(src&&(src.startsWith('data:image/webp;base64,')||
          src.startsWith('data:image/png;base64,')||
          src.startsWith('data:image/jpeg;base64,')||safeImageUrl(src))) {
          const picture=document.createElement('img');picture.alt='';
          picture.loading='lazy';picture.decoding='async';
          picture.referrerPolicy='no-referrer';
          picture.src=src;
          picture.onerror=()=>picture.remove();
          media.append(picture);
        }
        const status=document.createElement('span');
        status.className='manage-product-badge';
        status.textContent='Pasif';
        media.append(status);
        const name=document.createElement('strong');
        name.className='manage-product-name';name.textContent=product.baslik;
        const barcode=document.createElement('small');
        barcode.className='manage-product-barcode';
        barcode.textContent=product.barkod||'Barkod yok';
        const price=document.createElement('b');
        price.className='manage-product-price';
        price.textContent=format(product.satisFiyati);
        button.append(media,name,barcode,price);
      } else {
        const body=document.createElement('span'),name=document.createElement('strong'),sub=document.createElement('small');
        name.textContent=product.baslik;
        sub.textContent=[product.barkod,format(product.satisFiyati)].filter(Boolean).join(' · ');
        body.append(name,sub);button.append(body);
        const mark=document.createElement('span');mark.textContent='›';button.append(mark);
      }
      button.addEventListener('click',()=>{
        if(productStatus(product)==='initial-inactive'||productStatus(product)==='later-inactive')
          offerManualActivation(product);
        else editProduct(product);
      });
      results.append(button);
    }
    if(!matching.length)results.textContent='Bu bölümde ürün bulunamadı.';
    if(matching.length>manageVisibleLimit){
      const more=document.createElement('button');
      more.type='button';more.className='manage-more-button';
      more.textContent='Daha Fazla Ürün Göster ('+
        Math.min(60,matching.length-manageVisibleLimit).toLocaleString('tr-TR')+' ürün)';
      more.addEventListener('click',()=>{
        manageVisibleLimit+=60;
        renderResults();
      });
      results.append(more);
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
    const url=source && (/^data:image\/(?:webp|jpeg|png);base64,/.test(source)?source:safeImageUrl(source));
    img.hidden=!url;
    if(url) img.src=url;
    else img.removeAttribute('src');
  }
  function imageStatus(message,state=''){
    const element=$('manageImageStatus');
    element.textContent=message;
    element.dataset.status=state;
  }
  function editProduct(product=null,barcode='') {
    imageRevision++;
    selection=product;created=!product;uploadImage='';
    imageTask=null;imageError=null;
    imageStatus('Fotoğraf seçebilirsiniz. Görsel kaydedilmeden önce hazırlanır.');
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
    imageRevision++;
    selection=null;created=false;uploadImage='';imageTask=null;imageError=null;
    form.hidden=true;$('manageOverview').hidden=false;results.hidden=false;
    countsView();
  }
  function openManage(product=null,barcode='') {
    search.value='';filter=product?productStatus(product):'active';
    manageCategoryRoot='';manageCategorySub='';manageVisibleLimit=40;
    if(!managementDialog.open)managementDialog.showModal();
    if(state.legacyPending)
      announce('Bu cihazdaki bazı eski ürün değişiklikleri henüz merkezde değil. Önce Eski Cihaz Yedeğini İndir, sonra Kayıtları Taşı.','error');
    if(product||barcode)editProduct(product,barcode);else showOverview();
  }
  function offerManualActivation(product) {
    pendingManualActivation=product;
    $('manageActivationName').textContent=product.baslik+' · '+(product.barkod||'');
    if(!$('manageActivationDialog').open)$('manageActivationDialog').showModal();
  }
  async function activateManualNow() {
    const product=pendingManualActivation;
    if(!product)return;
    const button=$('manageDirectActivate');button.disabled=true;
    try {
      const updated={...product,lifecycleStatus:'active',everActivated:true,source:'excel',
        statusChangedAt:now()};
      await persist(updated,'manual-activate');
      if(productStatus(state.byId.get(product.id))==='active') {
        pendingManualActivation=null;
        $('manageActivationDialog').close();
      }
    }finally{button.disabled=false;}
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
      // A successful product write is not sufficient: verify the photo that
      // the next phone or PC will actually read from central D1.
      if((action==='create'||action.startsWith('edit')) &&
         (verified.gorsel||'')!==(product.gorsel||''))
        throw Error('Ürün kaydedildi ancak fotoğraf merkezden doğrulanamadı. Sayfayı yenileyip yeniden deneyin.');
      channel?.postMessage('product-managed');
      // When activating from a passive subcategory, stay in that folder for
      // the next product instead of sending the operator to Active Products.
      if(!(product.lifecycleStatus==='active'&&isPassiveList()))
        filter=product.lifecycleStatus||'active';
      showOverview();
      announce('Ürün kaydedildi: '+statusLabels[product.lifecycleStatus||'active'],'success');
    } catch(error) { announce('İşlem başarısız: '+error.message,'error'); }
  }
  async function saveForm(event,activate=false) {
    event?.preventDefault?.();
    if(savingProduct)return;
    savingProduct=true;
    const saveButton=form.querySelector('button[type="submit"]');
    const activateButton=$('manageSaveActivate');
    saveButton.disabled=true;
    activateButton.disabled=true;
    try{
      if(imageTask){
        imageStatus('Seçilen fotoğrafın hazırlanması tamamlanıyor…','pending');
        await imageTask;
      }
      if(imageError){
        announce('Fotoğraf hazırlanamadı: '+imageError.message+' Başka bir fotoğraf seçin.','error');
        imageStatus('Fotoğraf hazırlanamadı. Yeniden seçin.','error');
        return;
      }
      // Do not silently create a photo-less product while a file is selected.
      if($('manageImageFile').files?.length && !uploadImage){
        announce('Seçilen fotoğraf hazırlanmadı. Görseli tekrar seçip kaydedin.','error');
        return;
      }
      const barcode=$('manageBarcodeInput').value.trim(),baslik=$('manageName').value.trim(),
        main=$('manageMainCategory').value,sub=$('manageSubCategory').value.trim();
      if(!baslik||!main||!sub||!barcode){announce('Barkod, ad, ana ve alt kategori gerekli.','error');return;}
      if(state.products.some(p=>p.barkod===barcode && p.id!==selection?.id)){
        announce('Bu barkod başka bir üründe kayıtlı.','error');return;
      }
      const priceString=$('managePrice').value.trim();
      const entered=parseLocaleNumber(priceString,NaN),vat=Number($('manageVat').value),
        excluded=$('manageVatExcluded').checked;
      if(!Number.isFinite(entered)||entered<0){announce('Geçerli satış fiyatı girin.','error');return;}
      const stockString=$('manageStock').value.trim(),stock=stockString?Number(stockString):0;
      if(!Number.isFinite(stock)||stock<0){announce('Stok miktarı geçersiz.','error');return;}
      const purchaseString=$('managePurchase').value.trim();
      const purchase=purchaseString?parseLocaleNumber(purchaseString,NaN):null;
      if(purchase!==null&&(!Number.isFinite(purchase)||purchase<0)){
        announce('Alış fiyatı geçersiz.','error');return;
      }
      const url=$('manageImage').value.trim();
      if(url&&!safeImageUrl(url)){announce('Geçerli HTTPS görsel adresi giriniz.','error');return;}
      const old=selection,finalStatus=activate?'active':old?.lifecycleStatus||'active';
      const updated={...(old||{}),id:old?.id||newId(),barkod:barcode,baslik,
        marka:$('manageBrand').value.trim(),alisFiyati:purchase,
        satisFiyati:priceWithVat(entered,vat,excluded).gross,
        girisFiyati:entered,kdv:vat,kdvBelirsiz:false,kdvExcluded:excluded,
        fiyatBelirsiz:false,stok:stock,stokBelirsiz:!stockString,
        birim:$('manageUnit').value,
        kategoriAna:main,kategoriAlt:sub,kategoriYolu:[main,sub],
        kategori:main+' > '+sub,kaynakKategori:main+' > '+sub,
        gorsel:$('manageRemoveImage').checked?'':uploadImage||url||old?.gorsel||'',
        lifecycleStatus:finalStatus,everActivated:old?.everActivated||activate,
        statusChangedAt:activate?now():old?.statusChangedAt,source:'excel',
        importFormat:'hizlisatis',
        paraBirimi:old?.paraBirimi||'TRY',urunKodu:old?.urunKodu||barcode,
        variantKey:old?.variantKey||barcode};
      if(uploadImage)imageStatus('Görsel merkezi veritabanına kaydediliyor…','pending');
      await persist(updated,old?'edit'+(activate?'-activate':''):'create');
    }finally{
      savingProduct=false;
      saveButton.disabled=false;
      activateButton.disabled=false;
    }
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
    search.addEventListener('input',()=>{manageVisibleLimit=40;renderResults();});
    $('manageCancel').addEventListener('click',showOverview);
    form.addEventListener('submit',event=>saveForm(event,false));
    $('manageSaveActivate').addEventListener('click',event=>saveForm(event,true));
    $('manageActivate').addEventListener('click',()=>{if(selection)offerManualActivation(selection);});
    $('manageDeactivate').addEventListener('click',()=>updateStatus('deactivate'));
    $('manageDelete').addEventListener('click',()=>updateStatus('delete'));
    $('manageRestore').addEventListener('click',()=>updateStatus('restore'));
    $('manageMainCategory').addEventListener('change',()=>syncCategories($('manageMainCategory').value));
    $('manageImage').addEventListener('input',()=>{
      const url=safeImageUrl($('manageImage').value);
      if(url)imagePreview(url);
    });
    $('manageImageFile').addEventListener('change',event=>{
      const file=event.target.files?.[0],revision=++imageRevision;
      uploadImage='';imageTask=null;imageError=null;
      if(!file){
        imageStatus('Fotoğraf seçilmedi.');
        return;
      }
      $('manageRemoveImage').checked=false;
      imageStatus('Fotoğraf hazırlanıyor… Kaydet düğmesi hazırlanmasını bekler.','pending');
      imageTask=(async()=>{
        try{
          const result=await prepareProductPhoto(file);
          if(revision!==imageRevision)return;
          uploadImage=result;
          imagePreview(result);
          imageStatus('Fotoğraf hazır. Kaydet ile merkezi veritabanına yüklenecek.','ready');
        }catch(error){
          if(revision!==imageRevision)return;
          imageError=error instanceof Error?error:Error(String(error));
          imageStatus('Görsel hazırlanamadı: '+imageError.message,'error');
          announce(imageError.message,'error');
        }
      })();
    });
    $('manageRemoveImage').addEventListener('change',event=>{
      if(!event.target.checked)return;
      imageRevision++;
      imageTask=null;imageError=null;uploadImage='';
      $('manageImageFile').value='';
      $('manageImage').value='';
      imagePreview('');
      imageStatus('Fotoğraf kaldırılacak. Kaydet ile onaylayın.','ready');
    });
    $('manageScan').addEventListener('click',openManageScanner);
    $('passiveActivate').addEventListener('click',confirmSaleActivation);
    $('manageUpdateActivate').addEventListener('click',()=>{
      const product=pendingManualActivation;pendingManualActivation=null;
      $('manageActivationDialog').close();
      if(product) {
        editProduct(product);
        announce('Bilgileri düzenleyip Kaydet ve Satışa Aç düğmesine basın.','success');
      }
    });
    $('manageDirectActivate').addEventListener('click',activateManualNow);
    $('manageCancelActivate').addEventListener('click',()=>{
      pendingManualActivation=null;$('manageActivationDialog').close();
    });
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
