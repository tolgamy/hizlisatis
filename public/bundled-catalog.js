/** Offline-ready built-in catalogue, generated from the owner's supplier workbook.
 * This module is independent of the upload UI: every device gets the same
 * starter catalogue automatically on its first successful online visit.
 */
import { safeImageUrl } from './normalize.js';
import { categorizeProduct } from './catalog-taxonomy.js';

const asText = value => String(value ?? '').trim();
const cleanKey = str => asText(str).toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '');

export function productFromBundledRow(row) {
  if (!Array.isArray(row) || row.length < 9) throw new Error('Yerleşik ürün satırı hatalı.');
  const [barcodeRaw, skuRaw, titleRaw, brandRaw, categoryRaw, priceRaw,
    stockRaw, imageRaw, currencyRaw] = row;
  const barkod = asText(barcodeRaw);
  const urunKodu = asText(skuRaw);
  const baslik = asText(titleRaw);
  const kategori = asText(categoryRaw);
  const kategoriYolu = categorizeProduct(kategori, baslik);
  const stokBelirsiz = stockRaw === null || stockRaw === '';
  const fiyatBelirsiz = priceRaw === null || priceRaw === '';
  const marka = asText(brandRaw);
  const paraBirimi = asText(currencyRaw).toUpperCase() || 'TRY';
  const stok = stokBelirsiz ? 0 : Number(stockRaw), satisFiyati = fiyatBelirsiz ? 0 : Number(priceRaw);
  if (!baslik || (!barkod && !urunKodu) || !Number.isInteger(stok) || stok < 0 ||
      !Number.isFinite(satisFiyati) || satisFiyati < 0 || !/^(TRY|EUR|USD|GBP)$/.test(paraBirimi))
    throw new Error('Yerleşik katalogda geçersiz ürün bilgisi.');
  const image = asText(imageRaw);
  const gorsel = safeImageUrl(image);
  if (image && !gorsel) throw new Error('Yerleşik katalogda geçersiz görsel URL.');
  const variantKey = [urunKodu, '', ''].map(cleanKey).join('|');
  return {
    id: barkod ? `excel::b:${barkod}` : `excel::s:${variantKey}`,
    urunKodu, baslik, aciklama: baslik, aciklamaMetin: baslik,
    kategori: kategoriYolu.join(' > '), kaynakKategori: kategori, kategoriAna: kategoriYolu[0] || 'Diğer',
    kategoriAlt: kategoriYolu.slice(1).join(' > '), kategoriYolu,
    marka, barkod, beden: '', renk: '', stok,
    satisFiyati, fiyatBelirsiz, stokBelirsiz, piyasaFiyati: 0, kdv: 0, kdvBelirsiz: true,
    paraBirimi, gorsel, variantKey, source: 'bundle', importFormat: 'market-12'
  };
}

export function parseBundledCatalog(manifest, rows) {
  if (manifest?.schema !== 1 || typeof manifest.version !== 'string' ||
      !/^[a-z0-9]{8,32}$/i.test(manifest.version) ||
      !Number.isInteger(manifest.count) || manifest.count < 1 ||
      !Array.isArray(rows) || rows.length !== manifest.count)
    throw new Error('Yerleşik kataloğun sürüm veya ürün sayısı geçersiz.');
  const products = rows.map(productFromBundledRow);
  const countWithImages = products.filter(p => p.gorsel).length;
  const ids = new Set(products.map(p => p.id));
  if (ids.size !== products.length || countWithImages !== manifest.withImages)
    throw new Error('Yerleşik katalog eksik, görseller tutarsız veya barkodlar tekrarlı.');
  return { version: manifest.version, products, withImages: countWithImages };
}

export async function fetchBundledCatalog(fetcher = fetch) {
  const response = await fetcher('/api/catalog/manifest.json', { cache: 'no-store', credentials:'same-origin' });
  if (!response.ok) throw new Error(`Yerleşik katalog manifesti HTTP ${response.status}.`);
  const manifest = await response.json();
  const paths = manifest?.parts;
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 20 ||
      paths.some(path => typeof path !== 'string' ||
        !/^\/catalog\/products-[0-9a-f]{16}-\d{2}\.json$/i.test(path)))
    throw new Error('Yerleşik katalog parça listesi geçersiz.');
  const pages = await Promise.all(paths.map(async path => {
    const res = await fetcher('/api'+path, { cache: 'no-store', credentials:'same-origin' });
    if (!res.ok) throw new Error(`Katalog parçası yüklenemedi: ${path}`);
    const page = await res.json();
    if (!Array.isArray(page) || page.length > 1000) throw new Error('Katalog parçası geçersiz.');
    return page;
  }));
  return parseBundledCatalog(manifest, pages.flat());
}
