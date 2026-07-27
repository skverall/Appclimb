-- Allow Web SaaS apps alongside iOS. SQLite cannot alter CHECK constraints
-- in place, so rebuild the apps table while preserving all rows and FKs.

PRAGMA foreign_keys = OFF;

CREATE TABLE apps_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  platform TEXT NOT NULL DEFAULT 'iOS' CHECK (platform IN ('iOS', 'Web')),
  bundle_id TEXT,
  apple_app_id TEXT,
  default_storefront TEXT NOT NULL DEFAULT 'US',
  shared_app_user_id_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  icon_url TEXT,
  UNIQUE (workspace_id, bundle_id)
);

INSERT INTO apps_new (
  id,
  workspace_id,
  name,
  platform,
  bundle_id,
  apple_app_id,
  default_storefront,
  shared_app_user_id_confirmed,
  created_at,
  updated_at,
  icon_url
)
SELECT
  id,
  workspace_id,
  name,
  platform,
  bundle_id,
  apple_app_id,
  default_storefront,
  shared_app_user_id_confirmed,
  created_at,
  updated_at,
  icon_url
FROM apps;

DROP TABLE apps;
ALTER TABLE apps_new RENAME TO apps;

CREATE INDEX apps_workspace_idx ON apps(workspace_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS apps_workspace_apple_app_idx
  ON apps(workspace_id, apple_app_id)
  WHERE apple_app_id IS NOT NULL;

PRAGMA foreign_keys = ON;
