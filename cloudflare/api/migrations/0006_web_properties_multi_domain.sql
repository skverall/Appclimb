-- Multiple Web SaaS products per workspace: one tracking property per domain.
-- Foundation originally enforced UNIQUE(workspace_id), which blocked every
-- second website. Rebuild so uniqueness is (workspace_id, domain).

PRAGMA foreign_keys = OFF;

CREATE TABLE web_properties_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT REFERENCES apps(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  domain TEXT NOT NULL COLLATE NOCASE CHECK (length(domain) BETWEEN 1 AND 253),
  token_version INTEGER NOT NULL DEFAULT 1 CHECK (token_version > 0),
  retention_days INTEGER NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 7 AND 730),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, domain)
);

INSERT INTO web_properties_new (
  id,
  workspace_id,
  app_id,
  name,
  domain,
  token_version,
  retention_days,
  created_at,
  updated_at
)
SELECT
  id,
  workspace_id,
  app_id,
  name,
  domain,
  token_version,
  retention_days,
  created_at,
  updated_at
FROM web_properties;

DROP TABLE web_properties;
ALTER TABLE web_properties_new RENAME TO web_properties;

CREATE INDEX web_properties_workspace_idx
  ON web_properties(workspace_id, created_at);

CREATE INDEX web_properties_app_idx
  ON web_properties(app_id)
  WHERE app_id IS NOT NULL;

PRAGMA foreign_keys = ON;
