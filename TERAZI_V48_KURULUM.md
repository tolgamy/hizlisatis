# HızlıSatış — v48 terazi ve Cloudflare canlı yayın rehberi

Bu belge HızlıSatış'ın mevcut **hizlisatis** Cloudflare Pages projesi için hazırlanmıştır.

## Durum ve sınırlar

- Windows PC: CAS ER PLUS-2 terazisinden **seri port aracılığıyla** ağırlık okumak için yazılım desteği eklendi.
- iPhone, Android ve tablet: Ürün kartından tartılı ürün seçildiğinde **gramaj elle** girilir. Doğrudan COM port bağlantısı yapılmaz.
- Terazinin ayar ekranındaki **COM5** ve **CAS ER PLUS-2** bilgileri kullanıcı fotoğrafından biliniyor. Gerçek baud, parity, seri paket biçimi ve bazı terazi sürümlerinde istek komutu gerekip gerekmediği **henüz fiziksel cihazla doğrulanmadı**.
- Fiş, sepet ve stok kayıtları otomatik testlerden geçti. Bunlar canlı bir CAS cihazı testi değildir.
- Fişteki mali belge uyarısı korunur.
- Mevcut HızlıSatış Cloudflare Pages projesinin **D1 DB bağlaması** ayrıca Cloudflare panelinde korunmalıdır.

## 1. Telefon / tablet testi

1. Cloudflare'da v48 yayında olduktan sonra uygulamayı yeniden açın.
2. Ürün Yönetimi'nde **Muz KG** gibi bir ürün için birimi **kg** seçin; satış fiyatını **bir kilogram için** girin.
3. Satış ekranında ürünü seçin ve örneğin **564** gram yazın.
4. **₺210,00/kg** fiyatıyla toplam **₺118,44** göründüğünü doğrulayın.
5. Sepete Ekle deyin. Aynı ürünü tekrar seçip **750 g** eklediğinizde iki ayrı tartım satırı olmalıdır.
6. İki satırın toplamı, kaydedilen fiş ve stok düşümü tutarlı olmalıdır.

## 2. Windows + CAS COM5 testi

1. Windows'ta **Chrome veya Edge** kullanın. HTTPS: https://hizlisatis.pages.dev
2. COM5'i kullanan eski kasa yazılımını **kapatın**. Aynı COM portu iki uygulama aynı anda açamaz.
3. Satış ekranından **kg veya g birimli** bir ürün seçin.
4. **Terazi ile Satış → COM Portu Seç / Bağlan** düğmesine basın. Windows / tarayıcı port seçme penceresinden gerçekten teraziye bağlı COM portunu seçin.
5. Başlangıç için **9600 / 8 veri biti / parity yok / 1 stop biti** ayarlarını deneyin. Bunlar uygulama varsayılanıdır; terazinin doğrulanmış fabrika ayarı olarak kabul etmeyin.
6. Ürünü kefeye koyun. **Ham veri** ve **Canlı ağırlık** alanlarını izleyin.
7. En az iki eşleşen geçerli ölçüm gelirse **Teraziden Ağırlığı Al** etkinleşir. Ağırlığı aldıktan sonra **Tartımı Sepete Ekle** ile satışa geçin.
8. **Ham veri gelmiyorsa veya tanınmıyorsa** veri formatı, port/baud ayarı ve CAS haberleşme protokolü henüz doğrulanmamıştır. Tartımı elle girerek güvenli şekilde satışa devam edin. Yanlış sayıları ağırlık saymayın.
9. İş bitince **Bağlantıyı Kes** seçeneğiyle COM portunu serbest bırakın.

## 3. Cloudflare Pages'e v48 gönderimi

GitHub'da CI testinin başarılı olması, Cloudflare'a yayın yapıldığını göstermez. Bu depoya ayrıca **Publish HızlıSatış to Cloudflare Pages** adlı **manuel başlatılan** yayın iş akışı eklendi.

Cloudflare hesabının sahibi **bir defaya mahsus** şu iki bilgiyi GitHub deposunun **Settings → Secrets and variables → Actions** bölümüne *Repository secret* olarak girer:

- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare hesap kimliği.
- `CLOUDFLARE_API_TOKEN`: Hesap düzeyinde **Cloudflare Pages: Edit** yetkisi bulunan sınırlı kapsamlı API token.

**Bu gizli bilgileri sohbet, ekran görüntüsü, kaynak kod veya GitHub issue üzerinden paylaşmayın.**

Ardından GitHub **Actions → Publish HızlıSatış to Cloudflare Pages → Run workflow** bölümünden `main` üzerinde canlı yayına gönderim onayı işaretlenir.

İş akışı:
- Kaynağı test eder ve offline tarayıcı dosyalarını derler.
- `npx wrangler pages deploy public --project-name=hizlisatis --branch=main` ile mevcut projeye gönderir.
- Canlı servis çalışanından **v48** PWA sürümünü ve merkezi D1 sağlık yanıtını kontrol eder.
- Bu iki kontrol doğrulanmadan "yayında" sonucu vermez.

D1 veritabanı bağlamaları, yetki anahtarları ve Pages environment secrets **Cloudflare proje ayarlarında kalır**. Bu verileri yeni bir projeye taşımayın. Satışları ve ürünleri yanlış ortama yönlendirmemek için mevcut `hizlisatis` projesinde dağıtım yapın.

## Son saha kabulü

- [ ] Telefon ve tablette 564 g = ₺118,44 doğru.
- [ ] İki ayrı tartım sepette ayrı satır ve doğru fiş.
- [ ] Windows COM5 portuna bağlanıyor.
- [ ] CAS'dan gelen gerçek seri veri gramaja doğru çevriliyor.
- [ ] Eski kasa yazılımı kapatılmadan COM5 bağlantısı denenmiyor.
- [ ] Cloudflare'da v48 ve D1 beraber doğrulandı.

**Not:** Gerçek Windows CAS bağlantısındaki seri protokol ve ilk Cloudflare yetkili dağıtım, yalnız uygulama kaynak koduyla doğrulanamaz; cihaz ve hesap sahibinin işlemi gerekir.
