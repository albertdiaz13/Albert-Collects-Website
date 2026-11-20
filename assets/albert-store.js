/* Progressive enhancement: without JavaScript the forms use Shopify's native cart. */
(() => {
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-ac-add-form]');
    const drawer = document.querySelector('cart-drawer');
    if (!form || !drawer || typeof drawer.renderContents !== 'function') return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    const status = form.querySelector('[role="status"]');
    const label = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (status) { status.classList.add('visually-hidden'); status.textContent = ''; }
    let added = false;
    try {
      const body = new FormData(form);
      body.append('sections', drawer.getSectionsToRender().map(section => section.id).join(','));
      body.append('sections_url', window.location.pathname);
      const response = await fetch(window.routes.cart_add_url, { method: 'POST', body, headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
      const result = await response.json();
      if (!response.ok || result.status) throw new Error(result.description || 'This item could not be added. Please try again.');
      added = true;
      drawer.classList.remove('is-empty');
      drawer.setActiveElement(button);
      drawer.renderContents(result);
      if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') publish(PUB_SUB_EVENTS.cartUpdate, { source: 'albert-quick-add', productVariantId: result.variant_id, cartData: result });
      if (status) status.textContent = 'Added to your bag.';
      button.classList.add('is-added');
      try { document.dispatchEvent(new CustomEvent('ac:added')); } catch (error) { /* decorative */ }
      setTimeout(() => button.classList.remove('is-added'), 950);
      const count = document.querySelector('[data-ac-cart-count]');
      if (count) { count.classList.remove('is-bumped'); void count.offsetWidth; count.classList.add('is-bumped'); }
    } catch (error) {
      if (added) { window.location.assign(window.routes.cart_url); return; }
      if (status) { status.classList.remove('visually-hidden'); status.textContent = error.message || 'Please try again.'; }
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = label;
    }
  });
})();

/* Storefront life: header logo blink/glance, Aster's journey and dialogue, hero fan, ambient motion and scroll reveals.
   ES2017 syntax for older Safari. Purely decorative: older browsers and reduced-motion shoppers get static content. */
