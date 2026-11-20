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


## v3.2 — Kategori fotoğrafları

Ana sayfa yalnızca 12 görsel kategori kartı gösterir. Kullanıcının belirlediği sıra korunur. Ana kategori görselleri yerel, yazısız, sıkıştırılmış WebP dosyalarıdır; alt kategoriler bağımsız, ürün fotoğrafı olmayan hafif SVG illüstrasyonlar kullanır. Mobilde her kategoride 3 sütun görünür. Açıkça yinelenen/çok küçük bazı kategori grupları yalnız gezinme görünümünde birleştirilmiştir; 19.096 ürün, barkodlar, stok, satış ve ham kategori alanları silinmez. Satış, QR engelleme, fiş yazdırma ve Excel katalog değişmemiştir.

## v3.3 — Ürün yönetimi ve güvenli pasif arşiv

- Ana ve alt kategori kartlarında görselin altında kategori adı görünür; alt kategoride mevcut ürün fotoğrafları varsa onlar kullanılır, yoksa SVG çizimi korunur.
- Ayarlar → **Yeni Ürün Ekle** veya **Ürün Yönetimi**: barkodla/elle ekle, marka, ana/alt kategori, fiyat, alış fiyatı, stok, birim, görsel URL veya sıkıştırılmış fotoğraf, KDV oranı %0/%1/%10/%20; girilen fiyat varsayılan **KDV dahil**, istenirse “KDV hariç fiyat giriyorum” seçilir.
- Ürünler **Aktif**, **Ana Pasif**, **Aktif Sonrası Pasif**, **Silinen** olarak dört ayrı mantıksal listede tutulur; ürün ve satış kayıtları fiziksel olarak dosyalara bölünmez. Aktif edilen ürünün daha sonra pasife alınması eski ana pasif havuzuna dönmesine yol açmaz.
- **Tüm Aktif Ürünleri Ana Pasife Al** işlemi yalnızca Ayarlar üzerinden, iki ayrı onay sonrasında **bir kere** çalıştırılabilir; otomatik çalışmaz ve satış geçmişini silmez. Önce JSON ürün yedeği indirilmesi önerilir. Hâlihazırda aktifleştirilmiş ürün varsa ilk toplu işlemde ayrıca “Aktif Sonrası Pasif” durumuna geçirilir.
- Barkod okutulduğunda pasif ürün için “Aktifleştir ve Satışa Ekle” veya “Önce Ürünü Düzenle” sorulur. Silinen ürünler doğrudan satılamaz; yönetimden pasife geri yüklenebilir.
- Değişiklikler IndexedDB'de işlem geçmişiyle saklanır. Kurulu katalog güncellendiğinde pasif/silinen durum bilgileri korunur. İçe aktarımla aynı kimliğe gelen ürünün eski durumu da korunur.
- **Önemli:** Yerel IndexedDB verileri cihaz/tarayıcı bazındadır; cihazlar arası otomatik senkronizasyon veya sunucuya yedekleme bu sürümde yoktur. Tek cihazdaki 19 bin ürünün pasif durumunu başka cihazın otomatik görmesi beklenmemelidir. Toplu pasife alma öncesinde JSON yedeği indirin.
- Görseller yerel fotoğraf olarak yüklendiyse en fazla 512 piksele küçültülüp cihaz veritabanına kaydedilir; aynı görsel başka cihazda otomatik belirmez.


## Termal fiş yazdırma (v3.3.1)
Ağ/AirPrint için fiş 80 mm (tercihe göre 58 mm) genişlikte ayrı bir önizleme sekmesinde açılır. Fişi Yazdır düğmesi sistem yazdırma ekranını çağırır. Yazdırma sayfa yüksekliği fişin gerçek boyuna göre ölçülür. AirPrint ve yazıcı sürücüsündeki kağıt boyutu ayrıca 80/58 mm olarak seçilmelidir; tarayıcı yazıcının A4 seçimini zorla değiştiremez. Bluetooth ESC/POS ve WhatsApp paylaşımı korunur.

## v3.3.2 — Kalıcı pasif ürünler ve barkod kamerası
- Ürün yaşam döngüsü durumları katalogdan bağımsız `productLifecycle` IndexedDB deposuna da atomik kaydedilir. Eski durumlar veritabanı yükseltmesi sırasında taşınır ve Excel içe aktarımında korunur.
- Barkod kamerası html5-qrcode kütüphanesinin farklı global adlarını destekler. Kamera seçimi başarısız olursa arka kameranın aygıt kimliğiyle yeniden denenir. QR kodu okuma desteklenen biçimler arasına eklenmez.
- Çevrimdışı PWA kabuğunun sürümü yenilendi. Cihaz verileri yalnızca aynı tarayıcı/profilde korunur; gizli modda veya farklı cihazda otomatik senkronize olmaz.

## v3.3.3 — Pasif durum yedekleme ve kayıt doğrulama
- Kaydedilen ürün durumu veritabanından tekrar okunarak doğrulanır, kayıt hatası başarı olarak bildirilmez.
- İlk toplu pasife alma sonrası durumlar ikinci bir tarayıcı yerel yedeğine alınır; tek ürünün sonraki değişiklikleri bu büyük yedekten bağımsız saklanır.
- Sayfa açılışında bu yedekteki yeni durumlar, veritabanındaki eski ürün durumlarını düzeltebilir. Bu, cihazdan cihaza senkronizasyon değildir ve tarayıcı verileri temizlenirse yedek kaybolabilir.
- PWA önbellek sürümü yenilendi. Önceki tek sürüme bağlı Pages preview adresleri otomatik yeni dağıtıma geçmeyebilir; ana alan adı kullanılmalıdır.


