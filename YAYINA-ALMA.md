# Hizlisatis v3.0 — Yayına alma

1. `npm install --no-audit --no-fund && npm test && npm run build`.
2. GitHub repo `tolgamy/hizlisatis` main dalına gönderin.
3. Cloudflare Pages build: `npm run build`, output: `public`, branch: `main`.
4. Canlıda `https://hizlisatis.pages.dev/catalog/manifest.json` altında `count: 19099`, `withImages: 14528` doğrulayın.
5. `https://hizlisatis.pages.dev/?v=300` mobil Safari/Chrome ile açın. Ekranda `Mobil POS · v3.0` olmalı.
6. Ana sayfa → Dondurma → alt kategori → ürün; geri hareketi ile iki kademe geri dönün.
7. Ayarlar'da Excel yükleme, ürün düzenleme, satış geçmişini kontrol edin.
8. Mevcut satış kayıtlarının ve stok hareketlerinin silinmediğini doğrulayın; barkodla ürün ekleyip `+` ile adedi artırın.
9. Yazıcı, kamera flaşı ve WhatsApp cihaz özellikleriyle gerçek telefonda test edilmelidir.

**Not:** GitHub Actions'ın başarılı olması Cloudflare'ın canlı deploy yaptığı anlamına gelmez. Gerekirse Pages'in Git bağlantısı ve Deployments bölümünü kontrol edin.

## v3.1 — Son Excel kataloğu

- **Kesin EXCEL 19096.xlsx** kaynak alındı, 19.096 benzersiz barkod, 12 ana / 86 alt kategori.
- Mobil kategori görselleri 3 sütun, QR tarama kapalı, sepette marka korunur.
- 80/58-mm termal fiş ölçüsü hem sayfa hem içerik CSS ile belirtilir. Sürücü/telefon yazdırma menüsünde aynı kâğıt tipini seçmek hâlâ zorunlu olabilir.
- Görseller görünürlük esaslı, en çok 3 paralel indirme ile yüklenir.
- Gerçek düşük çözünürlüklü WebP dönüşümü opsiyoneldir. `ENABLE_IMAGE_RESIZE=true` yalnızca Cloudflare Image Transformations özelliği/kota/ücret koşullarını kontrol edip onayladıktan sonra etkinleştirilmelidir.

XML yeniden eklenmedi.

## v56 — Güvenli Admin / Kasiyer Girişi (CANLIYA ALMADAN ÖNCE OKUYUN)

**Güvenli aşamalı dağıtım:** Kodun GitHub `main` dalına alınması
`AUTH_V2_ENABLED` değerini **kendiliğinden açmaz**. Değer henüz tanımlı değilse
eski site işleyişi ve ürün aktarımında eski anahtar uygulaması devam eder;
kullanıcılara bir **"Güvenli giriş henüz etkin değil"** uyarısı gösterilir.
Bu, korumanın açıldığı anlamına **gelmez**. Önce yeni kodun Pages üzerinde
derlendiğini ve `/api/auth` uç noktasının `{"enabled":false}` yanıtladığını
doğrulayın; sonra Production parolası/sunucu sırlarını tanımlayıp
`AUTH_V2_ENABLED=true` etkinleştirin. Yeni bayrak açılınca tüm kullanıcıların
oturum doğrulaması zorunlu hale gelir; eksik yapılandırma halinde erişim
güvenlik nedeniyle **kapalı** kalır.

Bu sürüm kullanıcı adı/parola ile giriş, D1 kullanıcı tablosu ve ayrı kullanıcı yetkileri ekler.
**Güvenli mod Cloudflare'da etkinleştirilmeden URL'yi bilen kullanıcılar için erişim hâlâ açıktır.**
Sadece GitHub kodunu güncellemek güvenlik kurulumunu tamamlamaz.

### Cloudflare Pages → Settings → Variables and Secrets (Production)

