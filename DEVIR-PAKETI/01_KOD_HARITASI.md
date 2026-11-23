# KOD HARITASI / MIMARI

## Guncel depo
Repository: https://github.com/tolgamy/hizlisatis
Snapshot: 08d57f0b2dd3dba4fce38d96683ba1bf1feb190f (23.11.2026).
Ana dal: main. Bu devir kopyasi ayri bir daldadir; uretim dalina otomatik eklenmez.

## Dosya gruplari
- public/index.html — SPA/PWA temel iskeleti ve HTML semantik alanlar.
- public/styles.css — mobil ve masaustu arayuz ve cok sayida gecmis duzeltme.
- public/app.js — satis sepeti, rota/sekme, toplamlar, stok, tarihce vb.
- public/auth-ui.js — oturum kapisi / kullanici arayuzu.
- public/sw.js — PWA cache; gorunen degisikliklerde cache surumunu guncelle.
- public/remote-products.js — D1 API'ye istemci erisimi.
- public/idb.js — cihaz yerel IndexedDB depolari.
- public/catalog/* — yerlesik statik katalog. manifest: 19.096 urun / 14.525 gorselli urun / 20 parca.
- public/category-images/*, public/icons/* — resimler ve ikonlar.
- functions/api/auth.js — kullanici giris API.
- functions/api/users.js — yetki ve kullanici islemleri.
- functions/api/product-state.js — D1 merkezi urun degisiklikleri.
- functions/api/catalog-seed.js — ilk katalog aktarma.
- functions/api/central-health.js — D1 baglanti/sayim durumu.
- functions/api/sale-access.js — cihaza yazilan satis oncesi online yetki kontrolu; merkezi satis defteri degildir.
- functions/api/customers.js — musteri API.
- functions/api/category-images.js — gorsel islemleri.
- functions/api/image.js — opsiyonel resim hizmeti.
- functions/api/admin-session.js — eski admin oturum uyumlulugu.
- lib/admin-auth.js, lib/user-access.js — HttpOnly cookie, yetki, parola.
- scripts/build.mjs — HTML5 QRCode vendor varligini/Excel sablonunu hazirlar.
- scripts/generate-bundled-catalog.mjs — katalog uretimi.
- .github/workflows/* — mevcut CI kontrolleri.
- tests/* — JS testleri (snapshotta 61 dosya).

## Islemler
1. Statik varliklar Pages uzerinden geliyor.
2. /api/* Cloudflare Pages Functions'da calisiyor.
3. API D1 veritabanina env.DB uzerinden baglaniyor.
4. Kullanici/yonetici bilgileri D1 app_users tablosunda.
5. Urun durumu product_changes ile saklaniyor; app_meta ve product_audit baslangic/yazma akisini destekliyor.
6. Satis makbuzlari tum cihazlarin ortak bir satis DB'sinde bulunmuyor: cihaz-bazli IndexedDB.
7. HTTPS ve same-origin cookie ile kimlik dogrulama; yeni domain gecisinde oturumlar tekrar acilabilir.

## Son onaylanan arayuz kararlar
- Mobil ana sayfa Bugunku Satis ve Toplam Urun yan yana, ikon yok, beyaz kartlar; tutarlar tek satirda ve gerekirse dinamik kuculur.
- Masaustu satis ekraninda Satisa Devam Et butonu Diger Odeme seceneginin hemen altinda, odeme butonlariyla ayni olcekte; mobil eski davranisi korunuyor.
- Masaustu barkod/urun listesi, sag odeme bolumu, mobil bottom navigation ve stok/musteri/terazi davranislari aynen korunur.

## Teknik gecis sinirlari
Tek bir normal HTML/PHP hostinge public klasorunu atmak yeterli degildir: Pages Functions (JavaScript backend), D1 ve ayni origin cookie/otorite akislari yeni altyapiya uyarlanmalidir.
README'deki cok eski surum notlari guncel islevleri temsil etmeyebilir. Dosyalarin kendisini okuyun ve test edin.
