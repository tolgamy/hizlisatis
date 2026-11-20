import { getSnapshot, getXmlCatalog, replaceCatalog, upsertExcelProducts, installBundledProducts, saveSale, getSales, openDB } from './idb.js';
import { readXlsxRows } from './xlsx-reader.js';
import { parseExcelProducts, compareExcelWithXml } from './excel-products.js';
import { parseLocalXml } from './xml-local.js';
import { parseLocaleNumber } from './normalize.js';
import { buildCategoryTree, categoryMatches } from './category-menu.js';
import { fetchBundledCatalog } from './bundled-catalog.js';

const $ = id => document.getElementById(id);
const state = {
  products: [], byId: new Map(), byBarcode: new Map(),
  sold: new Map(), cart: new Map(), category: '', brand: '',
  search: '', meta: null, sales: [], lastSale: null,
  syncing: false, saving: false, scanner: null, syncGeneration: 0,
  excelCount: 0, bundleCount: 0, bundleLoading: false, excelPreview: null, excelUploading: false, browseAll: false,
  view: 'home', productLayout: 'grid', stockOnly: false, sort: 'name', visibleLimit: 48, detailProduct: null
};
const dom = {
  search: $('search'), productList: $('productList'), count: $('resultCount'),
  brands: $('brandFilters'), categoryTree: $('categoryTree'), categoryDialog: $('categoryDialog'),
  cartDialog: $('cartDialog'), cartItems: $('cartItems'), totals: $('cartTotals'),
  cartCount: $('cartCount'), cartTotal: $('cartTotal'), cartItemLabel: $('cartItemLabel'),
  cash: $('cashReceived'), change: $('changeLabel'),
  credit: $('creditName'), complete: $('completeSale'),
  historyDialog: $('historyDialog'), historyItems: $('historyItems'),
  scanDialog: $('scanDialog'), scanMessage: $('scanMessage')
};
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('cep-pos-changes') : null;
let toastTimer;
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
function remaining(product) { return Math.max(0, product.stok - (state.sold.get(product.id) || 0)); }
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
  if (!state.meta) {
    $('syncLabel').textContent = state.bundleCount
      ? `${state.bundleCount.toLocaleString('tr-TR')} yerleşik ürün yüklendi · XML bekleniyor`
      : state.excelCount ? 'Excel ürünleri yerel olarak kayıtlı' : 'Katalog henüz yüklenmedi';
    $('catalogSource').textContent = state.products.length
      ? `${state.products.length.toLocaleString('tr-TR')} ürün • Yerleşik katalog${state.excelCount ? ` + ${state.excelCount} Excel` : ''}`
      : 'Katalog boş';
    return;
  }
  $('syncLabel').textContent = `${state.meta.stale ? 'Yedek katalog' : 'Son senkronizasyon'}: ${fmtDate(state.meta.updatedAt)}`;
  $('catalogSource').textContent = `${state.products.length.toLocaleString('tr-TR')} ürün • XML + yerleşik katalog${state.excelCount ? ` + ${state.excelCount} Excel` : ''}`;
}
function setCatalog(products, adjustments, meta, excelCount = 0, bundleCount = 0) {
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
  renderAll();
}

