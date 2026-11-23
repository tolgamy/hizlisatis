# SON KONTROL LISTESI — CANLIYA GECIS

## Kaynak
- [ ] ZIP dosyalari tam, package.json mevcut, public/catalog/manifest.json var.
- [ ] Kaynak SHA beklenen referansla eslesiyor; yetkisiz ucuncu parti kod eklenmedi.
- [ ] Node >=20 kuruldu, npm install --no-audit --no-fund calisti.
- [ ] npm test raporu gercek sonucuyla kaydedildi.
- [ ] npm run build raporu gercek sonucuyla kaydedildi.
- [ ] /api/* dosyalari ile statik public/* birlikte deploy edildi.

## Merkezi veri / guvenlik
- [ ] Cloudflare D1 gercek production binding DB dogrulandi.
- [ ] D1 yedek ve geri donus alindi.
- [ ] 19.096 katalog icin mantiksal sayim ve urun guncelleme kontrolu.
- [ ] PRODUCT_WRITE_KEY ve ADMIN_INITIAL_PASSWORD GitHub/ZIP'e sizmadi.
- [ ] Admin/kasiyer kullanici yetkileri testi.
- [ ] Giris yapmadan veya izin olmadan yazma engelli.
- [ ] Musteri/veresiye verisi korunuyor.
- [ ] Kullanici oturumlari yeni origin'de test edildi.

## Her cihazdaki yerel veri
- [ ] Kullanimdaki her PC ve telefonda IndexedDB/uygulama yedegi alindi.
- [ ] Onceki fis sayilari/toplamlari ve tarih araliklari belgeli.
- [ ] Yeni origin'de veri geri yukleme denemesi basarili.
- [ ] Eski domain kayitlari silinmedi; geri donus mumkun.
- [ ] Cihazda gizli mod / farkli profil davranisi test edildi.

## Uygulama / responsive
- [ ] Mobil: yan yana beyaz Bugunku Satis/Toplam Urun, rakamlar tek satir.
- [ ] Masaustu: Satisa Devam Et butonu Diger Odeme altinda, digerleriyle ayni boyutta.
- [ ] Mobil satis alt menusu aynen calisiyor.
- [ ] Barkod/terazi/urun ekleme/silme/adet/indirim/odeme.
- [ ] Fis yazdirma, PDF/WhatsApp, CAS terazi testleri.
- [ ] Urun aktif/pasif/silinen akislari ve stok kayitlari.
- [ ] PWA service worker cache eski stil tasimiyor.

## Ulasim / domain
- [ ] HTTPS sertifikasi ve tarayici guvenli baglanti dogru.
- [ ] Turk Telekom dukkan Wi-Fi ile site aciliyor.
- [ ] Telefon hotspot ve baska bir ISP ile site aciliyor.
- [ ] /api/central-health canli adreste gercek beklenen sonuc.
- [ ] Cloudflare/hosting deployment success ve uygulama testleri ayri ayridir.
- [ ] Owner tarafindan son onay ve rollback karari verildi.

## NO-GO
Veri yedegi eksikse, /api/auth veya D1 yoksa, urunler pasif/silinenleri kaybediyorsa, daha onceki cihaz satis gecmisi yok oluyorsa veya farkli aglar siteye ulasamiyorsa canli gecisi DURDUR.
