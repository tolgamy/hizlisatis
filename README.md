# Cep Hızlı Satış — Offline-first Mobile POS PWA

Bulut tarafında **Cloudflare Pages Function**, telefonda **IndexedDB + Service Worker** kullanan Türkçe, mobil öncelikli hızlı satış uygulaması.

## 1) Kurulum / geliştirme

Gereksinimler: Node.js 20+, npm ve (prod için) Cloudflare hesabı.

```bash
npm install
npm test
npm run build
npm run dev
```

Tarayıcıdan `http://localhost:8788` açın. Yerel test için **"Yerel XML Yükle"** düğmesinden `fixtures/sample-products.xml` seçebilirsiniz. İlk çalıştırmada `npm run build`, npm'deki barkod yedek kütüphanesini `public/vendor/` altına kopyalar; bu dosya Service Worker tarafından çevrimdışı kullanım için saklanır. `public/vendor/` altındaki kütüphane değiştirilmeden dağıtılır.

## 2) GitHub -> Cloudflare Pages (otomatik main dağıtımı)

1. Bu proje dosyalarını GitHub üzerinde **yeni ve boş bir depoya** koyun. `functions/` dizinini `public/` altına taşımayın.
2. Cloudflare Dashboard → **Workers & Pages** → **Create / Pages** → **Connect to Git** → GitHub hesabınız ve deponuz.
3. Framework preset: **None**. Production branch: **`main`**. Root directory: **`/`** (repo kökü).
4. Build command: **`npm run build`**. Build output directory: **`public`**.
5. Ortamda Node.js **20 veya üzerini** seçin. Pages Functions otomatik olarak kökteki `functions/api/products.js` dosyasını `/api/products` yolu olarak yayınlar.
6. Deploy edin. Ardından `https://PROJENIZ.pages.dev/api/products` yolunu ve PWA sayfasını test edin. GitHub **`main`** dalına her `push` üretim dağıtımını tetikler.

```bash
git init
git add .
git commit -m "Initial mobile POS PWA"
git branch -M main
git remote add origin https://github.com/KULLANICI/DEPO.git
git push -u origin main
```

> `KULLANICI/DEPO` değerini kendi repo URL'nizle değiştirin. Cloudflare Pages Git entegrasyonunu **Git deposu üzerinden** yapın: Function kullanan bu projenin dashboard üzerindeki salt statik Direct Upload yöntemi uygun değildir.

**Hızlı teşhis:** Yayından sonra `https://PROJENIZ.pages.dev/api/products?health=1` adresinde `ok: true` görmelisiniz. Ardından `.../api/products` ile canlı XML isteğini deneyin.

**Başlangıç kontrolleri:** Uygulama ilk açıldığında XML API'den ürün çeker; daha sonraki açılışlarda önce IndexedDB kataloğunu gösterir. İnternet bağlantısını kapatın, uygulamayı yeniden açın, ürün arayıp nakit satış tamamlayın. `Satış Geçmişi` içinden fişi yazdırın.

## 3) Mimari / dosyalar

```text
.
├── functions/api/products.js    # XML fetch + validate + normalize + Cache API
├── public/
│   ├── index.html               # Mobil POS
│   ├── styles.css               # Responsive UI ve 58/80mm fiş
│   ├── app.js                   # Arama, sepet, satış, barkod, fiş
│   ├── idb.js                   # IndexedDB transaction katmanı
│   ├── normalize.js             # Sunucu/istemci ortak veri normalizasyonu
│   ├── xml-local.js             # Yerel XML: browser DOMParser
│   ├── manifest.json            # PWA tanımı
│   ├── sw.js                    # Çevrimdışı uygulama kabuğu
│   ├── _headers                 # Temel güvenlik / önbellek başlıkları
│   ├── icons/                  # PWA ikonları, placeholder
│   └── vendor/                 # Derleme sırasında kopyalanan html5-qrcode
├── scripts/build.mjs
├── fixtures/sample-products.xml
├── tests/normalize.test.js
└── package.json
```

