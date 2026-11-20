import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExcelProducts, mergeCatalog } from '../public/excel-products.js';
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


test('Excel Resim URL column D imports while older template format stays supported', () => {
  const headers=['Ürün Kodu','Barkod','Ürün Adı','Resim URL','Marka','Kategori','Açıklama',
    'Beden','Renk','Stok','Satış Fiyatı','Piyasa Fiyatı','KDV (%)','Para Birimi'];
  const row=['SKU-77','00112233','Ürün 77','https://cdn.example.com/77.jpg','Marka',
    'Gıda > Çikolata','','','','11','49,90','','20','TRY'];
  const result=parseExcelProducts([['Yönerge'],headers,row]);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.products[0].gorsel,'https://cdn.example.com/77.jpg');
});
