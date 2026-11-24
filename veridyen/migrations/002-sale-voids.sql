-- Additive, non-destructive central cash/test sale cancellation ledger.
-- Apply to kolaykasa_hizlisatis before deploying the related server/frontend update.
-- Does not alter or delete pos_sales, customer balances, or product_changes.
CREATE TABLE IF NOT EXISTS pos_sale_voids (
  sale_id VARCHAR(100) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  voided_at VARCHAR(48) NOT NULL,
  actor_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  reason VARCHAR(120) NOT NULL,
  INDEX pos_sale_voids_date (voided_at),
  CONSTRAINT pos_sale_voids_sale_fk FOREIGN KEY (sale_id)
    REFERENCES pos_sales(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Read-only verification:
-- SELECT COUNT(*) AS iptal_adedi FROM pos_sale_voids;
-- SELECT s.payment,s.total_cents,v.reason FROM pos_sale_voids v
-- JOIN pos_sales s ON s.id=v.sale_id;