API `GET /api/products` üstünden `products`, `updatedAt`, `variantCount`, `productCount` döndürür. `GET /api/products?refresh=1` 5 dakikalık taze edge cache'i atlayarak XML kaynağını tekrar okur. Normal istekler 300 saniye taze cache; eski edge yedek varsa **beklemeden sunulur** ve arka planda güncellenir. Kaynak hata verirse 7 günlük **best effort** edge yedek cache kullanılır. Header `X-POS-Cache` değeri `HIT`, `MISS`, `REFRESH`, `STALE`, `ERROR`, `HEALTH` olabilir. Cloudflare cache kalıcı veri tabanı değildir, veri merkezi bazlıdır. Gerçek **dayanıklı çevrimdışı yedek** IndexedDB'dir.

XML şeması: `<Urunler><Urun>...<Varyantlar><Varyant>...`. Her varyant satış satırı olur; `Barkod` **string** olarak tutulur (baştaki sıfırlar silinmez). Virgüllü/noktalı fiyatlar normalleştirilir. Açıklamanın orijinali `aciklama`, HTML'siz metni `aciklamaMetin` olarak saklanır. Kategori `kategori`, `kategoriAna`, `kategoriAlt`, `kategoriYolu` alanlarına ayrılır. Ürün görselleri HTTP(S) URL dışında kabul edilmez; bozuk görsellerde yerel placeholder görünür.

### Barkod okuma

- Android/Chrome gibi destekleyen tarayıcılarda `BarcodeDetector`, diğerlerinde **yerel paketlenmiş html5-qrcode** kullanılır; ilave CDN gerektirmez.
- Kamera **HTTPS** veya `localhost` ister; izin verilmelidir. Barkod okununca sepete ekler, varsa ses/titreşim verir.
- Fiziksel USB/Bluetooth barkod okuyucular için arama alanına barkodu okutun ve `Enter` gönderin. Desteklenen symbology, cihaz ve tarayıcıya göre değişir.

### Çevrimdışı satış ve stok

IndexedDB'deki `products`, `sales`, `adjustments`, `meta` store'ları kullanılır. Satış ve **cihaz içi yerel stok düşümü** aynı transaction içinde yazılır. XML'den gelen kaynak stok ile cihazda birikmiş satışlar toplanarak kalan stok gösterilir. Bu uygulama **XML sağlayıcısına geri stok/satış yazmaz** ve diğer cihazlarla merkezi eşitleme yapmaz. Sağlayıcının stoğu zaten düşürdüğü bir akışta çift stok düşümünü önlemek için ayrıca mutabakat / senkronizasyon altyapısı gerekir. Aynı veri tabanının tarayıcı verisi temizlenirse satış kayıtları da silinir; CSV dışa aktarma ve kurumsal yedekleme önemlidir.

- Satışta `SatisFiyati` kullanılır; satır başına **adet, birim fiyat, yüzde iskonto** düzenlenebilir.
- Fiyatlar **KDV dahil** kabul edilir; fişte KDV payı dahil fiyat üzerinden hesaplanır. KDV yorumunu kendi mali süreçlerinize göre doğrulayın.
- Aynı sepette **farklı para birimleri** birleştirilmez.
- Nakit için para üstü, Kart ve Veresiye için ödeme tipi saklanır. Veresiyede müşteri adı zorunlu; **müşteri alacak defteri / tahsilat modülü yoktur**.
- Baskı genişliği checkout panelinden **58mm / 80mm** seçilir; yazdırma tarayıcının `window.print()` arayüzüyle yapılır. Bluetooth ESC/POS protokolüne doğrudan bağlanmaz. Yazıcı sürücüsü / mobil baskı köprüsü gerekebilir.
- **Bu uygulama mali onaylı yazar kasa, e-Fatura/e-Arşiv, ödeme kuruluşu veya resmi fiş altyapısı değildir.** Yazdırılan belge “mali değeri yoktur” ibaresi taşır. Kart seçimi gerçek kart tahsilatı yapmaz.

## 4) Sorun giderme

