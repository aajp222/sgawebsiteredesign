-- =============================================================================
-- LOCAL TEST ONLY — do NOT run this on Supabase.
--
-- Supabase provides the auth schema, the anon/authenticated roles, and
-- auth.uid(). This recreates just enough of them that 001 and 002 can be
-- applied unmodified against a plain Postgres and their policies tested.
-- =============================================================================

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Mirrors Supabase: the subject claim of the request's JWT, or null.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;
