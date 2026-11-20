-- Cloudflare D1: central, shared product changes and lifecycle.
-- Apply in the D1 SQL editor BEFORE deploying the frontend that requires this API.
CREATE TABLE IF NOT EXISTS product_changes (
  id TEXT PRIMARY KEY,
  barcode TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS product_changes_barcode
  ON product_changes(barcode) WHERE barcode <> '';
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  action TEXT NOT NULL,
  happened_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS product_audit_product
  ON product_audit(product_id, happened_at);
