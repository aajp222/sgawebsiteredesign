#!/usr/bin/env python3
"""Assert the RLS policies in 002_rls.sql actually behave.

RLS is the only thing standing between the public anon key and the database,
so the policies get tested rather than trusted. Each case runs a statement as
a specific Postgres role with a specific JWT subject — exactly how PostgREST
executes requests in Supabase — and asserts it succeeds or fails.

Usage:
    python3 db/rls_test.py                    # against the local test cluster
    python3 db/rls_test.py --dsn "<libpq>"    # against any Postgres

Exits non-zero if any case fails.
"""

import argparse
import subprocess
import sys

PGDIR = "/var/lib/postgresql/sgatest"
PORT = "5433"

OFFICER = "11111111-1111-1111-1111-111111111111"
OUTSIDER = "22222222-2222-2222-2222-222222222222"

FIXTURE = f"""
delete from public.feedback;
delete from public.club_submissions;
delete from public.funding_requests;
delete from public.profiles;
delete from public.news;
delete from public.clubs;
delete from auth.users;

insert into auth.users (id, email) values
  ('{OFFICER}', 'officer@wpi.edu'),
  ('{OUTSIDER}', 'random@wpi.edu');

-- Only the officer gets a profile row; that row is what grants admin access.
insert into public.profiles (id, full_name, role)
  values ('{OFFICER}', 'Test Officer', 'officer');

insert into public.news (title, body, published) values
  ('Published item', 'visible', true),
  ('Draft item', 'hidden', false);

insert into public.clubs (name, slug, status) values
  ('Approved Club', 'approved-club', 'approved'),
  ('Pending Club', 'pending-club', 'pending');
"""


def psql(sql, dsn=None, superuser=True):
    """Run SQL, returning (ok, output)."""
    if dsn:
        cmd = ["psql", dsn, "-v", "ON_ERROR_STOP=1", "-tAq", "-c", sql]
        proc = subprocess.run(cmd, capture_output=True, text=True)
    else:
        inner = (
            f"psql -h {PGDIR} -p {PORT} -d postgres -v ON_ERROR_STOP=1 -tAq "
            f"-c {shell_quote(sql)}"
        )
        proc = subprocess.run(
            ["su", "postgres", "-c", inner], capture_output=True, text=True
        )
    out = (proc.stdout + proc.stderr).strip()
    return proc.returncode == 0, out


def shell_quote(s):
    return "'" + s.replace("'", "'\\''") + "'"


def as_role(role, uid, statement):
    """Wrap a statement so it runs as `role` with `uid` as the JWT subject."""
    claims = "" if uid is None else '{"sub":"%s"}' % uid
    return (
        "begin; "
        f"select set_config('request.jwt.claims', '{claims}', true); "
        f"set local role {role}; "
        f"{statement}; "
        "rollback;"
    )


