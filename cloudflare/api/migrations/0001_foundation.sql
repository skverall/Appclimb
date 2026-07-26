PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_key TEXT NOT NULL DEFAULT 'ridge'
    CHECK (avatar_key IN ('ridge','river','summit','forest','dawn','glacier','night','horizon')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_status TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at TEXT NOT NULL,
  paddle_subscription_id TEXT UNIQUE,
  entitlement_ends_at TEXT,
  deletion_requested_at TEXT,
  paddle_customer_id TEXT,
  paddle_transaction_id TEXT,
  paddle_product_id TEXT,
  paddle_price_id TEXT,
  paddle_last_event_occurred_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX workspaces_paddle_customer_id_idx ON workspaces(paddle_customer_id)
  WHERE paddle_customer_id IS NOT NULL;
CREATE UNIQUE INDEX workspaces_paddle_transaction_id_idx ON workspaces(paddle_transaction_id)
  WHERE paddle_transaction_id IS NOT NULL;

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON workspace_members(user_id, workspace_id);

CREATE TABLE refresh_sessions (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash BLOB NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  rotated_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX refresh_sessions_family_idx ON refresh_sessions(family_id, created_at);
CREATE INDEX refresh_sessions_expiry_idx ON refresh_sessions(expires_at);

CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  platform TEXT NOT NULL DEFAULT 'iOS' CHECK (platform = 'iOS'),
  bundle_id TEXT,
  apple_app_id TEXT,
  default_storefront TEXT NOT NULL DEFAULT 'US',
  shared_app_user_id_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, bundle_id)
);
CREATE INDEX apps_workspace_idx ON apps(workspace_id, created_at);

CREATE TABLE source_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT REFERENCES apps(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('app-store-connect','revenuecat','posthog','superwall','appclimb-rank')),
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','needs-attention','revoked')),
  credential_envelope TEXT NOT NULL,
  account_label TEXT,
  last_verified_at TEXT,
  last_synced_at TEXT,
  next_sync_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, provider)
);
CREATE INDEX source_connections_due_idx ON source_connections(next_sync_at, status)
  WHERE status = 'connected';

CREATE TABLE metric_points (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('count','currency','ratio','rank','range_count','range_ratio')),
  dimensions TEXT NOT NULL DEFAULT '{}',
  dimensions_hash TEXT NOT NULL,
  source_updated_at TEXT,
  imported_at TEXT NOT NULL,
  freshness_hours REAL NOT NULL DEFAULT 0,
  completeness REAL NOT NULL DEFAULT 1 CHECK (completeness BETWEEN 0 AND 1),
  UNIQUE (app_id, provider, metric_key, occurred_at, dimensions_hash)
);
CREATE INDEX metric_points_growth_map_idx ON metric_points(app_id, metric_key, occurred_at DESC);
CREATE INDEX metric_points_retention_idx ON metric_points(workspace_id, occurred_at);

CREATE TABLE change_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  provider TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('release','metadata','screenshots','price','paywall')),
  occurred_at TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  external_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (app_id, provider, external_id)
);
CREATE INDEX change_events_replay_idx ON change_events(app_id, occurred_at DESC);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  title TEXT NOT NULL,
  finding TEXT NOT NULL,
  metric_keys TEXT NOT NULL DEFAULT '[]',
  window_from TEXT NOT NULL,
  window_to TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  before_value TEXT NOT NULL,
  after_value TEXT NOT NULL,
  calculation_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (window_from < window_to)
);
CREATE INDEX evidence_app_window_idx ON evidence(app_id, window_to DESC);

CREATE TABLE insights (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('Observed','Derived','Hypothesis')),
  stage_id TEXT NOT NULL CHECK (stage_id IN ('discover','store','install','activate','paywall','trial','paid','renew')),
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  impact TEXT NOT NULL CHECK (impact IN ('high','medium','low')),
  effort TEXT NOT NULL CHECK (effort IN ('high','medium','low')),
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 3),
  diagnosis_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX insights_ranked_idx ON insights(app_id, created_at DESC, rank);

CREATE TABLE action_proposals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  insight_id TEXT NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  experiment_template TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','dismissed')),
  external_mutation_allowed INTEGER NOT NULL DEFAULT 0 CHECK (external_mutation_allowed = 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE experiments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  primary_metric TEXT NOT NULL,
  guardrail_metric TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','running','completed')),
  provider TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX experiments_status_idx ON experiments(app_id, status, created_at DESC);

CREATE TABLE sync_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES source_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','retrying')),
  window_from TEXT NOT NULL,
  window_to TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  run_after TEXT NOT NULL,
  locked_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (window_from < window_to)
);
CREATE INDEX sync_jobs_worker_idx ON sync_jobs(status, run_after, created_at)
  WHERE status IN ('queued','retrying');
