-- Migration 0013: Growth CI core tables
--
-- Additive only. Preserves existing users, billing, source credentials, and
-- legacy product tables. New objects power release evaluation, one open growth
-- incident per app, and the Agent Bridge task lifecycle.

-- ---------------------------------------------------------------------------
-- Growth Contract defaults (server-owned, versioned per app)
-- ---------------------------------------------------------------------------
CREATE TABLE growth_contracts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 1,
  contract_version TEXT NOT NULL DEFAULT '1.0.0',
  session_event TEXT NOT NULL DEFAULT '',
  activation_event TEXT NOT NULL DEFAULT '',
  version_property TEXT NOT NULL DEFAULT '',
  build_property TEXT NOT NULL DEFAULT '',
  version_property_status TEXT NOT NULL DEFAULT 'unconfirmed'
    CHECK (version_property_status IN (
      'unconfirmed','confirmed','missing','invalid'
    )),
  version_property_confirmed_at TEXT,
  first_observed_version TEXT,
  last_observed_version TEXT,
  activation_window_days INTEGER NOT NULL DEFAULT 7,
  minimum_new_users INTEGER NOT NULL DEFAULT 30,
  maximum_collection_days INTEGER NOT NULL DEFAULT 21,
  minimum_complete_days INTEGER NOT NULL DEFAULT 3,
  regression_absolute_drop REAL NOT NULL DEFAULT 0.03,
  regression_relative_drop REAL NOT NULL DEFAULT 0.12,
  regression_p_value REAL NOT NULL DEFAULT 0.05,
  improvement_absolute_gain REAL NOT NULL DEFAULT 0.03,
  improvement_relative_gain REAL NOT NULL DEFAULT 0.12,
  improvement_p_value REAL NOT NULL DEFAULT 0.05,
  guardrail_trial_to_paid_max_relative_drop REAL NOT NULL DEFAULT 0.15,
  guardrail_renewal_rate_max_relative_drop REAL NOT NULL DEFAULT 0.15,
  free_verdict_consumed_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(app_id)
);

CREATE INDEX growth_contracts_workspace_idx
  ON growth_contracts(workspace_id, app_id);

-- Extend PostHog mapping with version/build property readiness.
ALTER TABLE posthog_mappings ADD COLUMN version_property TEXT NOT NULL DEFAULT '';
ALTER TABLE posthog_mappings ADD COLUMN build_property TEXT NOT NULL DEFAULT '';
ALTER TABLE posthog_mappings ADD COLUMN version_property_status TEXT NOT NULL DEFAULT 'unconfirmed';
ALTER TABLE posthog_mappings ADD COLUMN version_property_confirmed_at TEXT;
ALTER TABLE posthog_mappings ADD COLUMN first_observed_version TEXT;
ALTER TABLE posthog_mappings ADD COLUMN last_observed_version TEXT;
ALTER TABLE posthog_mappings ADD COLUMN version_candidates TEXT NOT NULL DEFAULT '[]';

-- ---------------------------------------------------------------------------
-- Releases
-- ---------------------------------------------------------------------------
CREATE TABLE app_releases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  build_number TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK(source IN ('agent','posthog','manual')),
  source_trust TEXT NOT NULL CHECK(source_trust IN (
    'verified_connector','signed_agent_observation','user_assertion'
  )),
  status TEXT NOT NULL CHECK(status IN (
    'observed','collecting','evaluated','superseded'
  )),
  first_seen_at TEXT NOT NULL,
  reported_deployed_at TEXT,
  previous_release_id TEXT REFERENCES app_releases(id) ON DELETE SET NULL,
  commit_sha TEXT,
  previous_commit_sha TEXT,
  pull_request_url TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(app_id, version, build_number)
);

CREATE INDEX app_releases_workspace_app_seen_idx
  ON app_releases(workspace_id, app_id, first_seen_at DESC);

