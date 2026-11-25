-- MariaDB: önce yedek alın.
CREATE TABLE IF NOT EXISTS pos_auth_throttle (
 bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 retry_at BIGINT UNSIGNED NOT NULL DEFAULT 0,
 touched_at BIGINT UNSIGNED NOT NULL,
 INDEX throttle_touched(touched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE pos_screen_sessions ADD COLUMN IF NOT EXISTS pin_verified TINYINT UNSIGNED NOT NULL DEFAULT 0;
-- Only mark sessions previously verified by PIN, preserving existing retry counters.
UPDATE pos_screen_sessions s
SET s.pin_verified=1
WHERE s.pin_verified=0 AND (s.is_locked=0 OR EXISTS (
 SELECT 1 FROM pos_screen_audit a WHERE a.session_key=s.session_key AND a.event_type='unlocked'
));
