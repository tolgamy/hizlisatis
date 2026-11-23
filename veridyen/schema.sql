-- HızlıSatış MariaDB staging schema.
-- Run ONLY against a new, empty mobilsat_hizlisatis database.
-- Run as an administrator in phpMyAdmin, NOT on Cloudflare D1.
-- Character set and case-insensitive collation preserve Turkish names.
-- Import the D1 data snapshot AFTER this schema is installed.
CREATE TABLE IF NOT EXISTS app_meta (
  \`key\` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  \`value\` LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  username VARCHAR(32) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL,
  permissions TEXT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  session_version INT NOT NULL DEFAULT 1,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until BIGINT NOT NULL DEFAULT 0,
  created_at VARCHAR(48) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_changes (
  id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  barcode VARCHAR(100) NOT NULL,
  payload LONGTEXT NOT NULL,
  updated_at VARCHAR(48) NOT NULL,
  INDEX product_changes_barcode (barcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_audit (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  action VARCHAR(80) NOT NULL,
  happened_at VARCHAR(48) NOT NULL,
  INDEX product_audit_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_customers (
  id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(25) NOT NULL,
  phone_key VARCHAR(25) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  address TEXT NOT NULL,
  tax_office VARCHAR(100) NOT NULL,
  tax_number VARCHAR(20) NOT NULL,
  credit_limit_cents BIGINT NOT NULL DEFAULT 0,
  opening_debt_cents BIGINT NOT NULL DEFAULT 0,
  notes TEXT NOT NULL,
  created_at VARCHAR(48) NOT NULL,
  updated_at VARCHAR(48) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_customer_ledger (
  id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  customer_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  action VARCHAR(30) NOT NULL,
  amount_cents BIGINT NOT NULL,
  created_at VARCHAR(48) NOT NULL,
  payment VARCHAR(30) NOT NULL,
  notes TEXT NOT NULL,
  INDEX ledger_customer (customer_id),
  CONSTRAINT ledger_customer_fk FOREIGN KEY (customer_id) REFERENCES pos_customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
