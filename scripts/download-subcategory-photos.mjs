/** Download one openly licensed CC0 *photograph* per actual subcategory.
 * This is an explicit one-time asset generation script; it never uses the
 * product catalogue's SKU images and never modifies product data.
 * Run in a CI environment with Internet access and commit the result.
 */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const PHOTO_SEARCHES=new Map([
  ["Atıştırmalık > Bar", "assorted granola protein bars"],
  ["Atıştırmalık > Cips", "potato crisps chips bowl"],
  ["Atıştırmalık > Çikolata", "chocolate bars assorted"],
  ["Atıştırmalık > Gofret", "chocolate wafer biscuits"],
  ["Atıştırmalık > Kek & Bisküvi", "cookies biscuits cake"],
  ["Atıştırmalık > Kraker & Kurabiye", "salty crackers cookies"],
  ["Atıştırmalık > Kuru Yemiş & Kuru Meyve", "nuts dried fruit bowls"],
  ["Atıştırmalık > Sağlıklı Beslenme", "healthy oats granola muesli"],
  ["Atıştırmalık > Sakız & Şekerleme", "colorful sweets candies"],
  ["Dondurma > Baklava - Tatlı", "baklava dessert pastry"],
  ["Dondurma > Çoklu Dondurma", "ice cream assorted popsicles"],
  ["Dondurma > Çubuk Dondurmalar", "ice cream stick popsicle"],
  ["Dondurma > Kutu Dondurmalar", "ice cream tub bowl scoops"],
  ["Dondurma > Külah Dondurmalar", "ice cream waffle cone"],
  ["Ev & Yaşam > Ayakkabı Bakım", "shoe polish brushes leather"],
  ["Ev & Yaşam > Giyim & Tekstil", "folded clothing textiles"],
  ["Ev & Yaşam > Haşere Kontrol", "mosquito repellent spray products"],
  ["Ev & Yaşam > Mutfak Ürünleri", "kitchen cookware utensils"],
  ["Ev & Yaşam > Oyuncak & Hobi", "colorful toys hobby supplies"],
  ["Ev & Yaşam > Pil-Çakmak-Diğer", "batteries and lighters"],
  ["Ev & Yaşam > Teknoloji & Aksesuar", "phone chargers headphones electronics"],
  ["Ev & Yaşam > Toplu Sepetler", "grocery shopping basket"],
  ["Ev & Yaşam > Tütün Ürünleri", "cigarettes tobacco packets"],
  ["Ev Bakım & Anne Bebek > Bebek Ürünleri", "baby bottles diapers products"],
  ["Ev Bakım & Anne Bebek > Bulaşık Yıkama", "dish soap sponge washing"],
  ["Ev Bakım & Anne Bebek > Çamaşır Yıkama", "laundry detergent wash fabric"],
  ["Ev Bakım & Anne Bebek > Ev Temizlik", "household cleaning supplies"],
  ["Ev Bakım & Anne Bebek > Havlu-Tuvalet Kağıdı", "paper towels toilet paper"],
  ["Ev Bakım & Anne Bebek > Kağıt Ürünleri", "paper tissues napkins"],
  ["Ev Bakım & Anne Bebek > Oda Kokusu", "home fragrance reed diffuser"],
  ["Ev Bakım & Anne Bebek > Temizlik Gereçleri", "cleaning brushes sponges mop"],
  ["Ev Bakım & Anne Bebek > Toz - Sıvı Deterjanlar", "washing powder liquid detergent"],
  ["Ev Bakım & Anne Bebek > Yaz Temizliği", "household spring cleaning"],
  ["Fırından & Yiyecek > Dondurulmuş Ürünler", "frozen food vegetables ice"],
  ["Fırından & Yiyecek > Donuk Fırın", "frozen baked pastry puff pastry"],
  ["Fırından & Yiyecek > Hazır Yemek", "ready meal sandwich lunch"],
  ["Fırından & Yiyecek > Konserve", "canned food tins"],
  ["Fırından & Yiyecek > Paketli Ekmekler", "packaged sandwich bread"],
  ["Fırından & Yiyecek > Taze Fırın", "fresh baked bread bakery"],
  ["Fırından & Yiyecek > Yiyecek - Sandviç", "fresh sandwich baguette"],
  ["Kasap > Beyaz Et", "raw chicken poultry meat"],
  ["Kasap > Kırmızı Et", "fresh raw beef steak"],
  ["Kişisel Bakım Ürünleri > Ağda & Tüy Dökücü", "wax hair removal cosmetics"],
  ["Kişisel Bakım Ürünleri > Ağız Bakım", "toothbrush toothpaste"],
  ["Kişisel Bakım Ürünleri > Duş-Banyo &Sabun", "soap bath shower gel"],
  ["Kişisel Bakım Ürünleri > Genel Sağlık", "first aid hygiene pharmacy"],
  ["Kişisel Bakım Ürünleri > Hijyenik Ped", "hygiene feminine pads"],
  ["Kişisel Bakım Ürünleri > Kendine İyi Bak", "skincare self care cosmetics"],
  ["Kişisel Bakım Ürünleri > Saç Bakım & Şampuan", "shampoo hair care bottles"],
  ["Kişisel Bakım Ürünleri > Tıraş Malzemeleri", "razor shaving brush foam"],
  ["Kişisel Bakım Ürünleri > Vücut & El Bakım", "body lotion hand cream skincare"],
  ["Manav > Meyve", "colorful fresh fruit market"],
  ["Manav > Sebze", "fresh green vegetables market"],
  ["PetShop > Bakım & Aksesuar", "pet toys dog leash accessories"],
  ["PetShop > Kedi Kumları", "cat litter tray litter"],
  ["PetShop > Kedi Mamaları", "cat kibble food bowl"],
  ["PetShop > Köpek Mamaları", "dog food kibble bowl"],
  ["PetShop > Kuş Yemleri", "bird seed grains feeder"],
  ["Su ve İçecek > Enerji İçeceği", "energy drink cans"],
  ["Su ve İçecek > Fonksiyonel İçecekler", "sports drink bottle"],
  ["Su ve İçecek > Gazlı İçecek", "soft drinks soda glass"],
  ["Su ve İçecek > Gazlı İçecek - Soda", "fizzy soda mineral water"],
  ["Su ve İçecek > Maden Suyu", "sparkling mineral water bottle"],
  ["Su ve İçecek > Meyve & Sebze Suları", "fresh orange juice bottles"],
  ["Su ve İçecek > Soğuk Çay & Kahve", "iced coffee iced tea"],
  ["Su ve İçecek > Su - Buz", "bottled drinking water ice"],
  ["Su ve İçecek > Toz & Hazır İçecek", "instant drink powder"],
  ["Süt Ürünleri & Kahvaltılık > Bal & Reçel", "honey jars fruit jam"],
  ["Süt Ürünleri & Kahvaltılık > Helva, Tahin & Pekmez", "sesame halva tahini sweet"],
  ["Süt Ürünleri & Kahvaltılık > Peynir - Yumurta", "cheese eggs breakfast"],
  ["Süt Ürünleri & Kahvaltılık > Sürülebilir Çikolata & Ezme", "chocolate hazelnut spread jar"],
  ["Süt Ürünleri & Kahvaltılık > Süt & Salep", "milk glass bottle dairy"],
  ["Süt Ürünleri & Kahvaltılık > Şarküteri", "deli meat cold cuts"],
  ["Süt Ürünleri & Kahvaltılık > Tereyağı - Margarin", "fresh butter breakfast"],
  ["Süt Ürünleri & Kahvaltılık > Yoğurt - Ayran - Kefir", "yogurt kefir milk"],
  ["Süt Ürünleri & Kahvaltılık > Zeytin", "black green olives bowls"],
  ["Temel Gıda > Baharat & Harç", "assorted spices herbs jars"],
  ["Temel Gıda > Bakliyat", "assorted lentils beans dry legumes"],
  ["Temel Gıda > Çay & Kahve", "coffee beans tea cups"],
  ["Temel Gıda > Konserve & Turşu", "preserved canned food pickles"],
  ["Temel Gıda > Makarna & Çorba", "pasta noodles soup bowl"],
  ["Temel Gıda > Pasta Malzemeleri", "baking flour whisk ingredients"],
  ["Temel Gıda > Salça & Sos", "tomato paste sauce jars"],
  ["Temel Gıda > Sıvı Yağ", "olive sunflower oil bottle"],
  ["Temel Gıda > Sirke & Salata Sosu", "vinegar salad dressing bottles"],
  ["Temel Gıda > Un, Tuz & Şeker", "flour sugar salt baking"]
]);
const base=resolve('public/subcategory-photos');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const slug=value=>value.toLocaleLowerCase('tr-TR').replace(/ı/g,'i')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);

