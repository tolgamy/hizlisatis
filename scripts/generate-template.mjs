import { deflateRawSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Build a small, standard OOXML XLSX template with no runtime dependency. */
const cols = ['Ürün Kodu','Barkod','Ürün Adı','Resim URL','Marka','Kategori','Açıklama','Beden','Renk','Stok','Satış Fiyatı','Piyasa Fiyatı','KDV (%)','Para Birimi'];
const demo = [
 ['CK-001','08691234567890','Fındıklı Sütlü Çikolata 80g','','Örnek Gıda','Atıştırmalık > Çikolata','Örnek ürün','80g','',24,59.90,79.90,10,'TRY'],
 ['SU-200','08690000000001','Su 500 ml','','Örnek İçecek','İçecek > Su','Örnek ürün','500ml','',100,12.50,15,1,'TRY']
];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);
function col(n) { let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s; }
function rowXml(values, number, style=0) {
  return `<row r="${number}">${values.map((v,i)=>{
    const ref=col(i)+number;
    if(typeof v==='number')return `<c r="${ref}" s="${style===2?2:0}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`;
}
const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const sheet1=`${header}<worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${[18,22,34,48,20,33,34,14,14,12,18,18,14,17].map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>
${rowXml(['HIZLISATIS — TOPLU ÜRÜN YÜKLEME'],1,3)}
${rowXml(['Şablondaki örnek satırları silin; barkodları metin tutun. Her satır bir varyanttır.'],3,0)}
${rowXml(cols,5,1)}${demo.map((r,i)=>rowXml(r,6+i,2)).join('')}</sheetData></worksheet>`;
const tips=[
'1. Urunler sayfasındaki 5. satır başlıklarını değiştirmeyin.',
'2. Örnek satırları silip 6. satırdan başlayarak ürünleri girin.',
'3. Zorunlu alanlar: Ürün Adı, Stok, Satış Fiyatı, Ürün Kodu veya Barkod.',
'4. Barkod başındaki sıfırları koruyun. Hücre biçimi Metin olmalıdır.',
'5. Resim URL (D sütunu): XML <Gorseller><url> içindeki http(s) resim adresi.',
'6. Aynı barkod içe aktarılırsa ürün güncellenir; diğer XML ürünleri silinmez.',
'7. İçe aktarma yalnızca bu cihazın yerel veritabanında saklanır.'
];
const sheet2=`${header}<worksheet xmlns="${NS}"><cols><col min="1" max="1" width="110" customWidth="1"/></cols><sheetData>
${rowXml(['KULLANIM BİLGİLERİ'],1,3)}${tips.map((x,i)=>rowXml([x],i+3,0)).join('')}</sheetData></worksheet>`;
const workbook=`${header}<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Urunler" sheetId="1" r:id="rId1"/><sheet name="Kullanim" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const rels=`${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
const rootRels=`${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const types=`${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const styles=`${header}<styleSheet xmlns="${NS}"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0969DA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF12263D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFill="1" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>`;
const files = [
 ['[Content_Types].xml',types],['_rels/.rels',rootRels],['xl/workbook.xml',workbook],
 ['xl/_rels/workbook.xml.rels',rels],['xl/styles.xml',styles],
 ['xl/worksheets/sheet1.xml',sheet1],['xl/worksheets/sheet2.xml',sheet2]
];
const crcTable = Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xEDB88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let n=0xFFFFFFFF;for(const byte of bytes)n=crcTable[(n^byte)&255]^(n>>>8);return(n^0xFFFFFFFF)>>>0;}
function zip(entries) {
  const local=[],central=[];let offset=0;
  for(const [name,content] of entries){
    const filename=Buffer.from(name),raw=Buffer.from(content,'utf-8'),compressed=deflateRawSync(raw),crc=crc32(raw);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(compressed.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(filename.length,26);
    local.push(h,filename,compressed);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);
    central.push(c,filename);offset+=h.length+filename.length+compressed.length;
  }
  const data=Buffer.concat(local),index=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(data.length,16);
  return Buffer.concat([data,index,end]);
}
export async function generateTemplate() {
  await writeFile(resolve('public/urun-yukleme-sablonu.xlsx'),zip(files));
  console.log('Generated built-in Excel template.');
}
