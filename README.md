# Hizlisatis v3.0 — Excel Tabanlı Mobil POS

Küçük telefon ekranı için sade tasarlanmış, çevrimdışı satış yapabilen PWA.

## Özellikler

- Uygulamaya otomatik kurulan **19.099** tekil barkodlu ürün (`public/catalog/`).
- Kaynak: kullanıcının `16460.xlsx` dosyasındaki **Tum Urunler** sayfası. Orijinal Excel ve özel işlem dosyaları depoya dahil edilmez.
- 14.528 görsel URL'si; diğer ürünlere kategori/ürün adını çağrıştıran emoji/renkli yer tutucu.
- 16.463 ürün için stok bilgisi belirtilmemiş; bu ürünlerde stok sayısı icat edilmez ve satış sayısı kaydedilir.
- 3 üründe fiyat yok; fiyat girilmeden satışa izin verilmez.
- Tam ekran kategori > alt kategori > ürün akışı; adres çubuğundaki `#categories/...` ve `#products/...` yolları üzerinden telefonun geri tuşu çalışır.
- Ana menü: Ana Sayfa, Ürünler, Satış, Ayarlar.
- Ayarlar: Excel içe aktarma, ürün düzenleme, satış geçmişi, CSV aktarımı ve fiş genişliği.
- iPhone/Android barkod okuyucu, desteklenen cihazlarda flaş, ses, fiş yazdırma ve WhatsApp paylaşımı.
- IndexedDB: satış kayıtları, stok hareketleri, Excel değişiklikleri cihazda korunur. Otomatik katalog güncellemesi elle düzenlenmiş ürünleri ezmez.

**XML entegrasyonu, Cloudflare `/api/products` fonksiyonu ve XML yükleme kontrolleri bu sürümde yoktur.** Gerekirse gelecekte ayrı bir geliştirme olarak eklenebilir.

## Kurulum

```bash
npm install --no-audit --no-fund
npm test
npm run build
```

Cloudflare Pages: repo `tolgamy/hizlisatis`, üretim dalı `main`, build komutu `npm run build`, yayın klasörü `public`.

Geliştirici kataloğu yeniden üretmek isterse `node scripts/generate-bundled-catalog.mjs /private/source-rows.json` ile doğrulanmış 9 sütunlu JSON satır dizisini kaynak gösterebilir. `public/catalog/manifest.json` tüm katalog parçalarını ve sayıları tutar. Excel dosyası depoya yüklenmez.

## Verileri koruma

Uygulama önce yerel IndexedDB'de kayıtlı ürünleri gösterir. Yeni yerleşik katalog geldiğinde eski XML `products` deposundaki kayıtlar temizlenir; aynı barkodun eski stok hareketleri yeni ürün kimliğine aktarılır. Satış geçmişi ve cihazdan yüklenmiş/düzenlenmiş Excel ürünleri silinmez. İnternet bağlantısı yoksa daha önce yüklenmiş katalog ve satışlar kullanılabilir.

## Yazıcı notu

Ağ yazıcısında yazdırma iOS'ta AirPrint veya cihazın sistem yazdırma menüsüne bağlıdır. Web Bluetooth ile doğrudan bağlanma iPhone Safari tarafından desteklenmeyebilir; uyumlu üretici uygulamasından yazdırılmalıdır. WhatsApp paylaşımı cihazın paylaşım ekranını açar.