-- ---------------------------------------------------------------------------
-- Release checks
-- ---------------------------------------------------------------------------
CREATE TABLE release_checks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  release_id TEXT NOT NULL REFERENCES app_releases(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN (
    'queued','running','collecting','succeeded','failed'
  )),
  verdict TEXT NOT NULL CHECK(verdict IN (
    'collecting','healthy','improvement','regression',
    'inconclusive','configuration_required','failed'
  )),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  locked_at TEXT,
  run_after TEXT NOT NULL,
  input_hash TEXT,
  contract_version TEXT NOT NULL,
  primary_metric_key TEXT,
  baseline_method TEXT,
  baseline_release_id TEXT REFERENCES app_releases(id) ON DELETE SET NULL,
  baseline_value REAL,
  current_value REAL,
  absolute_change REAL,
  relative_change REAL,
  baseline_sample INTEGER,
  current_sample INTEGER,
  p_value REAL,
  confidence_score INTEGER NOT NULL DEFAULT 0,
  confidence_level TEXT NOT NULL DEFAULT 'low',
  baseline_window_from TEXT,
  baseline_window_to TEXT,
  current_window_from TEXT,
  current_window_to TEXT,
  evidence TEXT NOT NULL DEFAULT '[]',
  supporting_signals TEXT NOT NULL DEFAULT '[]',
  limitations TEXT NOT NULL DEFAULT '[]',
  missing_requirements TEXT NOT NULL DEFAULT '[]',
  error_code TEXT,
  next_check_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX release_checks_due_idx
  ON release_checks(status, run_after);
CREATE INDEX release_checks_release_created_idx
  ON release_checks(release_id, created_at DESC);
CREATE UNIQUE INDEX release_checks_release_input_idx
  ON release_checks(release_id, input_hash)
  WHERE input_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Growth incidents (one open per app)
-- ---------------------------------------------------------------------------
CREATE TABLE growth_incidents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  origin_release_id TEXT NOT NULL REFERENCES app_releases(id) ON DELETE CASCADE,
  origin_check_id TEXT NOT NULL REFERENCES release_checks(id) ON DELETE CASCADE,
  fix_release_id TEXT REFERENCES app_releases(id) ON DELETE SET NULL,
  verification_check_id TEXT REFERENCES release_checks(id) ON DELETE SET NULL,
  stage_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('watch','important','critical')),
  status TEXT NOT NULL CHECK(status IN (
    'open','in_progress','awaiting_verification','closed'
  )),
  outcome TEXT CHECK(outcome IN (
    'resolved','partial','no_effect','worsened','dismissed','inconclusive'
  )),
  primary_metric_key TEXT NOT NULL,
  confidence_score INTEGER NOT NULL,
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  action_plan TEXT NOT NULL,
  verification_contract TEXT NOT NULL,
  learning_record TEXT,
  dismissal_reason TEXT,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX growth_incidents_one_open_per_app_idx
  ON growth_incidents(app_id)
  WHERE status IN ('open','in_progress','awaiting_verification');

CREATE INDEX growth_incidents_workspace_app_idx
  ON growth_incidents(workspace_id, app_id, opened_at DESC);

-- ---------------------------------------------------------------------------
-- Agent Bridge
-- ---------------------------------------------------------------------------
CREATE TABLE agent_tokens (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT,
  last_used_at TEXT,
  revoked_at TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(token_prefix)
);

CREATE INDEX agent_tokens_workspace_app_idx
  ON agent_tokens(workspace_id, app_id, created_at DESC);

CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  incident_id TEXT NOT NULL REFERENCES growth_incidents(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN (
    'available','claimed','submitted','deployed','closed','canceled'
  )),
  task_packet TEXT NOT NULL,
  claimed_by TEXT,
  claimed_token_id TEXT REFERENCES agent_tokens(id) ON DELETE SET NULL,
  claimed_at TEXT,
  claim_expires_at TEXT,
  branch_name TEXT,
  commit_sha TEXT,
  pull_request_url TEXT,
  fix_release_id TEXT REFERENCES app_releases(id) ON DELETE SET NULL,
  submitted_at TEXT,
  deployed_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(incident_id)
);

CREATE INDEX agent_tasks_next_idx
  ON agent_tasks(app_id, status, created_at);

CREATE TABLE agent_task_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('agent','user','system')),
  actor_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(task_id, idempotency_key)
);

CREATE INDEX agent_task_events_task_idx
  ON agent_task_events(task_id, created_at DESC);

-- Optional soft links from legacy experiments (nullable; no dual source of truth)
ALTER TABLE experiments ADD COLUMN growth_incident_id TEXT;
ALTER TABLE experiments ADD COLUMN origin_release_id TEXT;
ALTER TABLE experiments ADD COLUMN agent_task_id TEXT;

INSERT INTO schema_migrations(version, applied_at)
VALUES ('0013_growth_ci.sql', datetime('now'));
