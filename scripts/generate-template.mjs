import { zipSync, strToU8 } from 'fflate';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function generateTemplate() {
  const headers = ['Ürün Kodu','Barkod','Ürün Adı','Resim URL','Marka','Kategori','Açıklama','Beden','Renk','Stok','Satış Fiyatı','Piyasa Fiyatı','KDV (%)','Para Birimi','Görsel URL'];
  const examples = [
    ['CK-001','08691234567890','Fındıklı Sütlü Çikolata 80g','','Örnek Gıda','Atıştırmalık > Çikolata','Örnek ürün','80g','',24,59.9,79.9,10,'TRY'],
    ['SU-200','08690000000001','Su 500 ml','','Örnek İçecek','İçecek > Su','Örnek ürün','500ml','',100,12.5,15,1,'TRY']
  ];
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const escapeXml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);
  const columnName = index => { let value = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) value = String.fromCharCode(65 + (n - 1) % 26) + value; return value; };
  const row = (values, number, style = 0) => '<row r="' + number + '">' + values.map((v, i) => {
    const ref = columnName(i) + number;
    if (typeof v === 'number') return '<c r="' + ref + '" s="2"><v>' + v + '</v></c>';
    return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t>' + escapeXml(v) + '</t></is></c>';
  }).join('') + '</row>';
  const widths = [18,22,34,50,20,33,34,14,14,12,18,18,14,17];
  const cols = widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('');
  const products = xml + '<worksheet xmlns="' + ns + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + cols + '</cols><sheetData>'
    + row(['HIZLISATIS — TOPLU ÜRÜN YÜKLEME'],1,3)
    + row(['Başlıkları değiştirmeyin. Örnek satırları silin; barkod sütununu metin tutun.'],3)
    + row(headers,5,1)
    + examples.map((x,i)=>row(x,6+i)).join('')
    + '</sheetData></worksheet>';
  const help = [
    'Urunler sayfasındaki 5. satır başlıklarını değiştirmeyin.',
    'Örnek satırları silip 6. satırdan itibaren ürünleri girin.',
    'Zorunlu: Ürün Adı, Stok, Satış Fiyatı ve Ürün Kodu veya Barkod.',
    'Barkod başındaki sıfırları koruyun; Barkod hücre biçimi Metin olmalıdır.',
    'Resim URL (D sütunu): XML içindeki Gorseller / url adresi (http veya https).',
    'Aynı barkodla yüklenen ürün güncellenir, diğer XML ürünleri silinmez.',
    'Excel yüklemesi bu cihazın yerel veritabanına kaydedilir.'
  ];
  const guide = xml + '<worksheet xmlns="' + ns + '"><cols><col min="1" max="1" width="95" customWidth="1"/></cols><sheetData>'
    + row(['KULLANIM BİLGİLERİ'],1,3) + help.map((x,i)=>row([`${i+1}. ${x}`],i+3)).join('') + '</sheetData></worksheet>';
  const workbook = xml + '<workbook xmlns="' + ns + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Urunler" sheetId="1" r:id="rId1"/><sheet name="Kullanim" sheetId="2" r:id="rId2"/></sheets></workbook>';
  const relationships = xml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const rootRelationships = xml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const types = xml + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  const styles = xml + '<styleSheet xmlns="' + ns + '"><fonts count="3">'
    + '<font><sz val="11"/><name val="Calibri"/></font>'
    + '<font><b/><color rgb="FFFFFFFF"/><sz val="11"/></font>'
    + '<font><b/><color rgb="FFFFFFFF"/><sz val="16"/></font></fonts>'
    + '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF0969DA"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF12263D"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFill="1" applyFont="1"/>'
    + '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>';
  const parts = {
    '[Content_Types].xml': types,
    '_rels/.rels': rootRelationships,
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': relationships,
    'xl/worksheets/sheet1.xml': products,
    'xl/worksheets/sheet2.xml': guide,
    'xl/styles.xml': styles
  };
  const archive = zipSync(Object.fromEntries(Object.entries(parts).map(([name,content]) => [name, strToU8(content)])), { level: 6 });
  await writeFile(resolve('public/urun-yukleme-sablonu.xlsx'), Buffer.from(archive));
  console.log('Generated Excel template.');
}
