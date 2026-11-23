/* Full Circle — motion signature (GSAP + ScrollTrigger).
 * Three moments: the hero arrival along the brush arc, the event bill drawing its rule,
 * and a quiet foil sheen on the hero sticker. Content is fully visible without this file;
 * hidden states are only set here, immediately before they animate. */
(function () {
  'use strict';

  var FC = window.FC || {};
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var contexts = {};
  var observers = {};

  if (!window.gsap || FC.motion === false) return;
  var gsap = window.gsap;
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

  function sectionKey(el) {
    var wrap = el.closest('.shopify-section');
    return (wrap && wrap.id) || el.getAttribute('data-section-id') || 'root';
  }

  /* ---------- Hero arrival ---------- */

  function heroArrival(hero) {
    var reveal = hero.querySelector('[data-fc-hero-reveal]');
    var breakout = hero.querySelector('[data-fc-hero-breakout]');
    var stroke = hero.querySelector('[data-fc-hero-stroke] .fc-hero__stroke-img');
    var dot = hero.querySelector('[data-fc-hero-dot]');
    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    if (reveal) {
      reveal.classList.add('is-sweeping');
      reveal.style.setProperty('--sweep', '0deg');
      tl.to(reveal, {
        '--sweep': '361deg',
        duration: 1.15,
        ease: 'power2.inOut',
        onComplete: function () {
          reveal.classList.remove('is-sweeping');
          reveal.style.removeProperty('--sweep');
        }
      }, 0);
    }
    if (stroke) {
      tl.fromTo(stroke, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.85, ease: 'power2.out', clearProps: 'transform' }, 0.2);
    }
    if (breakout) {
      tl.fromTo(breakout, { opacity: 0, scale: 0.9, rotation: -10 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.7, clearProps: 'opacity,transform' }, 0.75);
    }
    if (dot) {
      // The crimson ring drifts in and settles onto the ink stroke, like the logo.
      tl.fromTo(dot,
        { opacity: 0, yPercent: -50, y: -46, rotation: -140, scale: 0.7 },
        { opacity: 1, yPercent: -50, y: 0, rotation: 0, scale: 1, duration: 0.9, ease: 'back.out(1.6)' },
        0.85);
    }
    return tl;
  }

  function heroPointer(hero) {
    var breakout = hero.querySelector('[data-fc-hero-breakout]');
    if (!breakout || !finePointer.matches) return null;
    var setX = gsap.quickTo(breakout, '--fx', { duration: 0.9, ease: 'power3.out' });
    var setY = gsap.quickTo(breakout, '--fy', { duration: 0.9, ease: 'power3.out' });
    function onMove(e) {
      var r = hero.getBoundingClientRect();
      setX(((e.clientX - r.left) / r.width - 0.5) * 2);
      setY(((e.clientY - r.top) / r.height - 0.5) * 2);
    }
    function onLeave() { setX(0); setY(0); }
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerleave', onLeave);
    return function () {
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
    };
  }

  function watchVisibility(hero, key) {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { hero.classList.toggle('is-offscreen', !entry.isIntersecting); });
    });
    io.observe(hero);
    observers[key] = observers[key] || [];
    observers[key].push(io);
  }

  /* ---------- Event bill ---------- */

  function billReveal(section) {
    var rule = section.querySelector('[data-fc-rule]');
    var rows = section.querySelectorAll('[data-fc-bill] > .fc-bill__item:not([hidden])');
    if (!window.ScrollTrigger) return;
    var r = section.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.85 && r.bottom > 0 && !FC.designMode) {
      // Already on screen at load (deep link, refresh mid-page): leave it as is.
      return;
    }

    var dates = [];
    var venues = [];
    var metas = [];
    Array.prototype.forEach.call(rows, function (row) {
      var d = row.querySelector('[data-fc-reveal="date"]');
      var v = row.querySelector('[data-fc-reveal="venue"]');
      var m = row.querySelector('[data-fc-reveal="meta"]');
      if (d) dates.push(d);
      if (v) venues.push(v);
      if (m) metas.push(m);
    });

    var tl = gsap.timeline({
      paused: true,
      defaults: { ease: 'power3.out', duration: 0.6 }
    });
    if (rule) tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: 'power2.inOut', clearProps: 'transform' }, 0);
    if (dates.length) tl.fromTo(dates, { x: -22, opacity: 0 }, { x: 0, opacity: 1, stagger: 0.07, clearProps: 'transform,opacity' }, 0.25);
    if (venues.length) tl.fromTo(venues, { x: 22, opacity: 0 }, { x: 0, opacity: 1, stagger: 0.07, clearProps: 'transform,opacity' }, 0.3);
    if (metas.length) tl.fromTo(metas, { opacity: 0 }, { opacity: 1, stagger: 0.07, duration: 0.4, clearProps: 'opacity' }, 0.45);

    window.ScrollTrigger.create({
      trigger: section,
      start: 'top 85%',
      once: true,
      onEnter: function () { tl.play(); },
      // Scrolled past quickly (or jumped below): finish instantly instead of animating late.
      onEnterBack: function () { tl.progress(1); }
    });
    // If the visitor lands below the section, never leave it in its starting state.
    if (r.bottom < 0) tl.progress(1);
  }

  /* ---------- init / teardown ---------- */

  function init(root) {
    if (reduce.matches) return;
    document.documentElement.classList.add('fc-motion-on');

    var heroes = root.querySelectorAll ? root.querySelectorAll('[data-fc-hero]') : [];
    if (root.matches && root.matches('[data-fc-hero]')) heroes = [root];
    Array.prototype.forEach.call(heroes, function (hero) {
      var key = sectionKey(hero);
      var cleanupPointer;
      contexts[key] = gsap.context(function () {
        heroArrival(hero);
        cleanupPointer = heroPointer(hero);
      }, hero);
      contexts[key].add(function () { return function () { if (cleanupPointer) cleanupPointer(); }; });
      watchVisibility(hero, key);
    });

    var bills = root.querySelectorAll ? root.querySelectorAll('[data-fc-shows]') : [];
    Array.prototype.forEach.call(bills, function (section) {
      var key = sectionKey(section) + ':bill';
      contexts[key] = gsap.context(function () { billReveal(section); }, section);
    });
  }

  function teardown(root) {
    Object.keys(contexts).forEach(function (key) {
      var base = key.replace(':bill', '');
      if (!root || root === document || (root.id && root.id === base)) {
        contexts[key].revert();
        delete contexts[key];
      }
    });
    Object.keys(observers).forEach(function (key) {
      if (!root || root === document || (root.id && root.id === key)) {
        observers[key].forEach(function (io) { io.disconnect(); });
        delete observers[key];
      }
    });
  }

  function start() { init(document); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  document.addEventListener('shopify:section:load', function (e) { init(e.target); if (window.ScrollTrigger) window.ScrollTrigger.refresh(); });
  document.addEventListener('shopify:section:unload', function (e) { teardown(e.target); });

  var onReduceChange = function () {
    if (reduce.matches) {
      teardown(document);
      document.documentElement.classList.remove('fc-motion-on');
    }
  };
  if (reduce.addEventListener) reduce.addEventListener('change', onReduceChange);
})();
