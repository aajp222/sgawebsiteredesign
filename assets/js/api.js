/* ==========================================================================
   api.js — the only place the site talks to Supabase.

   Two rules this file exists to enforce:

   1. PROGRESSIVE ENHANCEMENT. Every page ships real static content. This
      layer only ever REPLACES that content after a successful, non-empty
      fetch. If the site is unconfigured, offline, or Supabase is down, the
      visitor sees the static fallback instead of an empty region or an error.

   2. NO TRUST IN THE CLIENT. Permissions live in row level security, not
      here. Hiding a button does not protect a table; the policies in
      db/002_rls.sql do.
   ========================================================================== */
(function (global) {
  'use strict';

  var cfg = global.SGA_CONFIG || {};
  var client = null;

  function isConfigured() {
    return Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && global.supabase);
  }

  function db() {
    if (!isConfigured()) return null;
    if (!client) {
      client = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    }
    return client;
  }

  /* --- reads ------------------------------------------------------------- */

  // Returns [] on any failure. Callers treat empty as "keep the fallback".
  function list(table, build) {
    var c = db();
    if (!c) return Promise.resolve([]);
    var q = c.from(table).select('*');
    if (build) q = build(q);
    return q.then(function (res) {
      if (res.error) {
        console.warn('[sga] ' + table + ': ' + res.error.message);
        return [];
      }
      return res.data || [];
    }).catch(function (err) {
      console.warn('[sga] ' + table + ' unreachable: ' + err.message);
      return [];
    });
  }

  var reads = {
    news: function () {
      return list('news', function (q) {
        return q.eq('published', true).order('sort', { ascending: false })
                .order('published_at', { ascending: false, nullsFirst: false }).limit(12);
      });
    },
    minutes: function () {
      return list('minutes', function (q) {
        return q.eq('published', true).order('meeting_date', { ascending: false });
      });
    },
    people: function () {
      return list('people', function (q) {
        return q.eq('published', true).order('sort').order('name');
      });
    },
    documents: function (category) {
      return list('documents', function (q) {
        q = q.eq('published', true);
        if (category) q = q.eq('category', category);
        return q.order('sort').order('title');
      });
    },
    igPosts: function () {
      return list('ig_posts', function (q) {
        return q.eq('published', true).order('sort').limit(9);
      });
    },
    clubs: function () {
      return list('clubs', function (q) {
        return q.eq('status', 'approved').order('name');
      });
    },
  };

  /* --- public submissions -------------------------------------------------
     These tables grant INSERT and nothing else, so there is no row to read
     back. Resolve to {ok:true} or {ok:false, message}.                      */

  function submit(table, row) {
    var c = db();
    if (!c) {
      return Promise.resolve({
        ok: false,
        message: 'This form is not connected yet. Please email sgaexecs@wpi.edu in the meantime.',
      });
    }
    return c.from(table).insert(row).then(function (res) {
      if (!res.error) return { ok: true };
      // 54000 is the rate limiter in db/002_rls.sql.
      var rateLimited = res.error.code === '54000' ||
        /too many submissions/i.test(res.error.message || '');
      return {
        ok: false,
        message: rateLimited
          ? 'That is a lot of submissions from one place. Please try again in an hour.'
          : 'Something went wrong sending that. Please try again, or email sgaexecs@wpi.edu.',
      };
    }).catch(function () {
      return { ok: false, message: 'Could not reach the server. Check your connection and try again.' };
    });
  }

  /* --- officer auth -------------------------------------------------------
     Being signed in is not the same as being an officer. Officer-ness is a
     row in public.profiles, which RLS checks on every statement; this only
     decides what the admin UI shows.                                        */

  var auth = {
    signIn: function (email, password) {
      var c = db();
      if (!c) return Promise.resolve({ ok: false, message: 'Supabase is not configured.' });
      return c.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) return { ok: false, message: res.error.message };
          return { ok: true };
        });
    },
    signOut: function () {
      var c = db();
      return c ? c.auth.signOut() : Promise.resolve();
    },
    user: function () {
      var c = db();
      if (!c) return Promise.resolve(null);
      return c.auth.getUser().then(function (res) {
        return (res.data && res.data.user) || null;
      }).catch(function () { return null; });
    },
    // Confirms the signed-in user has a profiles row. RLS returns nothing if not.
    profile: function () {
      var c = db();
      if (!c) return Promise.resolve(null);
      return auth.user().then(function (u) {
        if (!u) return null;
        return c.from('profiles').select('*').eq('id', u.id).maybeSingle()
          .then(function (res) { return res.error ? null : res.data; });
      });
    },
  };

  /* --- officer writes ------------------------------------------------------ */

  var admin = {
    list: function (table, build) { return list(table, build); },
    save: function (table, row) {
      var c = db();
      if (!c) return Promise.resolve({ ok: false, message: 'Not configured.' });
      var op = row.id ? c.from(table).update(row).eq('id', row.id) : c.from(table).insert(row);
      return op.then(function (res) {
        return res.error ? { ok: false, message: res.error.message } : { ok: true };
      });
    },
    remove: function (table, id) {
      var c = db();
      if (!c) return Promise.resolve({ ok: false, message: 'Not configured.' });
      return c.from(table).delete().eq('id', id).then(function (res) {
        return res.error ? { ok: false, message: res.error.message } : { ok: true };
      });
    },
    upload: function (bucket, path, file) {
      var c = db();
      if (!c) return Promise.resolve({ ok: false, message: 'Not configured.' });
      return c.storage.from(bucket).upload(path, file, { upsert: true }).then(function (res) {
        if (res.error) return { ok: false, message: res.error.message };
        var pub = c.storage.from(bucket).getPublicUrl(path);
        return { ok: true, url: pub.data.publicUrl };
      });
    },
  };

  /* --- hydration ----------------------------------------------------------
     The contract that keeps the no-JS guarantee: the static markup inside
     [data-source] is only replaced when rows actually arrive.               */

  function hydrate(sourceName, fetcher, render) {
    var hosts = document.querySelectorAll('[data-source="' + sourceName + '"]');
    if (!hosts.length || !isConfigured()) return;

    fetcher().then(function (rows) {
      if (!rows || !rows.length) return;          // keep the fallback
      Array.prototype.forEach.call(hosts, function (host) {
        try {
          var html = render(rows, host);
          if (html != null && html !== '') host.innerHTML = html;
        } catch (err) {
          console.warn('[sga] render failed for ' + sourceName + ': ' + err.message);
        }
      });
    });
  }

  // Everything interpolated into markup goes through this.
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Only http(s) URLs survive, so a stored value can never become javascript:.
  function safeUrl(value) {
    var s = String(value == null ? '' : value).trim();
    return /^https?:\/\//i.test(s) ? esc(s) : '';
  }

  global.SGA = {
    isConfigured: isConfigured,
    client: db,
    read: reads,
    submit: submit,
    auth: auth,
    admin: admin,
    hydrate: hydrate,
    esc: esc,
    safeUrl: safeUrl,
  };
})(window);
