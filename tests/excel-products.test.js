import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExcelProducts, mergeCatalog, compareExcelWithXml } from '../public/excel-products.js';
const headers = ['Ürün Kodu','Barkod','Ürün Adı','Marka','Kategori','Açıklama','Beden','Renk','Stok','Satış Fiyatı','Piyasa Fiyatı','KDV (%)','Para Birimi','Görsel URL'];
const row = (sku, barcode, image = 'https://cdn.example.com/urun.jpg') =>
  [sku,barcode,'Örnek çikolata','Marka','Atıştırmalık > Çikolata','Açıklama','80g','',12,59.9,79.9,10,'TRY',image];
test('xlsx template header, barcode leading zeros and image URL normalize properly', () => {
  const result = parseExcelProducts([['Başlık'], headers, row('CK-001','08691234567890')]);
  assert.equal(result.errors.length,0);
  assert.equal(result.products[0].barkod,'08691234567890');
  assert.equal(result.products[0].gorsel,'https://cdn.example.com/urun.jpg');
  assert.equal(result.products[0].stok,12);
  assert.equal(result.products[0].kategoriAna,'Atıştırmalık');
});
test('xlsx import keeps unrelated XML and prioritizes XML image when URL is blank', () => {
  const remote = [{id:'remote-1', barkod:'0001', urunKodu:'S-1', baslik:'XML', stok:9, gorsel:'https://xml.test/image.jpg'},
    {id:'remote-2', barkod:'0002', urunKodu:'S-2', baslik:'Diğer', stok:10, gorsel:'https://xml.test/other.jpg'}];
  const {products:[manual]}=parseExcelProducts([headers,row('S-1','0001','')]);
  const merged=mergeCatalog(remote,[manual]);
  assert.equal(merged.length,2);
  assert.equal(merged[0].id,'remote-1');
  assert.equal(merged[0].gorsel,'https://xml.test/image.jpg');
  assert.equal(merged[0].stok,12);
  assert.equal(merged[1].id,'remote-2');
});
test('new Excel item joins catalog and duplicate barcode is rejected',()=>{
  const parsed=parseExcelProducts([headers,row('CK1','00045'),row('CK2','00045')]);
  assert.equal(parsed.errors.length,1);
  assert.equal(parsed.products.length,1);
  assert.equal(mergeCatalog([],parsed.products).length,1);
});
test('invalid URL, stock and price are reported without importing broken rows', () => {
  const lines=[headers,row('S-1','01','javascript:alert(1)'),
    ['S-2','02','A','B','C','D','','',-1,20,22,10,'TRY',''],
    ['S-3','03','A','B','C','D','','',1,'',22,10,'TRY','']];
  const parsed=parseExcelProducts(lines);
  assert.equal(parsed.products.length,0);
  assert.equal(parsed.errors.length,3);
});

test('visible D-column Resim URL template imports without changing the old template support', () => {
  const visible = ['Ürün Kodu','Barkod','Ürün Adı','Resim URL','Marka','Kategori','Açıklama','Beden','Renk','Stok','Satış Fiyatı','Piyasa Fiyatı','KDV (%)','Para Birimi'];
  const row = ['SKU-77','00112233','Ürün 77','https://cdn.example.com/77.jpg','Marka','Kozmetik > Sabun','','','','11','49,90','','20','TRY'];
  const imported = parseExcelProducts([['Açıklama'],visible,row]);
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.products[0].gorsel, 'https://cdn.example.com/77.jpg');
  assert.equal(imported.products[0].satisFiyati, 49.90);
});

test('supplier 12-column workbook imports without changing its headings', () => {
  const supplierHeaders=['Barkod','SKU','Ürün Başlığı','Alt Başlık','Açıklama','Marka','Kategoriler','Para Birimi','Satış Fiyatı','Stok Adedi','Stok Deposu','Görseller'];
  const supplierRow=['0869000012345','f40c8e78-1111-2222-3333-444444444444','Örnek Latte (330 ml)','', 'Sütlü latte', 'Örnek Marka', 'Süt & Salep', 'TRY', 119.95, 99, 'Şube', 'https://cdn.example.com/latte.jpg'];
  const out=parseExcelProducts([supplierHeaders,supplierRow]);
  assert.equal(out.errors.length,0);
  assert.equal(out.format,'market-12');
  assert.equal(out.missingTax,true);
  assert.equal(out.products[0].barkod,'0869000012345');
  assert.equal(out.products[0].gorsel,'https://cdn.example.com/latte.jpg');
  assert.equal(out.products[0].stokDeposu,'Şube');
});

test('supplier Excel enriches matching XML images but never changes XML prices, stock or VAT',()=>{
  const supplierHeaders=['Barkod','SKU','Ürün Başlığı','Alt Başlık','Açıklama','Marka','Kategoriler','Para Birimi','Satış Fiyatı','Stok Adedi','Stok Deposu','Görseller'];
  const rows=[supplierHeaders,
    ['0869000012345','UUID','Latte','','','M','Süt','TRY',119.95,99,'Şube','https://cdn.example.com/latte.jpg'],
    ['0869000012346','UUID2','Su','','','M','Su','TRY',20,10,'Şube','']];
  const parsed=parseExcelProducts(rows);
  const xml=[{id:'xml-id',barkod:'0869000012345',urunKodu:'XML-1',baslik:'XML LATTE',stok:4,satisFiyati:90,kdv:10,gorsel:'https://xml.example.com/old.jpg'}];
  const compared=compareExcelWithXml(xml,parsed.products);
  assert.equal(compared.matched,1);
  assert.equal(compared.newProducts,1);
  assert.equal(compared.imagesFromExcel,1);
  assert.equal(compared.priceDifferences,1);
  const result=mergeCatalog(xml,parsed.products);
  assert.equal(result.length,2);
  assert.equal(result[0].id,'xml-id');
  assert.equal(result[0].satisFiyati,90);
  assert.equal(result[0].stok,4);
  assert.equal(result[0].kdv,10);
  assert.equal(result[0].gorsel,'https://cdn.example.com/latte.jpg');
  assert.equal(result[1].barkod,'0869000012346');
});

test('empty later Görsel URL column does not erase Resim URL from D column',()=>{
  const hs=['Ürün Kodu','Barkod','Ürün Adı','Resim URL','Stok','Satış Fiyatı','Görsel URL'];
  const parsed=parseExcelProducts([hs,['SKU','0012','Ürün','https://example.com/a.png',5,10,'']]);
  assert.equal(parsed.errors.length,0);
  assert.equal(parsed.products[0].gorsel,'https://example.com/a.png');
});
