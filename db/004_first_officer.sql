-- =============================================================================
-- WPI SGA — grant officer access
--
-- A row in public.profiles is what grants admin access. An auth user without
-- one can sign in and see nothing, which is intentional.
--
-- BEFORE RUNNING THIS: create the person under Authentication -> Users in the
-- Supabase dashboard, with the same email. This file only links an existing
-- auth user to an officer profile; it does nothing if that user is absent.
--
-- Looking the user up by email rather than pasting a UUID keeps this to one
-- step and removes the chance of transcribing the id wrong. Safe to re-run.
-- =============================================================================

insert into public.profiles (id, full_name, role)
select id, 'Aaryan Panchal', 'admin'
from auth.users
where lower(email) = lower('ajpanchal@wpi.edu')
on conflict (id) do update
  set role = 'admin',
      full_name = excluded.full_name;

-- Confirm it landed. Expect exactly one row; zero means the auth user has not
-- been created yet, so go back to Authentication -> Users and try again.
select p.role, p.full_name, u.email
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('ajpanchal@wpi.edu');

-- --- adding the next officer -------------------------------------------------
-- Copy the insert above and change the email and name. Use role 'admin' for
-- someone who should be able to add other officers, 'officer' otherwise.
--
-- Prefer the SGA role addresses (sgapresident@wpi.edu, sgavp@wpi.edu,
-- sgasecretary@wpi.edu ...) over personal ones. An account tied to a student's
-- own email leaves when they graduate, which is the exact problem this site is
-- meant to avoid.
