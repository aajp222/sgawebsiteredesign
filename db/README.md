# Database

Postgres on Supabase. The static site talks to it directly — there is no API
server to deploy or maintain, which is the property that matters for a group
whose membership turns over every year.

## Setting it up

1. Create a project at supabase.com (the free tier is enough).
2. Open **SQL Editor** and run, in order:
   - `001_schema.sql`
   - `002_rls.sql`
   - `003_seed.sql`
   Do **not** run `000_local_shim.sql` — that file only exists so the
   migrations can be tested against a plain Postgres.
3. Copy **Settings → API → Project URL** and **anon public** key into
   `assets/js/config.js`.
4. Create the first officer:
   - **Authentication → Users → Add user**, with a real email and password.
   - Copy that user's UUID, then in the SQL editor:
     ```sql
     insert into public.profiles (id, full_name, role)
     values ('<uuid>', 'Their Name', 'admin');
     ```
   A row in `public.profiles` is what grants admin access. An auth user
   without one can sign in and see nothing — that is intentional.
5. **Storage**: create a public bucket named `media` for photos, PDFs, and
   Instagram images.

## Keys

`assets/js/config.js` holds the **anon** key. That key is public by design,
ships in the page, and grants nothing on its own — every permission is decided
by row level security.

The **`service_role`** key bypasses row level security entirely. It must never
appear in this repo, in the browser, or in a commit. Nothing in this project
needs it.

## Who can do what

| | anonymous visitor | signed in, no profile row | officer |
|---|---|---|---|
| Read published content | yes | yes | yes |
| Read drafts | no | no | yes |
| Submit feedback / club change / FR | yes | yes | yes |
| Read submissions | **no** | **no** | yes |
| Edit content | no | no | yes |

Submission tables grant `INSERT` and nothing else, so a submitter cannot read
the table back — not even their own row.

## Testing the policies

RLS is the only thing between the public anon key and the data, so it is
tested rather than trusted:

```bash
python3 db/rls_test.py                 # local throwaway cluster
python3 db/rls_test.py --dsn "<libpq>" # any Postgres
```

23 assertions covering read isolation, write refusal, draft visibility, the
rate limiter, and submitters trying to set their own triage status. Run it
after changing anything in `002_rls.sql`.

## Spam control

Submission tables share a trigger that hashes the caller's forwarded address
with the date and refuses more than 5 inserts per bucket per hour. The address
is never stored in the clear. When no forwarding header is present every
caller shares one bucket, so the limit still applies rather than silently
switching off.

The forms also carry a honeypot field and a minimum fill time. There is no
third-party captcha, which would mean an external request on every page.
