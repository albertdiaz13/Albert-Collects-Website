/*
 * Albert Collects refinements: the card inspector on product pages and Aster's peek-and-tuck on phones.
 * Loaded after albert-card-tilt.js and albert-store.js. ES2017 syntax, no dependencies. Everything here is an
 * enhancement: without it the product photo, flip button and Add to bag all still work.
 */
(() => {
  'use strict';
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const reduce = mq('(prefers-reduced-motion: reduce)');
  const compact = mq('(max-width: 989px)');
  const listen = (list, fn) => { if (list.addEventListener) list.addEventListener('change', fn); else if (list.addListener) list.addListener(fn); };

  /* ---------------- Card inspector ---------------- */
  const CORNER_NAMES = { tl: 'top-left', tr: 'top-right', bl: 'bottom-left', br: 'bottom-right' };
  document.querySelectorAll('[data-acp]').forEach((root) => {
    const viewer = root.querySelector('[data-acp-viewer]');
    if (!viewer || typeof viewer.showModal !== 'function') return;
    const card = root.querySelector('.acp__card');
    const flipButton = root.querySelector('[data-ac-flip-toggle]');
    const stage = viewer.querySelector('[data-acp-stage]');
    const imgs = { front: viewer.querySelector('[data-acp-img="front"]'), back: viewer.querySelector('[data-acp-img="back"]') };
    const sideButtons = Array.prototype.slice.call(viewer.querySelectorAll('[data-acp-side]'));
    const status = viewer.querySelector('[data-acp-status]');
    const MAX = 6;
    let side = 'front';
    let s = 1, x = 0, y = 0;
    let fit = { w: 0, h: 0 }, box = { w: 0, h: 0 };
    let opener = null;
    let raf = 0;

    const img = () => imgs[side] || imgs.front;
    const load = (el) => { if (el && el.dataset.src) { el.src = el.dataset.src; el.removeAttribute('data-src'); } };
    const announce = (text) => {
      if (!status) return;
      cancelAnimationFrame(raf);
      status.textContent = '';
      raf = requestAnimationFrame(() => { status.textContent = text; });
    };
    const sideName = () => (side === 'back' ? 'back' : 'front');

    function measure() {
      const rect = stage.getBoundingClientRect();
      box = { w: rect.width, h: rect.height };
      const el = img();
      const ratio = (Number(el.getAttribute('width')) || 3) / (Number(el.getAttribute('height')) || 4);
      const pad = compact.matches ? 14 : 28;
      let w = Math.max(40, box.w - pad * 2);
      let h = w / ratio;
      if (h > box.h - pad * 2) { h = Math.max(40, box.h - pad * 2); w = h * ratio; }
      fit = { w, h };
      el.style.width = w + 'px';
      el.style.height = h + 'px';
    }
    function clamp() {
      if (s <= 1.001) { s = 1; x = 0; y = 0; return; }
      const slack = 24;
      const maxX = Math.max(0, (fit.w * s - box.w) / 2 + slack);
      const maxY = Math.max(0, (fit.h * s - box.h) / 2 + slack);
      x = Math.min(maxX, Math.max(-maxX, x));
      y = Math.min(maxY, Math.max(-maxY, y));
    }
    function apply(animate) {
      const el = img();
      clamp();
      el.classList.toggle('is-gliding', !!animate && !reduce.matches);
      el.style.transform = 'translate(-50%, -50%) translate(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
      viewer.classList.toggle('is-zoomed', s > 1.01);
    }
    // Zoom to a new scale, keeping the point (px, py) — measured from the stage centre — under the finger or cursor.
    function zoomAt(ns, px, py) {
      ns = Math.min(MAX, Math.max(1, ns));
      x = px - (px - x) * (ns / s);
      y = py - (py - y) * (ns / s);
      s = ns;
    }
    const centre = (clientX, clientY) => {
      const r = stage.getBoundingClientRect();
      return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
    };
    function fitAll(animate) { s = 1; x = 0; y = 0; apply(animate); }
    function corner(which) {
      const inset = compact.matches ? 14 : 24;
      s = 3;
      const halfW = (fit.w * s) / 2, halfH = (fit.h * s) / 2;
      x = which[1] === 'l' ? -box.w / 2 + inset + halfW : box.w / 2 - inset - halfW;
      y = which[0] === 't' ? -box.h / 2 + inset + halfH : box.h / 2 - inset - halfH;
      apply(true);
      announce('Showing the ' + CORNER_NAMES[which] + ' corner of the ' + sideName() + ', zoomed in.');
    }
    function setSide(next, quiet) {
      if (!imgs[next]) next = 'front';
      side = next;
      Object.keys(imgs).forEach((k) => { if (imgs[k]) imgs[k].hidden = k !== side; });
      load(img());
      sideButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-acp-side') === side)));
      measure();
      fitAll(false);
      if (!quiet) announce('Showing the ' + sideName() + ' of the card.');
    }

    function open(from) {
      opener = from || null;
      const flipped = !!(card && card.classList.contains('is-flipped'));
      setSide(flipped ? 'back' : 'front', true);
      viewer.showModal();
      document.documentElement.classList.add('acp-locked');
      requestAnimationFrame(() => { measure(); fitAll(false); });
      // Warm the other side so switching is instant.
      Object.keys(imgs).forEach((k) => load(imgs[k]));
    }
    root.querySelectorAll('[data-acp-open]').forEach((el) => {
      el.addEventListener('click', () => open(el));
      if (el.getAttribute('role') === 'button') {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el); }
        });
      }
    });
    viewer.querySelector('[data-acp-close]').addEventListener('click', () => viewer.close());
    viewer.addEventListener('close', () => {
      document.documentElement.classList.remove('acp-locked');
      // Return to the side that was being inspected.
      if (card && flipButton) {
        const flipped = card.classList.contains('is-flipped');
        if ((side === 'back') !== flipped) flipButton.click();
      }
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    });
    sideButtons.forEach((b) => b.addEventListener('click', () => setSide(b.getAttribute('data-acp-side'))));
    viewer.querySelectorAll('[data-acp-corner]').forEach((b) => b.addEventListener('click', () => corner(b.getAttribute('data-acp-corner'))));
    viewer.querySelector('[data-acp-fit]').addEventListener('click', () => { fitAll(true); announce('Showing the whole ' + sideName() + '.'); });
    viewer.querySelectorAll('[data-acp-zoom]').forEach((b) => b.addEventListener('click', () => {
      zoomAt(b.getAttribute('data-acp-zoom') === '1' ? s * 1.6 : s / 1.6, 0, 0);
      apply(true);
    }));
    window.addEventListener('resize', () => { if (viewer.open) { measure(); apply(false); } }, { passive: true });

    // Pinch, pan, double-tap (touch) and click (mouse) to zoom.
    const pts = new Map();
    let pinch = null, last = null, moved = false, lastTap = { t: 0, x: 0, y: 0 };
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      img().classList.remove('is-gliding');
      moved = false;
      if (pts.size === 2) {
        const [a, b] = Array.from(pts.values());
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        last = null;
      } else if (pts.size === 1) {
        last = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
      }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2 && pinch) {
        const [a, b] = Array.from(pts.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const c = centre(mx, my);
        x += mx - pinch.mx; y += my - pinch.my;
        zoomAt(pinch.s * (d / pinch.d), c.x, c.y);
        pinch.mx = mx; pinch.my = my;
        moved = true;
        apply(false);
      } else if (last) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y;
        if (Math.abs(e.clientX - last.sx) + Math.abs(e.clientY - last.sy) > 6) moved = true;
        if (s > 1) { x += dx; y += dy; apply(false); }
        last.x = e.clientX; last.y = e.clientY;
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) { const p = Array.from(pts.values())[0]; last = { x: p.x, y: p.y, sx: p.x, sy: p.y }; moved = true; return; }
      last = null;
      if (e.type !== 'pointerup' || moved) return;
      const c = centre(e.clientX, e.clientY);
      const toggle = () => {
        if (s > 1.05) fitAll(true);
        else { zoomAt(2.6, c.x, c.y); apply(true); }
      };
      if (e.pointerType === 'mouse') { toggle(); return; }
      const now = Date.now();
      if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32) { toggle(); lastTap.t = 0; }
      else lastTap = { t: now, x: e.clientX, y: e.clientY };
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const c = centre(e.clientX, e.clientY);
      zoomAt(s * Math.exp(-e.deltaY * 0.0018), c.x, c.y);
      apply(false);
    }, { passive: false });
    stage.addEventListener('keydown', (e) => {
      const step = 60;
      let handled = true;
      if (e.key === '+' || e.key === '=') zoomAt(s * 1.4, 0, 0);
      else if (e.key === '-' || e.key === '_') zoomAt(s / 1.4, 0, 0);
      else if (e.key === '0') { s = 1; }
      else if (e.key === 'ArrowLeft') x += step;
      else if (e.key === 'ArrowRight') x -= step;
      else if (e.key === 'ArrowUp') y += step;
      else if (e.key === 'ArrowDown') y -= step;
      else handled = false;
      if (handled) { e.preventDefault(); apply(true); }
    });
  });

  /* ---------------- Aster on phones: peek in, say the line, tuck away ----------------
     albert-store.js decides when Aster speaks (each new collection or category gets a line) and adds .is-talking
     while he does. On phones the CSS turns that into a peek from the left edge; here he also tucks away the moment
     the shopper touches the page, so a line never sits on top of a card, title or button they are reaching for. */
  const aster = document.querySelector('[data-ac-aster]');
  if (aster) {
    const sync = () => aster.classList.toggle('ac-peek-mode', compact.matches);
    sync();
    listen(compact, sync);
    const tuck = (event) => {
      if (!compact.matches || !aster.classList.contains('is-talking')) return;
      if (event && event.target && aster.contains(event.target)) return;
      aster.classList.remove('is-talking');
    };
    document.addEventListener('touchstart', tuck, { passive: true, capture: true });

    // Placement: before he peeks out, try a few heights along the left edge and use the first where neither he nor his
    // bubble would sit on a button, link, field or heading (product photos don't count, as in albert-store.js).
    const BUSY = 'a[href]:not(.ac-image-stage), button, input, select, textarea, summary, label, [role="button"], h1, h2, h3, .shopify-payment-button, .acx-intro__lede, .acx-prose, .acx-level__summary, .acx-pull, .acp__about, .acp__facts, .rte';
    const SPOTS = [12, 0.2, 0.34, 0.48, 0.62, 0.72, 0.8]; // px from the bottom, or a fraction of the screen height
    const busyAt = (bottom) => {
      const vh = window.innerHeight, vw = document.documentElement.clientWidth;
      const size = aster.offsetHeight || 60;
      const top = vh - bottom - size;
      const bubbleW = Math.min(240, vw - 100);
      const pts = [];
      // A dense grid over him and his bubble, with a small margin, so even an edge of a link or field counts.
      for (let r = 0; r <= 6; r++) {
        const yy = top - 6 + ((size + 12) * r) / 6;
        for (let c = 0; c <= 4; c++) pts.push([4 + (70 * c) / 4, yy]);
        for (let k = 0; k <= 8; k++) pts.push([80 + (bubbleW * k) / 8, yy]);
      }
      let hits = 0;
      pts.forEach(([px, py]) => {
        if (py < 0 || py > vh) return;
        const stack = document.elementsFromPoint ? document.elementsFromPoint(px, py) : [];
        if (stack.some((el) => !aster.contains(el) && el.closest && el.closest(BUSY))) hits++;
      });
      return hits;
    };
    const place = () => {
      if (!aster.classList.contains('ac-peek-mode')) { aster.style.removeProperty('bottom'); return; }
      const vh = window.innerHeight;
      let best = null;
      for (const spot of SPOTS) {
        const bottom = Math.round(spot < 1 ? vh * spot : spot);
        const hits = busyAt(bottom);
        if (!best || hits < best.hits) best = { bottom, hits };
        if (hits === 0) break;
      }
      if (best.hits > 0) {
        // Nowhere clear right now: he keeps this line to himself and stays tucked until the next category.
        aster.classList.remove('is-talking');
        return;
      }
      aster.style.setProperty('bottom', 'calc(' + best.bottom + 'px + env(safe-area-inset-bottom))', 'important');
    };
    let wasTalking = aster.classList.contains('is-talking');
    new MutationObserver(() => {
      const talking = aster.classList.contains('is-talking');
      if (talking && !wasTalking) place();
      wasTalking = talking;
    }).observe(aster, { attributes: true, attributeFilter: ['class'] });
    let lastY = window.pageYOffset;
    window.addEventListener('scroll', () => {
      const yNow = window.pageYOffset;
      if (Math.abs(yNow - lastY) > 140) tuck();
      if (!aster.classList.contains('is-talking')) lastY = yNow;
    }, { passive: true });
  }
})();
