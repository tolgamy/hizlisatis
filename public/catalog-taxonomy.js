/** Mall-style category grouping for flat supplier category names, with no remote dependency. */
const tidy = str => String(str || '').trim().toLocaleLowerCase('tr-TR');
const GROUPS = [
 ['Dondurma', /dondurma|sorbe|gelato/],
 ['İçecekler', /içecek|meyve suyu|su$|maden suyu|soda|gazoz|kola|kahve|çay|limonata|ayran|enerji içece|soğuk çay|ice tea|milkshake|bira|şarap/],
 ['Atıştırmalık', /çikolata|bisküvi|gofret|kraker|cips|sakız|şekerleme|kek|kurabiye|bar|lokum|kuruyemiş|kuru yemiş|kuru meyve|atıştır/],
 ['Süt ve Kahvaltı', /süt|peynir|yoğurt|tereyağ|yumurta|kahvaltı|labne|kaymak|bal$|reçel|helva|zeytin|salep|krema/],
 ['Temizlik', /deterjan|temizlik|çamaşır|bulaşık|sabun|çöp poşet|oda kokusu|yumuşatıcı|dezenfektan|yüzey temiz|kireç|sünger/],
 ['Kişisel Bakım', /şampuan|saç|diş|tıraş|deodorant|kolonya|parfüm|kozmetik|vücut|cilt|ped|hijyen|ıslak mendil|pamuk|peçete/],
 ['Mutfak ve Gıda', /makarna|pirinç|bulgur|bakliyat|un$|şeker$|tuz$|baharat|yağ$|sos|salça|konserve|ton balığı|dondurulmuş|et$|tavuk|balık|sucuk|salam|şarküteri|hazır yemek|çorba|fırın|ekmek/],
 ['Bebek ve Çocuk', /bebek|çocuk|mama|bez$|oyuncak/],
 ['Ev ve Yaşam', /ev$|mutfak|kağıt|havlu|pil$|elektronik|kablo|şarj|çakmak|mangal|kırtasiye|paspas|poşet|bardak|tabak/],
 ['Evcil Hayvan', /kedi|köpek|hayvan|pet shop/],
 ['Meyve ve Sebze', /meyve$|sebze|manav|yeşillik/],
];
const TITLE_HINTS = [
 ['Dondurma','Dondurma',/dondurma|magnum|cornetto|calippo/],
 ['Atıştırmalık','Çikolata',/çikolata|bitter|kakaolu|toblerone/],
 ['Atıştırmalık','Bisküvi',/bisküvi|kurabiye|cookie/],
 ['Atıştırmalık','Cips',/cips|patates cipsi/],
 ['İçecekler','Su',/\bsu\b|water/],
 ['İçecekler','Gazoz / Soda',/gazoz|soda|maden suyu/],
 ['İçecekler','Kahve',/kahve|coffee|latte|espresso/],
 ['İçecekler','Meyve Suyu',/meyve suyu|nektar/],
 ['İçecekler','Çay',/çay|earl grey|tea/],
 ['Süt ve Kahvaltı','Süt',/süt|milk/],
 ['Süt ve Kahvaltı','Peynir',/peynir|kaşar|labne/],
 ['Kişisel Bakım','Şampuan',/şampuan|shampoo|head.shoulder/],
 ['Kişisel Bakım','Hijyen',/ped|ıslak mendil|kolonya/],
 ['Temizlik','Deterjan',/deterjan|çamaşır|bulaşık/],
 ['Evcil Hayvan','Mama',/kedi maması|köpek maması/],
 ['Mutfak ve Gıda','Konserve',/ton balığı|konserve/]
];
function subIceCream(name) {
 if (/külah|cornetto|cone/.test(name)) return 'Külah';
 if (/çubuk|stick|magnum|classics/.test(name)) return 'Çubuk';
 if (/aile|kutulu|kutu|paket|ml|litre|kg|\d+['’]?li/.test(name)) return 'Kutulu / Aile Boyu';
 return 'Diğer Dondurmalar';
}
export function categorizeProduct(rawCategory, title='') {
 const category = String(rawCategory || '').trim();
 const name = tidy(title);
 if (category.includes('>')) return category.split('>').map(v=>v.trim()).filter(Boolean);
 if (category) {
  const key = tidy(category);
  const group = GROUPS.find(([,pattern])=>pattern.test(key))?.[0] || 'Diğer Kategoriler';
  if (group === 'Dondurma') return ['Dondurma', subIceCream(name)];
  return [group,category === group ? 'Diğer' : category];
 }
 for (const [group,sub,pattern] of TITLE_HINTS) {
  if (pattern.test(name)) return group==='Dondurma' ? [group,subIceCream(name)] : [group,sub];
 }
 return ['Diğer Kategoriler','Diğer Ürünler'];
}
export function productPictureEmoji(product) {
 const text = tidy(`${product?.kategoriYolu?.join(' ') || product?.kategori || ''} ${product?.baslik || ''}`);
 if (/dondurma|cornetto|magnum/.test(text)) return '🍦';
 if (/cikolata|çikolata|gofret|bitter/.test(text)) return '🍫';
 if (/kahve|latte|espresso/.test(text)) return '☕';
 if (/çay|tea/.test(text)) return '🫖';
 if (/\bsu\b|soda|gazoz|içecek|meyve suyu/.test(text)) return '🥤';
 if (/süt|ayran|yoğurt|peynir/.test(text)) return '🥛';
 if (/cips|kraker/.test(text)) return '🥔';
 if (/bisküvi|kurabiye|kek/.test(text)) return '🍪';
 if (/temizlik|deterjan|sabun/.test(text)) return '🧴';
 if (/şampuan|kozmetik|bakım/.test(text)) return '🧼';
 if (/bebek|mama/.test(text)) return '🍼';
 if (/et|tavuk|şarküteri/.test(text)) return '🥩';
 if (/sebze|manav|meyve/.test(text)) return '🍎';
 if (/kedi|köpek|evcil/.test(text)) return '🐾';
 if (/ekmek|fırın/.test(text)) return '🥖';
 return '🛒';
}
