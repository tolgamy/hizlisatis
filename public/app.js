import { getSnapshot, upsertExcelProducts, installBundledProducts, saveSale, getSales, openDB } from './idb.js';
import { readXlsxRows } from './xlsx-reader.js';
import { parseExcelProducts } from './excel-products.js';
import { parseLocaleNumber, safeImageUrl } from './normalize.js';
import { buildCategoryTree, categoryMatches, showCategoryInBrowse } from './category-menu.js';
import { categoryArtwork, sortCategoryNodes } from './category-art.js';
import { categorizeProduct, productPictureEmoji } from './catalog-taxonomy.js';
import { receiptAsText, escPosReceipt } from './receipt-share.js';
import { fetchBundledCatalog } from './bundled-catalog.js';
import { findBarcodeProduct } from './barcode-lookup.js';
import { applyProductImage, detectImageResizing } from './image-delivery.js';
import { isActive, productStatus } from './product-lifecycle.js';
import { createProductManager } from './product-management.js';

const $ = id => document.getElementById(id);
const state = {
  products: [], byId: new Map(), byBarcode: new Map(), categoryProductPhotos: new Map(), lifecycleMeta: null,
  sold: new Map(), cart: new Map(), category: '', brand: '',
  search: '', meta: null, sales: [], lastSale: null,
  saving: false, scanner: null, scanPurpose: 'sale',
  excelCount: 0, bundleCount: 0, bundleLoading: false, categoryPage: '', excelPreview: null, excelUploading: false, browseAll: false,
  view: 'home', catalogMode: 'categories', categoryTreeData: [],
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
let toastTimer;
let productManager;
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
function fold(text) {
  return String(text ?? '').toLocaleLowerCase('tr-TR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim();
}
function remaining(product) { return product.stokBelirsiz ? Infinity : Math.max(0, product.stok - (state.sold.get(product.id) || 0)); }
function stockLabel(product) { return product.stokBelirsiz ? 'Stok takip edilmiyor' : (remaining(product) ? `Stok ${remaining(product)}` : 'Tükendi'); }
function priceLabel(product) { return product.fiyatBelirsiz ? 'Fiyat girilmedi' : money(product.satisFiyati, product.paraBirimi); }
function cartQty() { return [...state.cart.values()].reduce((sum, line) => sum + line.quantity, 0); }
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
  $('syncLabel').textContent = state.bundleLoading ? 'Ürünler yükleniyor…' : `${state.products.length.toLocaleString('tr-TR')} ürün`;
  $('catalogSource').textContent = `${state.products.length.toLocaleString('tr-TR')} ürün · Excel kataloğu${state.excelCount ? ` · ${state.excelCount} cihaz içi düzenleme` : ''}`;
}
function setCatalog(products, adjustments, meta, excelCount = 0, bundleCount = 0, lifecycleMeta = null) {
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
  renderAll();
}

/** Navigation and home dashboard never replace IndexedDB records. */
function updateNavigation() {
  document.body.classList.toggle('view-home', state.view === 'home');
  $('homeView').hidden = state.view !== 'home';
  $('catalogView').hidden = state.view !== 'catalog';
  $('settingsView').hidden = state.view !== 'settings';
  const active = dom.cartDialog.open ? 'sale' : state.view;
  for (const [id,value] of [['navHome','home'],['navProducts','catalog'],['navSale','sale'],['navSettings','settings']]) {
    const el=$(id); const yes=active===value; el.classList.toggle('active',yes);
    if(yes) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  }
}
function navigate(hash) { if(location.hash!==hash) location.hash=hash; else applyRoute(); }
function applyRoute() {
  const fragment=decodeURIComponent(location.hash.slice(1));
  if (fragment.startsWith('categories')) {
    state.view='catalog';state.catalogMode='categories';
    state.categoryPage=fragment.startsWith('categories/') ? fragment.slice('categories/'.length) : '';
    renderCategoryTree();
  } else if (fragment.startsWith('products')) {
    state.view='catalog';state.catalogMode='products';state.browseAll=true;
    state.category=fragment.startsWith('products/') ? fragment.slice('products/'.length) : '';
  } else if (fragment==='settings') state.view='settings';
  else state.view='home';
  updateNavigation();renderProducts();
  window.scrollTo({top:0,behavior:'auto'});
}
function setView(view,showAll=false) {
  if(view==='home') navigate('#home');
  else if(view==='settings') navigate('#settings');
  else if(view==='catalog' && (showAll||state.search.trim())) navigate('#products');
  else if(view==='catalog') navigate('#categories');
}
function openSale() {
  renderCart();
  if (!dom.cartDialog.open) dom.cartDialog.showModal();
  updateNavigation();
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
    button.addEventListener('click', () => { if (addToCart(product)) { $('pickProductDialog').close(); openSale(); } });
    target.append(button);
  }
  if (!items.length) target.textContent='Ürün bulunamadı';
}
function openProductPicker() {
  $('pickProductSearch').value=''; renderProductPicker();
  if (!$('pickProductDialog').open) $('pickProductDialog').showModal();
  $('pickProductSearch').focus({preventScroll:true});
}
function openCamera() {
  state.scanPurpose = 'sale';
  unlockScanAudio(); // user gesture unlocks iPhone audio before scan event callback
  if (!dom.scanDialog.open) dom.scanDialog.showModal();
  startScanner();
}
function barcodeAdd(raw, sourceInput) {
  const code = String(raw || '').trim();
  if (!code) return;
  const product = exactProduct(code);
  if(product && productManager?.offerSaleActivation(product, active => {
    if(active && addToCart(active) && sourceInput) sourceInput.value='';
  })) return;
  if (product && addToCart(product)) {
    chirp(); if (sourceInput) sourceInput.value = '';
    announce(`${product.baslik} sepete eklendi ✓`, 'success');
  } else if (!product) announce(`${code} barkodlu ürün bulunamadı.`, 'error');
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
function categoryCover(path) { return path.includes(' > ') ? (state.categoryProductPhotos.get(path) || categoryArtwork(path)) : categoryArtwork(path); }
function categoryTile(node, hasChildren = false) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'photo-category-tile';
  button.setAttribute('aria-label', `${node.name}, ${node.count} ürün`);
  button.title = node.name;
  const photo = document.createElement('span'); photo.className = 'photo-category-image';
  const fallback = document.createElement('span'); fallback.className = 'photo-category-fallback';
  fallback.textContent = categoryEmoji(node.path); photo.append(fallback);
  const url = categoryCover(node.path);
  if (url) {
    const img = document.createElement('img');
    img.alt = '';
    applyProductImage(img,url,320,'high');
    photo.append(img);
  }
  if (hasChildren) {
    const badge = document.createElement('span');
    badge.className = 'photo-category-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = '›';
    photo.append(badge);
  }
  const name = document.createElement('span');
  name.className = 'photo-category-name';
  name.textContent = node.name;
  button.append(photo, name);
  button.addEventListener('click', () => hasChildren ? openCategoryMenu(node.path) : selectCategory(node.path));
  return button;
}
function renderHome() {
  const target=$('homeCategoryShortcuts');target.replaceChildren();
  for(const node of sortCategoryNodes(state.categoryTreeData)) target.append(categoryTile(node,Boolean(node.children.length)));
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
  $('detailAdd').disabled = !isActive(product) || remaining(product) < 1 || product.fiyatBelirsiz;
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
    if (!state.products.length) announce('Yerleşik katalog açılamadı. İnternet bağlantısını kontrol edip sayfayı yenileyin.', 'error');
  } finally { state.bundleLoading = false; }
}

