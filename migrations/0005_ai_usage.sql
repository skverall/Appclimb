-- Durable per-day assistant message counts (ADR 0004 quotas).
-- The in-isolate rate bucket only smooths bursts; this table is what makes
-- the daily limit hold across Worker isolates and devices.
CREATE TABLE IF NOT EXISTS ai_usage (
  subject TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subject, day)
);
