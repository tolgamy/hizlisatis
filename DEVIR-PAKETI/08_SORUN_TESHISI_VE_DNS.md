# DUKKAN INTERNETI / DOMAIN / DNS TESHISI

Gozlenen vaka (kullanici bildirimi): Bir dukkanin Turk Telekom Wi-Fi baglantisinda Windows PC ile hizlisatis.pages.dev ERR_CONNECTION_TIMED_OUT alindi. Ayni PC telefonun mobil internet paylasimi/hotspot ile siteye ulasti. Baska siteler aciliyordu.

KESIN sonuc: Ayni PC, farkli ag yolunda farkli sonuc veriyor. Bu ag/DNS/ISP/yol/filtre farkina isaret eder. Belli bir kurumun engellemesi kanitlanmis degildir. 'Cloudflare kesin engelli' sonucuna atlamayin.

Yeni gelistiricinin yapmasi gerekenler:
- Erişilemeyen ve erisilebilen aglarin ISP, tarih, DNS sunucusu, HTTP hatasi ve IP ailesini kaydet.
- Windows: nslookup hizlisatis.pages.dev (hem varsayilan DNS ile hem bilinen DNS ile); tracert hizlisatis.pages.dev; curl -Iv --connect-timeout 10 https://hizlisatis.pages.dev/ .
- SSL/TLS el sikisma, DNS A/AAAA, IPv6 baglanti, IPv4 baglanti, ISP filtresi ve uygulama firewall farklarini ayir.
- Alternatif browser, DNS cache flush, IPv6 testi ve farkli internet saglayicisi karsilastirmasi.
- Siteye baglanma hatasini login/API/d1 hatasindan ayri raporla.
- Custom domain secilirse her iki agdan tekrar test et; sadece sahibi telefonda acildi diye genel basarili sayma.
- Domain/TLS/sunucu loglarindan dogrulanmadan hukum verme.

Bu belge hicbir ISP veya platform icin kesin engelleme iddiasi degildir.
