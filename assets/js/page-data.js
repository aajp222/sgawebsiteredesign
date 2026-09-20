/* ==========================================================================
   page-data.js — fills the public pages from the database.

   Each block below targets a [data-source] region that already contains
   working static markup. SGA.hydrate only replaces that markup when rows
   actually come back, so an unconfigured site, a network failure, or an
   empty table all leave the static content in place.
   ========================================================================== */
(function () {
  'use strict';

  if (!window.SGA) return;
  var esc = SGA.esc, safeUrl = SGA.safeUrl;

  function chev() { return '<span class="chev" aria-hidden="true"></span>'; }

  /* --- homepage: news ---------------------------------------------------- */
  SGA.hydrate('news', SGA.read.news, function (rows) {
    return rows.slice(0, 3).map(function (row, i) {
      var link = row.link_url
        ? '<a class="card__link" href="' + esc(row.link_url) + '">' +
          esc(row.link_label || 'Read more') + chev() + '</a>'
        : '';
      var kind = { recurring: 'Every week', spotlight: 'Club spotlight' }[row.kind] || 'Announcement';
      return '<article class="card' + (i === 1 ? ' card--brand' : '') + ' reveal">' +
             '<p class="card__date">' + esc(kind) + '</p>' +
             '<h3>' + esc(row.title) + '</h3>' +
             '<p>' + esc(row.body) + '</p>' + link +
             '</article>';
    }).join('');
  });

  /* --- homepage: instagram grid ------------------------------------------ */
  SGA.hydrate('ig_posts', SGA.read.igPosts, function (rows) {
    return rows.slice(0, 9).map(function (row) {
      var img = safeUrl(row.image_url);
      if (!img) return '';
      return '<a class="ig-grid__item" href="' + (safeUrl(row.permalink) || 'https://www.instagram.com/wpi.sga/') + '">' +
             '<img src="' + img + '" alt="' + esc(row.caption || 'Instagram post from @wpi.sga') + '" loading="lazy" />' +
             '</a>';
    }).join('');
  });

  /* --- meetings: minutes table ------------------------------------------- */
  SGA.hydrate('minutes', SGA.read.minutes, function (rows) {
    var TERM = { a: 'A Term', b: 'B Term', c: 'C Term', d: 'D Term' };
    return rows.map(function (row) {
      var date = new Date(row.meeting_date + 'T12:00:00');
      var label = isNaN(date) ? esc(row.meeting_date)
        : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      var file = safeUrl(row.file_url);
      return '<tr data-term="' + esc(row.term || '') + '">' +
             '<td>' + esc(row.title || label) + '</td>' +
             '<td><span class="badge">' + esc(TERM[row.term] || '—') + '</span></td>' +
             '<td>' + esc(row.summary) + '</td>' +
             '<td>' + (file ? '<a href="' + file + '">Read' + chev() + '</a>' : 'Pending') + '</td>' +
             '</tr>';
    }).join('');
  });

  /* --- structure: officers ------------------------------------------------ */
  SGA.hydrate('people', SGA.read.people, function (rows) {
    // Role placeholders with no name attached are worse than the static
    // markup they would replace, so require a real name.
    var named = rows.filter(function (r) { return (r.name || '').trim(); });
    if (!named.length) return null;

    return named.map(function (row) {
      var photo = safeUrl(row.photo_url);
      var mail = row.email
        ? '<a class="card__link" href="mailto:' + esc(row.email) + '">' + esc(row.email) + '</a>'
        : '';
      return '<article class="card">' +
             (photo ? '<img src="' + photo + '" alt="" loading="lazy" style="margin-bottom:var(--sp-4)" />' : '') +
             '<h3>' + esc(row.role_title) + '</h3>' +
             '<p class="card__date">' + esc(row.name) + '</p>' +
             '<p>' + esc(row.bio) + '</p>' + mail +
             '</article>';
    }).join('');
  });

  /* --- governing documents ------------------------------------------------ */
  SGA.hydrate('documents', function () { return SGA.read.documents('governing'); }, function (rows) {
    return rows.map(function (row) {
      var file = safeUrl(row.file_url);
      return '<a class="doc-card" href="' + (file || 'contact.html') + '">' +
             '<h3>' + esc(row.title) + '</h3>' +
             '<p>' + esc(row.description) +
             (file ? '' : ' Request a copy' ) + chev() + '</p>' +
             '</a>';
    }).join('');
  });

  /* --- club directory ----------------------------------------------------- */
  SGA.hydrate('clubs', SGA.read.clubs, function (rows) {
    return rows.map(function (row) {
      var site = safeUrl(row.website);
      var bits = [];
      if (row.meeting_time) bits.push(esc(row.meeting_time));
      if (row.location) bits.push(esc(row.location));
      return '<article class="card">' +
             '<h3>' + esc(row.name) + '</h3>' +
             (row.classification ? '<p class="card__date">' + esc(row.classification) + '</p>' : '') +
             '<p>' + esc(row.description) + '</p>' +
             (bits.length ? '<p class="card__date">' + bits.join(' &middot; ') + '</p>' : '') +
             (row.contact_email ? '<a class="card__link" href="mailto:' + esc(row.contact_email) + '">' +
               esc(row.contact_email) + '</a>' : '') +
             (site ? '<a class="card__link" href="' + site + '">Website' + chev() + '</a>' : '') +
             '</article>';
    }).join('');
  });
})();
