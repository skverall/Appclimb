-- Migration number: 0002
-- AppClimb privacy-first real-time analytics (ADR 0005)

CREATE TABLE IF NOT EXISTS analytics_pageviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                  -- 'YYYY-MM-DD'
  timestamp INTEGER NOT NULL,          -- Unix epoch in seconds
  visitor_hash TEXT NOT NULL,          -- 16-char daily rotating visitor hash
  path TEXT NOT NULL,                  -- e.g. '/', '/pricing'
  country TEXT NOT NULL,               -- e.g. 'US', 'DE', 'RU'
  referrer TEXT NOT NULL,              -- e.g. 'google.com', 'direct', 'x.com'
  device TEXT NOT NULL,                -- 'desktop', 'mobile', 'tablet'
  browser TEXT NOT NULL                -- 'chrome', 'safari', 'firefox', 'other'
);

CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_pageviews(date);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics_pageviews(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_date_visitor ON analytics_pageviews(date, visitor_hash);
CREATE INDEX IF NOT EXISTS idx_analytics_date_country ON analytics_pageviews(date, country);
CREATE INDEX IF NOT EXISTS idx_analytics_date_path ON analytics_pageviews(date, path);
CREATE INDEX IF NOT EXISTS idx_analytics_date_referrer ON analytics_pageviews(date, referrer);
