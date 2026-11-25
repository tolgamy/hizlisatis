import {portraitReceiptHeight,portraitReceiptPage,useNativeReceipt107} from './receipt-portrait-v107.js';
import {setupOriginReview107} from './origin-review-v107.js';
import {createSaleScanner,installCategoryFit} from './sale-input-v106.js';
import {quoteMarkup} from './receipt-quote-v106.js';
import {setupProductExport} from './product-export-v100.js';
import {autoPrint,sendPrint,receiptRollPdf} from './local-print-v107.js';
import {pdfFromLabelJpegs} from './argox-pdf-v99.js';
// v99: Correct Argox label and use native 38x100 PDF printing; POS behavior preserved.
// v88: Pinned central-sales module avoids stale production exports and restores secure login.
import { getSnapshot, getLocalSnapshot, upsertExcelProducts, installBundledProducts, saveSale, getSales, restoreSalesBackup, openDB, saveManagedProduct } from './idb.js';
import { createDeviceBackup, parseDeviceBackup } from './device-backup.js';
import { readXlsxRows } from './xlsx-reader.js';
import { parseExcelProducts } from './excel-products.js';
import { parseLocaleNumber, safeImageUrl } from './normalize.js';
import { buildCategoryTree, categoryMatches, showCategoryInBrowse, productCategoryPath } from './category-menu.js';
import { MAIN_CATEGORY_ORDER, categoryArtwork, sortCategoryNodes } from './category-art.js';
import { subcategoryPhoto } from './subcategory-photos.js';
import { categoryOverrideUrl } from './category-image-overrides.js';
import { createCategoryImageManager } from './category-image-manager.js';
import { categorizeProduct, productPictureEmoji } from './catalog-taxonomy.js';
import { receiptAsText, escPosReceipt } from './receipt-share-v106.js';
import { receiptPdfBlob } from './receipt-pdf.js';
import { fetchBundledCatalog } from './bundled-catalog.js';
import { findBarcodeProduct } from './barcode-lookup.js';
import { applyProductImage, detectImageResizing } from './image-delivery.js';
import { isActive, productStatus } from './product-lifecycle.js';
import { getBarcodeLibrary, supportedBarcodeFormats, acceptsBarcodeResult, isRepeatScan, readScanHistory, rememberScan } from './barcode-scanner.js';
import { createProductManager } from './product-management-v99.js';
import {readPrinterProfiles,setupPrinterProfiles} from './printer-profiles-v99.js';
import {setupLabelQueue,addQueuedLabel} from './label-queue-v99.js';
import { createPriceLabelFeature,renderLabelImage } from './price-label-v106.js';
import { checkRemoteProductStates } from './remote-products.js';
import { createCustomerManager } from './customer-ui.js';
import { recordCustomerCredit } from './customer-api.js';
import { isCentralSalesEnabled,saveCentralSale,getSalesForReports,voidCentralSale } from './central-sales-v88.js';
import { filterReportSales,quickReportRange } from './report-filters.js';
import { readReceiptSettings,saveReceiptSettings,receiptPrintLayout,readReceiptAction,saveReceiptAction } from './receipt-settings-v106.js';
import { parseBasketDiscountPercent,calculateBasketTotals } from './basket-pricing.js';
import { readPickerMode,savePickerMode } from './picker-preferences.js';
import { next200Cash } from './cash-change.js';
import { isWeightProduct,scaleSupported,ScaleSerialConnection,parseManualGrams,scaleGramsToQuantity,calculateWeightTotal } from './scale-serial.js';
import { writeActiveProductsLocalStorage } from './active-products-cache.js';
import { requireAccess,authorizeCheckout,userCan } from './auth-ui.js';
import { sameProductRecord,prepareStockEdit } from './stock-editor.js';

const $ = id => document.getElementById(id);
const state = {
  products: [], byId: new Map(), byBarcode: new Map(), categoryProductPhotos: new Map(), lifecycleMeta: null, legacyPending: false,
  catalogLoading:true,catalogProgress:0,catalogError:'',centralReadOnly:false,
  sold: new Map(), cart: new Map(), basketDiscountPct:0, basketDiscountInvalid:false, category: '', brand: '',
  search: '', meta: null, sales: [], lastSale: null, pendingSale:null,
  saving: false, scanner: null, scanPurpose: 'sale',
  excelCount: 0, bundleCount: 0, bundleLoading: false, categoryPage: '', excelPreview: null, excelUploading: false, browseAll: false,
  view: 'home', catalogMode: 'categories', catalogEntry: 'categories', categoryTreeData: [], expandedProductCategory: '',
  productLayout: 'grid', stockOnly: false, sort: 'name', visibleLimit: 48, detailProduct: null, manageSelection: null,
  stockOverviewFilter:'all',stockOverviewLimit:60,previousWorkspaceHash:'#home'
};
const dom = {
  search: $('search'), productList: $('productList'), count: $('resultCount'),
  categoryTree: $('categoryTree'),
  cartDialog: $('cartDialog'), cartItems: $('cartItems'), totals: $('cartTotals'),
  cartCount: $('cartCount'), cartTotal: $('cartTotal'), cartItemLabel: $('cartItemLabel'),
  cash: $('cashReceived'), change: $('changeLabel'),
  credit: $('creditName'), complete: $('completeSale'),
  historyDialog: $('historyDialog'), historyItems: $('historyItems'),
  scanDialog: $('scanDialog'), scanMessage: $('scanMessage')
};
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('cep-pos-changes') : null;
let toastTimer,cartToastTimer;
let productManager,customerManager,pendingScanProduct=null,priceLabelFeature=null;
let weightProduct=null,scaleConnection=null,scaleLatest=null,scaleCapturedAt=0,weightInputMode='manual';
let weightFreshnessTimer=null;
let mutationQueue = Promise.resolve();
function serializeMutation(operation) {
  const next = mutationQueue.then(operation, operation);
  mutationQueue = next.catch(() => {});
  return next;
}
const money = (amount, currency = 'TRY') => {
  try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount); }
  catch { return `${Number(amount).toFixed(2)} ${currency}`; }
};
const round2 = number => Math.round((number + Number.EPSILON) * 100) / 100;
const fmtDate = value => new Date(value).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function announce(message, type = '') {
  const toast = $('toast'); toast.textContent = message; toast.className = `toast ${type}`;
  toast.hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3800);
}
/** Approved design #1: confirmation stays directly below the sticky search bar. */
function showCartConfirmation(product) {
  const banner=$('cartToast');
  $('cartToastText').textContent=product.baslik+' sepete eklendi.';
  banner.hidden=false;
  clearTimeout(cartToastTimer);
  cartToastTimer=setTimeout(()=>{banner.hidden=true;},2700);
}
/** Same category route can be tapped again to reload the product grid. */
function renderProductBreadcrumb(path, fallback) {
  const heading=$('browseHeading');
  heading.replaceChildren();
  if(!path) { heading.textContent=fallback;return; }
  if(useDesktopWorkspace()){renderDesktopBreadcrumb104(heading,path,false);return;}
  const parts=String(path).split(' > ').filter(Boolean);
  const labels=parts.map((name,index)=>({name,path:parts.slice(0,index+1).join(' > ')}));
  labels.forEach((part,index)=>{
    if(index){
      const separator=document.createElement('span');
      separator.className='catalog-breadcrumb-separator';
      separator.textContent='›';
      separator.setAttribute('aria-hidden','true');
      heading.append(separator);
    }
    const button=document.createElement('button');
    button.type='button';button.className='catalog-breadcrumb-button';
    button.textContent=part.name;
    button.title=part.name;
    if(index===labels.length-1)button.setAttribute('aria-current','page');
    // Main breadcrumb -> its children; current subcategory -> its products.
    button.addEventListener('click',()=>index===labels.length-1?
      selectCategory(part.path):openCategoryMenu(part.path));
    heading.append(button);
  });
}
function renderDesktopBreadcrumb104(heading,path,inCategoryBrowser){
  heading.replaceChildren();
  const parts=String(path||'').split(' > ').filter(Boolean);
  const root=document.createElement('button');root.type='button';root.className='catalog-breadcrumb-button';root.textContent='Ana Kategoriler';
  root.onclick=goMainCategories104;
  heading.append(root);
  for(let i=0;i<parts.length;i++){
    const sep=document.createElement('span');sep.className='catalog-breadcrumb-separator';sep.textContent='›';sep.setAttribute('aria-hidden','true');heading.append(sep);
    const node=document.createElement('button');node.type='button';node.className='catalog-breadcrumb-button';node.textContent=parts[i];node.title=parts[i];
    const target=parts.slice(0,i+1).join(' > '),last=i===parts.length-1;
    if(last){node.setAttribute('aria-current','page');node.onclick=()=>{};}
    else node.onclick=()=>{state.search='';dom.search.value='';$('categorySearch').value='';openCategoryMenu(target);};
    heading.append(node);
  }
}
function goMainCategories104(){
  state.category='';state.categoryPage='';state.expandedProductCategory='';state.search='';state.brand='';dom.search.value='';$('categorySearch').value='';
  openProductCategoryHome();
}
function fold(text) {
  return String(text ?? '').toLocaleLowerCase('tr-TR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim();
}
function remaining(product) { return product.stokBelirsiz ? Infinity : Math.max(0, product.stok - (state.sold.get(product.id) || 0)); }
function stockLabel(product) { return product.stokBelirsiz ? 'Stok takip edilmiyor' : (remaining(product) ? `Stok ${remaining(product)}` : 'Tükendi'); }
function priceLabel(product) { return product.fiyatBelirsiz ? 'Fiyat girilmedi' : money(product.satisFiyati, product.paraBirimi); }
function cartQty() { return [...state.cart.values()].reduce((sum, line) => sum + (line.weighed ? 1 : line.quantity), 0); }
function cartCurrency() { return state.cart.values().next().value?.product.paraBirimi || 'TRY'; }
function lineTotals(line) {
  const base = round2(line.quantity * line.unitPrice);
  const discounted = round2(base * line.discountPct / 100);
  const total = round2(base - discounted);
  const rate = Number(line.product.kdv) || 0;
  const vat = rate > 0 ? round2(total - total / (1 + rate / 100)) : 0;
  return { base, discounted, total, vat };
}
function totals() {
  const rows=[...state.cart.values()].map(line=>({
    ...lineTotals(line),vatRate:line.product.kdv
  }));
  return calculateBasketTotals(rows,state.basketDiscountPct);
}
function setConnection() {
  const el = $('connectionStatus');
  el.textContent = navigator.onLine ? '● Çevrimiçi' : '● Çevrimdışı';
  el.className = `connection ${navigator.onLine ? 'online' : 'offline'}`;
}
function setSyncStatus() {
  const count=state.products.length.toLocaleString('tr-TR');
  $('syncLabel').textContent = state.centralReadOnly ? count+' ürün · Salt okunur' :
    (state.bundleLoading ? 'Ürünler yükleniyor…' : count+' ürün');
  $('catalogSource').textContent = state.centralReadOnly
    ? count+' yerleşik ürün · Merkezi bağlantı yok, sadece görüntüleme'
    : `${count} ürün · Excel kataloğu${state.excelCount ? ` · ${state.excelCount} cihaz içi düzenleme` : ''}`;
}
function setCatalog(products, adjustments, meta, excelCount = 0, bundleCount = 0, lifecycleMeta = null, verified = true) {
  state.centralReadOnly = !verified;
  $('catalogNotice').hidden = verified;
  state.lifecycleMeta = lifecycleMeta;
  state.excelCount = excelCount;
  state.bundleCount = bundleCount;
  state.products = products;
  state.byId = new Map(products.map(product => [product.id, product]));
  state.byBarcode = new Map();
  for (const product of products) {
    if (product.barkod && !state.byBarcode.has(product.barkod.trim()))
      state.byBarcode.set(product.barkod.trim(), product);
  }
  state.sold = new Map(adjustments.map(item => [item.id, item.soldQuantity]));
  state.meta = meta;
  state.categoryTreeData = buildCategoryTree(products.filter(p => productStatus(p) !== 'deleted'));
  const picturePaths = new Map();
  for (const p of products) {
    if (!p.gorsel || productStatus(p) === 'deleted') continue;
    const segments = (p.kategoriYolu || []).filter(Boolean);
    for (let i=2; i<=segments.length; i++) {
      const key = segments.slice(0,i).join(' > ');
      if (!picturePaths.has(key)) picturePaths.set(key,p.gorsel);
    }
  }
  state.categoryProductPhotos = picturePaths;
  // Mirror only verified ACTIVE product records after every successful D1 refresh.
  // A localStorage write failure must not change the authoritative catalog.
  if (verified) writeActiveProductsLocalStorage(products);
  renderAll();
}

/** Desktop uses the same native section/page system as Home, Products,
 * Stock and Settings. Sale/Reports keep their ONE set of existing form controls.
 * Their nodes move between page sections and original mobile-only dialogs;
 * their listeners, input values and device data are preserved. */
const desktopWorkspaceMedia = '(min-width:1024px) and (min-height:600px) and (orientation:landscape) and (hover:hover) and (pointer:fine)';
function useDesktopWorkspace() {
  return window.matchMedia(desktopWorkspaceMedia).matches;
}
function isSaleActive() {
  return dom.cartDialog.open || (useDesktopWorkspace() && state.view==='sale');
}
function isReportsActive() {
  return dom.historyDialog.open || (useDesktopWorkspace() && state.view==='reports');
}
function placeNativeWorkspacePages() {
  const desktop=useDesktopWorkspace();
  for(const [dialog,section] of [[dom.cartDialog,$('saleView')],[dom.historyDialog,$('reportsView')]]) {
    const target=desktop?section:dialog;
    const source=desktop?dialog:section;
    if(source.childNodes.length)target.append(...Array.from(source.childNodes));
  }
}
function returnToPreviousWorkspace() {
  const previous=state.previousWorkspaceHash;
  return previous && !['#sale','#reports'].includes(previous)?previous:'#home';
}
function closeDesktopWorkspaceForNavigation() {
  // Unlike the old window overlays, these two page sections are hidden by
  // normal route navigation. No cart state is destroyed by a page change.
  if(useDesktopWorkspace()){
    if(dom.cartDialog.open)dom.cartDialog.close();
    if(dom.historyDialog.open)dom.historyDialog.close();
  }
}
/** Reuse the original cart-continue button in the desktop checkout stack.
 * The control is never cloned: all existing listeners and live totals survive.
 * Other pages and handheld views keep the existing bottom-bar placement. */
function placeCartContinueForViewport() {
  const button=$('openCart');
  const slot=$('desktopContinueSlot');
  const shell=document.querySelector('#app .bottom-shell');
  const nav=shell?.querySelector('.bottom-nav');
  if(!button||!slot||!shell||!nav)return;
  if(useDesktopWorkspace()&&state.view==='sale'){
    if(button.parentElement!==slot)slot.append(button);
  }else if(button.parentElement!==shell){
    shell.insertBefore(button,nav);
  }
}
/** Navigation and home dashboard never replace IndexedDB records. */
function updateNavigation() {
  const sale=isSaleActive(),reports=isReportsActive();
  document.body.classList.toggle('view-home', state.view==='home');
  document.body.classList.toggle('view-settings', state.view === 'settings');
  document.body.classList.toggle('view-stock', state.view==='stock');
  document.body.classList.toggle('view-sale', sale);
  document.body.classList.toggle('view-reports', reports);
  // Existing diagnostics and earlier UI modes use these classes; only
  // native pages (not dialogs) are rendered on desktop.
  document.body.classList.toggle('desktop-workspace', useDesktopWorkspace()&&(sale||reports));
  document.body.classList.toggle('desktop-sale-workspace', useDesktopWorkspace()&&sale);
  document.body.classList.toggle('desktop-reports-workspace', useDesktopWorkspace()&&reports);
  $('homeView').hidden = state.view !== 'home';
  $('catalogView').hidden = state.view !== 'catalog';
  $('settingsView').hidden = state.view !== 'settings';
  $('stockView').hidden = state.view !== 'stock';
  $('saleView').hidden=!useDesktopWorkspace()||state.view!=='sale';
  $('reportsView').hidden=!useDesktopWorkspace()||state.view!=='reports';
  $('sidebarStock').classList.toggle('active',state.view==='stock');
  if(state.view==='stock')$('sidebarStock').setAttribute('aria-current','page');
  else $('sidebarStock').removeAttribute('aria-current');
  $('sidebarReports').classList.toggle('active',reports);
  if(reports)$('sidebarReports').setAttribute('aria-current','page');
  else $('sidebarReports').removeAttribute('aria-current');
  const standardView = state.view==='catalog' ? 'products' : state.view;
  const active=sale?'sale':reports?'reports':standardView;
  for (const [id,value] of [['navHome','home'],['navSale','sale'],['navProducts','products'],['navSettings','settings']]) {
    const el=$(id),yes=active===value;
    el.classList.toggle('active',yes);
    if(yes)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  }
  placeCartContinueForViewport();
}
function navigate(hash) { if(location.hash!==hash) location.hash=hash; else applyRoute(); }
function applyRoute() {
  if(typeof closeDesktopWorkspaceForNavigation==='function')
    closeDesktopWorkspaceForNavigation();
  if(typeof placeNativeWorkspacePages==='function')placeNativeWorkspacePages();
  const desktop=typeof useDesktopWorkspace==='function' && useDesktopWorkspace();
  const fragment=decodeURIComponent(location.hash.slice(1));
  if(fragment==='sale' && desktop){
    state.view='sale';
    renderCart();
  } else if(fragment==='reports' && desktop){
    state.view='reports';
    if(!reportsPageLoaded)showHistory().catch(error=>announce('Rapor yüklenemedi: '+error.message,'error'));
  } else if(fragment==='sale' && !desktop){
    state.view='home';
    if(!dom.cartDialog.open)dom.cartDialog.showModal();
  } else if(fragment==='reports' && !desktop){
    state.view='home';
    if(!dom.historyDialog.open)showHistory().catch(error=>announce('Rapor yüklenemedi: '+error.message,'error'));
  } else if(fragment==='product-categories'){
    if(desktop){state.expandedProductCategory='';state.category='';state.brand='';state.search='';dom.search.value='';$('categorySearch').value='';}
    state.view='catalog';state.catalogMode='category-home';state.catalogEntry='products';state.categoryPage='';
  } else if (fragment.startsWith('categories')) {
    state.view='catalog';state.catalogMode='categories';state.catalogEntry='products';
    state.categoryPage=fragment.startsWith('categories/') ? fragment.slice('categories/'.length) : '';
    if(desktop){state.expandedProductCategory='';state.search='';dom.search.value='';$('categorySearch').value='';}
    renderCategoryTree();
  } else if (fragment.startsWith('products')) {
    state.view='catalog';state.catalogMode='products';state.browseAll=true;
    state.category=fragment.startsWith('products/') ? fragment.slice('products/'.length) : '';
    if(desktop&&state.category){state.search='';state.brand='';dom.search.value='';state.visibleLimit=48;}
  } else if (fragment==='settings') state.view='settings';
  else if (fragment==='stock') state.view='stock';
  else state.view='home';
  updateNavigation();renderProducts();
  // hashchange is asynchronous: focus the scanner only after the native Sale
  // section has become visible, so a USB barcode reader works immediately.
  if(state.view==='sale')focusSaleBarcode();
  if(state.view==='stock')renderStockOverview();
  if(state.view==='home'){
    if(typeof renderHomeStockInsights==='function')renderHomeStockInsights();
    refreshHomeSales().catch(()=>{});
  }
  window.scrollTo({top:0,behavior:'auto'});
}
function setView(view,showAll=false) {
  if(view==='home') navigate('#home');
  else if(view==='settings') navigate('#settings');
  else if(view==='catalog' && (showAll||state.search.trim())) navigate('#products');
  else if(view==='catalog') openProductCategoryHome();
}
/** Focus the real barcode entry so USB/Bluetooth scanners can send the next
 * EAN/UPC immediately, without a second tap. Do not steal focus from overlays.
 */
function focusSaleBarcode(){
  if(!(typeof isSaleActive==='function' ? isSaleActive() : dom.cartDialog.open) || $('receiptActionsDialog').open ||
     $('scanQuantityDialog').open || dom.scanDialog.open || $('pickProductDialog').open ||
     $('weightDialog').open || $('unknownBarcodeDialog')?.open) return;
  // A scan or sale action must not reopen the OS keyboard.
  if(document.activeElement===$('saleBarcode'))$('saleBarcode').blur();
}
function openSale({preferCamera=false}={}) {
  renderCart();
  const desktop=typeof useDesktopWorkspace==='function' && useDesktopWorkspace();
  if(desktop){
    placeNativeWorkspacePages();
    if(state.view!=='sale'){
      if(!['#sale','#reports'].includes(location.hash))state.previousWorkspaceHash=location.hash||'#home';
      navigate('#sale');
    }else updateNavigation();
  }else{
    if(typeof placeNativeWorkspacePages==='function')placeNativeWorkspacePages();
    if(!dom.cartDialog.open)dom.cartDialog.showModal();
    updateNavigation();
  }
  $('saleBarcode').value='';
  if(!preferCamera)focusSaleBarcode();
}
// A closed sale never destroys the cart unless the operator explicitly
// chooses to cancel the sale and clear it in the confirmation dialog.
let pendingSaleExitTarget='previous';
function finishSaleExit({discard=false}={}) {
  if($('saleExitDialog').open)$('saleExitDialog').close();
  if(discard) {
    state.cart.clear();
    state.basketDiscountPct=0;state.basketDiscountInvalid=false;
    $('basketDiscountPct').value='';$('basketDiscountError').hidden=true;
    state.pendingSale=null;
    dom.cash.value='';
    customerManager?.clearSelection();
    document.querySelector('input[name="payment"][value="Nakit"]').checked=true;
    $('basketDiscountPanel').hidden=true;
    $('checkoutDiscountToggle').setAttribute('aria-expanded','false');
    renderCartBar();renderCart();
  }
  if(dom.cartDialog.open)dom.cartDialog.close();
  if(pendingSaleExitTarget==='home')setView('home');
  else if(typeof useDesktopWorkspace==='function' && useDesktopWorkspace() && state.view==='sale')
    navigate(returnToPreviousWorkspace());
}
function requestSaleExit(target='previous') {
  if(state.saving)return;
  pendingSaleExitTarget=target==='home'?'home':'previous';
  if(!state.cart.size) {
    finishSaleExit({discard:false});
    return;
  }
  $('saleExitTitle').textContent=target==='cancel'?'Satışı iptal etmek istiyor musunuz?':'Satıştan çıkılsın mı?';
  if(!$('saleExitDialog').open)$('saleExitDialog').showModal();
}
let pickerMode='search',pickerCategoryMain='',pickerCategorySub='',pickerVisibleLimit=60;
function renderProductPicker({preserveScroll=false}={}) {
  const mode=pickerMode,query=fold($('pickProductSearch').value);
  const picker=$('pickProductDialog');
  const desktopPicker=window.matchMedia('(min-width:1024px) and (min-height:600px) and (orientation:landscape) and (any-pointer:fine), (min-width:1280px) and (min-height:600px) and (orientation:landscape)').matches;
  picker.dataset.mode=mode;picker.dataset.level=mode!=='categories'?'products':!pickerCategoryMain?'root':!pickerCategorySub?'sub':'products';
  const eligible=state.products.filter(p=>isActive(p)&&remaining(p)>0&&!p.fiyatBelirsiz);
  const target=$('pickProductResults'),browser=$('pickerCategoryBrowser'),grid=$('pickerCategoryGrid');
  const more=$('pickerLoadMore');
  const oldScroll=preserveScroll?target.scrollTop:0;
  target.replaceChildren();grid.replaceChildren();more.hidden=true;
  target.hidden=true;grid.hidden=true;grid.scrollTop=0;
  $('pickProductSearchWrap').hidden=mode==='categories';
  document.querySelectorAll('[data-picker-mode]').forEach(button=>
    button.setAttribute('aria-pressed',String(button.dataset.pickerMode===mode)));
  browser.hidden=true;
  let items=[];
  if(mode==='categories'){
    browser.hidden=false;
    $('pickerCategoryBack').hidden=!pickerCategoryMain;
    $('pickerCategoryTitle').textContent=pickerCategorySub&&pickerCategorySub!=='*'?
      pickerCategoryMain+' / '+pickerCategorySub:pickerCategoryMain||'12 Ana Kategori';
    // Use the very same category projection and illustrations as the catalog.
    const roots=sortCategoryNodes(buildCategoryTree(eligible));
    const root=roots.find(node=>node.name===pickerCategoryMain);
    let choices=[];
    if(!pickerCategoryMain)choices=desktopPicker?MAIN_CATEGORY_ORDER.map(name=>roots.find(n=>n.name===name)||{name,path:name,count:0,children:[]}):roots;
    else if(!pickerCategorySub){
      choices=root?.children||[];
      if(root)choices=[{name:'Tüm '+root.name+' Ürünleri',path:root.path,count:root.count,all:true},...choices];
    }
    if(!pickerCategoryMain||!pickerCategorySub){
      grid.hidden=false;
      for(const node of choices){
        const button=document.createElement('button');button.type='button';button.className='picker-category-tile';
        const art=document.createElement('img');art.alt='';art.loading='lazy';art.decoding='async';
        if(desktopPicker){art.src=categoryCover(node.path);art.onerror=()=>{art.onerror=null;art.src=categoryArtwork(node.path);};}else art.src=categoryArtwork(node.path);
        const label=document.createElement('strong');label.textContent=node.name;
        const count=document.createElement('small');count.textContent=node.count.toLocaleString('tr-TR')+' ürün';
        button.append(art,label,count);
        button.addEventListener('click',()=>{
          if(!pickerCategoryMain){pickerCategoryMain=node.name;if(!node.children?.length)pickerCategorySub='*';}
          else pickerCategorySub=node.all?'*':node.name;
          pickerVisibleLimit=60;renderProductPicker();
        });
        grid.append(button);
      }
      if(!choices.length)grid.textContent='Bu kategoride ürün bulunamadı.';
      return;
    }
    const path=pickerCategorySub==='*'?pickerCategoryMain:pickerCategoryMain+' > '+pickerCategorySub;
    items=eligible.filter(p=>categoryMatches(p,path));
  }else{
    items=eligible.filter(p=>!query||
      [p.baslik,p.barkod,p.urunKodu,p.marka].some(v=>fold(v).includes(query)));
  }
  target.hidden=false;
  for(const product of items.slice(0,pickerVisibleLimit)){
    const button=document.createElement('button');button.className='picker-product';button.type='button';
    let pic;
    if(product.gorsel){pic=document.createElement('img');applyProductImage(pic,product.gorsel,192);}
    else{pic=document.createElement('span');pic.className='picker-emoji';pic.textContent=productPictureEmoji(product);}
    const name=document.createElement('span');name.textContent=product.baslik;name.title=product.baslik;
    const price=document.createElement('strong');price.textContent=priceLabel(product);
    button.append(pic,name,price);
    button.addEventListener('click',()=>{
      if(isWeightProduct(product)){$('pickProductDialog').close();openWeightProduct(product);}
      else if(addToCart(product)){$('pickProductDialog').close();openSale();}
    });
    target.append(button);
  }
  if(!items.length)target.textContent='Ürün bulunamadı';
  more.hidden=items.length<=pickerVisibleLimit;
  if(!more.hidden)more.textContent='Daha Fazla Ürün Göster ('+
    (items.length-pickerVisibleLimit).toLocaleString('tr-TR')+' kaldı)';
  target.scrollTop=oldScroll;
}
function openProductPicker(initialQuery=''){
  const query=typeof initialQuery==='string'?initialQuery:'';
  $('pickProductSearch').value=query;
  pickerMode=query.trim()?'search':readPickerMode();
  pickerCategoryMain='';pickerCategorySub='';pickerVisibleLimit=60;
  renderProductPicker();
  if(!$('pickProductDialog').open)$('pickProductDialog').showModal();
  // Tap the input for manual search.
}
function openCamera() {
  state.scanPurpose = 'sale';
  unlockScanAudio(); // user gesture unlocks iPhone audio before scan event callback
  $('scanHistoryPanel').hidden=true;
  $('scannerView').hidden=false;
  dom.scanDialog.classList.remove('is-success');
  if (!dom.scanDialog.open) dom.scanDialog.showModal();
  startScanner();
}
function selectScannedQuantity(product,sourceInput=null,resumeCamera=false) {
  if(!product)return;
  pendingScanProduct={product,sourceInput,resumeCamera};
  const weighted=['kg','g','litre'].includes(product.birim);
  $('scanQuantityProduct').textContent=product.baslik+' · '+money(product.satisFiyati,product.paraBirimi);
  const input=$('scanQuantityInput');
  input.min=weighted?'0.001':'1';input.step=weighted?'0.1':'1';input.value='1';
  if(dom.scanDialog.open){
    dom.scanDialog.close();
    // Immediately invalidate the old camera session. The dialog 'close' event
    // can fire later, after the next camera has already opened.
    stopScanner();
  }
  if(!$('scanQuantityDialog').open)$('scanQuantityDialog').showModal();
  // Tap the quantity input for manual entry.
}
/** Scale product is selected on any device; Windows can choose a COM port,
 * tablets and phones only use manually entered integer grams.
 */
function clearWeightFreshnessTimer(){
  if(weightFreshnessTimer!==null)clearTimeout(weightFreshnessTimer);
  weightFreshnessTimer=null;
}
function invalidateAutoWeight(message='Teraziden yeni sabit ağırlık bekleniyor…'){
  clearWeightFreshnessTimer();
  scaleLatest=null;scaleCapturedAt=0;
  $('weightLive').textContent='— kg';
  if(weightInputMode==='serial'&&$('weightDialog').open){
    $('weightGrams').value='';
    renderWeightPreview();
  }
  if($('weightDialog').open)$('weightSerialStatus').textContent=message;
}
function renderWeightPreview(){
  if(!weightProduct)return;
  const product=weightProduct,unit=product.birim;
  const val=$('weightGrams').value;
  try{
    const grams=parseManualGrams(val);
    const qty=scaleGramsToQuantity(grams,unit);
    const total=calculateWeightTotal(grams,product.satisFiyati,unit);
    $('weightQuantityPreview').textContent=
      unit==='kg'?qty.toLocaleString('tr-TR',{minimumFractionDigits:3,maximumFractionDigits:3})+' kg':grams+' g';
    $('weightTotalPreview').textContent=money(total,product.paraBirimi);
    $('weightAdd').disabled=false;
    $('weightError').hidden=true;
  }catch{
    $('weightQuantityPreview').textContent='—';
    $('weightTotalPreview').textContent='—';
    $('weightAdd').disabled=true;
  }
}
function openWeightProduct(product){
  if(!product||!isWeightProduct(product))return;
  if(state.centralReadOnly||!isActive(product)||product.fiyatBelirsiz||remaining(product)<=0){
    announce('Tartılı ürün şu an satışa uygun değil.','error');return;
  }
  if(dom.scanDialog.open){dom.scanDialog.close();stopScanner();}
  if($('pickProductDialog').open)$('pickProductDialog').close();
  clearWeightFreshnessTimer();
  weightProduct=product;scaleLatest=null;scaleCapturedAt=0;
  // Windows defaults to automatic live reading, while phones/tablets and
  // manual edits use the exact grams entered by the cashier.
  weightInputMode=scaleSupported()?'serial':'manual';
  $('weightProductName').textContent=product.baslik;
  $('weightUnitPrice').textContent=(product.birim==='kg'?'KG':'Gram')+
    ' fiyatı: '+money(product.satisFiyati,product.paraBirimi);
  $('weightGrams').value='';
  $('weightLive').textContent='— kg';
  $('weightError').hidden=true;
  const supported=scaleSupported();
  $('weightSerialPanel').hidden=!supported;
  $('weightConnectionState').textContent=scaleConnection?.connected?'Bağlı':'Bağlı değil';
  $('weightConnect').disabled=Boolean(scaleConnection?.connected);
  $('weightDisconnect').disabled=!scaleConnection?.connected;
  $('weightSerialStatus').textContent=scaleConnection?.connected?
    'Sabit ağırlık bekleniyor.':
    'Terazi bağlı değil; bağlantı ayarını açın.';
  $('weightHelp').textContent=supported?'Otomatik veya elle giriş.':'Gramajı elle girin.';
  $('weightConnectionDetails').open=false;
  renderWeightPreview();
  if(!$('weightDialog').open)$('weightDialog').showModal();
  // Manual grams remain available without automatic keyboard focus.
}
function confirmWeight(){
  // A successful click closes the dialog; late/double taps cannot add again.
  if(!weightProduct||!$('weightDialog').open)return;
  const product=weightProduct;
  let grams,quantity;
  try{
    grams=parseManualGrams($('weightGrams').value);
    quantity=scaleGramsToQuantity(grams,product.birim);
    if(weightInputMode==='serial'&&(
      !scaleConnection?.connected || !scaleLatest || !scaleCapturedAt ||
      Date.now()-scaleCapturedAt>5000 || scaleLatest.grams!==grams ||
      scaleLatest.at!==scaleCapturedAt))
      throw Error('Teraziden güncel sabit ağırlık bekleniyor. Gerekirse gramajı elle girin.');
  }catch(error){
    $('weightError').textContent=error.message;
    $('weightError').hidden=false;
    return;
  }
  if(!addToCart(product,quantity,{separate:true,grams}))return;
  $('weightDialog').close();
  openSale();
}
/** Every decoded barcode is a single deliberate add. Duplicates are ignored,
 * including the same product reread after the scanner's cooldown. Quantities
 * can still be changed using the basket's + / - editor.
 */
function addBarcodeOnce(product,sourceInput=null){
  const reset=()=>{
    if(sourceInput)sourceInput.value='';
    $('saleBarcode').value='';
    $('scanManualBarcode').value='';
    if(dom.scanDialog.open){
      dom.scanDialog.close();
      stopScanner();
    }
    focusSaleBarcode();
  };
  if(isWeightProduct(product)){
    reset();
    openWeightProduct(product);
    return true;
  }
  if(state.cart.has(product.id)){
    announce('Ürün zaten sepette. Adedi sepetten + / − ile artırabilirsiniz.','error');
    reset();
    return false;
  }
  const added=addToCart(product,1);
  if(added)reset();
  return added;
}
// Unknown barcode means there is NO product record; zero stock never blocks a sale.
let unknownBarcodeValue='';
function looksLikeBarcode(code){
  return /^(?:[0-9]{6,24}|(?=.*[0-9])[A-Za-z0-9._-]{6,64})$/.test(code);
}
function promptUnknownBarcode(raw){
  const code=String(raw??'').trim();
  if(!code||code.length>128)return false;
  const dialog=$('unknownBarcodeDialog');
  if(dialog.open)return true;
  unknownBarcodeValue=code;
  $('unknownBarcodeValue').textContent='Barkod: '+code;
  if(dom.scanDialog.open){dom.scanDialog.close();stopScanner().catch(()=>{});}
  dialog.showModal();
  return true;
}
function resolveUnknownBarcode(create){
  const code=unknownBarcodeValue;
  unknownBarcodeValue='';
  const dialog=$('unknownBarcodeDialog');
  if(dialog.open)dialog.close();
  $('saleBarcode').value='';
  $('scanManualBarcode').value='';
  if(create&&code){
    if(state.centralReadOnly||!userCan('products')){
      announce('Yeni ürün eklemek için merkezi bağlantı ve ürün düzenleme yetkisi gerekli.','error');
      focusSaleBarcode();
      return;
    }
    productManager.openNew(code);
  }else focusSaleBarcode();
}
function barcodeAdd(raw,sourceInput){
  const code=String(raw??'').trim();
  if(!code)return false;
  const product=exactProduct(code);
  if(!product){
    if(looksLikeBarcode(code))return promptUnknownBarcode(code);
    return false; // Searches with product names still use the product picker.
  }
  if(state.cart.has(product.id)){addBarcodeOnce(product,sourceInput);return true;}
  if(productManager?.offerSaleActivation(product,active=>addBarcodeOnce(active,sourceInput)))return true;
  return addBarcodeOnce(product,sourceInput);
}
/** USB/Bluetooth scanners (Enter, Tab or complete numeric code): add one SKU,
 * never re-increment a line that is already in the basket.
 */
function addHardwareBarcode(raw,sourceInput){
  const code=String(raw??'').trim();
  if(!code)return false;
  return barcodeAdd(code,sourceInput);
}

function categoryEmoji(path) {
  const name = fold(path);
  if (/sut|süt|kahvalt|peynir|yogurt/.test(name)) return '🥛';
  if (/icecek|içecek|su|kahve|cay|çay/.test(name)) return '🥤';
  if (/cikolata|çikolata|atistir|atıştır/.test(name)) return '🍫';
  if (/meyve|sebze|manav/.test(name)) return '🥬';
  if (/firin|fırın|ekmek/.test(name)) return '🥐';
  if (/temiz|ev bakim|çamaşır/.test(name)) return '🧼';
  if (/et|kasap|tavuk|balik|balık/.test(name)) return '🥩';
  if (/bebek/.test(name)) return '🍼';
  if (/dondur/.test(name)) return '🍦';
  if (/pet|hayvan/.test(name)) return '🐾';
  if (/kozmetik|kisisel|kişisel|saglik|sağlık/.test(name)) return '🧴';
  if (/elektronik/.test(name)) return '🔌';
  return '🛍️';
}
function originalCategoryCover(path) {
  // Immutable first-install art, available again whenever an override is reset.
  return path.includes(' > ')?(subcategoryPhoto(path)||categoryArtwork(path)):categoryArtwork(path);
}
function categoryCover(path) {
  return categoryOverrideUrl(path)||originalCategoryCover(path);
}
function categoryTile(node, hasChildren = false) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'photo-category-tile';
  button.dataset.categoryPath = node.path;
  button.setAttribute('aria-label', `${node.name}, ${node.count} ürün`);
  button.title = node.name;
  const photo = document.createElement('span'); photo.className = 'photo-category-image';
  const fallback = document.createElement('span'); fallback.className = 'photo-category-fallback';
  fallback.textContent = categoryEmoji(node.path); photo.append(fallback);
  const url = categoryCover(node.path);
  const original = originalCategoryCover(node.path);
  if(url) {
    // When a custom photo cannot load, the original image remains underneath.
    // A failed network request must not leave the category blank.
    if(url!==original && original) {
      const backup = document.createElement('img');
      backup.alt = '';
      applyProductImage(backup,original,320,'high');
      photo.append(backup);
    }
    const img = document.createElement('img');
    img.alt = '';
    applyProductImage(img,url,320,'high');
    photo.append(img);
  }
  if (node.path.includes(' > '))photo.classList.add('photo-subcategory-image');
  if (hasChildren) {
    const badge = document.createElement('span');
    badge.className = 'photo-category-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = '›';
    photo.append(badge);
  }
  if(node.path===state.category)button.classList.add('is-return-target');
  const name = document.createElement('span');
  name.className = 'photo-category-name';
  name.textContent = node.name;
  button.append(photo, name);
  button.addEventListener('click', () => {
    // v105: desktop Products main cards open a dedicated category route.
    // The mobile route and existing product/category data remain unchanged.
    if(hasChildren && !node.path.includes(' > ') &&
       state.view==='catalog' && state.catalogMode==='category-home' &&
       useDesktopWorkspace()) {
      state.expandedProductCategory='';
      state.search='';dom.search.value='';$('categorySearch').value='';
      openCategoryMenu(node.path);
      return;
    }
    hasChildren ? openCategoryMenu(node.path) : selectCategory(node.path);
  });
  return button;
}
/** The desktop category landing page is a single workspace: each of the
 * twelve main cards expands its actual D1-backed subcategories in place.
 * Never build example categories or change the underlying product dataset. */