- **İlk kez çevrimdışı açılıyor:** Service Worker ve ürün kataloğu en az bir başarılı çevrimiçi oturumda önbelleğe alınmalı veya çevrimiçiyken yerel XML yüklenmelidir.
- **`İstek zaman aşımına uğradı` / `/api/products` 504:** İşlem, ilk katalog çekiminde XML sunucusunun **30 saniye** içinde yanıt vermemesi nedeniyle sonlanabilir. Bu sürümde tarayıcı API için **45 saniye** bekler; 504 yanıtında ayrıntılı hata ve `UPSTREAM_TIMEOUT` kodu döner. Yalnızca zaman aşımını uzatmak XML sunucusunun engellemesini/ağ sorununu çözmez.
- **Önce `/api/products?health=1` yolunu açın:** `{"ok":true}` gibi JSON dönüyorsa Function yayında; `/api/products` sorunluysa sorun büyük olasılıkla feed erişiminde veya XML işlemesindedir. `health` testi XML adresini çağırmaz. 404 ya da HTML yanıtında Cloudflare Pages projesinin build/deployment/Functions ayarlarını kontrol edin.
- **`/api/products` 503:** XML kaynağının Cloudflare'den erişilebilir olduğunu, kaynağın beklenen şemayı döndürdüğünü, 30 MB XML sınırını ve Cloudflare Function loglarını kontrol edin. Uzak XML bu geliştirme ortamında doğrulanamadı; gerçek feed ile canlı uçtan uca test gerekir.
- **Katalog boşsa:** `Yerel XML Yükle` seçeneğiyle feed'den indirdiğiniz `.xml` dosyasını seçin; ürünler IndexedDB'de saklanır ve internetsiz satışa devam edebilirsiniz.
- **Önbellek davranışı:** Güncel edge cache yok ama yedek mevcutsa katalog hemen `STALE` durumunda gösterilir, Cloudflare arka planda güncelleme dener. Manuel yenileme (`?refresh=1`) 30 saniyeye kadar kaynağı doğrudan bekler. XML kaynağı cevap vermezse sunucunun veya cihazın daha önce sakladığı katalog korunur.
- **Cache yenilenmiyor:** Manuel yenileme taze cache'i atlar. Kaynak erişilemezse edge yedek (varsa) döner; tarayıcıdaki katalog kaybolmaz.
- **Kamera açılmıyor:** HTTPS, kamera izni ve tarayıcı uyumluluğunu kontrol edin; fiziksel okuyucu veya manuel barkod girişi kullanın.
- **Fiş genişliği:** Yazdırma ekranında kağıt genişliği/ölçek ayarlarını cihazınıza göre eşleyin. Özel 58mm printer'lar için `@page` desteği tarayıcıdan tarayıcıya değişebilir.
- **Tek cihaz:** IndexedDB site/origin bazlı ve cihaz yereldir. Çok kasalı işletmede sunucu tabanlı işlem ve stok senkronizasyonu eklenmelidir.

## 5) Üretim öncesi denetim

Gerçek XML'in en az bir örneğini şemaya göre doğrulayın; binlerce varyantı test edin. Fiyat/KDV iş kurallarını ve para birimini onaylayın. Birden çok cihaz, iade, cari hesap, tam stok mutabakatı, yasal fiş/e-belge, ödeme terminali entegrasyonu ve yetkilendirme gereksinimleri varsa bunlar ayrıca geliştirilmelidir. PWA'ya erişimi yetkisiz kişilere açmamak için Cloudflare Access gibi kimlik doğrulama düşünün; satış kayıtları hassas müşteri bilgisi içerebilir.

## 6) Hızlı yayın yönergesi

GitHub deposu oluşturma, `main` dalına kaynak dosyalarını push etme, Cloudflare Pages Git entegrasyonu ve yayın sonrası sağlık testlerinin adımları için `YAYINA-ALMA.md` dosyasına bakın. GitHub Actions dosyası `.github/workflows/ci.yml` her `main` push'unda test ve derleme kontrolü yapar; **Cloudflare yayını** ise Pages Git entegrasyonu tarafından gerçekleştirilir.

## Excel ile toplu ürün ekleme (v1.2)

1. Ana ekrandan **↓ Excel Şablonu** bağlantısıyla `Hizlisatis_Excel_Urun_Yukleme_Sablonu.xlsx` dosyasını indirin.
2. `Urunler` sekmesinde 5. satırdaki başlıkları değiştirmeden, örnek ürünleri silip kendi ürünlerinizi 6. satırdan itibaren doldurun.
3. **Görsel URL** sütununa XML'deki `<Gorseller><url>` değeri dahil HTTPS/HTTP resim bağlantısını yazabilirsiniz. Boş bırakırsanız aynı barkoda sahip XML ürününün resmi korunur; yeni üründe varsayılan simge çıkar.
4. Uygulamada **↑ Excel Ürün Yükle** → `.xlsx` seç → doğrulama önizlemesi → **Ürünleri Yükle**.

