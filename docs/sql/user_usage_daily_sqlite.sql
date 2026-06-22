-- User usage daily statistics tables for SQLite.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS user_usage_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date BIGINT NOT NULL,
  user_id INTEGER NOT NULL,
  username VARCHAR(64) NOT NULL DEFAULT '',
  model_name VARCHAR(255) NOT NULL DEFAULT '',
  request_count BIGINT NOT NULL DEFAULT 0,
  prompt_tokens BIGINT NOT NULL DEFAULT 0,
  completion_tokens BIGINT NOT NULL DEFAULT 0,
  quota BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT,
  updated_at BIGINT,
  CONSTRAINT idx_user_usage_daily_identity UNIQUE (stat_date, user_id, model_name)
);

CREATE INDEX IF NOT EXISTS idx_user_usage_daily_stat_date ON user_usage_daily (stat_date);
CREATE INDEX IF NOT EXISTS idx_user_usage_daily_user_id ON user_usage_daily (user_id);
CREATE INDEX IF NOT EXISTS idx_user_usage_daily_username ON user_usage_daily (username);
CREATE INDEX IF NOT EXISTS idx_user_usage_daily_model_name ON user_usage_daily (model_name);

CREATE TABLE IF NOT EXISTS user_usage_daily_syncs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date BIGINT NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'synced',
  row_count INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  synced_at BIGINT,
  created_at BIGINT,
  updated_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_user_usage_daily_syncs_synced_at ON user_usage_daily_syncs (synced_at);
