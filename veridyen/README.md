# HızlıSatış – Veridyen Node.js + MariaDB hazırlık dalı

**DURUM: STAGING / CANLIYA ALINMAMIŞTIR.** Bu dal, mevcut Cloudflare Pages/D1 üretim ortamına dokunmadan Node.js geçişini hazırlamak için oluşturulmuştur. Tam kabul testi ve gerçek SQL örneğiyle test yapılmadan satışta kullanılmamalıdır.

## Kurulan parçalar
- Kök dizinde `server.js`: cPanel/Passenger HTTP sunucusu. `/api/*` isteklerini mevcut Cloudflare Functions işleyicilerine yönlendirir, `public/` statik dosyalarını sunar.
- `veridyen/mysql-d1-adapter.js`: Sadece projedeki bilinen D1 sorgularını MariaDB'ye çevirir, `.prepare().bind().first()/all()/run()` ve atomik `.batch()` sağlar. Bilinmeyen şema değişikliklerinde reddeder.
- `veridyen/schema.sql`: **Yeni/boş** MariaDB için şema (phpMyAdmin'de ayrı uygulanır).
- `veridyen/import-d1.mjs`: Cloudflare SQL yedeği için önce salt okunur kontrol. `--apply --confirm-empty-staging` verilmeden MariaDB'ye yazmaz; hedefte herhangi bir kayıt varsa durur.
- `tests/veridyen-mysql-adapter.test.js`: temel SQL normalleştirme ve transaction testleri.
- `package.json`: `mysql2` ve `sql.js` bağımlılıkları.

## Proje sahibinin bugüne kadarki hazırlıkları
- Veridyen Node.js 22.23.3; cPanel uygulama kökü: `/home/mobilsat/hizlisatis`; app URL: `mobilsatis.com.tr`; başlangıç `server.js`.
- MariaDB: `mobilsat_hizlisatis`; yetkili kullanıcı `mobilsat_hsapp` (SELECT/INSERT/UPDATE/DELETE).
- GitHub ana kaynak ZIP'i `/home/mobilsat/hizlisatis/kaynak` içinde. Orijinal `server.js` örnek dosyası üst dizinde.
- D1 yedeği kullanıcı bilgisayarında `hizlisatis-d1-2026-11-23.sql` (~19.6 MB); özel kayıttır, GitHub'a konmamalı.
- Yedekleme anında D1 sorgusuyla gözlenen sayılar: 19.098 ürün, 1 kullanıcı, 1 müşteri, 3 müşteri hareketi. Bunlar değişebilir.
- **Ayrıca:** Cihazlarda saklanan fiş geçmişi yeni `mobilsatis.com.tr` origin'ine otomatik geçmez. Kullanıcı ayrı cihaz yedeği almamayı seçti. Bu risk bilinçli tutulmalı ve eski `pages.dev` adresi kapatılmamalıdır.

## Ortam değişkenleri (cPanel > Setup Node.js App)
Değerleri bu dosyaya, GitHub'a veya sohbete koymayın.

| Değişken | Açıklama |
|--|--|
| `DB_HOST` | MariaDB sunucusu, genelde `localhost` (Veridyen teyit) |
| `DB_PORT` | Genelde `3306` |
| `DB_NAME` | `mobilsat_hizlisatis` |
| `DB_USER` | `mobilsat_hsapp` |
| `DB_PASSWORD` | cPanel'de oluşturulan gizli kullanıcı parolası |
| `PUBLIC_ORIGIN` | `https://mobilsatis.com.tr` veya ayrı test alt alan adı |
| `AUTH_V2_ENABLED` | `true` |
| `PRODUCT_WRITE_KEY` | En az 24 karakterlik gizli sunucu anahtarı (mevcut değeri kopyalamak şart değil; yeni domain cookie'leri tekrar kurulur) |
| `ADMIN_INITIAL_PASSWORD` | En az 12 karakterlik gizli ilk yönetici parolası (mevcut `app_users` taşınacaksa yeni parolayı kullanarak hesap sıfırlamayın) |
| `ADMIN_INITIAL_USER` | Varsa mevcut admin adı, aksi halde `admin` |
| `VERIDYEN_READY` | Başlangıçta **TANIMLAMAYIN** veya `false` bırakın |

Not: `PORT` cPanel/Passenger tarafından sağlanabilir; elle keyfî dış port açmayın.

## Güvenli kurulum sırası
1. **Production yerine staging subdomain** oluşturun (ör. `test.mobilsatis.com.tr`). Mevcut Cloudflare adresi ve eski satışlar korunur. Veridyen Node.js Application URL staging'e ayarlanmalı.
2. Bu dalın kaynaklarını staging uygulamasının köküne yerleştirin. Yerel örnek `server.js` dosyasını yalnızca yeni uygulama kökü hazır olduğunda yedekleyip değiştirin. `public_html` içine API kodlarını koymayın.
3. cPanel Node.js uygulama kökünde `package.json` ile `npm install` ve `npm run build` çalıştırın. `public/vendor/html5-qrcode.min.js` üretilmelidir.
4. Node uygulamasını başlatın. `GET https://test.mobilsatis.com.tr/__veridyen/health` başlangıçta `configured:false` ve `ready:false` gibi güvenli bir durum döndürmeli; bütün gerçek API ve UI 503 kapısı altında kalır.
5. phpMyAdmin'de yalnızca **boş Veridyen test MariaDB** üzerinde `veridyen/schema.sql` şemasını uygulayın. Mevcut Cloudflare D1'e SQL yapıştırmayın.
6. Kaynak SQL yedeğini bilgisayarda ya da güvenli sunucu dizininde (asla `public_html` veya `public/` içinde değil) `node veridyen/import-d1.mjs path/to/private.sql` ile **salt okunur** inceleyin. İçerik ve kişisel kayıtları paylaşmayın.
7. Veri aktarmadan önce kaynaktaki şema alanlarını, ürün durumlarını, kullanıcı hesaplarını ve müşteri kayıtlarını denetleyin. Bağımsız/sıfır dolu staging olduğunda, yetkili geliştirmeci gözetiminde `--apply --confirm-empty-staging` kullanın. MariaDB CRUD hesabı CREATE yetkisi olmadığından önceden şema uygulanmalıdır.
8. Kayıt sayıları, her API, oturum, satış ve ödeme/üretim dışı testler doğrulandıktan sonra `VERIDYEN_READY=true` ile **yalnız test ortamını** açın.
9. Testler başarıyla geçmeden DNS değişikliği, gerçek satış, kullanıcı aktarımı, eski alan adını kapatma, production MariaDB üzerinde yeniden import yapma işlemlerine geçmeyin.

## Kritik sınırlamalar
- Bu ilk uyarlama **tam kabul testinden geçmemiştir**; henüz eski D1 yedeğinin gerçek SQL içeriğiyle ve Veridyen MySQL sunucusunda test edilmedi.
- SQL uyumluluk katmanı yalnızca mevcut projede tespit edilen sorguları kapsar; yeni sorgu veya şema değişikliği özel uyarlama gerektirir.
- Cloudflare'a özgü resim dönüştürme `ENABLE_IMAGE_RESIZE=false` ile kapalıdır, orijinal görseller kullanılabilir.
- App kullanıcı oturumları domain'e bağlıdır; yeni adreste kullanıcılar yeniden giriş yapar. Yeni secret eski cookie'leri doğrulamaz.
- MariaDB ve SQLite veri türü/indeks/JSON davranışları aynı değildir. Satış öncesi stok/ürün hareketleri, müşteri borcu, idempotency ve admin yetkileri ayrıca denenmelidir.
- `product_changes` toplamının 19.098 olması, bunların 19.096 başlangıç katalog ürünü dışında oluşmuş ek kayıtlar içerebileceğini gösterir; otomatik reset/seed YAPMAYIN.
- Cihaz satış geçmişi ayrı IndexedDB'dedir. Kullanıcı yedek almazsa yeni origin'de önceki yerel fişler görünmeyecektir.
- Satış API'si stok/izin denetimi yapar, ama tüm cihazlardan gelen satış fişleri merkezi bir DB'ye yazılıyor varsayılmamalıdır.

## Testler
```sh
npm install
npm test
npm run build
```
Bu dalda kod kontrolleri tasarlandı fakat **canlı Veridyen üzerinde koşulmadı**. GitHub'a commit etmek canlıya dağıtım anlamına gelmez.
