-- Migration number: 0004
-- Apple's weekly published App Store search terms (Apple Ads Insights).
-- One storefront-week is ~7,500 terms (15 genres x 500), stored as one
-- compact JSON chunk per genre. See src/lib/search-terms-store.ts.

CREATE TABLE IF NOT EXISTS search_term_weeks (
  country TEXT NOT NULL,             -- storefront, e.g. 'US'
  week TEXT NOT NULL,                -- Sunday that starts the Apple week, 'YYYY-MM-DD'
  status TEXT NOT NULL,              -- 'ready' | 'empty' (Apple has not published it yet)
  term_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL,          -- ISO-8601 UTC
  PRIMARY KEY (country, week)
);

CREATE TABLE IF NOT EXISTS search_term_chunks (
  country TEXT NOT NULL,
  week TEXT NOT NULL,
  genre TEXT NOT NULL,               -- Apple Ads genre token, e.g. 'HEALTH_FITNESS'
  payload TEXT NOT NULL,             -- JSON [[term, popularity, inGenre, 1to5, rankInGenre], ...]
  PRIMARY KEY (country, week, genre)
);

CREATE TABLE IF NOT EXISTS search_term_history (
  country TEXT NOT NULL,
  term TEXT NOT NULL,                -- lowercased search term
  through_week TEXT NOT NULL,        -- latest week the payload covers
  payload TEXT NOT NULL,             -- JSON [[week, popularity], ...] oldest first; [] = never published
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (country, term)
);