async function fetchTimed(url,ms=12000) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(url,{signal:controller.signal,redirect:'follow',
    headers:{'User-Agent':'HizliSatis-CategoryAssets/1.0 (CC0 images only)','Accept':'application/json,image/*'}});}
  finally{clearTimeout(timer);}
}
async function searchImages(query) {
  const url='https://api.openverse.org/v1/images/?'+new URLSearchParams({
    q:query,license:'cc0',categories:'photograph',page_size:'20'
  });
  for(let attempt=0;attempt<4;attempt++){
    try {
      const response=await fetchTimed(url);
      if(response.status===429||response.status>=500){await sleep(2200*(attempt+1));continue;}
      if(!response.ok)throw Error('Search HTTP '+response.status);
      const body=await response.json();
      return (body.results||[]).filter(x=>x.id&&x.license==='cc0'&&
        x.thumbnail&&!x.mature&&
        (!x.width||x.width>=300)&&(!x.height||x.height>=220));
    }catch(error){if(attempt===3)throw error;await sleep(1600*(attempt+1));}
  }
  return [];
}
const seen=new Set();
const manifest={};
const credits=[];
const failed=[];
await mkdir(base,{recursive:true});
for(const [category,query] of PHOTO_SEARCHES) {
  const terms=[query,query.split(' ').slice(-2).join(' '),category.split(' > ').at(-1)];
  let candidates=[];
  for(const term of terms){
    try{candidates=await searchImages(term);}catch(e){console.warn(category,'search retry',e.message);}
    if(candidates.length)break;
  }
  let found=false;
  for(const item of candidates) {
    if(seen.has(item.id))continue;
    try {
      const image=await fetchTimed(item.thumbnail,15000);
      const type=(image.headers.get('content-type')||'').split(';')[0].toLowerCase();
      if(!image.ok||!['image/jpeg','image/png','image/webp'].includes(type))continue;
      const bytes=new Uint8Array(await image.arrayBuffer());
      if(bytes.length<3000||bytes.length>950000)continue;
      const extension={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[type];
      const name=slug(category)+extension;
      await writeFile(join(base,name),bytes);
      const file='/subcategory-photos/'+name;
      manifest[category]=file;
      credits.push({category,file,photoId:item.id,query,source:item.foreign_landing_url,
        author:item.creator,license:item.license,licenseUrl:item.license_url});
      seen.add(item.id);found=true;break;
    }catch(error){console.warn('image failed',category,error.message);}
  }
  if(!found)failed.push(category);
  console.log('Category photo',Object.keys(manifest).length+'/'+PHOTO_SEARCHES.size,category,found?'OK':'MISSING');
  await sleep(320);
}
await writeFile(join(base,'credits.json'),JSON.stringify(credits,null,2)+'\n');
const src='/** CC0 category-specific photographs; generated by scripts/download-subcategory-photos.mjs. */\n'+
 'export const SUBCATEGORY_PHOTOS=Object.freeze('+JSON.stringify(manifest,null,2)+');\n'+
 'export function subcategoryPhoto(path){return SUBCATEGORY_PHOTOS[path]||null;}\n';
await writeFile(resolve('public/subcategory-photos.js'),src);
if(failed.length) {
 console.error('Missing photographs:',failed);
 process.exitCode=1;
}else console.log('All '+PHOTO_SEARCHES.size+' CC0 category photographs ready.');
