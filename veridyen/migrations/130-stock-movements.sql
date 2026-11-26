-- Additive ledger. v125 receipts stay unchanged.
CREATE TABLE IF NOT EXISTS pos_stock_movements (
  sale_id VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
  product_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  PRIMARY KEY (sale_id, product_id),
  INDEX pos_stock_product (product_id),
  CONSTRAINT pos_stock_sale FOREIGN KEY (sale_id) REFERENCES pos_sales(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
