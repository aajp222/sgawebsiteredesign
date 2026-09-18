/* ==========================================================================
   site.js — progressive enhancement only. Every page works without it.
   ========================================================================== */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  /* --- Mobile navigation drawer ------------------------------------------ */
  function initNav() {
    var toggle = document.querySelector('.nav__toggle');
    var nav = document.getElementById('primary-nav');
    if (!toggle || !nav) return;

    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.nav__toggle-label').textContent = open ? 'Close' : 'Menu';
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });

    // Reset state when the drawer breakpoint is passed
    var mq = window.matchMedia('(min-width: 1081px)');
    var onChange = function (e) { if (e.matches) setOpen(false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
  }

  /* --- Accordions --------------------------------------------------------- */
  function initAccordions() {
    var triggers = document.querySelectorAll('.accordion__trigger');
    Array.prototype.forEach.call(triggers, function (trigger) {
      var panel = document.getElementById(trigger.getAttribute('aria-controls'));
      if (!panel) return;

      // Panels start collapsed only once JS is confirmed running, so a
      // no-JS visitor still sees all the content.
      var expanded = trigger.getAttribute('aria-expanded') === 'true';
      panel.hidden = !expanded;

      trigger.addEventListener('click', function () {
        var isOpen = trigger.getAttribute('aria-expanded') === 'true';
        trigger.setAttribute('aria-expanded', String(!isOpen));
        panel.hidden = isOpen;
      });
    });
  }

  /* --- Scroll reveal ------------------------------------------------------ */
  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    Array.prototype.forEach.call(items, function (el) { observer.observe(el); });
  }

  /* --- Minutes table term filter ----------------------------------------- */
  function initFilters() {
    var group = document.querySelector('[data-filter-group]');
    if (!group) return;

    var rows = document.querySelectorAll('[data-term]');
    var buttons = group.querySelectorAll('.filter-btn');
    var status = document.getElementById('filter-status');

    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        var term = btn.getAttribute('data-filter');
        var shown = 0;

        Array.prototype.forEach.call(buttons, function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });

        Array.prototype.forEach.call(rows, function (row) {
          var match = term === 'all' || row.getAttribute('data-term') === term;
          row.hidden = !match;
          if (match) shown++;
        });

        if (status) {
          status.textContent = shown + (shown === 1 ? ' meeting' : ' meetings') + ' shown.';
        }
      });
    });
  }

  function init() {
    initNav();
    initAccordions();
    initReveal();
    initFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
