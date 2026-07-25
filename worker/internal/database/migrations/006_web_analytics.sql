create type web_event_kind as enum (
  'page_view',
  'engagement',
  'conversion'
);

create type crawler_category as enum (
  'ai_answer',
  'search_index',
  'model_training',
  'other'
);

create table web_properties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  app_id uuid references apps(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  domain citext not null check (char_length(domain) between 1 and 253),
  token_version integer not null default 1 check (token_version > 0),
  retention_days integer not null default 90
    check (retention_days between 7 and 730),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id)
);
create index web_properties_domain_idx on web_properties (domain);

create table web_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  property_id uuid not null references web_properties(id) on delete cascade,
  event_id uuid not null,
  kind web_event_kind not null,
  visitor_id uuid not null,
  session_id uuid not null,
  occurred_at timestamptz not null,
  hostname citext not null check (char_length(hostname) between 1 and 253),
  path text not null check (char_length(path) between 1 and 2048),
  referrer_host citext,
  source text not null check (char_length(source) between 1 and 120),
  channel text not null check (
    channel in (
      'Direct',
      'Organic Search',
      'Social',
      'AI Referral',
      'Campaigns',
      'Referral'
    )
  ),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  country_code text check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ),
  browser text not null check (char_length(browser) between 1 and 80),
  operating_system text not null check (
    char_length(operating_system) between 1 and 80
  ),
  device text not null check (char_length(device) between 1 and 80),
  duration_ms integer check (
    duration_ms is null or duration_ms between 0 and 86400000
  ),
  goal text check (goal is null or char_length(goal) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (property_id, event_id)
);
create index web_events_property_time_idx
  on web_events (property_id, occurred_at desc);
create index web_events_session_idx
  on web_events (property_id, session_id, occurred_at);
create index web_events_visitor_idx
  on web_events (property_id, visitor_id, occurred_at desc);

create table web_crawler_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  property_id uuid not null references web_properties(id) on delete cascade,
  event_id uuid not null,
  occurred_at timestamptz not null,
  hostname citext not null check (char_length(hostname) between 1 and 253),
  path text not null check (char_length(path) between 1 and 2048),
  provider text not null check (char_length(provider) between 1 and 80),
  agent text not null check (char_length(agent) between 1 and 120),
  category crawler_category not null,
  detection_method text not null default 'user_agent'
    check (detection_method in ('user_agent', 'verified_ip')),
  country_code text check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ),
  created_at timestamptz not null default now(),
  unique (property_id, event_id)
);
create index web_crawler_events_property_time_idx
  on web_crawler_events (property_id, occurred_at desc);
create index web_crawler_events_provider_idx
  on web_crawler_events (property_id, provider, occurred_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'web_properties',
    'web_events',
    'web_crawler_events'
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
