import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExcelProducts, excelProductId } from '../public/excel-products.js';
const head=['Barkod','SKU','Ürün Başlığı','Alt Başlık','Açıklama','Marka','Kategoriler','Para Birimi','Satış Fiyatı','Stok Adedi','Stok Deposu','Görseller'];
const row=['8690000000012','SKU-1','Dondurma Külah','', 'Lezzetli','Marka','Dondurma','TRY','89.95','','',''];
test('supplier workbook missing stock is imported as stock-untracked',()=>{
 const data=parseExcelProducts([head,row]);assert.equal(data.errors.length,0);
 assert.equal(data.products[0].stokBelirsiz,true);assert.equal(data.products[0].fiyatBelirsiz,false);
 assert.deepEqual(data.products[0].kategoriYolu,['Dondurma','Külah']);
 assert.equal(excelProductId(data.products[0]),'excel::b:8690000000012');
});
test('same barcode is rejected in spreadsheet, not silently duplicated',()=>{
 const data=parseExcelProducts([head,row,row]);assert.equal(data.products.length,1);
 assert.match(data.errors[0],/Tekrarlanan barkod/);
});
test('bad prices/images are reported',()=>{
 const invalid=[...row];invalid[8]='';invalid[11]='javascript:alert(1)';
 const data=parseExcelProducts([head,invalid]);assert.equal(data.products.length,0);assert.equal(data.errors.length,1);
});
test('manual Excel rows accept explicit zero stock without marking it unknown',()=>{
 const sample=[...row];sample[9]='0';
 const data=parseExcelProducts([head,sample]);assert.equal(data.products[0].stok,0);
 assert.equal(data.products[0].stokBelirsiz,false);
});
