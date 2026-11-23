-- HızlıSatış central sales / receipts (additive migration).
-- Run in phpMyAdmin against ONLY the verified kolaykasa_hizlisatis database.
-- DO NOT DROP or TRUNCATE existing tables. Existing six tables stay unchanged.
-- Take a verified database backup before deployment.
CREATE TABLE IF NOT EXISTS pos_sales (
  id VARCHAR(100) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  created_at VARCHAR(48) NOT NULL,
  payment VARCHAR(30) NOT NULL,
  currency VARCHAR(12) NOT NULL,
  total_cents BIGINT NOT NULL,
  customer_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  cashier_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  payload LONGTEXT NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  INDEX pos_sales_created (created_at, id),
  INDEX pos_sales_customer (customer_id),
  INDEX pos_sales_cashier (cashier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verification (read-only):
-- SELECT COUNT(*) AS existing_sales FROM pos_sales;
-- SELECT COUNT(*) AS existing_credit FROM pos_customer_ledger WHERE action='sale';
