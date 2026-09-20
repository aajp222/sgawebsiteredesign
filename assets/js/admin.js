/* ==========================================================================
   admin.js — the officer console.

   One editor driven by the field definitions below, rather than nine
   near-identical pages. Add a table by adding an entry to TYPES.

   This file decides what the UI OFFERS, never what the database ALLOWS.
   Every statement it issues is still checked by row level security, so a
   non-officer who loads these pages sees an empty console and every write
   they attempt is refused by Postgres.
   ========================================================================== */
(function () {
  'use strict';

  if (!window.SGA) return;
  var esc = SGA.esc;

  /* --- what can be edited -------------------------------------------------- */

  var TYPES = {
    news: {
      label: 'News', table: 'news', titleField: 'title',
      order: function (q) { return q.order('sort', { ascending: false }); },
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'body', label: 'Body', type: 'textarea' },
        { name: 'kind', label: 'Kind', type: 'select',
          options: ['announcement', 'recurring', 'spotlight'] },
        { name: 'link_url', label: 'Link URL', type: 'text', half: true },
        { name: 'link_label', label: 'Link label', type: 'text', half: true },
        { name: 'sort', label: 'Sort (higher first)', type: 'number', half: true },
        { name: 'published', label: 'Published', type: 'checkbox', half: true },
      ],
    },
    minutes: {
      label: 'Minutes', table: 'minutes', titleField: 'title',
      order: function (q) { return q.order('meeting_date', { ascending: false }); },
      fields: [
        { name: 'meeting_date', label: 'Meeting date', type: 'date', required: true, half: true },
        { name: 'term', label: 'Term', type: 'select', options: ['a', 'b', 'c', 'd'], half: true },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'summary', label: 'Summary', type: 'textarea' },
        { name: 'file_url', label: 'Minutes file', type: 'file' },
        { name: 'published', label: 'Published', type: 'checkbox' },
      ],
    },
    people: {
      label: 'Officers', table: 'people', titleField: 'role_title',
      order: function (q) { return q.order('sort'); },
      fields: [
        { name: 'role_title', label: 'Role', type: 'text', required: true, half: true },
        { name: 'name', label: 'Name', type: 'text', half: true },
        { name: 'branch', label: 'Branch', type: 'select',
          options: ['executive', 'cabinet', 'appointed', 'judicial'], half: true },
        { name: 'email', label: 'Email', type: 'text', half: true },
        { name: 'bio', label: 'What this role does', type: 'textarea' },
        { name: 'photo_url', label: 'Photo', type: 'file' },
        { name: 'term_label', label: 'Term', type: 'text', half: true },
        { name: 'sort', label: 'Sort', type: 'number', half: true },
        { name: 'published', label: 'Published', type: 'checkbox' },
      ],
    },
    documents: {
      label: 'Documents', table: 'documents', titleField: 'title',
      order: function (q) { return q.order('sort'); },
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'category', label: 'Category', type: 'select',
          options: ['governing', 'budget', 'policy', 'other'], half: true },
        { name: 'sort', label: 'Sort', type: 'number', half: true },
        { name: 'file_url', label: 'PDF', type: 'file' },
        { name: 'published', label: 'Published', type: 'checkbox' },
      ],
    },
    instagram: {
      label: 'Instagram', table: 'ig_posts', titleField: 'caption',
      order: function (q) { return q.order('sort'); },
      fields: [
        { name: 'image_url', label: 'Image', type: 'file', required: true },
        { name: 'permalink', label: 'Post link', type: 'text' },
        { name: 'caption', label: 'Alt text / caption', type: 'text' },
        { name: 'sort', label: 'Sort', type: 'number', half: true },
        { name: 'published', label: 'Published', type: 'checkbox', half: true },
      ],
    },
    clubs: {
      label: 'Clubs', table: 'clubs', titleField: 'name',
      order: function (q) { return q.order('name'); },
      fields: [
        { name: 'name', label: 'Club name', type: 'text', required: true, half: true },
        { name: 'slug', label: 'Slug', type: 'text', required: true, half: true },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'contact_email', label: 'Contact email', type: 'text', half: true },
        { name: 'classification', label: 'Classification', type: 'text', half: true },
        { name: 'meeting_time', label: 'Meets', type: 'text', half: true },
        { name: 'location', label: 'Location', type: 'text', half: true },
        { name: 'website', label: 'Website', type: 'text' },
        { name: 'status', label: 'Status', type: 'select',
          options: ['pending', 'approved', 'archived'], half: true },
        { name: 'sort', label: 'Sort', type: 'number', half: true },
      ],
    },
  };

  var INBOXES = {
    feedback: {
      label: 'Feedback', table: 'feedback',
      title: function (r) { return r.category || 'general'; },
      body: function (r) { return r.body; },
      meta: function (r) { return [r.contact_email || 'anonymous']; },
      statuses: ['new', 'triaged', 'closed'],
    },
    club_submissions: {
      label: 'Club submissions', table: 'club_submissions',
      title: function (r) { return r.name; },
      body: function (r) { return r.description; },
      meta: function (r) {
        return [r.contact_email, r.meeting_time, r.location, r.website,
                r.submitter_name ? 'from ' + r.submitter_name : ''].filter(Boolean);
      },
      statuses: ['new', 'applied', 'rejected'],
      promote: true,
    },
    funding_requests: {
      label: 'Funding requests', table: 'funding_requests',
      title: function (r) { return r.club_name + ' — ' + r.event_name; },
      body: function (r) { return r.notes; },
      meta: function (r) {
        return [r.contact_email, 'needed by ' + r.funds_needed_by,
                '$' + (r.amount_cents / 100).toFixed(2)];
      },
      statuses: ['new', 'reviewed', 'forwarded', 'closed'],
    },
  };

  /* --- helpers -------------------------------------------------------------- */

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }
  function el(id) { return document.getElementById(id); }
  function when(host, html) { if (host) host.innerHTML = html; }

  function fmtDate(value) {
    if (!value) return '';
    var d = new Date(value);
    return isNaN(d) ? String(value) : d.toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* --- the gate -------------------------------------------------------------
     Signed in is not the same as officer. The profile lookup is subject to
     RLS, so a non-officer simply gets nothing back.                          */

  function boot(onReady) {
    var signin = el('signin'), console_ = el('console');

    // Only one of the two views is ever used. Drop the other from the DOM
    // rather than just hiding it, so the rendered page has exactly one <h1>
    // and no duplicate ids or stray landmarks.
    function show(keep, drop) {
      if (drop && drop.parentNode) drop.parentNode.removeChild(drop);
      if (keep) keep.classList.add('is-visible');
    }

    if (!SGA.isConfigured()) {
      when(el('gate-note'),
        '<div class="notice"><strong>Not connected yet.</strong> Add your Supabase project URL ' +
        'and anon key to <code>assets/js/config.js</code>. See <code>db/README.md</code>.</div>');
      show(signin, console_);
      return;
    }

    SGA.auth.profile().then(function (profile) {
      if (!profile) {
        show(signin, console_);
        SGA.auth.user().then(function (u) {
          if (u) {
            when(el('gate-note'),
              '<div class="notice">Signed in as <strong>' + esc(u.email) + '</strong>, but that ' +
              'account is not an SGA officer. Ask an admin to add you, then sign in again.</div>');
          }
        });
        return;
      }
      show(console_, signin);
      var who = el('who');
      if (who) who.textContent = (profile.full_name || 'Officer') + ' · ' + profile.role;
      onReady(profile);
    });
  }

  /* --- sign in / out --------------------------------------------------------- */

  function wireAuth() {
    var form = el('signin-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var status = el('signin-status');
        status.hidden = false;
        status.className = 'form-status is-warn';
        status.textContent = 'Signing in…';
        SGA.auth.signIn(el('email').value.trim(), el('password').value).then(function (res) {
          if (res.ok) { window.location.reload(); return; }
          status.className = 'form-status is-error';
          status.textContent = res.message || 'Could not sign in.';
        });
      });
    }
    var out = el('signout');
    if (out) {
      out.addEventListener('click', function () {
        SGA.auth.signOut().then(function () { window.location.reload(); });
      });
    }
  }

  /* --- content editor -------------------------------------------------------- */

  function renderFields(def, row) {
    return def.fields.map(function (f) {
      var id = 'f-' + f.name;
      var value = row && row[f.name] != null ? row[f.name] : '';
      var cls = 'field' + (f.half ? '' : ' field--full');
      var input;

      if (f.type === 'textarea') {
        input = '<textarea id="' + id + '" data-field="' + f.name + '">' + esc(value) + '</textarea>';
      } else if (f.type === 'select') {
        input = '<select id="' + id + '" data-field="' + f.name + '">' +
          f.options.map(function (o) {
            return '<option value="' + esc(o) + '"' + (String(value) === o ? ' selected' : '') +
                   '>' + esc(o) + '</option>';
          }).join('') + '</select>';
      } else if (f.type === 'checkbox') {
        input = '<input type="checkbox" id="' + id + '" data-field="' + f.name + '"' +
                (value ? ' checked' : '') + ' />';
      } else if (f.type === 'file') {
        input = '<input type="text" id="' + id + '" data-field="' + f.name + '" value="' +
                esc(value) + '" placeholder="https://… or upload" />' +
                '<input type="file" data-upload-for="' + f.name + '" />';
      } else {
        var t = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text');
        input = '<input type="' + t + '" id="' + id + '" data-field="' + f.name + '" value="' +
                esc(value) + '"' + (f.required ? ' required' : '') + ' />';
      }

      return '<div class="' + cls + '"><label for="' + id + '">' + esc(f.label) +
             (f.required ? ' <span class="hint">(required)</span>' : '') + '</label>' + input + '</div>';
    }).join('');
  }

  function readFields(def) {
    var row = {};
    def.fields.forEach(function (f) {
      var input = document.querySelector('[data-field="' + f.name + '"]');
      if (!input) return;
      if (f.type === 'checkbox') row[f.name] = input.checked;
      else if (f.type === 'number') row[f.name] = parseInt(input.value, 10) || 0;
      else row[f.name] = input.value.trim() || null;
    });
    return row;
  }

  function contentPage() {
    var type = qs('type') || 'news';
    var def = TYPES[type];
    if (!def) { when(el('rows'), '<p class="admin-empty">Unknown content type.</p>'); return; }

    document.title = def.label + ' | SGA Admin';
    var heading = el('page-title');
    if (heading) heading.textContent = def.label;
    var current = null;

    Array.prototype.forEach.call(document.querySelectorAll('.admin-nav a'), function (a) {
      if (a.getAttribute('href') === 'content.html?type=' + type) a.setAttribute('aria-current', 'page');
    });

    function refresh() {
      SGA.admin.list(def.table, def.order).then(function (rows) {
        if (!rows.length) {
          when(el('rows'), '<p class="admin-empty">Nothing here yet. Use <strong>New</strong> to add the first one.</p>');
          return;
        }
        when(el('rows'), rows.map(function (r) {
          var live = def.table === 'clubs' ? r.status === 'approved' : r.published;
          var pill = def.table === 'clubs'
            ? '<span class="pill pill--' + (live ? 'live' : 'draft') + '">' + esc(r.status) + '</span>'
            : '<span class="pill pill--' + (live ? 'live' : 'draft') + '">' + (live ? 'published' : 'draft') + '</span>';
          return '<div class="row-item">' +
            '<div><div class="row-item__title">' + esc(r[def.titleField] || '(untitled)') + '</div>' +
            '<div class="row-item__meta">' + pill +
            (r.meeting_date ? '<span>' + esc(fmtDate(r.meeting_date)) + '</span>' : '') +
            (r.name && def.titleField !== 'name' ? '<span>' + esc(r.name) + '</span>' : '') +
            '</div></div>' +
            '<div class="row-item__actions">' +
            '<button class="btn btn--sm btn--ghost" data-edit="' + esc(r.id) + '">Edit</button>' +
            '<button class="btn btn--sm btn--ghost" data-delete="' + esc(r.id) + '">Delete</button>' +
            '</div></div>';
        }).join(''));

        Array.prototype.forEach.call(el('rows').querySelectorAll('[data-edit]'), function (b) {
          b.addEventListener('click', function () {
            openEditor(rows.filter(function (r) { return r.id === b.getAttribute('data-edit'); })[0]);
          });
        });
        Array.prototype.forEach.call(el('rows').querySelectorAll('[data-delete]'), function (b) {
          b.addEventListener('click', function () {
            if (!window.confirm('Delete this permanently? This cannot be undone.')) return;
            SGA.admin.remove(def.table, b.getAttribute('data-delete')).then(function (res) {
              if (!res.ok) window.alert(res.message);
              refresh();
            });
          });
        });
      });
    }

    function openEditor(row) {
      current = row || null;
      el('editor').hidden = false;
      el('editor-title').textContent = row ? 'Edit' : 'New ' + def.label.toLowerCase().replace(/s$/, '');
      when(el('editor-fields'), renderFields(def, row));

      Array.prototype.forEach.call(document.querySelectorAll('[data-upload-for]'), function (input) {
        input.addEventListener('change', function () {
          var file = input.files && input.files[0];
          if (!file) return;
          var target = document.querySelector('[data-field="' + input.getAttribute('data-upload-for') + '"]');
          var path = def.table + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          input.disabled = true;
          SGA.admin.upload('media', path, file).then(function (res) {
            input.disabled = false;
            if (res.ok) target.value = res.url;
            else window.alert('Upload failed: ' + res.message);
          });
        });
      });
      el('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    el('new').addEventListener('click', function () { openEditor(null); });
    el('cancel').addEventListener('click', function () { el('editor').hidden = true; });

    el('save').addEventListener('click', function () {
      var row = readFields(def);
      if (current) row.id = current.id;
      var missing = def.fields.filter(function (f) { return f.required && !row[f.name]; });
      if (missing.length) {
        window.alert('Please fill in: ' + missing.map(function (f) { return f.label; }).join(', '));
        return;
      }
      if (def.table === 'news' && row.published && !row.published_at) row.published_at = new Date().toISOString();
      SGA.admin.save(def.table, row).then(function (res) {
        if (!res.ok) { window.alert(res.message); return; }
        el('editor').hidden = true;
        refresh();
      });
    });

    refresh();
  }

  /* --- submission inbox ------------------------------------------------------- */

  function inboxPage() {
    var type = qs('type') || 'feedback';
    var def = INBOXES[type];
    if (!def) { when(el('rows'), '<p class="admin-empty">Unknown inbox.</p>'); return; }

    document.title = def.label + ' | SGA Admin';
    var heading = el('page-title');
    if (heading) heading.textContent = def.label;

    Array.prototype.forEach.call(document.querySelectorAll('.admin-nav a'), function (a) {
      if (a.getAttribute('href') === 'inbox.html?type=' + type) a.setAttribute('aria-current', 'page');
    });

    function refresh() {
      SGA.admin.list(def.table, function (q) {
        return q.order('created_at', { ascending: false });
      }).then(function (rows) {
        if (!rows.length) {
          when(el('rows'), '<p class="admin-empty">Nothing in this inbox.</p>');
          return;
        }
        when(el('rows'), rows.map(function (r) {
          return '<div class="row-item">' +
            '<div><div class="row-item__title">' + esc(def.title(r)) + '</div>' +
            '<div class="row-item__meta">' +
            '<span class="pill pill--' + (r.status === 'new' ? 'new' : 'draft') + '">' + esc(r.status) + '</span>' +
            '<span>' + esc(fmtDate(r.created_at)) + '</span>' +
            def.meta(r).map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') +
            '</div></div>' +
            '<div class="row-item__actions">' +
            def.statuses.map(function (s) {
              return s === r.status ? '' :
                '<button class="btn btn--sm btn--ghost" data-status="' + esc(s) +
                '" data-id="' + esc(r.id) + '">' + esc(s) + '</button>';
            }).join('') +
            (def.promote && r.status === 'new'
              ? '<button class="btn btn--sm" data-promote="' + esc(r.id) + '">Add to directory</button>' : '') +
            '</div>' +
            (def.body(r) ? '<div class="row-item__body">' + esc(def.body(r)) + '</div>' : '') +
            '</div>';
        }).join(''));

        Array.prototype.forEach.call(el('rows').querySelectorAll('[data-status]'), function (b) {
          b.addEventListener('click', function () {
            SGA.admin.save(def.table, {
              id: b.getAttribute('data-id'),
              status: b.getAttribute('data-status'),
              handled_at: new Date().toISOString(),
            }).then(function (res) {
              if (!res.ok) window.alert(res.message);
              refresh();
            });
          });
        });

        // Copy an approved submission into the real clubs table.
        Array.prototype.forEach.call(el('rows').querySelectorAll('[data-promote]'), function (b) {
          b.addEventListener('click', function () {
            var row = rows.filter(function (r) { return r.id === b.getAttribute('data-promote'); })[0];
            if (!row) return;
            var slug = (row.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-|-$/g, '').slice(0, 60) || ('club-' + Date.now());
            SGA.admin.save('clubs', {
              name: row.name, slug: slug, description: row.description || '',
              contact_email: row.contact_email, meeting_time: row.meeting_time,
              location: row.location, website: row.website,
              classification: row.classification, status: 'approved',
            }).then(function (res) {
              if (!res.ok) { window.alert('Could not add to the directory: ' + res.message); return; }
              return SGA.admin.save(def.table, {
                id: row.id, status: 'applied', handled_at: new Date().toISOString(),
              });
            }).then(refresh);
          });
        });
      });
    }

    refresh();
  }

  /* --- dashboard --------------------------------------------------------------- */

  function dashboardPage() {
    var counts = [
      ['feedback', 'New feedback', 'inbox.html?type=feedback'],
      ['club_submissions', 'Club submissions', 'inbox.html?type=club_submissions'],
      ['funding_requests', 'Funding requests', 'inbox.html?type=funding_requests'],
    ];
    Promise.all(counts.map(function (c) {
      return SGA.admin.list(c[0], function (q) { return q.eq('status', 'new'); });
    })).then(function (results) {
      when(el('dash'), counts.map(function (c, i) {
        var n = results[i].length;
        return '<a class="tile" href="' + c[2] + '">' +
               '<h3>' + esc(c[1]) + '</h3>' +
               '<p>' + (n ? n + ' waiting' : 'Nothing new') + '</p>' +
               '<span class="tile__go">Open<span class="chev" aria-hidden="true"></span></span></a>';
      }).join(''));
    });
  }

  /* --- start -------------------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    wireAuth();
    var page = document.body.getAttribute('data-admin');
    boot(function () {
      if (page === 'content') contentPage();
      else if (page === 'inbox') inboxPage();
      else dashboardPage();
    });
  });
})();
