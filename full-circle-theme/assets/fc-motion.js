/* Full Circle — motion signature (GSAP + ScrollTrigger).
 * Hero: the logo sweeps in around its brush circle, and its orbit expands away on scroll
 * (the slow idle orbit is CSS; the press pulse lives in fc-theme.js). Show lists draw their rule. Content is fully visible without this file;
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

  /* ---------- Hero: load sweep and scroll hand-off ---------- */

  // Load: the logo is revealed by a circular sweep around its own brush circle, the orbit
  // track draws itself, and the mark settles. Headline and buttons are usable throughout.
  function heroArrival(hero) {
    var img = hero.querySelector('[data-fc-logo-img]');
    var track = hero.querySelector('[data-fc-track]');
    var spin = hero.querySelector('.fc-hero__spin');
    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    if (img) {
      img.classList.add('is-sweeping');
      img.style.setProperty('--sweep', '0deg');
      tl.to(img, {
        '--sweep': '361deg',
        duration: 1.2,
        ease: 'power2.inOut',
        onComplete: function () { img.classList.remove('is-sweeping'); img.style.removeProperty('--sweep'); }
      }, 0);
      tl.fromTo(img, { scale: 0.94 }, { scale: 1, duration: 0.55, ease: 'back.out(2.2)', clearProps: 'transform' }, 0.95);
    }
    if (track) tl.fromTo(track, { strokeDasharray: '0 100' }, { strokeDasharray: '100 0', duration: 1.2, ease: 'power2.inOut', clearProps: 'strokeDasharray' }, 0.1);
    if (spin) tl.fromTo(spin, { opacity: 0 }, { opacity: 1, duration: 0.6, clearProps: 'opacity' }, 1.05);
    return tl;
  }

  // Scroll: as the hero leaves, the mark eases down in scale and the orbit expands and fades
  // into the next section. Scrubbed transforms only, so native scrolling stays untouched.
  function heroScroll(hero) {
    if (!window.ScrollTrigger) return;
    var mark = hero.querySelector('[data-fc-logo]');
    var orbit = hero.querySelector('[data-fc-orbit]');
    var tl = gsap.timeline({
      scrollTrigger: { trigger: hero, start: 0, end: 'bottom top', scrub: 0.35 }
    });
    if (mark) tl.fromTo(mark, { scale: 1 }, { scale: 0.8, ease: 'none' }, 0);
    if (orbit) tl.fromTo(orbit, { scale: 1, opacity: 1 }, { scale: 1.9, opacity: 0, ease: 'power1.in' }, 0);
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
      contexts[key] = gsap.context(function () {
        heroArrival(hero);
        heroScroll(hero);
      }, hero);
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
