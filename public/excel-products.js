/** Import both the Hizlisatis template and the supplier's 12-column Excel feed. */
import { asText, normalizeCatalog, parseLocaleNumber, safeImageUrl } from './normalize.js';

const labels = {
  urunkodu: 'UrunKodu', sku: 'UrunKodu', barkod: 'Barkod',
  urunadi: 'Baslik', baslik: 'Baslik', urunbasligi: 'Baslik',
  altbaslik: 'AltBaslik', aciklama: 'Aciklama', marka: 'Marka',
  kategori: 'Kategori', kategoriler: 'Kategori', beden: 'Beden', renk: 'Renk',
  stok: 'Stok', stokadedi: 'Stok', stokdeposu: 'StokDeposu',
  satisfiyati: 'SatisFiyati', piyasafiyati: 'PiyasaFiyati',
  kdv: 'KDV', kdvpercent: 'KDV', parabirimi: 'ParaBirimi',
  gorselurl: 'Gorsel', gorsel: 'Gorsel', gorseller: 'Gorsel',
  resimurl: 'Gorsel', resimler: 'Gorsel', resim: 'Gorsel'
};
const REQUIRED = ['Baslik', 'Stok', 'SatisFiyati'];
const cleanKey = str => String(str ?? '').toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '');

export function variantKey(product) {
  return [product.urunKodu, product.beden, product.renk].map(cleanKey).join('|');
}
export function excelProductId(product) {
  const barcode = asText(product.barkod);
  return barcode ? `excel::b:${barcode}` : `excel::s:${variantKey(product)}`;
}

export function parseExcelProducts(lines) {
  if (!Array.isArray(lines) || !lines.length) throw new Error('Excel sayfasında veri bulunamadı.');
  let headerIndex = -1, map = [];
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const candidate = (lines[i] || []).map(v => labels[cleanKey(v)] || '');
    if (REQUIRED.every(k => candidate.includes(k)) && (candidate.includes('UrunKodu') || candidate.includes('Barkod'))) {
      headerIndex = i; map = candidate; break;
    }
  }
  if (headerIndex < 0) throw new Error('Tanımlanabilir ürün başlıkları bulunamadı. Barkod, Ürün Başlığı, Stok Adedi ve Satış Fiyatı gerekli.');
  const sourceKeys = (lines[headerIndex] || []).map(cleanKey);
  const supplierFormat = sourceKeys.includes('urunbasligi') && sourceKeys.includes('stokadedi');
  const format = supplierFormat ? 'market-12' : 'hizlisatis';
  const missingTax = !map.includes('KDV');
  const seen = new Set(), products = [], errors = [];
  const isFilled = value => asText(value).length > 0;
  for (let row = headerIndex + 1; row < lines.length; row++) {
    const cells = lines[row] || [];
    const values = {};
    for (let col = 0; col < map.length; col++) {
      const key = map[col];
      if (!key) continue;
      const value = asText(cells[col]);
      // Old templates can have two image columns. Never let an empty trailing cell erase a URL.
      if (value || !values[key]) values[key] = value;
    }
    if (!Object.values(values).some(isFilled)) continue;
    const error = message => errors.push(`Satır ${row + 1}: ${message}`);
    const sku = asText(values.UrunKodu), barkod = asText(values.Barkod);
    if (!sku && !barkod) { error('SKU veya Barkod gerekli.'); continue; }
    if (!values.Baslik) { error('Ürün Başlığı gerekli.'); continue; }
    const stok = parseLocaleNumber(values.Stok, NaN);
    if (!Number.isInteger(stok) || stok < 0) { error('Stok sıfır veya pozitif tam sayı olmalı.'); continue; }
    const satis = parseLocaleNumber(values.SatisFiyati, NaN);
    if (!Number.isFinite(satis) || satis < 0 || !isFilled(values.SatisFiyati)) {
      error('Satış Fiyatı sıfır veya pozitif sayı olmalı.'); continue;
    }
    const market = !isFilled(values.PiyasaFiyati) ? 0 : parseLocaleNumber(values.PiyasaFiyati, NaN);
    const kdv = !isFilled(values.KDV) ? 0 : parseLocaleNumber(values.KDV, NaN);
    if (!Number.isFinite(market) || market < 0) { error('Piyasa Fiyatı geçerli değil.'); continue; }
    if (!Number.isFinite(kdv) || kdv < 0 || kdv > 100) { error('KDV %0–100 arasında olmalı.'); continue; }
    const currency = (values.ParaBirimi || 'TRY').toUpperCase();
    if (!/^(TRY|TL|EUR|USD|GBP)$/.test(currency)) {
      error('Para birimi TRY, TL, EUR, USD veya GBP olmalı.'); continue;
    }
    const image = asText(values.Gorsel);
    if (image && !safeImageUrl(image)) { error('Görseller sütununda tam http(s) URL bulunmalı.'); continue; }
    const payload = { UrunKodu: sku, Baslik: values.Baslik, Marka: values.Marka,
      Kategori: values.Kategori, Aciklama: values.Aciklama || values.AltBaslik,
      Varyantlar: { Varyant: { Barkod: barkod, Beden: values.Beden,
        Renk: values.Renk, Stok: stok, SatisFiyati: satis, PiyasaFiyati: market,
        KDV: kdv, ParaBirimi: currency, Gorseller: { url: image } } } };
    const normalized = normalizeCatalog({ Urunler: { Urun: payload } }).products[0];
    normalized.id = excelProductId(normalized);
    normalized.source = 'excel';
    normalized.importFormat = format;
    normalized.kdvBelirsiz = missingTax;
    normalized.stokDeposu = values.StokDeposu || '';
    normalized.altBaslik = values.AltBaslik || '';
    normalized.variantKey = variantKey(normalized);
    if (seen.has(normalized.id)) { error('Aynı barkod/ürün varyantı Excel içinde tekrarlanmış.'); continue; }
    seen.add(normalized.id);
    products.push(normalized);
    if (products.length > 30000) { error('Tek dosyada en fazla 30.000 satır kullanılabilir.'); break; }
  }
  if (!products.length && !errors.length) throw new Error('Excel içinde ürün satırı bulunamadı.');
  return { products, errors, totalRows: products.length + errors.length, format, missingTax };
}