function renderInlineProductSubcategories() {
  const panel=$('productSubcategoriesPanel');
  const list=$('productSubcategoryList');
  const root=state.categoryTreeData.find(node=>node.path===state.expandedProductCategory);
  const children=root?sortCategoryNodes(root.children.filter(showCategoryInBrowse),root.path):[];
  // v105: the legacy inline panel is retired; retain its DOM for compatibility.
  const visible=false;
  panel.hidden=!visible;
  for(const tile of $('homeCategoryShortcuts').querySelectorAll('.photo-category-tile')) {
    const selected=visible&&tile.dataset.categoryPath===state.expandedProductCategory;
    tile.classList.toggle('is-inline-selected',selected);
    tile.removeAttribute('aria-controls');
    tile.removeAttribute('aria-expanded');
  }
  list.replaceChildren();
  if(!visible)return;
  $('productSubcategoriesTitle').textContent=root.name+' Alt Kategorileri';
  $('productSubcategoriesCount').textContent=children.length.toLocaleString('tr-TR')+' alt kategori';
  $('productSubcategoriesAll').textContent=root.name+' – Tüm Ürünleri Gör';
  for(const child of children) list.append(categoryTile(child,false));
}
function toggleProductInlineCategory(path) {
  state.expandedProductCategory='';
  openCategoryMenu(path);
}
function renderHomeStockInsights(){
  $('homeRecentSalesCard').hidden=!userCan('reports');
  const stock=state.products.filter(isActive).map(p=>({p,...stockState(p)}))
    .filter(item=>item.status==='empty'||item.status==='low')
    .sort((a,b)=>a.stock-b.stock||a.p.baslik.localeCompare(b.p.baslik,'tr'));
  $('homeStockInsightCount').textContent=stock.length.toLocaleString('tr-TR')+
    ' üründe stok az veya bitmiş';
  const list=$('homeStockInsightList');list.replaceChildren();
  if(!stock.length){
    const item=document.createElement('li');
    item.textContent=state.products.length?
      'Stoku 5 ve altında ürün bulunmuyor.':'Ürün ve stok verileri henüz yüklenmedi.';
    list.append(item);return;
  }
  for(const entry of stock.slice(0,5)){
    const li=document.createElement('li');
    const title=document.createElement('span');title.textContent=entry.p.baslik;
    const value=document.createElement('strong');value.textContent=entry.label;
    li.append(title,value);list.append(li);
  }
}
function renderHomeRecentSales(sales){
  const card=$('homeRecentSalesCard');
  card.hidden=!userCan('reports');
  if(card.hidden)return;
  const list=$('homeRecentSalesList');list.replaceChildren();
  const recent=sales.filter(s=>s&&!s.voided&&s.createdAt&&
    Number.isFinite(Number(s.total))&&
    Number.isFinite(new Date(s.createdAt).getTime()))
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,5);
  if(!recent.length){
    const li=document.createElement('li');
    li.textContent='Bu cihazda henüz tamamlanmış satış yok.';
    list.append(li);return;
  }
  for(const sale of recent){
    const row=document.createElement('li');
    const date=document.createElement('span');date.textContent=fmtDate(sale.createdAt);
    const price=document.createElement('strong');
    price.textContent=money(Number(sale.total),sale.currency||'TRY');
    row.append(date,price);list.append(row);
  }
}
// Scale long live totals to their actual mobile card width, not to mockup data.
// CSS gives normal amounts the largest readable size; only overflow is reduced.
function fitHomeMetricNumbers() {
  const mobile=window.matchMedia('(max-width:679px)').matches;
  for(const id of ['homeTodaySales','homeTotalProducts']) {
    const element=$(id);
    if(!element)continue;
    element.style.removeProperty('font-size');
    if(!mobile||!element.clientWidth)continue;
    let size=Number.parseFloat(window.getComputedStyle(element).fontSize);
    let steps=0;
    while(element.scrollWidth>element.clientWidth+1&&size>10&&steps++<40) {
      size=Math.max(10,size-0.5);
      element.style.fontSize=`${size}px`;
    }
  }
}
window.addEventListener('resize',fitHomeMetricNumbers);