Her satır bir varyanttır. Barkod başındaki sıfırları kaybetmemek için **Barkod sütununu metin biçiminde** kullanın. `Ürün Adı`, `Stok`, `Satış Fiyatı` ve `Ürün Kodu` veya `Barkod` gerekir. Stok sıfır/pozitif tam sayı, fiyatlar sıfır/pozitif, KDV 0–100 olmalıdır. Hatalı satır varsa tüm dosya kaydedilmeden önce düzeltilmelidir; Excel önizlemesi hata satır numaralarını gösterir.

**Veri davranışı ve sınırlamalar:** Excel importu ayrı bir IndexedDB deposuna ekleme/güncelleme olarak yapılır, XML veya satış kayıtlarını silmez. Aynı barkodla içe aktarılan ürün XML kataloğunda da varsa Excel bilgileri önceliklidir; Excel satırında görsel URL boşsa XML'deki görsel korunur. Sonraki XML senkronizasyonu Excel ürünlerini silmez. Bu özellik **yalnızca içe aktarılan cihazdaki tarayıcı profilinde** çalışır; başka cihazlarla merkezi ürün ve stok eşitlemesi sağlamaz. Tarayıcı verileri silinirse Excel ürünleri kaybolabilir. Gerçek resimler internete bağımlıdır, çevrimdışı iken resimler yüklenmeyebilir; ürünler ve satış işlevi çevrimdışı çalışır.

Desteklenen dosya `.xlsx` (12 MB'a kadar). `.xls` desteklenmez; Excel'de XLSX olarak kaydedin. Tarayıcıda XLSX açma işlemi modern `DecompressionStream('deflate-raw')` API'sini gerektirir.


## 1.3 — Resimler ve Excel şablonu

- Excel şablonunun **D sütunu Resim URL**. Eski sürümde en sağdaki **N sütunundaydı**.
- Uygulamadaki **↓ Excel Şablonu** bağlantısı `/urun-yukleme-sablonu.xlsx?v=3` adresinden yeni dosyayı indirir.
- XML'deki `Gorseller > url`, varyant ve ürün görselleri, alternatif resim düğümleri ve `//...` gibi bağlantılar normalize edilir.
- Ürün başlığındaki **resim adresi sayısı** ve erişilemeyen resim sayısı görüntülenir. Resim küçük görseline dokunarak kaynaktaki bağlantıyı açabilirsiniz.
- Eğer ürünlerde 0 resim bağlantısı görünürse XML API yanıtındaki `products[0].gorsel` alanını ve XML'yi kontrol edin. Bağlantı sayısı pozitif ama resim yüklenemiyorsa ilgili resim sunucusunun erişim/hotlink kurallarını kontrol edin.
- Cihazın eski IndexedDB katalogunu yenilemek için **XML'i Şimdi Yenile** kullanılabilir.


## v1.4: 12 sütunlu tedarikçi Excel aktarımı

"bunu uyarla.xlsx" ile uyumlu sütun sırası: `Barkod, SKU, Ürün Başlığı, Alt Başlık, Açıklama, Marka, Kategoriler, Para Birimi, Satış Fiyatı, Stok Adedi, Stok Deposu, Görseller`.

`Excel Ürün Yükle` bu formatı otomatik tanır, barkod eşleşmelerini cihazdaki XML kataloğuna göre hesaplar ve önizlemede raporlar. Barkodu XML'de olan ürünün **stok/fiyat/KDV** değerleri XML'den korunur; Excel'den gelen `Görseller` adresi varsa görsel alanını doldurur. Barkodu XML'de bulunmayan ürün Excel verileriyle eklenir. Bu format KDV taşımadığı için yeni ürünlerin vergisi kullanıcı tarafından doğrulanmalıdır.

**Veri gizliliği:** 2.636 ürünlük kullanıcı dosyası herkese açık GitHub deposuna veya Cloudflare statik dizinine yüklenmez. Kullanıcı dosyayı uygulamadaki yükleme alanına seçerek yerel IndexedDB'ye kaydeder. XML sunucusu 503 veriyorsa otomatik XML karşılaştırması mümkün olmayabilir; yükleme yine yerel çalışır.

**Resimler:** `Görseller` sütunundaki HTTPS URL'leri kaydedilir ancak resim CDN'sinin erişilebilirliği ve hotlink izni garanti edilemez.