/** Compare only by actual barcode; never guess a match by title. */
export function compareExcelWithXml(xmlProducts, excelProducts) {
  const byBarcode = new Map((xmlProducts || []).filter(p => p.barkod).map(p => [p.barkod, p]));
  let matched = 0, newProducts = 0, imagesFromExcel = 0, missingImages = 0, priceDifferences = 0, stockDifferences = 0;
  for (const p of excelProducts) {
    const old = p.barkod && byBarcode.get(p.barkod);
    if (old) {
      matched++;
      if (p.gorsel) imagesFromExcel++;
      else if (!old.gorsel) missingImages++;
      if (Math.abs(old.satisFiyati - p.satisFiyati) > 0.009) priceDifferences++;
      if (old.stok !== p.stok) stockDifferences++;
    } else {
      newProducts++;
      if (!p.gorsel) missingImages++;
    }
  }
  return { xmlAvailable: Boolean(xmlProducts?.length), matched, newProducts, imagesFromExcel,
    missingImages, priceDifferences, stockDifferences };
}

/** Supplier Excel enriches matched XML images only; XML prices/stocks/KDV remain authoritative. */
export function mergeCatalog(xmlProducts, excelProducts) {
  const merged = xmlProducts.map(p => ({ ...p }));
  const byBarcode = new Map(), byVariant = new Map();
  for (let i = 0; i < merged.length; i++) {
    const p = merged[i];
    if (p.barkod && !byBarcode.has(p.barkod)) byBarcode.set(p.barkod, i);
    const key = variantKey(p);
    if (p.urunKodu && !byVariant.has(key)) byVariant.set(key, []);
    if (p.urunKodu) byVariant.get(key).push(i);
  }
  for (const manual of excelProducts) {
    let match = manual.barkod ? byBarcode.get(manual.barkod) : undefined;
    if (match === undefined && !manual.barkod && manual.urunKodu) {
      const candidates = byVariant.get(variantKey(manual)) || [];
      if (candidates.length === 1) match = candidates[0];
    }
    if (match !== undefined) {
      const old = merged[match];
      if (manual.importFormat === 'market-12') {
        merged[match] = { ...old, gorsel: manual.gorsel || old.gorsel };
      } else {
        merged[match] = { ...old, ...manual, id: old.id,
          barkod: manual.barkod || old.barkod, gorsel: manual.gorsel || old.gorsel };
      }
    } else merged.push({ ...manual });
  }
  return merged;
}