function renderHome() {
  // Both devices display the SAME twelve categories from the one D1-backed
  // category tree. CSS switches from mobile Products to desktop Home; no
  // duplicate catalog or second product set is created.
  const target=$('homeCategoryShortcuts');
  const desktop=$('desktopHomeCategoryGrid');
  target.replaceChildren();desktop.replaceChildren();
  for(const node of sortCategoryNodes(state.categoryTreeData)) {
    const hasChildren=Boolean(node.children.length);
    target.append(categoryTile(node,hasChildren));
    const card=categoryTile(node,hasChildren);
    const arrow=document.createElement('span');
    arrow.className='desktop-home-chevron';
    arrow.textContent='›';
    arrow.setAttribute('aria-hidden','true');
    card.append(arrow);
    desktop.append(card);
  }
  renderInlineProductSubcategories();
  // A deleted record should not inflate the central catalogue count.
  $('homeTotalProducts').textContent=state.products.length?
    state.products.filter(product=>productStatus(product)!=='deleted').length.toLocaleString('tr-TR'):'—';
  fitHomeMetricNumbers();
}
let homeSalesReadId=0;
async function refreshHomeSales() {
  // Sales are stored in this device's IndexedDB, not in a central sales table.
  // Never fabricate mockup values or count another device's transactions.
  const requestId=++homeSalesReadId;
  $('homeTodaySales').textContent='…';
  try {
    const {sales,central}=await getSalesForReports(getSales);
    if(requestId!==homeSalesReadId)return;
    const homeNote=document.querySelector('#homeTodaySalesButton small');
    if(homeNote)homeNote.textContent=central?'Tüm cihazların merkezi satışları':'Bu cihazdaki satışlar';
    const recentNote=document.querySelector('#homeRecentSalesCard .home-insight-heading span');
    if(recentNote)recentNote.textContent=central?'Merkezi satışlar':'Yalnızca bu cihaz';
    const today=new Date().toDateString();
    const amount=sales.reduce((sum,sale)=>{
      if(sale.voided)return sum;
      const date=new Date(sale.createdAt);
      return Number.isFinite(date.getTime()) && date.toDateString()===today &&
        (!sale.currency||sale.currency==='TRY')&&Number.isFinite(Number(sale.total))
        ? sum+Number(sale.total):sum;
    },0);
    $('homeTodaySales').textContent=money(round2(amount),'TRY');
    fitHomeMetricNumbers();
    if(typeof renderHomeRecentSales==='function')renderHomeRecentSales(sales);
  } catch {
    if(requestId===homeSalesReadId)$('homeTodaySales').textContent='—';
    fitHomeMetricNumbers();
  }
}
function openProductDetail(product) {
  state.detailProduct = product;
  const img = $('detailImage'); $('detailEmoji').textContent=productPictureEmoji(product);
  img.hidden=!product.gorsel; img.onerror=()=>{img.hidden=true;};
  if(product.gorsel)applyProductImage(img,product.gorsel,800,'high');
  $('detailBrand').textContent = [product.marka, product.kategori].filter(Boolean).join(' · ');
  $('detailName').textContent = product.baslik;
  $('detailBarcode').textContent = `Barkod: ${product.barkod || '—'}  ·  SKU: ${product.urunKodu || '—'}`;
  $('detailMeta').textContent = 'Stok kontrolü olmadan satış yapılır';
  $('detailPrice').textContent = priceLabel(product);
  $('detailAdd').disabled = state.centralReadOnly || !isActive(product) || product.fiyatBelirsiz;
  $('productDetailDialog').showModal();
}

/** Install data from the user's supplier export on every device automatically.
 * User edits in IndexedDB remain authoritative over bundled rows.
 */
async function installBuiltInCatalog() {
  if (state.bundleLoading) return;
  state.bundleLoading = true;
  try {
    const { version, products } = await fetchBundledCatalog();
    const result = await serializeMutation(() => installBundledProducts(products, version));
    if (result.installed) {
      const snapshot = await getSnapshot();
      setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta,
        snapshot.excelCount, snapshot.bundleCount, snapshot.lifecycleMeta);
      channel?.postMessage('bundled-catalog-updated');
      if (snapshot.products.length) announce(`${products.length.toLocaleString('tr-TR')} yerleşik ürün ve görsel adresleri hazır.`, 'success');
    }
  } catch (error) {
    console.warn('Built-in catalogue unavailable:', error);
    if (!state.products.length) announce('Katalog veya merkezi ürün veritabanı açılamadı. D1 bağlantısını kontrol edin.', 'error');
  } finally { state.bundleLoading = false; }
}

function openCategoryMenu(path = '') {
  navigate('#categories'+(typeof path==='string'&&path ? '/'+encodeURIComponent(path) : ''));
}
function openProductCategoryHome() {
  state.catalogEntry='products';
  navigate('#product-categories');
}
function openCategoryBrowser() {
  // Category search is available in the nested Products browser; it is no
  // longer a duplicated fifth bottom-navigation destination.
  state.catalogEntry='products';
  openCategoryMenu();
}
function selectCategory(path) {
  state.category=path; state.brand='';state.browseAll=true;state.visibleLimit=48;
  state.search='';dom.search.value='';
  navigate('#products/'+encodeURIComponent(path));
}
function showAllProducts() {
  state.category='';state.brand='';state.browseAll=true;state.visibleLimit=48;
  state.search='';dom.search.value='';navigate('#products');
}
function renderCategoryTree(search = '') {
  const target=dom.categoryTree;target.replaceChildren();
  const all=[];
  const visit=nodes=>{for(const node of nodes){all.push(node);visit(node.children);}};
  visit(state.categoryTreeData);
  const current=all.find(x=>x.path===state.categoryPage);
  const term=fold(search);
  const baseVisible = term ? all.filter(x=>fold(x.path).includes(term)).slice(0,100) : (current?current.children:state.categoryTreeData);
  const visible = sortCategoryNodes(baseVisible.filter(showCategoryInBrowse), current?.path || '');
  if(useDesktopWorkspace())renderDesktopBreadcrumb104($('categoryTrailName'),current?.path||'',true);
  else $('categoryTrailName').textContent=current?.path||'Kategoriler';
  $('categoryBack').hidden=!current&&!useDesktopWorkspace();
  for(const node of visible) target.append(categoryTile(node,!term&&node.children.length>0));
  if(!visible.length) target.innerHTML='<p class="clean-empty">Kategori bulunamadı</p>';
  $('categoryAllProducts').textContent=current ? 'Bu Kategorideki Ürünler' : 'Tüm Ürünler';
}
function renderFilters() { /* Category tiles provide the primary filter; no oversized brand drawer. */ }
function renderProducts() {
  $('categoryBrowser').hidden=state.catalogMode==='products';
  $('catalogCategoryNavigator').hidden=state.catalogMode!=='categories';
  $('productCategoryHome').hidden=state.catalogMode!=='category-home';
  $('productResults').hidden=state.catalogMode!=='products';
  renderInlineProductSubcategories();
  if(state.view!=='catalog'||state.catalogMode!=='products') return;
  const query=fold(state.search);
  const items=state.products.filter(p=>{
    if(!isActive(p))return false;
    if(query)return [p.barkod,p.urunKodu,p.baslik,p.marka].some(v=>fold(v).includes(query));
    return (!state.category||categoryMatches(p,state.category))&&(!state.brand||p.marka===state.brand);
  });
  items.sort((a,b)=>{
    if(state.sort==='price-low')return a.satisFiyati-b.satisFiyati||a.baslik.localeCompare(b.baslik,'tr');
    if(state.sort==='price-high')return b.satisFiyati-a.satisFiyati||a.baslik.localeCompare(b.baslik,'tr');
    return a.baslik.localeCompare(b.baslik,'tr');
  });
  renderProductBreadcrumb(state.category,query?'Arama Sonuçları':'Ürünler');
  dom.count.textContent=items.length.toLocaleString('tr-TR');
  for(const [id,mode] of [['viewGrid','grid'],['viewList','list']]) {
    $(id).setAttribute('aria-pressed',String(state.productLayout===mode));$(id).classList.toggle('active',state.productLayout===mode);
  }
  $('onlyInStock').setAttribute('aria-pressed',String(state.stockOnly));
  const isDesktopStockList=false; // Checkout browsing never uses inventory to rank or filter products.
  $('desktopStockHint').hidden=!isDesktopStockList;
  dom.productList.className=`products ${state.productLayout==='grid'?'grid-view':'list-view'}`;
  const frag=document.createDocumentFragment();
  for(const p of items.slice(0,state.visibleLimit)) {
    const available=!state.centralReadOnly&&!p.fiyatBelirsiz;
    const row=document.createElement('article');row.className='product-card';
    const stockDetail=isDesktopStockList
      ? '<small class="product-stock-details">'+esc(p.kategori||'Ürün')+
        ' · Stok: '+(p.stokBelirsiz?'Belirtilmemiş':
          esc(Number(remaining(p)).toLocaleString('tr-TR')+' '+(p.birim||'adet')))+'</small>'
      : '';
    row.innerHTML=`<div class="product-photo"><span class="product-emoji" aria-hidden="true">${productPictureEmoji(p)}</span></div>
      <div class="product-info"><div class="product-title">${esc(p.baslik)}</div>${stockDetail}</div>
      <div class="product-right"><span class="price">${esc(priceLabel(p))}</span><button class="add-button" type="button" aria-label="${esc(p.baslik)} sepete ekle" ${available?'':'disabled'}>+</button></div>`;
    if(userCan('products')&&!state.centralReadOnly){const edit=document.createElement('button');edit.type='button';edit.className='quick-price-button';edit.textContent='✎ Fiyat Değiştir';edit.onclick=()=>openQuickPrice(p);row.append(edit);}
    const pic=row.querySelector('.product-photo');
    if(p.gorsel){
      const img=document.createElement('img');img.className='product-thumb';
      applyProductImage(img,p.gorsel,256);pic.append(img);
    }
    row.querySelector('.product-title').addEventListener('click',()=>openProductDetail(p));
    pic.addEventListener('click',()=>openProductDetail(p));
    row.querySelector('.add-button').addEventListener('click',()=>isWeightProduct(p)?openWeightProduct(p):addToCart(p));
    frag.append(row);
  }
  dom.productList.replaceChildren(frag);
  if(!items.length)dom.productList.innerHTML='<p class="clean-empty">Ürün bulunamadı</p>';
  $('loadMoreProducts').hidden=items.length<=state.visibleLimit;
  $('productLimit').hidden=true;
}
/** Stock state derived from the central product and this device's sold ledger.
 * Merely rendering these values never changes inventory. Authorized product
 * edits can be requested separately, and are written through D1.
 */
function stockState(product){
  if(product.stokBelirsiz)return {stock:Infinity,status:'unknown',label:'Belirtilmemiş'};
  const value=remaining(product);
  if(!Number.isFinite(value))return {stock:Infinity,status:'unknown',label:'Belirtilmemiş'};
  const formatted=value.toLocaleString('tr-TR',{maximumFractionDigits:3})+' '+(product.birim||'adet');
  return {stock:value,status:value<=0?'empty':value<=5?'low':'ok',label:formatted};
}
function renderStockOverview(){
  const products=state.products.filter(isActive);
  const inventory=products.map(p=>({product:p,...stockState(p)}));
  const tracked=inventory.filter(item=>item.status!=='unknown');
  const empty=tracked.filter(item=>item.status==='empty');
  const low=tracked.filter(item=>item.status==='low');
  $('stockOverviewTracked').textContent=tracked.length.toLocaleString('tr-TR');
  $('stockOverviewEmpty').textContent=empty.length.toLocaleString('tr-TR');
  $('stockOverviewLow').textContent=low.length.toLocaleString('tr-TR');
  const search=fold($('stockOverviewSearch').value);
  const filter=state.stockOverviewFilter;
  for(const button of document.querySelectorAll('#stockOverviewFilters [data-stock-filter]')){
    const selected=button.dataset.stockFilter===filter;
    button.setAttribute('aria-pressed',String(selected));
    button.classList.toggle('active',selected);
  }
  const statusOrder={empty:0,low:1,ok:2,unknown:3};
  const matches=inventory.filter(item=>{
    if(filter==='low' && item.status!=='low')return false;
    if(filter==='empty' && item.status!=='empty')return false;
    if(search&&!fold([item.product.baslik,item.product.barkod,item.product.urunKodu,
      item.product.kategori,item.product.marka].join(' ')).includes(search))return false;
    return true;
  }).sort((a,b)=>statusOrder[a.status]-statusOrder[b.status]||
    a.stock-b.stock||a.product.baslik.localeCompare(b.product.baslik,'tr'));
  const shown=matches.slice(0,state.stockOverviewLimit);
  const tbody=$('stockOverviewRows');tbody.replaceChildren();
  for(const item of shown){
    const row=document.createElement('tr');
    const product=document.createElement('td');
    const name=document.createElement('strong');name.textContent=item.product.baslik;
    const barcode=document.createElement('small');
    barcode.textContent=item.product.barkod||item.product.urunKodu||'Barkod belirtilmemiş';
    product.append(name,barcode);
    const category=document.createElement('td');
    category.textContent=item.product.kategori||'—';
    const quantity=document.createElement('td');
    quantity.textContent=item.label;
    quantity.className='stock-quantity';
    const price=document.createElement('td');
    price.textContent=priceLabel(item.product);
    const status=document.createElement('td');
    const canEdit=userCan('products')&&!state.centralReadOnly;
    const tag=document.createElement(canEdit&&['empty','low'].includes(item.status)?'button':'span');
    tag.className='stock-status stock-status-'+item.status+
      (tag.tagName==='BUTTON'?' stock-status-editable':'');
    tag.textContent={empty:'Stok bitti',low:'Azalan',ok:'Yeterli',unknown:'Belirsiz'}[item.status];
    if(tag.tagName==='BUTTON'){
      tag.type='button';
      tag.title='Stok ekle veya fiyatı değiştir';
      tag.setAttribute('aria-label',item.product.baslik+' stok ve fiyat düzenle');
      tag.addEventListener('click',()=>openStockEditor(item.product.id));
    }
    status.append(tag);
    const actions=document.createElement('td');
    if(canEdit){
      const edit=document.createElement('button');
      edit.type='button';edit.className='stock-overview-edit-button';
      edit.textContent='Stok / Fiyat';
      edit.setAttribute('aria-label',item.product.baslik+' stok ve fiyat düzenle');
      edit.addEventListener('click',()=>openStockEditor(item.product.id));
      actions.append(edit);
    } else actions.textContent='—';
    row.append(product,category,quantity,price,status,actions);tbody.append(row);
  }
  if(!matches.length){
    const row=document.createElement('tr');const cell=document.createElement('td');
    cell.colSpan=6;cell.className='stock-overview-no-results';
    cell.textContent=search||filter!=='all'?
      'Aramanıza uygun stok kaydı bulunamadı.':'Henüz görüntülenecek stok kaydı yok.';
    row.append(cell);tbody.append(row);
  }
  $('stockOverviewCount').textContent=matches.length.toLocaleString('tr-TR')+
    ' ürün · '+shown.length.toLocaleString('tr-TR')+' gösteriliyor';
  $('stockOverviewMore').hidden=matches.length<=state.stockOverviewLimit;
}
/** Desktop stock editor, intentionally per-item. Never silently set all
 * 19,096 catalogue records to fake 99 inventory or alter local sale ledgers. */
