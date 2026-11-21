/** Native SVG category illustrations, not emoji or product photos. **/
const ICONS={
  apple:'<path d="M12 6c-2-2-6-2-8 1-3 4-1 11 3 13 2 1 3 0 5 0s3 1 5 0c4-2 6-9 3-13-2-3-6-3-8-1zM12 6c0-3 1-4 3-5"/>',
  leaf:'<path d="M20 4C8 4 3 9 3 16a5 5 0 0 0 5 5c8 0 13-7 12-17zM3 21c5-8 9-11 14-13"/>',
  salad:'<path d="M3 14h18a8 8 0 0 1-18 0zM8 13c-4-3 0-7 3-5M15 13c4-3 1-7-3-6M13 9c-1-4 4-6 7-3"/>',
  carrot:'<path d="m9 9 6 6-7 7-5-5zM10 8 6 3M12 8l1-6M15 10l5-5"/>',
  meat:'<path d="M20 9c3 4 1 9-4 10l-6 2c-4 1-8-2-8-6 0-2 1-4 3-6l8-6c3-2 6 1 7 6zM9 11l4-3M15 15l2-2"/>',
  drumstick:'<path d="M17 2a7 7 0 0 0-5 12l-6 6a2 2 0 1 1-3-3 2 2 0 1 1-1-4l6-5A7 7 0 1 0 17 2z"/>',
  bread:'<path d="M5 11c-3-1-3-5 0-7 2-2 5-1 6 0 3-2 6-1 8 1 3 3 1 6 0 7v8H5zM11 5v6M17 6v6"/>',
  sandwich:'<path d="M3 9c0-4 4-6 9-6s9 2 9 6v2H3zM3 16h18v4H3zM3 12h18v4H3z"/>',
  cheese:'<path d="M3 11 18 4l3 6v11H3zM3 11l18-1M8 16h.01M15 15h.01M12 19h.01"/>',
  milk:'<path d="M7 2h10v4l2 3v12H5V9l2-3zM7 6h10M9 13h6M9 17h6"/>',
  egg:'<path d="M12 2C7 2 5 9 5 14a7 7 0 0 0 14 0c0-5-2-12-7-12z"/>',
  cookie:'<circle cx="12" cy="12" r="9"/><path d="M10 6h.01M6 12h.01M14 11h.01M12 17h.01M18 15h.01"/>',
  candy:'<path d="m8 9 2-2 7 7-3 3zM8 9 4 7 2 11l5 3M14 17l3 5 5-4-5-4"/>',
  chocolate:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 9h14M5 16h14M12 2v20"/>',
  chips:'<path d="m7 4 10 0 3 17H4zM7 9c3-2 7-2 10 0M10 14l2-3 3 3-3 4z"/>',
  icecream:'<path d="M5 12h14l-7 10zM6 12c-4-4 1-7 4-6 0-6 8-6 8 0 3 0 5 4 1 6z"/>',
  popsicle:'<rect x="7" y="2" width="10" height="15" rx="5"/><path d="M12 17v5M7 8h10"/>',
  box:'<path d="m3 7 9-5 9 5v11l-9 5-9-5zM3 7l9 5 9-5M12 12v11"/>',
  droplet:'<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13z"/>',
  bottle:'<path d="M9 2h6v5l2 3v12H7V10l2-3zM7 13h10M9 5h6"/>',
  cup:'<path d="M5 8h13v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6zM18 10h2a3 3 0 0 1 0 6h-2M8 2v3M12 2v3M16 2v3"/>',
  soda:'<path d="M7 7h10l-1 15H8zM5 7h14M10 7l4-5h6M9 13h6"/>',
  wheat:'<path d="M12 22V2M12 8c-4 0-6-2-6-5 4 0 6 2 6 5zM12 12c4 0 6-2 6-5-4 0-6 2-6 5zM12 16c-4 0-6-2-6-5 4 0 6 2 6 5zM12 20c4 0 6-2 6-5-4 0-6 2-6 5z"/>',
  bowl:'<path d="M3 12h18a9 9 0 0 1-18 0zM9 3c-4 3 2 4-2 7M15 3c-4 3 2 4-2 7"/>',
  jar:'<path d="M6 4h12v4H6zM8 8h8l2 3v11H6V11zM8 14h8M9 18h6"/>',
  washing:'<rect x="3" y="2" width="18" height="20" rx="2"/><circle cx="12" cy="14" r="6"/><path d="M6 6h.01M10 6h.01M14 6h4"/>',
  spray:'<path d="M9 2h8v5H9zM7 10h13v12H5V12zM11 7H5V5h8M16 12l6-3"/>',
  shirt:'<path d="m8 3 4 2 4-2 6 5-4 4-2-2v12H8V10l-2 2-4-4z"/>',
  soap:'<rect x="4" y="8" width="16" height="13" rx="4"/><path d="M9 8V3h8M12 3v5M8 14h8"/>',
  toothbrush:'<path d="M5 4h13M5 4v7h13V4M11 11v11M8 4v3M12 4v3M16 4v3"/>',
  baby:'<circle cx="12" cy="8" r="5"/><path d="M5 22v-3c0-4 3-6 7-6s7 2 7 6v3M8 8h.01M16 8h.01M10 11c1 1 3 1 4 0"/>',
  cat:'<path d="m4 9 2-7 6 4 6-4 2 7v7c0 5-16 5-16 0zM9 13h.01M15 13h.01M10 17c1 1 3 1 4 0M4 15l-3-1M20 15l3-1"/>',
  dog:'<path d="M6 7 3 4 2 10l4 3M18 7l3-3 1 6-4 3M6 7c3-3 9-3 12 0v10a6 6 0 0 1-12 0zM9 13h.01M15 13h.01M10 17h4"/>',
  bird:'<path d="M20 6c-5-5-14-3-15 5-3 2-3 6 0 8 4 3 9 0 11-4 4-1 6-5 4-9zM18 10l5 2-5 2M10 11h.01"/>',
  paw:'<path d="M12 20c-3 0-6 1-8-2-2-3 2-6 4-7 1-1 1-3 4-3s3 2 4 3c2 1 6 4 4 7-2 3-5 2-8 2zM5 5v2M10 2v2M15 2v2M20 5v2"/>',
  home:'<path d="m2 11 10-9 10 9M5 10v12h14V10M10 22v-8h4v8"/>',
  basket:'<path d="M3 9h18l-2 13H5zM7 9l5-7 5 7M9 13v5M15 13v5"/>',
  battery:'<rect x="3" y="7" width="17" height="11" rx="2"/><path d="M20 11h2v3h-2M10 9l-2 5h4l-2 3"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'
};
const RULES=[
 [/beyaz et|tavuk/,'drumstick'],[/kirmizi et|kiyma|kofte/,'meat'],
 [/meyve|bar|kuru meyve/,'apple'],[/sebze|yesillik/,'salad'],[/patates|sogan/,'carrot'],
 [/ekmek|firin/,'bread'],[/donuk|dondurulmus/,'bread'],[/sandvic|hazir yemek/,'sandwich'],
 [/peynir/,'cheese'],[/sut|salep|ayran|yogurt|kefir/,'milk'],[/yumurta/,'egg'],
 [/tereyag|margarin/,'cheese'],[/bal|recel|pekmez|tahin|helva|salca|konserve/,'jar'],
 [/zeytin/,'leaf'],[/sarkuteri/,'meat'],[/cikolata|gofret|surulebilir/,'chocolate'],
 [/cips/,'chips'],[/kek|biskuvi|kurabiye|kraker/,'cookie'],
 [/sakiz|sekerleme/,'candy'],[/kuru yemis|bakliyat/,'basket'],
 [/dondurma|kulah/,'icecream'],[/cubuk/,'popsicle'],
 [/su|buz/,'droplet'],[/gazli|soda|enerji|mesrubat/,'soda'],
 [/meyve suyu|sebze suyu|soguk cay|toz icecek/,'bottle'],
 [/cay|kahve/,'cup'],[/makarna|corba|cerez/,'bowl'],
 [/un|tuz|seker|baharat|harc/,'wheat'],
 [/yag|sirke|sos/,'bottle'],[/pasta malzeme|tatli/,'cookie'],
 [/bebek/,'baby'],[/bulasik|camasir|deterjan/,'washing'],
 [/temizlik|oda kokusu|hasere/,'spray'],[/kagit|havlu|tuvalet/,'box'],
 [/agiz|dis/,'toothbrush'],[/sac|sampuan|dus|sabun|banyo/,'soap'],
 [/tiras|agda|hijyen|vucut|el bakim/,'soap'],
 [/giyim|tekstil/,'shirt'],[/mutfak|yemek/,'bowl'],
 [/oyuncak|hobi/,'basket'],[/pil|cakmak/,'battery'],[/teknoloji|aksesuar/,'phone'],
 [/sepet/,'basket'],[/kedi/,'cat'],[/kopek/,'dog'],[/kus/,'bird'],[/mama|kum/,'paw']
];
const roots={'Kasap':'meat','Manav':'apple','Fırından & Yiyecek':'bread',
  'Süt Ürünleri & Kahvaltılık':'milk','Atıştırmalık':'cookie',
  'Su ve İçecek':'bottle','Dondurma':'icecream','Temel Gıda':'wheat',
  'Ev Bakım & Anne Bebek':'washing','Kişisel Bakım Ürünleri':'soap',
  'Ev & Yaşam':'home','PetShop':'paw'};
