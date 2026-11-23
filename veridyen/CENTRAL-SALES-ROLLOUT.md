# HızlıSatış — Merkezi satış fişi ve veresiye geçişi

DURUM: HAZIRLIK DALINDA. kolaykasam.com'a YÜKLENMEDİ.

## Eklenen altyapı
- pos_sales: tekil fiş kimliği, fiş içeriği, SHA-256 içerik özeti, ödeme, tutar, tarih, müşteri ve kasiyer.
- POST /api/sales: kullanıcı, ürün ve tutar kontrolleri. Veresiye satışlarında fiş ile borç hareketi TEK InnoDB transaction içinde; hata olursa rollback.
- İdempotent tekrar: aynı kimlik ve aynı içerik ikinci defa borç oluşturmaz; aynı kimlik/farklı içerik reddedilir.
- GET /api/sales: rapor yetkisiyle tüm cihazlardan merkezi fiş okuma, ana sayfa ve CSV raporları.
- POST /api/credit-payments: müşteri kilidi ve aynı tahsilatın tekrar yazılmaması.
- Eski satış yetkilendirme API'si ile ayrı veresiye borç API'si, merkezi mod açıldıktan sonra 409 döndürerek eski önbellekli istemcileri engeller.
- Yerel IndexedDB merkezi kayıt başarılı olduktan sonra yalnızca ek cihaz kopyasıdır.

## Canlıya almadan önce yapılacaklar
1. Mevcut MariaDB veritabanının güvenilir yedeğini ve geri yükleme yolunu doğrulayın.
2. YALNIZ kolaykasa_hizlisatis veritabanında phpMyAdmin üzerinden veridyen/migrations/001-central-sales.sql dosyasını çalıştırın. Mevcut altı tabloyu silmeyin; D1 yedeğini tekrar import etmeyin.
3. SELECT COUNT(*) FROM pos_sales; sorgusuyla yeni tablonun varlığını kontrol edin.
4. Bu daldaki Node ve public kaynaklarının TÜM ilgili dosyalarını beraber dağıtın; eski-yeni dosyaları karıştırmayın.
5. Node22 üzerinde npm test, npm run build, API ve gerçek MariaDB kabul testleri yapın.
6. Gerçek satış yapılmayan bir bakım penceresinde, cPanel Node.js ortamına CENTRAL_SALES_ENABLED=true ekleyip uygulamayı yeniden başlatın.
7. /api/sales?status=1 yanıtında enabled:true olmalı. Fişler ve tahsilatlar test edilip iki cihazda görünmelidir.
8. Veresiye için aynı fişi iki defa gönderme, limit aşma, farklı kullanıcı yetkileri, ağ kesintisi, ödeme tekrarları, CSV raporu ve cihaz yenileme testleri uygulanmalıdır.
9. Daha önce ekran görüntülerinde görünebilmiş parolalar/anahtarlar güvenle yenilenmelidir.

## Zorunlu uyarılar
- Eski cihazlarda tutulan fişler kendiliğinden pos_sales'e aktarılmaz. Geçmiş veresiye fişlerinin yanlışlıkla ikinci defa borçlandırılmaması için eski satış aktarımı bağımsız doğrulama gerektirir.
- Merkezi kayıt başladıktan sonra flag'i rastgele kapatmak, yeni satışları yeniden cihazlara dağıtabilir. Sorunda satışları durdurup fiş/borç uzlaştırması yapın.
- Mali onaylı e-fatura, mali yazar kasa ve merkezi stok düşümü bu dal kapsamında değildir.
- Kod sözdizimi ve saf para hesabı testleri yapıldı. Gerçek Veridyen MariaDB üzerinde uçtan uca kabul testi henüz yapılmadı.
