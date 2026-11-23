# VERI YEDEK, GUVENLIK VE TASIMA KRITIKLERI

## Pakette bulunmayan canli bilgiler
- Cloudflare Production D1 veri dokumu ve kimligi: hesap panelinden sahibi tarafindan yedeklenir. GitHub deposunda canli D1 icerigi yok.
- PRODUCT_WRITE_KEY, ADMIN_INITIAL_PASSWORD, varsa diger secret'lar: koda, ZIP'e veya mesajlara yapistirilmaz. Yeni sorumlu icin minimum yetkili Cloudflare erisimi verilir.
- Her cihazda yerel IndexedDB satis/fiş/uygulama durumlari: ayri ayri, halen eski domaine bagli iken disari aktarilip yedeklenir. ZIP ile birlikte kendiliginden gelmez.
- Ozel kaynak Excel ve kullanicinin isletme/kasa verileri: sahibinin kontrolunde kalir.
- Alan adi kayit firmasi, DNS hesabi ve Cloudflare Pages proje izinleri: owner tarafindan ayrica verilir.
- Tum kullanicilarin parolalari: D1 hash kullaniyor; hamiline parola aktarimi yapilmaz.

## Ozellikle domain tasimasindaki kayip riski
Tarayici localStorage, IndexedDB, Service Worker cache ve cerezler scheme+host+port origin'ine baglidir. hizlisatis.pages.dev yerine hizlisatis.com.tr acilinca **yeni ayri bir cihaz depolama alani** olusur. Eski cihazdaki satis/fis kayitlari otomatik ayni sekilde gorunmez. Bu nedenle 'domaini degistir, gerisi ayni' demek yalnistir. Eski domaine erisim bitmeden butun kullanim cihazlarinda yedek al, deneme geri yukleme ve fis sayim/toplam dogrulamasi yap.

## Guvenli gecis sirasi
1. Kaynak commit SHA sabitle; eski uretim alan adini ve URL'leri not et.
2. D1 ve her kullanim cihazinin yerel verisinin ayri yedegi. Yetkili kullanici/ortam; hassas veri guvenli kanaldan.
3. Yedek geri okuma, satir sayisi, tarihi, hash ve restore denemesi.
4. Ayrik staging ortami (production D1'e dokunmayan test) kur.
5. Yerel/merkezi veri ve kullanici akislarini asama asama test et.
6. Yeni domain/hostingte HTTPS, /api/auth, /api/central-health ve satis yetkisini dogrula.
7. DNS gecisini kontrollu yap; eski domaini bir sure calisir tut.
8. Kullanici cihazlarinda dogru origin'e aktarma/yedek geri yukleme ve fis toplam kontrolleri.
9. Geri donus plani: domain, API, D1 snapshot ve cihaz kayitlari korunarak eski servis.
10. Son kullanici onayi gelmeden production DB sifirlama, toplu seed veya canli hesaplari duzenleme yapma.

## Yetkilendirme ve server
- env.DB zorunlu D1 binding; guncel auth env.AUTH_V2_ENABLED=true ise devrededir.
- env.PRODUCT_WRITE_KEY en az 24 karakter, env.ADMIN_INITIAL_PASSWORD en az 12 karakter; gercek degerler burada YOK.
- Admin ve kasiyer rolleri ile sales, products, customers, reports, discounts, users haklari.
- Satis oncesi /api/sale-access online yetki kapisi var. Ag yokken yeni satis icin online izin yerine sessiz bypass ekleme.
- AUTH secret'larinin degistirilmesi mevcut oturumlari etkileyebilir; mutabakat olmadan degistirme.
- Eski README'lerde gecmis uyumluluk/güvenlik notlari olabilir; kaynak kod ve testler ile karsilastir.

## Kabul kriteri
Tasima sonrasi D1 urun degisiklikleri + kullanici yonetimi + cihaz fisleri dogru; 19.096 referans urun listesi yok edilmiyor; eski ve yeni domain doneminde kayit kaybi yok; mobil ve masaustu menu/odeme akislarinda regresyon yok.
