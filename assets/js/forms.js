/* ==========================================================================
   forms.js — public submission forms.

   Anti-spam here is deliberately local: a honeypot field and a minimum fill
   time. A third-party captcha would mean an external request on every page,
   which the site does not otherwise make. The real ceiling is the per-hour
   rate limit enforced in Postgres (db/002_rls.sql) — this layer only turns
   away the cheap stuff.
   ========================================================================== */
(function () {
  'use strict';

  if (!window.SGA) return;

  var MIN_FILL_MS = 3000;

  function setStatus(form, message, kind) {
    var box = form.querySelector('[data-form-status]');
    if (!box) return;
    box.textContent = message;
    box.className = 'form-status is-' + kind;
    box.hidden = false;
  }

  function collect(form) {
    var row = {};
    Array.prototype.forEach.call(form.querySelectorAll('[data-field]'), function (el) {
      var name = el.getAttribute('data-field');
      var value = (el.value || '').trim();
      if (value) row[name] = value;
    });
    return row;
  }

  Array.prototype.forEach.call(document.querySelectorAll('form[data-submit-to]'), function (form) {
    var table = form.getAttribute('data-submit-to');
    var openedAt = Date.now();

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var honeypot = form.querySelector('[data-honeypot]');
      if (honeypot && honeypot.value) {
        // A bot filled the hidden field. Report success and drop it silently.
        setStatus(form, 'Thanks — that has been sent to the Senate.', 'ok');
        form.reset();
        return;
      }

      if (Date.now() - openedAt < MIN_FILL_MS) {
        setStatus(form, 'That was submitted very quickly — give it a moment and try again.', 'warn');
        return;
      }

      var button = form.querySelector('[type="submit"]');
      var row = collect(form);

      var required = (form.getAttribute('data-required') || '').split(',').filter(Boolean);
      var missing = required.filter(function (f) { return !row[f]; });
      if (missing.length) {
        setStatus(form, 'Please fill in every required field before sending.', 'warn');
        return;
      }

      if (button) { button.disabled = true; button.dataset.label = button.textContent; button.textContent = 'Sending…'; }
      setStatus(form, 'Sending…', 'warn');

      SGA.submit(table, row).then(function (res) {
        if (button) { button.disabled = false; button.textContent = button.dataset.label || 'Send'; }
        if (res.ok) {
          setStatus(form, form.getAttribute('data-success') ||
            'Thanks — that has been sent to the Senate.', 'ok');
          form.reset();
          openedAt = Date.now();
        } else {
          setStatus(form, res.message, 'error');
        }
      });
    });
  });
})();
