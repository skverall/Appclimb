create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index password_reset_tokens_active_idx
  on password_reset_tokens (user_id, expires_at desc)
  where used_at is null;

grant select, insert, update, delete on password_reset_tokens
  to appclimb_runtime;
