/* ALBERT COLLECTS | THE VAULT (generic theme, kiosk page). Markup: snippets/ac-vault.liquid. Styles: albert-vault.css.
   Plain ES5 on purpose, so it also runs on the older iPads that show the kiosk.

   The loop: touch the teaser -> the door wakes and its three rings spin out of line -> turn each ring until its gold
   mark sits on the line of light (it settles into place when it is close) -> the door opens and an exhibit card rises
   -> "Unlock another" (a different exhibit) or "Explore the Collection" (back to the real cards).

   Rules this file keeps:
   - Nothing opens by itself. The Vault never covers the cards unless someone touches the teaser.
   - If the Vault is left untouched for a while it closes, so the next shopper finds the shop.
   - The teaser rests while it is off screen, while someone is searching, and while a card view is open.
   - No sound until the visitor switches it on. No network requests. Nothing is stored.
   - The exhibit is artwork for this screen: not a product, not stock, not a prize. */
(function () {
  'use strict';
  var root = document.querySelector('[data-acv]');
  if (!root) return;
  var html = document.documentElement;
  var overlay = root.querySelector('[data-acv-overlay]');
  var teaser = root.querySelector('[data-acv-open]');
  var doorbox = root.querySelector('[data-acv-doorbox]');
  var stage = root.querySelector('[data-acv-stage]');
  var card = root.querySelector('[data-acv-card]');
  var live = root.querySelector('[data-acv-live]');
  var countEl = root.querySelector('[data-acv-count]');
  var soundBtn = root.querySelector('[data-acv-sound]');
  var soundText = root.querySelector('[data-acv-sound-text]');
  var canvas = root.querySelector('[data-acv-dust]');
  if (!overlay || !teaser || !doorbox || !card) return;
  // The Vault is a full-screen layer, so it sits directly in <body>: the banner it is written in clips and stacks its
  // own contents, and would trap it underneath the cards.
  document.body.appendChild(overlay);
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var now = function () { return window.performance && performance.now ? performance.now() : Date.now(); };
  var raf = window.requestAnimationFrame || function (fn) { return setTimeout(function () { fn(now()); }, 16); };
  var modern = !!(window.CSS && CSS.supports && CSS.supports('aspect-ratio', '1 / 1'));
  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var reduced = function () { return !!reduceQuery.matches; };
  var lite = !modern;
  var setLite = function (on) { lite = on; overlay.classList.toggle('is-lite', lite || reduced()); };

  var EXHIBITS = ['Moonlit Foil', 'Champagne Star', 'Jade Lattice', 'Ember Dusk'];
  var RING_NAMES = ['Outer ring', 'Middle ring', 'Inner ring'];
  var SNAP = 14;            // degrees: a ring released this close to the light settles onto it
  var SNAP_EASY = 24;       // after half a minute the window widens a little
  var IDLE_HINT = 7000;     // ms without a touch before the next mark starts to pulse
  var IDLE_CLOSE = 75000;   // ms without a touch before the Vault closes by itself
  var state = 'closed', variant = 0, order = [0, 1, 2, 3], round = 0;
  var rings = [], lastInput = 0, playSince = 0, timers = [];
  var later = function (fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; };
  var clearTimers = function () { timers.forEach(clearTimeout); timers = []; };

  each(overlay.querySelectorAll('[data-acv-ring]'), function (el, i) {
    rings.push({ el: el, wrap: el.parentNode, handle: overlay.querySelector('[data-acv-handle="' + i + '"]'), angle: 0, vel: 0, locked: false, held: false, settling: false, tween: null });
  });
  var pips = overlay.querySelectorAll('[data-acv-pip]');

  function norm(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a; }
  function paint(ring) {
    var t = 'rotate(' + ring.angle.toFixed(2) + 'deg)';
    ring.el.style.webkitTransform = t; ring.el.style.transform = t;
    var near = Math.max(0, 1 - Math.abs(norm(ring.angle)) / 42);
    if (ring.wrap.style.setProperty) ring.wrap.style.setProperty('--near', (ring.locked ? 1 : near).toFixed(3));
  }
  function setState(next) { state = next; overlay.setAttribute('data-state', next); }
  function say(text) { if (live) live.textContent = text; }
  function touchInput() { lastInput = now(); overlay.classList.remove('is-hinting'); }

  /* ---------- sound: off until asked for; a few synthesised tones, no files ---------- */
  var audio = null, soundOn = false;
  function tone(freq, start, length, gain, type) {
    if (!soundOn || !audio) return;
    try {
      var osc = audio.createOscillator(), amp = audio.createGain(), t = audio.currentTime + start;
      osc.type = type || 'sine'; osc.frequency.setValueAtTime(freq, t);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(gain, t + 0.015);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(amp); amp.connect(audio.destination);
      osc.start(t); osc.stop(t + length + 0.05);
    } catch (e) { /* sound is optional */ }
  }
  var sfx = {
    tick: function () { tone(1900, 0, 0.04, 0.03, 'triangle'); },
    lock: function (i) { var base = [523.25, 659.25, 783.99][i] || 523.25; tone(base, 0, 0.5, 0.12); tone(base * 2, 0.02, 0.7, 0.05); },
    open: function () { [261.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, i * 0.09, 1.6, 0.09); }); },
    wake: function () { tone(196, 0, 0.9, 0.08); tone(392, 0.12, 0.9, 0.05); }
  };
  if (soundBtn) soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    if (soundOn && !audio) { var Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx) { try { audio = new Ctx(); } catch (e) { audio = null; } } }
    if (soundOn && audio && audio.resume) audio.resume();
    if (soundOn && !audio) soundOn = false;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    if (soundText) soundText.textContent = soundOn ? 'Sound on' : 'Sound off';
    if (soundOn) sfx.lock(1);
    touchInput();
  });

  /* ---------- gold dust (canvas): drifting motes, and a burst when a ring sets or the door opens ---------- */
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var motes = [], sparks = [], dpr = 1, cw = 0, ch = 0;
  function sizeCanvas() {
    if (!ctx) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = overlay.clientWidth; ch = overlay.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  }
  function seedMotes() {
    motes = [];
    for (var i = 0; i < 44; i++) motes.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, v: 0.008 + Math.random() * 0.02, p: Math.random() * 6.28, a: 0.15 + Math.random() * 0.5 });
  }
  function burst(x, y, count, speed) {
    if (!ctx || lite || reduced()) return;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * 6.283, s = speed * (0.35 + Math.random() * 0.9);
      sparks.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.15, life: 1, r: 0.8 + Math.random() * 2.2 });
    }
  }
  function drawDust(dt, t) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    var i, m;
    for (i = 0; i < motes.length; i++) {
      m = motes[i];
      m.y -= m.v * dt; if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      var x = (m.x + Math.sin(t / 2600 + m.p) * 0.012) * cw, y = m.y * ch;
      ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(t / 900 + m.p));
      ctx.fillStyle = '#f2d894';
      ctx.beginPath(); ctx.arc(x, y, m.r, 0, 6.283); ctx.fill();
    }
    for (i = sparks.length - 1; i >= 0; i--) {
      m = sparks[i];
      m.life -= dt * 0.75; if (m.life <= 0) { sparks.splice(i, 1); continue; }
      m.vx *= 1 - dt * 1.4; m.vy = m.vy * (1 - dt * 1.4) + 60 * dt;
      m.x += m.vx * dt; m.y += m.vy * dt;
      ctx.globalAlpha = Math.min(1, m.life * 1.4);
      ctx.fillStyle = '#fff3cf';
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (0.4 + m.life * 0.6), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- the exhibit card: follows the finger, sways gently when left alone ---------- */
  var tilt = { x: 0, y: 0, tx: 0, ty: 0, at: 0 };
  function aimCard(clientX, clientY) {
    var box = card.getBoundingClientRect();
    if (!box.width) return;
    var nx = Math.max(-1, Math.min(1, ((clientX - box.left) / box.width) * 2 - 1));
    var ny = Math.max(-1, Math.min(1, ((clientY - box.top) / box.height) * 2 - 1));
    tilt.tx = -ny * 13; tilt.ty = nx * 16; tilt.at = now();
  }
  function drawCard(dt, t) {
    if (reduced()) { tilt.tx = tilt.ty = 0; }
    else if (t - tilt.at > 1800) { tilt.tx = Math.sin(t / 1700) * 5; tilt.ty = Math.cos(t / 2300) * 9; }
    var k = Math.min(1, dt * 7);
    tilt.x += (tilt.tx - tilt.x) * k; tilt.y += (tilt.ty - tilt.y) * k;
    var tr = 'rotateX(' + tilt.x.toFixed(2) + 'deg) rotateY(' + tilt.y.toFixed(2) + 'deg)';
    card.style.webkitTransform = tr; card.style.transform = tr;
    if (card.style.setProperty) {
      var px = tilt.y / 16, py = -tilt.x / 13;
      card.style.setProperty('--hx', (50 - px * 38).toFixed(1) + '%');
      card.style.setProperty('--hy', (50 - py * 38).toFixed(1) + '%');
      card.style.setProperty('--gx', (50 + px * 44).toFixed(1) + '%');
      card.style.setProperty('--gy', (38 + py * 40).toFixed(1) + '%');
    }
  }

  /* ---------- rings ---------- */
  function setCount() {
    var done = rings.filter(function (r) { return r.locked; }).length;
    each(pips, function (pip, i) { pip.classList.toggle('is-set', i < done); });
    if (countEl) countEl.textContent = done + ' of 3 set';
    var next = null;
    rings.forEach(function (r) { r.wrap.classList.remove('is-next'); if (!r.locked && !next) next = r; });
    if (next) next.wrap.classList.add('is-next');
    return done;
  }
  function lock(ring) {
    if (ring.locked) return;
    var i = rings.indexOf(ring);
    ring.locked = true; ring.held = false; ring.settling = false; ring.vel = 0; ring.angle = 0;
    paint(ring);
    ring.wrap.classList.add('is-locked'); ring.wrap.classList.remove('is-held');
    ring.wrap.classList.remove('is-thud'); void ring.wrap.offsetWidth; ring.wrap.classList.add('is-thud');
    if (ring.handle) { ring.handle.setAttribute('aria-valuenow', '0'); ring.handle.setAttribute('aria-valuetext', 'set'); }
    sfx.lock(i);
    var box = doorbox.getBoundingClientRect(), radius = [250, 196, 142][i] / 600 * box.width;
    burst(box.left + box.width / 2, box.top + box.height / 2 - radius, 16, 150);
    var done = setCount();
    say(RING_NAMES[i] + ' set. ' + done + ' of 3.');
    if (done === rings.length) later(openDoor, reduced() ? 150 : 650);
  }
  function release(ring) {
    ring.held = false; ring.wrap.classList.remove('is-held');
    if (reduced() || lite) ring.vel = 0;
  }
  function stepRings(dt) {
    var window_ = now() - playSince > 30000 ? SNAP_EASY : SNAP;
    rings.forEach(function (ring) {
      if (ring.locked || ring.held || ring.tween) return;
      if (Math.abs(ring.vel) > 6) {
        ring.angle += ring.vel * dt;
        ring.vel *= Math.exp(-3.4 * dt);
        // a ring that is coasting slowly through the light is caught by it
        if (Math.abs(norm(ring.angle)) < 5 && Math.abs(ring.vel) < 90) { ring.vel = 0; ring.settling = true; }
      } else {
        ring.vel = 0;
        var off = norm(ring.angle);
        if (!ring.settling && Math.abs(off) <= window_) ring.settling = true;
        if (ring.settling) {
          ring.angle = off * Math.exp(-13 * dt);
          if (Math.abs(ring.angle) < 0.35) { lock(ring); return; }
        }
      }
      paint(ring);
    });
  }
  function ringAt(clientX, clientY) {
    var box = doorbox.getBoundingClientRect();
    var cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    var dx = clientX - cx, dy = clientY - cy;
    var u = Math.sqrt(dx * dx + dy * dy) / (box.width / 2) * 300;
    if (u < 96 || u > 300) return null;
    var i = u >= 223 ? 0 : u >= 169 ? 1 : 2;
    if (rings[i].locked) {
      // the ring under the finger is already set: take the nearest one that is not
      var best = null, bestGap = 1e9;
      rings.forEach(function (r, k) { var gap = Math.abs([250, 196, 142][k] - u); if (!r.locked && gap < bestGap) { best = k; bestGap = gap; } });
      if (best === null || bestGap > 70) return null;
      i = best;
    }
    return { ring: rings[i], angle: Math.atan2(dy, dx) * 180 / Math.PI };
  }
  var grab = null; // { ring, last, t, id, ticks }
  function grabStart(x, y, id) {
    if (state !== 'play') return false;
    var hit = ringAt(x, y);
    if (!hit) return false;
    touchInput();
    grab = { ring: hit.ring, last: hit.angle, t: now(), id: id, travelled: 0 };
    hit.ring.held = true; hit.ring.settling = false; hit.ring.vel = 0;
    hit.ring.wrap.classList.add('is-held');
    return true;
  }
  function grabMove(x, y) {
    if (!grab) return;
    var box = doorbox.getBoundingClientRect();
    var a = Math.atan2(y - (box.top + box.height / 2), x - (box.left + box.width / 2)) * 180 / Math.PI;
    var d = norm(a - grab.last), t = now(), dt = Math.max(1, t - grab.t);
    grab.last = a; grab.t = t;
    grab.ring.angle += d;
    grab.ring.vel = grab.ring.vel * 0.5 + (d / dt * 1000) * 0.5;
    grab.travelled += Math.abs(d);
    if (grab.travelled > 15) { grab.travelled = 0; sfx.tick(); }
    paint(grab.ring);
    touchInput();
  }
  function grabEnd() {
    if (!grab) return;
    var ring = grab.ring;
    if (now() - grab.t > 90) ring.vel = 0;                      // the finger had stopped before it lifted
    ring.vel = Math.max(-720, Math.min(720, ring.vel));
    release(ring);
    grab = null;
  }
  function fingerOf(event, id) { for (var i = 0; i < event.changedTouches.length; i++) if (event.changedTouches[i].identifier === id) return event.changedTouches[i]; return null; }
  var touchedAt = -1e9;
  stage.addEventListener('touchstart', function (event) {
    touchedAt = Date.now();
    if (state === 'reveal') { aimCard(event.touches[0].clientX, event.touches[0].clientY); touchInput(); return; }
    if (grab || event.touches.length !== 1) return;
    if (grabStart(event.touches[0].clientX, event.touches[0].clientY, event.touches[0].identifier) && event.cancelable) event.preventDefault();
  }, { passive: false });
  stage.addEventListener('touchmove', function (event) {
    if (state === 'reveal') { aimCard(event.touches[0].clientX, event.touches[0].clientY); touchInput(); if (event.cancelable) event.preventDefault(); return; }
    if (!grab) return;
    var f = fingerOf(event, grab.id);
    if (f) { grabMove(f.clientX, f.clientY); if (event.cancelable) event.preventDefault(); }
  }, { passive: false });
  var touchDone = function (event) { touchedAt = Date.now(); if (grab && fingerOf(event, grab.id)) grabEnd(); };
  stage.addEventListener('touchend', touchDone);
  stage.addEventListener('touchcancel', touchDone);
  stage.addEventListener('mousedown', function (event) {
    if (event.button !== 0 || Date.now() - touchedAt < 800) return;
    if (grabStart(event.clientX, event.clientY, 'mouse')) event.preventDefault();
  });
  document.addEventListener('mousemove', function (event) {
    if (state === 'reveal' && !overlay.hidden) { aimCard(event.clientX, event.clientY); return; }
    if (grab && grab.id === 'mouse') grabMove(event.clientX, event.clientY);
  });
  document.addEventListener('mouseup', function () { if (grab && grab.id === 'mouse') grabEnd(); });
  // Keyboard: each ring is a slider. Arrow keys turn it; it settles when it is close, as with a finger.
  rings.forEach(function (ring, i) {
    if (!ring.handle) return;
    ring.handle.addEventListener('focus', function () { ring.wrap.classList.add('is-focus'); });
    ring.handle.addEventListener('blur', function () { ring.wrap.classList.remove('is-focus'); });
    ring.handle.addEventListener('keydown', function (event) {
      if (state !== 'play' || ring.locked) return;
      var step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 6 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -6 : 0;
      if (!step) return;
      event.preventDefault(); touchInput();
      ring.angle = norm(ring.angle + step); ring.vel = 0; ring.settling = false;
      paint(ring);
      ring.handle.setAttribute('aria-valuenow', String(Math.round(norm(ring.angle))));
      ring.handle.setAttribute('aria-valuetext', Math.abs(Math.round(norm(ring.angle))) + ' degrees from the light');
      if (Math.abs(norm(ring.angle)) <= 6) lock(ring);
    });
  });

  /* ---------- the sequence ---------- */
  function shuffle(list) { for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; } return list; }
  function startAngles() {
    var out = [];
    for (var i = 0; i < 3; i++) {
      var a, tries = 0;
      do { a = (55 + Math.random() * 115) * (Math.random() < 0.5 ? -1 : 1); tries++; }
      while (tries < 20 && out.some(function (b) { return Math.abs(norm(a - b)) < 30; }));
      out.push(a);
    }
    return out;
  }
  /* ---------- the card behind the door: a real one from today's inventory ----------
     Read from the kiosk's own grid on this page at the moment the Vault wakes, so it is always a card that is listed
     as available right now. Nothing is reserved, discounted or given away; the text beside it says so. With no
     inventory, or a photo that will not load, the Vault's own illustrated exhibit is shown instead. */
  var realCard = null, lastRef = '';
  var EXHIBIT_TEXT = 'A showpiece made for this screen. It is for display only: nothing here is a prize, and no card has been set aside. The cards you can take home are waiting just below.';
  var REAL_TEXT = 'One of the cards here at the show today. Opening the Vault does not win it or set it aside: it is simply one worth a closer look. You will find it with the rest of the cards below.';
  function pickReal() {
    var list = [];
    each(document.querySelectorAll('[data-ac-kiosk-item]'), function (el) {
      if (el.getAttribute('data-front') && el.getAttribute('data-state') !== 'sold') list.push(el);
    });
    if (!list.length) return null;
    var fresh = list.filter(function (el) { return el.getAttribute('data-ref') !== lastRef; });
    var el = (fresh.length ? fresh : list)[Math.floor(Math.random() * (fresh.length ? fresh.length : list.length))];
    lastRef = el.getAttribute('data-ref') || '';
    return { ref: lastRef, kind: el.getAttribute('data-kind') || '', name: el.getAttribute('data-name') || '', price: el.getAttribute('data-price') || '', img: (el.getAttribute('data-front') || '').replace(/([?&]width=)\d+/, '$1' + 720), behind: el.getAttribute('data-placement') === 'behind' };
  }
  function showReal(item) {
    realCard = item;
    var img = overlay.querySelector('[data-acv-real-img]'), view = overlay.querySelector('[data-acv-view]');
    var set = function (sel, text) { each(overlay.querySelectorAll(sel), function (el) { el.textContent = text; }); };
    overlay.classList.toggle('has-real', !!item);
    if (view) view.hidden = !item;
    set('[data-acv-exhibit-text]', item ? REAL_TEXT : EXHIBIT_TEXT);
    set('[data-acv-exhibit-price]', item ? (item.price || 'Ask for price') : '');
    if (!item) { if (img) img.removeAttribute('src'); return; }
    set('[data-acv-exhibit-name]', item.name);
    set('[data-acv-exhibit-no]', item.behind ? 'From today’s show · Behind the Table' : 'From today’s show · On display');
    if (img) {
      img.onerror = function () { if (realCard === item) { showReal(null); each(overlay.querySelectorAll('[data-acv-exhibit-name]'), function (el) { el.textContent = EXHIBITS[variant]; }); each(overlay.querySelectorAll('[data-acv-exhibit-no]'), function (el) { el.textContent = 'Vault exhibit ' + (variant + 1 < 10 ? '0' : '') + (variant + 1) + ' of 04'; }); } };
      img.alt = item.name;
      img.src = item.img;
    }
  }
  each(overlay.querySelectorAll('[data-acv-view]'), function (button) {
    button.addEventListener('click', function () {
      var item = realCard;
      if (!item) return;
      var tile = null;
      each(document.querySelectorAll('[data-ac-kiosk-item]'), function (el) { if (!tile && el.getAttribute('data-ref') === item.ref && el.getAttribute('data-kind') === item.kind) tile = el; });
      var opener = tile && tile.querySelector('[data-ac-kiosk-open]');
      close(true);
      if (opener) setTimeout(function () { opener.click(); }, 480); // the kiosk's own card view, once the Vault has closed
    });
  });

  function wake() {
    clearTimers();
    variant = order[round % order.length];
    overlay.setAttribute('data-variant', String(variant + 1));
    var name = EXHIBITS[variant], no = (variant + 1 < 10 ? '0' : '') + (variant + 1);
    each(overlay.querySelectorAll('[data-acv-card-name], [data-acv-exhibit-name]'), function (el) { el.textContent = name; });
    each(overlay.querySelectorAll('[data-acv-card-no]'), function (el) { el.textContent = 'VAULT EXHIBIT · ' + no + ' / 04'; });
    each(overlay.querySelectorAll('[data-acv-exhibit-no]'), function (el) { el.textContent = 'Vault exhibit ' + no + ' of 04'; });
    showReal(pickReal());
    var targets = startAngles();
    rings.forEach(function (ring, i) {
      ring.locked = false; ring.held = false; ring.settling = false; ring.vel = 0; ring.angle = 0;
      ring.wrap.classList.remove('is-locked', 'is-held', 'is-thud', 'is-next');
      if (ring.handle) { ring.handle.setAttribute('aria-valuenow', String(Math.round(targets[i]))); ring.handle.setAttribute('aria-valuetext', 'not set'); }
      // spin out of line: at least one full turn, alternating directions
      var spin = (i % 2 ? -1 : 1) * 360 + targets[i];
      ring.tween = reduced() ? null : { from: 0, to: spin, t0: now() + 250 + i * 110, ms: 1250 };
      if (reduced()) ring.angle = targets[i];
      paint(ring);
    });
    setCount();
    overlay.classList.remove('is-lit', 'is-hinting');
    setState('waking');
    tilt.x = tilt.y = tilt.tx = tilt.ty = 0; tilt.at = 0;
    later(function () { overlay.classList.add('is-lit'); sfx.wake(); }, 60);
    later(function () {
      setState('play'); playSince = lastInput = now();
      say('The Vault. Turn each of the three rings until its mark meets the line of light at the top. Arrow keys also turn a ring.');
    }, reduced() ? 120 : 1750);
  }
  function openDoor() {
    if (state !== 'play') return;
    setState('opening');
    sfx.open();
    var box = doorbox.getBoundingClientRect();
    later(function () { burst(box.left + box.width / 2, box.top + box.height / 2, 90, 420); }, 520);
    later(function () {
      setState('reveal'); tilt.at = 0; lastInput = now();
      say(realCard ? 'Unlocked. ' + realCard.name + ', one of the cards at the show today. It is not a prize and has not been set aside. Browse Available Cards to see it with the rest.' : 'Unlocked. Vault exhibit: ' + EXHIBITS[variant] + '. For display only. Browse Available Cards to see the cards you can take home.');
      var explore = overlay.querySelector('[data-acv-explore]');
      if (explore && document.activeElement && overlay.contains(document.activeElement) && document.activeElement !== soundBtn) explore.focus();
    }, reduced() ? 350 : 1900);
  }

  /* ---------- frame loop: runs only while the Vault is open ---------- */
  var looping = false, lastFrame = 0, slow = 0, frames = 0;
  function frame(t) {
    if (!looping) return;
    var dt = Math.min(0.05, (t - lastFrame) / 1000 || 0.016);
    lastFrame = t;
    // a device that cannot keep up gets the lighter version
    if (!lite && state === 'play' && frames < 150) { frames++; if (dt > 0.03) slow++; if (frames === 150 && slow > 60) setLite(true); }
    rings.forEach(function (ring) {
      if (!ring.tween) return;
      var p = (t - ring.tween.t0) / ring.tween.ms;
      if (p <= 0) return;
      if (p >= 1) { ring.angle = norm(ring.tween.to); ring.tween = null; }
      else { var e = 1 - Math.pow(1 - p, 3); ring.angle = ring.tween.from + (ring.tween.to - ring.tween.from) * e; }
      paint(ring);
    });
    if (state === 'play') {
      stepRings(dt);
      if (t - lastInput > IDLE_HINT) overlay.classList.add('is-hinting');
    }
    if (state === 'reveal') drawCard(dt, t);
    if (!lite && !reduced()) drawDust(dt, t);
    if ((state === 'play' || state === 'reveal') && t - lastInput > IDLE_CLOSE) { close(false); return; }
    raf(frame);
  }

  /* ---------- open, close, explore ---------- */
  var opener = null;
  function open() {
    if (state !== 'closed') return;
    opener = document.activeElement;
    overlay.hidden = false;
    html.classList.add('ac-vault-lock');
    teaser.classList.add('is-resting');
    setLite(lite);
    sizeCanvas(); seedMotes(); sparks = [];
    void overlay.offsetWidth;
    overlay.classList.add('is-in');
    round = 0; shuffle(order);
    frames = slow = 0;
    wake();
    looping = true; lastFrame = now(); lastInput = now();
    raf(frame);
    var closeBtn = overlay.querySelector('[data-acv-close]');
    if (closeBtn) closeBtn.focus();
  }
  function close(toCards) {
    if (state === 'closed') return;
    clearTimers(); grab = null; looping = false;
    setState('closed');
    overlay.classList.remove('is-in', 'is-lit', 'is-hinting');
    html.classList.remove('ac-vault-lock');
    setTimeout(function () { if (state === 'closed') overlay.hidden = true; restTeaser(); }, 430);
    if (toCards) goToCards();
    else if (opener && opener.focus) { try { opener.focus({ preventScroll: true }); } catch (e) { opener.focus(); } }
  }
  function goToCards() {
    var bar = document.querySelector('[data-ac-kiosk-bar]') || document.querySelector('[data-ac-kiosk-panel]');
    if (!bar) return;
    var y = bar.getBoundingClientRect().top + (window.pageYOffset || 0) - 12;
    try { window.scrollTo({ top: y, behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, y); }
    var panel = document.querySelector('[data-ac-kiosk-panel]');
    if (panel) { panel.setAttribute('tabindex', '-1'); try { panel.focus({ preventScroll: true }); } catch (e) { /* older Safari scrolls on focus; leave focus alone */ } }
  }
  teaser.addEventListener('click', open);
  each(overlay.querySelectorAll('[data-acv-close]'), function (el) { el.addEventListener('click', function () { close(false); }); });
  each(document.querySelectorAll('[data-acv-explore]'), function (el) { el.addEventListener('click', function (event) { event.preventDefault(); if (state === 'closed') goToCards(); else close(true); }); });
  each(overlay.querySelectorAll('[data-acv-again]'), function (el) { el.addEventListener('click', function () { if (state !== 'reveal') return; round++; touchInput(); wake(); }); });
  document.addEventListener('keydown', function (event) {
    if (state === 'closed') return;
    if (event.key === 'Escape' || event.key === 'Esc') { close(false); return; }
    if (event.key === 'Tab') { // keep focus inside the Vault while it is open
      var list = Array.prototype.filter.call(overlay.querySelectorAll('button'), function (el) { return el.getClientRects().length || el.hasAttribute('data-acv-handle'); });
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    touchInput();
  });
  overlay.addEventListener('click', touchInput);
  // In landscape the Vault is one fixed screen: the page behind it must not scroll under a finger.
  overlay.addEventListener('touchmove', function (event) {
    if (window.matchMedia && window.matchMedia('(orientation: portrait), (max-width: 899px)').matches) return;
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
  window.addEventListener('resize', function () { if (state !== 'closed') sizeCanvas(); });

  /* ---------- the teaser rests when it is not being looked at, and never competes with a shopper ---------- */
  var offscreen = false, busy = false;
  function restTeaser() { teaser.classList.toggle('is-resting', offscreen || busy || state !== 'closed' || document.hidden); }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (entries) { entries.forEach(function (e) { offscreen = !e.isIntersecting; }); restTeaser(); }, { threshold: 0.05 }).observe(teaser);
  var kiosk = document.querySelector('[data-ac-kiosk]');
  var input = document.querySelector('[data-ac-kiosk-input]');
  var detail = document.querySelector('[data-ac-kiosk-detail]');
  function shopperBusy() { busy = !!((input && (input.value || document.activeElement === input)) || (detail && detail.classList.contains('is-open'))); restTeaser(); }
  if (kiosk) ['focusin', 'focusout', 'input', 'click'].forEach(function (type) { kiosk.addEventListener(type, function () { setTimeout(shopperBusy, 0); }); });
  document.addEventListener('keydown', function () { setTimeout(shopperBusy, 0); });
  document.addEventListener('visibilitychange', function () { restTeaser(); if (document.hidden && state !== 'closed') close(false); });
  restTeaser();
})();
