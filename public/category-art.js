const fold = value => String(value || '')
  .toLocaleLowerCase('tr-TR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

export const MAIN_CATEGORY_ORDER = [
  'Kasap',
  'Manav',
  'Fırından & Yiyecek',
  'Süt Ürünleri & Kahvaltılık',
  'Atıştırmalık',
  'Su ve İçecek',
  'Dondurma',
  'Temel Gıda',
  'Ev Bakım & Anne Bebek',
  'Kişisel Bakım Ürünleri',
  'Ev & Yaşam',
  'PetShop'
];

const PALETTES = [
  ['#fff7ef', '#ffe2c4', '#f0a552'],
  ['#f4fbef', '#ddf2c2', '#84b341'],
  ['#fff9ec', '#ffe6b4', '#d28a2b'],
  ['#fff8ef', '#ffe4bb', '#c58c3d'],
  ['#fff8ef', '#ffe0b8', '#c57a32'],
  ['#eff9ff', '#d7efff', '#49a0d8'],
  ['#fff5f8', '#ffd7e6', '#dc6a90'],
  ['#fff9ef', '#f7e7bd', '#c8a25b'],
  ['#f3fbfb', '#d9efef', '#4e9b96'],
  ['#f5fbff', '#dceeff', '#4f88cb'],
  ['#f9f7ff', '#e7defb', '#8b78d6'],
  ['#fff8ef', '#ffe9c6', '#c68a47']
];

const MAIN_META = {
  'Kasap': { image: '/category-images/kasap.webp', icons: ['🥩', '🍗'], palette: PALETTES[0] },
  'Manav': { image: '/category-images/manav.webp', icons: ['🍎', '🥬', '🥕'], palette: PALETTES[1] },
  'Fırından & Yiyecek': { image: '/category-images/firindan-yiyecek.webp', icons: ['🥖', '🥐'], palette: PALETTES[2] },
  'Süt Ürünleri & Kahvaltılık': { image: '/category-images/sut-kahvaltilik.webp', icons: ['🧀', '🥚', '🍯'], palette: PALETTES[3] },
  'Atıştırmalık': { image: '/category-images/atistirmalik.webp', icons: ['🍪', '🍫', '🥨'], palette: PALETTES[4] },
  'Su ve İçecek': { image: '/category-images/su-icecek.webp', icons: ['💧', '🥤', '🧃'], palette: PALETTES[5] },
  'Dondurma': { image: '/category-images/dondurma.webp', icons: ['🍦', '🍨'], palette: PALETTES[6] },
  'Temel Gıda': { image: '/category-images/temel-gida.webp', icons: ['🍝', '🌾', '🫒'], palette: PALETTES[7] },
  'Ev Bakım & Anne Bebek': { image: '/category-images/ev-bakim-anne-bebek.webp', icons: ['🧴', '🧻', '🍼'], palette: PALETTES[8] },
  'Kişisel Bakım Ürünleri': { image: '/category-images/kisisel-bakim.webp', icons: ['🧼', '🪥', '🧴'], palette: PALETTES[9] },
  'Ev & Yaşam': { image: '/category-images/ev-yasam.webp', icons: ['🛋️', '💡', '🕯️'], palette: PALETTES[10] },
  'PetShop': { image: '/category-images/petshop.webp', icons: ['🐶', '🐱', '🐦'], palette: PALETTES[11] }
};;

const SUBCATEGORY_RULES = [
  [/kirmizi et|kıyma|kofte|antrikot|dana/, ['🥩', '🍖']],
  [/beyaz et|tavuk/, ['🍗', '🥚']],
  [/meyve/, ['🍎', '🍊', '🍇']],
  [/sebze|yesillik/, ['🥬', '🥒', '🥕']],
  [/taze firin|firin|ekmek/, ['🥖', '🥐']],
  [/paketli ekmekler/, ['🍞', '🥖']],
  [/donuk firin|dondurulmus/, ['🥐', '🧊']],
  [/hazir yemek|yiyecek|sandvic/, ['🥪', '🍽️']],
  [/konserve/, ['🥫', '🍲']],
  [/peynir|yumurta/, ['🧀', '🥚']],
  [/sut|salep/, ['🥛', '☕']],
  [/yogurt|ayran|kefir/, ['🥛', '🥣']],
  [/tereyagi|margarin/, ['🧈', '🍞']],
  [/bal|recel|pekmez|tahin|helva/, ['🍯', '🍓']],
  [/surulebilir|ezme/, ['🍫', '🍞']],
  [/zeytin/, ['🫒', '🍅']],
  [/sarkuteri/, ['🥓', '🧀']],
  [/cikolata/, ['🍫', '🍬']],
  [/gofret/, ['🍫', '🟫']],
  [/kek|biskuvi|kurabiye|kraker/, ['🍪', '🥨']],
  [/cips/, ['🥔', '🍟']],
  [/sakiz|sekerleme/, ['🍬', '🫧']],
  [/kuru yemis|kuru meyve/, ['🥜', '🍇']],
  [/bar|saglikli beslenme/, ['🥜', '🍓']],
  [/gazli icecek|gazli icecek - soda|maden suyu|soda/, ['🥤', '🫧']],
  [/su - buz|\bsu\b/, ['💧', '🧊']],
  [/meyve .*sular|sebze .*sular/, ['🧃', '🍊']],
  [/soguk cay|kahve/, ['☕', '🧋']],
  [/enerji icecegi|fonksiyonel icecekler/, ['⚡', '🥤']],
  [/toz|hazir icecek/, ['🥤', '🍋']],
  [/kulah dondurmalar/, ['🍦', '✨']],
  [/cubuk dondurmalar/, ['🍡', '🍦']],
  [/kutu dondurmalar|coklu dondurma/, ['🍨', '🧊']],
  [/baklava|tatli/, ['🍨', '🍰']],
  [/bakliyat/, ['🫘', '🌾']],
  [/makarna|corba/, ['🍝', '🥣']],
  [/pasta malzemeleri/, ['🧁', '🥚']],
  [/salca|sos|sirke|salata sosu/, ['🍅', '🥫']],
  [/baharat|harc/, ['🌶️', '🧂']],
  [/un|tuz|seker/, ['🌾', '🧂']],
  [/sivi yag/, ['🫒', '🧴']],
  [/cay|kahve/, ['☕', '🍃']],
  [/bebek/, ['🍼', '👶']],
  [/bulasik/, ['🍽️', '🧽']],
  [/camasir|deterjan/, ['🧺', '🧴']],
  [/ev temizlik|temizlik gerecleri|yaz temizligi/, ['🧹', '🧽']],
  [/kagit|havlu|tuvalet kagidi/, ['🧻', '📄']],
  [/oda kokusu/, ['🪔', '🌸']],
  [/agiz bakim/, ['🪥', '😁']],
  [/sac bakim|sampuan/, ['🧴', '💆']],
  [/dus|banyo|sabun/, ['🧼', '🛁']],
  [/tiras/, ['🪒', '🧴']],
  [/vucut|el bakim|kendine iyi bak/, ['🧴', '🖐️']],
  [/genel saglik|hijyenik ped|agda|tuy dokucu/, ['🩹', '🧼']],
  [/giyim|tekstil/, ['🧦', '👕']],
  [/hasere kontrol/, ['🦟', '🚫']],
  [/mutfak urunleri/, ['🍽️', '🍳']],
  [/oyuncak|hobi/, ['🧸', '🧩']],
  [/pil|cakmak|diger/, ['🔋', '💡']],
  [/teknoloji|aksesuar/, ['📱', '🔌']],
  [/toplu sepetler/, ['🧺', '🛍️']],
  [/tutun urunleri/, ['🚬', '📦']],
  [/kedi mamalari|kedi kumlari/, ['🐱', '🐾']],
  [/kopek mamalari/, ['🐶', '🐾']],
  [/kus yemleri/, ['🐦', '🌾']],
  [/bakim|aksesuar/, ['🐾', '🦴']]
];

function slugHash(text) {
  let hash = 0;
  for (const char of String(text || '')) hash = ((hash * 33) + char.charCodeAt(0)) >>> 0;
  return hash;
}

function paletteFor(text) {
  return PALETTES[slugHash(text) % PALETTES.length];
}

function emojiForPath(path) {
  const normalized = fold(path);
  for (const [pattern, icons] of SUBCATEGORY_RULES) {
    if (pattern.test(normalized)) return icons;
  }
  const top = MAIN_META[path.split(' > ')[0]];
  return top?.icons || ['🛍️'];
}

function encodeSvg(value) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(value)}`;
}

function iconNodes(icons) {
  const size = icons.length === 1 ? 116 : icons.length === 2 ? 88 : 78;
  const positions = icons.length === 1
    ? [[160, 160]]
    : icons.length === 2
      ? [[116, 152], [206, 168]]
      : [[160, 104], [104, 206], [216, 200]];
  return icons.map((icon, index) => {
    const [x, y] = positions[index] || positions.at(-1);
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${size}" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">${icon}</text>`;
  }).join('');
}