let stockEditProductId=null,stockEditOriginal=null,stockEditMode='add',stockEditBusy=false;
function chooseStockEditMode(mode){
  stockEditMode=mode;
  const set99=mode==='set99';
  $('stockEditSet99').setAttribute('aria-pressed',String(set99));
  $('stockEditAmount').disabled=set99;
  $('stockEditModeHint').textContent=set99
    ? 'Yalnızca seçili ürünün bu cihazda görünen kalan stoğu 99 olacak. Başka ürünler değişmez.'
    : 'Eklenecek miktarı girin. Yalnız fiyat değiştirmek için miktarı 0 bırakabilirsiniz.';
}
function openStockEditor(productId){
  if(!userCan('products')||state.centralReadOnly){
    announce('Stok veya fiyat düzenlemek için merkezi bağlantı ve ürün düzenleme yetkisi gerekli.','error');
    return;
  }
  const product=state.byId.get(productId);
  if(!product||!isActive(product)){announce('Bu ürün artık düzenlenebilir durumda değil.','error');return;}
  stockEditProductId=product.id;stockEditOriginal={...product};
  $('stockEditProductTitle').textContent=product.baslik;
  $('stockEditBarcode').textContent=product.barkod||product.urunKodu||'Barkod yok';
  $('stockEditCurrent').textContent=stockState(product).label;
  $('stockEditUnit').textContent=product.birim||'adet';
  $('stockEditPriceCurrency').textContent=product.paraBirimi||'TRY';
  $('stockEditPrice').value=product.fiyatBelirsiz?'':String(product.satisFiyati).replace('.',',');
  $('stockEditAmount').value='0';
  $('stockEditMessage').textContent='';
  $('stockEditSave').disabled=false;
  chooseStockEditMode('add');
  $('stockEditDialog').showModal();
  $('stockEditAmount').focus();
}
async function saveStockEditor(event){
  event.preventDefault();
  if(stockEditBusy||!stockEditProductId||!stockEditOriginal)return;
  const button=$('stockEditSave'),message=$('stockEditMessage');
  stockEditBusy=true;button.disabled=true;message.textContent='Merkezi stok kaydı doğrulanıyor…';
  let saved=null;
  try{
    if(!userCan('products')||state.centralReadOnly)
      throw Error('Ürün düzenleme yetkisi veya merkezi bağlantı yok.');
    const priceText=$('stockEditPrice').value.trim();
    if(!priceText&&!stockEditOriginal.fiyatBelirsiz)
      throw Error('Satış fiyatı boş bırakılamaz.');
    const enteredPrice=priceText?parseLocaleNumber(priceText,NaN):null;
    // A stock-only replenishment must not rewrite legacy tax/net price fields.
    const price=enteredPrice!==null&&(
      stockEditOriginal.fiyatBelirsiz||
      round2(enteredPrice)!==round2(Number(stockEditOriginal.satisFiyati))
    )?enteredPrice:null;
    const amountText=$('stockEditAmount').value.trim();
    const amount=amountText?Number(amountText):0;
    const remote=await checkRemoteProductStates([stockEditProductId]);
    const fresh=remote.products.get(stockEditProductId);
    if(!fresh||!sameProductRecord(stockEditOriginal,fresh))
      throw Error('Ürün başka bir cihazda güncellenmiş. Bu pencereyi kapatıp yeniden açın.');
    const next=prepareStockEdit(fresh,{
      mode:stockEditMode,quantity:amount,
      soldQuantity:Number(state.sold.get(stockEditProductId)||0),price
    });
    message.textContent='Merkezi veritabanına kaydediliyor…';
    saved=await serializeMutation(()=>saveManagedProduct(next,'stock-overview-edit'));
    try{await refreshManagedData(saved.id);}
    catch(error){
      // The server already committed the edit; show its returned record
      // rather than claiming the edit failed or writing a fake stock value.
      const products=state.products.map(p=>p.id===saved.id?saved:p);
      const adjustments=[...state.sold].map(([id,soldQuantity])=>({id,soldQuantity}));
      setCatalog(products,adjustments,state.meta,state.excelCount,state.bundleCount,state.lifecycleMeta);
      announce('Merkezi kayıt yapıldı, ancak güncel stok tekrar okunamadı: '+error.message,'error');
    }
    $('stockEditDialog').close();
    stockEditProductId=null;stockEditOriginal=null;
    channel?.postMessage('product-managed');
    announce('Stok / fiyat değişikliği kaydedildi.','success');
  }catch(error){
    message.textContent=error.message;
    if(!saved)announce('Stok kaydedilemedi: '+error.message,'error');
  }finally{
    stockEditBusy=false;button.disabled=false;
  }
}
let quickPriceProduct=null,quickPriceBusy=false,quickPriceSaved=null;
function openQuickPrice(p){
 if(!userCan('products')||state.centralReadOnly)return announce('Ürün düzenleme yetkisi gerekli.','error');
 quickPriceProduct={...p};quickPriceSaved=null;
 $('quickPriceName').textContent=p.baslik;$('quickPriceCode').textContent=p.barkod||p.urunKodu||'';
 $('quickPriceOld').textContent=priceLabel(p);$('quickPriceValue').value=p.fiyatBelirsiz?'':String(p.satisFiyati).replace('.',',');
 $('quickPriceValue').disabled=false;$('quickPriceQueue').checked=true;$('quickPriceMessage').textContent='';$('quickPriceSave').textContent='Fiyatı Kaydet';$('quickPriceDialog').showModal();$('quickPriceValue').focus();$('quickPriceValue').select();
}
async function saveQuickPrice(e){
 e.preventDefault();if(quickPriceBusy||!quickPriceProduct)return;
 const button=$('quickPriceSave'),msg=$('quickPriceMessage');quickPriceBusy=true;button.disabled=true;
 try{
  if(!userCan('products')||state.centralReadOnly)throw Error('Ürün düzenleme yetkisi veya merkezi bağlantı yok.');
  if(!quickPriceSaved){
   const raw=$('quickPriceValue').value.trim();if(!/^\d+(?:[,.]\d{1,2})?$/.test(raw))throw Error('Geçerli bir fiyat girin.');
   const price=Number(raw.replace(',','.'));if(!Number.isFinite(price)||price>1e9)throw Error('Geçersiz fiyat.');
   const fresh=(await checkRemoteProductStates([quickPriceProduct.id])).products.get(quickPriceProduct.id);
   if(!fresh||!sameProductRecord(quickPriceProduct,fresh))throw Error('Ürün değişmiş. Pencereyi kapatıp tekrar açın.');
   if(!fresh.fiyatBelirsiz&&Number(fresh.satisFiyati)===price){quickPriceSaved=fresh;}
   else{const next=prepareStockEdit(fresh,{quantity:0,price});quickPriceSaved=await serializeMutation(()=>saveManagedProduct(next,'quick-price-edit'));}
   $('quickPriceValue').disabled=true;
   try{await refreshManagedData(quickPriceSaved.id);}catch{const products=state.products.map(p=>p.id===quickPriceSaved.id?quickPriceSaved:p);setCatalog(products,[...state.sold].map(([id,soldQuantity])=>({id,soldQuantity})),state.meta,state.excelCount,state.bundleCount,state.lifecycleMeta);}
   channel?.postMessage('product-managed');
  }
  if($('quickPriceQueue').checked){await addQueuedLabel(quickPriceSaved.id,1);}
  $('quickPriceDialog').close();announce($('quickPriceQueue').checked?'Fiyat kaydedildi, etiket listesine eklendi.':'Fiyat kaydedildi.','success');
 }catch(err){msg.textContent=(quickPriceSaved?'Fiyat merkezde kayıtlı. Etiket işlemi: ':'Fiyat kaydedilemedi: ')+err.message;if(quickPriceSaved)button.textContent='Etiket işlemini tekrar dene';}
 finally{quickPriceBusy=false;button.disabled=false;}
}
function renderCartBar() {
  const count = cartQty();
  $('openCart').hidden = count === 0;
  $('openCart').classList.toggle('is-empty', count === 0);
  dom.cartCount.textContent = String(count);
  dom.cartItemLabel.textContent = `${count} adet ürün`;
  dom.cartTotal.textContent = money(totals().total, cartCurrency());
  document.querySelector('.cart-label strong').textContent = count ? 'Satışa Devam Et' : 'Yeni Satış';
  $('saleLineCount').textContent = String(count);
  $('saleVarietyCount').textContent = String(new Set(
    [...state.cart.values()].map(line=>line.id)
  ).size);
  $('saleTotalQty').textContent = String(count);
}
function addToCart(product, quantity=1,{separate=false,grams=null}={}) {
  if(state.centralReadOnly) { announce('Merkezi ürün bağlantısı yok. Satış için yeniden bağlanın.','error'); return false; }
  const weighted=['kg','g','litre'].includes(product.birim);
  if(!Number.isFinite(quantity)||quantity<=0||(!weighted&&!Number.isInteger(quantity))) {
    announce('Geçerli bir miktar girin.','error');return false;
  }
  if(!isActive(product)) { announce('Ürün pasif. Satış için önce aktifleştirin.','error'); return false; }
  const current = state.cart.get(product.id);
  // Merge repeated weighed packages of one product; the scale serial reader is unchanged.
  const existingWeighed=separate?[...state.cart.values()].find(
    line=>line.id===product.id&&line.weighed&&line.product.birim===product.birim
  ):null;
  if (product.fiyatBelirsiz) { announce('Bu ürünün satış fiyatı girilmemiş. Ayarlar’dan fiyatı düzenleyin.', 'error'); return false; }
  if (state.cart.size && product.paraBirimi !== cartCurrency()) {
    announce('Farklı para birimleri tek sepette birleştirilemez.', 'error'); return false;
  }
  if(separate&&(!Number.isInteger(grams)||grams<1||
      (product.birim==='kg'?Math.round(quantity*1000):quantity)!==grams)){
    announce('Tartım gramajı geçersiz. Ürünü yeniden tartın.','error');return false;
  }
  if(existingWeighed){
    const before=Number.isInteger(existingWeighed.grams)?existingWeighed.grams:
      Math.round(existingWeighed.quantity*(product.birim==='kg'?1000:1));
    const totalGrams=before+grams;
    existingWeighed.grams=totalGrams;
    existingWeighed.quantity=product.birim==='kg'?totalGrams/1000:totalGrams;
    existingWeighed.weighCount=(existingWeighed.weighCount||1)+1;
    // Preserve any cashier-edited price or discount on this product.
  }else if(current&&!separate)current.quantity=Math.round((current.quantity+quantity)*1000)/1000;
  else{
    const cartKey=separate?'weight::'+product.id+'::'+(globalThis.crypto?.randomUUID?.()||
      (Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))):product.id;
    state.cart.set(cartKey,{id:product.id,cartKey,product:{...product},
      quantity,grams:separate?grams:null,weighed:separate,
      weighCount:separate?1:null,
      unitPrice:product.satisFiyati,discountPct:0});
  }
  renderCartBar();
  if((typeof isSaleActive==='function'?isSaleActive():dom.cartDialog.open))renderCart();
  playCartSound(existingWeighed||(current&&!separate)?'increase':'add');
  showCartConfirmation(product);
  return true;
}
function updateCart(id, field, value) {
  const line = state.cart.get(id);
  if (!line) return;
  if (field === 'quantity') {
    const num = Number(value);
    const weighted=['kg','g','litre'].includes(line.product.birim);
    if (!Number.isFinite(num) || num < 0 || (!weighted && !Number.isInteger(num)) || (weighted && Math.round(num*1000)!==num*1000)) { announce('Miktar geçersiz.', 'error'); renderCart(); return; }
    if (num === 0) {
      if(!confirm(line.product.baslik+' sepetten silinsin mi?')){renderCart();return;}
      state.cart.delete(id);playCartSound('decrease');renderCartBar();renderCart();return;
    }
    if(num!==line.quantity)playCartSound(num>line.quantity?'increase':'decrease');
    line.quantity = num;
    if(line.weighed){
      line.grams=line.product.birim==='g'?Math.round(num):Math.round(num*1000);
      line.weighCount=1; // The manual edit replaces the recorded weighing count.
    }
  } else if (field === 'price') {
    const num = parseLocaleNumber(value, NaN);
    if (!Number.isFinite(num) || num < 0) { announce('Geçerli bir birim fiyat girin.', 'error'); renderCart(); return; }
    line.unitPrice = round2(num);
  } else if (field === 'discount') {
    const num = value.trim()===''?0:parseLocaleNumber(value, NaN);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      announce('İskonto %0 ile %100 arasında olmalı.', 'error'); renderCart(); return;
    }
    line.discountPct = num;
  }
  renderCartBar(); renderCart();
}
function renderCart() {
  dom.cartItems.replaceChildren();
  if (!state.cart.size) {
    dom.cartItems.innerHTML = `<div class="sale-empty-premium">
      <div class="sale-empty-basket" aria-hidden="true">
        <svg viewBox="0 0 120 110" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="55" r="52" fill="#E9F2FF"/>
          <path d="M32 43H90L82 87H40L32 43Z" fill="#3C98F2" stroke="#185EAF" stroke-width="3" stroke-linejoin="round"/>
          <path d="M29 42H93V52H29Z" fill="#65B8FF" stroke="#185EAF" stroke-width="3" stroke-linejoin="round"/>
          <path d="M45 63L47 78M61 62V78M76 62L74 78" stroke="#135FAE" stroke-width="4" stroke-linecap="round"/>
          <path d="M45 42L61 19L79 42" stroke="#1C518F" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <strong>Sepetiniz Boş</strong>
      <p>Barkod okutun veya ürün arayarak satışa ekleyin.</p>
      <div class="sale-empty-actions">
        <button id="emptyScanBtn" type="button"><span aria-hidden="true">▥</span>Barkod Okut</button>
        <button id="emptyFindBtn" type="button"><span aria-hidden="true">⌕</span>Ürün Ara</button>
        <button id="emptyAddBtn" type="button"><span aria-hidden="true">⊕</span>Ürün Ekle</button>
      </div>
    </div>`;
    $('emptyScanBtn').addEventListener('click',openCamera);
    $('emptyFindBtn').addEventListener('click',()=>openProductPicker($('saleBarcode').value.trim()));
    $('emptyAddBtn').addEventListener('click',()=>openProductPicker());
  }
  for (const line of state.cart.values()) {
    const el = document.createElement('div'); el.className = 'cart-line';
    const amount = money(lineTotals(line).total, line.product.paraBirimi);
    const brand=String(line.product.marka||'').trim();
    const title=String(line.product.baslik||'').trim();
    // The vast majority already start with their brand; do not duplicate it.
    const brandPrefix=brand && fold(title).startsWith(fold(brand));
    el.innerHTML = `<div class="sale-cart-media" aria-hidden="true">
      <span class="sale-cart-emoji">${productPictureEmoji(line.product)}</span>
    </div>
    <div class="sale-cart-info">
    <div class="sale-product-row">
      <div class="cart-line-name">${brand && !brandPrefix ? `<span class="sale-line-brand">${esc(brand)}</span>` : ''}${esc(title)}</div>
      <div class="sale-price-actions">
        <strong class="sale-line-price">${esc(amount)}</strong>
        <button type="button" class="sale-edit-price" data-edit-price>✎ Fiyatı Düzenle</button>
      </div>
    </div>
    ${line.weighed?'<small class="cart-weight-badge">⚖ '+esc(
      line.product.birim==='kg'?line.quantity.toFixed(3)+' kg':line.quantity+' g'
    )+' · '+(line.weighCount>1?line.weighCount+' tartım':'Tartılı ürün')+'</small>':''}
    <div class="sale-line-actions">
      <div class="stepper">
        <button type="button" data-step="-1" aria-label="Adedi azalt">−</button>
        <input type="number" min="${line.product.birim==='kg'?'0.001':'1'}" step="${line.product.birim==='kg'?'0.001':line.product.birim==='litre'?'0.1':'1'}" inputmode="${['kg','g','litre'].includes(line.product.birim)?'decimal':'numeric'}" value="${line.quantity}" data-field="quantity" aria-label="Miktar (${esc(line.product.birim||'adet')})">
        <button type="button" data-step="1" aria-label="Adedi artır">+</button>
      </div>
      <details class="sale-line-more"><summary aria-label="Fiyat ve iskonto düzenle" title="Fiyat / iskonto">⋯</summary>
        <div class="sale-line-edit">
          <label>Fiyat<input type="text" inputmode="decimal" value="${line.unitPrice.toFixed(2)}" data-field="price"></label>
          <label>İskonto %<input type="text" inputmode="decimal" value="${line.discountPct||''}" data-field="discount" placeholder="Boş"></label>
        </div>
      </details>
      <button class="remove-button" type="button" data-remove aria-label="Ürünü sil" title="Ürünü sil">×</button>
    </div>
    </div>`;
    if(line.product.gorsel){
      const image=document.createElement('img');
      image.className='sale-cart-product-image';
      image.alt='';
      const media=el.querySelector('.sale-cart-media');
      media.append(image);
      applyProductImage(image,line.product.gorsel,192,'high');
    }
    // Cashiers without a price/discount right must not be invited to edit it.
    // The D1 checkout gate independently verifies every changed unit price.
    el.querySelector('[data-edit-price]').hidden=!userCan('discounts');
    el.querySelector('.sale-line-more').hidden=!userCan('discounts');
    el.querySelector('[data-edit-price]').addEventListener('click',()=>{
      el.querySelector('.sale-line-more').open=true;
      const price=el.querySelector('[data-field="price"]');
      price.focus({preventScroll:true});price.select();
    });
    el.querySelector('[data-remove]').addEventListener('click', () => {
      if(!confirm(line.product.baslik+' sepetten silinsin mi?'))return;
      state.cart.delete(line.cartKey||line.id); playCartSound('decrease'); renderCart(); renderCartBar();
    });
    for (const step of el.querySelectorAll('[data-step]')) step.addEventListener('click', () => {
      const delta=line.product.birim==='kg'?0.001:line.product.birim==='g'?1:
        line.product.birim==='litre'?0.1:1;
      updateCart(line.cartKey||line.id, 'quantity',
        Math.round((line.quantity + Number(step.dataset.step)*delta)*1000)/1000);
    });
    for (const input of el.querySelectorAll('[data-field]')) input.addEventListener('change', () => {
      updateCart(line.cartKey||line.id, input.dataset.field, input.value);
    });
    dom.cartItems.append(el);
  }
  const sum = totals(), currency = cartCurrency();
  dom.totals.innerHTML = `<div class="total-row summary"><span>Ara toplam</span><strong>${esc(money(sum.base,currency))}</strong></div>
    ${sum.lineDiscount>0?`<div class="total-row summary"><span>Ürün iskontosu</span><strong>−${esc(money(sum.lineDiscount,currency))}</strong></div>`:''}
    ${sum.basketDiscount>0?`<div class="total-row summary"><span>Sepet iskontosu (%${sum.basketDiscountPct})</span><strong>−${esc(money(sum.basketDiscount,currency))}</strong></div>`:''}
    <div class="total-row grand"><span>Ödenecek toplam</span><strong>${esc(money(sum.total,currency))}</strong></div>`;
  const hasCartItems=state.cart.size>0;
  dom.complete.disabled=state.saving||(hasCartItems&&state.basketDiscountInvalid);
  dom.complete.classList.toggle('is-empty-cart',!hasCartItems);
  $('checkoutActionLabel').textContent=hasCartItems?'Satışı Tamamla':'Ana Sayfaya Dön';
  dom.complete.setAttribute('aria-label',hasCartItems?'Satışı Tamamla':'Ana Sayfaya Dön');
  updatePayment();
}
function updatePayment() {
  const selected = document.querySelector('input[name="payment"]:checked').value;
  $('creditBox').hidden=selected!=='Veresiye';
  const external=['Havale / FAST','Yemek Kartı','Diğer'].includes(selected);
  $('bankPaymentNotice').hidden=!external;
  if(external)$('bankPaymentNotice').textContent=selected==='Havale / FAST'?
    'Havale / FAST ödemesinin banka hesabınıza geçtiğini kontrol edin. Uygulama banka transferlerini otomatik doğrulamaz.':
    'Bu yöntem harici olarak tahsil edilir. Satışı tamamlamadan önce ödemenin alındığını kontrol edin.';
  const other=!['Nakit','Kart'].includes(selected);
  $('checkoutOtherPayment').classList.toggle('is-selected',other);
  $('checkoutOtherLabel').textContent=other?selected:'Diğer Ödeme';
  $('checkoutOtherPayment').setAttribute('aria-label',other?'Diğer Ödeme: '+selected:'Diğer Ödeme');
  $('checkoutDiscountLabel').textContent=state.basketDiscountPct>0?
    'İndirim %'+state.basketDiscountPct:'Sepet İndirimi';
  $('checkoutDiscountToggle').classList.toggle('has-discount',state.basketDiscountPct>0);
  const paid=dom.cash.value.trim()===''?NaN:parseLocaleNumber(dom.cash.value,NaN);
  const total=totals().total;
  const change=Number.isFinite(paid)?round2(paid-total):NaN;
  $('cashPayTotal').textContent=money(total,cartCurrency());
  dom.change.textContent=Number.isNaN(change)?'Alınan tutarı girin':change>=0?
    'Para üstü: '+money(change,cartCurrency()):'Eksik ödeme: '+money(-change,cartCurrency());
  dom.change.style.color=change<0?'#a73b46':'#136c49';
  $('cashConfirm').disabled=!Number.isFinite(change)||change<-.009||!state.cart.size||state.basketDiscountInvalid;
}
function openCashPayment(){
  if(!state.cart.size){announce('Önce sepete ürün ekleyin.','error');return;}
  document.querySelector('input[name="payment"][value="Nakit"]').checked=true;
  $('cashModeButtons').hidden=false;
  $('cashManualPanel').hidden=true;
  dom.cash.value='';
  updatePayment();
  const total=totals().total, rounded=next200Cash(total);
  $('cashRoundConfirm').hidden=cartCurrency()!=='TRY';
  $('cashRoundedAmount').textContent=money(rounded,'TRY');
  $('cashRoundedChange').textContent=money(round2(rounded-total),'TRY');
  if(!$('cashPaymentDialog').open)$('cashPaymentDialog').showModal();
}
function adjustScanQuantity(delta) {
  const input=$('scanQuantityInput'),weighted=pendingScanProduct&&
    ['kg','g','litre'].includes(pendingScanProduct.product.birim);
  const step=weighted?0.1:1,current=Number(input.value)||0;
  input.value=String(Math.max(weighted?0.001:1,Math.round((current+delta*step)*1000)/1000));
}
function confirmScannedQuantity() {
  const pending=pendingScanProduct;
  if(!pending)return;
  const {product,sourceInput,resumeCamera}=pending,qty=Number($('scanQuantityInput').value);
  if(addToCart(product,qty)) {
    if(sourceInput)sourceInput.value='';
    $('saleBarcode').value='';
    pendingScanProduct=null;
    $('scanQuantityDialog').close();
    chirp();
    if(!isSaleActive())openSale();
    // Even the legacy quantity editor must never automatically restart camera.
    focusSaleBarcode();
  }
}
function renderAll() { renderHome(); if(typeof renderHomeStockInsights==='function')renderHomeStockInsights(); renderFilters(); renderProducts(); if(state.view==='stock')renderStockOverview(); renderCartBar(); setSyncStatus(); updateNavigation(); if (isSaleActive()) renderCart(); }
function exactProduct(raw) {
  const code = String(raw ?? '').trim();
  return findBarcodeProduct(state.byBarcode, code) || state.products.find(p => p.urunKodu && fold(p.urunKodu) === fold(code));
}
async function selectExcelFile(file) {
  if (!file) return;
  state.excelPreview = null;
  $('confirmExcelImport').disabled = true;
  $('excelSummary').classList.remove('error');
  $('excelSummary').textContent = 'Excel dosyası okunuyor...';
  $('excelErrors').hidden = true;
  $('excelPreview').replaceChildren();
  $('excelDialog').showModal();
  try {
    const lines = await readXlsxRows(file);
    const parsed = parseExcelProducts(lines);
    state.excelPreview = { ...parsed, filename: file.name };
    const imageTotal = parsed.products.filter(p => Boolean(p.gorsel)).length;
    const taxText = parsed.missingTax ? ' · Bu Excel’de KDV yok; yalnız yeni ürünlerin KDV oranını ayrıca kontrol edin.' : '';
    $('excelSummary').textContent = `${parsed.products.length} ürün · ${imageTotal} görsel · ${parsed.errors.length} hatalı satır${taxText}`;
    const errors = $('excelErrors');
    errors.replaceChildren();
    if (parsed.errors.length) {
      errors.hidden = false;
      const title = document.createElement('strong'); title.textContent = 'Önce Excel hatalarını düzeltin:';
      errors.append(title);
      for (const issue of parsed.errors.slice(0, 25)) {
        const message = document.createElement('p'); message.textContent = issue;
        errors.append(message);
      }
      if (parsed.errors.length > 25) {
        const message = document.createElement('p'); message.textContent = `... ve ${parsed.errors.length - 25} hata daha`;
        errors.append(message);
      }
    }
    if (parsed.products.length) {
      const preview = document.createElement('div');
      for (const product of parsed.products.slice(0, 6)) {
        const line = document.createElement('div'); line.className = 'excel-preview-line';
        const thumb = document.createElement('img');
        thumb.className = 'excel-preview-thumb';
        thumb.loading = 'lazy';
        thumb.alt = product.baslik;
        thumb.referrerPolicy = 'no-referrer';
        thumb.src = product.gorsel || '/icons/placeholder.svg';
        thumb.onerror = () => { thumb.onerror = null; thumb.src = '/icons/placeholder.svg'; };
        const name = document.createElement('strong'); name.textContent = product.baslik;
        const other = document.createElement('small'); other.textContent =
          `${product.barkod || product.urunKodu} · ${stockLabel(product)} · ${priceLabel(product)}`;
        line.append(thumb, name, other); preview.append(line);
      }
      $('excelPreview').replaceChildren(preview);
    }
    $('confirmExcelImport').disabled = parsed.errors.length > 0 || !parsed.products.length;
  } catch (error) {
    $('excelSummary').textContent = `Excel okunamadı: ${error.message}`;
    $('excelSummary').classList.add('error');
  } finally { $('excelFile').value = ''; }
}
async function confirmExcelImport() {
  const pending = state.excelPreview;
  if (!pending || pending.errors.length || state.excelUploading) return;
  state.excelUploading = true;
  $('confirmExcelImport').disabled = true;
  $('confirmExcelImport').textContent = 'Yükleniyor...';
  try {
    await serializeMutation(() => upsertExcelProducts(pending.products, pending.filename));
    const snapshot = await getSnapshot();
    setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta, snapshot.excelCount, snapshot.bundleCount, snapshot.lifecycleMeta);
    channel?.postMessage('excel-updated');
    state.excelPreview = null;
    $('excelDialog').close();
    announce(`${pending.products.length} Excel ürünü yüklendi.`, 'success');
  } catch (error) { announce(`Excel yükleme hatası: ${error.message}`, 'error'); }
  finally {
    state.excelUploading = false;
    $('confirmExcelImport').textContent = 'Ürünleri Yükle';
    $('confirmExcelImport').disabled = !state.excelPreview || state.excelPreview.errors.length > 0;
  }
}

