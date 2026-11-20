import { normalizeCatalog } from './normalize.js';

// DOMParser is deliberately used only for local, user-selected XML files.
// Cloudflare Function uses fast-xml-parser so clients never parse the remote feed.
function directChildren(parent, tag) {
  return [...(parent?.children ?? [])].filter(child => child.localName === tag);
}
function elementText(parent, tag) {
  const element = directChildren(parent, tag)[0];
  return element?.textContent?.trim() ?? '';
}
function readImages(element) {
  const images = directChildren(element, 'Gorseller')[0];
  return { url: directChildren(images, 'url').map(node => node.textContent.trim()) };
}
function nodeAsVariant(element) {
  const keys = ['Barkod', 'Stok', 'Beden', 'Renk', 'PiyasaFiyati',
    'SatisFiyati', 'KDV', 'ParaBirimi'];
  const object = Object.fromEntries(keys.map(key => [key, elementText(element, key)]));
  object.Gorseller = readImages(element);
  return object;
}
export function parseLocalXml(xml) {
  if (typeof xml !== 'string' || xml.length > 30 * 1024 * 1024) {
    throw new Error('XML dosyası boş veya 30 MB sınırını aşıyor.');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DOCTYPE/ENTITY içeren XML güvenlik nedeniyle reddedildi.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML biçimi hatalı.');
  if (doc.documentElement?.localName !== 'Urunler') throw new Error('Beklenen <Urunler> kök etiketi yok.');
  const products = directChildren(doc.documentElement, 'Urun').map(element => {
    const keys = ['UrunKodu', 'Baslik', 'Aciklama', 'Kategori', 'Marka'];
    const record = Object.fromEntries(keys.map(key => [key, elementText(element, key)]));
    record.Gorseller = readImages(element);
    const variantsNode = directChildren(element, 'Varyantlar')[0];
    record.Varyantlar = { Varyant: directChildren(variantsNode, 'Varyant').map(nodeAsVariant) };
    // For feeds without <Varyantlar>, fall back to product-level sales fields.
    Object.assign(record, nodeAsVariant(element), Object.fromEntries(keys.map(key => [key, record[key]])));
    return record;
  });
  return normalizeCatalog({ Urunler: { Urun: products } });
}
