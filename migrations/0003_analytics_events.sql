-- Migration number: 0003
-- Product events (signup funnel intents) on the same privacy-first model as
-- analytics_pageviews: no IPs, no emails, daily-rotating visitor hash.

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                  -- 'YYYY-MM-DD'
  timestamp INTEGER NOT NULL,          -- Unix epoch in seconds
  visitor_hash TEXT NOT NULL,          -- same daily rotating hash as pageviews
  name TEXT NOT NULL,                  -- whitelist from src/lib/analytics.ts
  path TEXT NOT NULL,                  -- page the event fired on
  country TEXT NOT NULL,               -- e.g. 'US'
  device TEXT NOT NULL,                -- 'desktop', 'mobile', 'tablet'
  meta TEXT NOT NULL DEFAULT '{}'      -- small JSON, e.g. {"intent":"track"}
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_date_name ON analytics_events(date, name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_ts ON analytics_events(name, timestamp);