function makeArtwork(path, icons, palette) {
  const [bg, accent, accentStrong] = palette;
  const ringOpacity = 0.65;
  return encodeSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320" fill="none">
      <defs>
        <linearGradient id="g" x1="40" y1="30" x2="280" y2="290" gradientUnits="userSpaceOnUse">
          <stop stop-color="#ffffff"/>
          <stop offset="1" stop-color="${bg}"/>
        </linearGradient>
        <filter id="shadow" x="-20" y="-20" width="360" height="360" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#0f2230" flood-opacity="0.08"/>
        </filter>
      </defs>
      <rect x="16" y="16" width="288" height="288" rx="28" fill="url(#g)" filter="url(#shadow)"/>
      <circle cx="84" cy="74" r="42" fill="${accent}" fill-opacity="${ringOpacity}"/>
      <circle cx="250" cy="72" r="26" fill="${accent}" fill-opacity="0.42"/>
      <circle cx="242" cy="250" r="46" fill="${accent}" fill-opacity="0.55"/>
      <circle cx="87" cy="246" r="20" fill="${accentStrong}" fill-opacity="0.14"/>
      <path d="M70 54c23-14 52-18 81-11" stroke="${accentStrong}" stroke-opacity="0.18" stroke-width="7" stroke-linecap="round"/>
      <path d="M198 264c21 3 41-2 56-14" stroke="${accentStrong}" stroke-opacity="0.18" stroke-width="7" stroke-linecap="round"/>
      ${iconNodes(icons)}
    </svg>
  `.replace(/\n\s+/g, ' ').trim());
}

export function categoryArtwork(path) {
  const cleanPath = String(path || '').trim();
  const parts = cleanPath.split(' > ').map(v => v.trim()).filter(Boolean);
  const root = parts[0] || '';
  if (parts.length <= 1 && MAIN_META[root]) {
    const meta = MAIN_META[root];
    return meta.image;
  }
  return makeArtwork(cleanPath, emojiForPath(cleanPath), paletteFor(cleanPath));
}

export function sortCategoryNodes(nodes, parentPath = '') {
  const depth = parentPath ? parentPath.split(' > ').length : 0;
  const order = new Map(MAIN_CATEGORY_ORDER.map((name, index) => [name, index]));
  return [...(nodes || [])].sort((a, b) => {
    if (!depth) {
      const ra = order.has(a.name) ? order.get(a.name) : 999;
      const rb = order.has(b.name) ? order.get(b.name) : 999;
      if (ra !== rb) return ra - rb;
    }
    return a.name.localeCompare(b.name, 'tr');
  });
}
