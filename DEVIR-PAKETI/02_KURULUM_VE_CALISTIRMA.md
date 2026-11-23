# KURULUM, DOGRU BASLANGIC, YAYIN KONTROLU

## Gerekli araclar
Git, Node.js >=20 (CI Node 22), npm; Cloudflare icin Wrangler / Cloudflare hesabi; gercek islev testleri icin HTTPS, telefon, kamera, gerekiyorsa yazici/terazi.

## Kaynagi acma
1. Bu ZIP'i cikartin (git klasoru olmayabilir; kaynak ve dokumanlar tamdir).
2. Terminali package.json olan ana dizinde acin.
3. npm install --no-audit --no-fund
4. npm test
5. npm run build
6. npm run dev (Wrangler Pages local gelistirme).
7. Yerel ortamda D1/secret olmadiginda API'lerin uretim gibi calismamasini normal karsilayin; canli baglanti uydurmayin.

## Canli Cloudflare Pages kurulumu (mevcut altyapi)
- GitHub kaynak: tolgamy/hizlisatis.
- Branch: main (bu devir dalini production branch YAPMAYIN).
- Build: npm run build.
- Static output: public.
- Pages Functions: functions/api/ otomatik yuklenmeli.
- Production binding: DB (Cloudflare D1; D1 veritabaninin gercek kimligini panelden dogrulayin).
- Secrets: PRODUCT_WRITE_KEY, ADMIN_INITIAL_PASSWORD; admin baslangic adi icin ADMIN_INITIAL_USER, etkinlik icin AUTH_V2_ENABLED. Asil degerleri paket icermiyor.
- AUTH_V2_ENABLED=true yalnizca hazir D1 ve guclu secret ile etkinlestirilmeli. Eksik ayarda uygulama bilerek erisimi kapatabilir.
- Opsiyonel ENABLE_IMAGE_RESIZE=true ancak ucret ve destek kosullarini onceden dogrulayin.

## Test edilecek API'ler
GET /api/central-health (read-only D1 baglantisi)
GET /api/auth (oturum/giris modu — tam giris olmadan veri sizdirmaz)
GET /api/product-state (merkezi katalog hazirligi/urun okuma)
POST /api/sale-access (kimlik/yetki gerektirir; rasgele satis olusturarak test ETMEYIN)
Sadece kontrol amacli GET istekleri icin mevcut kaynak testlerini izleyin. Yetkili degisiklikler staging ortaminda denenir.

## Uretimde kabul testleri
- Farkli cihaz ve internet saglayicisi ile login.
- Telefon ve masaustu ayni urun/degerleri dogru okumali.
- 19.096 referans katalog ve D1 seed hazirligi.
- Barkod okutma, miktar, stok ve ucret hesaplama.
- Admin ve kasiyer farkli yetki sinirlari.
- Mevcut cihaz fisleri, musteri kayitlari, yazici, CAS terazi ve backup islevleri.
- Mobil yan yana iki KPI; masaustu Satisa Devam Et odeme panelinin altinda.
- Kotu baglantida gizli/modul hatalarinin sessizce veri silmemesi.
- Test sonrasi canli verinin yerinde oldugunu dogrulama.

## Hata ayirma
GitHub main dalina kod gitmesi canli Cloudflare Pages yayin basarisini **garanti etmez**. Pages Deployments, Functions deploy, env bindings ve GET /api/central-health ayri kontrol edilir. Service Worker cache eskiyse versiyon guncellemesi ve tarayici yenilemesi gerekir.
