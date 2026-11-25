-- v125 additive migration. Verified backup first. Never drops/updates existing rows.
CREATE TABLE IF NOT EXISTS pos_approval_requests (
 id CHAR(36) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
 requester_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
 kind VARCHAR(30) NOT NULL,
 target VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending',
 pending_key VARCHAR(220) COLLATE utf8mb4_bin NULL UNIQUE,
 created_at VARCHAR(40) NOT NULL,
 reviewer_id VARCHAR(64) COLLATE utf8mb4_bin NULL,
 reviewed_at VARCHAR(40) NULL,
 note VARCHAR(250) NOT NULL DEFAULT '',
 INDEX approval_requester (requester_id,created_at),
 INDEX approval_status (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