async function completeSale() {
  if (state.saving || !state.cart.size) return;
  if(state.basketDiscountInvalid){announce('Sepet iskontosu geçersiz. %0–%100 arasında düzeltin.','error');return;}
  if (state.centralReadOnly) { announce('Merkezi ürün bağlantısı yok. Satış kaydedilemez.','error'); return; }
  const sum = totals();
  const payment = document.querySelector('input[name="payment"]:checked').value;
  const cash = payment === 'Nakit' ? round2(parseLocaleNumber(dom.cash.value, NaN)) : null;
  if (payment === 'Nakit' && (!Number.isFinite(cash) || cash + 0.009 < sum.total)) {
    if($('cashPaymentDialog').open)announce('Alınan para toplam tutarı karşılamıyor.','error');
    else openCashPayment();
    return;
  }
  const creditCustomer=payment==='Veresiye'?customerManager?.getSelected():null;
  if(payment==='Veresiye'&&!creditCustomer) {
    announce('Veresiye satış için kayıtlı bir müşteri seçmelisiniz.','error');return;
  }
  const creditName=creditCustomer?.name||'';
  // Preserve exactly the same receipt on uncertain network retries (all payments).
  // Changing the cart creates a new immutable receipt ID.
  const saleFingerprint=JSON.stringify([payment,creditCustomer?.id||'',cash,
    sum.total,sum.basketDiscountPct,[...state.cart.values()].map(x=>
      [x.id,x.quantity,x.unitPrice,x.discountPct])]);
  const {allocations,...saleTotals}=sum;
  const previousReceipt=state.pendingSale?.fingerprint===saleFingerprint?
    state.pendingSale.record:null;
  const record = previousReceipt||{
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() :
      `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(), payment,
    currency: cartCurrency(),creditName:payment==='Veresiye'?creditName:'',
    creditCustomerId:creditCustomer?.id||'',receiptSettings:readReceiptSettings(),
    cashReceived: cash, change: payment === 'Nakit' ? round2(cash - sum.total) : 0,
    ...saleTotals,
    items: [...state.cart.values()].map((line,index) => ({
      id: line.id, urunKodu: line.product.urunKodu, barkod: line.product.barkod,
      baslik: line.product.baslik, marka: line.product.marka, beden: line.product.beden, renk: line.product.renk,
      quantity: line.quantity, unitPrice: line.unitPrice, discountPct: line.discountPct,
      birim:line.product.birim,grams:line.weighed?line.grams:null,
      kdv: line.product.kdv, ...lineTotals(line),
      basketDiscount:allocations[index].basketDiscount,
      netTotal:allocations[index].netTotal,vat:allocations[index].vat
    }))
  };
  state.pendingSale={fingerprint:saleFingerprint,record};
  state.saving = true; dom.complete.disabled = true;
  try {
    // Check server-side account/discount/veresiye rights before any central
    // customer ledger write or this device's IndexedDB sale mutation.
    let localMirrorFailed=false;
    if(await isCentralSalesEnabled()){
      // Central receipt and credit ledger commit atomically; only then update
      // optional device cache. Never redo the debt if local mirroring fails.
      await saveCentralSale(record);
      try{await serializeMutation(() => saveSale(record));}
      catch{localMirrorFailed=true;}
    }else{
      // Legacy route stays available until explicit, tested central cutover.
      await authorizeCheckout(record);
      if(payment==='Veresiye')await recordCustomerCredit(creditCustomer.id,record);
      await serializeMutation(() => saveSale(record));
    }
    state.pendingSale=null;
    for (const line of record.items) state.sold.set(line.id, (state.sold.get(line.id) || 0) + line.quantity);
    state.lastSale = record; state.cart.clear();
    state.basketDiscountPct=0;state.basketDiscountInvalid=false;
    $('basketDiscountPct').value='';$('basketDiscountError').hidden=true;
    $('basketDiscountPanel').hidden=true;
    $('checkoutDiscountToggle').setAttribute('aria-expanded','false');
    document.querySelector('input[name="payment"][value="Nakit"]').checked=true;
    dom.cash.value='';customerManager?.clearSelection();
    if($('cashPaymentDialog').open)$('cashPaymentDialog').close();
    if(useDesktopWorkspace() && state.view==='sale')navigate('#home');
    else if(dom.cartDialog.open)dom.cartDialog.close();
    renderProducts(); renderCartBar(); renderHome();
    refreshHomeSales().catch(()=>{});
    channel?.postMessage('sale-updated');
    announce(localMirrorFailed?'Satış merkezi kaydedildi; bu cihazdaki kopya güncellenemedi.':'Satış kaydedildi: '+money(record.total,record.currency),localMirrorFailed?'error':'success');
    $('receiptActionsTotal').textContent = money(record.total, record.currency);
    $('receiptActionStatus').textContent = '';
    applyReceiptActionPreference();
    $('receiptActionsDialog').showModal();
  } catch (error) { announce(`Satış kaydedilemedi: ${error.message}`, 'error'); }
  finally { state.saving = false; renderCart(); }
}
function renderReceipt(sale) {
  const prefs=sale.receiptSettings||readReceiptSettings();
  const layout=receiptPrintLayout(prefs.width);
  const width=layout.paperMm+'mm';
  $('receiptPrint').style.setProperty('--receipt-width',width);
  $('receiptPrint').style.setProperty('--receipt-content-width',layout.contentMm+'mm');
  $('receiptPrint').style.setProperty('--receipt-left-inset',layout.leftInsetMm+'mm');
  $('receiptPrint').dataset.paperMm=String(layout.paperMm);
  // Physical paper is still 58/80 mm; text stays inside a narrower safe zone.
  // The printer driver's actual paper preset must also match the roll.
  const mm=layout.paperMm;
  const height=layout.paperMm===80?portraitReceiptHeight(80,60+sale.items.length*11):Math.max(80,Math.min(1000,60+sale.items.length*11));
  $('receiptPaperSize').textContent = `@media print { @page { size: ${mm}mm ${height}mm; margin: 0; } }`;
  const root = $('receiptPrint');
  if(layout.paperMm===80){
    const context=document.createElement('canvas').getContext('2d');
    const measure=(value,pt)=>{if(!context)return value.length*pt*.73;context.font='bold '+pt+'pt Arial';return context.measureText(value).width;};
    root.innerHTML=quoteMarkup(sale,prefs,measure);
    return;
  }
  const vatByRate = new Map();
  for (const item of sale.items) vatByRate.set(item.kdv,
    round2((vatByRate.get(item.kdv) || 0) + item.vat));
  root.innerHTML = `<div class="receipt-title">${esc(prefs.title)}</div>
    <div class="receipt-center receipt-small">MALİ DEĞERİ YOKTUR<br>Bilgi fişi / Satış kaydı</div>
    <div class="receipt-rule"></div><div>Fiş No: ${esc(sale.id.slice(0, 12))}</div>
    <div>Tarih: ${esc(fmtDate(sale.createdAt))}</div><div>Ödeme: ${esc(sale.payment)}</div>
    ${sale.creditName ? `<div>Müşteri: ${esc(sale.creditName)}</div>` : ''}
    <div class="receipt-rule"></div>
    ${sale.items.map(item => `<div class="receipt-product">${esc(item.marka && !fold(item.baslik).startsWith(fold(item.marka)) ? `${item.marka} · ${item.baslik}` : item.baslik)}
      ${esc([item.beden, item.renk].filter(Boolean).join(' / '))}
      <div class="receipt-row"><span>${item.birim==='kg'?Number(item.quantity).toFixed(3)+' kg':item.birim==='g'?item.quantity+' g':item.quantity} × ${esc(money(item.unitPrice, sale.currency))}${item.birim==='kg'?'/kg':item.birim==='g'?'/g':''}
      ${item.discountPct ? `(-%${item.discountPct})` : ''}</span>
      <span>${esc(money(item.total, sale.currency))}</span></div></div>`).join('')}
    <div class="receipt-rule"></div>
    <div class="receipt-row"><span>Ara toplam</span><span>${esc(money(sale.base, sale.currency))}</span></div>
    ${sale.basketDiscount>0?
      `<div class="receipt-row"><span>Ürün iskontosu</span><span>-${esc(money(sale.lineDiscount||0,sale.currency))}</span></div>
       <div class="receipt-row"><span>Sepet iskontosu (%${esc(sale.basketDiscountPct||0)})</span><span>-${esc(money(sale.basketDiscount,sale.currency))}</span></div>`:
      `<div class="receipt-row"><span>İskonto</span><span>-${esc(money(sale.discount, sale.currency))}</span></div>`}
    ${[...vatByRate.entries()].map(([rate, vat]) =>
      `<div class="receipt-row"><span>Dahil KDV %${esc(rate)}</span><span>${esc(money(vat, sale.currency))}</span></div>`).join('')}
    <div class="receipt-rule"></div>
    <div class="receipt-row receipt-grand"><span>TOPLAM</span><span>${esc(money(sale.total, sale.currency))}</span></div>
    ${sale.payment === 'Nakit' ? `<div class="receipt-row"><span>Alınan</span><span>${esc(money(sale.cashReceived, sale.currency))}</span></div>
      <div class="receipt-row"><span>Para üstü</span><span>${esc(money(sale.change, sale.currency))}</span></div>` : ''}
    <div class="receipt-rule"></div>
    <div class="receipt-center receipt-small">Teşekkür ederiz!<br>Bu belge yasal mali fiş yerine geçmez.</div>
    ${prefs.phone?`<div class="receipt-center receipt-footer-line">Tel: ${esc(prefs.phone)}</div>`:''}
    ${prefs.website?`<div class="receipt-center receipt-footer-line">${esc(prefs.website)}</div>`:''}`;
}
function printSale(sale) {
  renderReceipt(sale);
  if(autoPrint()){try{sendPrint('receipt',readPrinterProfiles().receipt,receiptRollPdf($('receiptPrint'),receiptPrintLayout(sale.receiptSettings?.width||readReceiptSettings().width))).then(()=>announce('Fiş yazıcı kuyruğuna gönderildi.','success')).catch(e=>announce(e.message,'error'));}catch(e){announce(e.message,'error');}return;}
  // Native PDF has physical roll dimensions, no browser date/page footer, and portrait orientation.
  const receiptWidth=sale.receiptSettings?.width||readReceiptSettings().width;
  const desktopPrint=window.matchMedia('(min-width:1024px) and (min-height:600px) and (orientation:landscape) and (any-pointer:fine), (min-width:1280px) and (min-height:600px) and (orientation:landscape)').matches;
  if(useNativeReceipt107(receiptWidth,desktopPrint)||(String(receiptWidth)==='58'&&window.matchMedia('(pointer:fine)').matches)){try{const pdf=receiptRollPdf($('receiptPrint'),receiptPrintLayout(sale.receiptSettings?.width||readReceiptSettings().width));const url=URL.createObjectURL(pdf);const tab=window.open(url,'_blank');if(!tab){URL.revokeObjectURL(url);announce('PDF penceresine izin verin.','error');}else{announce('Fiş PDF hazır. GP-H80300 hedefini ve 80/58 mm kağıdı seçin.','success');setTimeout(()=>URL.revokeObjectURL(url),600000);} }catch(e){announce(e.message,'error');}return;}
  // 80 mm and mobile AirPrint use HTML preview. Browser headers/footers are controlled by the print dialog.
  const layout=receiptPrintLayout(sale.receiptSettings?.width||readReceiptSettings().width);
  const mm=layout.paperMm;
  const printableMm=layout.contentMm;
  const leftInsetMm=layout.leftInsetMm;
  const innerPaddingMm=layout.innerPaddingMm;
  const receipt = $('receiptPrint').innerHTML;
  let preview;
  try { preview = window.open('', '_blank'); } catch { /* popup blocked */ }
  if (!preview) {
    announce('Fiş önizlemesi engellendi. Açılır pencerelere izin verin; yazıcıdan 80 mm kağıt seçin.', 'error');
    window.print();
    return;
  }
  try {
    const estimatedHeight=Math.min(2500,Math.max(50,45+(sale.items?.length||1)*10));
    const initialHeight=mm===80?portraitReceiptHeight(mm,estimatedHeight):estimatedHeight;
    const fontSize=mm===58?9:10;
    const fontTitle=mm===58?12:14;
    const style = '<style id="printPaper">@page{size:' + mm + 'mm ' + initialHeight + 'mm;margin:0}</style>' +
      '<style>*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#eef2f5;color:#111;font-family:system-ui,-apple-system,sans-serif}' +
      '.print-controls{max-width:520px;margin:15px auto;padding:14px;text-align:center;background:#fff;border-radius:12px}' +
      '.print-controls button{background:#127653;color:white;border:0;border-radius:10px;padding:13px 24px;font-size:16px;font-weight:800}' +
      '.print-controls p{font-size:12px;line-height:1.5;color:#475569;margin:10px 0 0}' +
      '#receipt{width:' + printableMm + 'mm;max-width:100%;margin:12px auto;padding:5mm ' + innerPaddingMm + 'mm;background:#fff;' +
        'box-shadow:0 4px 20px #14253b22;font:700 ' + fontSize + 'pt/1.15 Arial,sans-serif;overflow-wrap:anywhere}' +
      '.receipt-title{text-align:center;font-weight:900;font-size:' + fontTitle + 'pt;margin-bottom:1mm}' +
      '.receipt-center{text-align:center}.receipt-small{font-size:8pt}.receipt-footer-line{font-size:9pt;font-weight:900;margin:0}' +
      '.receipt-rule{border-bottom:1px dashed #000;margin:1mm 0}' +
      '.receipt-row{display:flex;justify-content:space-between;align-items:baseline;gap:1mm;min-width:0}' +
      '.receipt-row span{min-width:0;overflow-wrap:anywhere}' +
      '.receipt-row span:last-child{white-space:nowrap;text-align:right;flex:none;font-variant-numeric:tabular-nums}' +
      '.receipt-product{margin:0;line-height:1.12;break-inside:avoid;page-break-inside:avoid}' +
      '.receipt-quote-name{white-space:nowrap;line-height:1.15;font-weight:900}.receipt-quote-metrics{display:flex;justify-content:space-between;gap:.6mm;white-space:nowrap;line-height:1.15}.receipt-quote-warning{font-weight:900}' +
      '.receipt-grand{font-size:' + (mm===58?10:11) + 'pt;font-weight:900}' +
      '@media print{html,body{width:' + mm + 'mm!important;max-width:' + mm + 'mm!important;background:#fff!important}' +
      '.print-controls{display:none!important}#receipt{width:' + printableMm + 'mm!important;max-width:' + printableMm + 'mm!important;' +
      'margin:0 0 0 ' + leftInsetMm + 'mm!important;padding:1mm ' + innerPaddingMm + 'mm!important;' +
      'box-shadow:none!important;overflow:hidden!important}}</style>';
    const page = '<!doctype html><html lang="tr"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Hizlisatis ' + mm + ' mm Fiş</title>' + style + '</head><body>' +
      '<div class="print-controls"><button id="doPrint" type="button">Fişi Yazdır</button>' +
      '<p>Hedef: ' + esc(readPrinterProfiles().receipt) + ' · Üstbilgi ve altbilgi kapalı · Kağıt: ' + mm + ' mm. Yazıcı / AirPrint kağıt ayarında da ' + mm +
      ' mm termal rulo seçin; tarayıcı yazıcının A4 tercihini değiştiremez.</p></div>' +
      '<main id="receipt" aria-label="Satış bilgi fişi">' + receipt + '</main></body></html>';
    preview.document.open();
    preview.document.write(page);
    preview.document.close();
    // Return to the already-open barcode field once the OS print dialog ends.
    preview.addEventListener?.('afterprint',()=>{
      try{preview.close();}catch{}
      try{window.focus();}catch{}
      focusSaleBarcode();
    },{once:true});
    preview.document.getElementById('doPrint').addEventListener('click', () => {
      const sheet = preview.document.getElementById('receipt');
      const height = mm===80?portraitReceiptHeight(mm,Math.min(2500,Math.ceil(sheet.scrollHeight*25.4/96-8+3))):Math.min(2500,Math.max(40,Math.ceil(sheet.scrollHeight*25.4/96-6)));
      preview.document.getElementById('printPaper').textContent =
        mm===80?portraitReceiptPage(mm,height):'@page{size:' + mm + 'mm ' + height + 'mm;margin:0}';
      preview.focus();
      preview.print();
    });
    preview.focus();
  } catch (error) {
    console.warn('Fiş önizlemesi açılamadı:', error);
    announce('Fiş önizlemesi açılamadı; yazdırma ekranında 80 mm kağıt seçin.', 'error');
    window.print();
  }
}

async function printBluetoothReceipt(sale) {
  // Web Bluetooth is available primarily in Chromium/Android, not iOS Safari.
  if (!navigator.bluetooth?.requestDevice) throw new Error('Bu tarayıcı Bluetooth yazıcı bağlantısını desteklemiyor. iPhone için Ağ / AirPrint veya üreticinin yazıcı uygulamasını kullanın.');
  const NUS='6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const TX='6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  const choices=[{service:NUS,char:TX},{service:0xffe0,char:0xffe1},{service:0xff00,char:0xff02}];
  const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,
    optionalServices:choices.map(x=>x.service)});
  const server=await device.gatt.connect();
  try {
    let characteristic;
    for (const choice of choices) {
      try {
        const service=await server.getPrimaryService(choice.service);
        characteristic=await service.getCharacteristic(choice.char);
        if (characteristic) break;
      } catch { /* try another BLE ESC/POS UART profile */ }
    }
    if (!characteristic) throw new Error('Yazıcı desteklenen BLE ESC/POS bağlantısını sunmuyor. Üretici uygulamasından veya Ağ / AirPrint ile yazdırın.');
    const data=escPosReceipt(sale);
    for (let i=0; i<data.length; i+=20) {
      const part=data.slice(i,i+20);
      if (characteristic.writeValueWithoutResponse) await characteristic.writeValueWithoutResponse(part);
      else await characteristic.writeValue(part);
      if ((i/20)%4===3) await new Promise(resolve=>setTimeout(resolve,35));
    }
  } finally { if (server.connected) server.disconnect(); }
}
async function shareReceiptWhatsApp(sale) {
  const text=receiptAsText(sale);
  // The platform share sheet lists WhatsApp and WhatsApp Business if installed.
  if (navigator.share) {
    try { await navigator.share({title:'Hizlisatis Fişi',text}); return; }
    catch (error) { if (error.name==='AbortError') return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
}
async function shareReceiptPdf(sale) {
  const button=$('receiptPdfShare'), status=$('receiptActionStatus');
  button.disabled=true;
  status.textContent='PDF fişi hazırlanıyor…';
  try {
    const blob=receiptPdfBlob(sale);
    const day=(sale.createdAt||new Date().toISOString()).slice(0,10);
    const fileName='Cep-Hizli-Satis-Fis-'+day+'-'+String(sale.id||'fis').slice(0,8)+'.pdf';
    let file=null;
    try {file=new File([blob],fileName,{type:'application/pdf'});} catch { /* older browser */ }
    let canShareFile=false;
    try {
      canShareFile=!!(file && navigator.share && navigator.canShare?.({files:[file]}));
    }catch { /* file sharing unavailable; offer local PDF download */ }
    if(canShareFile) {
      try {
        await navigator.share({files:[file],title:'Cep Hızlı Satış bilgi fişi'});
        status.textContent='PDF paylaşımı tamamlandı.';
        return;
      }catch(error) {
        if(error?.name==='AbortError'){status.textContent='PDF paylaşımı iptal edildi.';return;}
      }
    }
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download=fileName;
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    status.textContent='PDF indirildi. Dosyayı WhatsApp veya telefonun paylaşım menüsünden gönderebilirsiniz.';
  } catch(error) {
    status.textContent='PDF oluşturulamadı: '+String(error?.message||error).slice(0,130);
  } finally {
    button.disabled=false;
  }
}
/** Compact report sourced centrally when central sales is enabled.
 * Otherwise report only this device's receipts; never fabricate values.
 * Non-TRY currencies are excluded from sums, not converted or combined.
 */
function renderHistorySummary(sales){
  const localTrySales=sales.filter(s=>
    !s.voided&&(!s.currency||s.currency==='TRY')&&Number.isFinite(Number(s.total))&&
    s.createdAt&&Number.isFinite(new Date(s.createdAt).getTime()));
  const amount=round2(localTrySales.reduce((sum,s)=>sum+Number(s.total),0));
  $('historySummaryTotal').textContent=money(amount,'TRY');
  $('historySummaryCount').textContent=localTrySales.length.toLocaleString('tr-TR');
  $('historySummaryAverage').textContent=money(
    localTrySales.length?round2(amount/localTrySales.length):0,'TRY');
  const byPayment={cash:0,card:0,credit:0,other:0};
  for(const sale of localTrySales){
    const kind=sale.payment==='Nakit'?'cash':sale.payment==='Kart'?'card':
      sale.payment==='Veresiye'?'credit':'other';
    byPayment[kind]+=Number(sale.total);
  }
  $('historyCashTotal').textContent=money(round2(byPayment.cash),'TRY');
  $('historyCardTotal').textContent=money(round2(byPayment.card),'TRY');
  $('historyCreditTotal').textContent=money(round2(byPayment.credit),'TRY');
  $('historyOtherTotal').textContent=money(round2(byPayment.other),'TRY');
  const dayStart=new Date();dayStart.setHours(0,0,0,0);
  const days=Array.from({length:7},(_,i)=>{
    const date=new Date(dayStart);
    date.setDate(dayStart.getDate()-(6-i));
    return {date,key:date.toDateString(),total:0};
  });
  const byDay=new Map(days.map(day=>[day.key,day]));
  for(const sale of localTrySales){
    const day=byDay.get(new Date(sale.createdAt).toDateString());
    if(day)day.total+=Number(sale.total);
  }
  const chart=$('historySummaryChart');chart.replaceChildren();
  const highest=Math.max(1,...days.map(day=>day.total));
  for(const day of days){
    const column=document.createElement('div');column.className='history-summary-day';
    const value=document.createElement('strong');value.className='history-summary-value';
    value.textContent=day.total?money(round2(day.total),'TRY'):'—';
    const track=document.createElement('div');track.className='history-summary-track';
    const bar=document.createElement('span');bar.className='history-summary-bar';
    bar.style.height=day.total?Math.max(5,Math.round(day.total/highest*100))+'%':'3px';
    track.append(bar);
    const caption=document.createElement('small');
    caption.textContent=day.date.toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'});
    column.append(value,track,caption);chart.append(column);
  }
  const empty=!localTrySales.length;
  $('historySummaryEmpty').hidden=!empty;
  $('historySummaryPlot').hidden=empty;
  $('historySummary').hidden=false;
}
let reportsPageLoaded=false;
let allReportSales=[];
let centralReportMode=false;
let pendingVoidSale=null;
let currentReportFilters={};
let historyPage101=0;
const HISTORY_PAGE_SIZE101=20;
let detailSale101=null;
function saleLines101(sale){return Array.isArray(sale.items)?sale.items:[];}
function distinctSaleLines101(lines){const groups=new Map();for(const line of lines){const key=String(line.productId||line.id||line.barkod||line.urunKodu||line.baslik||'Ürün');if(!groups.has(key))groups.set(key,line);}return [...groups.values()];}
function drawSaleDetail101(){if(!detailSale101)return;const sale=detailSale101,lines=saleLines101(sale),query=fold($('saleDetailSearch101').value),matches=lines.filter(x=>!query||[x.baslik,x.barkod,x.urunKodu,x.marka].some(v=>fold(v).includes(query)));$('saleDetailCount101').textContent=matches.length+' / '+lines.length+' satış satırı';const root=$('saleDetailRows101');root.replaceChildren();for(const x of matches){const row=document.createElement('article');row.className='sale-detail-row101';const name=document.createElement('strong');name.textContent=x.baslik||'Ürün';const code=document.createElement('small');code.textContent=x.barkod||x.urunKodu||'Barkod yok';const info=document.createElement('div');info.className='sale-detail-info101';const qty=document.createElement('span');qty.textContent='Miktar: '+String(x.quantity??'—')+' '+(x.birim||'adet');const unit=document.createElement('span');unit.textContent='Birim: '+(x.unitPrice==null?'—':money(x.unitPrice,sale.currency));const discount=document.createElement('span');discount.textContent='İskonto: '+(x.discountPct==null?'—':'%'+x.discountPct);const vat=document.createElement('span');vat.textContent='KDV: '+(x.kdv==null?'—':'%'+x.kdv);const amount=document.createElement('b');amount.textContent=x.total==null?'—':money(x.total,sale.currency);info.append(qty,unit,discount,vat,amount);row.append(name,code,info);root.append(row);}if(!matches.length){const p=document.createElement('p');p.textContent='Eşleşen ürün yok.';root.append(p);}}
function openSaleDetail101(sale){detailSale101=sale;$('saleDetailSummary101').textContent=money(sale.total,sale.currency)+' · '+(sale.payment||'—')+' · '+fmtDate(sale.createdAt)+(sale.voided?' · İPTAL':'')+(sale.creditName?' · '+sale.creditName:'');$('saleDetailSearch101').value='';$('saleDetailPrint101').disabled=!!sale.voided;drawSaleDetail101();$('saleDetail101').showModal();}
function readHistoryFilters(){
  return {
    from:$('historyFrom').value,to:$('historyTo').value,
    payment:$('historyPayment').value,query:$('historyQuery').value,
    sort:$('historySort').value,min:$('historyMin').value,max:$('historyMax').value
  };
}
function renderFilteredHistory(filters=currentReportFilters,keepPage=false){
  if(!keepPage)historyPage101=0;
  // Filter a read-only in-memory copy of real central receipts. Never write
  // to products, customer ledgers, or IndexedDB as part of reporting.
  const result=filterReportSales(allReportSales,filters);
  currentReportFilters={...filters};
  state.sales=result;
  renderHistorySummary(state.sales);
  const voidedCount=state.sales.filter(s=>s.voided).length;
  $('historyCount').textContent=state.sales.length.toLocaleString('tr-TR')+' satış'+
    (voidedCount?' · '+voidedCount+' iptal':'')+
    (state.sales.length!==allReportSales.length?' (filtreli)':'');
  dom.historyItems.replaceChildren();
  if(!state.sales.length){
    const empty=document.createElement('div');
    empty.className='empty-state';
    empty.textContent=allReportSales.length?'Seçilen filtrelere uygun satış bulunamadı.':'Henüz satış kaydı yok.';
    dom.historyItems.append(empty);
    $('historySummaryEmpty').textContent=empty.textContent;
  }
  const pageCount=Math.max(1,Math.ceil(state.sales.length/HISTORY_PAGE_SIZE101));historyPage101=Math.min(historyPage101,pageCount-1);
  $('historyPager101').hidden=state.sales.length<=HISTORY_PAGE_SIZE101;$('historyPrev101').disabled=historyPage101===0;$('historyNext101').disabled=historyPage101>=pageCount-1;$('historyPage101').textContent=(historyPage101+1)+' / '+pageCount+' · '+state.sales.length+' satış';
  for(const sale of state.sales.slice(historyPage101*HISTORY_PAGE_SIZE101,(historyPage101+1)*HISTORY_PAGE_SIZE101)){
    const item=document.createElement('article');item.className='history-card';
    if(sale.voided)item.classList.add('history-card-voided');
    const head=document.createElement('div');head.className='history-head';
    const total=document.createElement('span');total.textContent=money(sale.total,sale.currency);
    const method=document.createElement('span');method.textContent=sale.voided?'İptal · '+(sale.payment||'—'):(sale.payment||'—');
    head.append(total,method);
    const detail=document.createElement('small');
    const lines=Array.isArray(sale.items)?sale.items:[];
    const distinct=distinctSaleLines101(lines);
    detail.textContent=fmtDate(sale.createdAt)+' · '+distinct.length+' farklı ürün · '+lines.length+' satır'+
      (sale.creditName?' · '+sale.creditName:'');
    const names=document.createElement('p');
    names.className='history-preview101';names.textContent=distinct.slice(0,2).map(line=>String(line.baslik||'Ürün')).join(', ')+(distinct.length>2?' · '+(distinct.length-2)+' ürün daha…':'');
    const show=document.createElement('button');show.type='button';show.className='history-detail-button101';show.textContent='Satış Detayını Gör';show.onclick=()=>openSaleDetail101(sale);
    const print=document.createElement('button');
    print.type='button';print.textContent=sale.voided?'İptal Edildi · Fiş Geçersiz':'Fişi Yazdır';
    print.disabled=Boolean(sale.voided);
    if(!sale.voided)print.addEventListener('click',()=>printSale(sale));
    item.append(head,detail,names,show,print);
    if(sale.voided){
      const note=document.createElement('p');
      note.className='history-voided-note';
      note.textContent='İptal edildi · '+(sale.voidReason||'Test satışı')+' · Ciroya dahil değil';
      item.append(note);
    }else if(centralReportMode && userCan('users') &&
      ['Nakit','Veresiye'].includes(sale.payment)){
      const cancel=document.createElement('button');
      cancel.type='button';cancel.className='history-void-button';
      cancel.textContent='Satışı İptal Et';
      cancel.addEventListener('click',()=>openSaleVoidDialog(sale));
      item.append(cancel);
    }
    dom.historyItems.append(item);
  }

}
function openSaleVoidDialog(sale){
  if(!sale?.id || sale.voided || !['Nakit','Veresiye'].includes(sale.payment))return;
  pendingVoidSale={id:sale.id,payment:sale.payment};
  $('saleVoidInfo').textContent=money(sale.total,sale.currency)+' · '+sale.payment+
    ' · '+fmtDate(sale.createdAt);
  $('saleVoidReason').value='wrong';
  $('saleVoidWarning').textContent=sale.payment==='Veresiye'?
    'Fiş silinmez. Müşterinin borcundan bu satış tutarı tek seferde düşülür. Tahsilat yapılmışsa işlem reddedilebilir.':
    'Fiş silinmez, iptal kaydı saklanır ve tutar satış cirosundan çıkarılır. Varsa nakit iadesi kasada ayrıca yapılmalıdır.';
  $('saleVoidError').textContent='';
  $('saleVoidConfirm').disabled=false;
  $('saleVoidDialog').showModal();
}
async function submitSaleVoid(event){
  event.preventDefault();
  if(!pendingVoidSale)return;
  const {id}=pendingVoidSale;
  const button=$('saleVoidConfirm');
  if(button.disabled)return;
  button.disabled=true;
  $('saleVoidCancel').disabled=true;
  $('saleVoidError').textContent='';
  try{
    await voidCentralSale(id,$('saleVoidReason').value);
    $('saleVoidDialog').close();
    pendingVoidSale=null;
    await showHistory();
    await refreshHomeSales();
    announce('Satış kayıtları korunarak iptal edildi.','success');
  }catch(error){
    $('saleVoidError').textContent='İptal doğrulanamadı: '+error.message+
      ' Sonucu kontrol etmeden tekrar denemeyin.';
  }finally{
    button.disabled=false;
    $('saleVoidCancel').disabled=false;
  }
}
async function showHistory() {
  try {
    const {sales,central}=await getSalesForReports(getSales);
    allReportSales=Array.isArray(sales)?sales:[];
    centralReportMode=central;
    const note=document.querySelector('.history-device-note');
    if(note)note.textContent=central?'Merkezi satışlar · Tüm cihazlar · Eski yerel fişler dahil değil':
      'Bu cihazın kayıtları · Diğer kasalar dahil değildir';
    const heading=$('historySummaryPlot').querySelector('h3 small');
    if(heading)heading.textContent=central?'(merkezi satışlar, ₺)':'(bu cihaz, ₺)';
    $('historySummary').setAttribute('aria-label',central?'Merkezi satış raporu':'Bu cihazın satış raporu');
    renderFilteredHistory(readHistoryFilters());
    reportsPageLoaded=true;
    if(useDesktopWorkspace()){
      placeNativeWorkspacePages();
      if(state.view!=='reports'){
        if(!['#sale','#reports'].includes(location.hash))state.previousWorkspaceHash=location.hash||'#home';
        navigate('#reports');
      } else updateNavigation();
    }else{
      placeNativeWorkspacePages();
      if(!dom.historyDialog.open)dom.historyDialog.showModal();
      updateNavigation();
    }
  } catch (error) { announce('Satış geçmişi açılamadı: '+error.message,'error'); }
}
function csvCell(value) {
  let str = String(value ?? '');
  if (/^\s*[=+\-@]/.test(str)) str = `'${str}`; // spreadsheet formula injection guard
  return `"${str.replace(/"/g, '""')}"`;
}
async function exportHistory() {
  try {
  const savedSales=reportsPageLoaded && isReportsActive()?state.sales:(await getSalesForReports(getSales)).sales;
  const header = ['Fiş No','Tarih','Ödeme','Müşteri','Para Birimi','Toplam','Ürün Kodu',
    'Barkod','Ürün','Adet','Birim Fiyat','İskonto %','Satır Toplamı','KDV',
    'Sepet İskontosu %','Sepet İskontosu Tutarı','Toplam İskonto','Durum','İptal Nedeni'];
  const rows = [header, ...savedSales.flatMap(sale => sale.items.map(item => [
    sale.id, sale.createdAt, sale.payment, sale.creditName, sale.currency, sale.total,
    item.urunKodu, item.barkod, item.baslik, item.quantity, item.unitPrice,
    item.discountPct, item.total, item.kdv,
    sale.basketDiscountPct||0,sale.basketDiscount||0,sale.discount||0,
    sale.voided?'İptal':'Geçerli',sale.voidReason||''
  ]))];
  const csv = '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = href;
  a.download = `cep-pos-satislar-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  }catch(error){announce('Satış CSV dosyası oluşturulamadı: '+error.message,'error');}
}

/** Download only device-local sales and receipt settings: never claim D1 is backed up. */
async function downloadDeviceBackup(){
  const button=$('backupDownload'),status=$('backupStatus');
  button.disabled=true;
  try{
    const sales=await getSales();
    const json=createDeviceBackup(sales,readReceiptSettings());
    const blob=new Blob([json],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='hizlisatis-cihaz-yedegi-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
    status.textContent='✓ '+sales.length+' satış kaydı ve fiş ayarları yedeklendi. Dosyayı güvenli yerde saklayın.';
  }catch(error){
    status.textContent='Yedek oluşturulamadı: '+error.message;
  }finally{button.disabled=false;}
}
async function importDeviceBackup(file){
  if(!file)return;
  const status=$('backupStatus'),input=$('backupUpload');
  status.textContent='Yedek kontrol ediliyor…';
  try{
    if(file.size>50*1024*1024)throw Error('Dosya 50 MB sınırını aşıyor.');
    const data=parseDeviceBackup(await file.text());
    if(!confirm(data.sales.length+' satış kaydını ve fiş ayarlarını bu cihaza geri yüklemek istiyor musunuz? Mevcut satışlar silinmeyecek.')){
      status.textContent='Geri yükleme iptal edildi.';return;
    }
    const result=await restoreSalesBackup(data.sales);
    // Sales import commits before settings; do not pretend to undo committed sales.
    try{
      const prefs=saveReceiptSettings(data.receiptSettings);
      $('settingsPrintWidth').value=prefs.width;
      $('settingsReceiptTitle').value=prefs.title;
      $('settingsReceiptFooter106').value=prefs.footer||'';
      $('settingsReceiptPhone').value=prefs.phone;
      $('settingsReceiptWebsite').value=prefs.website;
    }catch(error){
      status.textContent=result.added+' satış geri yüklendi, fiş ayarları kaydedilemedi: '+error.message;
      return;
    }
    const snapshot=await getLocalSnapshot();
    state.sold=new Map(snapshot.adjustments.map(item=>[item.id,item.soldQuantity||0]));
    renderProducts();renderCart();renderCartBar();
    refreshHomeSales().catch(()=>{});
    status.textContent='✓ '+result.added+' satış geri yüklendi; '+result.skipped+
      ' kayıt zaten vardı. Merkezi ürünler ve müşteri borçları değiştirilmedi.';
  }catch(error){
    status.textContent='Yedek geri yüklenemedi: '+error.message;
  }finally{input.value='';}
}

let scanSoundContext;
function unlockScanAudio() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    scanSoundContext ||= new Context();
    if (scanSoundContext.state === 'suspended') scanSoundContext.resume().catch(() => {});
  } catch { /* some devices silence page audio */ }
}
function playCartSound(action='add') {
  try {
    // Only user-triggered successful cart mutations call this sound.
    // Reuse the barcode scanner's AudioContext; no network or music assets.
    unlockScanAudio();
    const audio=scanSoundContext;
    if(!audio)return;
    const now=audio.currentTime;
    const tones=action==='decrease'?[670,490]:action==='increase'?[920,1190]:[870,1100];
    tones.forEach((frequency,index)=>{
      const start=now+index*0.078;
      const tone=audio.createOscillator(),gain=audio.createGain();
      tone.type='sine';tone.frequency.setValueAtTime(frequency,start);
      gain.gain.setValueAtTime(0.001,start);
      gain.gain.exponentialRampToValueAtTime(0.19,start+0.012);
      gain.gain.exponentialRampToValueAtTime(0.001,start+0.115);
      tone.connect(gain);gain.connect(audio.destination);
      tone.start(start);tone.stop(start+0.12);
      tone.onended=()=>{tone.disconnect();gain.disconnect();};
    });
  } catch { /* Device or browser does not permit audio. Sale still succeeds. */ }
}
function chirp() {
  try {
    unlockScanAudio();
    const audio=scanSoundContext;
    if (audio) {
      const now=audio.currentTime;
      const gain=audio.createGain(); gain.gain.setValueAtTime(0.001,now);
      gain.gain.exponentialRampToValueAtTime(0.28,now+0.012);
      gain.gain.exponentialRampToValueAtTime(0.001,now+0.22);
      gain.connect(audio.destination);
      const tone=audio.createOscillator(); tone.type='square';
      tone.frequency.setValueAtTime(980,now);
      tone.frequency.setValueAtTime(1350,now+0.10);
      tone.connect(gain); tone.start(now); tone.stop(now+0.23);
      tone.onended=() => {tone.disconnect();gain.disconnect();};
    }
  } catch { /* user may have silenced the device */ }
  navigator.vibrate?.([90,45,90]);
}
let lastScanText = '', lastScanTime = 0;
function renderScanHistory() {
  const root=$('scanHistoryList');
  root.replaceChildren();
  const entries=readScanHistory();
  if(!entries.length){
    const empty=document.createElement('p');
    empty.className='scan-history-empty';
    empty.textContent='Henüz barkod okunmadı. Son 20 barkod yalnızca bu cihazda saklanır.';
    root.append(empty);
    return;
  }
  for(const entry of entries){
    const button=document.createElement('button');
    button.type='button';button.className='scan-history-entry';
    const detail=document.createElement('span');
    const code=document.createElement('strong');code.textContent=entry.code;
    const caption=document.createElement('small');
    caption.textContent=entry.format+' · '+new Date(entry.at).toLocaleString('tr-TR');
    detail.append(code,caption);
    const arrow=document.createElement('span');arrow.textContent='›';
    button.append(detail,arrow);
    button.addEventListener('click',()=>{
      $('scanHistoryPanel').hidden=true;
      $('scannerView').hidden=false;
      scanned(entry.code,{source:'history',format:entry.format,force:true});
    });
    root.append(button);
  }
}
async function showScanHistory() {
  await stopScanner();
  $('scannerView').hidden=true;
  $('scanHistoryPanel').hidden=false;
  dom.scanMessage.textContent='Önceden okunan barkodu seçebilirsiniz.';
  renderScanHistory();
}
function scanned(raw,{source='camera',format='Barkod',force=false}={}) {
  const text=String(raw??'').trim();
  if(!text)return;
  const now=Date.now();
  if(!force&&isRepeatScan(text,lastScanText,lastScanTime,now))return;
  const session=state.scanner;
  if(session?.decoded)return;
  lastScanText=text;lastScanTime=now;
  if(session){session.decoded=true;clearTimeout(session.fallbackTimer);}
  $('scanManualBarcode').value=text;
  rememberScan(text,format);
  const purpose=state.scanPurpose;
  const dialogWasOpen=dom.scanDialog.open;
  if(dialogWasOpen){
    dom.scanDialog.classList.add('is-success');
    dom.scanMessage.textContent='Barkod başarıyla okundu';
  }
  chirp();
  const deliver=()=>{
    if(dialogWasOpen&&!dom.scanDialog.open)return;
    if(purpose==='price-label'){
      if(dom.scanDialog.open)dom.scanDialog.close();
      state.scanPurpose='sale';
      stopScanner().catch(()=>{});
      priceLabelFeature?.acceptScan(text);
      return;
    }
    if(purpose==='manage'){
      if(dom.scanDialog.open)dom.scanDialog.close();
      state.scanPurpose='sale';
      productManager.manageScannedBarcode(text);
      return;
    }
    const product=exactProduct(text);
    if(product){
      // One successful camera read closes the camera. A new read is explicit.
      // Existing basket lines are never incremented by barcode scanning.
      if(state.cart.has(product.id)){addBarcodeOnce(product,$('scanManualBarcode'));return;}
      if(productManager?.offerSaleActivation(product,active=>addBarcodeOnce(active,$('scanManualBarcode'))))return;
      addBarcodeOnce(product,$('scanManualBarcode'));
    }else{
      // Camera and image/manual scans are definitely barcode inputs, not name search.
      if(!promptUnknownBarcode(text)){
        $('saleBarcode').value='';
        $('scanManualBarcode').value='';
        announce('Okunan barkod çok uzun veya geçersiz.','error');
      }
    }

  };
  if(dialogWasOpen)setTimeout(deliver,540);
  else deliver();
}

function updateTorchButton(enabled = false, on = false) {
  const button=$('scanTorch');
  button.disabled=!enabled;
  button.setAttribute('aria-pressed', String(on));
  button.setAttribute('aria-label', on ? 'Flaşı kapat' : 'Flaşı aç');
  const label=button.querySelector('span');
  if(label)label.textContent=on?'Açık':'Flaş';
  else button.textContent=on?'⚡ Açık':'⚡ Flaş';
}
/** Request continuous autofocus only when supported by the running track. */
async function optimizeScannerFocus(session) {
  try{
    const caps=session.lib?.getRunningTrackCapabilities?.() ||
      session.stream?.getVideoTracks?.()[0]?.getCapabilities?.();
    if(!Array.isArray(caps?.focusMode)||!caps.focusMode.includes('continuous'))return;
    const constraints={advanced:[{focusMode:'continuous'}]};
    if(session.lib?.applyVideoConstraints)await session.lib.applyVideoConstraints(constraints);
    else await session.stream?.getVideoTracks?.()[0]?.applyConstraints(constraints);
  }catch{/* Unsupported focus controls must not interrupt video. */}
}
function torchFeature(session) {
  try {
    const feature=session.lib?.getRunningTrackCameraCapabilities?.()?.torchFeature?.();
    if (feature?.isSupported?.()) return { apply:on => feature.apply(on) };
  } catch { /* unsupported engine */ }
  const track=session.stream?.getVideoTracks?.()[0];
  if (track?.getCapabilities?.()?.torch) {
    return {apply:on=>track.applyConstraints({advanced:[{torch:on}]})};
  }
  if (session.lib?.applyVideoConstraints) {
    // Some html5-qrcode builds expose torch only through applyVideoConstraints.
    try {
      const caps=session.lib.getRunningTrackCapabilities?.();
      if (caps?.torch) return {apply:on=>session.lib.applyVideoConstraints({advanced:[{torch:on}]})};
    } catch {}
  }
  return null;
}
async function toggleTorch() {
  const session=state.scanner; if (!session?.active) return;
  const torch=torchFeature(session);
  if (!torch) { dom.scanMessage.textContent='Bu cihaz/tarayıcı flaşı desteklemiyor.'; updateTorchButton(); return; }
  const next=!session.torchOn;
  try { await torch.apply(next); session.torchOn=next; updateTorchButton(true,next); }
  catch { dom.scanMessage.textContent='Flaş açılamadı. Cihazın kamera desteğini kontrol edin.'; updateTorchButton(); }
}
let scannerStopPromise=Promise.resolve();
function stopScanner() {
  updateTorchButton();
  const session=state.scanner;
  // Even when the old session is already marked inactive, do not start the
  // next camera until the previous decoder has stopped and cleared its DOM.
  if(!session)return scannerStopPromise;
  session.active=false;
  state.scanner=null;
  if(session.timer)clearTimeout(session.timer);
  if(session.fallbackTimer)clearTimeout(session.fallbackTimer);
  scannerStopPromise=scannerStopPromise.catch(()=>{}).then(async()=>{
    if(session.stream)session.stream.getTracks().forEach(track=>track.stop());
    if(session.lib){
      try{await session.lib.stop();}catch{/* A stream can already be stopped. */}
      try{session.lib.clear();}catch{/* A decoder can already be cleared. */}
    }
    // Never stop the video element belonging to a freshly opened session.
    if(!state.scanner){
      const video=$('scanVideo');
      video.pause();video.srcObject=null;
    }
  });
  return scannerStopPromise;
}
let qrLibraryPromise;
function ensureQrLibrary() {
  if (getBarcodeLibrary(window).Reader) return Promise.resolve();
  if (qrLibraryPromise) return qrLibraryPromise;
  qrLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/html5-qrcode.min.js';
    script.onload = () => getBarcodeLibrary(window).Reader ? resolve() : reject(new Error('Barkod kütüphanesi bulunamadı.'));
    script.onerror = () => { script.remove(); reject(new Error('Barkod modülü yüklenemedi. İnternet bağlantısını kontrol edin.')); };
    document.head.append(script);
  }).catch(error => { qrLibraryPromise = null; throw error; });
  return qrLibraryPromise;
}
function cameraError(error) {
  const name = error?.name || '';
  const detail = String(error?.message || error || 'Bilinmeyen hata');
  if (name === 'NotAllowedError' || /permission|denied|notallowed/i.test(detail))
    return 'Kamera izni verilmedi. Safari adres çubuğundan kamera iznini açın.';
  if (name === 'NotFoundError' || /notfound|no camera/i.test(detail))
    return 'Kamera bulunamadı. Başka bir cihazdan deneyin.';
  if (name === 'NotReadableError' || /notreadable|could not start video/i.test(detail))
    return 'Kamera başka bir uygulama tarafından kullanılıyor. Diğer uygulamayı kapatın.';
  return `Kamera/okuyucu hatası: ${detail.slice(0, 150)}`;
}
function desiredFormats() {
  return supportedBarcodeFormats(window);
}

async function startNativeScanner(session) {
  if (!('BarcodeDetector' in window)) throw new Error('Yerel barkod algılayıcı desteklenmiyor.');
  const supported = typeof BarcodeDetector.getSupportedFormats === 'function'
    ? await BarcodeDetector.getSupportedFormats() : [];
  const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code', 'pdf417']
    .filter(format => supported.includes(format));
  if (!formats.length) throw new Error('Yerel kamera barkod biçimlerini desteklemiyor.');
  const detector = new BarcodeDetector({ formats });
  session.stream = await navigator.mediaDevices.getUserMedia({
    audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
  });
  if (!session.active) { session.stream.getTracks().forEach(t => t.stop()); return; }
  const video = $('scanVideo');
  $('html5-reader').style.display = 'none';
  video.style.display = '';
  video.srcObject = session.stream;
  await video.play();
  dom.scanMessage.textContent = 'Barkod aranıyor…';
  await optimizeScannerFocus(session);
  updateTorchButton(Boolean(torchFeature(session)),false);
  const scanFrame = async () => {
    if (!session.active) return;
    try {
      if (video.readyState >= 2) {
        const codes = await detector.detect(video);
        if (codes?.[0]?.rawValue) scanned(codes[0].rawValue,{format:codes[0].format||'Barkod'});
      }
    } catch { /* ignore a single frame decode failure */ }
    if (session.active && !session.decoded) session.timer = setTimeout(scanFrame, 160);
  };
  scanFrame();
}
async function startScanner() {
  await stopScanner();
  if (!dom.scanDialog.open) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    dom.scanMessage.textContent = 'Bu tarayıcı kamera erişimi sunmuyor. Safari/Chrome üzerinden HTTPS ile açın veya barkodu elle girin.';
    return;
  }
  const session = { active: true, stream: null, lib: null, timer: null, fallbackTimer:null, decoded:false, torchOn: false };
  state.scanner = session;
  $('scanHistoryPanel').hidden=true;
  $('scannerView').hidden=false;
  dom.scanDialog.classList.remove('is-success');
  dom.scanMessage.textContent = 'Kamera başlatılıyor… İzin istenirse kameraya izin verin.';
  $('scanVideo').style.display = 'none';
  $('html5-reader').style.display = 'block';
  try {
    // Bundled ZXing decodes 1D, QR and PDF417 on iPhone Safari and Android.
    // Native BarcodeDetector is optional: browser support differs by device.
    await ensureQrLibrary();
    if (!session.active) return;
    const formats = desiredFormats();
    if (!formats.length) throw new Error('Barkod biçimleri yüklenemedi.');
    const { Reader } = getBarcodeLibrary(window);
    if (!Reader) throw new Error('Barkod okuyucu yüklenemedi.');
    const options={verbose:false,formatsToSupport:formats,
      // Chromium may use native BarcodeDetector; ZXing remains the fallback
      // including iOS Safari. html5-qrcode alternates when available.
      useBarCodeDetectorIfSupported:true};
    // No qrbox: read the entire video frame. A narrow preview crop can hide
    // EAN/UPC bars and make the camera look as if it cannot decode products.
    // The premium neon rectangle remains only a visual positioning guide.
    const config={fps:12,disableFlip:true};
    const onSuccess=(decoded,details)=>{
      if(!session.active||session.decoded)return;
      // The library can return formats in different result shapes. Its own
      // configured list already restricts symbologies; ignore missing metadata.
      if(!acceptsBarcodeResult(details))return;
      scanned(decoded,{source:'camera',format:details?.result?.format?.formatName||'Barkod'});
    };
    let scanner = new Reader('html5-reader', options);
    session.lib = scanner;
    try {
      await scanner.start({ facingMode: 'environment' }, config, onSuccess, () => {});
    } catch (facingError) {
      // Some iPhones/browsers reject facingMode but allow an explicit device ID.
      try { await scanner.stop(); } catch {}
      try { scanner.clear(); } catch {}
      session.lib = null;
      if (!session.active) return;
      const cameras = await Reader.getCameras().catch(() => []);
      const camera = cameras.find(item => /back|rear|environment|arka/i.test(item.label || ''))
        || cameras[cameras.length - 1];
      if (!camera) throw facingError;
      scanner = new Reader('html5-reader', options);
      session.lib = scanner;
      await scanner.start(camera.id, config, onSuccess, () => {});
    }
    if (!session.active) {
      try { await scanner.stop(); } catch {}
      try { scanner.clear(); } catch {}
      return;
    }
    await optimizeScannerFocus(session);
    dom.scanMessage.textContent = 'Barkod aranıyor…';
    updateTorchButton(Boolean(torchFeature(session)),false);
    // Do not reopen the camera after a timeout: this froze some iPhones.
    session.fallbackTimer=setTimeout(()=>{
      if(session.active&&!session.decoded&&state.scanner===session)
        dom.scanMessage.textContent='Barkod aranıyor… Kamerayı sabit tutun veya flaşı deneyin.';
    },9000);
  } catch (primaryError) {
    if (!session.active) return;
    if (session.lib) {
      try { await session.lib.stop(); } catch {}
      try { session.lib.clear(); } catch {}
      session.lib = null;
    }
    $('html5-reader').style.display = 'none';
    try {
      await startNativeScanner(session);
    } catch (fallbackError) {
      if (!session.active) return;
      dom.scanMessage.textContent = `${cameraError(primaryError)} ${cameraError(fallbackError)} Barkodu aşağıya yazabilir veya fotoğraftan okutabilirsiniz.`;
    }
  }
}
async function scanBarcodePhoto(file) {
  if (!file) return;
  await stopScanner();
  dom.scanMessage.textContent = 'Barkod fotoğrafı okunuyor…';
  $('scanVideo').style.display = 'none';
  $('html5-reader').style.display = 'block';
  try {
    await ensureQrLibrary();
    const formats = desiredFormats();
    if (!formats.length) throw new Error('Barkod biçimleri yüklenemedi.');
    const { Reader } = getBarcodeLibrary(window);
    if (!Reader) throw new Error('Barkod okuyucu yüklenemedi.');
    const lib = new Reader('html5-reader', {
      verbose: false, formatsToSupport: formats,
      useBarCodeDetectorIfSupported: false
    });
    state.scanner = { active: true, lib, stream: null, timer: null, decoded:false, fallbackTimer:null };
    const code = await lib.scanFile(file, false);
    scanned(code,{source:'gallery',format:'Galeri'});
    // The photo has been decoded; restart camera only if user taps 'Yeniden Dene'.
  } catch (error) {
    dom.scanMessage.textContent = `Galeriden barkod okunamadı. Daha net bir görsel seçin veya elle girin. (${String(error?.message || error).slice(0,90)})`;
  }
}


async function refreshManagedData(productId=null) {
  if(productId && state.products.length) {
    // Refresh only one edited product. Reloading the full 19,096-row catalogue
    // after each edit would waste D1 read quota and mobile data.
    const remote=await checkRemoteProductStates([productId]);
    const record=remote.products.get(productId);
    if(!record)throw Error('Merkezi veritabanında kaydedilen ürün bulunamadı.');
    if((remote.bulkAt||null)===(state.lifecycleMeta?.at||null)) {
      const product={...record,
        lifecycleStatus:record.lifecycleStatus||(remote.bulkAt?'initial-inactive':'active')};
      const products=state.products.filter(p=>p.id!==productId);
      products.push(product);
      const adjustments=[...state.sold].map(([id,soldQuantity])=>({id,soldQuantity}));
      const excelCount=products.filter(p=>p.source!=='bundle').length;
      const bundleCount=products.length-excelCount;
      setCatalog(products,adjustments,state.meta,excelCount,bundleCount,state.lifecycleMeta);
      return {products,lifecycleMeta:state.lifecycleMeta};
    }
  }
  state.catalogLoading=true;state.catalogProgress=0;state.catalogError='';
  productManager?.render();
  try {
    const snapshot=await getSnapshot(({received})=>{
      state.catalogProgress=received;
      if($('manageDialog')?.open)productManager?.render();
    });
    state.legacyPending=Boolean(snapshot.legacyPending);
    setCatalog(snapshot.products,snapshot.adjustments,snapshot.meta,
      snapshot.excelCount,snapshot.bundleCount,snapshot.lifecycleMeta);
    return snapshot;
  } catch(error) {
    state.catalogError=error.message;
    throw error;
  } finally {
    state.catalogLoading=false;
    productManager?.render();
  }
}
function applyReceiptActionPreference(){
  const preferred=readReceiptAction();
  for(const [id,action] of [
    ['receiptNetworkPrint','network'],['receiptBluetoothPrint','bluetooth'],
    ['receiptWhatsApp','whatsapp'],['receiptPdfShare','pdf']
  ])$(id).hidden=preferred!==action;
  $('receiptActionsGrid').classList.add('single-action');
}
/** Main Settings tab is a menu; the gear tile alone opens all preferences. */
function showSettingsMainMenu(){
  $('settingsMainMenu').hidden=false;
  $('settingsPageTitle').hidden=false;
  $('settingsPreferences').hidden=true;
}
function showSettingsPreferences(){
  $('settingsMainMenu').hidden=true;
  $('settingsPageTitle').hidden=true;
  $('settingsPreferences').hidden=false;
}
function openSettingsMenu(){
  showSettingsMainMenu();
  setView('settings');
}

async function setup() {
  $('historyPrev101').onclick=()=>{if(historyPage101>0){historyPage101--;renderFilteredHistory(currentReportFilters,true);$('historyItems').scrollIntoView({block:'start'});}};
  $('historyNext101').onclick=()=>{if((historyPage101+1)*HISTORY_PAGE_SIZE101<state.sales.length){historyPage101++;renderFilteredHistory(currentReportFilters,true);$('historyItems').scrollIntoView({block:'start'});}};
  $('saleDetailClose101').onclick=()=>$('saleDetail101').close();$('saleDetail101').addEventListener('close',()=>{detailSale101=null;});$('saleDetailSearch101').oninput=drawSaleDetail101;$('saleDetailPrint101').onclick=()=>{if(detailSale101&&!detailSale101.voided)printSale(detailSale101);};
  setupProductExport({canExport:()=>userCan("products")&&!state.centralReadOnly});
  setupPrinterProfiles();
  let namesBusy=false;
  async function runNames99(apply){
    if(namesBusy)return;if(!userCan('products')||state.centralReadOnly){announce('Merkezi bağlantı ve ürün yetkisi gerekli.','error');return;}
    if(apply&&!confirm('Bu sunucunun veritabanı yedeğini aldınız mı? Ürün isimleri ve markalar büyük harfe çevrilecek.'))return;
    namesBusy=true;const status=$('namesStatus99');$('namesPreview99').disabled=$('namesApply99').disabled=true;
    let cursor='',scanned=0,needed=0,changed=0,conflicts=0;
    try{do{const r=await fetch('/api/product-state',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'names-v99',cursor,apply})});const d=await r.json();if(!r.ok||d.version!==99)throw Error(d.error||'v99 sunucu kodu devrede değil.');scanned+=d.scanned;needed+=d.needed;changed+=d.changed;conflicts+=d.conflicts;cursor=d.next;status.textContent='Taranan: '+scanned+' · Değişecek: '+needed+' · Değişen: '+changed+' · Çakışma: '+conflicts;}while(cursor);if(apply){await refreshManagedData();channel?.postMessage('product-managed');}status.textContent+=' · Tamamlandı'+(conflicts?' (çakışanlar için tekrar çalıştırın)':'');}
    catch(e){status.textContent+=' · Durdu: '+e.message+' · İşlem tekrar başlatılabilir.';}finally{namesBusy=false;$('namesPreview99').disabled=$('namesApply99').disabled=false;}
  }
  $('namesPreview99').onclick=()=>runNames99(false);$('namesApply99').onclick=()=>runNames99(true);
  $('testLabelPrint').onclick=async()=>{try{await sendPrint('label',readPrinterProfiles().label,pdfFromLabelJpegs([renderLabelImage({baslik:'TEST ETİKETİ',barkod:'12345670',satisFiyati:1,birim:'adet'},undefined,true)]));$('settingsPrinterProfilesStatus').textContent='Test etiketi kuyruğa gönderildi.';}catch(e){$('settingsPrinterProfilesStatus').textContent=e.message;}};
  $('testReceiptPrint').onclick=async()=>{try{const root=document.createElement('div');root.textContent='KOLAYKASAM – FİŞ TESTİ';await sendPrint('receipt',readPrinterProfiles().receipt,receiptRollPdf(root,receiptPrintLayout(readReceiptSettings().width)));$('settingsPrinterProfilesStatus').textContent='Test fişi kuyruğa gönderildi.';}catch(e){$('settingsPrinterProfilesStatus').textContent=e.message;}};
  $('quickPriceForm').onsubmit=saveQuickPrice;$('quickPriceClose').onclick=()=>{if(!quickPriceBusy)$('quickPriceDialog').close();};$('quickPriceDialog').addEventListener('cancel',e=>{if(quickPriceBusy)e.preventDefault();});
  setupLabelQueue(renderLabelImage);
  customerManager=createCustomerManager({announce});
  priceLabelFeature=createPriceLabelFeature({
    getProducts:()=>state.products,
    findBarcode:exactProduct,
    openCamera:()=>{openCamera();state.scanPurpose='price-label';},
    onEditProduct:product=>{if(state.centralReadOnly||!userCan('products')){announce('Ürün düzenleme yetkisi ve merkezi bağlantı gerekli.','error');return;} $('priceLabelDialog').close();openQuickPrice(product);},
    onCreateProduct:code=>{
      if(state.centralReadOnly||!userCan('products')){
        announce('Yeni ürün açmak için merkezi bağlantı ve ürün yetkisi gerekli.','error');
        priceLabelFeature.open();
        return;
      }
      productManager.openNew(code);
    },
    notify:announce
  });
  const settings=readReceiptSettings();
  $('settingsPrintWidth').value=settings.width;
  $('settingsReceiptTitle').value=settings.title;
  $('settingsReceiptFooter106').value=settings.footer||'';
  $('settingsReceiptPhone').value=settings.phone;
  $('settingsReceiptWebsite').value=settings.website;
  $('settingsPickerMode').value=readPickerMode();
  $('settingsPickerMode').addEventListener('change',()=>{
    const status=$('settingsPickerModeStatus'),previous=readPickerMode();
    try{
      savePickerMode($('settingsPickerMode').value);
      status.textContent='✓ Bu cihazın varsayılan ürün görünümü kaydedildi.';
    }catch(error){
      $('settingsPickerMode').value=previous;
      status.textContent='Tercih kaydedilemedi: '+error.message;
    }
  });
  $('settingsReceiptAction').value=readReceiptAction();
  $('settingsReceiptAction').addEventListener('change',()=>{
    const status=$('settingsReceiptActionStatus'),oldValue=readReceiptAction();
    try{
      const selected=saveReceiptAction($('settingsReceiptAction').value);
      if(readReceiptAction()!==selected)throw Error('Cihaz tercihi doğrulanamadı.');
      status.textContent='✓ Bu cihaz için '+$('settingsReceiptAction').selectedOptions[0].textContent+' kaydedildi.';
      applyReceiptActionPreference();
    }catch(error){
      $('settingsReceiptAction').value=oldValue;
      status.textContent='Tercih kaydedilemedi: '+error.message;
    }
  });
  const settingsSaveButton=$('settingsReceiptSave'),saveStatus=$('settingsReceiptStatus');
  const receiptFields=['settingsPrintWidth','settingsReceiptTitle','settingsReceiptPhone','settingsReceiptWebsite','settingsReceiptFooter106'];
  const changedReceiptSettings=()=>{
    saveStatus.textContent='Kaydedilmemiş değişiklikler var.';
    saveStatus.className='receipt-save-status pending';
    settingsSaveButton.textContent='Fiş / Firma Bilgilerini Kaydet';
    settingsSaveButton.disabled=false;
  };
  for(const id of receiptFields)
    $(id).addEventListener(id==='settingsPrintWidth'?'change':'input',changedReceiptSettings);
  settingsSaveButton.addEventListener('click',()=>{
    const data={
      width:$('settingsPrintWidth').value,title:$('settingsReceiptTitle').value,
      phone:$('settingsReceiptPhone').value,website:$('settingsReceiptWebsite').value,footer:$('settingsReceiptFooter106').value
    };
    try{
      const saved=saveReceiptSettings(data);
      const verified=readReceiptSettings();
      if(JSON.stringify(saved)!==JSON.stringify(verified))
        throw Error('Kaydedilen ayarlar doğrulanamadı.');
      $('settingsReceiptTitle').value=saved.title;
      $('settingsReceiptFooter106').value=saved.footer;
      saveStatus.textContent='✓ Fiş ve firma bilgileri kaydedildi. Sonraki fişlerde kullanılacak.';
      saveStatus.className='receipt-save-status saved';
      settingsSaveButton.textContent='✓ Kaydedildi';
      settingsSaveButton.disabled=true;
      announce('Fiş / firma bilgileri başarıyla kaydedildi.','success');
    }catch(error){
      saveStatus.textContent='Kaydetme başarısız: '+error.message;
      saveStatus.className='receipt-save-status error';
      announce('Fiş bilgileri kaydedilemedi: '+error.message,'error');
    }
  });
  productManager=createProductManager({
    state, serializeMutation, refresh:refreshManagedData, announce, channel,
    openManageScanner:()=>{
      if($('manageDialog').open)$('manageDialog').close();
      openCamera(); state.scanPurpose='manage';
    }
  });
  setupOriginReview107({getProducts:()=>state.products,canEdit:()=>!state.centralReadOnly&&userCan('products')&&!state.catalogLoading&&!state.catalogError,refresh:refreshManagedData,save:product=>serializeMutation(()=>saveManagedProduct(product,'edit-origin-v107')),onChanged:()=>{productManager?.render();channel?.postMessage('product-managed');}});
  // Read-only startup sync; any saved photo is loaded from D1, not from device.
  const categoryImageManager=createCategoryImageManager({
    onImagesChanged:()=>{renderHome();renderCategoryTree($('categorySearch').value);}
  });
  categoryImageManager.reload(true).catch(()=>{});
  setConnection();
  detectImageResizing().then(enabled=>{ if(enabled) { renderHome();renderCategoryTree();renderProducts(); } });
  window.addEventListener('online',()=>{setConnection();categoryImageManager.reload(true).catch(()=>{});refreshManagedData().catch(error=>console.warn('Merkezden yenileme başarısız:',error));});
  window.addEventListener('offline',setConnection);
  window.addEventListener('hashchange',applyRoute);
  dom.search.addEventListener('input',()=>{
    state.search=dom.search.value;state.visibleLimit=48;
    if(state.search.trim()) {state.category='';setView('catalog',true);}
    else renderProducts();
  });
  $('navHome').addEventListener('click',()=>setView('home'));
  $('brandHome').addEventListener('click',()=>{
    if(dom.cartDialog.open)dom.cartDialog.close();
    setView('home');
  });
  $('navProducts').addEventListener('click',openProductCategoryHome);
  $('navSale').addEventListener('click',openSale);
  $('navSettings').addEventListener('click',openSettingsMenu);
  $('homeSettingsShortcut').addEventListener('click',openSettingsMenu);
  $('settingsOpenPreferences').addEventListener('click',showSettingsPreferences);
  $('settingsBackToMenu').addEventListener('click',showSettingsMainMenu);
  $('settingsGeneralToPicker').addEventListener('click',()=>{
    $('settingsPickerGroup').open=true;
    $('settingsPickerGroup').scrollIntoView({block:'nearest',behavior:'smooth'});
  });
  for(const [inner,existing] of [
    ['settingsInnerManage','settingsManage'],
    ['settingsInnerCategoryImages','settingsCategoryImages'],
    ['settingsInnerBackup','settingsBackup'],
    ['settingsInnerExcel','settingsExcel'],
    ['settingsInnerExport','settingsExport']
  ])$(inner).addEventListener('click',()=>$(existing).click());
  $('settingsPaymentsOpenSale').addEventListener('click',openSale);
  $('settingsDiscountOpenSale').addEventListener('click',openSale);
  // The six approved home shortcuts all open an existing, working workflow.
  $('homeQuickCategories').addEventListener('click',openProductCategoryHome);
  $('homeQuickSale').addEventListener('click',openSale);
  $('homeQuickProducts').addEventListener('click',()=>productManager.openManage());
  $('homeQuickBarcode').addEventListener('click',()=>productManager.openNew());
  $('homeQuickStock').addEventListener('click',()=>{
    // Mouse/keyboard desktop gets a dedicated, read-only stock workspace.
    // On phones and touch tablets preserve the existing product listing.
    if(window.matchMedia('(min-width:1024px) and (hover:hover) and (pointer:fine)').matches){
      state.stockOverviewFilter='all';state.stockOverviewLimit=60;
      $('stockOverviewSearch').value='';navigate('#stock');
      return;
    }
    state.stockOnly=false;state.sort='stock';$('sortProducts').value='stock';
    state.catalogEntry='products';showAllProducts();
  });
  $('stockBackToProducts').addEventListener('click',showAllProducts);
  $('stockOverviewSearch').addEventListener('input',()=>{
    state.stockOverviewLimit=60;renderStockOverview();
  });
  for(const button of document.querySelectorAll('#stockOverviewFilters [data-stock-filter]')){
    button.addEventListener('click',()=>{
      state.stockOverviewFilter=button.dataset.stockFilter;
      state.stockOverviewLimit=60;renderStockOverview();
    });
  }
  $('stockOverviewMore').addEventListener('click',()=>{
    state.stockOverviewLimit+=60;renderStockOverview();
  });
  $('stockOverviewLowJump').addEventListener('click',()=>{
    state.stockOverviewFilter='low';state.stockOverviewLimit=60;
    renderStockOverview();
    $('stockOverviewRows').scrollIntoView({behavior:'smooth',block:'nearest'});
  });
  $('stockEditForm').addEventListener('submit',saveStockEditor);
  $('stockEditClose').addEventListener('click',()=>$('stockEditDialog').close());
  $('stockEditCancel').addEventListener('click',()=>$('stockEditDialog').close());
  $('stockEditSet99').addEventListener('click',()=>chooseStockEditMode(stockEditMode==='set99'?'add':'set99'));
  $('stockEditAmount').addEventListener('input',()=>{if(stockEditMode==='set99')chooseStockEditMode('add');});
  $('homeStockInsightOpen').addEventListener('click',()=>$('homeQuickStock').click());
  $('homeRecentSalesOpen').addEventListener('click',showHistory);
  $('homeQuickReports').addEventListener('click',showHistory);
  $('homeTodaySalesButton').addEventListener('click',showHistory);
  $('homeTotalProductsButton').addEventListener('click',openProductCategoryHome);
  $('sidebarStock').addEventListener('click',()=>$('homeQuickStock').click());
  $('sidebarReports').addEventListener('click',()=>$('homeQuickReports').click());
  $('categoryBack').addEventListener('click',()=>{
    const parent=state.categoryPage.split(' > ').slice(0,-1).join(' > ');if(useDesktopWorkspace()&&!parent)goMainCategories104();else openCategoryMenu(parent);
  });
  $('catalogBack').addEventListener('click',()=>{const parent=state.category.split(' > ').slice(0,-1).join(' > ');if(useDesktopWorkspace()&&!parent)goMainCategories104();else openCategoryMenu(parent);});
  $('cartToastClose').addEventListener('click',()=>{
    clearTimeout(cartToastTimer);$('cartToast').hidden=true;
  });
  $('categorySearch').addEventListener('input',()=>renderCategoryTree($('categorySearch').value));
  $('categoryAllProducts').addEventListener('click',()=>state.categoryPage?selectCategory(state.categoryPage):showAllProducts());
  $('productCategoryBrowseAll').addEventListener('click',showAllProducts);
  $('productCategoryBrowseCategories').addEventListener('click',openCategoryBrowser);
  $('productSubcategoriesAll').addEventListener('click',()=>{
    if(state.expandedProductCategory)selectCategory(state.expandedProductCategory);
  });
  $('productSubcategoriesClose').addEventListener('click',()=>{
    state.expandedProductCategory='';
    renderInlineProductSubcategories();
  });
  $('viewGrid').addEventListener('click',()=>{state.productLayout='grid';renderProducts();});
  $('viewList').addEventListener('click',()=>{state.productLayout='list';renderProducts();});
  $('onlyInStock').addEventListener('click',()=>{state.stockOnly=!state.stockOnly;renderProducts();});
  $('sortProducts').addEventListener('change',()=>{state.sort=$('sortProducts').value;renderProducts();});
  $('loadMoreProducts').addEventListener('click',()=>{state.visibleLimit+=48;renderProducts();});
  $('settingsExcel').addEventListener('click',()=>$('excelFile').click());
  $('settingsManage').addEventListener('click',()=>productManager.openManage());
  $('settingsAdd').addEventListener('click',()=>productManager.openNew());
  $('settingsHistory').addEventListener('click',showHistory);
  $('settingsExport').addEventListener('click',exportHistory);
  $('settingsBackup').addEventListener('click',()=>{
    $('backupStatus').textContent='';
    if(!$('backupDialog').open)$('backupDialog').showModal();
  });
  $('backupDownload').addEventListener('click',downloadDeviceBackup);
  $('backupUpload').addEventListener('change',event=>importDeviceBackup(event.target.files?.[0]));
  // Receipt width/title/contact info are persisted in settings above, not in checkout.
  installCategoryFit();
  const hardwareScanner=createSaleScanner({active:()=>isSaleActive()&&!Array.from(document.querySelectorAll('dialog[open]')).some(d=>d!==dom.cartDialog),lookup:exactProduct,looksLike:looksLikeBarcode,accept:code=>addHardwareBarcode(code,$('saleBarcode'))});
  document.addEventListener('keydown',hardwareScanner.key,true);
  window.addEventListener('blur',hardwareScanner.clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hardwareScanner.clear();});
  let barcodeInputIdle=null;
  $('saleBarcodeForm').addEventListener('submit',event=>{
    event.preventDefault();
    clearTimeout(barcodeInputIdle);
    const value=$('saleBarcode').value.trim();
    if(!value)openProductPicker();
    else if(!addHardwareBarcode(value,$('saleBarcode')))openProductPicker(value);
  });
  // USB/Bluetooth scanner with Tab terminator must also handle unknown barcodes.
  $('saleBarcode').addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const code=$('saleBarcode').value.trim();
    if(!code||(!exactProduct(code)&&!looksLikeBarcode(code)))return;
    event.preventDefault();
    clearTimeout(barcodeInputIdle);
    addHardwareBarcode(code,$('saleBarcode'));
  });
  // USB readers without Enter/Tab: after input settles, distinguish
  // a registered product from an unknown full EAN/UPC barcode.
  $('saleBarcode').addEventListener('input',()=>{
    clearTimeout(barcodeInputIdle);
    const barcode=$('saleBarcode').value.trim();
    if(!/^(?:\d{8}|\d{12,14})$/.test(barcode))return;
    barcodeInputIdle=setTimeout(()=>{
      if(!isSaleActive() || $('saleBarcode').value.trim()!==barcode ||
         $('scanQuantityDialog').open || dom.scanDialog.open ||
         $('unknownBarcodeDialog').open)return;
      addHardwareBarcode(barcode,$('saleBarcode'));
    },550);
  });
  $('pickProductSearch').addEventListener('input',()=>{
    pickerVisibleLimit=60;renderProductPicker();
  });
  document.querySelectorAll('[data-picker-mode]').forEach(button=>{
    button.addEventListener('click',()=>{
      pickerMode=button.dataset.pickerMode;
      pickerCategoryMain='';pickerCategorySub='';pickerVisibleLimit=60;
      $('pickProductSearch').value='';
      renderProductPicker();
      // Tap the input for manual search.
    });
  });
  $('pickerCategoryBack').addEventListener('click',()=>{
    if(pickerCategorySub)pickerCategorySub='';
    else pickerCategoryMain='';
    pickerVisibleLimit=60;renderProductPicker();
  });
  $('pickerLoadMore').addEventListener('click',()=>{
    pickerVisibleLimit+=60;renderProductPicker({preserveScroll:true});
  });
  $('saleScanButton').addEventListener('click',openCamera);
  $('scanRetry').addEventListener('click',startScanner);
  $('scanTorch').addEventListener('click',toggleTorch);
  $('scanHistoryButton').addEventListener('click',showScanHistory);
  $('scanHistoryClose').addEventListener('click',startScanner);
  $('scanManualForm').addEventListener('submit',event=>{
    event.preventDefault();
    scanned($('scanManualBarcode').value,{source:'manual',format:'Elle Girildi',force:true});
  });
  $('scanPhotoFile').addEventListener('change',event=>{scanBarcodePhoto(event.target.files?.[0]);event.target.value='';});
  $('unknownBarcodeNo').addEventListener('click',()=>resolveUnknownBarcode(false));
  $('unknownBarcodeYes').addEventListener('click',()=>resolveUnknownBarcode(true));
  $('unknownBarcodeDialog').addEventListener('cancel',event=>{
    event.preventDefault();resolveUnknownBarcode(false);
  });
  $('unknownBarcodeDialog').addEventListener('click',event=>{
    if(event.target===$('unknownBarcodeDialog'))resolveUnknownBarcode(false);
  });
  $('detailAdd').addEventListener('click',()=>{
    const product=state.detailProduct;
    if(!product)return;
    if(isWeightProduct(product)){
      $('productDetailDialog').close();openWeightProduct(product);
    }else if(addToCart(product))$('productDetailDialog').close();
  });
  $('detailImage').addEventListener('click',()=>{if(state.detailProduct?.gorsel)window.open(state.detailProduct.gorsel,'_blank','noopener,noreferrer');});
  dom.search.addEventListener('keydown',event=>{
    if(event.key!=='Enter')return;event.preventDefault();const found=exactProduct(dom.search.value);
    if(found){barcodeAdd(dom.search.value,dom.search);state.search='';renderProducts();}
  });
  $('openCart').addEventListener('click',openSale);
  $('catalogRetry').addEventListener('click',async()=>{
    const button=$('catalogRetry');
    button.disabled=true;
    try { await refreshManagedData(); }
    catch(error) { console.warn('Merkezi katalog hâlâ kullanılamıyor:',error); }
    finally { button.disabled=false; }
  });
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.close==='historyDialog' && useDesktopWorkspace() && state.view==='reports')
      navigate(returnToPreviousWorkspace());
    else $(button.dataset.close).close();
  }));
  dom.scanDialog.addEventListener('close',()=>{
    if(!dom.scanDialog.open && state.scanPurpose==='price-label'){
      state.scanPurpose='sale';
      priceLabelFeature?.open(); // Camera canceled: return to price lookup without changing the sale.
    }
    // A queued close event from a previous scan must not stop the camera
    // already reopened for the next barcode.
    if(dom.scanDialog.open)return;
    dom.scanDialog.classList.remove('is-success');
    stopScanner();
    focusSaleBarcode();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&dom.scanDialog.open)stopScanner();
  });
  window.addEventListener('pagehide',()=>{stopScanner();scaleConnection?.disconnect();});
  dom.cartDialog.addEventListener('close',updateNavigation);
  dom.historyDialog.addEventListener('close',updateNavigation);
  // Preserve the active cashier/report while changing between desktop
  // native pages and handheld dialogs. Move the SAME controls, never clone.
  window.matchMedia(desktopWorkspaceMedia).addEventListener('change',()=>{
    const sale=state.view==='sale'||dom.cartDialog.open;
    const reports=state.view==='reports'||dom.historyDialog.open;
    if(dom.cartDialog.open)dom.cartDialog.close();
    if(dom.historyDialog.open)dom.historyDialog.close();
    placeNativeWorkspacePages();
    if(useDesktopWorkspace()){
      if(sale){state.view='sale';if(location.hash!=='#sale')location.hash='#sale';}
      else if(reports){state.view='reports';if(location.hash!=='#reports')location.hash='#reports';}
    }else{
      if(sale||reports)state.view='home';
      if(sale)dom.cartDialog.showModal();
      else if(reports)dom.historyDialog.showModal();
    }
    updateNavigation();
  });
  // iOS swipe-back / Android back / Escape must not silently lose an active sale.
  dom.cartDialog.addEventListener('cancel',event=>{
    event.preventDefault();requestSaleExit('previous');
  });
  $('saleBack').addEventListener('click',()=>{
    if(state.saving)return;
    // Return to the existing category screen without losing any cart lines.
    if(dom.cartDialog.open)dom.cartDialog.close();
    openProductCategoryHome();
  });
  $('saleClose').addEventListener('click',()=>requestSaleExit('home'));
  $('saleCancel').addEventListener('click',()=>requestSaleExit('cancel'));
  $('saleExitStay').addEventListener('click',()=>$('saleExitDialog').close());
  $('saleExitKeep').addEventListener('click',()=>finishSaleExit());
  $('saleExitDiscard').addEventListener('click',()=>finishSaleExit({discard:true}));
  $('scanButton').addEventListener('click',openCamera);
  $('excelFile').addEventListener('change',()=>selectExcelFile($('excelFile').files[0]));
  $('confirmExcelImport').addEventListener('click',confirmExcelImport);
  $('checkoutDiscountToggle').addEventListener('click',()=>{
    const panel=$('basketDiscountPanel');
    panel.hidden=!panel.hidden;
    $('checkoutDiscountToggle').setAttribute('aria-expanded',String(!panel.hidden));
    if(!panel.hidden)$('basketDiscountPct').focus({preventScroll:true});
  });
  $('checkoutOtherPayment').addEventListener('click',()=>{
    if(!$('otherPaymentDialog').open)$('otherPaymentDialog').showModal();
  });
  $('otherPaymentClose').addEventListener('click',()=>$('otherPaymentDialog').close());
  document.querySelectorAll('[data-payment-option]').forEach(button=>{
    button.addEventListener('click',()=>{
      const radio=[...document.querySelectorAll('input[name="payment"]')].find(el=>el.value===button.dataset.paymentOption);
      if(!radio)return;
      radio.checked=true;
      $('otherPaymentDialog').close();
      radio.dispatchEvent(new Event('change',{bubbles:true}));
    });
  });
  document.querySelectorAll('input[name="payment"]').forEach(el=>{
    el.addEventListener('change',()=>{
      updatePayment();
      if(el.checked&&el.value==='Veresiye')customerManager.load().catch(()=>{});
    });
    if(el.value==='Veresiye')el.addEventListener('click',()=>{
      if(el.checked)customerManager.load().catch(()=>{});
    });
  });
  $('basketDiscountPct').addEventListener('input',()=>{
    const input=$('basketDiscountPct'),error=$('basketDiscountError');
    try{
      state.basketDiscountPct=parseBasketDiscountPercent(input.value);
      state.basketDiscountInvalid=false;
      input.removeAttribute('aria-invalid');
      error.textContent='';error.hidden=true;
    }catch(problem){
      state.basketDiscountInvalid=true;
      input.setAttribute('aria-invalid','true');
      error.textContent=problem.message;error.hidden=false;
    }
    renderCartBar();renderCart();
  });
  dom.cash.addEventListener('input',updatePayment);
  $('cashDirect').addEventListener('click',()=>{
    dom.cash.value=totals().total.toFixed(2);
    completeSale();
  });
  $('cashManual').addEventListener('click',()=>{
    $('cashModeButtons').hidden=true;
    $('cashManualPanel').hidden=false;
    dom.cash.value='';
    updatePayment();
    dom.cash.focus({preventScroll:true});
  });
  $('cashRoundConfirm').addEventListener('click',()=>{
    if(cartCurrency()!=='TRY')return;
    dom.cash.value=next200Cash(totals().total).toFixed(2);
    completeSale();
  });
  $('cashConfirm').addEventListener('click',completeSale);
  $('cashBack').addEventListener('click',()=>{
    $('cashManualPanel').hidden=true;
    $('cashModeButtons').hidden=false;
    dom.cash.value='';
    updatePayment();
  });
  $('weightGrams').addEventListener('input',()=>{
    // Deliberate typing wins over the live reader until the next weighing.
    weightInputMode='manual';
    clearWeightFreshnessTimer();
    scaleCapturedAt=0;
    renderWeightPreview();
    if(scaleConnection?.connected)
      $('weightSerialStatus').textContent='Elle girilen gramaj kullanılacak.';
  });
  $('weightAdd').addEventListener('click',confirmWeight);
  $('weightCancel').addEventListener('click',()=>$('weightDialog').close());
  $('weightClose').addEventListener('click',()=>$('weightDialog').close());
  $('weightDialog').addEventListener('close',()=>{
    clearWeightFreshnessTimer();
    weightProduct=null;scaleLatest=null;scaleCapturedAt=0;weightInputMode='manual';
    focusSaleBarcode();
  });
  $('weightConnect').addEventListener('click',async()=>{
    const button=$('weightConnect');
    button.disabled=true;
    try{
      if(!scaleConnection)scaleConnection=new ScaleSerialConnection({
        onReading:reading=>{
          // No "Teraziden Ağırlığı Al" click: when CAS reports a stable
          // frame, fill grams and calculate the kg price immediately.
          if(!$('weightDialog').open||!weightProduct)return;
          scaleLatest=reading;
          const kg=(reading.grams/1000).toLocaleString('tr-TR',{
            minimumFractionDigits:3,maximumFractionDigits:3})+' kg';
          $('weightLive').textContent=kg;
          if(weightInputMode==='serial'){
            scaleCapturedAt=reading.at;
            $('weightGrams').value=String(reading.grams);
            renderWeightPreview();
            clearWeightFreshnessTimer();
            const capturedAt=reading.at;
            weightFreshnessTimer=setTimeout(()=>{
              if(weightInputMode==='serial'&&scaleCapturedAt===capturedAt)
                invalidateAutoWeight('Ağırlık güncellenmedi. Terazinin sabitlenmesini bekleyin.');
            },5100);
            $('weightSerialStatus').textContent='Sabit ağırlık hazır: '+kg;
          }else{
            $('weightSerialStatus').textContent='Terazi '+kg+' gösteriyor; elle girilen gramaj kullanılacak.';
          }
        },
        onUnstable:()=>{
          if($('weightDialog').open)
            invalidateAutoWeight('Ağırlık sabitleniyor veya terazi boş. Ürünü yerleştirin.');
          else{scaleLatest=null;scaleCapturedAt=0;clearWeightFreshnessTimer();}
        },
        onStatus:status=>{
          const connected=Boolean(scaleConnection?.connected);
          $('weightConnectionState').textContent=connected?'Bağlı':'Bağlı değil';
          $('weightConnect').disabled=connected;
          $('weightDisconnect').disabled=!connected;
          if(/veri akışı durdu|okunamadı|taşması|bağlantısı kapalı/i.test(status)){
            invalidateAutoWeight(status);
          }else $('weightSerialStatus').textContent=status;
        },
        onRaw:raw=>$('weightRaw').textContent='Ham veri: '+raw
      });
      await scaleConnection.connect({
        baudRate:Number($('weightBaud').value),
        dataBits:Number($('weightDataBits').value),
        parity:$('weightParity').value,
        stopBits:Number($('weightStopBits').value)
      });
      $('weightConnectionState').textContent='Bağlı';
      $('weightDisconnect').disabled=false;
    }catch(error){
      $('weightSerialStatus').textContent=error.message||
        'COM portu seçilemedi. Terazi başka bir programda açık olabilir.';
    }finally{
      button.disabled=Boolean(scaleConnection?.connected);
    }
  });
  $('weightDisconnect').addEventListener('click',async()=>{
    if(scaleConnection)await scaleConnection.disconnect();
    invalidateAutoWeight('Terazi bağlantısı kapatıldı. Gramajı elle girebilirsiniz.');
    weightInputMode='manual';
    $('weightConnectionState').textContent='Bağlı değil';
    $('weightConnect').disabled=false;
    $('weightDisconnect').disabled=true;
  });
  $('cashCancel').addEventListener('click',()=>$('cashPaymentDialog').close());
  dom.complete.addEventListener('click',()=>{
    if(state.saving)return;
    if(!state.cart.size){
      if(dom.cartDialog.open)dom.cartDialog.close();
      setView('home');
      return;
    }
    if(document.querySelector('input[name="payment"]:checked').value==='Nakit')openCashPayment();
    else completeSale();
  });
  $('scanQuantityMinus').addEventListener('click',()=>adjustScanQuantity(-1));
  $('scanQuantityPlus').addEventListener('click',()=>adjustScanQuantity(1));
  $('scanQuantityConfirm').addEventListener('click',confirmScannedQuantity);
  $('scanQuantityCancel').addEventListener('click',()=>{
    pendingScanProduct=null;$('scanQuantityDialog').close();
  });
  function beginNextSaleAfterPrint(){
    if($('receiptActionsDialog').open)$('receiptActionsDialog').close();
    openSale();
  }
  $('receiptNetworkPrint').addEventListener('click',()=>{
    if(!state.lastSale)return;
    printSale(state.lastSale);
    beginNextSaleAfterPrint();
  });
  $('receiptBluetoothPrint').addEventListener('click',async()=>{
    if(!state.lastSale)return;const button=$('receiptBluetoothPrint');button.disabled=true;
    $('receiptActionStatus').textContent='Bluetooth yazıcı aranıyor…';
    try{
      await printBluetoothReceipt(state.lastSale);
      $('receiptActionStatus').textContent='Fiş yazıcıya gönderildi.';
      beginNextSaleAfterPrint();
    }
    catch(error){$('receiptActionStatus').textContent=error.message;}
    finally{button.disabled=false;}
  });
  $('receiptWhatsApp').addEventListener('click',async()=>{if(state.lastSale)await shareReceiptWhatsApp(state.lastSale);});
  $('receiptPdfShare').addEventListener('click',()=>{if(state.lastSale)shareReceiptPdf(state.lastSale);});
  $('receiptClose').addEventListener('click',beginNextSaleAfterPrint);
  $('historyFilters').addEventListener('submit',event=>{
    event.preventDefault();
    try{renderFilteredHistory(readHistoryFilters());}
    catch(error){announce(error.message,'error');}
  });
  $('historyReset').addEventListener('click',()=>{
    $('historyFilters').reset();
    for(const button of document.querySelectorAll('[data-report-period]'))
      button.setAttribute('aria-pressed','false');
    try{renderFilteredHistory(readHistoryFilters());}
    catch(error){announce(error.message,'error');}
  });
  for(const button of document.querySelectorAll('[data-report-period]')){
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{
      const dates=quickReportRange(button.dataset.reportPeriod);
      $('historyFrom').value=dates.from;
      $('historyTo').value=dates.to;
      for(const chip of document.querySelectorAll('[data-report-period]'))
        chip.setAttribute('aria-pressed',String(chip===button));
      try{renderFilteredHistory(readHistoryFilters());}
      catch(error){announce(error.message,'error');}
    });
  }
  for(const id of ['historyFrom','historyTo'])
    $(id).addEventListener('change',()=>{
      for(const button of document.querySelectorAll('[data-report-period]'))
        button.setAttribute('aria-pressed','false');
    });
  $('exportSales').addEventListener('click',exportHistory);
  $('saleVoidForm').addEventListener('submit',submitSaleVoid);
  $('saleVoidCancel').addEventListener('click',()=>{
    if(!$('saleVoidConfirm').disabled)$('saleVoidDialog').close();
  });
  $('saleVoidDialog').addEventListener('close',()=>{pendingVoidSale=null;});
  for(const dialog of [dom.cartDialog,dom.scanDialog,dom.historyDialog,$('backupDialog'),$('otherPaymentDialog'),$('saleExitDialog'),$('excelDialog'),$('manageDialog'),$('passiveProductDialog'),$('productDetailDialog'),$('pickProductDialog'),$('receiptActionsDialog'),$('cashPaymentDialog'),$('weightDialog'),$('scanQuantityDialog'),$('manageActivationDialog'),$('customerDialog'),$('categoryImageDialog'),$('stockEditDialog')]){
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      if(dialog===dom.cartDialog)return; // Avoid accidental outside-tap sale exit.
      dialog.close();
    });
  }
  if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  try{
    const snapshot=await refreshManagedData();
    if(snapshot.legacyPending)announce('Eski cihazdaki ürün düzenlemelerini kontrol edin. Yedek için Ayarlar > Ürün Yönetimi bölümünü kullanın.','error');
  }catch(error){
    state.catalogError=error.message;
    // Never treat a bundled baseline as authoritative for passive/deleted
    // product states. It is a browse-only fallback until D1 recovers.
    try {
      const {products}=await fetchBundledCatalog();
      if(!products.length)throw Error('Yerleşik ürün kataloğu boş.');
      setCatalog(products,[],null,0,products.length,null,false);
      dom.complete.disabled=true;
    }catch(fallbackError) {
      console.warn('Yerleşik katalog açılamadı:',fallbackError);
      announce('Ürün kataloğu açılamadı. Merkezi D1 bağlantısını kontrol edin.','error');
      dom.complete.disabled=true;
    }
  }
  applyRoute();
  channel?.addEventListener('message',async()=>{
    try{const snapshot=await getSnapshot();setCatalog(snapshot.products,snapshot.adjustments,null,snapshot.excelCount,snapshot.bundleCount,snapshot.lifecycleMeta);}
    catch{/* other tab closing */}
  });
}
// Do not mount the POS until a signed user session has been verified.
requireAccess().then(()=>setup()).catch(error=>{
  console.error('HızlıSatış girişi tamamlanamadı:',error);
});