/** Navigation and home dashboard never replace IndexedDB records. */
function updateNavigation() {
  $('homeView').hidden = state.view !== 'home';
  $('catalogView').hidden = state.view !== 'catalog';
  const active = dom.cartDialog.open ? 'sale' : state.view;
  for (const [id, value] of [['navHome', 'home'], ['navProducts', 'catalog'], ['navSale', 'sale']]) {
    const button = $(id); const selected = active === value;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}
function setView(view, showAll = false) {
  state.view = view;
  if (view === 'catalog' && showAll) state.browseAll = true;
  updateNavigation(); renderProducts();
  window.scrollTo({top: 0, behavior: 'auto'});
}
function openSale() {
  renderCart();
  dom.cartDialog.showModal();
  updateNavigation();
}
function openCamera() {
  if (!dom.scanDialog.open) dom.scanDialog.showModal();
  startScanner();
}
function barcodeAdd(raw, sourceInput) {
  const code = String(raw || '').trim();
  if (!code) return;
  const product = exactProduct(code);
  if (product && addToCart(product)) {
    chirp(); if (sourceInput) sourceInput.value = '';
    announce(`${product.baslik} sepete eklendi ✓`, 'success');
  } else if (!product) announce(`${code} barkodlu ürün bulunamadı.`, 'error');
}
function renderHome() {
  $('homeProductCount').textContent = state.products.length.toLocaleString('tr-TR');
  $('homeImageCount').textContent = state.products.filter(p => Boolean(p.gorsel)).length.toLocaleString('tr-TR');
  $('homeStockCount').textContent = state.products.filter(p => remaining(p) > 0).length.toLocaleString('tr-TR');
  const target = $('homeCategoryShortcuts');
  target.replaceChildren();
  const categories = buildCategoryTree(state.products)
    .sort((a, b) => b.count - a.count).slice(0, 8);
  const names = ['▤', '◉', '◈', '⌂', '◐', '✦', '▣', '◌'];
  for (const [index, node] of categories.entries()) {
    const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'home-category-tile';
    const glyph = document.createElement('span'); glyph.className = 'category-shortcut-icon'; glyph.textContent = names[index % names.length];
    const label = document.createElement('span'); label.textContent = node.name;
    const count = document.createElement('small'); count.textContent = `${node.count.toLocaleString('tr-TR')} ürün`;
    tile.append(glyph, label, count);
    tile.addEventListener('click', () => selectCategory(node.path));
    target.append(tile);
  }
  if (!categories.length) {
    const info = document.createElement('p'); info.className = 'home-empty';
    info.textContent = 'Katalog yüklenince kategoriler burada görünecek.';
    target.append(info);
  }
}
function openProductDetail(product) {
  state.detailProduct = product;
  const img = $('detailImage'); img.onerror = () => { img.onerror = null; img.src = '/icons/placeholder.svg'; };
  img.referrerPolicy = 'no-referrer'; img.src = product.gorsel || '/icons/placeholder.svg';
  $('detailBrand').textContent = [product.marka, product.kategori].filter(Boolean).join(' · ');
  $('detailName').textContent = product.baslik;
  $('detailBarcode').textContent = `Barkod: ${product.barkod || '—'}  ·  SKU: ${product.urunKodu || '—'}`;
  $('detailMeta').textContent = `Stok: ${remaining(product)} · ${product.kdvBelirsiz ? 'KDV belirsiz' : `KDV %${product.kdv}`}`;
  $('detailPrice').textContent = money(product.satisFiyati, product.paraBirimi);
  $('detailAdd').disabled = remaining(product) < 1;
  $('productDetailDialog').showModal();
}

/** Install data from the user's supplier export on every device automatically.
 * Existing XML and manual Excel imports remain authoritative for their own fields.
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
        snapshot.excelCount, snapshot.bundleCount);
      channel?.postMessage('bundled-catalog-updated');
      if (snapshot.products.length) announce(`${products.length.toLocaleString('tr-TR')} yerleşik ürün ve görsel adresleri hazır.`, 'success');
    }
  } catch (error) {
    console.warn('Built-in catalogue unavailable:', error);
    if (!state.products.length) announce('Yerleşik katalog açılamadı. İnternet bağlantısını kontrol edip sayfayı yenileyin.', 'error');
  } finally { state.bundleLoading = false; }
}

function openCategoryMenu() {
  renderCategoryTree();
  $('menuCategorySearch').value = '';
  dom.categoryDialog.showModal();
  $('menuCategorySearch').focus({ preventScroll: true });
}
function closeCategoryMenu() {
  if (dom.categoryDialog.open) dom.categoryDialog.close();
  $('openCategories').focus({ preventScroll: true });
}
function selectCategory(path) {
  state.category = path;
  state.brand = '';
  state.browseAll = true; state.visibleLimit = 48;
  state.search = '';
  dom.search.value = '';
  closeCategoryMenu();
  setView('catalog');
  renderFilters(); renderProducts();
}
function showAllProducts() {
  state.category = ''; state.brand = ''; state.browseAll = true;
  state.search = ''; dom.search.value = '';
  closeCategoryMenu();
  setView('catalog');
  renderFilters(); renderProducts();
}
function renderCategoryTree(search = '') {
  const tree = buildCategoryTree(state.products);
  const target = dom.categoryTree;
  target.replaceChildren();
  const query = fold(search);
  function entry(node, depth = 0, parentMatches = false) {
    const matches = !query || parentMatches || fold(node.name).includes(query) || fold(node.path).includes(query);
    const children = node.children.map(child => entry(child, depth + 1, matches)).filter(Boolean);
    if (!matches && !children.length) return null;
    const item = document.createElement('div'); item.className = 'category-node';
    const line = document.createElement('div'); line.className = 'category-node-row';
    const select = document.createElement('button'); select.type = 'button';
    select.className = 'category-select' + (state.category === node.path ? ' selected' : '');
    const name = document.createElement('span'); name.textContent = node.name;
    const count = document.createElement('small'); count.textContent = node.count.toLocaleString('tr-TR');
    select.append(name, count); select.addEventListener('click', () => selectCategory(node.path));
    line.append(select);
    if (children.length) {
      const expander = document.createElement('button'); expander.type = 'button';
      expander.className = 'category-expand'; expander.textContent = '›';
      expander.setAttribute('aria-label', `${node.name} alt kategorileri`);
      expander.setAttribute('aria-expanded', String(Boolean(query)));
      const nested = document.createElement('div'); nested.className = 'category-children';
      nested.hidden = !query; nested.append(...children);
      expander.addEventListener('click', () => {
        nested.hidden = !nested.hidden;
        expander.setAttribute('aria-expanded', String(!nested.hidden));
      });
      line.append(expander); item.append(line, nested);
    } else item.append(line);
    if (depth) item.classList.add('sub-category');
    return item;
  }
  const nodes = tree.map(node => entry(node)).filter(Boolean);
  if (nodes.length) target.append(...nodes);
  else {
    const empty = document.createElement('p'); empty.className = 'category-empty';
    empty.textContent = state.products.length ? 'Kategori bulunamadı.' : 'Ürünleri görmek için Excel veya XML yükleyin.';
    target.append(empty);
  }
}
function renderFilters() {
  const brands = [...new Set(state.products.map(p => p.marka).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, 'tr'));
  if (state.category && !state.products.some(p => categoryMatches(p, state.category))) state.category = '';
  if (state.brand && !brands.includes(state.brand)) state.brand = '';
  dom.brands.replaceChildren();
  for (const value of ['', ...brands]) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `chip${state.brand === value ? ' active' : ''}`;
    button.textContent = value || 'Tüm Markalar';
    button.setAttribute('aria-pressed', String(state.brand === value));
    button.addEventListener('click', () => {
      state.brand = value; state.browseAll = true;
      closeCategoryMenu(); setView('catalog'); renderFilters(); renderProducts();
    });
    dom.brands.append(button);
  }
  if (dom.categoryDialog.open) renderCategoryTree($('menuCategorySearch').value);
}
function renderProducts() {
  const query = fold(state.search);
  const browsing = Boolean(state.browseAll || state.category || state.brand || query);
  $('browseWelcome').hidden = browsing;
  dom.productList.hidden = !browsing;
  dom.productList.classList.toggle('grid-view', state.productLayout === 'grid');
  dom.productList.classList.toggle('list-view', state.productLayout === 'list');
  for (const [id, layout] of [['viewGrid', 'grid'], ['viewList', 'list']]) {
    $(id).setAttribute('aria-pressed', String(state.productLayout === layout));
    $(id).classList.toggle('active', state.productLayout === layout);
  }
  $('onlyInStock').setAttribute('aria-pressed', String(state.stockOnly));
  $('onlyInStock').classList.toggle('active', state.stockOnly);
  const activeFilters = $('activeFilters');
  activeFilters.replaceChildren();
  for (const label of [state.category, state.brand].filter(Boolean)) {
    const chip = document.createElement('span'); chip.textContent = label;
    activeFilters.append(chip);
  }
  activeFilters.hidden = !activeFilters.children.length;
  $('browseHeading').textContent = query ? 'Arama Sonuçları' :
    (state.category || (state.brand ? `${state.brand} ürünleri` : browsing ? 'Tüm Ürünler' : 'Kategorilerden ürün seçin'));
  if (!browsing) {
    dom.count.textContent = `${state.products.length.toLocaleString('tr-TR')} kayıtlı ürün`;
    $('imageHealth').textContent = '';
    $('productLimit').hidden = true;
    return;
  }
  const items = state.products.filter(p => {
    if (state.stockOnly && remaining(p) < 1) return false;
    // An active barcode / product search scans every category immediately.
    if (query) return [p.barkod, p.urunKodu, p.baslik, p.marka, p.beden, p.renk]
      .some(value => fold(value).includes(query));
    if (state.category && !categoryMatches(p, state.category)) return false;
    if (state.brand && p.marka !== state.brand) return false;
    return true;
  });
  items.sort((a, b) => {
    const availability = Number(remaining(b) > 0) - Number(remaining(a) > 0);
    if (state.sort === 'price-low') return a.satisFiyati - b.satisFiyati || a.baslik.localeCompare(b.baslik, 'tr');
    if (state.sort === 'price-high') return b.satisFiyati - a.satisFiyati || a.baslik.localeCompare(b.baslik, 'tr');
    if (state.sort === 'stock') return remaining(b) - remaining(a) || a.baslik.localeCompare(b.baslik, 'tr');
    return availability || a.baslik.localeCompare(b.baslik, 'tr');
  });
  dom.count.textContent = `${items.length.toLocaleString('tr-TR')} varyant`;
  dom.productList.replaceChildren();
  const imageHealth = $('imageHealth');
  const visibleItems = items.slice(0, state.visibleLimit);
  const linked = visibleItems.filter(product => !!product.gorsel).length;
  let failedImages = 0;
  const updateImageHealth = () => {
    if (!imageHealth) return;
    imageHealth.textContent = `${linked}/${visibleItems.length} resim adresi` +
      (failedImages ? ` · ${failedImages} resim açılamadı` : '');
    imageHealth.title = failedImages
      ? 'Adresler kaydedilmiş ancak resim sunucusu bazı resimleri açmıyor. Görsele dokunarak bağlantıyı kontrol edebilirsiniz.'
      : 'XML veya Excel ürünlerindeki resim adresi sayısı';
  };
  updateImageHealth();
  if (!items.length) {
    const wrap = document.createElement('div'); wrap.className = 'empty-state';
    wrap.innerHTML = state.products.length ?
      '<strong>Sonuç bulunamadı</strong>Aramayı veya filtreleri değiştirin.' :
      '<strong>Henüz ürün yok</strong>XML veya Excel dosyası yükleyin.';
    dom.productList.append(wrap);
  }
  const fragment = document.createDocumentFragment();
  for (const p of visibleItems) {
    const available = remaining(p);
    const variant = [p.urunKodu, p.barkod, p.beden, p.renk].filter(Boolean).join(' · ');
    const row = document.createElement('article'); row.className = 'product-card';
    row.innerHTML = `<div class="product-photo"><img class="product-thumb" alt="" loading="lazy">
        <span class="product-photo-badge">${p.marka ? esc(p.marka.slice(0, 14)) : 'ÜRÜN'}</span></div>
      <div class="product-info"><div class="product-title" title="${esc(p.baslik)}">${esc(p.baslik)}</div>
      <div class="product-variant" title="${esc(variant)}">${esc(variant)}</div>
      <div class="product-metadata"><span class="stock ${available ? '' : 'out'}">${available ? `Stok ${available}` : 'Tükendi'}</span>
      <span>${p.kdvBelirsiz ? 'KDV belirsiz' : `KDV %${esc(p.kdv)}`}</span></div></div>
      <div class="product-right"><span class="price">${esc(money(p.satisFiyati, p.paraBirimi))}</span>
      <button class="add-button" type="button" aria-label="${esc(p.baslik)} sepete ekle" ${available ? '' : 'disabled'}>${available ? '<span aria-hidden="true">+</span><span class="add-label"> Ekle</span>' : 'Tükendi'}</button></div>`;
    const image = row.querySelector('img');
    image.alt = p.gorsel ? `${p.baslik} ürün görseli` : `${p.baslik} · görsel yok`;
    // Default/origin referrer is needed by some CDN hotlink policies.
    image.referrerPolicy = 'strict-origin-when-cross-origin';
    image.addEventListener('error', () => {
      if (p.gorsel && image.dataset.retry !== 'yes') {
        image.dataset.retry = 'yes';
        image.referrerPolicy = 'no-referrer';
        image.src = p.gorsel;
        return;
      }
      if (image.dataset.fallback === 'yes') return;
      image.dataset.fallback = 'yes';
      if (p.gorsel) { failedImages++; updateImageHealth(); }
      image.title = p.gorsel ? `Görsel yüklenemedi: ${p.gorsel}` : 'Üründe görsel URL yok';
      image.src = '/icons/placeholder.svg';
    });
    image.addEventListener('click', () => openProductDetail(p));
    row.querySelector('.product-title').addEventListener('click', () => openProductDetail(p));
    image.title = 'Ürün detayını aç';
    if (p.gorsel) { image.style.cursor = 'pointer'; image.tabIndex = 0; }
    image.src = p.gorsel || '/icons/placeholder.svg';
    row.querySelector('button').addEventListener('click', () => addToCart(p));
    fragment.append(row);
  }
  dom.productList.append(fragment);
  $('loadMoreProducts').hidden = items.length <= state.visibleLimit;
  $('productLimit').hidden = items.length <= state.visibleLimit;
  $('productLimit').textContent = `${visibleItems.length.toLocaleString('tr-TR')} / ${items.length.toLocaleString('tr-TR')} ürün gösteriliyor`;
}
function renderCartBar() {
  const count = cartQty();
  dom.cartCount.textContent = String(count);
  dom.cartItemLabel.textContent = `${count} adet ürün`;
  dom.cartTotal.textContent = money(totals().total, cartCurrency());
  document.querySelector('.cart-label strong').textContent = count ? 'Satışa Devam Et' : 'Yeni Satış';
  $('saleLineCount').textContent = String(count);
}
function addToCart(product) {
  const current = state.cart.get(product.id);
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
    if (!Number.isInteger(num) || num <= 0) { announce('Adet en az 1 olmalı.', 'error'); renderCart(); return; }
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
    el.innerHTML = `<div class="sale-product-row">
      <div class="cart-line-name">${esc(line.product.baslik)}</div>
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
  const code = String(raw ?? '').trim().replace(/[\r\n\t]/g, '');
  const choices = [code];
  // Some scanners return UPC-A (12 digits) and others EAN-13 (leading zero).
  if (/^\d{12}$/.test(code)) choices.push('0' + code);
  if (/^0\d{12}$/.test(code)) choices.push(code.slice(1));
  for (const barcode of choices) {
    if (state.byBarcode.has(barcode)) return state.byBarcode.get(barcode);
  }
  return state.products.find(p => p.urunKodu && fold(p.urunKodu) === fold(code));
}
async function syncCatalog(force = false, quiet = false) {
  if (state.syncing) return;
  const generation = ++state.syncGeneration;
  state.syncing = true;
  $('refreshButton').disabled = true;
  $('refreshButton').classList.add('busy');
  $('syncLabel').textContent = 'XML eşitleniyor...';
  try {
    if (!navigator.onLine) throw new Error('Cihaz çevrimdışı; kayıtlı katalog kullanılabilir.');
    const controller = new AbortController();
    // Includes both response headers and JSON body; exceeds server's 30-second limit.
    const timer = setTimeout(() => controller.abort(), 45_000);
    let response, json;
    try {
      response = await fetch(`/api/products${force ? '?refresh=1' : ''}`, {
        cache: 'no-store', signal: controller.signal
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(response.ok
          ? 'API JSON yerine farklı içerik döndürdü. Cloudflare Pages Function kurulumunu kontrol edin.'
          : `API HTTP ${response.status} hatası verdi. Cloudflare Functions günlüklerini kontrol edin.`);
      }
      json = await response.json();
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new Error('Sunucu 45 saniye içinde yanıt vermedi. Kayıtlı katalog korunuyor.');
      }
      throw error;
    } finally { clearTimeout(timer); }
    if (!response.ok) {
      const detail = json?.detail || json?.error || `HTTP ${response.status}`;
      throw new Error(`${detail}${json?.code === 'UPSTREAM_TIMEOUT' ? ' XML sunucusunu kontrol edin.' : ''}`);
    }
    if (!Array.isArray(json.products) || !json.products.length) throw new Error('Sunucudan geçersiz katalog döndü.');
    if (generation !== state.syncGeneration) return;
    const stale = response.headers.get('X-POS-Cache') === 'STALE';
    const meta = { updatedAt: json.updatedAt || new Date().toISOString(),
      source: 'remote', stale,
      variantCount: json.variantCount, productCount: json.productCount };
    // Do not replace a newer locally imported catalog with an older edge backup.
    if (stale && state.meta?.source === 'local' &&
        new Date(state.meta.updatedAt).getTime() >= new Date(meta.updatedAt).getTime()) {
      if (!quiet) announce('Sunucu eski kataloğu döndürdü; daha yeni yerel XML korunuyor.', 'error');
      return;
    }
    await serializeMutation(() => replaceCatalog(json.products, meta));
    if (generation !== state.syncGeneration) return;
    const snapshot = await getSnapshot();
    setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta, snapshot.excelCount, snapshot.bundleCount);
    channel?.postMessage('catalog-updated');
    if (stale) announce('XML kaynağı gecikiyor: önbellekteki katalog kullanılıyor. Güncellemek için tekrar deneyin.', 'error');
    else if (!quiet) announce(`${json.products.length} varyant güncellendi.`, 'success');
  } catch (error) {
    setSyncStatus();
    if (!quiet || !state.products.length) {
      announce(`XML alınamadı: ${error.message} Yerel XML yüklemeyi deneyin.`, 'error');
    }
  } finally {
    state.syncing = false;
    $('refreshButton').disabled = false;
    $('refreshButton').classList.remove('busy');
    setSyncStatus();
  }
}

async function importXml(file) {
  if (!file) return;
  ++state.syncGeneration; // User's explicit file import wins over a concurrent background fetch.
  try {
    if (file.size > 30 * 1024 * 1024) throw new Error('Dosya 30 MB sınırını aşıyor.');
    const parsed = parseLocalXml(await file.text());
    const meta = { updatedAt: new Date().toISOString(), source: 'local',
      variantCount: parsed.variantCount, productCount: parsed.productCount };
    await serializeMutation(() => replaceCatalog(parsed.products, meta));
    const snapshot = await getSnapshot();
    setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta, snapshot.excelCount, snapshot.bundleCount);
    channel?.postMessage('catalog-updated');
    announce(`${parsed.variantCount} varyant yerel XML'den yüklendi.`, 'success');
  } catch (error) { announce(`XML içe aktarma hatası: ${error.message}`, 'error'); }
  finally { $('xmlFile').value = ''; }
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
    const comparison = compareExcelWithXml(await getXmlCatalog(), parsed.products);
    state.excelPreview = { ...parsed, filename: file.name, comparison };
    const comparisonText = comparison.xmlAvailable
      ? `${comparison.matched} barkod XML ile eşleşti · ${comparison.newProducts} yeni ürün · ${comparison.imagesFromExcel} eşleşen ürüne Excel resim URL'si`
      : 'XML kataloğu bu cihazda bulunamadı; barkod karşılaştırması henüz yapılamadı';
    const imageTotal = parsed.products.filter(p => Boolean(p.gorsel)).length;
    const taxText = parsed.missingTax ? ' · Bu Excel’de KDV yok; yalnız yeni ürünlerin KDV oranını ayrıca kontrol edin.' : '';
    $('excelSummary').textContent = `${parsed.products.length} geçerli ürün · ${imageTotal} görsel URL · ${parsed.errors.length} hatalı satır · ${comparisonText}${taxText}. Eşleşen XML ürünlerinin fiyat/stok/KDV bilgileri korunur.`;
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
          `${product.barkod || product.urunKodu} · Stok ${product.stok} · ${money(product.satisFiyati, product.paraBirimi)}${product.gorsel ? ' · Görsel URL ✓' : ''}`;
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
    setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta, snapshot.excelCount, snapshot.bundleCount);
    channel?.postMessage('excel-updated');
    state.excelPreview = null;
    $('excelDialog').close();
    announce(`${pending.products.length} Excel ürünü yüklendi. ${pending.comparison?.matched || 0} barkod mevcut XML ile eşleşti; eşleşenlerin stok, fiyat ve KDV bilgileri korundu.`, 'success');
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
      baslik: line.product.baslik, beden: line.product.beden, renk: line.product.renk,
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
    if ($('autoPrint').checked) printSale(record);
  } catch (error) { announce(`Satış kaydedilemedi: ${error.message}`, 'error'); }
  finally { state.saving = false; renderCart(); }
}
function renderReceipt(sale) {
  const width = $('receiptWidth').value === '58' ? '58mm' : '80mm';
  $('receiptPrint').style.setProperty('--receipt-width', width);
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
    ${sale.items.map(item => `<div class="receipt-product">${esc(item.baslik)}
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
function chirp() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (Context) {
      const audio = new Context();
      const oscillator = audio.createOscillator(); const gain = audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = 950;
      gain.gain.value = 0.045; oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + 0.075);
      oscillator.onended = () => audio.close();
    }
  } catch { /* audio optional */ }
  navigator.vibrate?.(70);
}
let lastScanText = '', lastScanTime = 0;
function scanned(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return;
  const now = Date.now();
  if (value === lastScanText && now - lastScanTime < 1300) return;
  lastScanText = value; lastScanTime = now;
  const product = exactProduct(value);
  if (!product) {
    dom.scanMessage.textContent = 'Barkod okundu (' + value + '), ancak katalogda ürün bulunamadı.';
    return;
  }
  if (addToCart(product)) {
    chirp();
    $('scanManualBarcode').value = '';
    dom.scanMessage.textContent = product.baslik + ' sepete eklendi ✓';
  } else {
    dom.scanMessage.textContent = product.baslik + ': Stok veya sepet limitini kontrol edin.';
  }
}
async function stopScanner() {
  const session = state.scanner;
  if (!session) return;
  session.active = false;
  state.scanner = null;
  if (session.timer) clearTimeout(session.timer);
  if (session.stream) session.stream.getTracks().forEach(track => track.stop());
  if (session.lib) {
    try { await session.lib.stop(); } catch { /* not started or photo mode */ }
    try { session.lib.clear(); } catch { /* already cleared */ }
  }
  const video = $('scanVideo');
  video.pause();
  video.srcObject = null;
}
let qrLibraryPromise;
function ensureQrLibrary() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (qrLibraryPromise) return qrLibraryPromise;
  qrLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/html5-qrcode.min.js';
    script.onload = () => window.Html5Qrcode ? resolve() : reject(new Error('Barkod okuyucu kütüphanesi bulunamadı.'));
    script.onerror = () => {
      script.remove();
      reject(new Error('Barkod modülü yüklenemedi.'));
    };
    document.head.append(script);
  }).catch(error => { qrLibraryPromise = null; throw error; });
  return qrLibraryPromise;
}
function cameraError(error) {
  const name = error?.name || '';
  const msg = String(error?.message || error || 'Bilinmeyen hata');
  if (name === 'NotAllowedError' || /permission|denied|notallowed/i.test(msg)) return 'Kamera izni reddedildi; Safari site kamera iznini açın.';
  if (name === 'NotFoundError' || /notfound|no camera/i.test(msg)) return 'Kamera bulunamadı.';
  if (name === 'NotReadableError' || /notreadable|could not start video/i.test(msg)) return 'Kamera başka uygulamada açık olabilir.';
  return msg.slice(0, 150);
}
function scanFormats() {
  const supported = window.Html5QrcodeSupportedFormats || {};
  return ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39', 'ITF', 'CODABAR', 'QR_CODE']
    .map(name => supported[name]).filter(item => item != null);
}
async function startNativeScanner(session) {
  if (!('BarcodeDetector' in window)) throw new Error('Native okuyucu desteklenmiyor.');
  const supported = await BarcodeDetector.getSupportedFormats();
  const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code']
    .filter(format => supported.includes(format));
  if (!formats.length) throw new Error('Uygun native barkod biçimi yok.');
  const detector = new BarcodeDetector({ formats });
  session.stream = await navigator.mediaDevices.getUserMedia({
    audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
  });
  if (!session.active) { session.stream.getTracks().forEach(track => track.stop()); return; }
  const video = $('scanVideo');
  $('html5-reader').style.display = 'none';
  video.style.display = 'block';
  video.srcObject = session.stream;
  await video.play();
  dom.scanMessage.textContent = 'Alternatif okuyucu açık. Barkodu hizalayın.';
  const scanFrame = async () => {
    if (!session.active) return;
    try {
      if (video.readyState >= 2) {
        const detections = await detector.detect(video);
        if (detections?.[0]?.rawValue) scanned(detections[0].rawValue);
      }
    } catch { /* one frame may fail */ }
    if (session.active) session.timer = setTimeout(scanFrame, 180);
  };
  scanFrame();
}
async function startScanner() {
  await stopScanner();
  if (!dom.scanDialog.open) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    dom.scanMessage.textContent = 'Kamera erişimi yok. HTTPS üzerinden Safari/Chrome kullanın veya barkodu elle yazın.';
    return;
  }
  const session = { active: true, stream: null, lib: null, timer: null };
  state.scanner = session;
  dom.scanMessage.textContent = 'Arka kamera açılıyor. İzin sorulursa onaylayın.';
  $('scanVideo').style.display = 'none';
  $('html5-reader').style.display = 'block';
  try {
    await ensureQrLibrary();
    if (!session.active) return;
    const formats = scanFormats();
    const lib = new window.Html5Qrcode('html5-reader', {
      verbose: false,
      ...(formats.length ? { formatsToSupport: formats } : {}),
      useBarCodeDetectorIfSupported: false
    });
    session.lib = lib;
    // Use the full camera frame for long EAN/UPC barcodes; don't crop to a small QR region.
    await lib.start({ facingMode: 'environment' },
      { fps: 12, disableFlip: true },
      code => { if (session.active) scanned(code); }, () => {});
    if (!session.active) { try { await lib.stop(); } catch {} return; }
    dom.scanMessage.textContent = 'Kamera açık: Barkod çizgilerinin tamamını gösterin. 15–25 cm mesafeden deneyin.';
  } catch (error) {
    if (!session.active) return;
    if (session.lib) {
      try { await session.lib.stop(); } catch {}
      try { session.lib.clear(); } catch {}
      session.lib = null;
    }
    $('html5-reader').style.display = 'none';
    try { await startNativeScanner(session); }
    catch (otherError) {
      if (!session.active) return;
      dom.scanMessage.textContent = 'Kamera açılamadı: ' + cameraError(error) +
        ' / ' + cameraError(otherError) + '. Fotoğraftan okutun veya barkodu aşağıya yazın.';
    }
  }
}
async function scanBarcodePhoto(file) {
  if (!file) return;
  await stopScanner();
  dom.scanMessage.textContent = 'Fotoğraf okunuyor…';
  $('scanVideo').style.display = 'none';
  $('html5-reader').style.display = 'block';
  try {
    await ensureQrLibrary();
    const formats = scanFormats();
    const lib = new window.Html5Qrcode('html5-reader', {
      verbose: false,
      ...(formats.length ? { formatsToSupport: formats } : {}),
      useBarCodeDetectorIfSupported: false
    });
    state.scanner = { active: true, lib, stream: null, timer: null };
    const code = await lib.scanFile(file, false);
    scanned(code);
  } catch (error) {
    dom.scanMessage.textContent = 'Fotoğraftaki barkod çözülemedi. Daha net fotoğraf deneyin veya barkodu elle girin. ' +
      String(error?.message || error).slice(0, 100);
  }
}