const fold=value=>String(value||'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
export function subcategoryArtwork(path,palette=['#f6fafa','#d8f0e7','#438b77']){
  const leaf=fold(String(path||'').split(' > ').at(-1));
  let shape=ICONS[roots[String(path).split(' > ')[0]]||'basket'];
  for(const [rx,key] of RULES)if(rx.test(leaf)){shape=ICONS[key];break;}
  const [base,light,accent]=palette;
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="230" viewBox="0 0 320 230">'+
    '<defs><linearGradient id="paper" x1="0" y1="0" x2="300" y2="230">'+
    '<stop stop-color="#fff"/><stop offset="1" stop-color="'+base+'"/></linearGradient>'+
    '<linearGradient id="disc" x1="100" y1="30" x2="230" y2="210">'+
    '<stop stop-color="'+light+'"/><stop offset="1" stop-color="'+base+'"/></linearGradient></defs>'+
    '<rect width="320" height="230" rx="27" fill="url(#paper)"/>'+
    '<circle cx="160" cy="113" r="95" fill="url(#disc)"/>'+
    '<ellipse cx="160" cy="187" rx="74" ry="8" fill="'+accent+'" opacity=".11"/>'+
    '<g transform="translate(96 49) scale(5.35)" fill="none" stroke="'+accent+
    '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+shape+'</g></svg>';
  return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);
}
