# PROMPTLAR — TASARIM, KOD VE HATA DUZELTME

## Prompt 1: Masaustu odeme butonu (onayli durum)
HızlıSatış reposunda masaustu native Sale sayfasini incele. Kullanici 'Satisa Devam Et' butonunun saga asagi sabitlenmis degil, sag odeme panelinde 'Nakit / Kart / Sepet Indirimi / Diger Odeme' siralamasindan sonra ayni boyutta olmasini istedi. Guncel kodda public/index.html icinde desktopContinueSlot, public/app.js icinde placeCartContinueForViewport, public/styles.css icinde desktop payment-stack continue button kurali var. Bunlari silme/ikileme. Asil openCart dugmesini tasiyarak tek event listener, dinamik urun sayisi/tutar ve mobil eski konum korunmali. Desktop Media: min-width 1024px, min-height 600px, landscape, hover:hover, pointer:fine. Kosulsuz masaustu CSS ile mobil duzeni bozma. Test ederek raporla.

## Prompt 2: Mobil KPI kutulari (onayli durum)
Ana sayfada 'Bugunku Satis' ve 'Toplam Urun' iki esit genislikte beyaz kart olarak yan yana olmali; baslarda ikon yok. Satis sayisi '₺10.000,00' gibi tutarlarda tek satir; asil canli hesap ve tr-TR para bicimi degismemeli. public/app.js fitHomeMetricNumbers ve public/styles.css mobil dashboard-metrics kurallari korunmali. Kart renkleri sagdakiyle ayni sade beyaz ve lacivert. Kontroller: 320/375/390/430px iOS/Android ve tam masaustu.

## Prompt 3: Guvenli herhangi bir yeni ozellik
Bu ZIP'deki tum kaynak kodu tara; degisiklik istegimi mevcut kodun en uygun noktasina ekle. Once hedef dosya, mevcut davranis, veri riski ve degisiklik kapsamini ozetle. Sadece ilgili dosyalarda minimal diff kullan. Mevcut islem kimliklerini, DOM id ve event listener'larini bozma. Auth/DB/satis durum kodu gereksiz yere degismesin. Node test + build + manuel gorsel test basamaklarini goster. Asil production'a push etmeden once sonuc dogrulansin.

## Prompt 4: Bug analizi
Hata: [BURAYA HATA EKRANINI, TAM URL, CIHAZ, TARIH VE ADIMLARI YAZ].
Beklenen/gorulen davranisi ayir. Once gercek kaynak kodunda ilgili event, CSS media query, ag response ve service worker cache mantigini incele. D1 ya da IndexedDB'yi sifirlamayi onermeden once guvenli test ve veri yedegi sun. Calismayan testleri basarili olarak raporlama. Varsayimi kanit gibi yazma.

## Prompt 5: Basit taslak->onay->kod
Ilk etapta yalnizca gorunur taslak hazirla; onceki ekranin iskeletini koru. Onaylanmayan bolumlere dokunma. Kullanici 'uygula' derse kaynak kodda minimal degisiklik yap, masaustu ve mobil farklarini izole et, test, commit ve yayin durumunu ayri raporla. GitHub'a commit basarisi, canli deploy basarisi anlamina gelmez.
