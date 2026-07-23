do $$
begin
  if not exists(select 1 from pg_roles where rolname = 'appclimb_runtime') then
    create role appclimb_runtime
      login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication;
  end if;
end
$$;

grant connect on database appclimb to appclimb_runtime;
grant usage on schema public to appclimb_runtime;
grant select, insert, update, delete on all tables in schema public
  to appclimb_runtime;
grant usage, select on all sequences in schema public
  to appclimb_runtime;

alter default privileges in schema public
  grant select, insert, update, delete on tables to appclimb_runtime;
alter default privileges in schema public
  grant usage, select on sequences to appclimb_runtime;
