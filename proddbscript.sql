-- Minker Calendar production schema
-- Run this in phpMyAdmin AFTER selecting the target database in Plesk.
-- Do not include CREATE DATABASE / USE to avoid Plesk ownership conflicts.

SET NAMES utf8mb4;

-- Users for app login
CREATE TABLE IF NOT EXISTS users (
	user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	username VARCHAR(60) NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	email VARCHAR(255) NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (user_id),
	UNIQUE KEY uq_users_username (username),
	UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bearer tokens (server-side sessions)
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
	CONSTRAINT fk_auth_tokens_user
		FOREIGN KEY (user_id) REFERENCES users(user_id)
		ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- All-day calendar events (end_date is inclusive)
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
	KEY idx_calendar_events_start_date (start_date),
	KEY idx_calendar_events_end_date (end_date),
	KEY idx_calendar_events_date_span (start_date, end_date),
	CONSTRAINT fk_calendar_events_user
		FOREIGN KEY (user_id) REFERENCES users(user_id)
		ON DELETE CASCADE,
	CONSTRAINT chk_event_date_range CHECK (end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_email_codes (
	code_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	user_id BIGINT UNSIGNED NOT NULL,
	email VARCHAR(255) NOT NULL,
	purpose VARCHAR(40) NOT NULL,
	code_hash CHAR(64) NOT NULL,
	attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
	max_attempts INT UNSIGNED NOT NULL DEFAULT 5,
	expires_at DATETIME NOT NULL,
	used_at DATETIME NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (code_id),
	KEY idx_auth_email_codes_user_id (user_id),
	KEY idx_auth_email_codes_lookup (user_id, email, purpose, expires_at),
	CONSTRAINT fk_auth_email_codes_user
		FOREIGN KEY (user_id) REFERENCES users(user_id)
		ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional cleanup helper for expired sessions
-- DELETE FROM auth_tokens WHERE expires_at <= UTC_TIMESTAMP();

-- Quick verification
SHOW TABLES;
