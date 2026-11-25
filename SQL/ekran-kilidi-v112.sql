-- Önce veritabanı yedeği alın. MariaDB, mevcut HızlıSatış veritabanı.
-- Sadece üç yeni tablo; mevcut veriler değişmez.
CREATE TABLE IF NOT EXISTS pos_screen_pin (
 id TINYINT UNSIGNED PRIMARY KEY, salt CHAR(48) CHARACTER SET ascii NOT NULL,
 pin_hash CHAR(64) CHARACTER SET ascii NOT NULL, changed_at BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pos_screen_sessions (
 session_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL, last_activity BIGINT UNSIGNED NOT NULL,
 is_locked TINYINT UNSIGNED NOT NULL DEFAULT 0, attempts INT UNSIGNED NOT NULL DEFAULT 0,
 retry_at BIGINT UNSIGNED NOT NULL DEFAULT 0, expires_at BIGINT UNSIGNED NOT NULL,
 INDEX screen_expires(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pos_screen_audit (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, session_key CHAR(64) CHARACTER SET ascii NOT NULL,
 user_id VARCHAR(64) NOT NULL, event_type VARCHAR(32) NOT NULL, happened_at BIGINT UNSIGNED NOT NULL,
 INDEX screen_audit_time(happened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
