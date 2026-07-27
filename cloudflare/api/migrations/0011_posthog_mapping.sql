-- Migration 0011: PostHog mapping lifecycle and first-data tracking
--
-- Task P0.19 requires the auto-map to stop being invisible magic: the chosen
-- events, how confident AppClimb is, and whether a human confirmed them all
-- have to survive a reload. Task P0.17 requires knowing exactly when a source
-- delivered its first real metric so readiness and the audit log agree.

CREATE TABLE posthog_mappings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES source_connections(id) ON DELETE CASCADE,
  app_id TEXT REFERENCES apps(id) ON DELETE SET NULL,
  project_id TEXT NOT NULL DEFAULT '',
  project_label TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'automatic' CHECK (mode IN ('automatic','manual')),
  status TEXT NOT NULL DEFAULT 'automatic_unconfirmed'
    CHECK (status IN ('automatic_unconfirmed','confirmed','insufficient_events','invalid')),
  confidence REAL NOT NULL DEFAULT 0,
  session_event TEXT NOT NULL DEFAULT '',
  activation_event TEXT NOT NULL DEFAULT '',
  milestone_events TEXT NOT NULL DEFAULT '[]',
  detected_event_count INTEGER NOT NULL DEFAULT 0,
  activation_window_days INTEGER NOT NULL DEFAULT 7,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, connection_id)
);

CREATE INDEX posthog_mappings_workspace_idx
  ON posthog_mappings(workspace_id, status);

-- First accepted real metric per connection. NULL means "no data has ever
-- arrived", which is not the same as zero.
ALTER TABLE source_connections ADD COLUMN first_data_at TEXT;

INSERT INTO schema_migrations(version, applied_at)
VALUES ('0011_posthog_mapping.sql', datetime('now'));
