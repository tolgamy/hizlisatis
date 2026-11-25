-- MariaDB: önce yedek alın.
CREATE TABLE IF NOT EXISTS pos_auth_throttle (
 bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 retry_at BIGINT UNSIGNED NOT NULL DEFAULT 0,
 touched_at BIGINT UNSIGNED NOT NULL,
 INDEX throttle_touched(touched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE pos_screen_sessions ADD COLUMN IF NOT EXISTS pin_verified TINYINT UNSIGNED NOT NULL DEFAULT 0;