CREATE UNIQUE INDEX sync_jobs_one_outstanding_per_connection_idx ON sync_jobs(connection_id)
  WHERE status IN ('queued','running','retrying');

CREATE TABLE diagnosis_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','retrying')),
  diagnosis_version TEXT,
  input_hash TEXT,
  insight_count INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  run_after TEXT NOT NULL,
  locked_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX diagnosis_runs_worker_idx ON diagnosis_runs(status, run_after, created_at)
  WHERE status IN ('queued','retrying');
CREATE UNIQUE INDEX diagnosis_runs_one_outstanding_per_app_idx ON diagnosis_runs(app_id)
  WHERE status IN ('queued','running','retrying');

CREATE TABLE keyword_tracks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  storefront TEXT NOT NULL,
  keyword TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (app_id, storefront, keyword)
);

CREATE TABLE keyword_rank_points (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  keyword_track_id TEXT NOT NULL REFERENCES keyword_tracks(id) ON DELETE CASCADE,
  observed_on TEXT NOT NULL,
  rank INTEGER CHECK (rank > 0),
  created_at TEXT NOT NULL,
  UNIQUE (keyword_track_id, observed_on)
);

CREATE TABLE billing_events (
  id TEXT PRIMARY KEY,
  paddle_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','applied','ignored','reconciliation_required')),
  processing_reason TEXT
);

CREATE TABLE paddle_checkout_bindings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash BLOB NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  price_id TEXT NOT NULL,
  expected_subscription_id TEXT,
  expected_customer_id TEXT,
  expected_transaction_id TEXT,
  expected_status TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_by_event_id TEXT,
  superseded_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (expires_at > created_at),
  CHECK (NOT (consumed_at IS NOT NULL AND superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX paddle_checkout_bindings_one_pending_idx ON paddle_checkout_bindings(workspace_id)
  WHERE consumed_at IS NULL AND superseded_at IS NULL;

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL
);

CREATE TABLE web_properties (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT REFERENCES apps(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  domain TEXT NOT NULL COLLATE NOCASE CHECK (length(domain) BETWEEN 1 AND 253),
  token_version INTEGER NOT NULL DEFAULT 1 CHECK (token_version > 0),
  retention_days INTEGER NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 7 AND 730),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id)
);

CREATE TABLE web_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES web_properties(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('page_view','engagement','conversion')),
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  hostname TEXT NOT NULL COLLATE NOCASE,
  path TEXT NOT NULL,
  referrer_host TEXT COLLATE NOCASE,
  source TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('Direct','Organic Search','Social','AI Referral','Campaigns','Referral')),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  country_code TEXT,
  browser TEXT NOT NULL,
  operating_system TEXT NOT NULL,
  device TEXT NOT NULL,
  duration_ms INTEGER,
  goal TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (property_id, event_id)
);
CREATE INDEX web_events_property_time_idx ON web_events(property_id, occurred_at DESC);
CREATE INDEX web_events_session_idx ON web_events(property_id, session_id, occurred_at);
CREATE INDEX web_events_visitor_idx ON web_events(property_id, visitor_id, occurred_at DESC);

CREATE TABLE web_crawler_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES web_properties(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  hostname TEXT NOT NULL COLLATE NOCASE,
  path TEXT NOT NULL,
  provider TEXT NOT NULL,
  agent TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('ai_answer','search_index','model_training','other')),
  detection_method TEXT NOT NULL DEFAULT 'user_agent' CHECK (detection_method IN ('user_agent','verified_ip')),
  country_code TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (property_id, event_id)
);
CREATE INDEX web_crawler_events_property_time_idx ON web_crawler_events(property_id, occurred_at DESC);
CREATE INDEX web_crawler_events_provider_idx ON web_crawler_events(property_id, provider, occurred_at DESC);

CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash BLOB NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX password_reset_tokens_active_idx ON password_reset_tokens(user_id, expires_at DESC)
  WHERE used_at IS NULL;

CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
INSERT INTO schema_migrations(version, applied_at) VALUES ('0001_foundation.sql', datetime('now'));
