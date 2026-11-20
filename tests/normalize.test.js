import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCatalog, parseLocaleNumber, plainDescription, safeImageUrl } from '../public/normalize.js';

test('TR and EN prices, currencies and grouping', () => {
  assert.equal(parseLocaleNumber('1.234,56 ₺'), 1234.56);
  assert.equal(parseLocaleNumber('1,234.56 TRY'), 1234.56);
  assert.equal(parseLocaleNumber('79,90 TL'), 79.9);
  assert.equal(parseLocaleNumber('1.234'), 1234);
  assert.equal(parseLocaleNumber('0'), 0);
  assert.equal(parseLocaleNumber('unknown', NaN).toString(), 'NaN');
});
test('description is plain text and images are safe', () => {
  assert.equal(plainDescription('<p>Merhaba &amp; <b>dünya</b></p><script>alert(1)</script>'), 'Merhaba & dünya');
  assert.equal(safeImageUrl('javascript:alert(1)'), '');
  assert.equal(safeImageUrl('https://example.com/a.png'), 'https://example.com/a.png');
});
test('product with 2 variants becomes 2 sellable unique entries', () => {
  const tree = { Urunler: { Urun: { UrunKodu: 'SKU42', Baslik: 'Deneme',
    Kategori: 'A > B', Aciklama: '<p>Test</p>', Marka: 'X',
    Varyantlar: { Varyant: [
      { Barkod: '00123', Stok: '5', SatisFiyati: '10,25', KDV: '20', ParaBirimi: 'TRY' },
      { Barkod: '00124', Stok: '3', SatisFiyati: '20.50', KDV: '20', ParaBirimi: 'TRY' }
    ] } } } };
  const out = normalizeCatalog(tree);
  assert.equal(out.variantCount, 2);
  assert.equal(out.products[0].barkod, '00123');
  assert.equal(out.products[0].kategoriAna, 'A');
  assert.equal(out.products[0].kategoriAlt, 'B');
  assert.equal(out.products[0].satisFiyati, 10.25);
  assert.notEqual(out.products[0].id, out.products[1].id);
});
test('invalid root or products cause an explicit failure', () => {
  assert.throws(() => normalizeCatalog({ Urunler: {} }), /Urun/);
  assert.throws(() => normalizeCatalog({ Urunler: { Urun: { Baslik: 'empty' } } }), /satılabilir/);
});
test('stable IDs for barcoded variants when XML row order changes', () => {
  const product = { UrunKodu: 'S-99', Baslik: 'Stok', Varyantlar: {
    Varyant: [ { Barkod: '0001', Stok: '2', SatisFiyati: '3' },
      { Barkod: '0002', Stok: '8', SatisFiyati: '4' } ] } };
  const a = normalizeCatalog({ Urunler: { Urun: product } });
  product.Varyantlar.Varyant.reverse();
  const b = normalizeCatalog({ Urunler: { Urun: product } });
  assert.deepEqual(a.products.map(p => p.id).sort(), b.products.map(p => p.id).sort());
});


test('nested XML image URLs are normalized for each variant', () => {
  const src={Urunler:{Urun:{UrunKodu:'IMG-1',Baslik:'Fotoğraflı',
    Gorseller:{url:['https://cdn.example.com/main.jpg']},
    Varyantlar:{Varyant:[
      {Barkod:'001',Stok:3,SatisFiyati:20,Gorseller:{url:'//cdn.example.com/variant.jpg'}},
      {Barkod:'002',Stok:3,SatisFiyati:20},
      {Barkod:'003',Stok:3,SatisFiyati:20,Gorseller:{Gorsel:{Url:{'#text':'/images/third.jpg'}}}}
    ]}}}};
  const data=normalizeCatalog(src);
  assert.equal(data.products[0].gorsel,'https://cdn.example.com/variant.jpg');
  assert.equal(data.products[1].gorsel,'https://cdn.example.com/main.jpg');
  assert.equal(data.products[2].gorsel,'https://cdn.labs-connect.com/images/third.jpg');
});
