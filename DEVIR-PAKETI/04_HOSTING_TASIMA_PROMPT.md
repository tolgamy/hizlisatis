# PROMPT — HOSTING / DOMAIN DEGISTIRME
Bu belgeyi yeni gelistiriciye aynen verin.

Sen Cloudflare Pages/Workers, D1, Node.js, DNS, TLS ve guvenli POS tasimasi konusunda uzmansin. HızlıSatış kodunu eksiksiz tara. Gorev: pages.dev adresine bagli kalmadan uygulamayi guvenilir bir alan adinda yayinlamak veya gerekirse baska hostinge guvenle tasimak.

ONCE iki secenegi karsilastir:
A) En dusuk risk: Cloudflare Pages'te kal; ozel alan adi / SSL / DNS kullan. Once yeni alan adini Turk Telekom ve farkli mobil/Wi-Fi hatlarindan test et.
B) Tam tasima: JavaScript Pages Functions + D1/API bagimliliklarini Node.js + SQLite/Postgres gibi guvenilir ortama veya Workers uyumlu platforma tasiyarak esit guvenlik ve veri butunlugu sagla. Siradan paylasimli PHP hostinge sadece public klasoru atarak tam islev bekleme.

Mevcut durum:
- Statik UI: public/*; giris/urun/cari/API: functions/api/*; guvenlik lib/*.
- Production'daki gercek D1 DB kimligi bu ZIP'te yok. Secret'lar da yok.
- Satilan urunler/fişler her cihazda IndexedDB; domain degistirmek eski cihaz kayitlarini YENI origin'e otomatik tasimaz. Bu kritik!!!
- PWA Service Worker, IndexedDB ve cookie'ler eski origin'e baglidir. Eski adresi kapatmadan once her cihazdan guvenilir yedek al, geri yukleme usulunu planla.
- Kullanici hesaplari D1'dedir; salt ZIP dosyasi kendi basina kullanici verisini icermez.
- Form/gorsel/son kullanici tarayici yetkileri HTTPS gerektirir.

Beklenen cikti:
1) Hosting turu uygunluk tablosu: statik hosting / paylasimli PHP / Node.js VPS / Cloudflare ozel alan adi.
2) Yeni domain icin DNS/TLS, SNI, IPv4/IPv6, HTTP->HTTPS, Cloudflare WAF/proxy ve Turk Telekom uzerinde test adimlari.
3) D1 yedek ve geri yukleme plani; tablolari otomatik bosaltma. Migration gerekiyorsa sema, indeksler, transaction ve tutarlilik kontrolleri.
4) IndexedDB cihaz verisini eski domaine bagli iken kullanici onayi/guvenli yol ile export etme, yeni domaine import etme ve bire bir fis sayim/total dogrulama. Tum cihazlar ayri test edilir. Verisiz sifirlamayi KABUL ETME.
5) Cookie/auth farklari ve yeni domaine login. PRODUCT_WRITE_KEY ve baslangic admin sifresini gizli saklama. Testte gercek parolalari paylasma.
6) Stage, production, rollback, deploy adimlari ve test; yeni domainin gercek iki farkli internet saglayicisindan acildiginin dogrulanmasi.
7) Fiyat ve operasyon karsilastirmasi guncel resmi belgelerle yap; belgesiz fiyat uydurma.
8) Gercek migration icin hangi bilgilere gereksinim oldugunu listele; bunlar gelmeden production'a dokunma.

Kurulumda 'eski domen silinsin', 'IndexedDB zaten ortak', 'DB yeni domaine otomatik tasinir' gibi varsayimlarda bulunma. D1 ve cihaz-bazli fisler icin ayri geri donus plani yaz.
