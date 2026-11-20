/** Pure normalization shared by Cloudflare Function and browser-side XML import. */
export const CATALOG_SCHEMA = 1;

export function asText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(' ');
  if (typeof value === 'object') return asText(value['#text'] ?? value.__cdata ?? '');
  return '';
}

export function parseLocaleNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  let raw = asText(value).replace(/\u00a0/g, ' ').replace(/[^0-9.,+\-]/g, '');
  if (!raw || !/[0-9]/.test(raw)) return fallback;
  const negative = raw[0] === '-';
  raw = raw.replace(/[+\-]/g, '');
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const pos = Math.max(lastComma, lastDot);
  if (pos !== -1) {
    const sep = raw[pos];
    const after = raw.slice(pos + 1);
    const before = raw.slice(0, pos);
    // A single dot/comma before exactly 3 digits usually denotes grouping.
    const repeated = before.includes(sep);
    const otherSep = before.includes(sep === ',' ? '.' : ',');
    const decimal = otherSep || (after.length > 0 && after.length !== 3) ||
      (repeated && after.length !== 3) || (before === '0' && after.length === 3);
    raw = decimal ? before.replace(/[.,]/g, '') + '.' + after : raw.replace(/[.,]/g, '');
  }
  const result = Number(raw);
  return Number.isFinite(result) ? (negative ? -result : result) : fallback;
}

export function plainDescription(value) {
  return asText(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n')
    .trim();
}
function safeCodePoint(number) {
  return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
    ? String.fromCodePoint(number) : '';
}

/** Image links may arrive as strings, nested XML nodes, CDATA, or protocol-relative URLs. */
export function safeImageUrl(value) {
  let raw = asText(value).trim().replace(/&amp;/gi, '&');
  if (!raw) return '';
  // External product feeds sometimes omit the protocol or send root-relative image paths.
  if (raw.startsWith('//')) raw = `https:${raw}`;
  else if (raw.startsWith('/') && !raw.startsWith('//')) raw = `https://cdn.labs-connect.com${raw}`;
  else if (/^(?:\.\/)?(?:images?|uploads?|media|files|assets)\//i.test(raw)) {
    raw = new URL(raw, 'https://cdn.labs-connect.com/').href;
  }
  try {
    const url = new URL(raw);
    // Never use javascript:, data:, file:, credentials, or control-character URLs.
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}

function list(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }

function* nestedImageValues(value, depth = 0) {
  if (depth > 5 || value == null) return;
  if (Array.isArray(value)) {
    for (const part of value) yield* nestedImageValues(part, depth + 1);
  } else if (typeof value === 'object') {
    for (const [key, part] of Object.entries(value)) {
      if (key === '#text' || key === '__cdata' || key === 'text' || key === 'url' ||
          key === 'Url' || key === 'URL' || key === 'src' || key === 'href' ||
          /^(?:g[oö]rsel(?:ler)?|resim(?:ler)?|image(?:s)?|foto(?:graf)?(?:lar)?)$/i.test(key)) {
        yield* nestedImageValues(part, depth + 1);
      }
    }
  } else yield asText(value);
}

function firstUrl(raw) {
  if (!raw || typeof raw !== 'object') return '';
  // XML products often store photos on <Urun>; other feeds store them per <Varyant>.
  for (const field of ['Gorseller', 'Görseller', 'Resimler', 'Gorsel', 'Resim',
    'Image', 'Images', 'GorselURL', 'GorselUrl', 'ResimURL', 'ResimUrl',
    'url', 'Url', 'URL', 'gorsel', 'resim']) {
    if (raw[field] == null) continue;
    for (const item of nestedImageValues(raw[field])) {
      const valid = safeImageUrl(item);
      if (valid) return valid;
    }
  }
  return '';
}

export function normalizeCatalog(tree) {
  const root = tree?.Urunler;
  if (!root || root.Urun == null) throw new Error('XML kökü <Urunler> ve en az bir <Urun> içermeli.');
  const result = [];
  const seen = new Set();
  let ignored = 0;
  for (const [productIndex, product] of list(root.Urun).entries()) {
    if (!product || typeof product !== 'object') { ignored++; continue; }
    const urunKodu = asText(product.UrunKodu);
    const baslik = asText(product.Baslik) || `Ürün ${urunKodu || productIndex + 1}`;
    const aciklama = asText(product.Aciklama);
    const kategori = asText(product.Kategori);
    const kategoriYolu = kategori.split('>').map(x => x.trim()).filter(Boolean);
    const marka = asText(product.Marka);
    const rawVariants = list(product.Varyantlar?.Varyant);
    // A single unvarianted <Urun> is still sellable if product-level fields exist.
    const variants = rawVariants.length ? rawVariants : [product];
    for (const [variantIndex, variant] of variants.entries()) {
      if (!variant || typeof variant !== 'object') { ignored++; continue; }
      const barkod = asText(variant.Barkod);
      if (!urunKodu && !barkod) { ignored++; continue; }
      const variantSignature = barkod || [asText(variant.Beden), asText(variant.Renk)].filter(Boolean).join('|') || `index-${variantIndex}`;
      const idBase = `${urunKodu || `barkod-${barkod}`}::${barkod ? 'b:' : 'v:'}${variantSignature}`;
      // Barcode/option-based identity survives source feed row reordering.
      let id = idBase;
      let suffix = 2;
      while (seen.has(id)) id = `${idBase}::${suffix++}`;
      seen.add(id);
      const stok = Math.max(0, Math.floor(parseLocaleNumber(variant.Stok ?? product.Stok)));
      const satisFiyati = Math.max(0, parseLocaleNumber(variant.SatisFiyati ?? product.SatisFiyati));
      const piyasaFiyati = Math.max(0, parseLocaleNumber(variant.PiyasaFiyati ?? product.PiyasaFiyati));
      const kdv = Math.max(0, Math.min(100, parseLocaleNumber(variant.KDV ?? product.KDV)));
      const currencyRaw = (asText(variant.ParaBirimi ?? product.ParaBirimi) || 'TRY').toUpperCase();
      const paraBirimi = ({ TL: 'TRY', '₺': 'TRY', YTL: 'TRY', '€': 'EUR', '$': 'USD' })[currencyRaw] || currencyRaw;
      result.push({
        id, urunKodu, baslik, aciklama, aciklamaMetin: plainDescription(aciklama),
        kategori, kategoriAna: kategoriYolu[0] || 'Diğer',
        kategoriAlt: kategoriYolu.slice(1).join(' > '), kategoriYolu,
        marka, barkod, stok, beden: asText(variant.Beden), renk: asText(variant.Renk),
        piyasaFiyati, satisFiyati, kdv, paraBirimi,
        gorsel: firstUrl(variant) || firstUrl(product)
      });
    }
  }
  if (!result.length) throw new Error('XML içinde satılabilir ürün/varyant bulunamadı.');
  return { schema: CATALOG_SCHEMA, products: result, ignored,
    productCount: list(root.Urun).length, variantCount: result.length };
}