async function setup() {
  setConnection();
  window.addEventListener('online', () => { setConnection(); installBuiltInCatalog(); syncCatalog(false, true); });
  window.addEventListener('offline', setConnection);
  dom.search.addEventListener('input', () => {
    state.search = dom.search.value;
    state.visibleLimit = 48;
    if (state.search.trim()) setView('catalog');
    else renderProducts();
  });
  $('navHome').addEventListener('click', () => setView('home'));
  $('navProducts').addEventListener('click', () => setView('catalog', true));
  $('navSale').addEventListener('click', openSale);
  $('navHistory').addEventListener('click', showHistory);
  $('homeStartSale').addEventListener('click', openSale);
  $('homeBrowse').addEventListener('click', () => setView('catalog', true));
  $('homeCategories').addEventListener('click', openCategoryMenu);
  $('homeAllCategories').addEventListener('click', openCategoryMenu);
  $('homeScan').addEventListener('click', openCamera);
  $('homeExcel').addEventListener('click', () => $('excelFile').click());
  $('homeHistory').addEventListener('click', showHistory);
  $('viewGrid').addEventListener('click', () => { state.productLayout = 'grid'; renderProducts(); });
  $('viewList').addEventListener('click', () => { state.productLayout = 'list'; renderProducts(); });
  $('onlyInStock').addEventListener('click', () => { state.stockOnly = !state.stockOnly; state.visibleLimit = 48; renderProducts(); });
  $('sortProducts').addEventListener('change', () => { state.sort = $('sortProducts').value; renderProducts(); });
  $('loadMoreProducts').addEventListener('click', () => { state.visibleLimit += 48; renderProducts(); });
  $('toggleBarcodePanel').addEventListener('click', () => {
    const panel = $('barcodePanel'); panel.hidden = !panel.hidden;
    $('toggleBarcodePanel').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) $('quickBarcode').focus({ preventScroll: true });
  });
  $('barcodePanel').addEventListener('submit', event => {
    event.preventDefault(); barcodeAdd($('quickBarcode').value, $('quickBarcode'));
  });
  $('quickScanButton').addEventListener('click', openCamera);
  $('saleBarcodeForm').addEventListener('submit', event => {
    event.preventDefault(); barcodeAdd($('saleBarcode').value, $('saleBarcode'));
  });
  $('saleScanButton').addEventListener('click', openCamera);
  $('scanRetry').addEventListener('click', startScanner);
  $('scanManualForm').addEventListener('submit', event => {
    event.preventDefault();
    scanned($('scanManualBarcode').value);
  });
  $('scanPhotoFile').addEventListener('change', event => {
    scanBarcodePhoto(event.target.files?.[0]);
    event.target.value = '';
  });
  $('detailAdd').addEventListener('click', () => {
    if (state.detailProduct && addToCart(state.detailProduct)) $('productDetailDialog').close();
  });
  $('detailImage').addEventListener('click', () => {
    if (state.detailProduct?.gorsel) window.open(state.detailProduct.gorsel, '_blank', 'noopener,noreferrer');
  });
  $('openCategories').addEventListener('click', openCategoryMenu);
  $('welcomeCategories').addEventListener('click', openCategoryMenu);
  $('closeCategories').addEventListener('click', closeCategoryMenu);
  $('showAllProducts').addEventListener('click', showAllProducts);
  $('menuAllProducts').addEventListener('click', showAllProducts);
  $('menuCategorySearch').addEventListener('input', () => renderCategoryTree($('menuCategorySearch').value));
  $('menuExcelImport').addEventListener('click', () => { closeCategoryMenu(); $('excelFile').click(); });
  dom.categoryDialog.addEventListener('click', event => {
    if (event.target !== dom.categoryDialog) return;
    const panel = dom.categoryDialog.querySelector('.category-panel').getBoundingClientRect();
    if (event.clientX > panel.right || event.clientX < panel.left) closeCategoryMenu();
  });
  dom.search.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const found = exactProduct(dom.search.value);
    if (found) { barcodeAdd(dom.search.value, dom.search); state.search = ''; renderProducts(); }
  });
  $('openCart').addEventListener('click', openSale);
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
    const dialog = $(button.dataset.close); dialog.close();
  }));
  dom.scanDialog.addEventListener('close', () => stopScanner());
  dom.cartDialog.addEventListener('close', updateNavigation);
  $('scanButton').addEventListener('click', openCamera);
  $('refreshButton').addEventListener('click', () => syncCatalog(true, false));
  $('importButton').addEventListener('click', () => $('xmlFile').click());
  $('xmlFile').addEventListener('change', () => importXml($('xmlFile').files[0]));
  $('excelImportButton').addEventListener('click', () => $('excelFile').click());
  $('excelFile').addEventListener('change', () => selectExcelFile($('excelFile').files[0]));
  $('confirmExcelImport').addEventListener('click', confirmExcelImport);
  document.querySelectorAll('input[name="payment"]').forEach(el => el.addEventListener('change', updatePayment));
  dom.cash.addEventListener('input', () => { dom.cash.dataset.edited = 'true'; updatePayment(); });
  dom.complete.addEventListener('click', completeSale);
  $('historyButton').addEventListener('click', showHistory);
  $('exportSales').addEventListener('click', exportHistory);
  for (const dialog of [dom.cartDialog, dom.scanDialog, dom.historyDialog, $('excelDialog'), $('productDetailDialog')]) {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
  }
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  try {
    await openDB();
    const snapshot = await getSnapshot();
    setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta, snapshot.excelCount, snapshot.bundleCount);
  } catch (error) {
    announce(`Yerel veritabanı açılamadı: ${error.message}`, 'error');
    dom.complete.disabled = true;
  }
  // Camera keyboard terminals benefit from auto-focus; avoid popping up the
  // on-screen keyboard on phones on every launch.
  if (matchMedia('(pointer:fine)').matches) dom.search.focus({ preventScroll: true });
  // Show IDB immediately, then seed missing product images before/alongside XML refresh.
  installBuiltInCatalog();
  syncCatalog(false, true);
  channel?.addEventListener('message', async () => {
    try {
      const snapshot = await getSnapshot();
      setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta, snapshot.excelCount, snapshot.bundleCount);
    } catch { /* another tab may have closed DB */ }
  });
}
setup();
