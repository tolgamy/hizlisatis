import { getSnapshot, replaceCatalog, upsertExcelProducts, saveSale, getSales, openDB } from './idb.js';
import { readXlsxRows } from './xlsx-reader.js';
import { parseExcelProducts } from './excel-products.js';
import { parseLocalXml } from './xml-local.js';
import { parseLocaleNumber } from './normalize.js';

const $ = id => document.getElementById(id);
const state = {
  products: [], byId: new Map(), byBarcode: new Map(),
  sold: new Map(), cart: new Map(), category: '', brand: '',
  search: '', meta: null, sales: [], lastSale: null,
  syncing: false, saving: false, scanner: null, syncGeneration: 0,
  excelCount: 0, excelPreview: null, excelUploading: false
};
const dom = {
  search: $('search'), productList: $('productList'), count: $('resultCount'),
  categories: $('categoryFilters'), brands: $('brandFilters'),
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
    $('syncLabel').textContent = state.excelCount ? 'Excel ürünleri yerel olarak kayıtlı' : 'Katalog henüz yüklenmedi';
    $('catalogSource').textContent = state.excelCount ? `${state.excelCount} Excel varyantı` : 'Katalog boş';
    return;
  }
  $('syncLabel').textContent = `${state.meta.stale ? 'Yedek katalog' : 'Son senkronizasyon'}: ${fmtDate(state.meta.updatedAt)}`;
  $('catalogSource').textContent = `${state.products.length} varyant • XML${state.excelCount ? ` + ${state.excelCount} Excel` : ''}`;
}
function setCatalog(products, adjustments, meta, excelCount = 0) {
  state.excelCount = excelCount;
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
function renderFilters() {
  const make = (parent, list, selected, action, allName) => {
    parent.replaceChildren();
    for (const value of ['', ...list]) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `chip${selected === value ? ' active' : ''}`;
      b.textContent = value || allName;
      b.setAttribute('aria-pressed', String(selected === value));
      b.addEventListener('click', () => { state[action] = value; renderFilters(); renderProducts(); });
      parent.append(b);
    }
  };
  const categories = [...new Set(state.products.flatMap(p => [p.kategoriAna, p.kategori]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'tr'));
  const brands = [...new Set(state.products.map(p => p.marka).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'tr'));
  if (state.category && !categories.includes(state.category)) state.category = '';
  if (state.brand && !brands.includes(state.brand)) state.brand = '';
  make(dom.categories, categories, state.category, 'category', 'Tüm Kategoriler');
  make(dom.brands, brands, state.brand, 'brand', 'Tüm Markalar');
}
function renderProducts() {
  const query = fold(state.search);
  const items = state.products.filter(p => {
    if (state.category && p.kategoriAna !== state.category && p.kategori !== state.category) return false;
    if (state.brand && p.marka !== state.brand) return false;
    if (!query) return true;
    return [p.barkod, p.urunKodu, p.baslik, p.marka, p.beden, p.renk]
      .some(value => fold(value).includes(query));
  });
  items.sort((a, b) => Number(remaining(b) > 0) - Number(remaining(a) > 0) ||
    a.baslik.localeCompare(b.baslik, 'tr'));
  dom.count.textContent = `${items.length.toLocaleString('tr-TR')} varyant`;
  dom.productList.replaceChildren();
  const imageHealth = $('imageHealth');
  const visibleItems = items.slice(0, 120);
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
    row.innerHTML = `<img class="product-thumb" alt="" loading="lazy">
      <div class="product-info"><div class="product-title" title="${esc(p.baslik)}">${esc(p.baslik)}</div>
      <div class="product-variant" title="${esc(variant)}">${esc(variant)}</div>
      <div class="product-metadata"><span class="stock ${available ? '' : 'out'}">Stok: ${available}</span>
      <span>KDV %${esc(p.kdv)}</span><span>${esc(p.marka)}</span></div></div>
      <div class="product-right"><span class="price">${esc(money(p.satisFiyati, p.paraBirimi))}</span>
      <button class="add-button" type="button" ${available ? '' : 'disabled'}>${available ? '+ Ekle' : 'Tükendi'}</button></div>`;
    const image = row.querySelector('img');
    image.alt = p.gorsel ? `${p.baslik} ürün görseli` : `${p.baslik} · görsel yok`;
    // Default/origin referrer is needed by some CDN hotlink policies.
    image.referrerPolicy = 'strict-origin-when-cross-origin';
    image.addEventListener('error', () => {
      if (image.dataset.fallback === 'yes') return;
      image.dataset.fallback = 'yes';
      if (p.gorsel) { failedImages++; updateImageHealth(); }
      image.title = p.gorsel ? `Görsel yüklenemedi: ${p.gorsel}` : 'Üründe görsel URL yok';
      image.src = '/icons/placeholder.svg';
    });
    image.addEventListener('click', () => {
      // The source URL can be inspected when an image host blocks embedding.
      if (p.gorsel) window.open(p.gorsel, '_blank', 'noopener,noreferrer');
    });
    image.title = p.gorsel ? 'Görseli tam boy aç' : 'Görsel URL yok';
    if (p.gorsel) { image.style.cursor = 'pointer'; image.tabIndex = 0; }
    image.src = p.gorsel || '/icons/placeholder.svg';
    row.querySelector('button').addEventListener('click', () => addToCart(p));
    fragment.append(row);
  }
  dom.productList.append(fragment);
  $('productLimit').hidden = items.length <= 120;
  $('productLimit').textContent = `İlk 120 varyant gösteriliyor. Diğerlerini bulmak için arama yapın. (${items.length} sonuç)`;
}
function renderCartBar() {
  const count = cartQty();
  dom.cartCount.textContent = String(count);
  dom.cartItemLabel.textContent = `${count} adet ürün`;
  dom.cartTotal.textContent = money(totals().total, cartCurrency());
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
    dom.cartItems.innerHTML = '<div class="empty-state"><strong>Sepet boş</strong>Satışa başlamak için bir ürün ekleyin.</div>';
  }
  for (const line of state.cart.values()) {
    const el = document.createElement('div'); el.className = 'cart-line';
    el.innerHTML = `<div class="cart-line-top"><div class="cart-line-name">${esc(line.product.baslik)}
      <small>${esc([line.product.barkod, line.product.beden, line.product.renk].filter(Boolean).join(' · '))}</small></div>
      <button class="remove-button" type="button" data-remove>Sil</button></div>
      <div class="cart-editor"><label>Adet<div class="stepper">
        <button type="button" data-step="-1" aria-label="Adedi azalt">−</button>
        <input type="number" min="1" step="1" inputmode="numeric" value="${line.quantity}" data-field="quantity" aria-label="Manuel adet">
        <button type="button" data-step="1" aria-label="Adedi artır">+</button>
      </div></label></div>
      <label>Birim fiyat<input type="text" inputmode="decimal" value="${line.unitPrice.toFixed(2)}" data-field="price"></label>
      <label>İskonto %<input type="text" inputmode="decimal" value="${line.discountPct}" data-field="discount"></label></div>
      <div class="line-total">Satır toplamı: ${esc(money(lineTotals(line).total, line.product.paraBirimi))}</div>`;
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
  dom.totals.innerHTML = `<div class="total-row"><span>Ara toplam</span><strong>${esc(money(sum.base, currency))}</strong></div>
    <div class="total-row"><span>İskonto</span><strong>−${esc(money(sum.discount, currency))}</strong></div>
    <div class="total-row"><span>Dahil olan KDV</span><strong>${esc(money(sum.vat, currency))}</strong></div>
    <div class="total-row grand"><span>Ödenecek tutar</span><strong>${esc(money(sum.total, currency))}</strong></div>`;
  dom.complete.disabled = !state.cart.size || state.saving;
  updatePayment();
}
function updatePayment() {
  const selected = document.querySelector('input[name="payment"]:checked').value;
  $('cashBox').hidden = selected !== 'Nakit';
  $('creditBox').hidden = selected !== 'Veresiye';
  if (selected === 'Nakit' && !dom.cash.value.trim()) {
    dom.cash.value = totals().total.toFixed(2);
  }
  const change = parseLocaleNumber(dom.cash.value, 0) - totals().total;
  dom.change.textContent = change >= 0 ? `Para üstü: ${money(round2(change), cartCurrency())}` :
    `Eksik ödeme: ${money(round2(-change), cartCurrency())}`;
  dom.change.style.color = change < -0.009 ? '#b23a42' : '#136c49';
}
function renderAll() { renderFilters(); renderProducts(); renderCartBar(); setSyncStatus(); if (dom.cartDialog.open) renderCart(); }
function exactProduct(raw) {
  const code = raw.trim();
  return state.byBarcode.get(code) || state.products.find(p => p.urunKodu && fold(p.urunKodu) === fold(code));
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
    setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta, snapshot.excelCount);
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
    setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta, snapshot.excelCount);
    channel?.postMessage('catalog-updated');
    announce(`${parsed.variantCount} varyant yerel XML'den yüklendi.`, 'success');
  } catch (error) { announce(`XML içe aktarma hatası: ${error.message}`, 'error'); }
  finally { $('xmlFile').value = ''; }
}
async function selectExcelFile(file) {
  if (!file) return;
  state.excelPreview = null;
  $('confirmExcelImport').disabled = true;
  $('excelSummary').textContent = 'Excel dosyası okunuyor...';
  $('excelErrors').hidden = true;
  $('excelPreview').replaceChildren();
  $('excelDialog').showModal();
  try {
    const lines = await readXlsxRows(file);
    const parsed = parseExcelProducts(lines);
    state.excelPreview = { ...parsed, filename: file.name };
    $('excelSummary').textContent = `${parsed.products.length} geçerli ürün · ${parsed.errors.length} hatalı satır`;
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
        const name = document.createElement('strong'); name.textContent = product.baslik;
        const other = document.createElement('small'); other.textContent =
          `${product.barkod || product.urunKodu} · Stok ${product.stok} · ${money(product.satisFiyati, product.paraBirimi)}${product.gorsel ? ' · Görsel URL ✓' : ''}`;
        line.append(name, other); preview.append(line);
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
    setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta, snapshot.excelCount);
    channel?.postMessage('excel-updated');
    state.excelPreview = null;
    $('excelDialog').close();
    announce(`${pending.products.length} Excel ürünü yüklendi / güncellendi. XML verileri korundu.`, 'success');
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
    dom.cash.value = ''; dom.credit.value = '';
    dom.cartDialog.close();
    renderProducts(); renderCartBar();
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
  const text = String(raw).trim();
  const now = Date.now();
  if (text === lastScanText && now - lastScanTime < 1500) return;
  lastScanText = text; lastScanTime = now;
  const product = exactProduct(text);
  if (product) {
    if (addToCart(product)) { chirp(); dom.scanMessage.textContent = `${product.baslik} sepete eklendi ✓`; }
  } else { dom.scanMessage.textContent = `${text} barkodu katalogda bulunamadı.`; }
}
async function stopScanner() {
  const scanner = state.scanner;
  state.scanner = null;
  if (!scanner) return;
  scanner.active = false;
  if (scanner.timer) clearTimeout(scanner.timer);
  if (scanner.stream) scanner.stream.getTracks().forEach(track => track.stop());
  if (scanner.lib) {
    try { await scanner.lib.stop(); } catch { /* may not have started */ }
    try { scanner.lib.clear(); } catch { /* safe cleanup */ }
  }
  const video = $('scanVideo'); video.pause(); video.srcObject = null;
}
function ensureQrLibrary() {
  if (window.Html5Qrcode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/html5-qrcode.min.js';
    script.onload = () => window.Html5Qrcode ? resolve() : reject(new Error('Barkod kütüphanesi bulunamadı.'));
    script.onerror = () => reject(new Error('Yedek barkod modülü yüklenemedi.'));
    document.head.append(script);
  });
}
async function startScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    dom.scanMessage.textContent = 'Tarayıcı kamera desteği sağlamıyor. HTTPS üzerinden açın.'; return;
  }
  await stopScanner();
  const session = { active: true, stream: null, lib: null, timer: null };
  state.scanner = session;
  dom.scanMessage.textContent = 'Kamera başlatılıyor...';
  $('scanVideo').style.display = '';
  $('html5-reader').style.display = 'none';
  try {
    if (!('BarcodeDetector' in window)) throw new Error('Yerel barkod algılayıcı desteklenmiyor.');
    const supported = typeof BarcodeDetector.getSupportedFormats === 'function' ?
      await BarcodeDetector.getSupportedFormats() : [];
    const preferred = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code'];
    const formats = preferred.filter(format => supported.includes(format));
    if (!formats.length) throw new Error('Yaygın barkod biçimleri desteklenmiyor.');
    const detector = new BarcodeDetector({ formats });
    session.stream = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
    });
    if (!session.active) { session.stream.getTracks().forEach(t => t.stop()); return; }
    const video = $('scanVideo'); video.srcObject = session.stream;
    await video.play();
    dom.scanMessage.textContent = 'Barkodu yeşil alanın içine hizalayın.';
    const scanFrame = async () => {
      if (!session.active) return;
      try {
        if (video.readyState >= 2) {
          const detections = await detector.detect(video);
          if (detections?.[0]?.rawValue) scanned(detections[0].rawValue);
        }
      } catch { /* transient frame decode error */ }
      if (session.active) session.timer = setTimeout(scanFrame, 160);
    };
    scanFrame();
  } catch (nativeError) {
    if (session.stream) session.stream.getTracks().forEach(t => t.stop());
    session.stream = null;
    if (!session.active) return;
    try {
      await ensureQrLibrary();
      if (!session.active) return;
      $('scanVideo').style.display = 'none';
      $('html5-reader').style.display = 'block';
      const scanner = new window.Html5Qrcode('html5-reader', { verbose: false });
      session.lib = scanner;
      await scanner.start({ facingMode: 'environment' },
        { fps: 12, qrbox: { width: 250, height: 120 }, aspectRatio: 1.7778 },
        decoded => scanned(decoded), () => {});
      dom.scanMessage.textContent = 'Yedek okuyucu etkin. Barkodu hizalayın.';
    } catch (fallbackError) {
      dom.scanMessage.textContent = `Kamera başlatılamadı: ${fallbackError.message}`;
      announce('Kamera iznini ve HTTPS bağlantısını kontrol edin.', 'error');
    }
  }
}

