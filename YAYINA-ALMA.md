# Cep Hızlı Satış — GitHub + Cloudflare Pages yayın yönergesi

Bu klasör **doğrudan Git deposunun köküne** konulmalıdır. ZIP dosyasını GitHub'a tek dosya olarak yüklemek yeterli değildir; açılmış dosya yapısını gönderin.

## 1. Yeni GitHub deposu

GitHub'da giriş yapın, https://github.com/new adresinden `hizlisatis` adlı **mevcut boş** depoyu kullanın: https://github.com/tolgamy/hizlisatis (şu anda Public; isterseniz GitHub ayarlarından Private olarak değiştirebilirsiniz).

Projeyi bilgisayarınızda ZIP'ten açtıktan sonra, o klasörde:

```bash
git init
git add .
git commit -m "Cep Hizli Satis PWA v1.1"
git branch -M main
git remote add origin https://github.com/tolgamy/hizlisatis.git
git push -u origin main
```

GitHub hesabı, `git` yazma yetkisi ve cihazınızda Git gerekir. GitHub Desktop üzerinden de **Add Local Repository → Publish Repository** akışı kullanılabilir.

## 2. Cloudflare Pages Git entegrasyonu

1. https://dash.cloudflare.com/ adresine Cloudflare hesabınızla giriş yapın.
2. **Workers & Pages → Create → Pages → Connect to Git** seçin.
3. GitHub erişimini onaylayıp `tolgamy/hizlisatis` deposunu seçin.
4. Project name: **Sizin seçeceğiniz Cloudflare Pages adı** (müsaitse).
5. Production branch: `main`.
6. Framework preset: `None`.
7. Root directory: `/` (deponun kökü).
8. Build command: `npm run build`.
9. Build output directory: `public`.
10. Node.js: 22 (`.node-version` projenin kökünde mevcut); gerekirse environment variable `NODE_VERSION=22` ekleyin.
11. **Save and Deploy** seçin. İlk kurulum sonrasında `main` dalına push yaptığınızda yeni dağıtım otomatik çalışır.

`functions/api/products.js`, `public` klasörünün **dışında** yer almalıdır. Cloudflare Pages Functions otomatik olarak `/api/products` olarak yayınlanır.

## 3. Yayın sonrası kontrol

Müsait olan projenin gerçek `*.pages.dev` alan adını Cloudflare panelinden kopyalayın. Aşağıdaki testleri açın:

- `https://GERCEK-ADRES.pages.dev/api/products?health=1` → `ok:true` yanıtı beklenir.
- `https://GERCEK-ADRES.pages.dev/api/products` → ürünler JSON halinde gelmeli, yoksa detaylı 503/504 hatası dönmeli.
- `https://GERCEK-ADRES.pages.dev/` → PWA yüklenmeli.

XML kaynağı yavaşsa `Yerel XML Yükle` aracılığıyla katalog cihazda saklanabilir. Bir kez açılıp Service Worker kurulmadan tamamen çevrimdışı açılış beklenmemeli.

## Üretim güvenliği

Bu uygulama **oturum açma gerektirmez**; Pages URL'sine erişen kişiler katalogu görüntüleyebilir. Satışlar yalnızca cihazın IndexedDB veritabanında tutulur; çoklu cihaz senkronizasyonu, mali fiş ve ödeme altyapısı içermez. Gerçek müşterilerle kullanmadan önce veri yedeği, yetkilendirme, mali gereksinimler ve yazıcı uyumluluğunu doğrulayın.
