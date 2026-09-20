/* ==========================================================================
   Supabase connection settings.

   SAFE TO COMMIT. The anon key is a public identifier — it is designed to be
   shipped in the page and grants nothing on its own. Every permission is
   decided by row level security in db/002_rls.sql.

   NEVER put the service_role key in this file or anywhere else in this repo.
   It bypasses row level security completely.

   Fill these in from your Supabase project: Settings -> API.
   Leaving them blank is fine — the site falls back to its static content.
   ========================================================================== */

window.SGA_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