- **DB:** Var olan Cloudflare D1 veritabanı bağlantısı (değiştirmeyin).
- **PRODUCT_WRITE_KEY:** Mevcut, en az 24 karakterlik *sunucu sırrı* kalır. Artık çalışanların bunu
  girmesi gerekmez. Oturum imzaları bu sırra bağlı olduğundan rastgele değiştirmeyin.
- **ADMIN_INITIAL_PASSWORD:** Yeni, güçlü ve size özel başlangıç yönetici parolası;
  en az 12 karakter. Bunu Cloudflare *Secret* olarak kaydedin. Bu sohbete, GitHub'a veya
  ürün dosyalarına yazmayın. İlk admin oluşturulduğunda parola PBKDF2 ile D1'de
  tuzlanmış biçimde saklanır. İleride bu secret'ı koruyun.
- **ADMIN_INITIAL_USER:** Opsiyonel. Varsayılan değer `admin`.
- **AUTH_V2_ENABLED:** Tüm şartlar hazırlandığında `true`. Bu değer `true`
  değilse eski mod çalışır; site güvende *sayılmaz*.

**Sıralama:** İlk üç Production sırrı/binding'in hazır olduğundan emin olun,
`AUTH_V2_ENABLED=true` ayarlayın, Production'a yeniden dağıtın.
Başka cihazdan sitedeki giriş ekranını test edin.
Başlangıçta `admin` ve `ADMIN_INITIAL_PASSWORD` ile giriş yapın. Yönetim
panelinde kasiyer hesaplarını oluşturup gerekli yetkileri verin.
Çalışanlar 24 karakterlik ortak anahtarı bir daha görmemelidir.

### Yeni haklar

- **Admin:** Kullanıcı ve yetki yönetimi dâhil tam erişim.
- **Kasiyer:** `sales`, `products`, `customers`, `reports`, `discounts`
  hakları ayrı ayrı verilebilir. Her hesap kendi kullanıcı adı/parolasıyla giriş yapar.
- Ürün değişiklikleri, müşteri/veresiye işlemleri ve kategori görseli değişiklikleri
  Cloudflare'da kullanıcı yetkisiyle kontrol edilir. Eski yönetim anahtarının
  HTTP başlığından veya eski admin oturumundan giriş yeni modda reddedilir.
- Satış tamamlanmadan önce sunucu oturumu, satış/iskonto/veresiye hakkını
  doğrular. **İnternet yokken yeni satış kaydı engellenir**. Çevrimdışı satış
  için ayrı güvenli cihaz oturumu tasarımı gereklidir.
- Mevcut satış geçmişi ve stok hareketleri cihaz IndexedDB'sinde kalır.
  Bu güncelleme satışları otomatik olarak D1'e taşımaz ve diğer cihazların
  satışlarını Admin Paneli'nde toplu raporlamaz.
- Kullanıcı devre dışı bırakma/parola değiştirme oturum sürümünü artırarak
  o hesabın mevcut oturumlarını hemen geçersiz kılar.

### Üretim öncesi testler

1. `npm test && npm run build` başarılı olmalı.
2. Admin oturumuyla ürün yükleme ve kategori görseli güncelleme test edilmeli.
3. Yalnız `sales` hakkına sahip kasiyerin satış yapabildiği,
   ürün ve veresiye değiştiremediği, indirim yapamadığı doğrulanmalı.
4. Giriş yapmadan satış oluşturma, sahte/eskimiş oturum, yetkisi alınan kullanıcı
   ve eski `X-Product-Key` denemeleri sunucu tarafından reddedilmeli.
5. İki ekranın 12 kategorisi: telefonda **3×4**, tablet ve PC'de **4×3**
   büyük fotoğraf kartları ile kontrol edilmeli.
6. Canlıda CAS ER PLUS-2 terazi, fiş, ödeme, müşteri defteri ve eski cihaz
   satış kayıtları korunmalı.

**Not:** Cloudflare Production secret'ları GitHub PR tarafından güncellenmez.
Bu hazırlık yapılmadan yalnız bu değişikliğe güvenerek canlıya çıkmayın.