function openCategoryMenu(path = '') {
  navigate('#categories'+(typeof path==='string'&&path ? '/'+encodeURIComponent(path) : ''));
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
  $('categoryBrowser').hidden=state.catalogMode!=='categories';
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
  $('browseHeading').textContent=state.category||(query?'Arama Sonuçları':'Ürünler');
  dom.count.textContent=items.length.toLocaleString('tr-TR');
  for(const [id,mode] of [['viewGrid','grid'],['viewList','list']]) {
    $(id).setAttribute('aria-pressed',String(state.productLayout===mode));$(id).classList.toggle('active',state.productLayout===mode);
  }
  $('onlyInStock').setAttribute('aria-pressed',String(state.stockOnly));
  dom.productList.className=`products ${state.productLayout==='grid'?'grid-view':'list-view'}`;
  const frag=document.createDocumentFragment();
  for(const p of items.slice(0,state.visibleLimit)) {
    const available=remaining(p)>0&&!p.fiyatBelirsiz;
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
    row.querySelector('.add-button').addEventListener('click',()=>addToCart(p));
    frag.append(row);
  }
  dom.productList.replaceChildren(frag);
  if(!items.length)dom.productList.innerHTML='<p class="clean-empty">Ürün bulunamadı</p>';
  $('loadMoreProducts').hidden=items.length<=state.visibleLimit;
  $('productLimit').hidden=true;
}
function renderCartBar() {
  const count = cartQty();
  $('openCart').classList.toggle('is-empty', count === 0);
  dom.cartCount.textContent = String(count);
  dom.cartItemLabel.textContent = `${count} adet ürün`;
  dom.cartTotal.textContent = money(totals().total, cartCurrency());
  document.querySelector('.cart-label strong').textContent = count ? 'Satışa Devam Et' : 'Yeni Satış';
  $('saleLineCount').textContent = String(count);
}
function addToCart(product) {
  if(!isActive(product)) { announce('Ürün pasif. Satış için önce aktifleştirin.','error'); return false; }
  const current = state.cart.get(product.id);
  if (product.fiyatBelirsiz) { announce('Bu ürünün satış fiyatı girilmemiş. Ayarlar’dan fiyatı düzenleyin.', 'error'); return false; }
  if (state.cart.size && product.paraBirimi !== cartCurrency()) {
    announce('Farklı para birimleri tek sepette birleştirilemez.', 'error'); return false;
  }
  if (remaining(product) <= (current?.quantity ?? 0)) {
    announce('Bu ürün için yeterli yerel stok yok.', 'error'); return false;
  }
  if (current) current.quantity += 1;
  else state.cart.set(product.id, { id: product.id, product: { ...product },
    quantity: 1, unitPrice: product.satisFiyati, discountPct: 0 });
  renderCartBar();
  if (dom.cartDialog.open) renderCart();
  announce(`${product.baslik} sepete eklendi.`, 'success');
  return true;
}
function updateCart(id, field, value) {
  const line = state.cart.get(id);
  if (!line) return;
  if (field === 'quantity') {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0) { announce('Adet geçersiz.', 'error'); renderCart(); return; }
    if (num === 0) { state.cart.delete(id); renderCartBar(); renderCart(); return; }
    if (num > remaining(state.byId.get(id) || line.product)) {
      announce('İstenen adet kullanılabilir stoğu aşıyor.', 'error'); renderCart(); return;
    }
    line.quantity = num;
  } else if (field === 'price') {
    const num = parseLocaleNumber(value, NaN);
    if (!Number.isFinite(num) || num < 0) { announce('Geçerli bir birim fiyat girin.', 'error'); renderCart(); return; }
    line.unitPrice = round2(num);
  } else if (field === 'discount') {
    const num = parseLocaleNumber(value, NaN);
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
    dom.cartItems.innerHTML = '<div class="sale-empty">Barkod okutun</div>';
  }
  for (const line of state.cart.values()) {
    const el = document.createElement('div'); el.className = 'cart-line';
    const amount = money(lineTotals(line).total, line.product.paraBirimi);
    const brand=String(line.product.marka||'').trim();
    const title=String(line.product.baslik||'').trim();
    // The vast majority already start with their brand; do not duplicate it.
    const brandPrefix=brand && fold(title).startsWith(fold(brand));
    el.innerHTML = `<div class="sale-product-row">
      <div class="cart-line-name">${brand && !brandPrefix ? `<span class="sale-line-brand">${esc(brand)}</span>` : ''}${esc(title)}</div>
      <strong class="sale-line-price">${esc(amount)}</strong>
    </div>
    <div class="sale-line-actions">
      <div class="stepper">
        <button type="button" data-step="-1" aria-label="Adedi azalt">−</button>
        <input type="number" min="1" step="1" inputmode="numeric" value="${line.quantity}" data-field="quantity" aria-label="Adet">
        <button type="button" data-step="1" aria-label="Adedi artır">+</button>
      </div>
      <details class="sale-line-more"><summary aria-label="Fiyat ve iskonto düzenle" title="Fiyat / iskonto">⋯</summary>
        <div class="sale-line-edit">
          <label>Fiyat<input type="text" inputmode="decimal" value="${line.unitPrice.toFixed(2)}" data-field="price"></label>
          <label>İskonto %<input type="text" inputmode="decimal" value="${line.discountPct}" data-field="discount"></label>
        </div>
      </details>
      <button class="remove-button" type="button" data-remove aria-label="Ürünü sil" title="Ürünü sil">×</button>
    </div>`;
    el.querySelector('[data-remove]').addEventListener('click', () => {
      state.cart.delete(line.id); renderCart(); renderCartBar();
    });
    for (const step of el.querySelectorAll('[data-step]')) step.addEventListener('click', () => {
      updateCart(line.id, 'quantity', line.quantity + Number(step.dataset.step));
    });
    for (const input of el.querySelectorAll('[data-field]')) input.addEventListener('change', () => {
      updateCart(line.id, input.dataset.field, input.value);
    });
    dom.cartItems.append(el);
  }
  const sum = totals(), currency = cartCurrency();
  dom.totals.innerHTML = `<div class="total-row grand"><span>Toplam</span><strong>${esc(money(sum.total, currency))}</strong></div>`;
  dom.complete.disabled = !state.cart.size || state.saving;
  updatePayment();
}
function updatePayment() {
  const selected = document.querySelector('input[name="payment"]:checked').value;
  $('cashOption').hidden = selected !== 'Nakit';
  $('creditBox').hidden = selected !== 'Veresiye';
  // Default to exact payment until the cashier explicitly enters a received amount.
  if (selected === 'Nakit' && dom.cash.dataset.edited !== 'true') {
    dom.cash.value = totals().total.toFixed(2);
  }
  const change = parseLocaleNumber(dom.cash.value, 0) - totals().total;
  dom.change.textContent = change >= 0 ? `Para üstü: ${money(round2(change), cartCurrency())}` :
    `Eksik ödeme: ${money(round2(-change), cartCurrency())}`;
  dom.change.style.color = change < -0.009 ? '#b23a42' : '#136c49';
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
  const sum = totals();
  const payment = document.querySelector('input[name="payment"]:checked').value;
  const cash = payment === 'Nakit' ? round2(parseLocaleNumber(dom.cash.value, NaN)) : null;
  if (payment === 'Nakit' && (!Number.isFinite(cash) || cash + 0.009 < sum.total)) {
    announce('Nakit tutarı ödenecek tutardan az olamaz.', 'error'); return;
  }
  const creditName = dom.credit.value.trim();
  if (payment === 'Veresiye' && !creditName) { announce('Veresiye için müşteri adı girin.', 'error'); return; }
  for (const line of state.cart.values()) {
    const current = state.byId.get(line.id) || line.product;
    if (line.quantity > remaining(current)) {
      announce(`${line.product.baslik} için yeterli stok yok.`, 'error'); return;
    }
  }
  const record = {
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() :
      `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(), payment,
    currency: cartCurrency(), creditName: payment === 'Veresiye' ? creditName : '',
    cashReceived: cash, change: payment === 'Nakit' ? round2(cash - sum.total) : 0,
    ...sum,
    items: [...state.cart.values()].map(line => ({
      id: line.id, urunKodu: line.product.urunKodu, barkod: line.product.barkod,
      baslik: line.product.baslik, marka: line.product.marka, beden: line.product.beden, renk: line.product.renk,
      quantity: line.quantity, unitPrice: line.unitPrice, discountPct: line.discountPct,
      kdv: line.product.kdv, ...lineTotals(line)
    }))
  };
  state.saving = true; dom.complete.disabled = true;
  try {
    await serializeMutation(() => saveSale(record));
    for (const line of record.items) state.sold.set(line.id, (state.sold.get(line.id) || 0) + line.quantity);
    state.lastSale = record; state.cart.clear();
    dom.cash.value = ''; delete dom.cash.dataset.edited; dom.credit.value = '';
    $('cashOption').open = false;
    dom.cartDialog.close();
    renderProducts(); renderCartBar(); renderHome();
    channel?.postMessage('sale-updated');
    announce(`Satış kaydedildi: ${money(record.total, record.currency)}`, 'success');
    $('receiptActionsTotal').textContent = money(record.total, record.currency);
    $('receiptActionStatus').textContent = '';
    $('receiptActionsDialog').showModal();
  } catch (error) { announce(`Satış kaydedilemedi: ${error.message}`, 'error'); }
  finally { state.saving = false; renderCart(); }
}
function renderReceipt(sale) {
  const width = $('receiptWidth').value === '58' ? '58mm' : '80mm';
  $('receiptPrint').style.setProperty('--receipt-width', width);
  // Set physical paper dimensions instead of only CSS content width. Mobile
  // print sheets still require an 80/58-mm paper preset in the printer driver.
  const mm = width === '58mm' ? 58 : 80;
  const height = Math.max(120,Math.min(1000,90 + sale.items.length * 17));
  $('receiptPaperSize').textContent = `@media print { @page { size: ${mm}mm ${height}mm; margin: 0; } }`;
  const root = $('receiptPrint');
  const vatByRate = new Map();
  for (const item of sale.items) vatByRate.set(item.kdv,
    round2((vatByRate.get(item.kdv) || 0) + item.vat));
  root.innerHTML = `<div class="receipt-title">CEP HIZLI SATIŞ</div>
    <div class="receipt-center receipt-small">MALİ DEĞERİ YOKTUR<br>Bilgi fişi / Satış kaydı</div>
    <div class="receipt-rule"></div><div>Fiş No: ${esc(sale.id.slice(0, 12))}</div>
    <div>Tarih: ${esc(fmtDate(sale.createdAt))}</div><div>Ödeme: ${esc(sale.payment)}</div>
    ${sale.creditName ? `<div>Müşteri: ${esc(sale.creditName)}</div>` : ''}
    <div class="receipt-rule"></div>
    ${sale.items.map(item => `<div class="receipt-product">${esc(item.marka && !fold(item.baslik).startsWith(fold(item.marka)) ? `${item.marka} · ${item.baslik}` : item.baslik)}
      ${esc([item.beden, item.renk].filter(Boolean).join(' / '))}
      <div class="receipt-row"><span>${item.quantity} × ${esc(money(item.unitPrice, sale.currency))}
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
    <div class="receipt-center receipt-small">Teşekkür ederiz!<br>Bu belge yasal mali fiş yerine geçmez.</div>`;
}
function printSale(sale) { renderReceipt(sale); window.print(); }

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
function exportHistory() {
  const header = ['Fiş No','Tarih','Ödeme','Müşteri','Para Birimi','Toplam','Ürün Kodu',
    'Barkod','Ürün','Adet','Birim Fiyat','İskonto %','Satır Toplamı','KDV'];
  const rows = [header, ...state.sales.flatMap(sale => sale.items.map(item => [
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
function scanned(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return;
  if(state.scanPurpose==='manage') {
    dom.scanDialog.close();
    state.scanPurpose='sale';
    productManager.manageScannedBarcode(text);
    return;
  }
  const now = Date.now();
  if (text === lastScanText && now - lastScanTime < 1400) return;
  lastScanText = text; lastScanTime = now;
  const product = exactProduct(text);
  if (product) {
    if(productManager?.offerSaleActivation(product,active=>{
      if(active && addToCart(active)) {
        dom.scanMessage.textContent=active.baslik+' aktifleştirildi ve sepete eklendi ✓';
        $('scanManualBarcode').value='';
      }
    })) return;
    if (addToCart(product)) {
      chirp();
      dom.scanMessage.textContent = `${product.baslik} sepete eklendi ✓`;
      $('scanManualBarcode').value = '';
    } else {
      dom.scanMessage.textContent = `${product.baslik}: stok veya sepet limitini kontrol edin.`;
    }
  } else {
    dom.scanMessage.textContent = `Barkod okundu (${text}) fakat katalogda bulunamadı. İsterseniz arama kutusunda kontrol edin.`;
  }
}

function updateTorchButton(enabled = false, on = false) {
  const button=$('scanTorch');
  button.disabled=!enabled;
  button.setAttribute('aria-pressed', String(on));
  button.setAttribute('aria-label', on ? 'Flaşı kapat' : 'Flaşı aç');
  button.textContent=on ? '⚡ Açık' : '⚡ Flaş';
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
async function stopScanner() {
  updateTorchButton();
  const session = state.scanner;
  if (!session) return;
  // Mark invalid immediately, before waiting for the camera to release.
  session.active = false;
  state.scanner = null;
  if (session.timer) clearTimeout(session.timer);
  if (session.stream) session.stream.getTracks().forEach(track => track.stop());
  if (session.lib) {
    try { await session.lib.stop(); } catch { /* may be a photo-only scanner or not started */ }
    try { session.lib.clear(); } catch { /* may have already been cleared */ }
  }
  const video = $('scanVideo');
  video.pause(); video.srcObject = null;
}
let qrLibraryPromise;
function ensureQrLibrary() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (qrLibraryPromise) return qrLibraryPromise;
  qrLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/html5-qrcode.min.js';
    script.onload = () => window.Html5Qrcode ? resolve() : reject(new Error('Barkod kütüphanesi bulunamadı.'));
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
  const formats = window.Html5QrcodeSupportedFormats || {};
  return ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39', 'ITF', 'CODABAR']
    .map(name => formats[name]).filter(value => value != null);
}
async function startNativeScanner(session) {
  if (!('BarcodeDetector' in window)) throw new Error('Yerel barkod algılayıcı desteklenmiyor.');
  const supported = typeof BarcodeDetector.getSupportedFormats === 'function'
    ? await BarcodeDetector.getSupportedFormats() : [];
  const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf']
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
  dom.scanMessage.textContent = 'Barkodu kadraja tutun';
  updateTorchButton(Boolean(torchFeature(session)),false);
  const scanFrame = async () => {
    if (!session.active) return;
    try {
      if (video.readyState >= 2) {
        const codes = await detector.detect(video);
        if (codes?.[0]?.rawValue && codes[0].format !== 'qr_code') scanned(codes[0].rawValue);
      }
    } catch { /* ignore a single frame decode failure */ }
    if (session.active) session.timer = setTimeout(scanFrame, 180);
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
  const session = { active: true, stream: null, lib: null, timer: null, torchOn: false };
  state.scanner = session;
  dom.scanMessage.textContent = 'Arka kamera başlatılıyor… Kamera izni sorulursa izin verin.';
  $('scanVideo').style.display = 'none';
  $('html5-reader').style.display = 'block';
  try {
    // ZXing-based decoding is the first choice, including on iPhone Safari.
    // QR codes are excluded: accept only linear product barcodes.
    // Do not rely on Apple's optional native BarcodeDetector implementation.
    await ensureQrLibrary();
    if (!session.active) return;
    const formats = desiredFormats();
    if (!formats.length) throw new Error('Çizgili barkod desteği bulunamadı.');
    const scanner = new window.Html5Qrcode('html5-reader', {
      verbose: false,
      ...(formats.length ? { formatsToSupport: formats } : {}),
      useBarCodeDetectorIfSupported: false
    });
    session.lib = scanner;
    await scanner.start({ facingMode: 'environment' },
      { fps: 12, disableFlip: true },
      (decoded,details) => {
        const format=String(details?.result?.format?.formatName || '');
        if (session.active && !/QR[_ ]?CODE/i.test(format)) scanned(decoded);
      }, () => {});
    if (!session.active) { try { await scanner.stop(); } catch {} return; }
    // No narrow qrbox restriction: 1D retail barcodes need a wide region.
    dom.scanMessage.textContent = 'Barkodu kadraja tutun';
    updateTorchButton(Boolean(torchFeature(session)),false);
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
    if (!formats.length) throw new Error('Çizgili barkod desteği bulunamadı.');
    const lib = new window.Html5Qrcode('html5-reader', {
      verbose: false, ...(formats.length ? { formatsToSupport: formats } : {}),
      useBarCodeDetectorIfSupported: false
    });
    state.scanner = { active: true, lib, stream: null, timer: null };
    const code = await lib.scanFile(file, false);
    scanned(code);
    // The photo has been decoded; restart camera only if user taps 'Yeniden Dene'.
  } catch (error) {
    dom.scanMessage.textContent = `Fotoğraftaki barkod okunamadı. Çizgileri net ve tam gösteren başka bir fotoğraf deneyin veya barkodu elle girin. (${String(error?.message || error).slice(0,90)})`;
  }
}


async function refreshManagedData() {
  const snapshot=await getSnapshot();
  setCatalog(snapshot.products,snapshot.adjustments,snapshot.meta,
    snapshot.excelCount,snapshot.bundleCount,snapshot.lifecycleMeta);
}
async function setup() {
  productManager=createProductManager({
    state, serializeMutation, refresh:refreshManagedData, announce, channel,
    openManageScanner:()=>{
      if($('manageDialog').open)$('manageDialog').close();
      openCamera(); state.scanPurpose='manage';
    }
  });
  setConnection();
  detectImageResizing().then(enabled=>{ if(enabled) { renderHome();renderCategoryTree();renderProducts(); } });
  window.addEventListener('online',()=>{setConnection();installBuiltInCatalog();});
  window.addEventListener('offline',setConnection);
  window.addEventListener('hashchange',applyRoute);
  dom.search.addEventListener('input',()=>{
    state.search=dom.search.value;state.visibleLimit=48;
    if(state.search.trim()) {state.category='';setView('catalog',true);}
    else renderProducts();
  });
  $('navHome').addEventListener('click',()=>setView('home'));
  $('navProducts').addEventListener('click',()=>openCategoryMenu());
  $('navSale').addEventListener('click',openSale);
  $('navSettings').addEventListener('click',()=>setView('settings'));
  $('categoryBack').addEventListener('click',()=>{
    const parent=state.categoryPage.split(' > ').slice(0,-1).join(' > ');openCategoryMenu(parent);
  });
  $('catalogBack').addEventListener('click',()=>openCategoryMenu(state.category.split(' > ').slice(0,-1).join(' > ')));
  $('categorySearch').addEventListener('input',()=>renderCategoryTree($('categorySearch').value));
  $('categoryAllProducts').addEventListener('click',()=>state.categoryPage?selectCategory(state.categoryPage):showAllProducts());
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
  $('settingsPrintWidth').addEventListener('change',()=>{$('receiptWidth').value=$('settingsPrintWidth').value;});
  $('saleBarcodeForm').addEventListener('submit',event=>{
    event.preventDefault();const value=$('saleBarcode').value.trim();if(!value)openProductPicker();else barcodeAdd(value,$('saleBarcode'));
  });
  $('pickProductSearch').addEventListener('input',renderProductPicker);
  $('saleScanButton').addEventListener('click',openCamera);
  $('scanRetry').addEventListener('click',startScanner);
  $('scanTorch').addEventListener('click',toggleTorch);
  $('scanManualForm').addEventListener('submit',event=>{event.preventDefault();scanned($('scanManualBarcode').value);});
  $('scanPhotoFile').addEventListener('change',event=>{scanBarcodePhoto(event.target.files?.[0]);event.target.value='';});
  $('detailAdd').addEventListener('click',()=>{if(state.detailProduct&&addToCart(state.detailProduct))$('productDetailDialog').close();});
  $('detailImage').addEventListener('click',()=>{if(state.detailProduct?.gorsel)window.open(state.detailProduct.gorsel,'_blank','noopener,noreferrer');});
  dom.search.addEventListener('keydown',event=>{
    if(event.key!=='Enter')return;event.preventDefault();const found=exactProduct(dom.search.value);
    if(found){barcodeAdd(dom.search.value,dom.search);state.search='';renderProducts();}
  });
  $('openCart').addEventListener('click',openSale);
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
  dom.scanDialog.addEventListener('close',()=>stopScanner());
  dom.cartDialog.addEventListener('close',updateNavigation);
  $('scanButton').addEventListener('click',openCamera);
  $('excelFile').addEventListener('change',()=>selectExcelFile($('excelFile').files[0]));
  $('confirmExcelImport').addEventListener('click',confirmExcelImport);
  document.querySelectorAll('input[name="payment"]').forEach(el=>el.addEventListener('change',updatePayment));
  dom.cash.addEventListener('input',()=>{dom.cash.dataset.edited = 'true'; updatePayment();});
  dom.complete.addEventListener('click',completeSale);
  $('receiptNetworkPrint').addEventListener('click',()=>{if(state.lastSale)printSale(state.lastSale);});
  $('receiptBluetoothPrint').addEventListener('click',async()=>{
    if(!state.lastSale)return;const button=$('receiptBluetoothPrint');button.disabled=true;
    $('receiptActionStatus').textContent='Bluetooth yazıcı aranıyor…';
    try{await printBluetoothReceipt(state.lastSale);$('receiptActionStatus').textContent='Fiş yazıcıya gönderildi.';}
    catch(error){$('receiptActionStatus').textContent=error.message;}
    finally{button.disabled=false;}
  });
  $('receiptWhatsApp').addEventListener('click',async()=>{if(state.lastSale)await shareReceiptWhatsApp(state.lastSale);});
  $('receiptClose').addEventListener('click',()=>{$('receiptActionsDialog').close();openSale();});
  $('exportSales').addEventListener('click',exportHistory);
  for(const dialog of [dom.cartDialog,dom.scanDialog,dom.historyDialog,$('excelDialog'),$('manageDialog'),$('passiveProductDialog'),$('productDetailDialog'),$('pickProductDialog'),$('receiptActionsDialog')]){
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  }
  if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  try{
    await openDB();const snapshot=await getSnapshot();
    setCatalog(snapshot.products,snapshot.adjustments,null,snapshot.excelCount,snapshot.bundleCount,snapshot.lifecycleMeta);
  }catch(error){announce(`Yerel veritabanı açılamadı: ${error.message}`,'error');dom.complete.disabled=true;}
  applyRoute();installBuiltInCatalog();
  channel?.addEventListener('message',async()=>{
    try{const snapshot=await getSnapshot();setCatalog(snapshot.products,snapshot.adjustments,null,snapshot.excelCount,snapshot.bundleCount,snapshot.lifecycleMeta);}
    catch{/* other tab closing */}
  });
}
setup();
