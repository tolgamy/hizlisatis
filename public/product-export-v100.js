// Read-only central export. No product writes, no local-cache fallback.
import {fetchRemoteProducts} from './remote-products.js';
export const HEADERS=['Barkod','Marka Adı','Kategori Adı','Ürün Adı','Ürün Açıklaması','Stok Kodu','Görsel 1','KDV Oranı','Alış Fiyatı','Satış Fiyatı','Stok Miktarı','Birim','Menşei','Ana Kategori','Alt Kategori','Ürün Durumu','KDV Dahil / Hariç','Para Birimi'];
const enc=new TextEncoder();
const esc=x=>String(x??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const number=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
export function productRow(p){
 const statuses={'active':'AKTİF','initial-inactive':'PASİF (BAŞLANGIÇ)','later-inactive':'PASİF','deleted':'SİLİNMİŞ'};
 return [String(p.barkod??''),p.marka,p.kategori,p.baslik,p.aciklama,String(p.urunKodu??''),typeof p.gorsel==='string'&&/^https?:\/\//i.test(p.gorsel)?p.gorsel:'',p.kdvBelirsiz?null:number(p.kdv),number(p.alisFiyati),p.fiyatBelirsiz?null:number(p.satisFiyati),p.stokBelirsiz?null:number(p.stok),p.birim,p.mensei||p['menşei']||'',p.kategoriAna,p.kategoriAlt,statuses[p.lifecycleStatus||'active']||p.lifecycleStatus,p.kdvExcluded===true?'HARİÇ':p.kdvExcluded===false?'DAHİL':'',p.paraBirimi];
}
const xmlHead='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const pkg='http://schemas.openxmlformats.org/package/2006/relationships';
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0});
function crc32(data){let n=0xffffffff;for(const b of data)n=(n>>>8)^crcTable[(n^b)&255];return(n^0xffffffff)>>>0;}
function zip(files){
 const parts=[],directory=[];let offset=0,dirSize=0;
 for(const [name,content] of files){
  const n=enc.encode(name),d=enc.encode(content),crc=crc32(d),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,2048,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,d.length,true);v.setUint32(22,d.length,true);v.setUint16(26,n.length,true);h.set(n,30);
  const c=new Uint8Array(46+n.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,2048,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,d.length,true);cv.setUint32(24,d.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);c.set(n,46);
  parts.push(h,d);directory.push(c);offset+=h.length+d.length;dirSize+=c.length;
 }
 const e=new Uint8Array(22),v=new DataView(e.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,dirSize,true);v.setUint32(16,offset,true);
 return new Blob([...parts,...directory,e],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function rowXml(values,i){return '<row r="'+i+'">'+values.map((value,j)=>{
 if(value===null||value===undefined||value==='')return '';
 const r=String.fromCharCode(65+j)+i;
 if(typeof value==='number'&&Number.isFinite(value))return '<c r="'+r+'"'+([8,9].includes(j)?' s="2"':'')+'><v>'+value+'</v></c>';
 return '<c r="'+r+'" t="inlineStr"'+(i===1?' s="1"':'')+'><is><t xml:space="preserve">'+esc(String(value).slice(0,32767))+'</t></is></c>';
 }).join('')+'</row>';}
export function productsXlsx(products){
 if(!Array.isArray(products)||products.length>1048575)throw Error('Excel satır sınırı aşıldı.');
 const widths=[22,24,34,52,55,22,48,14,16,16,16,14,24,26,30,25,22,14];
 const rows=[rowXml(HEADERS,1)];for(let i=0;i<products.length;i++)rows.push(rowXml(productRow(products[i]),i+2));
 const sheet=xmlHead+'<worksheet xmlns="'+ns+'"><dimension ref="A1:R'+(products.length+1)+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>'+rows.join('')+'</sheetData><autoFilter ref="A1:R'+(products.length+1)+'"/></worksheet>';
 return zip([
 ['[Content_Types].xml',xmlHead+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
 ['_rels/.rels',xmlHead+'<Relationships xmlns="'+pkg+'"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
 ['xl/workbook.xml',xmlHead+'<workbook xmlns="'+ns+'" xmlns:r="'+rel+'"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Ürünlerinizi Burada Listeleyin" sheetId="1" r:id="rId1"/></sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels',xmlHead+'<Relationships xmlns="'+pkg+'"><Relationship Id="rId1" Type="'+rel+'/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+rel+'/styles" Target="styles.xml"/></Relationships>'],
 ['xl/styles.xml',xmlHead+'<styleSheet xmlns="'+ns+'"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173C65"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
 ['xl/worksheets/sheet1.xml',sheet]
 ]);
}
async function countCentral(){const r=await fetch('/api/product-state?health=1',{cache:'no-store',credentials:'same-origin'});const d=await r.json();if(!r.ok||!d.ready||!Number.isInteger(d.count)||d.count<1)throw Error('Merkezi kayıt sayısı doğrulanamadı.');return d.count;}
export function setupProductExport({canExport}){
 const button=document.getElementById('exportProducts100'),status=document.getElementById('exportProductsStatus100');
 button.onclick=async()=>{
 if(!canExport()){status.textContent='Ürün yönetim yetkisi ve merkezi bağlantı gerekli.';return;}
 button.disabled=true;
 try{
  status.textContent='Merkezi ürün sayısı kontrol ediliyor…';const before=await countCentral();
  const {products}=await fetchRemoteProducts(({received})=>{status.textContent=received.toLocaleString('tr-TR')+' / '+before.toLocaleString('tr-TR')+' ürün alındı…';});
  const after=await countCentral();if(before!==after||products.length!==after)throw Error('Kayıt sayısı değişti veya eksik veri geldi. Tekrar deneyin.');
  status.textContent='Excel hazırlanıyor…';await new Promise(r=>setTimeout(r,0));
  const blob=productsXlsx(products),date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date()),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='KOLAYKASAM-TUM-URUNLER-'+date+'.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  const inline=products.filter(p=>typeof p.gorsel==='string'&&p.gorsel.startsWith('data:')).length;
  status.textContent=products.length.toLocaleString('tr-TR')+' ürün Excel olarak hazırlandı.'+(inline?' '+inline+' gömülü fotoğraf URL alanına aktarılmadı.':'')+' Hiçbir ürün değiştirilmedi.';
 }catch(e){status.textContent='Excel oluşturulamadı: '+e.message;}finally{button.disabled=false;}
 };
}
