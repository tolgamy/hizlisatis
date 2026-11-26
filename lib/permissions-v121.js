// v121: configured rights do not automatically become effective.
export const PERMISSION_SCHEMA_VERSION=121;
export const PERMISSION_GROUPS=[
  [
    "Ürün işlemleri",
    [
      [
        "product.view",
        "Ürünleri görüntüleme",
        1
      ],
      [
        "product.lookup",
        "Barkod ve fiyat sorgulama",
        1
      ],
      [
        "product.activate.initial",
        "Ana pasif ürünü aktifleştirme",
        1
      ],
      [
        "product.activate.later",
        "Aktif sonrası pasifi aktifleştirme",
        0
      ],
      [
        "product.price",
        "Mevcut ürünün satış fiyatını değiştirme",
        0
      ],
      [
        "product.stock.in",
        "Stok girişi yapma",
        0
      ],
      [
        "product.stock.out",
        "Stok miktarını azaltma",
        0
      ],
      [
        "product.create",
        "Sıfırdan ürün oluşturma",
        0
      ],
      [
        "product.delete.restore",
        "Ürün silme ve geri yükleme",
        0
      ],
      [
        "product.barcode",
        "Barkod değiştirme",
        0
      ],
      [
        "product.category",
        "Kategori değiştirme",
        0
      ],
      [
        "product.tax.origin",
        "KDV ve menşei değiştirme",
        0
      ],
      [
        "product.cost",
        "Alış fiyatını görüntüleme",
        0
      ],
      [
        "product.import",
        "Excel ile ürün yükleme",
        0
      ],
      [
        "product.export",
        "Ürünleri Excel olarak indirme",
        0
      ],
      [
        "product.label",
        "Fiyat etiketi yazdırma",
        1
      ]
    ]
  ],
  [
    "Satış işlemleri",
    [
      [
        "sale.cash",
        "Nakit satış",
        1
      ],
      [
        "sale.card",
        "Kartlı satış",
        1
      ],
      [
        "sale.weight",
        "Tartılı ürün satışı",
        1
      ],
      [
        "sale.quantity",
        "Sepette ürün adedi değiştirme",
        1
      ],
      [
        "sale.clear",
        "Satış öncesi sepet temizleme",
        1
      ],
      [
        "sale.void",
        "Satış tamamlandıktan sonra iptal",
        0
      ],
      [
        "sale.return",
        "Ürün iadesi",
        0
      ],
      [
        "sale.discount",
        "İskonto yapma",
        0
      ],
      [
        "sale.price",
        "Satış sırasında fiyat değiştirme",
        0
      ],
      [
        "sale.reprint.own",
        "Kendi satış fişini tekrar yazdırma",
        1
      ],
      [
        "sale.reprint.other",
        "Diğer kasaların fişlerini yazdırma",
        0
      ]
    ]
  ],
  [
    "Müşteri ve veresiye",
    [
      [
        "customer.lookup",
        "Müşteri sorgulama",
        1
      ],
      [
        "customer.credit",
        "Veresiye satış",
        1
      ],
      [
        "customer.create",
        "Yeni müşteri oluşturma",
        0
      ],
      [
        "customer.collect",
        "Borç tahsilatı",
        1
      ],
      [
        "customer.limit",
        "Veresiye limiti değiştirme",
        0
      ],
      [
        "customer.opening",
        "Açılış borcu değiştirme",
        0
      ]
    ]
  ],
  [
    "Raporlar ve sistem",
    [
      [
        "report.own",
        "Kendi satış geçmişini görme",
        1
      ],
      [
        "report.daily.own",
        "Kendi günlük cirosunu görme",
        1
      ],
      [
        "report.other",
        "Diğer kasaların satışlarını görme",
        0
      ],
      [
        "report.all",
        "Genel ciro ve geçmiş raporlar",
        0
      ],
      [
        "report.cost",
        "Kâr ve maliyet bilgileri",
        0
      ],
      [
        "system.printer",
        "Yazıcı seçme ve test baskısı",
        1
      ],
      [
        "system.design",
        "Fiş ve etiket tasarımını değiştirme",
        0
      ],
      [
        "system.backup",
        "Yedek alma ve geri yükleme",
        0
      ],
      [
        "system.user.create",
        "Kullanıcı oluşturma",
        0
      ],
      [
        "system.user.permissions",
        "Kullanıcı yetkilerini değiştirme",
        0
      ],
      [
        "system.security",
        "Sistem güvenlik ayarları",
        0
      ]
    ]
  ]
];
export const ALL_PERMISSION_IDS=PERMISSION_GROUPS.flatMap(g=>g[1].map(r=>r[0]));
export const STANDARD_PERMISSIONS=PERMISSION_GROUPS.flatMap(g=>g[1].filter(r=>r[2]===1).map(r=>r[0]));
export const ADMIN_ONLY=['system.user.create','system.user.permissions','system.security'];
export const SALES_BUNDLE=['sale.cash','sale.card','sale.weight','sale.quantity','sale.clear','product.label'];
export const LEGACY_PERMISSIONS=['sales','products','customers','reports','discounts'];
const MARKER='profile:v121';
export function decodePermissions(raw){
 let a;try{a=JSON.parse(raw)}catch{return {profile:null,legacy:[]};}
 if(!Array.isArray(a))return {profile:null,legacy:[]};
 if(a.includes(MARKER)){
  const profile=ALL_PERMISSION_IDS.filter(id=>a.includes(id)&&!ADMIN_ONLY.includes(id));
  return {profile,legacy:['sale.cash','sale.card','customer.credit'].some(id=>profile.includes(id))?['sales']:[]};
 }
 return {profile:null,legacy:LEGACY_PERMISSIONS.filter(id=>a.includes(id))};
}
export function encodeProfile(a){
 if(!Array.isArray(a)||a.some(id=>!ALL_PERMISSION_IDS.includes(id)||ADMIN_ONLY.includes(id)))throw Error('Geçersiz veya yalnızca yöneticiye ait yetki.');
 return [MARKER,...ALL_PERMISSION_IDS.filter(id=>a.includes(id))];
}
