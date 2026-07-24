-- Diagnosis runs coordinate the deterministic generator that turns synced
-- metric_points into evidence, insights and action proposals.
--
-- Mirrors sync_jobs in spirit but is bound to apps (a diagnosis is per-app, not
-- per source connection) and carries an input_hash so the worker can skip
-- recomputation when the underlying metrics have not changed since the last
-- successful run.

create table diagnosis_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  status sync_status not null default 'queued',
  diagnosis_version text,
  input_hash text,
  insight_count int not null default 0,
  evidence_count int not null default 0,
  attempt smallint not null default 0,
  max_attempts smallint not null default 4,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index diagnosis_runs_worker_idx
  on diagnosis_runs (status, run_after, created_at)
  where status in ('queued', 'retrying');

create index diagnosis_runs_app_idx
  on diagnosis_runs (app_id, status, updated_at desc);

-- Row-level security mirrors every other workspace-scoped table.
alter table diagnosis_runs enable row level security;
alter table diagnosis_runs force row level security;
create policy workspace_scope on diagnosis_runs
  using (workspace_id = current_workspace_id())
  with check (workspace_id = current_workspace_id());
