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
