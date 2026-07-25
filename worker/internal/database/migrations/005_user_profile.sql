alter table users
  add column if not exists avatar_key text not null default 'ridge'
  check (
    avatar_key in (
      'ridge',
      'river',
      'summit',
      'forest',
      'dawn',
      'glacier',
      'night',
      'horizon'
    )
  );
