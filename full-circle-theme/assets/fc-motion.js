/* Full Circle — motion signature (GSAP + ScrollTrigger, both bundled with the theme).
 * Hero: the logo assembles from its own pieces (brush ring, ink stroke, crimson mark,
 * lettering), idles with the crimson mark swaying on the stroke, rolls the mark along the
 * stroke on hover or press, and comes apart gracefully on scroll. Show lists draw their rule.
 * Content is fully visible without this file: the complete logo shows until the script
 * swaps in the layers, and hidden states are only set immediately before they animate. */
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

  /* ---------- Hero: the logo, piece by piece ---------- */

  var RAIL = { min: -30, max: 27 };       // how far the crimson mark can roll along the stroke (% of canvas)
  var MARK_CENTER_X = 0.4997;             // crimson mark centre on the canvas
  var MARK_DIAMETER = 0.215;              // crimson mark diameter as a share of the canvas width

  function heroLogo(hero) {
    var mark = hero.querySelector('[data-fc-logo]');
    if (!mark) return;
    var layered = mark.hasAttribute('data-fc-layered');
    var cleanups = [];

    if (!layered) {
      // A merchant-supplied logo: one image, so a simpler entrance and exit.
      var logo = mark.querySelector('.fc-hero__logo');
      gsap.fromTo(logo, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 1, ease: 'power3.out', clearProps: 'opacity' });
      if (window.ScrollTrigger) gsap.to(logo, { scale: 0.86, opacity: 0.35, ease: 'none', scrollTrigger: { trigger: hero, start: 0, end: 'bottom top', scrub: 0.4 } });
      return function () {};
    }

    var span = function (name) { return mark.querySelector('[data-layer="' + name + '"]'); };
    var img = function (name) { return span(name).querySelector('img'); };
    var ring = img('ring'); var stroke = img('stroke'); var crimson = img('crimson');
    var textBlack = img('text-black'); var textRed = img('text-red');
    mark.classList.add('is-layered');
    cleanups.push(function () { mark.classList.remove('is-layered'); });

    /* Entrance (~3.9 s). Headline and buttons are usable throughout. */
    var idle;
    var entrance = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: function () { if (idle) idle.play(0); } });
    ring.classList.add('is-sweeping');
    ring.style.setProperty('--sweep', '0deg');
    gsap.set([textBlack, textRed, crimson], { opacity: 0 });
    gsap.set(stroke, { clipPath: 'inset(0% 92% 0% 0%)' });
    entrance
      // 1. the brush ring is painted, following the circle from its thin start
      .to(ring, {
        '--sweep': '362deg', duration: 1.5, ease: 'power2.inOut',
        onComplete: function () { ring.classList.remove('is-sweeping'); ring.style.removeProperty('--sweep'); }
      }, 0.1)
      .fromTo(ring, { rotation: -9, scale: 0.95 }, { rotation: 0, scale: 1, duration: 1.7, ease: 'power2.out' }, 0.1)
      // 2. the ink stroke is pulled across, left to right
      .to(stroke, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.75, ease: 'power3.inOut' }, 1.05)
      // 3. the crimson mark drops in, bounces on the stroke, squashes, rolls and settles
      .fromTo(crimson, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'none' }, 1.7)
      .fromTo(crimson, { yPercent: -36, rotation: -220, scale: 0.55 }, { yPercent: 0, rotation: 0, scale: 1, duration: 1, ease: 'bounce.out' }, 1.7)
      .to(crimson, { scaleX: 1.14, scaleY: 0.86, duration: 0.11, ease: 'power2.out', yoyo: true, repeat: 1 }, 2.66)
      .to(crimson, { xPercent: 7, rotation: 75, duration: 0.38, ease: 'power2.out' }, 2.92)
      .to(crimson, { xPercent: 0, rotation: 0, duration: 0.8, ease: 'elastic.out(1, 0.45)' }, 3.3)
      // 4. the lettering slides along its curve and settles
      .fromTo(textBlack, { opacity: 0, rotation: -16 }, { opacity: 1, rotation: 0, duration: 0.95 }, 2.5)
      .fromTo(textRed, { opacity: 0, rotation: 15 }, { opacity: 1, rotation: 0, duration: 0.95 }, 2.72);

    /* Idle: now and then the mark sways on the stroke, like a coin settling. */
    idle = gsap.timeline({ repeat: -1, paused: true, delay: 0 })
      .to({}, { duration: 2.2 })
      .to(crimson, { xPercent: 1.3, rotation: 22, duration: 1.4, ease: 'sine.inOut' })
      .to(crimson, { xPercent: -1.1, rotation: -18, duration: 2.4, ease: 'sine.inOut' })
      .to(crimson, { xPercent: 0, rotation: 0, duration: 1.3, ease: 'sine.inOut' });

    /* Interaction: the crimson mark rides the ink stroke. */
    var busy = false;
    var lastPointer = 'mouse';
    var resumeTimer;
    function rotationFor(pct) {
      return (pct / 100) / (Math.PI * MARK_DIAMETER) * 360; // a real roll: distance ÷ circumference
    }
    function pctFor(clientX) {
      var r = mark.getBoundingClientRect();
      var pct = ((clientX - r.left) / r.width - MARK_CENTER_X) * 100;
      return Math.max(RAIL.min, Math.min(RAIL.max, pct));
    }
    function hold() { idle.pause(); clearTimeout(resumeTimer); }
    function resumeLater(ms) {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(function () { if (!busy) idle.play(0); }, ms);
    }
    function rollHome(delay) {
      gsap.to(crimson, { xPercent: 0, yPercent: 0, rotation: 0, duration: 1.1, delay: delay || 0, ease: 'elastic.out(1, 0.4)', overwrite: 'auto' });
      resumeLater(1800 + (delay || 0) * 1000);
    }

    function onMove(e) {
      if (busy || e.pointerType !== 'mouse' || entrance.isActive()) return;
      hold();
      var pct = pctFor(e.clientX);
      gsap.to(crimson, { xPercent: pct, yPercent: 0, rotation: rotationFor(pct), duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
    }
    function onLeave(e) {
      if (busy || e.pointerType !== 'mouse') return;
      rollHome();
    }
    function onDown(e) { lastPointer = e.pointerType || 'mouse'; }
    function onActivate(e) {
      if (entrance.isActive()) entrance.progress(1);
      hold();
      busy = true;
      var keyboard = !e.detail;
      var current = gsap.getProperty(crimson, 'xPercent') || 0;
      var target = keyboard ? RAIL.max : (lastPointer === 'mouse' ? current : pctFor(e.clientX));
      var spin = rotationFor(target);
      var tl = gsap.timeline({ onComplete: function () { busy = false; if (lastPointer !== 'mouse' || keyboard || !mark.matches(':hover')) rollHome(0.15); else resumeLater(2500); } });
      tl.to(crimson, { xPercent: target, rotation: spin, duration: keyboard || lastPointer !== 'mouse' ? 0.55 : 0.01, ease: 'power2.out', overwrite: 'auto' })
        // hop off the stroke with a full spin, then bounce back onto it
        .to(crimson, { yPercent: -13, rotation: '+=360', duration: 0.28, ease: 'power2.out' })
        .to(crimson, { yPercent: 0, duration: 0.6, ease: 'bounce.out' })
        // the ring and stroke feel the landing
        .to(ring, { keyframes: [{ rotation: 2.5, duration: 0.08 }, { rotation: -1.5, duration: 0.12 }, { rotation: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' }] }, '-=0.45')
        .to(stroke, { keyframes: [{ yPercent: 0.6, duration: 0.08 }, { yPercent: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' }] }, '<');
    }
    mark.addEventListener('pointermove', onMove);
    mark.addEventListener('pointerleave', onLeave);
    mark.addEventListener('pointerdown', onDown);
    mark.addEventListener('click', onActivate);
    cleanups.push(function () {
      mark.removeEventListener('pointermove', onMove);
      mark.removeEventListener('pointerleave', onLeave);
      mark.removeEventListener('pointerdown', onDown);
      mark.removeEventListener('click', onActivate);
      clearTimeout(resumeTimer);
    });

    // Pause the idle sway while the hero is off screen.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (!en.isIntersecting) idle.pause(); else if (!entrance.isActive() && !busy) idle.play(); });
      });
      io.observe(hero);
      cleanups.push(function () { io.disconnect(); });
    }

    /* Exit on scroll: the logo comes apart in reverse, scrubbed to the scrollbar. */
    if (window.ScrollTrigger) {
      gsap.set([span('ring'), span('text-black'), span('text-red')], { transformOrigin: '50.57% 45.71%' });
      gsap.set(span('crimson'), { transformOrigin: '49.97% 47.82%' });
      gsap.timeline({ scrollTrigger: { trigger: hero, start: 0, end: 'bottom top', scrub: 0.4 } })
        .to(span('crimson'), { xPercent: RAIL.max, rotation: rotationFor(RAIL.max), ease: 'none' }, 0)
        .to(span('crimson'), { opacity: 0, ease: 'power1.in' }, 0.35)
        .to(span('stroke'), { clipPath: 'inset(0% 0% 0% 92%)', ease: 'power1.in' }, 0.1)
        .to(span('text-black'), { rotation: -12, opacity: 0, ease: 'power1.in' }, 0)
        .to(span('text-red'), { rotation: 12, opacity: 0, ease: 'power1.in' }, 0)
        .to(span('ring'), { scale: 0.82, rotation: 25, opacity: 0.12, ease: 'power1.in' }, 0);
    }

    return function () { cleanups.forEach(function (fn) { fn(); }); };
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
      var cleanup;
      contexts[key] = gsap.context(function () { cleanup = heroLogo(hero); }, hero);
      contexts[key].add(function () { return function () { if (cleanup) cleanup(); }; });
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
