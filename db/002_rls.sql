-- =============================================================================
-- WPI SGA — row level security
--
-- RLS is the ONLY security boundary. The anon key shipped in the page is public
-- by design and grants nothing on its own; these policies decide everything.
--
-- Rules held here:
--   1. Content is readable by the public only when published = true.
--   2. Submission tables grant INSERT to the public and NOTHING else — a
--      submitter cannot read back the table, not even their own row.
--   3. All writes to content require an officer (a row in public.profiles).
-- =============================================================================

-- --- submission guard: hash-bucketed rate limit, no addresses stored ---------
create or replace function public.submission_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hdrs    json;
  ip      text;
  bucket  text;
  recent  integer;
  per_hour constant integer := 5;
begin
  begin
    hdrs := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    hdrs := null;
  end;

  ip := coalesce(hdrs ->> 'x-forwarded-for', hdrs ->> 'x-real-ip');

  -- The address is hashed with the date and never stored in the clear. When no
  -- header is present everything shares one bucket, so the limit still applies
  -- rather than silently switching off.
  bucket := encode(digest(coalesce(ip, 'unknown') || current_date::text, 'sha256'), 'hex');
  new.source_hash := bucket;

  execute format(
    'select count(*) from public.%I where source_hash = $1 and created_at > now() - interval ''1 hour''',
    tg_table_name)
  into recent
  using bucket;

  if recent >= per_hour then
    raise exception 'Too many submissions from this source. Please try again later.'
      using errcode = '54000';
  end if;

  -- Submitters never choose their own triage state.
  new.status := 'new';
  new.internal_note := '';
  new.handled_at := null;
  new.handled_by := null;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['feedback','club_submissions','funding_requests']
  loop
    execute format(
      'drop trigger if exists guard_%1$s on public.%1$s;
       create trigger guard_%1$s before insert on public.%1$s
       for each row execute function public.submission_guard();', t);
  end loop;
end;
$$;

-- --- enable RLS everywhere ---------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','news','minutes','people','documents','ig_posts',
                           'clubs','club_submissions','feedback','funding_requests']
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end;
$$;

-- --- grants ------------------------------------------------------------------
-- Table privileges are deliberately coarse; RLS does the narrowing. The one
-- thing that must stay exact: anon gets INSERT on submissions and no SELECT.
grant usage on schema public to anon, authenticated;

grant select on public.news, public.minutes, public.people,
                public.documents, public.ig_posts, public.clubs
  to anon, authenticated;

grant insert, update, delete on public.news, public.minutes, public.people,
                                 public.documents, public.ig_posts, public.clubs
  to authenticated;

grant insert on public.feedback, public.club_submissions, public.funding_requests
  to anon, authenticated;

grant select, update, delete on public.feedback, public.club_submissions, public.funding_requests
  to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;

-- Explicitly take back anything that might have been granted by default.
revoke select on public.feedback, public.club_submissions, public.funding_requests from anon;
revoke insert, update, delete on public.news, public.minutes, public.people,
                                  public.documents, public.ig_posts, public.clubs from anon;
revoke all on public.profiles from anon;

-- --- policies: officer accounts ---------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_officer());

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- --- policies: content -------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['news','minutes','people','documents','ig_posts']
  loop
    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format(
      'create policy %1$s_read on public.%1$s for select to anon, authenticated
         using (published or public.is_officer());', t);

    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
    execute format(
      'create policy %1$s_write on public.%1$s for all to authenticated
         using (public.is_officer()) with check (public.is_officer());', t);
  end loop;
end;
$$;

-- --- policies: clubs ---------------------------------------------------------
drop policy if exists clubs_read on public.clubs;
create policy clubs_read on public.clubs for select to anon, authenticated
  using (status = 'approved' or public.is_officer());

drop policy if exists clubs_write on public.clubs;
create policy clubs_write on public.clubs for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- --- policies: submissions ---------------------------------------------------
-- INSERT only for the public. No select policy for anon exists, and no SELECT
-- privilege is granted to anon, so the table is write-only from outside.
do $$
declare t text;
begin
  foreach t in array array['feedback','club_submissions','funding_requests']
  loop
    execute format('drop policy if exists %1$s_submit on public.%1$s;', t);
    execute format(
      'create policy %1$s_submit on public.%1$s for insert to anon, authenticated
         with check (true);', t);

    execute format('drop policy if exists %1$s_triage on public.%1$s;', t);
    execute format(
      'create policy %1$s_triage on public.%1$s for select to authenticated
         using (public.is_officer());', t);

    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update to authenticated
         using (public.is_officer()) with check (public.is_officer());', t);

    execute format('drop policy if exists %1$s_delete on public.%1$s;', t);
    execute format(
      'create policy %1$s_delete on public.%1$s for delete to authenticated
         using (public.is_officer());', t);
  end loop;
end;
$$;
