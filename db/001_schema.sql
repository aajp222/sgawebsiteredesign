-- =============================================================================
-- WPI SGA — schema
-- Apply in the Supabase SQL editor, in order: 001_schema, 002_rls, 003_seed.
--
-- Shape of the system: officers sign in and manage everything. Nobody else has
-- an account. Students and clubs submit through public INSERT-only tables that
-- officers triage. See db/README.md.
-- =============================================================================

create extension if not exists pgcrypto;

-- --- officer accounts --------------------------------------------------------
-- One row per person allowed into /admin. Adding a row here is what grants
-- access; creating an auth user alone does nothing.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  title       text not null default '',
  role        text not null default 'officer' check (role in ('officer', 'admin')),
  created_at  timestamptz not null default now()
);

-- Officer check used by every policy below.
-- SECURITY DEFINER so that reading profiles inside a profiles policy does not
-- recurse; STABLE so the planner calls it once per statement.
create or replace function public.is_officer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

revoke all on function public.is_officer() from public;
grant execute on function public.is_officer() to anon, authenticated;

-- --- shared trigger: keep updated_at honest ----------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- CONTENT — officers write, the public reads only what is published
-- =============================================================================

create table if not exists public.news (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null default '',
  kind         text not null default 'announcement',
  link_url     text,
  link_label   text,
  published    boolean not null default false,
  published_at timestamptz,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

create table if not exists public.minutes (
  id           uuid primary key default gen_random_uuid(),
  meeting_date date not null,
  term         text check (term in ('a', 'b', 'c', 'd')),
  title        text not null default '',
  summary      text not null default '',
  file_url     text,
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

create table if not exists public.people (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  role_title   text not null,
  branch       text not null default 'executive'
                 check (branch in ('executive', 'cabinet', 'appointed', 'judicial')),
  email        text,
  bio          text not null default '',
  photo_url    text,
  term_label   text not null default '',
  sort         integer not null default 0,
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text not null default '',
  file_url     text,
  category     text not null default 'governing'
                 check (category in ('governing', 'budget', 'policy', 'other')),
  sort         integer not null default 0,
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.ig_posts (
  id          uuid primary key default gen_random_uuid(),
  image_url   text not null,
  permalink   text not null default 'https://www.instagram.com/wpi.sga/',
  caption     text not null default '',
  sort        integer not null default 0,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- --- club directory ----------------------------------------------------------
-- Clubs have no accounts. A club proposes changes via club_submissions and an
-- officer applies them here.
create table if not exists public.clubs (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null unique,
  description    text not null default '',
  contact_email  text,
  meeting_time   text,
  location       text,
  website        text,
  classification text,
  logo_url       text,
  status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'archived')),
  sort           integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- =============================================================================
-- SUBMISSIONS — the public may INSERT and nothing else. No SELECT is granted,
-- so a submitter cannot read back this table, including their own row.
-- =============================================================================

create table if not exists public.club_submissions (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid references public.clubs(id) on delete set null, -- null = new club
  name           text not null,
  description    text not null default '',
  contact_email  text not null,
  meeting_time   text,
  location       text,
  website        text,
  classification text,
  submitter_name text not null default '',
  note           text not null default '',
  status         text not null default 'new'
                   check (status in ('new', 'applied', 'rejected')),
  internal_note  text not null default '',
  source_hash    text,
  created_at     timestamptz not null default now(),
  handled_at     timestamptz,
  handled_by     uuid references auth.users(id)
);

create table if not exists public.feedback (
  id            uuid primary key default gen_random_uuid(),
  body          text not null check (char_length(body) between 10 and 5000),
  category      text not null default 'general',
  contact_email text,                       -- optional; blank means anonymous
  status        text not null default 'new'
                  check (status in ('new', 'triaged', 'closed')),
  internal_note text not null default '',
  source_hash   text,
  created_at    timestamptz not null default now(),
  handled_at    timestamptz,
  handled_by    uuid references auth.users(id)
);

create table if not exists public.funding_requests (
  id              uuid primary key default gen_random_uuid(),
  club_name       text not null,
  contact_email   text not null,
  event_name      text not null,
  funds_needed_by date not null,
  amount_cents    bigint not null default 0 check (amount_cents >= 0),
  line_items      jsonb not null default '[]'::jsonb,
  notes           text not null default '',
  status          text not null default 'new'
                    check (status in ('new', 'reviewed', 'forwarded', 'closed')),
  internal_note   text not null default '',
  source_hash     text,
  created_at      timestamptz not null default now(),
  handled_at      timestamptz,
  handled_by      uuid references auth.users(id)
);

-- --- updated_at triggers -----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['news','minutes','people','documents','ig_posts','clubs']
  loop
    execute format(
      'drop trigger if exists touch_%1$s on public.%1$s;
       create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end;
$$;

-- --- indexes -----------------------------------------------------------------
create index if not exists news_pub_idx      on public.news (published, sort desc, published_at desc);
create index if not exists minutes_pub_idx   on public.minutes (published, meeting_date desc);
create index if not exists minutes_term_idx  on public.minutes (term);
create index if not exists people_pub_idx    on public.people (published, branch, sort);
create index if not exists documents_pub_idx on public.documents (published, category, sort);
create index if not exists ig_pub_idx        on public.ig_posts (published, sort);
create index if not exists clubs_status_idx  on public.clubs (status, name);
create index if not exists feedback_new_idx  on public.feedback (status, created_at desc);