async function setup() {
  setConnection();
  window.addEventListener('online', () => { setConnection(); syncCatalog(false, true); });
  window.addEventListener('offline', setConnection);
  dom.search.addEventListener('input', () => { state.search = dom.search.value; renderProducts(); });
  dom.search.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const found = exactProduct(dom.search.value);
    if (found && addToCart(found)) { chirp(); dom.search.value = ''; state.search = ''; renderProducts(); }
  });
  $('openCart').addEventListener('click', () => { renderCart(); dom.cartDialog.showModal(); });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
    const dialog = $(button.dataset.close); dialog.close();
  }));
  dom.scanDialog.addEventListener('close', () => stopScanner());
  $('scanButton').addEventListener('click', () => { dom.scanDialog.showModal(); startScanner(); });
  $('refreshButton').addEventListener('click', () => syncCatalog(true, false));
  $('importButton').addEventListener('click', () => $('xmlFile').click());
  $('xmlFile').addEventListener('change', () => importXml($('xmlFile').files[0]));
  $('excelImportButton').addEventListener('click', () => $('excelFile').click());
  $('excelFile').addEventListener('change', () => selectExcelFile($('excelFile').files[0]));
  $('confirmExcelImport').addEventListener('click', confirmExcelImport);
  document.querySelectorAll('input[name="payment"]').forEach(el => el.addEventListener('change', updatePayment));
  dom.cash.addEventListener('input', updatePayment);
  dom.complete.addEventListener('click', completeSale);
  $('historyButton').addEventListener('click', showHistory);
  $('exportSales').addEventListener('click', exportHistory);
  for (const dialog of [dom.cartDialog, dom.scanDialog, dom.historyDialog, $('excelDialog')]) {
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
    setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta, snapshot.excelCount);
  } catch (error) {
    announce(`Yerel veritabanı açılamadı: ${error.message}`, 'error');
    dom.complete.disabled = true;
  }
  // Camera keyboard terminals benefit from auto-focus; avoid popping up the
  // on-screen keyboard on phones on every launch.
  if (matchMedia('(pointer:fine)').matches) dom.search.focus({ preventScroll: true });
  syncCatalog(false, true); // IDB content already visible; network refresh is non-blocking.
  channel?.addEventListener('message', async () => {
    try {
      const snapshot = await getSnapshot();
      setCatalog(snapshot.products, snapshot.adjustments, snapshot.meta, snapshot.excelCount);
    } catch { /* another tab may have closed DB */ }
  });
}
setup();
