-- User usage daily statistics tables for MySQL.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS user_usage_daily (
  id INT NOT NULL AUTO_INCREMENT,
  stat_date BIGINT NOT NULL,
  user_id INT NOT NULL,
  username VARCHAR(64) NOT NULL DEFAULT '',
  model_name VARCHAR(255) NOT NULL DEFAULT '',
  request_count BIGINT NOT NULL DEFAULT 0,
  prompt_tokens BIGINT NOT NULL DEFAULT 0,
  completion_tokens BIGINT NOT NULL DEFAULT 0,
  quota BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT DEFAULT NULL,
  updated_at BIGINT DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY idx_user_usage_daily_identity (stat_date, user_id, model_name),
  KEY idx_user_usage_daily_stat_date (stat_date),
  KEY idx_user_usage_daily_user_id (user_id),
  KEY idx_user_usage_daily_username (username),
  KEY idx_user_usage_daily_model_name (model_name)
);

CREATE TABLE IF NOT EXISTS user_usage_daily_syncs (
  id INT NOT NULL AUTO_INCREMENT,
  stat_date BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'synced',
  row_count INT NOT NULL DEFAULT 0,
  message TEXT,
  synced_at BIGINT DEFAULT NULL,
  created_at BIGINT DEFAULT NULL,
  updated_at BIGINT DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY idx_user_usage_daily_syncs_stat_date (stat_date),
  KEY idx_user_usage_daily_syncs_synced_at (synced_at)
);
