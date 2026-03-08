-- Minker Calendar: Local Test Database Bootstrap
-- Run this entire script in MySQL Workbench.

-- 1) Create and select local test database
CREATE DATABASE IF NOT EXISTS minker_calendar_test
	CHARACTER SET utf8mb4
	COLLATE utf8mb4_unicode_ci;

USE minker_calendar_test;

-- 2) Core table for all-day events only
CREATE TABLE IF NOT EXISTS users (
	user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	username VARCHAR(60) NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (user_id),
	UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_tokens (
	token_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	user_id BIGINT UNSIGNED NOT NULL,
	token VARCHAR(128) NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	expires_at DATETIME NOT NULL,
	PRIMARY KEY (token_id),
	UNIQUE KEY uq_auth_tokens_token (token),
	KEY idx_auth_tokens_user_id (user_id),
	KEY idx_auth_tokens_expires_at (expires_at),
	CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS calendar_events (
	event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	user_id BIGINT UNSIGNED NOT NULL,
	title VARCHAR(200) NOT NULL,
	start_date DATE NOT NULL,
	end_date DATE NOT NULL,
	description TEXT NULL,
	color_hex CHAR(7) NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (event_id),
	KEY idx_calendar_events_user_id (user_id),
	CONSTRAINT fk_calendar_events_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
	CONSTRAINT chk_event_date_range CHECK (end_date >= start_date)
) ENGINE=InnoDB;

-- 3) Migration-safe schema upgrades for existing databases
-- This block is compatible with older MySQL versions where
-- `ADD COLUMN IF NOT EXISTS` is not supported.

-- add user_id only if it does not exist
SET @has_user_id := (
	SELECT COUNT(*)
	FROM information_schema.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
	  AND TABLE_NAME = 'calendar_events'
	  AND COLUMN_NAME = 'user_id'
);
SET @sql_user_id := IF(
	@has_user_id = 0,
	'ALTER TABLE calendar_events ADD COLUMN user_id BIGINT UNSIGNED NULL',
	'SELECT 1'
);
PREPARE stmt_user_id FROM @sql_user_id;
EXECUTE stmt_user_id;
DEALLOCATE PREPARE stmt_user_id;

-- add indexes only if missing
SET @idx_start_exists := (
	SELECT COUNT(*)
	FROM information_schema.STATISTICS
	WHERE TABLE_SCHEMA = DATABASE()
	  AND TABLE_NAME = 'calendar_events'
	  AND INDEX_NAME = 'idx_calendar_events_start_date'
);
SET @sql_idx_start := IF(
	@idx_start_exists = 0,
	'CREATE INDEX idx_calendar_events_start_date ON calendar_events (start_date)',
	'SELECT 1'
);
PREPARE stmt_idx_start FROM @sql_idx_start;
EXECUTE stmt_idx_start;
DEALLOCATE PREPARE stmt_idx_start;

SET @idx_end_exists := (
	SELECT COUNT(*)
	FROM information_schema.STATISTICS
	WHERE TABLE_SCHEMA = DATABASE()
	  AND TABLE_NAME = 'calendar_events'
	  AND INDEX_NAME = 'idx_calendar_events_end_date'
);
SET @sql_idx_end := IF(
	@idx_end_exists = 0,
	'CREATE INDEX idx_calendar_events_end_date ON calendar_events (end_date)',
	'SELECT 1'
);
PREPARE stmt_idx_end FROM @sql_idx_end;
EXECUTE stmt_idx_end;
DEALLOCATE PREPARE stmt_idx_end;

SET @idx_span_exists := (
	SELECT COUNT(*)
	FROM information_schema.STATISTICS
	WHERE TABLE_SCHEMA = DATABASE()
	  AND TABLE_NAME = 'calendar_events'
	  AND INDEX_NAME = 'idx_calendar_events_date_span'
);
SET @sql_idx_span := IF(
	@idx_span_exists = 0,
	'CREATE INDEX idx_calendar_events_date_span ON calendar_events (start_date, end_date)',
	'SELECT 1'
);
PREPARE stmt_idx_span FROM @sql_idx_span;
EXECUTE stmt_idx_span;
DEALLOCATE PREPARE stmt_idx_span;

-- add foreign key only if missing
SET @fk_exists := (
	SELECT COUNT(*)
	FROM information_schema.TABLE_CONSTRAINTS
	WHERE TABLE_SCHEMA = DATABASE()
	  AND TABLE_NAME = 'calendar_events'
	  AND CONSTRAINT_NAME = 'fk_calendar_events_user'
	  AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_fk := IF(
	@fk_exists = 0,
	'ALTER TABLE calendar_events ADD CONSTRAINT fk_calendar_events_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE',
	'SELECT 1'
);
PREPARE stmt_fk FROM @sql_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;

-- 4) Optional migration support for already-existing DBs
-- If your current table was created without user support, run these safely:

-- Note: assigning old rows to users is a manual step after you create users.
-- Example:
-- UPDATE calendar_events SET user_id = 1 WHERE user_id IS NULL;

-- Once all rows have user_id values, enforce NOT NULL + FK with:
-- ALTER TABLE calendar_events MODIFY user_id BIGINT UNSIGNED NOT NULL;
-- ALTER TABLE calendar_events
--   ADD CONSTRAINT fk_calendar_events_user
--   FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

-- 5) Optional: dedicated local app user
-- Uncomment if you want a separate DB user for the app.
-- CREATE USER IF NOT EXISTS 'minker_app'@'localhost' IDENTIFIED BY 'Init.1234';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON minker_calendar_test.* TO 'minker_app'@'localhost';
-- FLUSH PRIVILEGES;

-- 6) Quick verification query
SELECT event_id, user_id, title, start_date, end_date, created_at
FROM calendar_events
ORDER BY start_date, event_id;
