# HızlıSatış — Windows ve cihazlar arası senkronizasyon

Kaynak: kullanıcı tarafından sağlanan WINDOWS_SYNC_PROMPT.md (İşletmem için Flutter planı), HızlıSatış v123 kaynak incelemesine uyarlanmıştır. Bu belge bir geliştirme planıdır; uygulama kodunda değişiklik yapmaz. Üretim tabanı v123, cPanel Node.js/MariaDB. 

## Korunacaklar
- kolaykasam.com, mevcut merkezi veritabanı ve ürünler, tüm kullanıcılar, satış ve müşteri kayıtları.
- Mevcut masaüstü/mobil arayüz, 12 kart, 44 yetki kataloğu; ince yetkiler henüz tamamlanmadı.
- Yönetici PIN, kasiyer PIN'siz giriş; parola v120; güvenlik ve işlem bazlı yetkiler sunucuda doğrulanmalı.
- 80 mm kağıtta onaylı 64 mm vektör fiş, Argox 38 × 100 mm. Mevcut ayarları ve baskı üretimini değiştirmeden test et.
- Mevcut seri terazi ve HID okuyucu davranışı.

## Mevcut durum (v123 kaynak incelemesi)
- public/manifest.json ve public/sw.js: kurulabilir PWA altyapısı var, manifest portrait-primary; Windows'ta gerçek kurulum ve yönelim test edilmedi.
- windows/BASLAT.bat, windows/print-helper.py: Python yerel yazdırma yardımcısı mevcut; 127.0.0.1 ve origin/token kontrolü. Bağımsız Windows POS exe/MSIX değil.
- public/scale-serial.js: Windows Chrome/Edge Web Serial; seri port seçimi ve veri tamponu mantığı var.
- veridyen/central-sales.js: InnoDB transaction, fiş kimliği ve payload hash ile idempotent tekrar; kredi kontrolü. Merkezi satış raporu henüz kasiyere göre ayrılmadı.
- public/central-sales-v88.js ve public/app-v122.js: merkez aktifken hata halinde yerel satışa dönüş yok; doğrulanmamış katalog salt okunur; çevrimdışı satış yok.
- public/device-backup.js: cihaz satış yedeği ve fiş ayarları; kapsamlı merkezi MariaDB yedeği değil.

## Aşama A — Yetki ve veri güvenliği (Windows önkoşulu)
v124: ana pasif aktifleştirme ve fiyat/stok kontrolleri; v125: müşteri sorgu/veresiye/tahsilat; v126: kendi satışları, rapor kapsamı ve maliyet alanları; v127: yönetici onayları; v128: denetim kaydı, cihaz kimliği ve tüm API/yetki testleri. Önceki sürüm planı ikon düzeltmesi v123 nedeniyle kaymıştır. Eski hesapları otomatik genişletme veya dönüştürme. Katalog ve cihaz önbelleklerinde hassas veri ayrımı, oturum değişiminde veri izolasyonu.

## Aşama B — Windows dağıtımı
v129: PWA kurulum ve Windows başlangıç kısayolu; manifest yönelimini cihazlarda doğrula; gerçek Windows Chrome/Edge kurulum testi.
v130: Windows masaüstü paketi (.exe kurucu, daha sonra MSIX). Mevcut web arayüzü ve aynı sunucu; masaüstü kabuğu seçimini Windows derleme/protokol denemesiyle doğrula. İmzalama, mağaza hesabı kullanıcıya ait. Güvenli renderer, HTTPS, dar IPC izinleri, uzak web içeriğine Node erişimi yok, güncelleme doğrulama. Windows CI derleme, npm test ve artifact; gerçek Windows açılış kontrolü ayrıca.
v131: F1 arama, F2 nakit, F3 kart, F4 veresiye (yetkiye bağlı), +/−, Del, Esc (onaylı sepet iptali); okuyucu metin girişini bozmamalı. 1024×700 ve 1920×1080 test; mevcut satış yerleşimini koru.
v132: Mevcut yazıcı yardımcısının kurulum/başlatma deneyimi; 64 mm/Argox fiziksel kontrol; COM terazi portu, bağlantı kesilmesi ve manuel tartım.

## Aşama C — Telefon/Windows senkronizasyonu (MariaDB korunur)
v133: cihaz kimliği, son eşitleme, bekleyen/hata göstergesi ve elle eşitleme. Merkezi ürün/satış/müşteri olayları için artan sunucu sıra numarası; imleçle sayfalama; yeniden bağlanınca değişiklik çekme. Yetkili veri kapsamı; kimlik/oturum doğrulaması; mobil web ve Windows aynı uç noktalar. Gerçek iki cihazda ölç; hedef 10 sn.
v134: kalıcı, kullanıcı/işletme/cihaz bazlı satış outbox tasarımı; UUID fiş, sabit payload ve retry, ACK sonra kuyruk temizleme. Yeni DB şeması gerekirse ayrı idempotent migration ve yedek. Yerel güvenli saklama ve cihaz yetki süresi tanımlanmadan çevrimdışı satış açma. Nakit/kart (POS dışı onay gereklidir) satışları kontrollü pilot; çevrimdışı veresiye/tahsilat, fiyat değişikliği, ürün aktivasyonu ve yönetim işlemleri kapalı. Bekleyen satışları göster; bunlar merkezce onaylı satış gibi gösterilmez; yeniden bağlanmada çakışma ve reddedilen kayıtlar çözülür, sessizce silinmez.
v135: stok hareketleri/miktar hesapları ve eşzamanlı satış çatışmaları. Merkezi miktara körlemesine son yazan kazanır uygulama; satış hareketlerini idempotent kaydet. Fiyat anlık görüntüsü ve sürüm kontrolü; stok yetersizliği/aşırı satış politikası kullanıcı tarafından onaylanır. İki cihaz, tekrar gönderim, ACK kaybı, güç kesintisi, yetki iptali, çakışma testleri. Çevrimdışı açılış ve yetki süresi için ayrı güvenlik tasarımı.
v136: merkez yedeği (yetkili, şifreli, zaman damgalı, geri yükleme denemeli), cihaz yedeği ve güvenli geri yükleme; üretimde toplu veri geri yükleme otomatik yapılmaz.

## Aşama D — Dağıtım ve kabul
v137: Windows sürümleme, CI artifact, imzalı kurucu/MSIX, kullanım dokümanı. Kullanıcı satın alması/hesap açması gereken adımları kendisi yapar. Telefon tarafı PWA korunur; native iOS/Android uygulama bu planın kapsamı değil, ayrıca onay gerektirir.
Kabul: mevcut satış ve baskı regresyonu yok; gerçek Windows'ta kurulum/başlatma; yetkisiz veriler sunucudan dönmez; cihazlar arası online satış hedefi 10 sn; offline pilotta satış kaybolmaz/çiftleşmez, stok uyuşmazlıkları görünür ve çözülür; yedekten test ortamına geri dönüş mümkün. npm test, npm run build, CI ve gerçek cihaz sonuçları ayrı raporlanır. Canlı sunucu/Windows/iki cihaz testleri henüz yapılmadı.

Sürüm numaraları öneridir; kapsam ve bağımlılıklar tamamlanmadan üretime alınmaz. Flutter, sqflite ve Supabase'e geçilmez; mevcut merkezi MariaDB korunur. Bu plan tek seferde kod değişikliği veya üretim dağıtımı değildir.
