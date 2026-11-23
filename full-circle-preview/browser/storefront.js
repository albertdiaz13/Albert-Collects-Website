/* Full Circle storefront, running entirely in the browser.
 *
 * Renders the theme files on the branch with core.js (the same renderer the Node preview
 * server uses), then behaves like a storefront:
 *   - links and forms are routed in the page (the address keeps a #name so reloads work)
 *   - fetch() calls to the Ajax Cart API, the Section Rendering API and recommendations are
 *     answered by core.js, so the theme's own fc-theme.js runs unchanged
 *   - the cart is kept in this browser (localStorage); checkout is simulated
 *   - each navigation fires shopify:section:unload / shopify:section:load, the same events
 *     the theme editor fires, so theme scripts re-initialise exactly as they do in Shopify
 */
(function () {
  'use strict';

  const realFetch = window.fetch.bind(window);
  const STORE_KEY = 'fc-preview-cart';
  const MODE_KEY = 'fc-preview-mode';
  const IMG_WIDTHS = [600, 1200];

  let app;
  let imageIndex = {};
  let cart = { lines: [], note: '' };
  let mode = 'full';
  let current = '/';
  let scriptsBooted = false;

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: keep in memory */ }
  }

  /* ---------- routes ⇄ #names (letters, digits and hyphens only) ---------- */

  const routeMemo = {};
  function nameFor(href) {
    const u = new URL(href, 'https://store.local');
    const p = u.pathname.replace(/\/$/, '') || '/';
    let m;
    let name = '';
    if (p === '/') name = '';
    else if ((m = p.match(/^\/(?:collections\/[\w-]+\/)?products\/([\w-]+)$/))) name = 'p-' + m[1] + (u.searchParams.get('variant') ? '-v' + u.searchParams.get('variant') : '');
    else if ((m = p.match(/^\/collections\/([\w-]+)$/))) name = 'c-' + m[1];
    else if (p === '/collections') name = 'collections';
    else if ((m = p.match(/^\/pages\/([\w-]+)$/))) name = 'pg-' + m[1];
    else if (p === '/cart') name = 'cart';
    else if (p === '/search') name = 'search';
    else if (p === '/checkout') name = 'checkout';
    else name = 'nf';
    routeMemo[name] = u.pathname + u.search;
    return name;
  }
  function hrefFor(name) {
    if (routeMemo[name]) return routeMemo[name];
    let m;
    if (!name) return '/';
    if ((m = name.match(/^p-(.+?)(?:-v(\d+))?$/))) return '/products/' + m[1] + (m[2] ? '?variant=' + m[2] : '');
    if ((m = name.match(/^c-(.+)$/))) return '/collections/' + m[1];
    if ((m = name.match(/^pg-(.+)$/))) return '/pages/' + m[1];
    if (['cart', 'search', 'checkout', 'collections'].includes(name)) return '/' + name;
    return '/';
  }

  /* ---------- requests to the simulated store ---------- */

  function toRequest(method, href, body) {
    const u = new URL(href, 'https://store.local');
    const query = Object.fromEntries(u.searchParams.entries());
    const req = { method, pathname: u.pathname, query, cart, mode };
    if (body instanceof FormData) req.pairs = Array.from(body.entries()).filter(([, v]) => typeof v === 'string');
    else if (typeof body === 'string' && body) {
      try { req.json = JSON.parse(body); } catch (e) { req.pairs = Array.from(new URLSearchParams(body).entries()); }
      // The theme sends location.pathname; in the preview that is the page's own URL.
      if (req.json && req.json.sections_url) req.json.sections_url = current.split('?')[0];
    } else if (Array.isArray(body)) req.pairs = body;
    return req;
  }

  async function ask(method, href, body) {
    const r = await app.handle(toRequest(method, href, body));
    save(STORE_KEY, cart);
    return r;
  }

  // Theme scripts call the Ajax Cart API with absolute paths; answer those here.
  window.fetch = async function (input, init) {
    const href = typeof input === 'string' ? input : input.url;
    if (typeof href !== 'string' || !href.startsWith('/')) return realFetch(input, init);
    const method = ((init && init.method) || 'GET').toUpperCase();
    const r = await ask(method, href, init && init.body);
    if (r.type === 'json') return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    if (r.type === 'redirect') return new Response('', { status: 200 });
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'text/html' } });
  };

  // The theme updates ?variant= in the address bar; keep the artifact URL as it is.
  history.replaceState = function () {};
  history.pushState = function () {};

  /* ---------- painting pages ---------- */

  function dispatchSections(type) {
    document.querySelectorAll('.shopify-section').forEach((el) => {
      el.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { sectionId: el.id.replace('shopify-section-', '') } }));
    });
  }

  function previewBar() {
    const bar = document.createElement('div');
    bar.setAttribute('data-preview-bar', '');
    bar.style.cssText = 'font:500 11px/1.35 system-ui,sans-serif;background:#fff3b0;color:#3a3000;padding:4px 12px;display:flex;gap:4px 14px;flex-wrap:wrap;justify-content:center;border-bottom:1px solid #d8c66a';
    const opt = (m, label) => `<button type="button" data-fc-fixture="${m}" style="all:unset;cursor:pointer;${m === mode ? 'font-weight:700;text-decoration:underline' : 'text-decoration:underline'}">${label}</button>`;
    bar.innerHTML = `<span><strong>Theme preview</strong> · real catalog · checkout is simulated · sample shows are not real events</span>`
      + `<span>Shows: ${opt('full', 'several')} · ${opt('one', 'one')} · ${opt('none', 'none')} · <button type="button" data-fc-reset style="all:unset;cursor:pointer;text-decoration:underline">empty cart</button></span>`;
    return bar;
  }

  async function runScripts(scripts) {
    for (const s of scripts) {
      await new Promise((resolve) => {
        const el = document.createElement('script');
        if (s.src) { el.src = s.src; el.onload = resolve; el.onerror = resolve; } else { el.textContent = s.text; }
        document.body.appendChild(el);
        if (!s.src) resolve();
      });
    }
  }

  function paint(html, href, standalone) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (scriptsBooted) dispatchSections('shopify:section:unload');

    if (!scriptsBooted && !standalone) {
      // First paint: take the layout's <head> (styles, fonts, metadata), minus scripts.
      document.documentElement.lang = doc.documentElement.lang || 'en';
      doc.head.querySelectorAll('link[rel="stylesheet"], link[rel="preload"], link[rel="icon"], style, meta[name="theme-color"]').forEach((n) => document.head.appendChild(document.importNode(n, true)));
    }
    document.title = doc.title || 'Full Circle Collaborations';

    const scripts = [];
    if (!scriptsBooted && !standalone) {
      doc.querySelectorAll('script').forEach((s) => {
        const type = s.getAttribute('type');
        if (type && type !== 'text/javascript') return;
        scripts.push(s.getAttribute('src') ? { src: s.getAttribute('src'), defer: s.hasAttribute('defer') } : { text: s.textContent });
      });
      // Browser order: classic scripts as parsed, then deferred scripts in document order.
      scripts.sort((a, b) => (a.defer ? 1 : 0) - (b.defer ? 1 : 0));
      document.documentElement.className = doc.documentElement.className;
    }
    // Scripts inserted through innerHTML never run, so the body can be swapped freely.
    document.body.className = doc.body.className;
    document.body.setAttribute('style', doc.body.getAttribute('style') || '');
    document.body.innerHTML = doc.body.innerHTML;
    if (!standalone) document.body.insertBefore(previewBar(), document.body.firstChild);
    current = href;

    const u = new URL(href, 'https://store.local');
    if (u.hash && document.getElementById(u.hash.slice(1))) document.getElementById(u.hash.slice(1)).scrollIntoView();
    else window.scrollTo(0, 0);

    if (standalone) return Promise.resolve();
    if (!scriptsBooted) {
      scriptsBooted = true;
      return runScripts(scripts);
    }
    dispatchSections('shopify:section:load');
    return Promise.resolve();
  }

  async function render(href) {
    const r = await ask('GET', href);
    if (r.type === 'redirect') return go(r.location);
    await paint(r.body, href, r.standalone);
  }

  function go(href) {
    const name = nameFor(href);
    if (location.hash.slice(1) === name) return render(hrefFor(name));
    location.hash = name; // hashchange renders
    return Promise.resolve();
  }

  window.addEventListener('hashchange', () => render(hrefFor(location.hash.slice(1))));

  /* ---------- links and forms ---------- */

  // Bubble phase on window: the theme's own handlers (document level) run first and may
  // preventDefault, e.g. AJAX add to cart or removing a cart line.
  window.addEventListener('click', (e) => {
    const fixture = e.target.closest('[data-fc-fixture]');
    if (fixture) { mode = fixture.getAttribute('data-fc-fixture'); save(MODE_KEY, mode); render(current); return; }
    if (e.target.closest('[data-fc-reset]')) { cart.lines = []; cart.note = ''; save(STORE_KEY, cart); render(current); return; }
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank') return;
    const href = a.getAttribute('href');
    if (href.startsWith('#')) {
      e.preventDefault();
      const el = document.getElementById(href.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (href.startsWith('/') && !href.startsWith('//')) { e.preventDefault(); go(href); }
    else if (href.startsWith('?')) { e.preventDefault(); go(current.split('?')[0] + href); }
  });

  window.addEventListener('submit', async (e) => {
    if (e.defaultPrevented) return;
    const form = e.target;
    const action = form.getAttribute('action') || current;
    if (!action.startsWith('/')) return;
    e.preventDefault();
    const fd = new FormData(form);
    if (e.submitter && e.submitter.name) fd.append(e.submitter.name, e.submitter.value || '');
    if ((form.getAttribute('method') || 'get').toLowerCase() === 'get') {
      const qs = new URLSearchParams(Array.from(fd.entries()).filter(([, v]) => typeof v === 'string' && v !== '')).toString();
      go(action.split('#')[0] + (qs ? '?' + qs : ''));
      return;
    }
    if (action === '/localization') { render(current); return; }
    if (action.startsWith('/contact')) { render(current); return; }
    const r = await ask('POST', action, fd);
    if (r.type === 'redirect') go(r.location);
    else await paint(r.body, action, r.standalone);
  });

  // The theme auto-submits sort, filter and country selects with form.submit(), which skips
  // submit events. Route it through requestSubmit so the handler above sees it.
  HTMLFormElement.prototype.submit = function () {
    if (this.requestSubmit) this.requestSubmit();
    else this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };

  /* ---------- boot ---------- */

  async function boot() {
    const [theme, live, images] = await Promise.all([
      realFetch('theme.json').then((r) => r.json()),
      realFetch('live-products.json').then((r) => r.json()),
      realFetch('images.json').then((r) => r.json()),
    ]);
    imageIndex = images;
    cart = load(STORE_KEY, cart);
    mode = load(MODE_KEY, 'full');

    app = window.FCCore({
      liquidjs: window.liquidjs,
      fixtures: window.FCFixtures(live.products),
      readText: (p) => (Object.prototype.hasOwnProperty.call(theme, p) ? theme[p] : null),
      listSnippets: () => Object.keys(theme).filter((k) => k.startsWith('snippets/')).map((k) => k.slice(9)),
      origin: 'https://fullcirclecollabs.com',
      urls: {
        // Absolute, like Shopify's CDN URLs, so url() values set in CSS variables resolve correctly.
        asset: (name) => new URL('assets/' + name, document.baseURI).href,
        image(src, w) {
          if (!src) return '';
          const key = String(src).split('?')[0].split('/').pop();
          const stem = imageIndex[key];
          if (!stem) return src;
          const width = IMG_WIDTHS.find((x) => x >= w) || IMG_WIDTHS[IMG_WIDTHS.length - 1];
          return `img/${stem}-${width}.jpg`;
        },
        font: (w) => `fonts/inter-latin-${w}-normal.woff2`,
      },
    });

    await render(hrefFor(location.hash.slice(1)));
  }

  boot().catch((err) => {
    document.body.innerHTML = `<pre style="white-space:pre-wrap;padding:16px;font:13px/1.4 ui-monospace,monospace">The preview could not start.\n\n${String(err && err.stack || err).replace(/</g, '&lt;')}</pre>`;
  });
})();
