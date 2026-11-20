/* Event kiosk (sections/ac-courtside.liquid).
   ES2017 syntax only (no optional chaining, no ??) so it runs on the first-generation iPad Air's Safari.
   1. Table scene: tap-to-play Lucky pull, pause, off-screen pause, stepping aside while people search or read a card.
   2. Inventory: one search over every page of the kiosk, two tabs, and a quiet refresh so changes saved in the
      Import Cards admin app appear without a reload.
   3. Card detail view: large photo, reference ID, "Check recent sales" links.
   Nothing here writes anywhere: no cart calls, no reservations, no orders. */
(function () {
  'use strict';
  var root = document.querySelector('[data-ac-kiosk]');
  if (!root || root.__acKiosk) return;
  root.__acKiosk = true;
  var html = document.documentElement;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var closest = function (el, sel) { while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentNode; } return null; };
  var motionOk = function () { return html.classList.contains('ac-motion-ok'); };

  /* ---------- 1. Courtside scene ---------- */
  var scene = root.querySelector('[data-ac-court-scene]');
  var playButton = root.querySelector('[data-ac-court-play]');
  var pauseButton = root.querySelector('[data-ac-court-pause]');
  var pauseText = root.querySelector('[data-ac-court-pause-text]');
  var rallyTimer = 0, paused = false;
  function setPaused(next) {
    paused = next;
    if (scene) scene.classList.toggle('is-paused', paused);
    if (pauseButton) {
      pauseButton.setAttribute('aria-pressed', String(paused));
      pauseButton.setAttribute('aria-label', paused ? 'Resume the game' : 'Pause the game');
    }
    if (pauseText) pauseText.textContent = paused ? 'Resume' : 'Pause';
  }
  function endRally() { clearTimeout(rallyTimer); if (scene) scene.classList.remove('is-rallying'); }
  function playRally() {
    if (!scene) return;
    if (paused) setPaused(false);
    scene.classList.remove('is-rallying');
    scene.setAttribute('data-pick', String(1 + Math.floor(Math.random() * 5))); // Lucky pull: which of the five cards is the gold one this round
    void scene.offsetWidth; // restart from the first frame when replayed mid-rally
    scene.classList.add('is-rallying');
    clearTimeout(rallyTimer);
    rallyTimer = setTimeout(endRally, motionOk() ? 3300 : 1250);
  }
  function setQuiet(quiet) { if (scene) scene.classList.toggle('is-quiet', quiet); }
  // Tap to play, the same as the homepage spotlight: a tap or click anywhere in the game area starts a rally. The
  // "Tap to play" hint is a real button inside that area, so Enter or Space on it does the same. Pause is its own
  // control and never starts a rally; Aster's own button makes him talk instead.
  var courtArea = root.querySelector('[data-ac-court-area]') || (scene ? scene.parentNode : null);
  if (courtArea) courtArea.addEventListener('click', function (event) {
    var control = closest(event.target, 'button, a');
    if (control && control.hasAttribute('data-ac-court-pause')) { setPaused(!paused); return; }
    if (control && !control.hasAttribute('data-ac-court-play')) return;
    playRally();
  });
  if (scene && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { scene.classList.toggle('is-offscreen', !entry.isIntersecting); });
    }, { threshold: 0.05 }).observe(scene);
  }
  var asterPos = root.querySelector('.ac-court-aster-pos');
  if (asterPos) asterPos.addEventListener('click', function () { asterPos.classList.add('is-chatting'); });

  /* ---------- 2. Inventory ---------- */
  var grid = root.querySelector('[data-ac-kiosk-grid]');
  var panel = root.querySelector('[data-ac-kiosk-panel]');
  var input = root.querySelector('[data-ac-kiosk-input]');
  var form = root.querySelector('[data-ac-kiosk-form]');
  var clearButton = root.querySelector('[data-ac-kiosk-clear]');
  var statusEl = root.querySelector('[data-ac-kiosk-status]');
  var countWrap = root.querySelector('[data-ac-kiosk-count]');
  var countText = root.querySelector('[data-ac-kiosk-count-text]');
  var emptyEl = root.querySelector('[data-ac-kiosk-empty]');
  var emptyTitle = root.querySelector('[data-ac-kiosk-empty-title]');
  var emptyText = root.querySelector('[data-ac-kiosk-empty-text]');
  var emptyAction = root.querySelector('[data-ac-kiosk-empty-action]');
  var emptyLink = root.querySelector('[data-ac-kiosk-empty-link]');
  var pagesNav = root.querySelector('[data-ac-kiosk-pages]');
  var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-ac-kiosk-tab]'));
  var LABEL = { display: 'On Display', behind: 'Behind the Table' };
  var items = [], activeTab = 'display', query = '', loading = false, loadedAll = false;

  function norm(text) {
    var s = String(text || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }
  function squash(text) { return text.replace(/[^a-z0-9]+/g, ''); }
  function read(el) {
    var hay = norm(el.getAttribute('data-search'));
    return {
      el: el,
      kind: el.getAttribute('data-kind'),
      ref: el.getAttribute('data-ref') || '',
      productId: el.getAttribute('data-product-id') || '',
      variantId: el.getAttribute('data-variant-id') || '',
      variantIds: (el.getAttribute('data-variant-ids') || '').split(',').filter(Boolean),
      placement: el.getAttribute('data-placement') === 'behind' ? 'behind' : 'display',
      state: el.getAttribute('data-state') || 'available',
      hay: hay,
      flat: squash(hay)
    };
  }
  function collect() {
    var linked = {};
    var found = [];
    each(grid.querySelectorAll('[data-ac-kiosk-item]'), function (el) {
      var item = read(el);
      if (item.kind === 'scan' && item.variantId) linked[item.variantId] = true;
      found.push(item);
    });
    // One physical copy, one tile: a listing steps aside once linked scans show every one of its variants.
    items = found.filter(function (item) {
      if (item.kind === 'product' && covered(item.variantIds, linked)) { item.el.parentNode.removeChild(item.el); return false; }
      return true;
    });
  }
  function covered(variantIds, linked) {
    if (!variantIds.length) return false;
    for (var i = 0; i < variantIds.length; i++) if (!linked[variantIds[i]]) return false;
    return true;
  }
  function matches(item, tokens) {
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (item.hay.indexOf(token) !== -1) continue;
      // Card numbers: "103/PCG-P", "103 pcg-p" and "103pcgp" should all find the same card.
      if (/[0-9\/#.\-]/.test(token)) { var flat = squash(token); if (flat.length >= 2 && item.flat.indexOf(flat) !== -1) continue; }
      return false;
    }
    return true;
  }
  function setTab(name, focus) {
    activeTab = name === 'behind' ? 'behind' : 'display';
    tabs.forEach(function (tab) {
      var on = tab.getAttribute('data-ac-kiosk-tab') === activeTab;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) { if (panel) panel.setAttribute('aria-labelledby', tab.id); if (focus) tab.focus(); }
    });
  }
  function apply(fromTyping) {
    var tokens = query ? norm(query).split(' ').filter(Boolean) : [];
    var searching = tokens.length > 0;
    var counts = { display: 0, behind: 0 }, totals = { display: 0, behind: 0 };
    items.forEach(function (item) {
      totals[item.placement]++;
      item.match = !searching || matches(item, tokens);
      if (item.match) counts[item.placement]++;
    });
    var other = activeTab === 'display' ? 'behind' : 'display';
    // While typing, follow the matches: if this tab has none and the other does, show the other.
    if (searching && fromTyping && counts[activeTab] === 0 && counts[other] > 0) setTab(other, false);
    other = activeTab === 'display' ? 'behind' : 'display';
    items.forEach(function (item) { item.el.classList.toggle('is-out', !(item.match && item.placement === activeTab)); });
    tabs.forEach(function (tab) {
      var name = tab.getAttribute('data-ac-kiosk-tab');
      var badge = tab.querySelector('[data-ac-kiosk-tab-count]');
      if (badge) badge.textContent = String(counts[name]);
      tab.classList.toggle('has-matches', searching && counts[name] > 0);
      tab.classList.toggle('no-matches', searching && counts[name] === 0);
      tab.setAttribute('aria-label', LABEL[name] + ', ' + counts[name] + (searching ? (counts[name] === 1 ? ' match' : ' matches') : (counts[name] === 1 ? ' card' : ' cards')));
    });
    if (countText) countText.textContent = totals.display + ' on display · ' + totals.behind + ' behind the table';
    if (countWrap) countWrap.hidden = totals.display + totals.behind === 0;
    if (clearButton) clearButton.hidden = !query;
    if (form) form.classList.toggle('has-query', !!query);

    var total = counts.display + counts.behind;
    var note = '';
    if (searching) {
      var shown = query.trim();
      if (total === 0) note = 'No cards match “' + shown + '”' + (loadedAll ? '.' : ' yet. Still loading the rest of the table.');
      else {
        note = total + (total === 1 ? ' match' : ' matches') + ' for “' + shown + '”: ' + counts.display + ' On Display, ' + counts.behind + ' Behind the Table.';
        if (!loadedAll) note += ' Still loading the rest of the table.';
      }
    }
    if (statusEl) statusEl.textContent = note;

    var visible = counts[activeTab];
    if (emptyEl) {
      emptyEl.hidden = visible > 0;
      if (visible === 0) {
        var nothingAtAll = totals.display + totals.behind === 0;
        emptyAction.hidden = !searching;
        emptyLink.hidden = !nothingAtAll || searching;
        if (nothingAtAll && !searching) { emptyTitle.textContent = 'The table is being set.'; emptyText.textContent = 'Nothing is listed here right now. Check back before the next event, or browse the rest of the shop.'; }
        else if (searching && total === 0) { emptyTitle.textContent = 'No match on the table.'; emptyText.textContent = 'Try fewer letters, a card number like 103/PCG-P, or ask Albert. Not everything is listed here.'; }
        else if (searching) { emptyTitle.textContent = 'Nothing ' + LABEL[activeTab] + ' matches.'; emptyText.textContent = counts[other] + (counts[other] === 1 ? ' match is ' : ' matches are ') + LABEL[other] + '. Tap that tab to see ' + (counts[other] === 1 ? 'it.' : 'them.'); }
        else { emptyTitle.textContent = 'Nothing ' + LABEL[activeTab] + ' right now.'; emptyText.textContent = 'Check ' + LABEL[other] + ', or just ask Albert.'; }
      }
    }
  }
  function setQuery(value, fromTyping) {
    query = value;
    if (input && input.value !== value) input.value = value;
    setQuiet(!!query || (detail && detail.classList.contains('is-open')));
    apply(fromTyping);
  }
  function reset() { setQuery('', false); setTab('display', false); apply(false); if (input) input.focus(); }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { setTab(tab.getAttribute('data-ac-kiosk-tab'), false); apply(false); });
    tab.addEventListener('keydown', function (event) {
      var key = event.key, next = -1;
      if (key === 'ArrowRight' || key === 'Right') next = (index + 1) % tabs.length;
      else if (key === 'ArrowLeft' || key === 'Left') next = (index + tabs.length - 1) % tabs.length;
      else if (key === 'Home') next = 0;
      else if (key === 'End') next = tabs.length - 1;
      if (next === -1) return;
      event.preventDefault();
      setTab(tabs[next].getAttribute('data-ac-kiosk-tab'), true);
      apply(false);
    });
  });
  if (input) {
    input.addEventListener('input', function () { setQuery(input.value, true); });
    input.addEventListener('focus', function () { setQuiet(true); });
    input.addEventListener('blur', function () { setQuiet(!!query); });
    input.addEventListener('keydown', function (event) { if ((event.key === 'Escape' || event.key === 'Esc') && query) { event.preventDefault(); reset(); } });
  }
  if (form) form.addEventListener('submit', function (event) { event.preventDefault(); if (input) input.blur(); });
  if (clearButton) clearButton.addEventListener('click', reset);
  if (emptyAction) emptyAction.addEventListener('click', reset);

  /* Every page of the kiosk, fetched as this same section (Shopify's Section Rendering API). */
  var sectionId = root.getAttribute('data-section-id');
  var baseUrl = root.getAttribute('data-url') || window.location.pathname;
  var firstPage = Number(root.getAttribute('data-page')) || 1;
  var canFetch = !!(window.fetch && window.DOMParser) && !!sectionId && firstPage === 1 && !root.hasAttribute('data-design-mode') && /^https?:$/.test(window.location.protocol);
  function fetchPage(page) {
    var url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'section_id=' + encodeURIComponent(sectionId) + '&page=' + page;
    return window.fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' } }).then(function (response) {
      if (!response.ok) throw new Error('kiosk page ' + page + ': ' + response.status);
      return response.text();
    }).then(function (text) {
      var doc = new DOMParser().parseFromString(text, 'text/html');
      var section = doc.querySelector('[data-ac-kiosk]');
      if (!section) throw new Error('kiosk page ' + page + ': section missing');
      return { pages: Number(section.getAttribute('data-pages')) || 1, nodes: Array.prototype.slice.call(section.querySelectorAll('[data-ac-kiosk-item]')) };
    });
  }
  // One record, one tile. A scanned card is identified by its entry handle (data-ref) and a listing by its product ID,
  // never by name. The kiosk's pages can repeat the scanned-card entries (they are paged separately from the listings),
  // so a record that is already on screen or already fetched is not added again.
  function recordKey(el) {
    var kind = el.getAttribute('data-kind');
    var id = kind === 'scan' ? el.getAttribute('data-ref') : el.getAttribute('data-product-id');
    return id ? kind + ':' + id : '';
  }
  function fetchAll(fromPage) {
    var nodes = [], seen = {};
    if (fromPage > 1) each(grid.querySelectorAll('[data-ac-kiosk-item]'), function (el) { var key = recordKey(el); if (key) seen[key] = true; });
    function step(page) {
      return fetchPage(page).then(function (result) {
        result.nodes = result.nodes.filter(function (el) { var key = recordKey(el); if (!key) return true; if (seen[key]) return false; seen[key] = true; return true; });
        nodes = nodes.concat(result.nodes);
        return page < result.pages ? step(page + 1) : nodes;
      });
    }
    return step(fromPage);
  }
  function signature(nodes) {
    return nodes.map(function (el) {
      return [el.getAttribute('data-kind'), el.getAttribute('data-ref'), el.getAttribute('data-placement'), el.getAttribute('data-state'), el.getAttribute('data-price'), el.getAttribute('data-name'), el.getAttribute('data-front'), el.getAttribute('data-product-id'), el.getAttribute('data-variant-id'), el.getAttribute('data-url')].join('|');
    }).join('\n');
  }
  function loadRest() {
    var pages = Number(root.getAttribute('data-pages')) || 1;
    if (!canFetch || pages < 2) { loadedAll = true; return; }
    loading = true;
    fetchAll(2).then(function (nodes) {
      var fragment = document.createDocumentFragment();
      nodes.forEach(function (node) { fragment.appendChild(document.importNode(node, true)); });
      grid.appendChild(fragment);
      loadedAll = true; loading = false;
      if (pagesNav) pagesNav.classList.add('is-merged');
      collect(); apply(false);
    }).catch(function () { loading = false; loadedAll = true; apply(false); }); // page links stay as the fallback
  }
  /* Quiet refresh: pick up placements, prices and sold marks saved in the admin app. Skipped while a card is open. */
  function refresh() {
    if (!canFetch || loading || document.hidden || (detail && detail.classList.contains('is-open'))) return;
    loading = true;
    fetchAll(1).then(function (nodes) {
      loading = false;
      if (detail && detail.classList.contains('is-open')) return;
      var current = Array.prototype.slice.call(grid.querySelectorAll('[data-ac-kiosk-item]'));
      // Compare like with like: drop product tiles a linked scan stands in for, exactly as collect() does.
      var linked = {};
      nodes.forEach(function (el) { if (el.getAttribute('data-kind') === 'scan' && el.getAttribute('data-variant-id')) linked[el.getAttribute('data-variant-id')] = true; });
      nodes = nodes.filter(function (el) { return !(el.getAttribute('data-kind') === 'product' && covered((el.getAttribute('data-variant-ids') || '').split(',').filter(Boolean), linked)); });
      if (signature(nodes) === signature(current)) return;
      var fragment = document.createDocumentFragment();
      nodes.forEach(function (node) { fragment.appendChild(document.importNode(node, true)); });
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      grid.appendChild(fragment);
      collect(); apply(false);
    }).catch(function () { loading = false; });
  }

  /* ---------- 3. Card detail view ---------- */
  var detail = root.querySelector('[data-ac-kiosk-detail]');
  var sheet = root.querySelector('[data-ac-kiosk-sheet]');
  var photo = root.querySelector('[data-ac-kiosk-photo]');
  var flipButton = root.querySelector('[data-ac-kiosk-detail-flip]');
  var flipText = root.querySelector('[data-ac-kiosk-detail-flip-text]');
  var opener = null, sides = null, showingBack = false;
  function part(name) { return root.querySelector('[data-ac-kiosk-' + name + ']'); }
  function bigger(url) { return url ? url.replace(/([?&]width=)\d+/, '$11100') : ''; }
  function showSide(back) {
    showingBack = back;
    photo.src = back ? sides.back : sides.front;
    photo.alt = (back ? 'Back of ' : '') + sides.name;
    if (flipButton) flipButton.setAttribute('aria-pressed', String(back));
    if (flipText) flipText.textContent = back ? 'Flip back' : sides.backLabel;
  }
  /* ---------- Price comparison in the card view ----------
     Kiosk mode keeps shoppers on this page: the outbound eBay links are hidden. A device is in kiosk mode after it opens
     this page once with ?kiosk=1 (remembered on that device; ?kiosk=0 turns it off), or always when the section's
     "Keep shoppers on this page" setting is on. Everyone else keeps the links.
     "Active listings · Asking prices" is filled from the section's endpoint setting, a server that holds the eBay
     credentials. Nothing secret is in the theme. The theme sends only the card's search terms, keeps at most five
     listings that clearly match the card number, name and language, and shows them as plain text and a thumbnail:
     never as links. With no endpoint, or nothing reliable, the card view simply has no inline listings. */
  var sales = root.querySelector('[data-ac-kiosk-sales]');
  var asking = root.querySelector('[data-ac-kiosk-asking]');
  var askingList = root.querySelector('[data-ac-kiosk-asking-list]');
  var askingNote = root.querySelector('[data-ac-kiosk-asking-note]');
  var kioskMode = !!(sales && sales.hasAttribute('data-kiosk-lock'));
  try {
    var flag = /[?&]kiosk=([01])\b/.exec(window.location.search);
    if (flag) window.localStorage.setItem('ac-kiosk-mode', flag[1]);
    if (window.localStorage.getItem('ac-kiosk-mode') === '1') kioskMode = true;
  } catch (e) { /* private browsing: the setting alone decides */ }
  html.classList.toggle('ac-kiosk-mode', kioskMode);
  var endpoint = sales ? (sales.getAttribute('data-endpoint') || '').trim() : '';
  if (!/^(https:\/\/[^\s]+|\/[^\/\s][^\s]*)$/.test(endpoint)) endpoint = ''; // https, or a path on this store (an app proxy)
  if (sales) sales.hidden = kioskMode && !endpoint;
  var askingCache = {}, askingTurn = 0;
  function reliableMatch(item, card) {
    var title = ' ' + norm(String(item.title || '')).replace(/[^a-z0-9]+/g, ' ') + ' '; // words only, so "028/040" reads as "028 040"
    if (title.length < 6) return false;
    var nameWords = norm(card.name).split(' ').filter(function (w) { return w.length >= 3; });
    if (nameWords.length && !nameWords.some(function (w) { return title.indexOf(w) !== -1; })) return false;
    var number = norm(card.number);
    if (number) {
      var whole = squash(number), first = number.split(/[^a-z0-9]+/)[0] || '';
      var bare = first.replace(/^0+(?=\d)/, '');
      var hasWhole = whole.length >= 3 && squash(title).indexOf(whole) !== -1;
      var hasFirst = !!first && (title.indexOf(' ' + first + ' ') !== -1 || title.indexOf(' ' + bare + ' ') !== -1);
      if (!hasWhole && !hasFirst) return false;
    } else if (nameWords.length && !nameWords.every(function (w) { return title.indexOf(w) !== -1; })) return false;
    var language = norm(card.language);
    var japanese = /japanese|japan| jpn | jp /.test(title);
    if (/japan/.test(language) && !japanese) return false;
    if (/english/.test(language) && (japanese || /korean|chinese|german|french|italian|spanish/.test(title))) return false;
    return true;
  }
  function money(value, currency) {
    var n = Number(value);
    if (!isFinite(n)) return '';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(n); } catch (e) { return '$' + n.toFixed(2); }
  }
  function renderAsking(items) {
    askingList.textContent = '';
    items.forEach(function (item) {
      var li = document.createElement('li'); li.className = 'ac-kiosk-asking-item';
      var thumb = document.createElement('span'); thumb.className = 'ac-kiosk-asking-thumb';
      if (/^https:\/\//.test(String(item.image || ''))) {
        var img = document.createElement('img');
        img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.width = 56; img.height = 56; img.src = item.image;
        img.addEventListener('error', function () { img.style.display = 'none'; });
        thumb.appendChild(img);
      }
      var text = document.createElement('span'); text.className = 'ac-kiosk-asking-text';
      var price = document.createElement('strong'); price.textContent = money(item.price, item.currency) || 'Price not shown';
      var title = document.createElement('span'); title.className = 'ac-kiosk-asking-title'; title.textContent = String(item.title || '');
      var facts = [];
      if (item.condition) facts.push(String(item.condition));
      if (item.shipping === 'free' || Number(item.shipping) === 0 && item.shipping !== null && item.shipping !== undefined && item.shipping !== '') facts.push('Free shipping');
      else if (item.shipping !== null && item.shipping !== undefined && item.shipping !== '' && isFinite(Number(item.shipping))) facts.push('+ ' + money(item.shipping, item.currency) + ' shipping');
      var meta = document.createElement('span'); meta.className = 'ac-kiosk-asking-meta'; meta.textContent = facts.join(' · ');
      text.appendChild(price); text.appendChild(title); if (facts.length) text.appendChild(meta);
      li.appendChild(thumb); li.appendChild(text);
      askingList.appendChild(li);
    });
  }
  function showAsking(card) {
    if (!asking || !askingList || !askingNote) return;
    var turn = ++askingTurn;
    askingList.textContent = '';
    if (!endpoint || !window.fetch) { asking.hidden = true; return; }
    asking.hidden = false;
    var done = function (items) {
      if (turn !== askingTurn) return; // another card was opened meanwhile
      if (items && items.length) { renderAsking(items); askingNote.textContent = 'Asking prices from active eBay listings. These are not sales.'; return; }
      askingList.textContent = '';
      if (items) askingNote.textContent = 'No reliable matches for this card on eBay right now.';
      else if (kioskMode) askingNote.textContent = 'Asking prices are not available right now. Just ask Albert.';
      else asking.hidden = true; // the eBay links below still work
    };
    if (askingCache[card.ref]) { done(askingCache[card.ref]); return; }
    askingNote.textContent = 'Looking up asking prices…';
    var url = endpoint + (endpoint.indexOf('?') === -1 ? '?' : '&') + ['q', 'name', 'set', 'number', 'language'].map(function (key) { return key + '=' + encodeURIComponent(card[key] || ''); }).join('&') + '&limit=20';
    var options = { credentials: 'omit', headers: { Accept: 'application/json' } };
    var abort = window.AbortController ? new AbortController() : null;
    if (abort) { options.signal = abort.signal; setTimeout(function () { abort.abort(); }, 8000); }
    window.fetch(url, options).then(function (response) {
      if (!response.ok) throw new Error('asking prices: ' + response.status);
      return response.json();
    }).then(function (data) {
      var list = data && Array.isArray(data.items) ? data.items : [];
      var kept = list.filter(function (item) { return item && reliableMatch(item, card); }).slice(0, 5);
      if (card.ref) askingCache[card.ref] = kept;
      done(kept);
    }).catch(function () { done(null); });
  }

  function openDetail(el, from) {
    if (!detail) return;
    var get = function (name) { return el.getAttribute('data-' + name) || ''; };
    var name = get('name'), sold = get('state') === 'sold';
    var back = get('back'), backLabel = 'Flip card';
    if (!back) {
      var backImg = el.querySelector('.ac-back-photo');
      if (backImg) back = bigger(backImg.getAttribute('data-src') || backImg.getAttribute('src') || '');
    }
    sides = { front: get('front'), back: back, name: name, backLabel: backLabel };
    if (sides.front) { photo.style.display = ''; showSide(false); } else { photo.removeAttribute('src'); photo.style.display = 'none'; }
    if (flipButton) flipButton.hidden = !(sides.front && back);
    part('name').textContent = name;
    part('meta').textContent = [get('set'), get('number'), get('language'), get('condition')].filter(Boolean).join(' · ');
    var price = part('price');
    if (sold) { price.textContent = 'Sold'; price.classList.remove('is-ask'); }
    else if (get('price')) { price.textContent = get('price'); price.classList.remove('is-ask'); }
    else { price.textContent = 'Ask for price'; price.classList.add('is-ask'); }
    part('ref').textContent = get('ref');
    part('where').textContent = LABEL[get('placement') === 'behind' ? 'behind' : 'display'];
    part('refhelp').textContent = sold
      ? 'This copy has found a new home. Ask Albert if another one is around.'
      : 'Show this screen to Albert and he will pull the card for you. Asking does not reserve the card or start an order.';
    var buy = part('buy');
    if (get('url') && !sold) { buy.href = get('url'); buy.hidden = false; } else { buy.removeAttribute('href'); buy.hidden = true; }
    // "Check recent sales": built here, on demand, and nowhere else in the storefront.
    var terms = encodeURIComponent(get('sales') || name).replace(/%20/g, '+');
    part('sold').href = 'https://www.ebay.com/sch/i.html?_nkw=' + terms + '&LH_Sold=1&LH_Complete=1';
    part('active').href = 'https://www.ebay.com/sch/i.html?_nkw=' + terms;
    showAsking({ ref: get('ref'), q: get('sales') || name, name: name, set: get('set'), number: get('number'), language: get('language') });
    opener = from || null;
    detail.classList.add('is-open');
    html.classList.add('ac-kiosk-lock');
    setQuiet(true); endRally();
    sheet.scrollTop = 0;
    sheet.focus();
  }
  function closeDetail() {
    if (!detail || !detail.classList.contains('is-open')) return;
    detail.classList.remove('is-open');
    html.classList.remove('ac-kiosk-lock');
    setQuiet(!!query);
    if (opener && document.contains(opener)) opener.focus();
    opener = null;
  }
  if (flipButton) flipButton.addEventListener('click', function () { if (sides && sides.back) showSide(!showingBack); });
  root.addEventListener('click', function (event) {
    if (closest(event.target, '[data-ac-kiosk-close]')) { closeDetail(); return; }
    var trigger = closest(event.target, '[data-ac-kiosk-open]');
    if (!trigger || event.defaultPrevented) return;
    var el = closest(trigger, '[data-ac-kiosk-item]');
    if (el) openDetail(el, trigger);
  });
  document.addEventListener('keydown', function (event) {
    if (!detail || !detail.classList.contains('is-open')) return;
    if (event.key === 'Escape' || event.key === 'Esc') { event.preventDefault(); closeDetail(); return; }
    if (event.key !== 'Tab') return;
    var focusable = Array.prototype.filter.call(sheet.querySelectorAll('a[href], button:not([disabled])'), function (node) { return node.getClientRects().length > 0; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  /* ---------- Start ---------- */
  collect();
  apply(false);
  loadRest();
  if (canFetch) setInterval(refresh, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  // For the standalone preview's simulated admin panel: re-read the tiles after they were changed in place.
  window.AlbertKiosk = { resync: function () { collect(); apply(false); }, refresh: refresh, search: function (value) { setQuery(String(value || ''), true); }, tab: function (name) { setTab(name, false); apply(false); } };
})();
