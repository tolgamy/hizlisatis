import { getSnapshot, getLocalSnapshot, upsertExcelProducts, installBundledProducts, saveSale, getSales, restoreSalesBackup, openDB } from './idb.js';
import { createDeviceBackup, parseDeviceBackup } from './device-backup.js';
import { readXlsxRows } from './xlsx-reader.js';
import { parseExcelProducts } from './excel-products.js';
import { parseLocaleNumber, safeImageUrl } from './normalize.js';
import { buildCategoryTree, categoryMatches, showCategoryInBrowse } from './category-menu.js';
import { categoryArtwork, sortCategoryNodes } from './category-art.js';
import { subcategoryPhoto } from './subcategory-photos.js';
import { categoryOverrideUrl } from './category-image-overrides.js';
import { createCategoryImageManager } from './category-image-manager.js';
import { categorizeProduct, productPictureEmoji } from './catalog-taxonomy.js';
import { receiptAsText, escPosReceipt } from './receipt-share.js';
import { receiptPdfBlob } from './receipt-pdf.js';
import { fetchBundledCatalog } from './bundled-catalog.js';
import { findBarcodeProduct } from './barcode-lookup.js';
import { applyProductImage, detectImageResizing } from './image-delivery.js';
import { isActive, productStatus } from './product-lifecycle.js';
import { getBarcodeLibrary, supportedBarcodeFormats, acceptsBarcodeResult, isRepeatScan, readScanHistory, rememberScan } from './barcode-scanner.js';
import { createProductManager } from './product-management.js';
import { checkRemoteProductStates } from './remote-products.js';
import { createCustomerManager } from './customer-ui.js';
import { recordCustomerCredit } from './customer-api.js';
import { readReceiptSettings,saveReceiptSettings,receiptPrintLayout } from './receipt-settings.js';
import { next200Cash } from './cash-change.js';
import { isWeightProduct,scaleSupported,ScaleSerialConnection,parseManualGrams,scaleGramsToQuantity,calculateWeightTotal } from './scale-serial.js';
import { writeActiveProductsLocalStorage } from './active-products-cache.js';

