/** Import spreadsheet rows directly; no XML feed, price override, or remote API. */
import { asText,parseLocaleNumber,safeImageUrl } from './normalize.js';
import { categorizeProduct } from './catalog-taxonomy.js';
const labels={
 urunkodu:'UrunKodu',sku:'UrunKodu',barkod:'Barkod',
 urunadi:'Baslik',baslik:'Baslik',urunbasligi:'Baslik',altbaslik:'AltBaslik',
 aciklama:'Aciklama',marka:'Marka',kategori:'Kategori',kategoriler:'Kategori',
 beden:'Beden',renk:'Renk',stok:'Stok',stokadedi:'Stok',stokdeposu:'StokDeposu',
 satisfiyati:'SatisFiyati',piyasafiyati:'PiyasaFiyati',kdv:'KDV',
 parabirimi:'ParaBirimi',gorselurl:'Gorsel',gorsel:'Gorsel',gorseller:'Gorsel',
 resimurl:'Gorsel',resimler:'Gorsel',resim:'Gorsel'
};
const cleanKey=str=>asText(str).toLocaleLowerCase('tr-TR').replace(/ı/g,'i')
 .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export function variantKey(p){return [p.urunKodu,p.beden,p.renk].map(cleanKey).join('|');}
export function excelProductId(p){return p.barkod?`excel::b:${asText(p.barkod)}`:`excel::s:${variantKey(p)}`;}
export function parseExcelProducts(lines){
 if(!Array.isArray(lines)||!lines.length)throw Error('Excel dosyası boş.');
 let rowIndex=-1,map=[];
 for(let i=0;i<Math.min(lines.length,30);i++){
  const candidate=(lines[i]||[]).map(v=>labels[cleanKey(v)]||'');
  if(['Baslik','SatisFiyati'].every(k=>candidate.includes(k))&&
     (candidate.includes('Barkod')||candidate.includes('UrunKodu'))){rowIndex=i;map=candidate;break;}
 }
 if(rowIndex<0)throw Error('Başlıklar bulunamadı. Barkod, Ürün Başlığı ve Satış Fiyatı gerekli.');
 const sourceKeys=(lines[rowIndex]||[]).map(cleanKey);
 const format=sourceKeys.includes('urunbasligi')?'market-12':'hizlisatis';
 const missingTax=!map.includes('KDV');
 const seen=new Set(),products=[],errors=[];
 for(let i=rowIndex+1;i<lines.length;i++){
  const cells=lines[i]||[],data={};
  for(let col=0;col<map.length;col++){
   if(!map[col])continue;
   const value=asText(cells[col]);
   if(value||!data[map[col]])data[map[col]]=value;
  }
  if(!Object.values(data).some(Boolean))continue;
  const error=msg=>errors.push(`Satır ${i+1}: ${msg}`);
  const barcode=asText(data.Barkod),sku=asText(data.UrunKodu),baslik=asText(data.Baslik);
  if(!barcode&&!sku){error('Barkod veya SKU eksik.');continue;}
  if(!baslik){error('Ürün başlığı eksik.');continue;}
  const rawPrice=asText(data.SatisFiyati);
  const price=parseLocaleNumber(rawPrice,NaN);
  if(!rawPrice||!Number.isFinite(price)||price<0){error('Geçerli satış fiyatı gerekli.');continue;}
  const rawStock=asText(data.Stok),stockUnknown=!rawStock;
  const stock=stockUnknown?0:parseLocaleNumber(rawStock,NaN);
  if(!stockUnknown&&(!Number.isInteger(stock)||stock<0)){error('Stok sıfır veya pozitif tam sayı olmalı.');continue;}
  const market=asText(data.PiyasaFiyati)?parseLocaleNumber(data.PiyasaFiyati,NaN):0;
  const vat=asText(data.KDV)?parseLocaleNumber(data.KDV,NaN):0;
  if(!Number.isFinite(market)||market<0||!Number.isFinite(vat)||vat<0||vat>100){error('Fiyat veya KDV geçersiz.');continue;}
  const currency=(asText(data.ParaBirimi)||'TRY').toUpperCase().replace(/^TL$/,'TRY');
  if(!['TRY','USD','EUR','GBP'].includes(currency)){error('Desteklenmeyen para birimi.');continue;}
  const image=asText(data.Gorsel),gorsel=safeImageUrl(image);
  if(image&&!gorsel){error('Görsel bağlantısı geçerli URL değil.');continue;}
  const category=asText(data.Kategori),kategoriYolu=categorizeProduct(category,baslik);
  const p={barkod:barcode,urunKodu:sku,baslik,aciklama:asText(data.Aciklama)||baslik,
    kategori:kategoriYolu.join(' > '),kaynakKategori:category,kategoriYolu,
    kategoriAna:kategoriYolu[0],kategoriAlt:kategoriYolu.slice(1).join(' > '),
    marka:asText(data.Marka),beden:asText(data.Beden),renk:asText(data.Renk),
    stok:stock,stokBelirsiz:stockUnknown,satisFiyati:price,fiyatBelirsiz:false,
    piyasaFiyati:market,kdv:vat,kdvBelirsiz:missingTax,paraBirimi:currency,gorsel,
    stokDeposu:asText(data.StokDeposu),altBaslik:asText(data.AltBaslik),
    source:'excel',importFormat:format};
  p.id=excelProductId(p);p.variantKey=variantKey(p);
  if(seen.has(p.id)){error('Tekrarlanan barkod.');continue;}
  seen.add(p.id);products.push(p);
  if(products.length>30000){error('En fazla 30.000 ürün.');break;}
 }
 if(!products.length&&!errors.length)throw Error('Excel içinde ürün bulunamadı.');
 return {products,errors,totalRows:products.length+errors.length,format,missingTax};
}
