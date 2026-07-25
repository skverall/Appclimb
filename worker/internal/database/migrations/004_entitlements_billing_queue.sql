-- Entitlement, Paddle binding and queue-integrity hardening.
--
-- Rollback note:
--   1. Drop sync_jobs_one_outstanding_per_connection_idx.
--   2. Drop diagnosis_runs_one_outstanding_per_app_idx.
--   3. Drop sync_jobs_running_lease_idx and diagnosis_runs_running_lease_idx.
--   4. Drop paddle_checkout_bindings and its indexes.
--   5. Drop billing_events_workspace_idx and the billing_events processing
--      columns added below.
--   6. Drop the four workspaces_paddle_* indexes and the five paddle_* columns.
--   7. Before restoring the old metric_points unit check, convert or remove
--      range_count/range_ratio rows; then recreate the original four-unit check.
-- Jobs marked failed by the one-time deduplication are intentionally retained
-- as audit history and do not need to be resurrected during rollback.

-- Preserve the single most relevant outstanding job per connection before
-- enforcing the invariant. Prefer a running job, then the oldest queued retry.
with ranked_jobs as (
  select
    id,
    row_number() over (
      partition by connection_id
      order by
        case when status='running' then 0 else 1 end,
        created_at,
        id
    ) as position
  from sync_jobs
  where status in ('queued', 'running', 'retrying')
)
update sync_jobs sj
set
  status='failed',
  locked_at=null,
  last_error_code='deduplicated_by_004',
  updated_at=now()
from ranked_jobs ranked
where sj.id=ranked.id and ranked.position > 1;

create unique index sync_jobs_one_outstanding_per_connection_idx
  on sync_jobs (connection_id)
  where status in ('queued', 'running', 'retrying');

create index sync_jobs_running_lease_idx
  on sync_jobs (locked_at)
  where status='running';

-- Diagnosis scheduling uses the same outstanding-job invariant. The previous
-- NOT EXISTS guard was not sufficient under concurrent scheduler processes.
with ranked_runs as (
  select
    id,
    row_number() over (
      partition by app_id
      order by
        case when status='running' then 0 else 1 end,
        created_at,
        id
    ) as position
  from diagnosis_runs
  where status in ('queued', 'running', 'retrying')
)
update diagnosis_runs dr
set
  status='failed',
  locked_at=null,
  last_error_code='deduplicated_by_004',
  updated_at=now()
from ranked_runs ranked
where dr.id=ranked.id and ranked.position > 1;

create unique index diagnosis_runs_one_outstanding_per_app_idx
  on diagnosis_runs (app_id)
  where status in ('queued', 'running', 'retrying');

create index diagnosis_runs_running_lease_idx
  on diagnosis_runs (locked_at)
  where status='running';

-- These fields are a server-owned Paddle binding. custom_data.workspace_id is
-- only a consistency assertion after one of these identifiers already resolves
-- to a workspace; it is never the lookup key for first-time entitlement.
alter table workspaces
  add column paddle_customer_id text,
  add column paddle_transaction_id text,
  add column paddle_product_id text,
  add column paddle_price_id text,
  add column paddle_last_event_occurred_at timestamptz;

create unique index workspaces_paddle_customer_id_idx
  on workspaces (paddle_customer_id)
  where paddle_customer_id is not null;

create unique index workspaces_paddle_transaction_id_idx
  on workspaces (paddle_transaction_id)
  where paddle_transaction_id is not null;

create index workspaces_paddle_product_id_idx
  on workspaces (paddle_product_id)
  where paddle_product_id is not null;

create index workspaces_paddle_last_event_idx
  on workspaces (paddle_last_event_occurred_at)
  where paddle_last_event_occurred_at is not null;

-- Receiving a signed event and applying its entitlement are separate facts.
-- Persist the processing result so an allowed payment that needs reconciliation
-- is visible and may be safely replayed instead of becoming an opaque duplicate.
alter table billing_events
  add column workspace_id uuid references workspaces(id) on delete set null,
  add column processing_status text not null default 'received'
    check (
      processing_status in (
        'received',
        'applied',
        'ignored',
        'reconciliation_required'
      )
    ),
  add column processing_reason text;

create index billing_events_workspace_idx
  on billing_events (workspace_id, occurred_at desc)
  where workspace_id is not null;

-- A browser checkout receives one opaque, short-lived token from an
-- authenticated endpoint. Only its SHA-256 hash is stored. The signed Paddle
-- webhook must atomically consume the token before first binding a subscription
-- to a workspace, so client-provided workspace_id is never an authority.
create table paddle_checkout_bindings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  price_id text not null,
  expected_subscription_id text,
  expected_customer_id text,
  expected_transaction_id text,
  expected_status text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_event_id text,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (not (consumed_at is not null and superseded_at is not null)),
  check (
    (consumed_at is null and consumed_by_event_id is null)
    or (consumed_at is not null and consumed_by_event_id is not null)
  )
);

create index paddle_checkout_bindings_workspace_idx
  on paddle_checkout_bindings (workspace_id, created_at desc);

create index paddle_checkout_bindings_expiry_idx
  on paddle_checkout_bindings (expires_at)
  where consumed_at is null and superseded_at is null;

create unique index paddle_checkout_bindings_one_pending_idx
  on paddle_checkout_bindings (workspace_id)
  where consumed_at is null and superseded_at is null;

-- Superwall overview values are range snapshots, not additive daily points.
alter table metric_points
  drop constraint if exists metric_points_unit_check;

alter table metric_points
  add constraint metric_points_unit_check check (
    unit in (
      'count',
      'currency',
      'ratio',
      'rank',
      'range_count',
      'range_ratio'
    )
  );
