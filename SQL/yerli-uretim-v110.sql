-- HIZLISATIS v110 / MariaDB (cPanel phpMyAdmin)
-- Yalnızca mevcut HızlıSatış veritabanında çalıştırın.
-- Önce tüm veritabanını dışa aktarın; açık ürün yönetim / POS sekmelerini kapatın.
-- Kullanıcı tüm katalog ürünlerinin yerli üretim olduğunu bildirdi.
-- Tek seferlik işlem; sonradan yapılan manuel değişiklikleri tekrar çalıştırma ezmez.
SET NAMES utf8mb4;
START TRANSACTION;
SET @v110_at = DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.000Z');
SET @v110_bad = (SELECT COUNT(*) FROM product_changes WHERE CASE WHEN JSON_VALID(payload)=1 THEN JSON_TYPE(payload)<>'OBJECT' ELSE 1 END);
SET @v110_total = (SELECT COUNT(*) FROM product_changes);
SET @v110_seed = (SELECT COALESCE(MAX(value),'') FROM app_meta WHERE `key`='catalog_seed_count');
INSERT IGNORE INTO app_meta (`key`,value)
SELECT 'origin_all_turkey_v110', @v110_at
WHERE @v110_bad=0 AND @v110_total>0 AND @v110_seed='19096';
SET @v110_apply=ROW_COUNT();
UPDATE product_changes
SET payload=JSON_SET(payload,'$.mensei','Türkiye','$."menşei"','Türkiye'),updated_at=@v110_at
WHERE @v110_apply=1;
SET @v110_changed=ROW_COUNT();
INSERT INTO product_audit(product_id,action,happened_at)
SELECT '*','bulk-origin-turkey-v110',@v110_at WHERE @v110_apply=1;
COMMIT;
SELECT @v110_total AS toplam_urun, @v110_bad AS gecersiz_json,
 @v110_changed AS guncellenen_kayit,
 CASE WHEN @v110_apply=1 THEN 'TAMAMLANDI'
 WHEN @v110_bad<>0 OR @v110_total=0 OR @v110_seed<>'19096' THEN 'DURDU - VERITABANI KONTROL'
 ELSE 'DAHA ONCE UYGULANDI - MANUEL DEGISIKLIKLER KORUNDU' END AS durum;
-- Bu dosya şema oluşturmaz, fiyat/stok/ürün durumu değiştirmez.
