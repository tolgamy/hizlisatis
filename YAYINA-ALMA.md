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