const $ = id => document.getElementById(id);
const state = {
  products: [], byId: new Map(), byBarcode: new Map(), categoryProductPhotos: new Map(), lifecycleMeta: null, legacyPending: false,
  catalogLoading:true,catalogProgress:0,catalogError:'',centralReadOnly:false,
  sold: new Map(), cart: new Map(), category: '', brand: '',
  search: '', meta: null, sales: [], lastSale: null, pendingCreditSale:null,
  saving: false, scanner: null, scanPurpose: 'sale',
  excelCount: 0, bundleCount: 0, bundleLoading: false, categoryPage: '', excelPreview: null, excelUploading: false, browseAll: false,
  view: 'home', catalogMode: 'categories', catalogEntry: 'categories', categoryTreeData: [],
  productLayout: 'grid', stockOnly: false, sort: 'name', visibleLimit: 48, detailProduct: null, manageSelection: null
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
let productManager,customerManager,pendingScanProduct=null;
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
  let base = 0, discount = 0, total = 0, vat = 0;
  for (const line of state.cart.values()) {
    const row = lineTotals(line);
    base += row.base; discount += row.discounted; total += row.total; vat += row.vat;
  }
  return { base: round2(base), discount: round2(discount), total: round2(total), vat: round2(vat) };
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

/** Navigation and home dashboard never replace IndexedDB records. */
function updateNavigation() {
  document.body.classList.toggle('view-home', state.view === 'home');
  document.body.classList.toggle('view-settings', state.view === 'settings');
  $('homeView').hidden = state.view !== 'home';
  $('catalogView').hidden = state.view !== 'catalog';
  $('settingsView').hidden = state.view !== 'settings';
  // The approved mobile navigation has four destinations only; all category
  // levels remain inside Products, and desktop uses the same routes.
  const active = dom.cartDialog.open ? 'sale' :
    state.view==='catalog' ? 'products' : state.view;
  for (const [id,value] of [['navHome','home'],['navSale','sale'],['navProducts','products'],['navSettings','settings']]) {
    const el=$(id); const yes=active===value; el.classList.toggle('active',yes);
    if(yes) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  }
}
function navigate(hash) { if(location.hash!==hash) location.hash=hash; else applyRoute(); }
function applyRoute() {
  const fragment=decodeURIComponent(location.hash.slice(1));
  if(fragment==='product-categories'){
    state.view='catalog';state.catalogMode='category-home';state.catalogEntry='products';state.categoryPage='';
  } else if (fragment.startsWith('categories')) {
    state.view='catalog';state.catalogMode='categories';state.catalogEntry='products';
    state.categoryPage=fragment.startsWith('categories/') ? fragment.slice('categories/'.length) : '';
    renderCategoryTree();
  } else if (fragment.startsWith('products')) {
    state.view='catalog';state.catalogMode='products';state.browseAll=true;
    state.category=fragment.startsWith('products/') ? fragment.slice('products/'.length) : '';
  } else if (fragment==='settings') state.view='settings';
  else state.view='home';
  updateNavigation();renderProducts();
  if(state.view==='home') refreshHomeSales().catch(()=>{});
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
  if(!dom.cartDialog.open || $('receiptActionsDialog').open ||
     $('scanQuantityDialog').open || dom.scanDialog.open || $('pickProductDialog').open ||
     $('weightDialog').open) return;
  $('saleBarcode').focus({preventScroll:true});
}
function openSale({preferCamera=false}={}) {
  renderCart();
  if (!dom.cartDialog.open) dom.cartDialog.showModal();
  $('saleBarcode').value='';
  updateNavigation();
  if(!preferCamera)focusSaleBarcode();
}
// A closed sale never destroys the cart unless the operator explicitly
// chooses to cancel the sale and clear it in the confirmation dialog.
let pendingSaleExitTarget='previous';
function finishSaleExit({discard=false}={}) {
  if($('saleExitDialog').open)$('saleExitDialog').close();
  if(discard) {
    state.cart.clear();
    state.pendingCreditSale=null;
    dom.cash.value='';
    customerManager?.clearSelection();
    document.querySelector('input[name="payment"][value="Nakit"]').checked=true;
    renderCartBar();renderCart();
  }
  if(dom.cartDialog.open)dom.cartDialog.close();
  if(pendingSaleExitTarget==='home')setView('home');
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
function renderProductPicker() {
  const query = fold($('pickProductSearch').value);
  const items = state.products.filter(p => isActive(p) && remaining(p) > 0 && !p.fiyatBelirsiz && (!query ||
    [p.baslik, p.barkod, p.urunKodu, p.marka].some(v => fold(v).includes(query))));
  const target = $('pickProductResults'); target.replaceChildren();
  for (const product of items.slice(0, 60)) {
    const button = document.createElement('button'); button.className = 'picker-product'; button.type = 'button';
    let pic;
    if(product.gorsel){
      pic=document.createElement('img'); applyProductImage(pic,product.gorsel,192);
    }else{pic=document.createElement('span');pic.className='picker-emoji';pic.textContent=productPictureEmoji(product);}
    const name=document.createElement('span'); name.textContent=product.baslik;
    const price=document.createElement('strong'); price.textContent=priceLabel(product);
    button.append(pic,name,price);
    button.addEventListener('click', () => {
      if(isWeightProduct(product)){
        $('pickProductDialog').close();openWeightProduct(product);
      }else if(addToCart(product)){$('pickProductDialog').close();openSale();}
    });
    target.append(button);
  }
  if (!items.length) target.textContent='Ürün bulunamadı';
}
function openProductPicker(initialQuery='') {
  $('pickProductSearch').value=typeof initialQuery==='string'?initialQuery:''; renderProductPicker();
  if (!$('pickProductDialog').open) $('pickProductDialog').showModal();
  $('pickProductSearch').focus({preventScroll:true});
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
  input.focus({preventScroll:true});
  input.select();
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
    'Bağlı: sabit ağırlık otomatik hesaplanacak. Sepete Ekle yeterli.':
    'Teraziyi bir kez bağlayın; sonraki tartımlarda ağırlık otomatik gelir.';
  $('weightHelp').textContent=supported?
    'Terazi bağlıysa ağırlık otomatik gelir. Gerekirse gramajı elle yazabilirsiniz.':
    'Örneğin 564 gram = 0,564 kg. Gramajı elle girin.';
  renderWeightPreview();
  if(!$('weightDialog').open)$('weightDialog').showModal();
  if(!supported)$('weightGrams').focus({preventScroll:true});
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
function barcodeAdd(raw,sourceInput){
  const code=String(raw??'').trim();
  if(!code)return false;
  const product=exactProduct(code);
  if(!product){announce(code+' barkodlu ürün bulunamadı.','error');return false;}
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
  button.addEventListener('click', () => hasChildren ? openCategoryMenu(node.path) : selectCategory(node.path));
  return button;
}
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
  // A deleted record should not inflate the central catalogue count.
  $('homeTotalProducts').textContent=state.products.length?
    state.products.filter(product=>productStatus(product)!=='deleted').length.toLocaleString('tr-TR'):'—';
}
let homeSalesReadId=0;
async function refreshHomeSales() {
  // Sales are stored in this device's IndexedDB, not in a central sales table.
  // Never fabricate mockup values or count another device's transactions.
  const requestId=++homeSalesReadId;
  $('homeTodaySales').textContent='…';
  try {
    const sales=await getSales();
    if(requestId!==homeSalesReadId)return;
    const today=new Date().toDateString();
    const amount=sales.reduce((sum,sale)=>{
      const date=new Date(sale.createdAt);
      return Number.isFinite(date.getTime()) && date.toDateString()===today &&
        (!sale.currency||sale.currency==='TRY')&&Number.isFinite(Number(sale.total))
        ? sum+Number(sale.total):sum;
    },0);
    $('homeTodaySales').textContent=money(round2(amount),'TRY');
  } catch {
    if(requestId===homeSalesReadId)$('homeTodaySales').textContent='—';
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
  $('detailMeta').textContent = stockLabel(product);
  $('detailPrice').textContent = priceLabel(product);
  $('detailAdd').disabled = state.centralReadOnly || !isActive(product) || remaining(product) < 1 || product.fiyatBelirsiz;
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
  $('categoryTrailName').textContent=current?.path||'Kategoriler';
  $('categoryBack').hidden=!current;
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
  if(state.view!=='catalog'||state.catalogMode!=='products') return;
  const query=fold(state.search);
  const items=state.products.filter(p=>{
    if(!isActive(p))return false;
    if(state.stockOnly&&remaining(p)<1)return false;
    if(query)return [p.barkod,p.urunKodu,p.baslik,p.marka].some(v=>fold(v).includes(query));
    return (!state.category||categoryMatches(p,state.category))&&(!state.brand||p.marka===state.brand);
  });
  items.sort((a,b)=>{
    const av=Number(remaining(b)>0)-Number(remaining(a)>0);
    if(state.sort==='price-low')return a.satisFiyati-b.satisFiyati||a.baslik.localeCompare(b.baslik,'tr');
    if(state.sort==='price-high')return b.satisFiyati-a.satisFiyati||a.baslik.localeCompare(b.baslik,'tr');
    if(state.sort==='stock')return (b.stokBelirsiz?-1:remaining(b))-(a.stokBelirsiz?-1:remaining(a));
    return av||a.baslik.localeCompare(b.baslik,'tr');
  });
  renderProductBreadcrumb(state.category,query?'Arama Sonuçları':'Ürünler');
  dom.count.textContent=items.length.toLocaleString('tr-TR');
  for(const [id,mode] of [['viewGrid','grid'],['viewList','list']]) {
    $(id).setAttribute('aria-pressed',String(state.productLayout===mode));$(id).classList.toggle('active',state.productLayout===mode);
  }
  $('onlyInStock').setAttribute('aria-pressed',String(state.stockOnly));
  dom.productList.className=`products ${state.productLayout==='grid'?'grid-view':'list-view'}`;
  const frag=document.createDocumentFragment();
  for(const p of items.slice(0,state.visibleLimit)) {
    const available=!state.centralReadOnly&&remaining(p)>0&&!p.fiyatBelirsiz;
    const row=document.createElement('article');row.className='product-card';
    row.innerHTML=`<div class="product-photo"><span class="product-emoji" aria-hidden="true">${productPictureEmoji(p)}</span></div>
      <div class="product-info"><div class="product-title">${esc(p.baslik)}</div></div>
      <div class="product-right"><span class="price">${esc(priceLabel(p))}</span><button class="add-button" type="button" aria-label="${esc(p.baslik)} sepete ekle" ${available?'':'disabled'}>+</button></div>`;
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
function renderCartBar() {
  const count = cartQty();
  $('openCart').hidden = count === 0;
  $('openCart').classList.toggle('is-empty', count === 0);
  dom.cartCount.textContent = String(count);
  dom.cartItemLabel.textContent = `${count} adet ürün`;
  dom.cartTotal.textContent = money(totals().total, cartCurrency());
  document.querySelector('.cart-label strong').textContent = count ? 'Satışa Devam Et' : 'Yeni Satış';
  $('saleLineCount').textContent = String(count);
}
function addToCart(product, quantity=1,{separate=false,grams=null}={}) {
  if(state.centralReadOnly) { announce('Merkezi ürün bağlantısı yok. Satış için yeniden bağlanın.','error'); return false; }
  const weighted=['kg','g','litre'].includes(product.birim);
  if(!Number.isFinite(quantity)||quantity<=0||(!weighted&&!Number.isInteger(quantity))) {
    announce('Geçerli bir miktar girin.','error');return false;
  }
  if(!isActive(product)) { announce('Ürün pasif. Satış için önce aktifleştirin.','error'); return false; }
  const current = state.cart.get(product.id);
  const already=[...state.cart.values()].filter(line=>line.id===product.id)
    .reduce((sum,line)=>sum+line.quantity,0);
  if (product.fiyatBelirsiz) { announce('Bu ürünün satış fiyatı girilmemiş. Ayarlar’dan fiyatı düzenleyin.', 'error'); return false; }
  if (state.cart.size && product.paraBirimi !== cartCurrency()) {
    announce('Farklı para birimleri tek sepette birleştirilemez.', 'error'); return false;
  }
  if (remaining(product) + 0.000001 < already+quantity) {
    announce('Bu ürün için yeterli yerel stok yok.', 'error'); return false;
  }
  if (current&&!separate) current.quantity=Math.round((current.quantity+quantity)*1000)/1000;
  else {
    const cartKey=separate?'weight::'+product.id+'::'+(globalThis.crypto?.randomUUID?.()||
      (Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))):product.id;
    state.cart.set(cartKey,{id:product.id,cartKey,product:{...product},
      quantity,grams:separate?grams:null,weighed:separate,
      unitPrice:product.satisFiyati,discountPct:0});
  }
  renderCartBar();
  if (dom.cartDialog.open) renderCart();
  playCartSound(current&&!separate?'increase':'add');
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
    const otherQuantity=[...state.cart.entries()].filter(([key,entry])=>key!==id&&entry.id===line.id)
      .reduce((total,[,entry])=>total+entry.quantity,0);
    if (num+otherQuantity>remaining(state.byId.get(line.id) || line.product)+0.000001) {
      announce('İstenen adet kullanılabilir stoğu aşıyor.', 'error'); renderCart(); return;
    }
    if(num!==line.quantity)playCartSound(num>line.quantity?'increase':'decrease');
    line.quantity = num;
    if(line.weighed)line.grams=line.product.birim==='g'?Math.round(num):Math.round(num*1000);
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
      <strong class="sale-line-price">${esc(amount)}</strong>
    </div>
    ${line.weighed?'<small class="cart-weight-badge">⚖ '+esc(
      line.product.birim==='kg'?line.quantity.toFixed(3)+' kg':line.quantity+' g'
    )+' · Ayrı tartım</small>':''}
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
  dom.totals.innerHTML = `<div class="total-row grand"><span>Toplam</span><strong>${esc(money(sum.total, currency))}</strong></div>`;
  const hasCartItems=state.cart.size>0;
  dom.complete.disabled=state.saving;
  dom.complete.classList.toggle('is-empty-cart',!hasCartItems);
  $('checkoutActionLabel').textContent=hasCartItems?'Satışı Tamamla':'Ana Sayfaya Dön';
  dom.complete.setAttribute('aria-label',hasCartItems?'Satışı Tamamla':'Ana Sayfaya Dön');
  updatePayment();
}
function updatePayment() {
  const selected = document.querySelector('input[name="payment"]:checked').value;
  $('creditBox').hidden=selected!=='Veresiye';
  $('bankPaymentNotice').hidden=selected!=='Havale / FAST';
  const paid=dom.cash.value.trim()===''?NaN:parseLocaleNumber(dom.cash.value,NaN);
  const total=totals().total;
  const change=Number.isFinite(paid)?round2(paid-total):NaN;
  $('cashPayTotal').textContent=money(total,cartCurrency());
  dom.change.textContent=Number.isNaN(change)?'Alınan tutarı girin':change>=0?
    'Para üstü: '+money(change,cartCurrency()):'Eksik ödeme: '+money(-change,cartCurrency());
  dom.change.style.color=change<0?'#a73b46':'#136c49';
  $('cashConfirm').disabled=!Number.isFinite(change)||change<-.009||!state.cart.size;
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
    if(!dom.cartDialog.open)openSale();
    // Even the legacy quantity editor must never automatically restart camera.
    focusSaleBarcode();
  }
}
function renderAll() { renderHome(); renderFilters(); renderProducts(); renderCartBar(); setSyncStatus(); updateNavigation(); if (dom.cartDialog.open) renderCart(); }
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
  const requested=new Map();
  for(const line of state.cart.values())
    requested.set(line.id,(requested.get(line.id)||0)+line.quantity);
  for(const [id,quantity] of requested){
    const current=state.byId.get(id)||[...state.cart.values()].find(line=>line.id===id)?.product;
    if(!current||quantity>remaining(current)+0.000001){
      announce((current?.baslik||'Ürün')+' için yeterli stok yok.','error');return;
    }
  }
  // Keep the same id if a central credit write succeeded but local storage failed;
  // the server ledger rejects duplicates and avoids double-charging a customer.
  const creditFingerprint=payment==='Veresiye'?
    JSON.stringify([creditCustomer.id,sum.total,[...state.cart.values()].map(x=>[x.id,x.quantity,x.unitPrice,x.discountPct])]):'';
  if(payment==='Veresiye'&&state.pendingCreditSale?.fingerprint!==creditFingerprint)
    state.pendingCreditSale={fingerprint:creditFingerprint,id:crypto.randomUUID()};
  const record = {
    id: payment==='Veresiye'?state.pendingCreditSale.id:
      typeof crypto.randomUUID === 'function' ? crypto.randomUUID() :
      `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(), payment,
    currency: cartCurrency(),creditName:payment==='Veresiye'?creditName:'',
    creditCustomerId:creditCustomer?.id||'',receiptSettings:readReceiptSettings(),
    cashReceived: cash, change: payment === 'Nakit' ? round2(cash - sum.total) : 0,
    ...sum,
    items: [...state.cart.values()].map(line => ({
      id: line.id, urunKodu: line.product.urunKodu, barkod: line.product.barkod,
      baslik: line.product.baslik, marka: line.product.marka, beden: line.product.beden, renk: line.product.renk,
      quantity: line.quantity, unitPrice: line.unitPrice, discountPct: line.discountPct,
      birim:line.product.birim,grams:line.weighed?line.grams:null,
      kdv: line.product.kdv, ...lineTotals(line)
    }))
  };
  state.saving = true; dom.complete.disabled = true;
  try {
    if(payment==='Veresiye')await recordCustomerCredit(creditCustomer.id,record);
    await serializeMutation(() => saveSale(record));
    state.pendingCreditSale=null;
    for (const line of record.items) state.sold.set(line.id, (state.sold.get(line.id) || 0) + line.quantity);
    state.lastSale = record; state.cart.clear();
    dom.cash.value='';customerManager?.clearSelection();
    if($('cashPaymentDialog').open)$('cashPaymentDialog').close();
    dom.cartDialog.close();
    renderProducts(); renderCartBar(); renderHome();
    refreshHomeSales().catch(()=>{});
    channel?.postMessage('sale-updated');
    announce(`Satış kaydedildi: ${money(record.total, record.currency)}`, 'success');
    $('receiptActionsTotal').textContent = money(record.total, record.currency);
    $('receiptActionStatus').textContent = '';
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
  // Physical paper is still 58/80 mm; text stays inside a narrower safe zone.
  // The printer driver's actual paper preset must also match the roll.
  const mm=layout.paperMm;
  const height=Math.max(80,Math.min(1000,60+sale.items.length*11));
  $('receiptPaperSize').textContent = `@media print { @page { size: ${mm}mm ${height}mm; margin: 0; } }`;
  const root = $('receiptPrint');
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
    <div class="receipt-row"><span>İskonto</span><span>-${esc(money(sale.discount, sale.currency))}</span></div>
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
  // Isolate roll paper from the POS layout; system printer must still select 80/58-mm media.
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
    const initialHeight = Math.min(2500, Math.max(85, 65 + (sale.items?.length || 1) * 12));
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
      '.receipt-grand{font-size:' + (mm===58?10:11) + 'pt;font-weight:900}' +
      '@media print{html,body{width:' + mm + 'mm!important;max-width:' + mm + 'mm!important;background:#fff!important}' +
      '.print-controls{display:none!important}#receipt{width:' + printableMm + 'mm!important;max-width:' + printableMm + 'mm!important;' +
      'margin:0 0 0 ' + leftInsetMm + 'mm!important;padding:1mm ' + innerPaddingMm + 'mm!important;' +
      'box-shadow:none!important;overflow:hidden!important}}</style>';
    const page = '<!doctype html><html lang="tr"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Hizlisatis ' + mm + ' mm Fiş</title>' + style + '</head><body>' +
      '<div class="print-controls"><button id="doPrint" type="button">Fişi Yazdır</button>' +
      '<p>Kağıt: ' + mm + ' mm. Yazıcı / AirPrint kağıt ayarında da ' + mm +
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
      const height = Math.min(2500, Math.max(110, Math.ceil(sheet.scrollHeight * 25.4 / 96 + 5)));
      preview.document.getElementById('printPaper').textContent =
        '@page{size:' + mm + 'mm ' + height + 'mm;margin:0}';
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
async function showHistory() {
  try {
    state.sales = (await getSales()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $('historyCount').textContent = `${state.sales.length} satış`;
    dom.historyItems.replaceChildren();
    if (!state.sales.length) dom.historyItems.innerHTML =
      '<div class="empty-state"><strong>Henüz satış kaydı yok</strong>Tamamlanan satışlar burada tutulacak.</div>';
    for (const sale of state.sales.slice(0, 250)) {
      const item = document.createElement('article'); item.className = 'history-card';
      item.innerHTML = `<div class="history-head"><span>${esc(money(sale.total, sale.currency))}</span>
        <span>${esc(sale.payment)}</span></div><small>${esc(fmtDate(sale.createdAt))} · ${sale.items.length} satır
        ${sale.creditName ? `· ${esc(sale.creditName)}` : ''}</small>
        <p>${esc(sale.items.map(i => `${i.quantity}× ${i.baslik}`).join(', '))}</p>
        <button type="button">Fişi Yazdır</button>`;
      item.querySelector('button').addEventListener('click', () => printSale(sale));
      dom.historyItems.append(item);
    }
    dom.historyDialog.showModal();
  } catch (error) { announce(`Satış geçmişi açılamadı: ${error.message}`, 'error'); }
}
function csvCell(value) {
  let str = String(value ?? '');
  if (/^\s*[=+\-@]/.test(str)) str = `'${str}`; // spreadsheet formula injection guard
  return `"${str.replace(/"/g, '""')}"`;
}
async function exportHistory() {
  try {
  const savedSales=await getSales();
  const header = ['Fiş No','Tarih','Ödeme','Müşteri','Para Birimi','Toplam','Ürün Kodu',
    'Barkod','Ürün','Adet','Birim Fiyat','İskonto %','Satır Toplamı','KDV'];
  const rows = [header, ...savedSales.flatMap(sale => sale.items.map(item => [
    sale.id, sale.createdAt, sale.payment, sale.creditName, sale.currency, sale.total,
    item.urunKodu, item.barkod, item.baslik, item.quantity, item.unitPrice,
    item.discountPct, item.total, item.kdv
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
      $('saleBarcode').value=text;
      dom.scanMessage.textContent='Barkod '+text+' okundu ancak katalogda ürün bulunamadı.';
      if(dialogWasOpen)stopScanner().catch(()=>{});
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
async function setup() {
  customerManager=createCustomerManager({announce});
  const settings=readReceiptSettings();
  $('settingsPrintWidth').value=settings.width;
  $('settingsReceiptTitle').value=settings.title;
  $('settingsReceiptPhone').value=settings.phone;
  $('settingsReceiptWebsite').value=settings.website;
  const settingsSaveButton=$('settingsReceiptSave'),saveStatus=$('settingsReceiptStatus');
  const receiptFields=['settingsPrintWidth','settingsReceiptTitle','settingsReceiptPhone','settingsReceiptWebsite'];
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
      phone:$('settingsReceiptPhone').value,website:$('settingsReceiptWebsite').value
    };
    try{
      const saved=saveReceiptSettings(data);
      const verified=readReceiptSettings();
      if(JSON.stringify(saved)!==JSON.stringify(verified))
        throw Error('Kaydedilen ayarlar doğrulanamadı.');
      $('settingsReceiptTitle').value=saved.title;
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
  $('navSettings').addEventListener('click',()=>setView('settings'));
  // The six approved home shortcuts all open an existing, working workflow.
  $('homeQuickCategories').addEventListener('click',openProductCategoryHome);
  $('homeQuickSale').addEventListener('click',openSale);
  $('homeQuickProducts').addEventListener('click',()=>productManager.openManage());
  $('homeQuickBarcode').addEventListener('click',()=>productManager.openNew());
  $('homeQuickStock').addEventListener('click',()=>{
    state.stockOnly=false;state.sort='stock';$('sortProducts').value='stock';
    state.catalogEntry='products';showAllProducts();
  });
  $('homeQuickReports').addEventListener('click',showHistory);
  $('homeTodaySalesButton').addEventListener('click',showHistory);
  $('homeTotalProductsButton').addEventListener('click',openProductCategoryHome);
  $('sidebarStock').addEventListener('click',()=>$('homeQuickStock').click());
  $('sidebarReports').addEventListener('click',()=>$('homeQuickReports').click());
  $('categoryBack').addEventListener('click',()=>{
    const parent=state.categoryPage.split(' > ').slice(0,-1).join(' > ');openCategoryMenu(parent);
  });
  $('catalogBack').addEventListener('click',()=>openCategoryMenu(state.category.split(' > ').slice(0,-1).join(' > ')));
  $('cartToastClose').addEventListener('click',()=>{
    clearTimeout(cartToastTimer);$('cartToast').hidden=true;
  });
  $('categorySearch').addEventListener('input',()=>renderCategoryTree($('categorySearch').value));
  $('categoryAllProducts').addEventListener('click',()=>state.categoryPage?selectCategory(state.categoryPage):showAllProducts());
  $('viewGrid').addEventListener('click',()=>{state.productLayout='grid';renderProducts();});
  $('viewList').addEventListener('click',()=>{state.productLayout='list';renderProducts();});
  $('onlyInStock').addEventListener('click',()=>{state.stockOnly=!state.stockOnly;renderProducts();});
  $('sortProducts').addEventListener('change',()=>{state.sort=$('sortProducts').value;renderProducts();});
  $('loadMoreProducts').addEventListener('click',()=>{state.visibleLimit+=48;renderProducts();});
  $('settingsExcel').addEventListener('click',()=>$('excelFile').click());
  $('settingsHome').addEventListener('click',()=>setView('home'));
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
  $('saleBarcodeForm').addEventListener('submit',event=>{
    event.preventDefault();
    const value=$('saleBarcode').value.trim();
    if(!value)openProductPicker();
    else if(!addHardwareBarcode(value,$('saleBarcode')))openProductPicker(value);
  });
  // Barcode readers with a Tab terminator work like Enter-based readers.
  $('saleBarcode').addEventListener('keydown',event=>{
    if(event.key!=='Tab'||!$('saleBarcode').value.trim())return;
    if(!exactProduct($('saleBarcode').value))return;
    event.preventDefault();
    addHardwareBarcode($('saleBarcode').value,$('saleBarcode'));
  });
  // Many USB readers do not append Enter/Tab. Recognize complete numeric
  // retail codes after a brief input pause, but only when an exact SKU exists.
  // Incomplete codes and text searches are never automatically added.
  let barcodeInputIdle=null;
  $('saleBarcode').addEventListener('input',()=>{
    clearTimeout(barcodeInputIdle);
    const barcode=$('saleBarcode').value.trim();
    if(!/^(?:\d{8}|\d{12,14})$/.test(barcode))return;
    barcodeInputIdle=setTimeout(()=>{
      if(!dom.cartDialog.open || $('saleBarcode').value.trim()!==barcode ||
        $('scanQuantityDialog').open || dom.scanDialog.open)return;
      if(exactProduct(barcode))addHardwareBarcode(barcode,$('saleBarcode'));
    },220);
  });
  $('pickProductSearch').addEventListener('input',renderProductPicker);
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
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
  dom.scanDialog.addEventListener('close',()=>{
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
  // iOS swipe-back / Android back / Escape must not silently lose an active sale.
  dom.cartDialog.addEventListener('cancel',event=>{
    event.preventDefault();requestSaleExit('previous');
  });
  $('saleBack').addEventListener('click',()=>requestSaleExit('previous'));
  $('saleClose').addEventListener('click',()=>requestSaleExit('home'));
  $('saleCancel').addEventListener('click',()=>requestSaleExit('cancel'));
  $('saleExitStay').addEventListener('click',()=>$('saleExitDialog').close());
  $('saleExitKeep').addEventListener('click',()=>finishSaleExit());
  $('saleExitDiscard').addEventListener('click',()=>finishSaleExit({discard:true}));
  $('scanButton').addEventListener('click',openCamera);
  $('excelFile').addEventListener('change',()=>selectExcelFile($('excelFile').files[0]));
  $('confirmExcelImport').addEventListener('click',confirmExcelImport);
  document.querySelectorAll('input[name="payment"]').forEach(el=>{
    el.addEventListener('change',()=>{
      updatePayment();
      if(el.checked&&el.value==='Veresiye')customerManager.load().catch(()=>{});
    });
    if(el.value==='Veresiye')el.addEventListener('click',()=>{
      if(el.checked)customerManager.load().catch(()=>{});
    });
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
            $('weightSerialStatus').textContent='Sabit ağırlık hazır: '+kg+'. Sadece Sepete Ekle düğmesine basın.';
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
  $('exportSales').addEventListener('click',exportHistory);
  for(const dialog of [dom.cartDialog,dom.scanDialog,dom.historyDialog,$('backupDialog'),$('saleExitDialog'),$('excelDialog'),$('manageDialog'),$('passiveProductDialog'),$('productDetailDialog'),$('pickProductDialog'),$('receiptActionsDialog'),$('cashPaymentDialog'),$('weightDialog'),$('scanQuantityDialog'),$('manageActivationDialog'),$('customerDialog'),$('categoryImageDialog')]){
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
setup();
