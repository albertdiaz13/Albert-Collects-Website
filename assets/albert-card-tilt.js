/*
 * Albert v3 card motion: shared tilt (mouse + finger drag), Fresh Finds holo foil, and card flip.
 * The stage (<a>) never transforms; only its inner plane does. Written in ES2017 syntax with no
 * optional chaining, so it parses on iOS 12 Safari. Everything here is an enhancement: photos,
 * links, prices, and cart forms work without this file.
 */
(function () {
  'use strict';
  var doc = document;
  var root = doc.documentElement;
  var noop = { matches: false };
  function mq(query) { return window.matchMedia ? window.matchMedia(query) : noop; }
  function onChange(list, fn) {
    if (!list || list === noop) return;
    if (list.addEventListener) list.addEventListener('change', fn);
    else if (list.addListener) list.addListener(fn);
  }
  function closest(node, selector) { return node && node.closest ? node.closest(selector) : null; }
  function find(node, selector) { return node ? node.querySelector(selector) : null; }
  function unit(value) { return Math.max(-1, Math.min(1, value)); }
  function now() { return Date.now(); }

  var reduceMotion = mq('(prefers-reduced-motion: reduce)');
  var supports3d = !!(window.CSS && CSS.supports && CSS.supports('transform-style', 'preserve-3d') && CSS.supports('backface-visibility', 'hidden'));
  var MAX_TILT = 12; // degrees at the outer edge of a card
  var gyroEnabled = false;
  var demoActive = false;

  root.classList.add('ac-tilt-ready');
  function syncFlipMode() { root.classList.toggle('ac-flip-swap', !supports3d || reduceMotion.matches); }
  syncFlipMode();
  onChange(reduceMotion, syncFlipMode);

  /* ---------- Shared, eased tilt engine ---------- */
  var states = new Map();
  var loop = 0;
  function stateFor(stage) {
    var state = states.get(stage);
    if (!state) {
      state = { plane: find(stage, '[data-ac-tilt-plane]'), holo: find(stage, '.ac-holo'), tx: 0, ty: 0, tz: 0, cx: 0, cy: 0, cz: 0, mx: 50, my: 50, hx: 50, hy: 50, ease: 0.18 };
      states.set(stage, state);
    }
    return state;
  }
  function schedule() { if (!loop) loop = requestAnimationFrame(tick); }
  function clearState(stage, state) {
    if (state.plane) {
      state.plane.style.removeProperty('transform');
      state.plane.classList.remove('is-tilting', 'is-holo');
    }
    states.delete(stage);
  }
  function tick() {
    loop = 0;
    var again = false;
    states.forEach(function (state, stage) {
      if (!stage.isConnected || !state.plane) { states.delete(stage); return; }
      state.cx += (state.tx - state.cx) * state.ease;
      state.cy += (state.ty - state.cy) * state.ease;
      state.cz += (state.tz - state.cz) * state.ease;
      state.hx += (state.mx - state.hx) * 0.22;
      state.hy += (state.my - state.hy) * 0.22;
      var moving = Math.abs(state.tx - state.cx) > 0.02 || Math.abs(state.ty - state.cy) > 0.02 || Math.abs(state.tz - state.cz) > 0.003 || Math.abs(state.mx - state.hx) > 0.1 || Math.abs(state.my - state.hy) > 0.1;
      if (!moving && state.tz === 0 && !state.active) { clearState(stage, state); return; }
      state.plane.classList.add('is-tilting');
      state.plane.style.transform = 'perspective(800px) rotateX(' + state.cx.toFixed(2) + 'deg) rotateY(' + state.cy.toFixed(2) + 'deg) scale(' + (1 + 0.03 * state.cz).toFixed(4) + ')';
      if (state.holo) {
        // Drive the foil from the eased tilt itself, so the reflection moves with the card, not just the cursor.
        var tiltX = state.cy / MAX_TILT, tiltY = -state.cx / MAX_TILT; // -1..1, follows the plane's rotation
        var tilt = Math.min(1, Math.sqrt(tiltX * tiltX + tiltY * tiltY));
        var style = state.holo.style;
        style.setProperty('--ac-mx', state.hx.toFixed(1) + '%');
        style.setProperty('--ac-my', state.hy.toFixed(1) + '%');
        style.setProperty('--ac-hyp', tilt.toFixed(3));
        // Rainbow bands slide opposite the tilt, like light catching foil as the card turns.
        style.setProperty('--ac-bx', (50 - tiltX * 34).toFixed(1) + '%');
        style.setProperty('--ac-by', (50 - tiltY * 34).toFixed(1) + '%');
        // Specular streak tracks the cursor; mapped for a 250% background so the bright band sits under the pointer.
        style.setProperty('--ac-sx', ((125 - state.hx) / 1.5).toFixed(1) + '%');
        style.setProperty('--ac-sy', ((125 - state.hy) / 1.5).toFixed(1) + '%');
      }
      if (moving) again = true;
    });
    if (again) schedule();
  }
  function aim(stage, clientX, clientY, options) {
    var box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    var nx = unit((clientX - box.left) / box.width * 2 - 1);
    var ny = unit((clientY - box.top) / box.height * 2 - 1);
    var state = stateFor(stage);
    state.active = true;
    state.ease = options.ease;
    state.tx = -ny * options.maxX;
    state.ty = nx * options.maxY;
    state.tz = 1;
    state.mx = (nx + 1) * 50;
    state.my = (ny + 1) * 50;
    schedule();
  }
  function release(stage) {
    var state = states.get(stage);
    if (!state) return;
    state.active = false;
    state.ease = 0.12; // a slower, soft return to neutral
    state.tx = state.ty = state.tz = 0;
    if (state.plane) state.plane.classList.remove('is-holo');
    schedule();
  }
  function releaseAll() { states.forEach(function (state, stage) { release(stage); }); }
  function flattenNow() {
    cancelAnimationFrame(loop); loop = 0;
    states.forEach(function (state, stage) { clearState(stage, state); });
  }

  /* ---------- Holo foil (desktop mouse hover only, opted-in shelves only) ---------- */
  function fitHolo(stage) {
    // Clip the foil to the visible photo pixels (the image uses object-fit: contain).
    var holo = find(stage, '.ac-holo');
    var img = find(stage, '.ac-face--front .ac-product-photo');
    if (!holo || !img) return null;
    var boxW = img.offsetWidth, boxH = img.offsetHeight;
    var natW = img.naturalWidth || Number(img.getAttribute('width')) || boxW;
    var natH = img.naturalHeight || Number(img.getAttribute('height')) || boxH;
    if (!boxW || !boxH || !natW || !natH) return null;
    var scale = Math.min(boxW / natW, boxH / natH);
    var w = natW * scale, h = natH * scale;
    holo.style.left = (img.offsetLeft + (boxW - w) / 2).toFixed(1) + 'px';
    holo.style.top = (img.offsetTop + (boxH - h) / 2).toFixed(1) + 'px';
    holo.style.width = w.toFixed(1) + 'px';
    holo.style.height = h.toFixed(1) + 'px';
    return holo;
  }

  /* ---------- Foil on touch screens: the same layers, lit by the tilt itself ----------
     Used by phone motion and the tilt preview, where there is no pointer. rx / ry are the plane's rotation in degrees
     and max is the largest tilt that input produces. Finger-drag tilt goes through the shared tick() above instead.
     Modern browsers only: the first-generation iPad keeps its plain tilt. */
  var touchHolo = !!(window.CSS && CSS.supports && CSS.supports('aspect-ratio', '1 / 1'));
  function shine(stage, plane, rx, ry, max) {
    if (!touchHolo || !stage.hasAttribute('data-ac-holo')) return;
    var card = closest(stage, '.ac-product-card');
    if (card && card.classList.contains('is-flipped')) { plane.classList.remove('is-holo'); return; }
    var holo = stage.__acHolo || (stage.__acHolo = fitHolo(stage)); // retried until the photo has a size
    if (!holo) return;
    var tiltX = unit(ry / max), tiltY = unit(-rx / max);
    var mx = 50 + tiltX * 44, my = 50 + tiltY * 44;
    var style = holo.style;
    style.setProperty('--ac-mx', mx.toFixed(1) + '%');
    style.setProperty('--ac-my', my.toFixed(1) + '%');
    style.setProperty('--ac-hyp', Math.min(1, Math.sqrt(tiltX * tiltX + tiltY * tiltY)).toFixed(3));
    style.setProperty('--ac-bx', (50 - tiltX * 34).toFixed(1) + '%');
    style.setProperty('--ac-by', (50 - tiltY * 34).toFixed(1) + '%');
    style.setProperty('--ac-sx', ((125 - mx) / 1.5).toFixed(1) + '%');
    style.setProperty('--ac-sy', ((125 - my) / 1.5).toFixed(1) + '%');
    plane.classList.add('is-holo');
  }

  /* ---------- Mouse: tilt everywhere, foil where opted in ---------- */
  var lastTouchAt = 0;
  var mouseArea = null, mouseStage = null;
  function isRealMouse(event) {
    if (now() - lastTouchAt < 900) return false; // compatibility mouse events after a tap
    if (event.sourceCapabilities && event.sourceCapabilities.firesTouchEvents) return false;
    return true;
  }
  function endMouse() {
    if (mouseStage) release(mouseStage);
    mouseStage = mouseArea = null;
  }
  doc.addEventListener('mousemove', function (event) {
    if (gyroEnabled || demoActive || reduceMotion.matches || !isRealMouse(event)) return;
    var area = closest(event.target, '.ac-card-media');
    var stage = area ? find(area, '[data-ac-tilt]') : closest(event.target, '[data-ac-tilt]');
    if (!stage) { endMouse(); return; }
    if (stage !== mouseStage) {
      endMouse();
      mouseStage = stage; mouseArea = area || stage;
      var state = stateFor(stage);
      state.holo = stage.hasAttribute('data-ac-holo') ? fitHolo(stage) : null;
    }
    if (closest(event.target, '.ac-flip-row')) {
      // Pointer is on the Flip control: hold the card flat (slightly lifted) so the turn and the new face read clearly.
      var flat = stateFor(stage);
      flat.active = true; flat.ease = 0.14; flat.tx = flat.ty = 0; flat.tz = 0.6;
      schedule();
    } else {
      aim(stage, event.clientX, event.clientY, { ease: 0.2, maxX: MAX_TILT, maxY: MAX_TILT });
    }
    var plane = stateFor(stage).plane;
    var card = closest(stage, '.ac-product-card');
    var flipped = !!(card && card.classList.contains('is-flipped'));
    if (plane) plane.classList.toggle('is-holo', !!stateFor(stage).holo && !flipped);
  }, { passive: true });
  doc.addEventListener('mouseout', function (event) {
    if (mouseArea && !mouseArea.contains(event.relatedTarget)) endMouse();
  }, { passive: true });

  /* ---------- Shelf light: a warm pool follows the cursor across the tiles of the grid it is over ---------- */
  var litGrid = null, litStages = [], litFrame = 0, litPoint = null;
  function unlight() {
    if (litGrid) litGrid.classList.remove('ac-lit');
    litGrid = null; litStages = [];
  }
  function paintLight() {
    litFrame = 0;
    if (!litGrid || !litPoint) return;
    for (var i = 0; i < litStages.length; i++) {
      var stage = litStages[i];
      var box = stage.getBoundingClientRect();
      var near = litPoint.x > box.left - 320 && litPoint.x < box.right + 320 && litPoint.y > box.top - 320 && litPoint.y < box.bottom + 320;
      if (near) {
        stage.style.setProperty('--lx', (litPoint.x - box.left).toFixed(0) + 'px');
        stage.style.setProperty('--ly', (litPoint.y - box.top).toFixed(0) + 'px');
        stage.__acLit = true;
      } else if (stage.__acLit) {
        stage.style.setProperty('--lx', '-999px');
        stage.__acLit = false;
      }
    }
  }
  doc.addEventListener('mousemove', function (event) {
    if (reduceMotion.matches || !isRealMouse(event)) return;
    var grid = closest(event.target, '.ac-product-grid, .product-grid');
    if (grid !== litGrid) {
      unlight();
      if (grid) { litGrid = grid; litStages = Array.prototype.slice.call(grid.querySelectorAll('.ac-image-stage')); grid.classList.add('ac-lit'); }
    }
    if (!litGrid) return;
    litPoint = { x: event.clientX, y: event.clientY };
    if (!litFrame) litFrame = requestAnimationFrame(paintLight);
  }, { passive: true });
  doc.addEventListener('mouseout', function (event) { if (!event.relatedTarget) unlight(); }, { passive: true });
  window.addEventListener('blur', unlight);
  doc.addEventListener('scroll', endMouse, { passive: true, capture: true });
  doc.addEventListener('visibilitychange', function () { endMouse(); releaseAll(); });
  window.addEventListener('blur', function () { endMouse(); releaseAll(); });
  window.addEventListener('resize', function () { endMouse(); releaseAll(); }, { passive: true });
  onChange(reduceMotion, function () { endMouse(); flattenNow(); });

  /* ---------- Card flip: button (desktop + mobile) and deliberate horizontal swipe ---------- */
  function loadBack(card) {
    var img = find(card, '.ac-back-photo[data-src]');
    if (!img) return;
    var srcset = img.getAttribute('data-srcset');
    if (srcset) img.setAttribute('srcset', srcset);
    img.setAttribute('src', img.getAttribute('data-src'));
    img.removeAttribute('data-src');
    img.removeAttribute('data-srcset');
  }
  function setFlipped(card, flipped, direction) {
    loadBack(card);
    card.classList.toggle('ac-flip-ccw', direction === 'left');
    var changed = card.classList.contains('is-flipped') !== flipped;
    card.classList.toggle('is-flipped', flipped);
    if (changed) {
      // Lift during the turn, then one glint once the card has landed, so the photo can be inspected.
      clearTimeout(card.__acSettle); clearTimeout(card.__acLand);
      card.classList.remove('is-landed'); card.classList.add('is-settling');
      card.__acSettle = setTimeout(function () {
        card.classList.remove('is-settling'); card.classList.add('is-landed');
        card.__acLand = setTimeout(function () { card.classList.remove('is-landed'); }, 760);
      }, 640);
      try { doc.dispatchEvent(new CustomEvent('ac:flip', { detail: { flipped: flipped } })); } catch (error) { /* decorative */ }
    }
    var button = find(card, '[data-ac-flip-toggle]');
    if (button) {
      button.setAttribute('aria-pressed', String(flipped));
      button.setAttribute('aria-label', button.getAttribute(flipped ? 'data-label-front' : 'data-label-alt') || '');
      var text = find(button, '.ac-flip-text');
      if (text) text.textContent = button.getAttribute(flipped ? 'data-text-front' : 'data-text-alt') || '';
    }
    var front = find(card, '.ac-face--front'), back = find(card, '.ac-face--back');
    if (front) front.setAttribute('aria-hidden', String(flipped));
    if (back) back.setAttribute('aria-hidden', String(!flipped));
    var plane = find(card, '[data-ac-tilt-plane]');
    if (plane && flipped) plane.classList.remove('is-holo');
  }
  function toggleFlip(card, direction) { setFlipped(card, !card.classList.contains('is-flipped'), direction); }
  doc.addEventListener('click', function (event) {
    var button = closest(event.target, '[data-ac-flip-toggle]');
    if (!button) return;
    var card = closest(button, '[data-ac-card]');
    if (card) toggleFlip(card, 'right');
  });
  function intent(event) {
    var button = closest(event.target, '[data-ac-flip-toggle]');
    if (button) { var card = closest(button, '[data-ac-card]'); if (card) loadBack(card); }
  }
  doc.addEventListener('mouseover', intent, { passive: true });
  doc.addEventListener('focusin', intent);

  /* ---------- Touch: finger-drag tilt, swipe-to-flip, vertical scroll untouched ---------- */
  var touch = null, suppressTapUntil = 0;
  function trackedTouch(event) {
    if (!touch) return null;
    for (var i = 0; i < event.changedTouches.length; i++) if (event.changedTouches[i].identifier === touch.id) return event.changedTouches[i];
    return null;
  }
  doc.addEventListener('touchstart', function (event) {
    lastTouchAt = now();
    if (event.touches.length !== 1) { if (touch) { release(touch.stage); touch = null; } return; }
    var stage = closest(event.target, '[data-ac-tilt]');
    if (!stage || closest(stage, '.is-wheel')) return; // in the hero's card wheel a sideways drag turns the wheel instead
    stopDemo();
    var point = event.touches[0];
    touch = { stage: stage, card: closest(stage, '[data-ac-card]'), id: point.identifier, x: point.clientX, y: point.clientY, lastX: point.clientX, lastY: point.clientY, t: now(), dragging: false };
    if (touch.card) loadBack(touch.card); // a finger on a flippable card is intent to inspect it
  }, { passive: true });
  doc.addEventListener('touchmove', function (event) {
    var point = trackedTouch(event);
    if (!point) return;
    lastTouchAt = now();
    var dx = point.clientX - touch.x, dy = point.clientY - touch.y;
    if (!touch.dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { touch = null; return; } // vertical scroll wins
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
      touch.dragging = true;
    }
    if (event.cancelable) event.preventDefault();
    touch.lastX = point.clientX; touch.lastY = point.clientY;
    if (!gyroEnabled && !reduceMotion.matches) {
      aim(touch.stage, point.clientX, point.clientY, { ease: 0.28, maxX: MAX_TILT * 0.75, maxY: MAX_TILT });
      // The foil follows the finger, as it follows the cursor on desktop. Cleared again by release().
      if (touchHolo && touch.stage.hasAttribute('data-ac-holo')) {
        var dragState = stateFor(touch.stage);
        if (!touch.fitted) { touch.fitted = true; dragState.holo = fitHolo(touch.stage); }
        var flippedNow = !!(touch.card && touch.card.classList.contains('is-flipped'));
        if (dragState.plane) dragState.plane.classList.toggle('is-holo', !!dragState.holo && !flippedNow);
      }
    }
  }, { passive: false });
  function endTouch(event, cancelled) {
    var point = event ? trackedTouch(event) : null;
    if (!touch || (event && !point)) return;
    lastTouchAt = now();
    var stage = touch.stage;
    if (touch.dragging) {
      suppressTapUntil = now() + 600;
      var endX = point ? point.clientX : touch.lastX, endY = point ? point.clientY : touch.lastY;
      var dx = endX - touch.x, dy = endY - touch.y;
      var elapsed = now() - touch.t;
      var width = stage.getBoundingClientRect().width || 200;
      var horizontal = Math.abs(dx) > Math.abs(dy) * 1.6;
      var farEnough = Math.abs(dx) >= Math.max(56, width * 0.35);
      var quickFlick = Math.abs(dx) >= 36 && elapsed < 300;
      if (!cancelled && touch.card && horizontal && (farEnough || quickFlick)) toggleFlip(touch.card, dx < 0 ? 'left' : 'right');
    }
    release(stage);
    touch = null;
  }
  doc.addEventListener('touchend', function (event) { endTouch(event, false); }, { passive: true });
  doc.addEventListener('touchcancel', function (event) { endTouch(event, true); }, { passive: true });
  doc.addEventListener('click', function (event) {
    // Swallow the product-link click that some browsers fire after a recognised drag or swipe.
    if (now() < suppressTapUntil && closest(event.target, '[data-ac-tilt]')) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);

  /* ---------- Optional phone motion + labelled demo (unchanged behaviour, ES2017 syntax) ---------- */
  var controls = doc.querySelector('[data-ac-motion-controls]');
  var motionButton = find(controls, '[data-ac-motion-toggle]');
  var recenterButton = find(controls, '[data-ac-motion-recenter]');
  var motionStatus = find(controls, '[data-ac-motion-status]');
  var demoButton = find(controls, '[data-ac-motion-demo]');
  var help = find(controls, '[data-ac-motion-help]');
  var standalone = find(controls, '[data-ac-motion-standalone]');
  if (standalone) standalone.href = window.location.href;
  var mobileInput = mq('(any-pointer: coarse)');
  var motionAvailable = window.isSecureContext && (typeof window.DeviceOrientationEvent !== 'undefined' || typeof window.DeviceMotionEvent !== 'undefined');
  var permissionPending = false;
  var baseline = null, gyroFrame = 0, sensorTimer = 0;
  var targetX = 0, targetY = 0, currentX = 0, currentY = 0;
  var visibleStages = new Set(), observedStages = new Set();
  var intersection = null, mutations = null;
  function say(message) { if (motionStatus) motionStatus.textContent = message; }
  function clearPlane(stage) {
    var plane = find(stage, '[data-ac-tilt-plane]');
    if (!plane) return;
    plane.style.removeProperty('transform');
    plane.classList.remove('is-tilting', 'is-gyro-tilting', 'is-holo');
  }
  // Phones and small tablets: the control lives in the header's navigation. Desktop widths keep it where it is rendered.
  // The element itself is moved (not copied), so its state, the permission flow and the listeners above stay as they are.
  var motionSlot = doc.querySelector('[data-ac-motion-slot]');
  var compactLayout = mq('(max-width: 989px)');
  var motionHome = null;
  function placeControls() {
    if (!controls || !motionSlot) return;
    if (!motionHome) { motionHome = doc.createComment('card motion'); controls.parentNode.insertBefore(motionHome, controls); }
    var inHeader = controls.parentNode === motionSlot;
    if (compactLayout.matches && !inHeader) motionSlot.appendChild(controls);
    else if (!compactLayout.matches && inHeader && motionHome.parentNode) motionHome.parentNode.insertBefore(controls, motionHome);
  }
  function updateControls() {
    if (!controls || !motionButton) return;
    controls.hidden = reduceMotion.matches || !(mobileInput.matches || navigator.maxTouchPoints > 0);
    controls.classList.toggle('is-on', gyroEnabled);
    if (motionSlot) motionSlot.classList.toggle('has-control', !controls.hidden && controls.parentNode === motionSlot);
    motionButton.textContent = gyroEnabled ? 'Turn card motion off' : 'Enable card motion';
    motionButton.setAttribute('aria-pressed', String(gyroEnabled));
    motionButton.disabled = permissionPending || !motionAvailable;
    if (demoButton) demoButton.disabled = permissionPending;
    if (recenterButton) recenterButton.hidden = !gyroEnabled;
  }
  function angle() {
    var o = window.screen && window.screen.orientation;
    return Number(o && typeof o.angle === 'number' ? o.angle : (window.orientation || 0));
  }
  function delta(value, origin) { return ((value - origin + 540) % 360) - 180; }
  function animateGyro() {
    gyroFrame = 0;
    if (!gyroEnabled || doc.hidden || reduceMotion.matches) return;
    currentX += (targetX - currentX) * 0.2;
    currentY += (targetY - currentY) * 0.2;
    visibleStages.forEach(function (stage) {
      if (!stage.isConnected) { visibleStages.delete(stage); observedStages.delete(stage); return; }
      if (!intersection) {
        var rect = stage.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) { clearPlane(stage); return; }
      }
      var plane = find(stage, '[data-ac-tilt-plane]');
      if (plane) {
        plane.classList.add('is-gyro-tilting');
        plane.style.transform = 'perspective(800px) rotateX(' + currentX.toFixed(2) + 'deg) rotateY(' + currentY.toFixed(2) + 'deg) scale(1.012)';
        shine(stage, plane, currentX, currentY, 8);
      }
    });
    if (Math.abs(targetX - currentX) > 0.02 || Math.abs(targetY - currentY) > 0.02) scheduleGyro();
  }
  function scheduleGyro() { if (!gyroFrame) gyroFrame = requestAnimationFrame(animateGyro); }
  function observeStage(stage) {
    if (observedStages.has(stage)) return;
    observedStages.add(stage);
    if (intersection) intersection.observe(stage); else visibleStages.add(stage);
  }
  function trackStages() {
    if ('IntersectionObserver' in window) intersection = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visibleStages.add(entry.target);
        else { visibleStages.delete(entry.target); clearPlane(entry.target); }
      });
      scheduleGyro();
    }, { threshold: 0.01 });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-ac-tilt]'), observeStage);
    mutations = new MutationObserver(function (records) {
      records.forEach(function (record) {
        Array.prototype.forEach.call(record.addedNodes, function (node) {
          if (node.nodeType !== 1) return;
          if (node.matches('[data-ac-tilt]')) observeStage(node);
          Array.prototype.forEach.call(node.querySelectorAll('[data-ac-tilt]'), observeStage);
        });
      });
      observedStages.forEach(function (stage) {
        if (!stage.isConnected) { if (intersection) intersection.unobserve(stage); visibleStages.delete(stage); observedStages.delete(stage); }
      });
    });
    mutations.observe(root, { childList: true, subtree: true });
  }
  function flattenGyro() {
    cancelAnimationFrame(gyroFrame); gyroFrame = 0;
    observedStages.forEach(clearPlane);
    baseline = null; targetX = targetY = currentX = currentY = 0;
  }
  var lastOrientationAt = 0;
  function orientationSensor(event) {
    if (isFinite(event.beta) && isFinite(event.gamma) && event.beta !== null && event.gamma !== null) lastOrientationAt = now();
    sensor(event);
  }
  function motionSensor(event) {
    if (lastOrientationAt && now() - lastOrientationAt < 1500) return;
    var g = event.accelerationIncludingGravity;
    if (!g || !isFinite(g.x) || !isFinite(g.y) || !isFinite(g.z) || g.x === null || Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) < 1) return;
    sensor({ beta: Math.atan2(-g.y, g.z) * 180 / Math.PI, gamma: Math.atan2(g.x, Math.sqrt(g.y * g.y + g.z * g.z)) * 180 / Math.PI, source: 'motion' });
  }
  function sensor(event) {
    if (!gyroEnabled || doc.hidden || reduceMotion.matches || event.beta === null || event.gamma === null || !isFinite(event.beta) || !isFinite(event.gamma)) return;
    clearTimeout(sensorTimer);
    var orientation = angle();
    var source = event.source || 'orientation';
    if (!baseline || baseline.angle !== orientation || baseline.source !== source) {
      baseline = { beta: event.beta, gamma: event.gamma, angle: orientation, source: source };
      targetX = targetY = currentX = currentY = 0;
      say(source === 'motion' ? 'Phone motion is live (sensor fallback). Tilt gently, or tap Recenter.' : 'Phone motion is live. Tilt gently, or tap Recenter.');
      if (help) help.hidden = true;
    }
    var beta = delta(event.beta, baseline.beta), gamma = delta(event.gamma, baseline.gamma);
    var radians = orientation * Math.PI / 180;
    var horizontal = gamma * Math.cos(radians) + beta * Math.sin(radians);
    var vertical = beta * Math.cos(radians) - gamma * Math.sin(radians);
    targetX = -unit(vertical / 20) * 8;
    targetY = unit(horizontal / 20) * 8;
    scheduleGyro();
  }
  function listen() {
    lastOrientationAt = 0;
    window.addEventListener('deviceorientation', orientationSensor, { passive: true });
    window.addEventListener('devicemotion', motionSensor, { passive: true });
    clearTimeout(sensorTimer);
    sensorTimer = setTimeout(function () {
      if (!baseline && gyroEnabled && !doc.hidden) {
        stopGyro();
        say('No sensor data received. Open this page directly in Safari for phone motion, or try the tilt demo / drag a card sideways.');
        if (help) help.hidden = false;
      }
    }, 5000);
  }
  function stopGyro() {
    gyroEnabled = false;
    window.removeEventListener('deviceorientation', orientationSensor);
    window.removeEventListener('devicemotion', motionSensor);
    clearTimeout(sensorTimer);
    flattenGyro();
    if (intersection) intersection.disconnect(); intersection = null;
    if (mutations) mutations.disconnect(); mutations = null;
    visibleStages.clear(); observedStages.clear();
    updateControls();
  }
  if (motionButton) motionButton.addEventListener('click', function () {
    if (permissionPending) return;
    if (gyroEnabled) { stopGyro(); say('Card motion is off.'); return; }
    if (!motionAvailable || reduceMotion.matches) return;
    stopDemo();
    permissionPending = true; updateControls();
    // Start both permission requests synchronously inside the click: iOS requires a user gesture.
    var requests = [window.DeviceOrientationEvent, window.DeviceMotionEvent].filter(Boolean).map(function (API) {
      try { return typeof API.requestPermission === 'function' ? Promise.resolve(API.requestPermission()).catch(function () { return 'denied'; }) : Promise.resolve('granted'); }
      catch (error) { return Promise.resolve('denied'); }
    });
    Promise.all(requests).then(function (permissions) {
      if (permissions.indexOf('granted') === -1) {
        say('This browser blocked phone motion. Open the page directly in Safari, or try the demo / drag a card sideways.');
        if (help) help.hidden = false;
        return;
      }
      if (reduceMotion.matches) return;
      endMouse(); flattenNow(); gyroEnabled = true; baseline = null;
      trackStages();
      say('Hold your phone comfortably, then tilt it gently.');
      if (!doc.hidden) listen();
    }).catch(function () {
      stopGyro();
      say('Phone motion is blocked in this view. Open directly in Safari, or try the demo / drag a card sideways.');
      if (help) help.hidden = false;
    }).then(function () { permissionPending = false; updateControls(); });
  });
  if (recenterButton) recenterButton.addEventListener('click', function () {
    flattenGyro();
    say('Hold your phone in a comfortable position to recenter.');
  });
  doc.addEventListener('visibilitychange', function () {
    if (!gyroEnabled) return;
    window.removeEventListener('deviceorientation', orientationSensor);
    window.removeEventListener('devicemotion', motionSensor);
    clearTimeout(sensorTimer); flattenGyro();
    if (!doc.hidden) listen();
  });
  window.addEventListener('orientationchange', flattenGyro, { passive: true });
  if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) window.screen.orientation.addEventListener('change', flattenGyro);
  doc.addEventListener('scroll', function () { if (gyroEnabled) scheduleGyro(); }, { passive: true, capture: true });
  onChange(reduceMotion, function () {
    if (reduceMotion.matches) { stopGyro(); stopDemo(); say('Card motion is off because reduced motion is enabled.'); }
    updateControls();
  });
  onChange(mobileInput, updateControls);
  onChange(compactLayout, function () { placeControls(); updateControls(); });
  placeControls();
  updateControls();
  // In the header the panel floats over the page: a tap elsewhere, or Escape, closes it.
  doc.addEventListener('click', function (event) {
    if (controls && controls.open && controls.parentNode === motionSlot && !controls.contains(event.target)) controls.open = false;
  });
  doc.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && controls && controls.open && controls.parentNode === motionSlot) { controls.open = false; var s = find(controls, 'summary'); if (s) s.focus(); }
  });

  // A short, explicitly labelled animation demo. This is not sensor input.
  var demoFrame = 0, demoStart = null;
  var demoPlanes = new Set();
  function stopDemo() {
    cancelAnimationFrame(demoFrame); demoFrame = 0; demoStart = null; demoActive = false;
    demoPlanes.forEach(clearPlane); demoPlanes.clear();
  }
  function demoTick(time) {
    if (!demoActive || doc.hidden || reduceMotion.matches) { stopDemo(); return; }
    if (demoStart === null) demoStart = time;
    var elapsed = time - demoStart;
    if (elapsed >= 4000) { stopDemo(); say('Demo finished. Enable phone motion for real sensor tilt, or drag a card sideways.'); return; }
    Array.prototype.forEach.call(doc.querySelectorAll('[data-ac-tilt]'), function (stage) {
      var rect = stage.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) return;
      var plane = find(stage, '[data-ac-tilt-plane]');
      if (!plane) return;
      demoPlanes.add(stage); plane.classList.add('is-gyro-tilting');
      var demoX = Math.sin(elapsed / 480) * 5, demoY = Math.cos(elapsed / 600) * 9;
      plane.style.transform = 'perspective(800px) rotateX(' + demoX.toFixed(2) + 'deg) rotateY(' + demoY.toFixed(2) + 'deg) scale(1.012)';
      shine(stage, plane, demoX, demoY, 9);
    });
    demoFrame = requestAnimationFrame(demoTick);
  }
  if (demoButton) demoButton.addEventListener('click', function () {
    if (permissionPending || reduceMotion.matches) return;
    stopGyro(); stopDemo(); endMouse(); flattenNow();
    demoActive = true; say('Tilt preview demo — this animation is not using phone sensors.');
    var first = doc.querySelector('[data-ac-tilt]');
    if (first && first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    demoFrame = requestAnimationFrame(demoTick);
  });
  doc.addEventListener('visibilitychange', function () { if (doc.hidden) { stopDemo(); if (touch) endTouch(null, true); } });
})();
