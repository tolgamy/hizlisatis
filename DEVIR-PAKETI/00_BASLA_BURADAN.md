# HIZLISATIS — EKSIKSIZ KOD DEVIR PAKETI
Tarih: 23 Kasim 2026 | Kaynak: tolgamy/hizlisatis | Esas alinacak surum: main commit 08d57f0b2dd3dba4fce38d96683ba1bf1feb190f.

## Bu paketin nasil kullanilacagi
Bu GitHub dalinin ZIP arsivi **kaynak kodlarin tamamini** ve bu klasordeki devir dokumanlarini birlikte icerir. Tek tek kopyala-yapistir yapmayin. ZIP dosyasini acin, 00_BASLA_BURADAN.md dosyasini okuyun, 03_ANA_PROMPT.md dosyasini yeni bir asistan/gelistiriciyle paylasin. Paketin kod kismi bu dalin kokunde aynen korunur.

Kod adresi: https://github.com/tolgamy/hizlisatis/tree/devir-mega-paket-2026-11-23
Tam kaynak + belgeler ZIP: https://github.com/tolgamy/hizlisatis/archive/refs/heads/devir-mega-paket-2026-11-23.zip
Canli site (eskiden kullanilan adres): https://hizlisatis.pages.dev

## Kapsam ve kesin sinirlar
- Kaynak: mevcut GitHub reposundaki 171 kaynak dosyasi, dokuman ekleriyle ayni dalda.
- UI: public/index.html, public/styles.css, public/app.js, public/auth-ui.js.
- API/arka uc: functions/api/* (Cloudflare Pages Functions), lib/*.
- D1 merkezi urunler: functions/api/product-state.js; katalog baslangici functions/api/catalog-seed.js.
- Urun katalogu: public/catalog/manifest.json ve 20 katalog parcasi.
- Tarayici kayitlari: public/idb.js; satis/fis gecmisi ayni cihazdaki IndexedDB'de kalir.
- Test: tests/*.test.js; yapilandirma: package.json ve .github/workflows.
- Terazi, yazici, QR olmayan barkod okuma, musteri, stok, toplu kategori ve satis islevlerini koruyun.

**Paketin bilerek icermedikleri:** Canli Cloudflare D1 veritabani dokumu, Cloudflare hesap oturumlari/secret'lari, canli kullanici parolalari, her cihazdaki IndexedDB satis kayitlari, ozel kaynak Excel ve telefondaki tarayici verileri. Bunlar GitHub'dan elde edilemez. 06_VERI_YEDEK_VE_GUVENLIK.md adimlariyla sahibi tarafindan guvenli bicimde alinmalidir. Bu eksikler kod eksigi degildir; canli veriler ve gizli erisimlerdir.

## Degistirilmeyecek is kurallari
1. 19.096 urunun kimlikleri/barkodlari/aktif-pasif-silinen durumlari rastgele sifirlanmaz.
2. Satis gecmisi silinmez, migration olmadan cihazlar arasi merkezi satis varmis gibi davranilmaz.
3. Eski kullanici/oturum yetkileri bypass edilmez; AUTH_V2_ENABLED bayragi ve sunucu sirrlari korunur.
4. Yeni staging/test kurulumu uretim D1'e yazma yetkisi almadan once dikkatle ayrilir.
5. Masaustu ve mobil arayuzler ayridir; birini duzeltirken digerini bozma.
6. Islem/odeme, barkod, yazici, stok, musteri, terazi akislarini regresyona sokma.

## Mevcut projeden dogrulanan bilgiler
Node >=20; package.json scriptleri: npm install --no-audit --no-fund, npm test, npm run build, npm run dev; Cloudflare Pages mevcut CI/production: main dali, build npm run build, yayin dizini public, Cloudflare Functions ve D1 DB binding. D1 uzerindeki degisiklikler merkezi; satis ve fisler cihazdaki IndexedDB'de. Katalog manifestinde count=19096, withImages=14525, 20 part dosyasi var.
README ve YAYINA-ALMA dosyalari tarihsel surum notlari da icerir; GUNCEL kod, API ve testleri esas alin.

## Tavsiye edilen ilk teslimat
Once degisiklik yapmadan kaynaklari denetleyin; npm test + npm run build sonucunu raporlayin; ortam degiskenleri, D1 semasi ve maliyetleri cikartin; hosting secenekleri icin 2 asamali guvenli tasima plani hazirlayin. Yalnizca onaydan sonra tasima yapin.
