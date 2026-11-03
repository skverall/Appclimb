-- Migration number: 0007
-- Agent access (ADR 0008): the OAuth 2.1 authorization server behind the
-- remote MCP endpoint at /mcp, personal API keys for headless agents, and a
-- durable daily counter for agent keyword checks.
-- Every token and code is stored only as a SHA-256 hash.

-- Clients registered dynamically (RFC 7591) or resolved from a Client ID
-- Metadata Document (client_id is then the document's HTTPS URL).
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT,
  redirect_uris TEXT NOT NULL,
  metadata_url INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- An authorization request waiting for sign-in and consent.
CREATE TABLE IF NOT EXISTS oauth_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  state TEXT,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

-- One row per grant. kind = 'oauth' (access + rotating refresh token) or
-- 'api_key' (a long-lived personal key created on /connect).
CREATE TABLE IF NOT EXISTS agent_tokens (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT,
  label TEXT,
  access_hash TEXT NOT NULL UNIQUE,
  refresh_hash TEXT UNIQUE,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  access_expires_at TEXT,
  refresh_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_user ON agent_tokens(user_id);

-- Keyword checks agents run against the App Store, per user per UTC day.
CREATE TABLE IF NOT EXISTS agent_usage (
  subject TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subject, day)
);
