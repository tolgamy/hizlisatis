# Hizlisatis v3.1 — Excel Tabanlı Mobil POS

Küçük telefon ekranı için sade tasarlanmış, çevrimdışı satış yapabilen PWA.

## Özellikler

- Uygulamaya otomatik kurulan **19.096** tekil barkodlu ürün (`public/catalog/`).
- Kaynak: kullanıcının `Kesin EXCEL 19096.xlsx` dosyasındaki **Tum Urunler Yedek** sayfası. Orijinal Excel ve özel işlem dosyaları depoya dahil edilmez.
- 14.525 görsel URL'si; diğer ürünlere kategori/ürün adını çağrıştıran emoji/renkli yer tutucu.
- 16.460 ürün için stok bilgisi belirtilmemiş; bu ürünlerde stok sayısı icat edilmez ve satış sayısı kaydedilir.
- 19.096 ürünün tamamında satış fiyatı var.
- 12 ana ve 86 alt kategoride mobil 3 sütunlu grid. Tam ekran kategori > alt kategori > ürün akışı; adres çubuğundaki `#categories/...` ve `#products/...` yolları üzerinden telefonun geri tuşu çalışır.
- Ana menü: Ana Sayfa, Ürünler, Satış, Ayarlar.
- Ayarlar: Excel içe aktarma, ürün düzenleme, satış geçmişi, CSV aktarımı ve fiş genişliği.
- iPhone/Android barkod okuyucu, desteklenen cihazlarda flaş, ses, fiş yazdırma ve WhatsApp paylaşımı.
- Kamera tarayıcısı yalnızca çizgili ürün barkodlarını okur; QR kodlar desteklenen biçimlerden çıkarılmıştır.
- Görseller ekrana yaklaşınca en fazla 3 paralel istekle indirilir, eşzamansız çözülür. Cloudflare Image Transformations **ayrıca etkinleştirilirse** ürün gridine gerçek 256 px WebP, detayda 800 px resim gönderilir (ücretlendirme ve kota Cloudflare hesabına bağlıdır). Varsayılan olarak bu ücretli olabilecek özellik **kapalıdır**.
- Termal fişte 80 mm (alternatif 58 mm) `@page` kâğıt ölçüsü ve dar sayfa düzeni kullanılır; yazıcı sürücüsünde aynı kâğıt boyutu seçilmelidir.
- IndexedDB: satış kayıtları, stok hareketleri, Excel değişiklikleri cihazda korunur. Otomatik katalog güncellemesi elle düzenlenmiş ürünleri ezmez.

**XML entegrasyonu, Cloudflare `/api/products` fonksiyonu ve XML yükleme kontrolleri bu sürümde yoktur.** Gerekirse gelecekte ayrı bir geliştirme olarak eklenebilir.

## Kurulum

```bash
npm install --no-audit --no-fund
npm test
npm run build
```

Cloudflare Pages (isteğe bağlı): gerçek küçültülmüş WebP resimleri için **Settings → Variables and Secrets** bölümünde `ENABLE_IMAGE_RESIZE=true` tanımlayın. Image Transformations özelliği hesabınızda kullanılabilir olmalı; ücret/kota ayarlarını doğrulamadan etkinleştirmeyin. Olmazsa sistem orijinal görseli arka planda yüklemeye devam eder.

Cloudflare Pages: repo `tolgamy/hizlisatis`, üretim dalı `main`, build komutu `npm run build`, yayın klasörü `public`.

Özel kaynaktan üretim: `python scripts/import-private-excel.py "/private/Kesin EXCEL 19096.xlsx" /private/rows.json` ardından `node scripts/generate-bundled-catalog.mjs /private/rows.json`. Özel Excel veya satır JSON verisi depoya eklenmez.

Geliştirici kataloğu yeniden üretmek isterse `node scripts/generate-bundled-catalog.mjs /private/source-rows.json` ile doğrulanmış 9 sütunlu JSON satır dizisini kaynak gösterebilir. `public/catalog/manifest.json` tüm katalog parçalarını ve sayıları tutar. Excel dosyası depoya yüklenmez.

## Verileri koruma

Uygulama önce yerel IndexedDB'de kayıtlı ürünleri gösterir. Yeni yerleşik katalog geldiğinde eski XML `products` deposundaki kayıtlar temizlenir; aynı barkodun eski stok hareketleri yeni ürün kimliğine aktarılır. Satış geçmişi ve cihazdan yüklenmiş/düzenlenmiş Excel ürünleri silinmez. İnternet bağlantısı yoksa daha önce yüklenmiş katalog ve satışlar kullanılabilir.

## Yazıcı notu

Ağ yazıcısında yazdırma iOS'ta AirPrint veya cihazın sistem yazdırma menüsüne bağlıdır. Web Bluetooth ile doğrudan bağlanma iPhone Safari tarafından desteklenmeyebilir; uyumlu üretici uygulamasından yazdırılmalıdır. WhatsApp paylaşımı cihazın paylaşım ekranını açar.