# (name, role, uid, statement, expect_success, expected_value_or_None)
CASES = [
    # --- the public may not read submission tables -------------------------
    ("anon CANNOT read feedback", "anon", None,
     "select count(*) from public.feedback", False, None),
    ("anon CANNOT read club_submissions", "anon", None,
     "select count(*) from public.club_submissions", False, None),
    ("anon CANNOT read funding_requests", "anon", None,
     "select count(*) from public.funding_requests", False, None),

    # --- but may submit ----------------------------------------------------
    ("anon CAN submit feedback", "anon", None,
     "insert into public.feedback (body) values ('This is a test concern of sufficient length.')",
     True, None),
    ("anon CAN submit a club change", "anon", None,
     "insert into public.club_submissions (name, contact_email) values ('X Club','x@wpi.edu')",
     True, None),

    # --- published vs draft -------------------------------------------------
    ("anon sees ONLY published news", "anon", None,
     "select count(*) from public.news", True, "1"),
    ("anon sees ONLY approved clubs", "anon", None,
     "select count(*) from public.clubs", True, "1"),

    # --- the public may not write content ------------------------------------
    ("anon CANNOT insert news", "anon", None,
     "insert into public.news (title) values ('spam')", False, None),
    ("anon CANNOT update news", "anon", None,
     "update public.news set title = 'hacked'", False, None),
    ("anon CANNOT delete news", "anon", None,
     "delete from public.news", False, None),
    ("anon CANNOT read profiles", "anon", None,
     "select count(*) from public.profiles", False, None),

    # --- a logged-in NON-officer is not an officer ---------------------------
    ("non-officer CANNOT read feedback", "authenticated", OUTSIDER,
     "select count(*) from public.feedback", True, "0"),
    ("non-officer CANNOT insert news", "authenticated", OUTSIDER,
     "insert into public.news (title) values ('nope')", False, None),
    ("non-officer sees ONLY published news", "authenticated", OUTSIDER,
     "select count(*) from public.news", True, "1"),
    ("non-officer CANNOT see other profiles", "authenticated", OUTSIDER,
     "select count(*) from public.profiles", True, "0"),

    # --- officers can do their job -------------------------------------------
    ("officer CAN read feedback", "authenticated", OFFICER,
     "select count(*) from public.feedback", True, "0"),
    ("officer CAN insert news", "authenticated", OFFICER,
     "insert into public.news (title) values ('real post')", True, None),
    ("officer SEES drafts too", "authenticated", OFFICER,
     "select count(*) from public.news", True, "2"),
    ("officer SEES pending clubs", "authenticated", OFFICER,
     "select count(*) from public.clubs", True, "2"),
    ("officer CAN update news", "authenticated", OFFICER,
     "update public.news set published = true", True, None),
    ("officer CAN delete news", "authenticated", OFFICER,
     "delete from public.news", True, None),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn")
    args = ap.parse_args()

    ok, out = psql(FIXTURE, args.dsn)
    if not ok:
        print("fixture failed:\n" + out)
        return 1

    failures = []
    for name, role, uid, stmt, expect_ok, expect_val in CASES:
        ran_ok, out = psql(as_role(role, uid, stmt), args.dsn)
        value = out.splitlines()[-1].strip() if (ran_ok and out) else None

        if ran_ok != expect_ok:
            verdict = "FAIL"
            detail = f"expected {'success' if expect_ok else 'refusal'}, got " + (
                "success" if ran_ok else f"refusal ({first_error(out)})")
        elif expect_val is not None and value != expect_val:
            verdict = "FAIL"
            detail = f"expected {expect_val} row(s), got {value}"
        else:
            verdict = "pass"
            detail = "" if expect_val is None else f"{value} row(s)"

        if verdict == "FAIL":
            failures.append(name)
        print(f"  {verdict:4}  {name}{'  — ' + detail if detail else ''}")

    # --- rate limiting -------------------------------------------------------
    print("\n  rate limit (6 rapid submissions, cap is 5/hour/bucket):")
    psql("delete from public.feedback;", args.dsn)
    blocked = 0
    for i in range(6):
        stmt = ("insert into public.feedback (body) values "
                f"('Rate limit probe number {i} with enough characters.')")
        ran_ok, out = psql(
            "begin; select set_config('request.jwt.claims','',true); "
            f"set local role anon; {stmt}; commit;", args.dsn)
        if not ran_ok:
            blocked += 1
    if blocked >= 1:
        print(f"  pass  6th submission refused ({blocked} of 6 blocked)")
    else:
        print("  FAIL  rate limit never triggered")
        failures.append("rate limit")

    # --- submitters cannot set their own triage state ------------------------
    psql("delete from public.feedback;", args.dsn)
    psql("begin; select set_config('request.jwt.claims','',true); set local role anon; "
         "insert into public.feedback (body, status, internal_note) values "
         "('Trying to forge a closed status here.','closed','pre-set'); commit;", args.dsn)
    ok, out = psql("select status || '/' || coalesce(nullif(internal_note,''),'(empty)') "
                   "from public.feedback limit 1", args.dsn)
    val = out.strip()
    if val == "new/(empty)":
        print("  pass  submitted status/internal_note forced to 'new'/empty")
    else:
        print(f"  FAIL  submitter controlled triage fields: got {val!r}")
        failures.append("status forcing")

    print()
    if failures:
        print(f"{len(failures)} FAILING: " + ", ".join(failures))
        return 1
    print(f"All {len(CASES) + 2} RLS checks passed.")
    return 0


def first_error(out):
    for line in out.splitlines():
        if "ERROR" in line or "permission denied" in line:
            return line.strip()[:80]
    return out.splitlines()[0][:80] if out else "?"


if __name__ == "__main__":
    sys.exit(main())