## v3.3.4 — Pasif işlem şifresi, çizgili barkod ve PDF paylaşımı

- Ana pasife alma, tek ürün pasife alma, aktivasyon (barkodla satış sırasında dahil) ve pasiften geri yükleme işlemleri için **1453** işlem PIN'i sorulur. Bu PIN cihaz üzerinde uygulanan basit bir onaydır; sunucu tarafında kimlik doğrulaması değildir.
- **EAN-13, EAN-8, UPC ve Code 128** gibi çizgili ürün barkodları için tarayıcı biçim numaraları düzeltildi. **QR kod okumak hâlâ kapalıdır.** Kamera erişimi HTTPS, tarayıcı izinleri ve cihaza bağlıdır.
- Satış tamamlandı ekranında WhatsApp metin paylaşımına ek olarak **PDF Yap ve Paylaş** seçeneği vardır. Çevrimdışı PDF oluşturur. Cihaz dosya paylaşımını destekliyorsa gerçek .pdf dosyasını WhatsApp'a veya diğer uygulamalara paylaşır; desteklemiyorsa PDF indirilir.
- Ürün durumları yerel IndexedDB ve ilave yerel yedek içinde korunur; katalog güncellenince sıfırlanmamalıdır. Otomatik test, aynı cihazın IndexedDB'si yeniden açıldığında ve katalog güncellendiğinde durumu denetler.
- **Not:** Farklı cihazlar/tarayıcılar arasında ürün durumları otomatik eşitlenmez. Tarayıcı verisi silinirse kayıtlar kaybolabilir; düzenli JSON yedeği alın.

## v3.4 — Merkezi ürün veritabanı (Cloudflare D1)

Bu sürümde **ürün yönetimi, fiyat/KDV/kategori/görsel düzenlemeleri, aktif/pasif/silinen durumları ve toplu pasife alma** Cloudflare D1'e yazılır. Tarayıcıdaki IndexedDB **yalnız katalog/cihaz satışları için önbellek ve eski kayıtların taşınması** amacıyla kullanılır. `localStorage`'a artık **ürün durumu yazılmaz**. Merkezi API kullanılamıyorsa ürün düzenleme başarısız olur; yerel kayıt başarı gibi gösterilmez.

**Önemli sınır:** Önceden yayınlanan 19.096 ürünün salt-okunur başlangıç kataloğu halen `public/catalog/` altında statik dosyalardan kurulur. **Bu ürünlerdeki her düzenleme D1'e kaydolur**; sıfırdan eklenen yeni ürünler de D1'dedir. Satış fişleri, satış geçmişi ve cihaz stok düşümleri bu sürümde hâlâ IndexedDB'dedir; henüz merkezi satış/stok senkronizasyonu yoktur. Merkezi ürün durumu için uygulama çevrimiçi olmalıdır.

### Canlıya alma — D1 olmadan yayımlamayın

1. Cloudflare Dashboard → **D1** → yeni veritabanı oluşturun (örneğin `hizlisatis-products`).
2. D1 SQL Editor üzerinde `migrations/0001_product_state.sql` dosyasının içeriğini **production veritabanına** uygulayın. Şema kurulmadan API çalışmaz.
3. Workers & Pages → **hizlisatis** → Settings → **Bindings** → D1 binding ekleyin. Değişkenin adı tam olarak **`DB`** olmalı; oluşturulan veritabanını seçin. Preview ortamında ayrı D1 veritabanı tercih edin.
4. Settings → Variables and Secrets → secret olarak **`PRODUCT_WRITE_KEY`** tanımlayın. En az 24 karakter, güçlü ve rastgele bir değer seçin; `1453` bu sunucu anahtarı **olamaz**. İstemci koduna veya GitHub'a koymayın. İşlem PIN'i `1453` uygulamadaki ek onaydır; tek başına sunucu güvenliği sağlamaz.
5. Bu dalı üretime almadan önce veritabanı bağlantısını ve SQL tablolarını doğrulayın. Deploy'dan sonra `/api/product-state` adresi geçerli JSON (`products`, `bulkAt`, `next`) vermeli; HTTP 503 verirse **prod'a geçmeyin**. Sunucu yönetim anahtarı, ilk yazmada sorulur ve yalnız sekme belleğinde tutulur.
6. Daha önce bu cihazda pasife aldığınız veya düzenlediğiniz ürünleri kaybetmemek için önce **Ayarlar → Ürün Yönetimi → Ürün Yedeğini İndir**, ardından **Eski Cihaz Kayıtlarını Veritabanına Taşı** düğmesini kullanın. Taşıma boş veritabanına göre tasarlanmıştır; mevcut merkezi kayıtların üzerine otomatik yazmaz. Eski `localStorage` kayıtlarını taşıma tamamlanmadan silmeyin.
7. İki farklı cihazda aynı barkodun aktif/pasif durumunu ve fiyatını doğrulayın. Toplu pasife almayı **bir kere** çalıştırın; diğer cihazı yenileyin. Kamera, paylaşım ve PDF ayrıca gerçek cihazda doğrulanmalıdır.

D1 schema kodu: `migrations/0001_product_state.sql`. API: `functions/api/product-state.js`. İstemci: `public/remote-products.js`.