(() => {
  const root = document.documentElement;
  const mq = query => (window.matchMedia ? window.matchMedia(query) : { matches: false });
  const onChange = (list, fn) => { if (list.addEventListener) list.addEventListener('change', fn); else if (list.addListener) list.addListener(fn); };
  const reduce = mq('(prefers-reduced-motion: reduce)');
  const finePointer = mq('(hover: hover) and (pointer: fine)');
  // iOS 12-14 (e.g. first-generation iPad Air) fail this check and keep the static fallback.
  const modern = !!(window.CSS && CSS.supports && CSS.supports('aspect-ratio', '1 / 1') && 'IntersectionObserver' in window);
  const motionOk = () => modern && !reduce.matches;
  root.classList.add('ac-life-ready');
  const syncMotionClass = () => root.classList.toggle('ac-motion-ok', motionOk());
  syncMotionClass();
  onChange(reduce, syncMotionClass);

  /* ---------- Aster's lines, grouped by the moment they belong to ----------
     "holo", "graded" and "soldout" are only used when the product card's own data confirms them (data-ac-traits). */
  const LINES = {
    arrive: ["I'll tag along.", 'I saved you a spot.', "Lead the way, I'll keep up.", 'Ready when you are.', "Don't mind me, just browsing too."],
    poke: ['Ooh, shiny!', 'Hi! Pick a card, any card.', "Careful, I'm ticklish.", "That's my good side.", 'Collected with curiosity!', 'You found me.'],
    fresh: ['Fresh off the hunt.', 'These just landed.', 'New arrivals, still warm.', 'First look is the best look.', 'I unpacked these myself.'],
    linger: ['Ooh, I like that one.', 'Wait, tilt it a little.', 'That one caught my eye.', 'Good eye.', "Take your time, I'm in no rush.", 'Look at it catch the light.', "I'd keep that one close.", "That's a keeper, I think.", 'I keep coming back to that one.'],
    holo: ['That foil is showing off.', 'Tilt it. The foil wakes up.', 'Shiny on purpose.'],
    graded: ['Sealed, graded, and proud of it.', 'That grade did its homework.', 'Safe and sound in its slab.'],
    soldout: ['That one found a home.', 'Gone, but well loved.'],
    flip: ['A little detective work.', 'The other side has secrets.', 'Always check the back.', 'Corners look honest to me.', 'Flip it again, I blinked.', 'Front and back, the full story.'],
    vintage: ['An oldie with good stories.', "I'd give that one its own shelf.", 'Older than my star, probably.', "They don't print them like this anymore.", 'Vintage smells like adventure.', 'That one deserves its own little throne.'],
    slabs: ['The vault. Fancy.', 'Shh, the slabs are resting.', 'Graded and gorgeous.', 'Mind the glass.', 'That one deserves its own little throne.', 'Whisper. They can hear the grades.'],
    racket: ['Pick a card. Any card.', 'These are here today.', 'Give the showcase a swipe.', 'Tap one. Watch it turn.', 'I brought the good binder.', 'Every one of these is real.', 'The light likes that one.', 'See one you like? Just ask.'],
    story: ['Home sweet home.', 'This is my favorite part.', 'Every find has a story.', "I've heard this one. It's good."],
    footer: ['One last lap? For research.', 'See you on the next treasure hunt.', 'Thanks for looking around.', "Come back soon. I'll be here.", 'The end. Unless you scroll up.'],
    added: ['Nice find!', 'Good pick.', "That one's going home.", 'Into the bag it goes.'],
    // Section lines: said when a section becomes the one you are looking at (phones and small tablets).
    hero: ['I saw that sparkle too.', 'Top of the shop. Best view.', "Pick a card. I'll hold your spot.", 'Everything shiny starts here.', 'Back at the start? Race you down.'],
    modern: ['Fresh ink, sharp corners.', 'The textures on these. Wow.', 'New school, still shiny.', 'These still smell like the pack.', 'Modern art, pocket sized.'],
    english: ['A little of everything. My favorite amount.', 'Mixed bag, good bag.', 'I read these ones out loud.', 'Something for every binder.', 'No passport needed for these.'],
    games: ["Press start. I'll be player two.", "Blow on the cartridge. It's tradition.", 'Save point reached.', 'I still know the cheat codes.'],
    browse: ['Keep going, it gets good.', "I'd stop here a minute.", 'So many little treasures.', 'Slow down, this shelf is nice.', 'Window shopping counts.'],
    catalog: ['The whole collection. Take your time.', "Sort it, filter it, I'll wait.", 'Somewhere in here is the one.', 'I counted them. Twice.', 'Scroll slow. The good ones hide.'],
    table: ['Everything here is at the show today.', 'See one you like? Ask Albert to pull it.', 'Search knows card numbers too.', 'Behind the Table has the deep cuts.', 'Flip one. I checked the backs.'],
    // "Catch the light" on the phone hero.
    catchlight: ['I saw that sparkle too.', 'Caught it!', 'Do that again. For science.', 'Foil weather today.', 'That one winked at me.', 'Quick hands.']
  };
  const FALLBACK = 'browse'; // any section without a pool of its own
  // Shuffle bag per context (every line plays once before any repeats) plus a short shared history,
  // so the same line never comes back while it is still fresh in mind.
  const bags = {}, recent = [];
  const forced = { arrive: "I'll tag along.", story: 'Home sweet home.' }; // the first line of these moments is fixed
  function pick(context) {
    let line = '';
    if (forced[context]) { line = forced[context]; forced[context] = ''; }
    else {
      let bag = bags[context];
      if (!bag || !bag.length) {
        bag = bags[context] = (LINES[context] || LINES.linger).slice();
        for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
      }
      let at = bag.length - 1;
      for (let i = bag.length - 1; i >= 0; i--) if (recent.indexOf(bag[i]) === -1) { at = i; break; }
      line = bag.splice(at, 1)[0];
    }
    recent.push(line); if (recent.length > 6) recent.shift();
    return line;
  }
  // One shared cooldown. A click on Aster always gets an answer; everything else waits its turn.
  // A section line (phones) is never held back: landing in a section always gets its line.
  const COOLDOWN = { direct: 0, section: 0, action: 3500, ambient: 9000, linger: 12000 };
  // Phones and small tablets: one side-by-side layout for Aster and his bubble, and dependable section lines.
  const compact = mq('(max-width: 989px)');
  let lastSpoke = -1e9;
  function speak(context, kind, rig) {
    rig = rig || activeRig();
    if (!rig) return false;
    const now = Date.now();
    if (now - lastSpoke < COOLDOWN[kind]) { if (kind === 'action') rig.hop(); return false; }
    if (!rig.say(pick(context), kind)) { if (kind === 'action') rig.hop(); return false; }
    lastSpoke = now;
    return true;
  }

  /* ---------- Aster rig: gaze toward the cursor, hop, gold stars and a line of speech ---------- */
  // Pupil angle of each look frame (degrees, 0 = right, 90 = down), measured from the sprite sheet rows 10-11.
  const ANGLES = [-87.4, -46.4, -30.1, -7.5, -3.0, 14.2, 42.1, 50.9, 92.4, 123.7, 123.8, 152.6, 170.9, -159.2, -126.2, -102.2];
  // Bubbles never sit on prices, text links, buttons or the flip control. Product photos don't count.
  const KEEP_CLEAR = '.ac-product-price, .ac-flip-row, .ac-add-button, .ac-quick-add, a[href]:not(.ac-image-stage), button, input, select, textarea, summary, label';
  function makeRig(el, options) {
    const figure = el.querySelector('.ac-aster-figure');
    const sprite = el.querySelector('.ac-aster-sprite');
    const look = el.querySelector('.ac-aster-look');
    const burst = el.querySelector('[data-ac-aster-burst]');
    const bubble = el.querySelector('[data-ac-aster-bubble]');
    const floating = !!(options && options.floating); // the corner Aster floats over the page, so his bubble must find clear space
    let lookTimer = 0, talkTimer = 0, current = -1;
    const clearAt = box => {
      if (!document.elementsFromPoint) return true;
      if (box.left < 4 || box.top < 4 || box.right > root.clientWidth - 4 || box.bottom > window.innerHeight - 4) return false;
      const xs = [box.left + 4, (box.left + box.right) / 2, box.right - 4], ys = [box.top + 4, (box.top + box.bottom) / 2, box.bottom - 4];
      for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) {
        const hit = document.elementsFromPoint(xs[i], ys[j]);
        for (let k = 0; k < hit.length; k++) if (!el.contains(hit[k]) && hit[k].closest && hit[k].closest(KEEP_CLEAR)) return false;
      }
      return true;
    };
    const rig = {
      el: el,
      stop() { clearTimeout(lookTimer); el.classList.remove('is-looking'); current = -1; },
      lookAt(x, y) {
        if (!look || !sprite) return;
        if (!look.style.backgroundImage) look.style.backgroundImage = "url('" + look.getAttribute('data-look-src') + "')";
        const box = sprite.getBoundingClientRect();
        if (!box.width || box.bottom < 0 || box.top > window.innerHeight) return;
        const dx = x - (box.left + box.width * 0.5), dy = y - (box.top + box.height * 0.53);
        if (Math.abs(dx) + Math.abs(dy) < box.width * 0.35) return; // cursor is on Aster: keep the current pose
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        let best = 0, bestDiff = 360;
        ANGLES.forEach((a, i) => { const diff = Math.abs(((angle - a + 540) % 360) - 180); if (diff < bestDiff) { bestDiff = diff; best = i; } });
        if (best !== current) { current = best; look.style.backgroundPosition = (best / 15 * 100).toFixed(3) + '% 0'; }
        el.classList.add('is-looking');
        clearTimeout(lookTimer);
        lookTimer = setTimeout(rig.stop, 2400); // settle back into the idle loop when the cursor rests
      },
      hop() { if (figure && motionOk()) { figure.classList.remove('is-hop'); void figure.offsetWidth; figure.classList.add('is-hop'); } },
      stars() {
        if (!burst || !modern) return;
        burst.textContent = '';
        for (let i = 0; i < 6; i++) {
          const star = document.createElement('span');
          const turn = (-150 + i * 24) * Math.PI / 180; // a fan of stars above his head
          const dist = 34 + (i % 2) * 16;
          star.className = 'ac-aster-spark';
          star.textContent = i % 2 ? '✦' : '★';
          star.style.setProperty('--dx', Math.round(Math.cos(turn) * dist) + 'px');
          star.style.setProperty('--dy', Math.round(Math.sin(turn) * dist) + 'px');
          star.style.setProperty('--rot', (i % 2 ? 40 : -30) + 'deg');
          star.style.animationDelay = (i * 30) + 'ms';
          burst.appendChild(star);
          void star.offsetWidth;
          star.classList.add('is-on');
        }
        setTimeout(() => { burst.textContent = ''; }, 1000);
      },
      // Returns false when there is no clear spot for the bubble (ambient and lingering remarks are then skipped).
      say(line, kind) {
        if (!bubble || !line) return false;
        bubble.textContent = line;
        bubble.classList.remove('is-side');
        if (compact.matches) {
          // Touch layout (albert-mobile.css): the bubble sits to his right, level with him, and wraps inward. It gets
          // exactly the room between him and the screen edge, so it never clips, and it never takes taps.
          const me = el.getBoundingClientRect();
          const room = root.clientWidth - me.right - 13 - 16;
          if (room < 96 && kind !== 'direct' && kind !== 'section') return false;
          el.style.setProperty('--ac-bubble-max', Math.max(96, Math.min(236, Math.round(room))) + 'px');
        } else if (floating) {
          const me = el.getBoundingClientRect();
          const shift = el.classList.contains('is-shy') ? me.height * 0.46 : 0; // he pops up to speak
          const w = bubble.offsetWidth, h = bubble.offsetHeight;
          const right = el.classList.contains('ac-aster--right');
          const cx = me.left + me.width * (right ? 0.3 : 0.6);
          const up = { left: cx - w / 2, right: cx + w / 2, top: me.top - shift - h - 12, bottom: me.top - shift - 4 };
          const sideLeft = right ? me.left - w - 10 : me.right + 10;
          const side = { left: sideLeft, right: sideLeft + w, top: me.top - shift + me.height * 0.18, bottom: me.top - shift + me.height * 0.18 + h };
          if (!clearAt(up)) {
            if (clearAt(side)) bubble.classList.add('is-side');
            else if (kind !== 'direct' && kind !== 'demo') return false;
          }
        }
        if (kind !== 'linger' && kind !== 'demo') rig.hop();
        if (kind === 'direct') rig.stars();
        el.classList.add('is-talking');
        clearTimeout(talkTimer);
        // Reading time grows with the line: about 2.8s for a short one, up to 5.2s.
        talkTimer = setTimeout(() => el.classList.remove('is-talking'), Math.max(kind === 'section' ? 3400 : 2800, Math.min(5200, 2200 + line.length * 60)));
        return true;
      }
    };
    const syncIdle = () => el.classList.toggle('is-animated', motionOk());
    syncIdle();
    onChange(reduce, () => { syncIdle(); if (reduce.matches) rig.stop(); });
    return rig;
  }

  const rigs = [];
  const KEY = 'ac-aster-hidden-until';
  const aster = document.querySelector('[data-ac-aster]');
  let corner = null;
  let dismissed = false;
  try { dismissed = Number(window.localStorage.getItem(KEY) || 0) > Date.now(); } catch (error) { dismissed = false; }
  if (aster && !dismissed) {
    aster.hidden = false;
    aster.classList.add('is-ready');
    corner = makeRig(aster, { floating: true });
    rigs.push(corner);
    const close = aster.querySelector('[data-ac-aster-close]');
    if (close) close.addEventListener('click', () => {
      aster.hidden = true;
      try { window.localStorage.setItem(KEY, String(Date.now() + 30 * 864e5)); } catch (error) { /* private mode: hide for this page only */ }
      const main = document.getElementById('MainContent');
      if (main && main.focus) main.focus({ preventScroll: true });
    });
    const poke = aster.querySelector('[data-ac-aster-poke]');
    if (poke) poke.addEventListener('click', () => speak('poke', 'direct', corner));

    // Keep clear of shopping controls: if a button, field or text link sits under him, he ducks and lets clicks through.
    // Product photo links (.ac-image-stage) don't count, or he would hide over every product grid.
    // Large headings count too, so he never sits on top of a shelf title.
    const INTERACTIVE = 'a[href]:not(.ac-image-stage), button, input, select, textarea, summary, label, [role="button"], h1, h2';
    const checkShy = () => {
      if (aster.hidden || !document.elementsFromPoint) return;
      // Resting box from his fixed offsets, so a running duck/return transition does not skew the check.
      const cs = getComputedStyle(aster);
      const w = aster.offsetWidth, h = aster.offsetHeight;
      if (!w) return;
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      // On phones and small tablets he always stands bottom-left (so the bubble has the screen to his right).
      const left = aster.classList.contains('ac-aster--right') && !compact.matches ? vw - parseFloat(cs.right) - w : parseFloat(cs.left);
      const box = { left: left, top: vh - parseFloat(cs.bottom) - h, width: w, height: h };
      const points = [[0.5, 0.5], [0.15, 0.2], [0.85, 0.2], [0.15, 0.85], [0.85, 0.85]];
      const blocked = points.some(([fx, fy]) => document.elementsFromPoint(box.left + box.width * fx, box.top + box.height * fy)
        .some(el => !aster.contains(el) && el.closest && el.closest(INTERACTIVE)));
      aster.classList.toggle('is-shy', blocked);
      if (blocked) corner.stop();
    };
    let shyTimer = 0;
    const scheduleShy = () => { clearTimeout(shyTimer); shyTimer = setTimeout(checkShy, 140); };
    window.addEventListener('scroll', scheduleShy, { passive: true });
    window.addEventListener('resize', scheduleShy, { passive: true });
    window.addEventListener('load', checkShy);
    checkShy();

    // Step aside for Shopify's privacy banner and any element that marks itself as a bottom overlay.
    const checkOverlays = () => {
      const banner = document.querySelector('#shopify-pc__banner, [data-ac-bottom-overlay]');
      const open = !!(banner && banner.offsetParent !== null && banner.getBoundingClientRect().height > 0);
      document.body.classList.toggle('ac-overlay-open', open);
    };
    let pending = 0;
    if ('MutationObserver' in window) new MutationObserver(() => {
      if (!pending) pending = setTimeout(() => { pending = 0; checkOverlays(); }, 250);
    }).observe(document.body, { childList: true });
    checkOverlays();
  }

  // Aster's journey. There is only ever one of him on screen: he peeks over the hero fan, tags along in the corner
  // while you browse, greets you courtside, then walks in and settles on the collector story. The corner Aster waits
  // off-stage whenever one of the placed Asters is in view.
  const placed = new Map();   // element -> rig: placed Asters on or close to the screen (the corner Aster fades out early)
  const onScreen = new Map(); // element -> rig: placed Asters actually on screen (the corner Aster is hard-hidden)
  let tagged = false;
  const syncAway = () => {
    if (!aster) return;
    const away = placed.size > 0;
    const wasAway = aster.classList.contains('is-away');
    aster.classList.toggle('is-away', away);
    aster.classList.toggle('is-offstage', onScreen.size > 0);
    if (away && corner) corner.stop();
    // (On phones the section lines below do the talking when he takes over, so no separate arrival remark there.)
    if (!away && wasAway && corner && !tagged && !aster.hidden && modern && !compact.matches) {
      tagged = true; // first time he drops into the corner after a placed moment
      setTimeout(() => { if (!aster.classList.contains('is-away')) speak('arrive', 'direct', corner); }, 450);
    }
  };
  // Positions are checked in the scroll handler itself (not an observer, which reports a frame or two late), so the
  // corner Aster is already gone in the same frame a placed Aster reaches the screen. Works without IntersectionObserver too.
  const placedEls = [];
  const stageCheck = () => {
    const vh = window.innerHeight;
    placedEls.forEach(item => {
      const el = item.el;
      if (el.offsetParent === null) { placed.delete(el); onScreen.delete(el); return; }
      const box = el.getBoundingClientRect();
      if (box.bottom > 0 && box.top < vh) onScreen.set(el, item.rig); else onScreen.delete(el);
      // Desktop: the corner Aster starts leaving early. Phones: he swaps exactly at the screen edge, so there is always
      // someone on stage to say the line for the section you land in.
      const early = compact.matches ? 0 : 260;
      if (box.bottom > -early && box.top < vh + early) placed.set(el, item.rig); else placed.delete(el);
    });
    syncAway();
  };
  const watchPlaced = (el, rig) => { placedEls.push({ el: el, rig: rig }); stageCheck(); };
  window.addEventListener('scroll', stageCheck, { passive: true });
  window.addEventListener('resize', stageCheck, { passive: true });
  window.addEventListener('load', stageCheck);
  // Whoever is on stage right now does the talking.
  function activeRig() {
    let found = null;
    onScreen.forEach((rig, el) => { if (!found && !el.classList.contains('is-walking') && !el.classList.contains('is-waiting')) found = rig; });
    if (found) return found;
    if (placed.size) return null;
    return corner && !aster.hidden && !aster.classList.contains('is-away') ? corner : null;
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-ac-aster-rig]'), el => {
    const rig = makeRig(el);
    rigs.push(rig);
    el.addEventListener('click', () => speak(el.getAttribute('data-ac-aster-rig') || 'poke', 'direct', rig));
    watchPlaced(el, rig);
  });
  const storyEl = document.querySelector('[data-ac-aster-story]');
  let storyRig = null;
  if (storyEl) {
    storyRig = makeRig(storyEl);
    rigs.push(storyRig);
    storyEl.addEventListener('click', () => speak('story', 'direct', storyRig));
    watchPlaced(storyEl, storyRig);
    // First arrival: he walks in along the top of the story card (sheet row 2), stops, hops and says hello.
    // Until then he waits out of sight, so there is never a settled Aster and a walking Aster at once. The walk sprite
    // is preloaded and the idle and look layers are switched off without a fade, so one clean pose shows from frame one.
    const walk = storyEl.querySelector('.ac-aster-walk');
    const visibleNow = () => storyEl.offsetParent !== null;
    if (walk && motionOk() && visibleNow() && storyEl.getBoundingClientRect().top > window.innerHeight) {
      storyEl.classList.add('is-waiting');
      const src = walk.getAttribute('data-walk-src');
      let ready = false, wanted = false, done = false;
      const start = () => {
        if (done || !ready || !wanted) return;
        done = true;
        if (!motionOk()) { storyEl.classList.remove('is-waiting'); return; }
        storyRig.stop();
        walk.style.backgroundImage = "url('" + src + "')";
        storyEl.classList.add('is-walking');
        storyEl.classList.remove('is-waiting');
        setTimeout(() => {
          storyEl.classList.remove('is-walking');
          speak('story', 'direct', storyRig);
        }, 3400);
      };
      const preload = new Image();
      preload.onload = () => { ready = true; start(); };
      preload.onerror = () => { done = true; storyEl.classList.remove('is-waiting'); }; // no walk sprite: just show him settled
      preload.src = src;
      const arrive = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          arrive.disconnect();
          wanted = true; start();
        });
      }, { threshold: 0.9 });
      arrive.observe(storyEl);
    }
  }

  // Desktop gaze: every visible Aster looks toward the cursor, then returns to idle.
  if (modern && rigs.length) {
    let frame = 0, point = null;
    // position:fixed elements have no offsetParent, so test rendered boxes instead
    const visible = rig => !rig.el.hidden && rig.el.getClientRects().length > 0 && !rig.el.classList.contains('is-shy') && !rig.el.classList.contains('is-away') && !rig.el.classList.contains('is-walking') && !rig.el.classList.contains('is-waiting');
    document.addEventListener('mousemove', event => {
      if (reduce.matches || !finePointer.matches) return;
      if (event.sourceCapabilities && event.sourceCapabilities.firesTouchEvents) return;
      point = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; rigs.forEach(rig => { if (visible(rig)) rig.lookAt(point.x, point.y); }); });
    }, { passive: true });
    const stopAll = () => rigs.forEach(rig => rig.stop());
    document.addEventListener('mouseout', event => { if (!event.relatedTarget) stopAll(); }, { passive: true });
    root.addEventListener('mouseleave', stopAll);
    window.addEventListener('blur', stopAll);
  }

  /* ---------- Reactions: actions, lingering on a card, and the moments along the page ---------- */
  if (modern && rigs.length) {
    document.addEventListener('ac:flip', () => speak('flip', 'action'));
    document.addEventListener('ac:added', () => { const rig = activeRig(); if (rig && speak('added', 'action', rig)) rig.stars(); });

    // Lingering (desktop mouse only): rest on one card for a moment and he may remark on it. Each card gets at most one
    // remark, the shared cooldown spaces them out, and a coin flip keeps it occasional.
    const remarked = new WeakSet();
    let lingerTimer = 0, lingerCard = null;
    const contextOf = card => {
      const traits = ' ' + (card.getAttribute('data-ac-traits') || '') + ' ';
      if (traits.indexOf(' soldout ') !== -1) return 'soldout';
      if (traits.indexOf(' graded ') !== -1 && Math.random() < 0.6) return 'graded';
      if (traits.indexOf(' holo ') !== -1 && Math.random() < 0.6) return 'holo';
      const shelf = card.closest('[data-ac-context]');
      const where = shelf ? shelf.getAttribute('data-ac-context') : '';
      if (LINES[where] && where !== 'browse' && Math.random() < 0.3) return where;
      return 'linger';
    };
    document.addEventListener('mouseover', event => {
      const card = event.target.closest && event.target.closest('.ac-product-card, .ac-fan-card');
      if (!finePointer.matches || (reduce.matches && !(card && card.hasAttribute('data-ac-aster-demo')))) return;
      if (card === lingerCard) return;
      clearTimeout(lingerTimer);
      lingerCard = card;
      if (card && card.hasAttribute('data-ac-aster-demo')) {
        // Preview hook: a card marked data-ac-aster-demo always gets a remark after a deliberate hover, without touching
        // the storefront's cooldown or shuffle. No theme file renders this attribute; the interactive preview adds it.
        lingerTimer = setTimeout(() => {
          const rig = activeRig();
          if (lingerCard !== card || !rig) return;
          rig.say(card.getAttribute('data-ac-aster-demo') || pick('linger'), 'demo');
          card.setAttribute('data-ac-aster-demo', ''); // the first line can be fixed; after that he varies
        }, 900);
        return;
      }
      if (!card || remarked.has(card)) return;
      lingerTimer = setTimeout(() => {
        if (lingerCard !== card || Date.now() - lastSpoke < COOLDOWN.linger || Math.random() > 0.6) return;
        if (speak(contextOf(card), 'linger')) remarked.add(card);
      }, 1500);
    }, { passive: true });

    // Moments along the page: each shelf, the racket sports section, the story (when no settled Aster is there) and the footer.
    const once = (el, context, threshold) => {
      const seen = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          seen.disconnect();
          // If nobody is on stage at that instant (he is between spots), try again a couple of times, then let it go.
          let tries = 0;
          const attempt = () => { if (compact.matches) return; if (!activeRig() && ++tries < 4) { setTimeout(attempt, 800); return; } speak(context, 'ambient'); };
          setTimeout(attempt, 500);
        });
      }, { threshold: threshold });
      seen.observe(el);
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-ac-context]'), el => {
      const context = el.getAttribute('data-ac-context');
      // The courtside page already opens with Aster's written greeting, so no automatic remark there.
      if (LINES[context] && context !== 'browse' && context !== 'hero' && context !== 'table' && !el.classList.contains('ac-courtside')) once(el, context, 0.3);
    });
    const story = document.querySelector('.ac-story');
    if (story && !(storyEl && storyEl.offsetParent !== null)) once(story, 'story', 0.55);
    const footer = document.querySelector('.ac-footer');
    if (footer) once(footer, 'footer', 0.4);

    /* Phones and small tablets: a dependable line for the section you land in.
       When scrolling stops, the section under a point a little above the middle of the screen is the active one. If it
       is not the one he last spoke for, whoever is on stage says a line from that section's own pool (or the fallback
       pool). A fast scroll past several sections therefore gets one line, for where you actually stopped. Coming back
       to a section later gets a different line, because each pool is a shuffle bag. */
    const SECTIONS = '.ac-welcome, [data-ac-context], .ac-story, .ac-footer, #ProductGridContainer';
    const contextFor = el => {
      const named = el.getAttribute('data-ac-context');
      const context = named || (el.classList.contains('ac-welcome') ? 'hero' : el.classList.contains('ac-story') ? 'story' : el.classList.contains('ac-footer') ? 'footer' : el.id === 'ProductGridContainer' ? 'catalog' : '');
      return LINES[context] ? context : FALLBACK;
    };
    let landedIn = null, settleTimer = 0, retryTimer = 0;
    const sectionAt = () => {
      const probe = window.innerHeight * 0.42;
      let best = null, bestHeight = Infinity;
      // At the very end of the page the last section may be too short to reach the probe: it is the active one.
      const atEnd = window.innerHeight + (window.pageYOffset || 0) >= root.scrollHeight - 8;
      const all = document.querySelectorAll(SECTIONS);
      if (atEnd) for (let i = all.length - 1; i >= 0; i--) {
        if (!all[i].getClientRects().length) continue;
        const last = all[i].getBoundingClientRect();
        if (last.top < window.innerHeight && last.bottom > 0) return all[i];
      }
      Array.prototype.forEach.call(all, el => {
        if (!el.getClientRects().length) return;
        const box = el.getBoundingClientRect();
        // The innermost section under the probe wins (the kiosk's card grid sits inside the kiosk section).
        if (box.top <= probe && box.bottom > probe && box.height < bestHeight) { best = el; bestHeight = box.height; }
      });
      return best;
    };
    const land = tries => {
      if (!compact.matches) return;
      const el = sectionAt();
      if (!el || el === landedIn) return;
      // An answer to a tap that he is in the middle of giving is allowed to finish first.
      if (Date.now() - lastSpoke < 1200) { clearTimeout(retryTimer); retryTimer = setTimeout(() => land(tries), 1250); return; }
      if (speak(contextFor(el), 'section')) { landedIn = el; return; }
      // Nobody on stage this instant (he is swapping places): try again shortly, for the section you are in by then.
      if (tries < 5) { clearTimeout(retryTimer); retryTimer = setTimeout(() => land(tries + 1), 450); }
    };
    const settle = () => { clearTimeout(settleTimer); settleTimer = setTimeout(() => land(0), 170); };
    // Scroll events keep arriving through a finger drag and its momentum, so "no scroll for a moment" means stopped.
    window.addEventListener('scroll', settle, { passive: true });
    window.__acLand = () => { clearTimeout(settleTimer); land(0); }; // the standalone preview calls this after it switches page
    // Arrival. On the homepage his first words are always "I'll tag along."; other pages open with their own section.
    if (compact.matches) setTimeout(() => {
      const first = sectionAt();
      if (first && contextFor(first) !== 'hero') { land(0); return; }
      if (speak('arrive', 'section')) { landedIn = first; tagged = true; }
    }, 900);
  }

  /* ---------- Catch the light (phones and small tablets): tap the star in the hero ----------
     A ribbon of foil light crosses the cards, the glints answer, Aster reacts, and the star settles somewhere new.
     Replayable. It is an ordinary button, so scrolling and card taps are untouched. Without motion it is a soft glow. */
  const catcher = document.querySelector('[data-ac-catch]');
  if (catcher) {
    const catchStage = catcher.parentNode;
    let perch = 0, caughtAt = 0, landTimer = 0;
    catcher.addEventListener('click', () => {
      const now = Date.now();
      if (now - caughtAt < 450) return;
      caughtAt = now;
      catchStage.classList.remove('is-caught', 'is-landing');
      void catchStage.offsetWidth; // replay from the first frame
      catchStage.classList.add('is-caught', 'has-caught');
      const rig = activeRig();
      if (rig && !speak('catchlight', 'direct', rig)) rig.hop();
      clearTimeout(landTimer);
      landTimer = setTimeout(() => {
        catchStage.classList.remove('is-caught');
        if (!motionOk()) return;
        perch = (perch + 1) % 4;
        catcher.setAttribute('data-perch', String(perch));
        catchStage.classList.add('is-landing');
        setTimeout(() => catchStage.classList.remove('is-landing'), 460);
      }, 1000);
    });
  }
  // The lit panels clip their light (overflow: clip). Browsers without `clip` fall back to overflow: hidden, which can
  // still be scrolled by focus or scrollIntoView; if that ever happens, put the panel straight back.
  Array.prototype.forEach.call(document.querySelectorAll('.ac-welcome, .ac-racket, .ac-racket-play, .ac-court, .ac-story'), panel => {
    panel.addEventListener('scroll', () => { if (panel.scrollTop || panel.scrollLeft) { panel.scrollTop = 0; panel.scrollLeft = 0; } }, { passive: true });
  });
  // The hero's ambient light and stars rest while the hero is off screen.
  const heroStage = document.querySelector('[data-ac-showcase]');
  if (heroStage && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => entries.forEach(entry => heroStage.classList.toggle('is-offscreen', !entry.isIntersecting)), { threshold: 0.02 }).observe(heroStage);
  }

  /* ---------- Courtside scene outside the kiosk (the homepage spotlight) ----------
     Tap to play: a tap or click anywhere in the game area starts a rally ("Tap to play" is a button in that area, for
     the keyboard). Pause is its own control, apart from the stock button.
     The kiosk page runs its own copy of this in albert-kiosk.js, where it also steps aside for search. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-ac-court]'), box => {
    if (box.closest('[data-ac-kiosk]')) return;
    const scene = box.querySelector('[data-ac-court-scene]');
    if (!scene) return;
    const pauseButton = box.querySelector('[data-ac-court-pause]');
    const pauseText = box.querySelector('[data-ac-court-pause-text]');
    let rallyTimer = 0, paused = false;
    const setPaused = next => {
      paused = next;
      scene.classList.toggle('is-paused', paused);
      if (pauseButton) { pauseButton.setAttribute('aria-pressed', String(paused)); pauseButton.setAttribute('aria-label', paused ? 'Resume the game' : 'Pause the game'); }
      if (pauseText) pauseText.textContent = paused ? 'Resume' : 'Pause';
    };
    const rally = () => {
      if (paused) setPaused(false);
      scene.classList.remove('is-rallying');
      scene.setAttribute('data-pick', String(1 + Math.floor(Math.random() * 5))); // Lucky pull: which of the five cards is the gold one this round
      void scene.offsetWidth; // restart from the first frame when replayed mid-rally
      scene.classList.add('is-rallying');
      clearTimeout(rallyTimer);
      rallyTimer = setTimeout(() => scene.classList.remove('is-rallying'), motionOk() ? 3300 : 1250);
    };
    box.addEventListener('click', event => {
      const control = event.target.closest && event.target.closest('button, a');
      if (control && control.hasAttribute('data-ac-court-pause')) { setPaused(!paused); return; }
      if (control && !control.hasAttribute('data-ac-court-play')) return; // Aster's own button: he talks instead
      rally();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => entries.forEach(entry => scene.classList.toggle('is-offscreen', !entry.isIntersecting)), { threshold: 0.05 }).observe(scene);
    }
  });

  /* ---------- Hero fan: the caption names whichever card is in hand ---------- */
  const fan = document.querySelector('[data-ac-fan]');
  if (fan) {
    const stage = fan.parentNode;
    const title = stage.querySelector('[data-ac-fan-title]');
    const price = stage.querySelector('[data-ac-fan-price]');
    const link = stage.querySelector('[data-ac-fan-link]');
    const caption = stage.querySelector('.ac-fan-caption');
    const cards = Array.prototype.slice.call(fan.querySelectorAll('[data-ac-fan-card]'));
    const cardOf = event => (event.target.closest ? event.target.closest('[data-ac-fan-card]') : null);
    const home = fan.querySelector('.is-featured') || cards[0];
    let shown = home, swapTimer = 0, wheelOn = false;
    // The caption always carries the card's own name, price and link.
    const show = (card, atOnce) => {
      if (!card || card === shown || !title || !price) return;
      shown = card;
      const apply = () => {
        const anchor = card.querySelector('a');
        title.textContent = card.getAttribute('data-title');
        price.textContent = card.getAttribute('data-price');
        if (link && anchor) link.setAttribute('href', anchor.getAttribute('href'));
        caption.classList.remove('is-swapping');
      };
      clearTimeout(swapTimer);
      if (!atOnce && motionOk()) { caption.classList.add('is-swapping'); swapTimer = setTimeout(apply, 140); } else apply();
    };
    fan.addEventListener('mouseover', event => { if (!wheelOn) show(cardOf(event)); });
    fan.addEventListener('focusin', event => { if (!wheelOn) show(cardOf(event)); });

    /* ---------- Phones and small tablets: the fan is a wheel you flick through ----------
       One card in the middle, a neighbour peeking in on each side. A sideways drag turns the wheel with the finger; on
       release it carries a little of the finger's speed and settles on a card. An up-and-down drag is left to the page.
       A tap on the middle card (or the caption) opens it; a tap on a neighbour brings it to the middle instead.
       With reduced motion, or on browsers without the modern layout, the wheel is flat and settles at once, one card
       per swipe, so swiping still works. */
    const count = cards.length;
    if (count > 1 && title && price && caption) {
      const loops = count >= 3;
      const dots = stage.querySelector('[data-ac-fan-dots]');
      const SPREAD = 80;           // a neighbour sits this far from the middle, in % of a card's width
      const STIFFNESS = 260;       // settle spring, critically damped: no bounce
      const DAMPING = 2 * Math.sqrt(STIFFNESS);
      let pos = Math.max(0, cards.indexOf(home)), dest = pos, speed = 0, frame = 0, lastTick = 0, centre = -1;
      let drag = null, quietUntil = 0, pressed = -1, pressedAt = -1e9, touchedAt = -1e9;
      const clock = () => (window.performance && performance.now ? performance.now() : Date.now());
      const mod = i => ((i % count) + count) % count;
      const nearest = d => (loops ? d - count * Math.round(d / count) : d);
      const setCentre = c => {
        centre = c;
        cards.forEach((card, i) => card.classList.toggle('is-featured', i === c));
        show(cards[c], true);
        if (dots) Array.prototype.forEach.call(dots.children, (dot, i) => dot.classList.toggle('is-on', i === c));
        // the next photos on either side load before they are needed
        [c - 2, c - 1, c + 1, c + 2].forEach(k => {
          if (!loops && (k < 0 || k >= count)) return;
          const img = cards[mod(k)].querySelector('img');
          if (img && img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager');
        });
      };
      const layout = () => {
        const rich = motionOk();
        for (let i = 0; i < count; i++) {
          const d = nearest(i - pos), away = Math.abs(d), side = d < 0 ? -1 : 1;
          const inner = Math.min(away, 1), outer = Math.min(Math.max(away - 1, 0), 1);
          const x = side * (inner * SPREAD + outer * 44), y = inner * 4 + outer * 3;
          const scale = 1 - inner * 0.2 - outer * 0.12;
          const alpha = Math.max(0, 1 - inner * 0.28 - outer * 1.5);
          const turn = rich ? ' rotateY(' + (side * (inner * 30 + outer * 10)).toFixed(2) + 'deg) rotate(' + (side * inner * 3).toFixed(2) + 'deg)' : '';
          const style = cards[i].style;
          style.webkitTransform = style.transform = 'translate3d(' + x.toFixed(2) + '%,' + y.toFixed(2) + '%,0)' + turn + ' scale(' + scale.toFixed(3) + ')';
          style.opacity = alpha.toFixed(3);
          style.zIndex = String(30 - Math.round(away * 10));
          style.pointerEvents = alpha > 0.4 ? 'auto' : 'none';
        }
        const c = mod(Math.round(pos));
        if (c !== centre) setCentre(c);
      };
      const rest = () => {
        pos = dest; speed = 0; frame = 0;
        if (loops) pos = dest = mod(Math.round(pos));
        layout();
      };
      const settle = () => {
        cancelAnimationFrame(frame); frame = 0;
        if (!motionOk()) { rest(); return; }
        lastTick = 0;
        const tick = t => {
          const dt = Math.min(lastTick ? t - lastTick : 16, 34) / 1000;
          lastTick = t;
          speed += (-STIFFNESS * (pos - dest) - DAMPING * speed) * dt;
          pos += speed * dt;
          if (Math.abs(pos - dest) < 0.004 && Math.abs(speed) < 0.05) { rest(); return; } // within about half a pixel
          layout();
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      };
      const go = i => { dest = pos + nearest(i - pos); if (!loops) dest = Math.max(0, Math.min(count - 1, dest)); settle(); };
      const begin = (x, y, id) => {
        const moving = !!frame;
        cancelAnimationFrame(frame); frame = 0;
        drag = { id: id, x: x, y: y, from: pos, locked: false, lastX: x, lastT: clock(), v: 0, moving: moving, step: Math.max(60, cards[0].offsetWidth * SPREAD / 100) };
        pressed = mod(Math.round(dest)); pressedAt = Date.now();
      };
      const release = cancelled => {
        const d = drag;
        if (!d) return;
        drag = null;
        stage.classList.remove('is-dragging');
        if (!d.locked) {
          // a touch that only stopped a moving wheel is not a tap on a card
          if (d.moving) { quietUntil = Date.now() + 450; dest = Math.round(pos); speed = 0; settle(); }
          return;
        }
        quietUntil = Date.now() + 450;
        const v = cancelled || clock() - d.lastT > 80 ? 0 : d.v * 1000; // cards per second at release
        const start = Math.round(d.from), moved = pos - d.from;
        let to;
        if (motionOk()) {
          to = Math.round(pos + Math.max(-2.6, Math.min(2.6, v * 0.28)));
          if (to === start && Math.abs(v) > 1.2 && Math.abs(moved) > 0.06) to += v > 0 ? 1 : -1; // a short quick flick still turns one card
        } else {
          to = Math.abs(moved) > 0.5 ? Math.round(pos) : start + (Math.abs(moved) > 0.15 ? (moved > 0 ? 1 : -1) : 0);
        }
        if (!loops) to = Math.max(0, Math.min(count - 1, to));
        dest = to; speed = v;
        settle();
      };
      const track = (x, y, event) => {
        const d = drag;
        if (!d) return;
        const dx = x - d.x, dy = y - d.y;
        if (!d.locked) {
          if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { release(true); return; } // the page scrolls; the wheel lets go
          if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
          d.locked = true; d.x = x; d.lastX = x; d.lastT = clock();
          stage.classList.add('is-dragging');
          if (event && event.cancelable) event.preventDefault();
          return;
        }
        if (event && event.cancelable) event.preventDefault();
        let p = d.from - (x - d.x) / d.step;
        if (!loops) { if (p < 0) p *= 0.35; else if (p > count - 1) p = count - 1 + (p - count + 1) * 0.35; } // the ends give a little, then hold
        const t = clock(), dt = t - d.lastT;
        if (dt > 0) { d.v = d.v * 0.35 + (-(x - d.lastX) / d.step / dt) * 0.65; d.lastX = x; d.lastT = t; }
        pos = p;
        layout();
      };
      const fingerOf = (event, id) => { for (let i = 0; i < event.changedTouches.length; i++) if (event.changedTouches[i].identifier === id) return event.changedTouches[i]; return null; };
      stage.addEventListener('touchstart', event => {
        if (!wheelOn) return;
        touchedAt = Date.now();
        if (event.touches.length !== 1) { release(true); return; }
        begin(event.touches[0].clientX, event.touches[0].clientY, event.touches[0].identifier);
      }, { passive: true });
      stage.addEventListener('touchmove', event => {
        if (!drag) return;
        const finger = fingerOf(event, drag.id);
        if (finger) track(finger.clientX, finger.clientY, event);
      }, { passive: false });
      const lift = cancelled => event => { touchedAt = Date.now(); if (drag && fingerOf(event, drag.id)) release(cancelled); };
      stage.addEventListener('touchend', lift(false), { passive: true });
      stage.addEventListener('touchcancel', lift(true), { passive: true });
      // A mouse can drag the wheel too (a narrow desktop window, or a phone-size preview).
      stage.addEventListener('mousedown', event => {
        if (!wheelOn || event.button !== 0 || Date.now() - touchedAt < 800) return;
        begin(event.clientX, event.clientY, 'mouse');
      });
      document.addEventListener('mousemove', event => { if (drag && drag.id === 'mouse') track(event.clientX, event.clientY, event); });
      document.addEventListener('mouseup', () => { if (drag && drag.id === 'mouse') release(false); });
      stage.addEventListener('dragstart', event => { if (wheelOn) event.preventDefault(); });
      // Taps: a swipe never opens a product; a neighbour comes to the middle; only the middle card opens.
      stage.addEventListener('click', event => {
        if (!wheelOn) return;
        if (Date.now() < quietUntil) { event.preventDefault(); event.stopPropagation(); return; }
        const card = cardOf(event);
        if (!card) return;
        const i = cards.indexOf(card);
        if (Date.now() - pressedAt < 900 && i !== pressed) { event.preventDefault(); event.stopPropagation(); go(i); }
      }, true);
      // Keyboard and screen readers: focusing a card brings it to the middle; the arrow keys turn the wheel.
      fan.addEventListener('focusin', event => {
        const card = cardOf(event);
        if (!wheelOn || !card || Date.now() - pressedAt < 900) return;
        if (cards.indexOf(card) !== mod(Math.round(dest))) go(cards.indexOf(card));
      });
      stage.addEventListener('keydown', event => {
        if (!wheelOn || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
        const next = Math.round(dest) + (event.key === 'ArrowRight' ? 1 : -1);
        if (!loops && (next < 0 || next >= count)) return;
        event.preventDefault();
        const anchor = cards[mod(next)].querySelector('a');
        if (anchor && cardOf(event)) anchor.focus(); else go(mod(next));
      });
      const sync = () => {
        const want = compact.matches;
        if (want === wheelOn) { if (wheelOn) layout(); return; }
        wheelOn = want;
        stage.classList.toggle('is-wheel', want);
        cancelAnimationFrame(frame); frame = 0; drag = null; speed = 0;
        if (want) {
          if (dots && dots.children.length !== count) {
            dots.textContent = '';
            cards.forEach(() => { const dot = document.createElement('span'); dot.className = 'ac-fan-dot'; dots.appendChild(dot); });
          }
          pos = dest = Math.max(0, cards.indexOf(home)); centre = -1;
          layout();
        } else {
          cards.forEach(card => {
            const style = card.style;
            style.webkitTransform = style.transform = style.opacity = style.zIndex = style.pointerEvents = '';
            card.classList.toggle('is-featured', card === home);
          });
          show(home, true);
        }
      };
      const onChange = (query, fn) => { if (query.addEventListener) query.addEventListener('change', fn); else if (query.addListener) query.addListener(fn); };
      onChange(compact, sync);
      onChange(reduce, sync);
      sync();
    }
  }

  /* ---------- Pickleball rally: plays once when it scrolls in, and again from the section's button ---------- */
  const rallies = document.querySelectorAll('[data-ac-rally]');
  if (rallies.length && modern) {
    const play = art => {
      if (!art || !motionOk()) return; // reduced motion and older browsers keep the still pose
      art.classList.remove('is-playing'); void art.getBoundingClientRect(); art.classList.add('is-playing');
      clearTimeout(art.__acRally);
      art.__acRally = setTimeout(() => art.classList.remove('is-playing'), 1600);
    };
    const entered = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (!entry.isIntersecting) return; entered.unobserve(entry.target); setTimeout(() => play(entry.target), 250); });
    }, { threshold: 0.7 });
    Array.prototype.forEach.call(rallies, art => entered.observe(art));
    const replay = event => {
      const cta = event.target.closest && event.target.closest('.ac-racket-button, .ac-courtside-jump');
      if (!cta || (event.type === 'mouseover' && cta.contains(event.relatedTarget))) return; // only when the pointer arrives
      const scope = cta.closest('.ac-racket, .ac-courtside');
      play(scope && scope.querySelector('[data-ac-rally]'));
    };
    document.addEventListener('mouseover', replay, { passive: true });
    document.addEventListener('focusin', replay);
  }

  /* ---------- Scroll reveals: headings, shelves, story; once per section ---------- */
  if (motionOk()) {
    const FADE = '.ac-shelf-header, .ac-story, .ac-categories, .ac-footer-top, .ac-racket-copy, .collection-hero__inner, .title-wrapper-with-link, .ac-help > h1';
    const GRIDS = '.ac-product-grid, .product-grid';
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    const belowFold = el => el.getBoundingClientRect().top > window.innerHeight * 0.92;
    document.querySelectorAll(FADE).forEach(el => { if (belowFold(el)) { el.classList.add('ac-reveal'); io.observe(el); } });
    document.querySelectorAll(GRIDS).forEach(grid => {
      if (!belowFold(grid)) return; // sections already on screen stay put
      Array.prototype.forEach.call(grid.children, (card, i) => { card.style.transitionDelay = Math.min(i, 7) * 50 + 'ms'; });
      grid.classList.add('ac-reveal-grid');
      io.observe(grid);
    });
    window.addEventListener('beforeprint', () => document.querySelectorAll('.ac-reveal, .ac-reveal-grid').forEach(el => el.classList.add('is-revealed')));
  }

  const syncVisibility = () => {
    root.classList.toggle('ac-life-paused', document.hidden);
    rigs.forEach(rig => rig.el.classList.toggle('is-paused', document.hidden));
  };
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();
})();
