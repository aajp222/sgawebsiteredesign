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


  /* --- Flashcard deck ----------------------------------------------------- */
  function initFlashcards() {
    var root = document.querySelector('[data-flashdeck]');
    if (!root) return;
    var list = root.querySelector('.flashlist');
    if (!list) return;

    var cards = Array.prototype.map.call(list.querySelectorAll('.flashlist__item'), function (li) {
      return {
        tag: li.getAttribute('data-tag') || '',
        q: li.querySelector('.flashlist__q').innerHTML,
        a: li.querySelector('.flashlist__a').innerHTML,
        why: li.querySelector('.flashlist__why').innerHTML
      };
    });
    if (!cards.length) return;
    var original = cards.slice();
    var i = 0;

    var deck = document.createElement('div');
    deck.className = 'deck';
    deck.setAttribute('role', 'group');
    deck.setAttribute('aria-label', 'Flashcards');
    deck.innerHTML =
      '<div class="deck__meta"><span class="deck__count" aria-live="polite"></span><span class="deck__tag"></span></div>' +
      '<div class="deck__stack">' +
        '<button class="fcard" type="button" aria-label="Flip card">' +
          '<span class="fcard__inner">' +
            '<span class="fcard__face fcard__front"><span class="fcard__label">Question</span><span class="fcard__q"></span><span class="fcard__hint">Click to flip</span></span>' +
            '<span class="fcard__face fcard__back"><span class="fcard__label">Answer</span><span class="fcard__ans"></span><span class="fcard__why"></span></span>' +
          '</span>' +
        '</button>' +
      '</div>' +
      '<div class="deck__nav">' +
        '<button class="btn btn--ghost btn--sm" type="button" data-prev>Previous</button>' +
        '<button class="btn btn--sm" type="button" data-next>Next</button>' +
        '<button class="btn btn--light btn--sm" type="button" data-shuffle>Shuffle</button>' +
      '</div>';

    var $ = function (sel) { return deck.querySelector(sel); };
    var card = $('.fcard'), stack = $('.deck__stack');
    var prev = $('[data-prev]'), next = $('[data-next]');

    function render() {
      var c = cards[i];
      card.classList.remove('is-flipped');
      $('.deck__count').textContent = 'Card ' + (i + 1) + ' of ' + cards.length;
      $('.deck__tag').textContent = c.tag;
      $('.fcard__q').innerHTML = c.q;
      $('.fcard__ans').innerHTML = c.a;
      $('.fcard__why').innerHTML = c.why;
      prev.disabled = i === 0;
      next.disabled = i === cards.length - 1;
      stack.classList.toggle('is-last', i === cards.length - 1);
    }

    function go(step) {
      var n = i + step;
      if (n < 0 || n >= cards.length) return;
      i = n;
      render();
    }

    card.addEventListener('click', function () {
      var flipped = card.classList.toggle('is-flipped');
      card.setAttribute('aria-label', flipped ? 'Flip back to the question' : 'Flip card');
    });
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    $('[data-shuffle]').addEventListener('click', function () {
      cards = original.slice();
      for (var k = cards.length - 1; k > 0; k--) {
        var j = Math.floor(Math.random() * (k + 1));
        var t = cards[k]; cards[k] = cards[j]; cards[j] = t;
      }
      i = 0;
      render();
    });
    deck.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { go(1); }
      else if (e.key === 'ArrowLeft') { go(-1); }
    });

    list.hidden = true;
    root.appendChild(deck);
    render();
  }

  function init() {
    initNav();
    initAccordions();
    initReveal();
    initFilters();
    initFlashcards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
