/* The Showcase (generic Albert Collects theme). Markup: snippets/ac-showcase.liquid. Styles: albert-showcase.css.
   Plain ES5 so it also runs on older iPads.

   A slow, continuous display of real cards, made to be watched. Touch is optional and never a game:
     swipe  -> the cards glide with the finger's momentum, then ease back to their drift
     tap    -> that card comes forward with one slow turn and a sweep of foil light; its name, price and a button to
               its real listing appear. Tap elsewhere, press Escape, or wait, and it returns to the flow.
     touch on empty space -> the light moves to the finger.

   Cards: on the kiosk they are read from the kiosk's own grid on this page (so they are exactly today's inventory,
   scanned cards included, sold ones left out). On the homepage they come from data elements in the markup.
   The loop stops while the showcase is off screen, the tab is hidden, a card view or the Vault is open.
   Reduced motion or an older browser: a still, composed row that can still be swiped and tapped.
   No sound, no network requests of its own (only the card photos), nothing stored. */
(function () {
  'use strict';
  var html = document.documentElement;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var now = function () { return window.performance && performance.now ? performance.now() : Date.now(); };
  var raf = window.requestAnimationFrame || function (fn) { return setTimeout(function () { fn(now()); }, 16); };
  var modern = !!(window.CSS && CSS.supports && CSS.supports('aspect-ratio', '1 / 1'));
  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var still = function () { return !modern || !!reduceQuery.matches; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var resize = function (url, width) { return url ? url.replace(/([?&]width=)\d+/, '$1' + width) : ''; };

  function kioskItems() {
    var out = [], seen = {};
    each(document.querySelectorAll('[data-ac-kiosk-item]'), function (el) {
      var get = function (name) { return el.getAttribute('data-' + name) || ''; };
      var ref = get('ref'), img = get('front');
      if (!img || get('state') === 'sold' || seen[get('kind') + ref]) return;
      seen[get('kind') + ref] = true;
      out.push({ ref: ref, kind: get('kind'), name: get('name'), price: get('price'), img: resize(img, 540), url: get('url'),
        meta: [get('set'), get('number'), get('language'), get('condition')].filter(Boolean).join(' · '),
        tag: get('placement') === 'behind' ? 'Behind the Table · ask to see it' : 'On display today', behind: get('placement') === 'behind' });
    });
    out.sort(function (a, b) { return (a.behind ? 1 : 0) - (b.behind ? 1 : 0); }); // what is on display leads
    return out.slice(0, 14);
  }
  function dataItems(root) {
    var out = [];
    each(root.querySelectorAll('[data-acs-item]'), function (el) {
      var get = function (name) { return el.getAttribute('data-' + name) || ''; };
      if (get('img')) out.push({ ref: get('ref'), name: get('name'), price: get('price'), img: get('img'), url: get('url'), meta: get('meta'), tag: get('tag') || 'Available today' });
    });
    return out.slice(0, 12);
  }

  // "Browse Available Cards" on the kiosk: straight to the search bar and the cards. It works with or without the
  // showcase itself (no inventory, or the effects unavailable).
  each(document.querySelectorAll('[data-acs-browse]'), function (button) {
    button.addEventListener('click', function () {
      var bar = document.querySelector('[data-ac-kiosk-bar]') || document.querySelector('[data-ac-kiosk-panel]');
      if (!bar) return;
      var y = bar.getBoundingClientRect().top + (window.pageYOffset || 0) - 12;
      try { window.scrollTo({ top: y, behavior: reduceQuery.matches ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, y); }
    });
  });

  each(document.querySelectorAll('[data-acs]'), function (root) {
    var mode = root.getAttribute('data-acs');
    var stage = root.querySelector('[data-acs-stage]');
    var front = root.querySelector('[data-acs-front]');
    var back = root.querySelector('[data-acs-back]');
    var spot = root.querySelector('[data-acs-spot]');
    var pulse = root.querySelector('[data-acs-pulse]');
    var panel = root.querySelector('[data-acs-panel]');
    var listing = root.querySelector('[data-acs-listing]');
    if (!stage || !front) return;
    var items = mode === 'kiosk' ? kioskItems() : dataItems(root);
    if (!items.length) { root.classList.add('is-empty'); return; }

    /* ---------- build ---------- */
    var flowing = items.length >= 3;                 // one or two cards simply stand side by side
    var slots = [];
    if (flowing) { while (slots.length < Math.max(8, items.length)) slots.push(items[slots.length % items.length]); }
    else slots = items.slice();
    var COUNT = slots.length;
    function makeCard(item, backRow) {
      var el = document.createElement(backRow ? 'span' : 'button');
      el.className = 'acs-card' + (backRow ? ' acs-card--back' : '');
      if (!backRow) { el.type = 'button'; el.setAttribute('aria-label', item.name + (item.price ? ', ' + item.price : '') + '. Show this card.'); }
      var body = document.createElement('span'); body.className = 'acs-card-body';
      var img = document.createElement('img');
      img.alt = ''; img.decoding = 'async'; img.draggable = false;
      img.addEventListener('load', function () {
        // the card takes the photo's own shape (within reason), so nothing is cropped or padded
        var ratio = clamp(img.naturalHeight / Math.max(1, img.naturalWidth), 1.2, 1.62);
        body.style.paddingTop = (ratio * 100).toFixed(2) + '%';
      });
      img.addEventListener('error', function () { el.style.display = 'none'; el.__dead = true; });
      img.src = backRow ? resize(item.img, 360) : item.img;
      body.appendChild(img);
      if (!backRow) { ['acs-sheen', 'acs-holo'].forEach(function (name) { var s = document.createElement('span'); s.className = name; body.appendChild(s); }); }
      var shade = document.createElement('span'); shade.className = 'acs-shade'; body.appendChild(shade);
      el.appendChild(body);
      return { el: el, item: item, sheen: body.querySelector('.acs-sheen'), shade: shade, holo: body.querySelector('.acs-holo') };
    }
    var cards = slots.map(function (item) { var c = makeCard(item, false); front.appendChild(c.el); return c; });
    var backs = [];
    if (flowing && back) for (var b = 0; b < Math.min(7, COUNT); b++) { var bc = makeCard(slots[(b * 2 + 3) % COUNT], true); back.appendChild(bc.el); backs.push(bc); }
    root.classList.add('is-live');

    /* ---------- state ---------- */
    var STEP = 15 * Math.PI / 180;      // angle between neighbours on the curve
    var DRIFT = 0.15;                   // cards per second, at rest
    var W = 0, H = 0, cardW = 150, radius = 600, cx = 0, awake = false, cameFrom = null, looping = false, lite = !modern;
    var pos = 0, vel = DRIFT, last = 0, frames = 0, slow = 0;
    var light = { x: 0.5, to: 0.5, held: 0 }, nudge = 0;
    var focus = null;                   // { i, t0, tx, ty, x, y, at }
    var drag = null, quietUntil = 0, touchedAt = -1e9, lastTouch = 0;
    function measure() {
      W = stage.clientWidth; H = stage.clientHeight;
      var first = cards[0].el;
      cardW = first.offsetWidth || 150;
      radius = cardW * 4.15;
      cx = front.offsetLeft;
    }
    function wrap(d) { return flowing ? d - COUNT * Math.round(d / COUNT) : d; }
    function setT(el, t) { el.style.webkitTransform = t; el.style.transform = t; }

    /* ---------- one frame ---------- */
    function place(t, dt) {
      var quiet = still();
      var bob = quiet ? 0 : 1;
      var lightPx = light.x * W;
      for (var i = 0; i < COUNT; i++) {
        var c = cards[i];
        if (c.el.__dead) continue;
        var d = flowing ? wrap(i - pos) : i - (COUNT - 1) / 2;
        var a = Math.abs(d);
        var isFocus = focus && focus.i === i;
        if (a > 4.9 && !isFocus) { if (c.shown) { c.el.style.opacity = '0'; c.el.style.pointerEvents = 'none'; c.shown = false; } continue; }
        var th = d * STEP;
        var x = Math.sin(th) * radius, z = (Math.cos(th) - 1) * radius;
        var y = bob * Math.sin(t / 1900 + i * 1.7) * cardW * 0.035;
        var ry = th * 57.2958 * 0.62 + nudge * 7, rx = bob * Math.sin(t / 2600 + i) * 1.6, sc = 1 + 0.07 * Math.max(0, 1 - a);
        var alpha = a < 3.3 ? 1 : Math.max(0, 1 - (a - 3.3) / 1.3);
        var shade = Math.min(0.62, a * 0.12);
        if (focus) {
          if (isFocus) {
            var p = clamp((t - focus.t0) / 950, 0, 1), e = 1 - Math.pow(1 - p, 3);
            x = (W * (W >= 900 ? 0.545 : 0.5) - cx) * e + x * (1 - e);
            z = z * (1 - e) + cardW * 1.05 * e;
            y = y * (1 - e) - cardW * 0.06 * e;
            // one slow presenting turn, then it follows the finger (or sways on its own)
            var turn = quiet ? 0 : Math.sin(p * Math.PI) * 34 * (1 - p * 0.35);
            focus.x += (focus.tx - focus.x) * Math.min(1, dt * 7); focus.y += (focus.ty - focus.y) * Math.min(1, dt * 7);
            ry = ry * (1 - e) + turn + focus.y * e; rx = rx * (1 - e) + focus.x * e;
            sc = 1 + 0.36 * e; alpha = 1; shade = 0;
            if (c.holo && c.holo.style.setProperty) { c.holo.style.setProperty('--hx', (50 - focus.y / 16 * 40).toFixed(1) + '%'); c.holo.style.setProperty('--hy', (50 + focus.x / 13 * 40).toFixed(1) + '%'); }
            if (c.sheen) setT(c.sheen, 'translateX(' + (quiet ? -170 : (p < 1 ? -150 + e * 420 : 270)).toFixed(1) + '%)');
          } else {
            var out = clamp((t - focus.t0) / 600, 0, 1);
            z -= cardW * 0.7 * out; alpha *= 1 - 0.72 * out; shade = Math.min(0.8, shade + 0.3 * out);
          }
        }
        if (!isFocus && c.sheen) {
          // the band of light sits where the stage light is: it crosses each card as the card passes under it
          var s = (cx + x - lightPx) / (cardW * 1.9);
          setT(c.sheen, 'translateX(' + clamp(58 - s * 190, -170, 290).toFixed(1) + '%)');
        }
        setT(c.el, 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,' + z.toFixed(1) + 'px) rotateY(' + ry.toFixed(2) + 'deg) rotateX(' + rx.toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')');
        c.el.style.opacity = alpha.toFixed(3);
        c.el.style.zIndex = String(isFocus ? 400 : 200 - Math.round(a * 20));
        c.el.style.pointerEvents = alpha > 0.5 && (!focus || isFocus) ? 'auto' : 'none';
        c.shade.style.opacity = shade.toFixed(3);
        c.shown = true;
      }
      // the fainter row behind: same direction, slower, further away (parallax)
      if (!lite) for (var k = 0; k < backs.length; k++) {
        var bcard = backs[k];
        if (bcard.el.__dead) continue;
        var n = backs.length, bd = (k - pos * 0.42) - n * Math.round((k - pos * 0.42) / n);
        var bth = bd * STEP * 1.25, ba = Math.abs(bd);
        var bx = Math.sin(bth) * radius * 1.35, bz = (Math.cos(bth) - 1) * radius * 1.35 - cardW * 3.1;
        var by = bob * Math.sin(t / 2400 + k * 2.1) * cardW * 0.05;
        setT(bcard.el, 'translate3d(' + bx.toFixed(1) + 'px,' + by.toFixed(1) + 'px,' + bz.toFixed(1) + 'px) rotateY(' + (bth * 57.2958 * 0.5).toFixed(2) + 'deg)');
        bcard.el.style.opacity = (Math.max(0, 1 - ba / 3.2) * (focus ? 0.22 : 0.5)).toFixed(3);
        bcard.shade.style.opacity = '0.5';
      }
      if (spot) setT(spot, 'translate3d(' + (light.x * W).toFixed(1) + 'px,0,0)');
    }
    function frame(t) {
      if (!looping) return;
      var dt = Math.min(0.05, (t - last) / 1000 || 0.016);
      last = t;
      // A self-check, once: the first second (page still loading) is not counted; of the next 180 frames, if more than
      // half ran below about 30 a second, this device gets the lighter version. Gaps from pausing are not counted.
      if (!lite && frames < 240 && dt < 0.25) { frames++; if (frames > 60 && dt > 0.034) slow++; if (frames === 240 && slow > 100) { lite = true; root.classList.add('is-lite'); } }
      var quiet = still();
      if (focus) {
        // bring the chosen card to the middle and hold it there
        pos += wrap(focus.i - pos) * Math.min(1, dt * 6); vel = 0;
        if (!quiet && t - focus.at > 1800) { focus.tx = Math.sin(t / 1700) * 4; focus.ty = Math.cos(t / 2300) * 8; }
        if (t - focus.at > 15000) unfocus();
      } else if (!drag && flowing) {
        var rest = quiet ? 0 : DRIFT;
        vel += (rest - vel) * (1 - Math.exp(-(quiet ? 6 : 1.5) * dt));   // momentum fades back into the slow drift
        pos += vel * dt;
      }
      if (!quiet) {
        if (t > light.held) light.to = 0.5 + 0.34 * Math.sin(t / 5200) + 0.08 * Math.sin(t / 1900);
        light.x += (light.to - light.x) * Math.min(1, dt * (t > light.held ? 1.2 : 5));
      } else light.x += (light.to - light.x) * Math.min(1, dt * 5);
      nudge *= Math.exp(-3 * dt);
      place(t, dt);
      raf(frame);
    }
    function wake() {
      var should = awake && !document.hidden && !html.classList.contains('ac-kiosk-lock') && !html.classList.contains('ac-vault-lock');
      root.classList.toggle('is-asleep', !should);
      // Under the Vault (which covers the whole screen) the showcase is taken out of rendering altogether, not only paused:
      // its layers behind an opaque overlay still cost the browser time on every frame.
      root.classList.toggle('is-covered', html.classList.contains('ac-vault-lock'));
      if (should && !looping) { looping = true; last = now(); measure(); raf(frame); }
      else if (!should) looping = false;
    }

    /* ---------- a card brought forward ---------- */
    function fill(item) {
      var set = function (sel, text) { var el = root.querySelector(sel); if (el) el.textContent = text || ''; };
      set('[data-acs-tag]', item.tag); set('[data-acs-name]', item.name); set('[data-acs-meta]', item.meta); set('[data-acs-price]', item.price);
      if (!listing) return;
      var target = mode === 'kiosk' ? kioskTile(item) : null;
      listing.hidden = false;
      if (target && target.querySelector('[data-ac-kiosk-open]')) listing.setAttribute('href', '#' + (target.id || 'ac-courtside-grid'));
      else if (item.url) listing.setAttribute('href', item.url);
      else listing.hidden = true;                       // sold or gone since the page loaded: nothing to open
    }
    function kioskTile(item) {
      var found = null;
      each(document.querySelectorAll('[data-ac-kiosk-item]'), function (el) { if (!found && el.getAttribute('data-ref') === item.ref && el.getAttribute('data-kind') === item.kind) found = el; });
      return found;
    }
    function focusCard(i) {
      var t = now();
      if (focus && focus.i === i) { focus.t0 = t; focus.at = t; return; }   // tapped again: one more turn
      each(cards, function (c) { c.el.classList.remove('is-focus'); });
      focus = { i: i, t0: t, at: t, tx: 0, ty: 0, x: 0, y: 0 };
      cards[i].el.classList.add('is-focus');
      root.classList.add('is-focus', 'is-touched');
      if (root.parentNode) root.parentNode.classList.add('is-focus');
      fill(cards[i].item);
    }
    function unfocus() {
      if (!focus) return;
      cards[focus.i].el.classList.remove('is-focus');
      focus = null; vel = 0;
      root.classList.remove('is-focus');
      if (root.parentNode) root.parentNode.classList.remove('is-focus');
    }
    if (listing) listing.addEventListener('click', function (event) {
      if (!focus) { event.preventDefault(); return; }
      var item = cards[focus.i].item;
      if (mode !== 'kiosk') return;                    // homepage: a normal link to the listing
      var tile = kioskTile(item), opener = tile && tile.querySelector('[data-ac-kiosk-open]');
      if (opener) { event.preventDefault(); unfocus(); cameFrom = window.pageYOffset || 0; opener.click(); }   // the kiosk's own card view
      else if (!item.url) event.preventDefault();
    });
    each(root.querySelectorAll('[data-acs-back-to-flow]'), function (el) { el.addEventListener('click', unfocus); });
    document.addEventListener('keydown', function (event) { if (focus && (event.key === 'Escape' || event.key === 'Esc')) unfocus(); });

    /* ---------- touch and mouse ---------- */
    function ping(x, y) {
      var box = stage.getBoundingClientRect();
      light.to = clamp((x - box.left) / Math.max(1, box.width), 0.05, 0.95); light.held = now() + 2600;
      if (pulse && !still()) {
        if (pulse.style.setProperty) { pulse.style.setProperty('--px', (x - box.left).toFixed(0) + 'px'); pulse.style.setProperty('--py', (y - box.top).toFixed(0) + 'px'); }
        pulse.classList.remove('is-on'); void pulse.offsetWidth; pulse.classList.add('is-on');
      }
    }
    function begin(x, y, id, target) {
      lastTouch = now();
      drag = { id: id, x: x, y: y, lastX: x, lastT: now(), v: 0, locked: false, card: target && target.closest ? target.closest('.acs-card') : null };
      root.classList.add('is-touched');
      if (focus) focus.at = now();
    }
    function move(x, y, event) {
      if (!drag) return;
      var dx = x - drag.x, dy = y - drag.y;
      if (focus) {                                        // a card is forward: the finger tilts it
        var box = cards[focus.i].el.getBoundingClientRect();
        focus.ty = clamp(((x - box.left) / Math.max(1, box.width)) * 2 - 1, -1, 1) * 16;
        focus.tx = -clamp(((y - box.top) / Math.max(1, box.height)) * 2 - 1, -1, 1) * 12;
        focus.at = now(); drag.moved = Math.abs(dx) + Math.abs(dy) > 8;
        if (Math.abs(dx) > Math.abs(dy) && event && event.cancelable) event.preventDefault();
        return;
      }
      if (!drag.locked) {
        if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { drag = null; return; }   // the page scrolls
        if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
        drag.locked = true; drag.x = x; drag.lastX = x; drag.lastT = now();
        stage.classList.add('is-dragging');
      }
      if (event && event.cancelable) event.preventDefault();
      if (!flowing) return;
      var spacing = Math.max(40, cardW * 1.08), t = now(), dt = Math.max(1, t - drag.lastT);
      var step = -(x - drag.lastX) / spacing;
      pos += step;
      drag.v = drag.v * 0.4 + (step / dt * 1000) * 0.6;
      drag.lastX = x; drag.lastT = t;
      nudge = clamp(nudge + step * 0.5, -1, 1);
      light.to = clamp((x - stage.getBoundingClientRect().left) / Math.max(1, W), 0.05, 0.95); light.held = t + 1800;
      if (still() && !looping) place(now(), 0.016);
    }
    function end(x, y) {
      var d = drag;
      if (!d) return;
      drag = null; stage.classList.remove('is-dragging');
      if (d.locked) { quietUntil = Date.now() + 400; vel = now() - d.lastT > 90 ? 0 : clamp(d.v, -7, 7); return; }
      if (d.moved) { quietUntil = Date.now() + 300; return; }
      ping(x, y);
    }
    var fingerOf = function (event, id) { for (var i = 0; i < event.changedTouches.length; i++) if (event.changedTouches[i].identifier === id) return event.changedTouches[i]; return null; };
    stage.addEventListener('touchstart', function (event) { touchedAt = Date.now(); if (event.touches.length === 1) begin(event.touches[0].clientX, event.touches[0].clientY, event.touches[0].identifier, event.target); }, { passive: true });
    stage.addEventListener('touchmove', function (event) { if (!drag) return; var f = fingerOf(event, drag.id); if (f) move(f.clientX, f.clientY, event); }, { passive: false });
    var lift = function (event) { touchedAt = Date.now(); if (!drag) return; var f = fingerOf(event, drag.id); if (f) end(f.clientX, f.clientY); };
    stage.addEventListener('touchend', lift, { passive: true });
    stage.addEventListener('touchcancel', function () { touchedAt = Date.now(); drag = null; stage.classList.remove('is-dragging'); }, { passive: true });
    stage.addEventListener('mousedown', function (event) { if (event.button !== 0 || Date.now() - touchedAt < 800) return; begin(event.clientX, event.clientY, 'mouse', event.target); });
    document.addEventListener('mousemove', function (event) { if (drag && drag.id === 'mouse') move(event.clientX, event.clientY, event); });
    document.addEventListener('mouseup', function (event) { if (drag && drag.id === 'mouse') end(event.clientX, event.clientY); });
    stage.addEventListener('dragstart', function (event) { event.preventDefault(); });
    // A tap (not a swipe): on a card, bring it forward; anywhere else, send the forward card back.
    stage.addEventListener('click', function (event) {
      if (Date.now() < quietUntil) { event.preventDefault(); return; }
      var el = event.target.closest ? event.target.closest('.acs-card') : null;
      if (el) { for (var i = 0; i < COUNT; i++) if (cards[i].el === el) { focusCard(i); return; } }
      else if (focus) unfocus();
    });

    /* ---------- when to run ---------- */
    if ('IntersectionObserver' in window) new IntersectionObserver(function (entries) { entries.forEach(function (e) { awake = e.isIntersecting; }); wake(); }, { threshold: 0.08 }).observe(root);
    else awake = true;
    document.addEventListener('visibilitychange', wake);
    // The card view hands focus back to the card's tile in the grid when it closes, which would carry the page down to it.
    // Opened from the showcase, the visitor is brought back to the showcase instead.
    if (window.MutationObserver) new MutationObserver(function () {
      if (cameFrom !== null && !html.classList.contains('ac-kiosk-lock')) { var y = cameFrom; cameFrom = null; window.scrollTo(0, y); if (listing && listing.blur) { try { document.activeElement.blur(); } catch (e) {} } }
      wake();
    }).observe(html, { attributes: true, attributeFilter: ['class'] });
    var onChange = function (q, fn) { if (q.addEventListener) q.addEventListener('change', fn); else if (q.addListener) q.addListener(fn); };
    onChange(reduceQuery, function () { measure(); place(now(), 0.016); });
    window.addEventListener('resize', function () { measure(); if (!looping) place(now(), 0.016); });
    if (lite) root.classList.add('is-lite');
    measure(); place(now(), 0.016);
    wake();
  });
})();
