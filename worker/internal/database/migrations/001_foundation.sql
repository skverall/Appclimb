create extension if not exists pgcrypto;
create extension if not exists citext;

create type workspace_role as enum ('owner', 'admin', 'member');
create type source_provider as enum (
  'app-store-connect',
  'revenuecat',
  'posthog',
  'superwall',
  'appclimb-rank'
);
create type insight_kind as enum ('Observed', 'Derived', 'Hypothesis');
create type insight_confidence as enum ('high', 'medium', 'low');
create type sync_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed',
  'retrying'
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid not null references users(id) on delete cascade,
  subscription_status text not null default 'trialing',
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  paddle_subscription_id text unique,
  entitlement_ends_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx
  on workspace_members (user_id, workspace_id);

create table refresh_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  user_id uuid not null references users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index refresh_sessions_family_idx
  on refresh_sessions (family_id, created_at);
create index refresh_sessions_expiry_idx
  on refresh_sessions (expires_at);

create table apps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  platform text not null default 'iOS' check (platform = 'iOS'),
  bundle_id text,
  apple_app_id text,
  default_storefront text not null default 'US',
  shared_app_user_id_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, bundle_id)
);
create index apps_workspace_idx on apps (workspace_id, created_at);

create table source_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  app_id uuid references apps(id) on delete cascade,
  provider source_provider not null,
  status text not null default 'connected'
    check (status in ('connected', 'needs-attention', 'revoked')),
  credential_envelope jsonb not null,
  account_label text,
  last_verified_at timestamptz,
  last_synced_at timestamptz,
  next_sync_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);
create index source_connections_due_idx
  on source_connections (next_sync_at, status)
  where status = 'connected';

create table metric_points (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  provider source_provider not null,
  metric_key text not null,
  occurred_at timestamptz not null,
  value numeric not null,
  unit text not null check (unit in ('count', 'currency', 'ratio', 'rank')),
  dimensions jsonb not null default '{}'::jsonb,
  dimensions_hash text generated always as (md5(dimensions::text)) stored,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  freshness_hours numeric not null default 0,
  completeness numeric not null default 1
    check (completeness between 0 and 1),
  unique (
    app_id,
    provider,
    metric_key,
    occurred_at,
    dimensions_hash
  )
);
create index metric_points_growth_map_idx
  on metric_points (app_id, metric_key, occurred_at desc);
create index metric_points_retention_idx
  on metric_points (workspace_id, occurred_at);

create table change_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  provider source_provider,
  event_type text not null check (
    event_type in ('release', 'metadata', 'screenshots', 'price', 'paywall')
  ),
  occurred_at timestamptz not null,
  label text not null,
  detail text,
  external_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (app_id, provider, external_id)
);
create index change_events_replay_idx
  on change_events (app_id, occurred_at desc);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  provider source_provider not null,
  title text not null,
  finding text not null,
  metric_keys text[] not null default '{}',
  window_from timestamptz not null,
  window_to timestamptz not null,
  confidence insight_confidence not null,
  before_value jsonb not null,
  after_value jsonb not null,
  calculation_version text not null,
  created_at timestamptz not null default now(),
  check (window_from < window_to)
);
create index evidence_app_window_idx
  on evidence (app_id, window_to desc);

create table insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  title text not null,
  summary text not null,
  kind insight_kind not null,
  stage_id text not null check (
    stage_id in (
      'discover',
      'store',
      'install',
      'activate',
      'paywall',
      'trial',
      'paid',
      'renew'
    )
  ),
  evidence_ids uuid[] not null default '{}',
  confidence insight_confidence not null,
  impact text not null check (impact in ('high', 'medium', 'low')),
  effort text not null check (effort in ('high', 'medium', 'low')),
  rank smallint not null check (rank between 1 and 3),
  diagnosis_version text not null,
  created_at timestamptz not null default now()
);
create index insights_ranked_idx
  on insights (app_id, created_at desc, rank);

create table action_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  insight_id uuid not null references insights(id) on delete cascade,
  title text not null,
  rationale text not null,
  experiment_template text not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'dismissed')),
  external_mutation_allowed boolean not null default false
    check (external_mutation_allowed = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table experiments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  stage_id text not null,
  title text not null,
  hypothesis text not null,
  primary_metric text not null,
  guardrail_metric text not null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'running', 'completed')),
  provider source_provider not null,
  started_at timestamptz,
  ended_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index experiments_status_idx
  on experiments (app_id, status, created_at desc);

create table sync_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  connection_id uuid not null references source_connections(id) on delete cascade,
  provider source_provider not null,
  status sync_status not null default 'queued',
  window_from timestamptz not null,
  window_to timestamptz not null,
  attempt smallint not null default 0,
  max_attempts smallint not null default 6,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_from < window_to)
);
create index sync_jobs_worker_idx
  on sync_jobs (status, run_after, created_at)
  where status in ('queued', 'retrying');

create table keyword_tracks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  storefront text not null,
  keyword text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (app_id, storefront, keyword)
);
create index keyword_tracks_active_idx
  on keyword_tracks (app_id, storefront)
  where active = true;

create table keyword_rank_points (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  keyword_track_id uuid not null references keyword_tracks(id) on delete cascade,
  observed_on date not null,
  rank integer check (rank > 0),
  created_at timestamptz not null default now(),
  unique (keyword_track_id, observed_on)
);
create index keyword_rank_history_idx
  on keyword_rank_points (app_id, observed_on desc);

create table billing_events (
  id uuid primary key default gen_random_uuid(),
  paddle_event_id text not null unique,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_workspace_idx
  on audit_events (workspace_id, occurred_at desc);

create or replace function current_workspace_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.workspace_id', true), '')::uuid
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'apps',
    'source_connections',
    'metric_points',
    'change_events',
    'evidence',
    'insights',
    'action_proposals',
    'experiments',
    'sync_jobs',
    'keyword_tracks',
    'keyword_rank_points',
    'audit_events'
  ]
  loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format(
      'create policy workspace_scope on %I using (workspace_id = current_workspace_id()) with check (workspace_id = current_workspace_id())',
      table_name
    );
  end loop;
end
$$;
