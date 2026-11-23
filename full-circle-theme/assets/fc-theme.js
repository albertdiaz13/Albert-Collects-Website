/* Full Circle — storefront behaviour.
 * Native Shopify forms work without this file. With it: AJAX add to cart, variant
 * pricing and availability, cart edits without reloads, and the booking bar.
 * Everything uses event delegation so theme-editor section reloads need no rebinding. */
(function () {
  'use strict';

  var FC = window.FC || {};
  var S = FC.strings || {};
  var routes = FC.routes || { root: '/', cart: '/cart', cartAdd: '/cart/add', cartChange: '/cart/change', cartUpdate: '/cart/update' };

  /* ---------- helpers ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function formatMoney(cents, format) {
    if (typeof cents === 'string') cents = cents.replace('.', '');
    format = format || FC.moneyFormat || '${{amount}}';
    function fmt(number, precision, thousands, decimal) {
      precision = precision == null ? 2 : precision;
      thousands = thousands || ',';
      decimal = decimal || '.';
      if (isNaN(number) || number == null) return '0';
      number = (number / 100.0).toFixed(precision);
      var parts = number.split('.');
      var dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousands);
      return dollars + (parts[1] ? decimal + parts[1] : '');
    }
    var match = format.match(/\{\{\s*(\w+)\s*\}\}/);
    var value = '';
    switch (match ? match[1] : 'amount') {
      case 'amount_no_decimals': value = fmt(cents, 0); break;
      case 'amount_with_comma_separator': value = fmt(cents, 2, '.', ','); break;
      case 'amount_no_decimals_with_comma_separator': value = fmt(cents, 0, '.', ','); break;
      case 'amount_with_apostrophe_separator': value = fmt(cents, 2, "'", '.'); break;
      default: value = fmt(cents, 2);
    }
    return format.replace(/\{\{\s*\w+\s*\}\}/, value);
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(handleResponse);
  }

  function handleResponse(res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok || data.status) {
        var err = new Error(data.description || data.message || S.error || 'Error');
        err.data = data;
        throw err;
      }
      return data;
    });
  }

  function setCount(count) {
    $$('[data-fc-cart-count]').forEach(function (el) {
      el.hidden = !count;
      var vis = el.querySelector('[aria-hidden]');
      if (vis) vis.textContent = count;
      var sr = el.querySelector('.fc-visually-hidden');
      if (sr) sr.textContent = count + (count === 1 ? ' item' : ' items');
    });
  }

  function refreshCount() {
    return fetch(routes.cart + '.js', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (cart) { setCount(cart.item_count); return cart; })
      .catch(function () {});
  }

  /* ---------- toast ---------- */

  var toastTimer;
  var lastFocus;
  function showToast(title, note) {
    var toast = $('[data-fc-toast]');
    if (!toast) return;
    $('[data-fc-toast-title]', toast).textContent = title;
    var noteEl = $('[data-fc-toast-note]', toast);
    noteEl.hidden = !note;
    noteEl.textContent = note || '';
    lastFocus = document.activeElement;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (!toast.contains(document.activeElement) && !toast.matches(':hover')) hideToast();
    }, 9000);
  }
  function hideToast() {
    var toast = $('[data-fc-toast]');
    if (toast) toast.hidden = true;
  }

  /* ---------- quantity steppers ---------- */

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-fc-qty-step]');
    if (!btn) return;
    var wrap = btn.closest('[data-fc-qty]');
    var input = wrap && wrap.querySelector('input');
    if (!input) return;
    var step = parseInt(btn.getAttribute('data-fc-qty-step'), 10);
    var min = input.min === '' ? 1 : parseInt(input.min, 10);
    var max = input.max === '' ? Infinity : parseInt(input.max, 10);
    var next = Math.min(max, Math.max(min, (parseInt(input.value, 10) || 0) + step));
    if (next === parseInt(input.value, 10)) return;
    input.value = next;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* ---------- variant picker ---------- */

  function readVariants(scope) {
    if (scope._fcVariants) return scope._fcVariants;
    var json = scope.querySelector('[data-fc-variants]');
    try { scope._fcVariants = json ? JSON.parse(json.textContent) : []; } catch (err) { scope._fcVariants = []; }
    return scope._fcVariants;
  }

  function pickerScope(el) {
    return el.closest('[data-fc-product]') || el.closest('[data-fc-event-page]') || el.closest('form');
  }

  function currentOptions(picker) {
    return $$('fieldset', picker).map(function (fs) {
      var checked = fs.querySelector('input:checked');
      return checked ? checked.value : null;
    });
  }

  function updateFlags(picker, variants, selected) {
    $$('fieldset', picker).forEach(function (fs, index) {
      $$('input', fs).forEach(function (input) {
        var trial = selected.slice();
        trial[index] = input.value;
        var match = variants.filter(function (v) {
          return v.options.every(function (o, i) { return o === trial[i]; });
        })[0];
        var pill = input.nextElementSibling;
        var flag = pill && pill.querySelector('[data-fc-flag]');
        var unavailable = !match || !match.available;
        if (pill) pill.classList.toggle('is-unavailable', unavailable);
        if (flag) flag.textContent = unavailable ? (match ? S.soldOut : S.unavailable) : '';
      });
      var label = fs.querySelector('[data-fc-selected-value]');
      if (label) label.textContent = selected[index] || '';
    });
  }

  function applyVariant(scope, variant) {
    var form = scope.querySelector('[data-fc-product-form]');
    var idInput = scope.querySelector('[data-fc-variant-id]');
    var submit = form && form.querySelector('[data-fc-submit]');
    var label = submit && submit.querySelector('[data-fc-submit-label]');
    var stock = scope.querySelector('[data-fc-stock]');
    var isEvent = !!scope.closest('[data-fc-event-page]') || (form && form.hasAttribute('data-fc-event-form'));

    if (idInput) {
      idInput.disabled = !variant;
      if (variant) idInput.value = variant.id;
    }
    if (submit) {
      var ok = variant && variant.available;
      submit.disabled = !ok;
      if (label) label.textContent = ok ? (isEvent ? S.addTable : S.addToCart) : (variant ? S.soldOut : S.unavailable);
    }
    if (stock) stock.textContent = !variant ? S.unavailable : (variant.available ? '' : S.soldOut);

    if (variant) {
      $$('[data-fc-price-wrap] [data-fc-amount]', scope).forEach(function (el) { el.textContent = formatMoney(variant.price); });
      $$('[data-fc-price-wrap] [data-fc-compare]', scope).forEach(function (el) {
        el.textContent = variant.compare > variant.price ? formatMoney(variant.compare) : '';
      });
      var qty = form && form.querySelector('input[name="quantity"]');
      if (qty) {
        if (variant.tracked && variant.left != null) qty.max = Math.max(1, variant.left);
        else qty.removeAttribute('max');
        if (qty.max && parseInt(qty.value, 10) > parseInt(qty.max, 10)) qty.value = qty.max;
      }
      if (variant.media) moveMediaFirst(scope, variant.media);
      var url = scope.getAttribute('data-url');
      if (url && window.history.replaceState && !FC.designMode) {
        window.history.replaceState({}, '', url + '?variant=' + variant.id);
      }
    }
  }

  function moveMediaFirst(scope, mediaId) {
    var list = scope.querySelector('[data-fc-gallery-list]');
    if (!list) return;
    var item = list.querySelector('[data-media-id="' + mediaId + '"]');
    if (!item || item === list.firstElementChild) return;
    list.insertBefore(item, list.firstElementChild);
    list.scrollTo({ left: 0, behavior: 'smooth' });
  }

  function initPicker(picker) {
    var scope = pickerScope(picker);
    if (!scope) return;
    var variants = readVariants(scope);
    var selected = currentOptions(picker);
    var idInput = scope.querySelector('[data-fc-variant-id]');
    if (idInput) idInput.disabled = false;
    updateFlags(picker, variants, selected);
  }

  document.addEventListener('change', function (e) {
    var input = e.target;
    var picker = input.closest('[data-fc-picker]');
    if (picker) {
      var scope = pickerScope(picker);
      var variants = readVariants(scope);
      var selected = currentOptions(picker);
      var variant = variants.filter(function (v) {
        return v.options.every(function (o, i) { return o === selected[i]; });
      })[0];
      updateFlags(picker, variants, selected);
      applyVariant(scope, variant);
      return;
    }
    if (input.classList.contains('fc-tier__input')) {
      onTierChange(input);
    }
  });

  /* ---------- event booking ---------- */

  function onTierChange(input) {
    var form = input.form;
    var page = input.closest('[data-fc-event-page]');
    var qty = form.querySelector('input[name="quantity"]');
    var left = input.getAttribute('data-left');
    if (qty) {
      if (left) {
        qty.max = Math.max(1, parseInt(left, 10));
        if (parseInt(qty.value, 10) > parseInt(qty.max, 10)) qty.value = qty.max;
      } else {
        qty.removeAttribute('max');
      }
    }
    if (page) {
      var name = page.querySelector('[data-fc-sticky-name]');
      var price = page.querySelector('[data-fc-sticky-price]');
      var lbl = form.querySelector('label[for="' + input.id + '"] .fc-tier__name');
      if (name && lbl) name.textContent = lbl.textContent;
      if (price) price.textContent = formatMoney(parseInt(input.getAttribute('data-price'), 10));
    }
  }

  function initEventPage(page) {
    var ends = parseInt(page.getAttribute('data-ends'), 10);
    var form = page.querySelector('[data-fc-event-form]');
    // Guard against cached pages: if the show has ended by the visitor's clock, stop booking.
    if (ends && Date.now() / 1000 > ends && form) {
      var submit = form.querySelector('[data-fc-submit]');
      if (submit) {
        submit.disabled = true;
        var l = submit.querySelector('[data-fc-submit-label]');
        if (l) l.textContent = page.getAttribute('data-ended-label') || 'This show has ended';
      }
      var bar = page.querySelector('[data-fc-sticky]');
      if (bar) bar.remove();
      return;
    }

    var sticky = page.querySelector('[data-fc-sticky]');
    if (!sticky || !form || !('IntersectionObserver' in window)) return;
    sticky.hidden = false;
    sticky.classList.add('is-hidden');
    var go = sticky.querySelector('[data-fc-sticky-go]');
    if (go) {
      go.textContent = S.addTable;
      go.addEventListener('click', function (e) {
        e.preventDefault();
        if (form.checkValidity()) {
          if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        } else {
          var invalid = form.querySelector(':invalid');
          form.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (invalid) setTimeout(function () { invalid.focus({ preventScroll: true }); }, 350);
        }
      });
    }
    // Show the bar only while the form's own button is off screen (above or below).
    var target = form.querySelector('[data-fc-submit]') || form;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        sticky.classList.toggle('is-hidden', entry.isIntersecting);
      });
    }, { threshold: 0.6 });
    io.observe(target);
    page._fcCleanup = function () { io.disconnect(); };
  }

  /* Hide shows that ended after this page was rendered (cached HTML) */
  function pruneEndedRows(root) {
    var now = Date.now() / 1000;
    $$('[data-fc-bill] [data-fc-event][data-ends]', root).forEach(function (row) {
      if (parseInt(row.getAttribute('data-ends'), 10) < now) row.hidden = true;
    });
  }

  /* ---------- add to cart ---------- */

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-fc-product-form]');
    if (!form || !window.fetch || !window.FormData) return;
    e.preventDefault();

    if (!form.checkValidity()) {
      var invalid = form.querySelector(':invalid');
      if (invalid) { invalid.focus(); if (form.reportValidity) form.reportValidity(); }
      return;
    }

    var submit = form.querySelector('[type="submit"]');
    var errorEl = form.querySelector('[data-fc-error]');
    var isTable = form.hasAttribute('data-fc-event-form');
    if (errorEl) errorEl.hidden = true;
    if (submit) { submit.setAttribute('aria-busy', 'true'); submit.disabled = true; }

    var data = new FormData(form);
    if (!data.get('quantity')) {
      var outside = form.id ? document.querySelector('input[name="quantity"][form="' + form.id + '"]') : null;
      data.set('quantity', outside ? outside.value : '1');
    }

    fetch(routes.cartAdd + '.js', {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: data
    })
      .then(handleResponse)
      .then(function () {
        refreshCount();
        showToast(isTable ? S.addedTable : S.added, isTable ? S.holdNotice : '');
        document.dispatchEvent(new CustomEvent('fc:cart:added', { detail: { form: form } }));
      })
      .catch(function (err) {
        if (errorEl) { errorEl.textContent = err.message; errorEl.hidden = false; }
        else showToast(err.message);
      })
      .then(function () {
        if (submit) { submit.removeAttribute('aria-busy'); submit.disabled = false; }
      });
  });

  /* ---------- cart page ---------- */

  var cartTimer;
  function cartChange(section, key, quantity) {
    var id = section.getAttribute('data-section-id');
    section.classList.add('is-busy');
    return postJSON(routes.cartChange + '.js', { id: key, quantity: quantity, sections: [id], sections_url: window.location.pathname })
      .then(function (cart) {
        setCount(cart.item_count);
        var html = cart.sections && cart.sections[id];
        if (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var fresh = doc.querySelector('[data-fc-cart]');
          if (fresh) section.replaceWith(fresh);
          var line = fresh && fresh.querySelector('[data-key="' + key + '"] input[name="updates[]"]');
          if (line) line.focus({ preventScroll: true });
          else if (fresh) { var t = fresh.querySelector('.fc-cart__title'); if (t) { t.tabIndex = -1; t.focus({ preventScroll: true }); } }
        } else {
          window.location.reload();
        }
      })
      .catch(function (err) {
        section.classList.remove('is-busy');
        var el = section.querySelector('[data-fc-error]');
        if (el) { el.textContent = err.message; el.hidden = false; }
      });
  }

  document.addEventListener('change', function (e) {
    var input = e.target;
    if (input.name === 'updates[]') {
      var section = input.closest('[data-fc-cart]');
      var line = input.closest('[data-fc-line]');
      if (!section || !line) return;
      clearTimeout(cartTimer);
      cartTimer = setTimeout(function () {
        cartChange(section, line.getAttribute('data-key'), Math.max(0, parseInt(input.value, 10) || 0));
      }, 350);
    } else if (input.matches('[data-fc-cart-note]')) {
      postJSON(routes.cartUpdate + '.js', { note: input.value }).catch(function () {});
    } else if (input.closest('[data-fc-autosubmit]') || input.closest('[data-fc-localization]')) {
      input.form.submit();
    }
  });

  document.addEventListener('click', function (e) {
    var remove = e.target.closest('[data-fc-remove]');
    if (remove) {
      var section = remove.closest('[data-fc-cart]');
      var line = remove.closest('[data-fc-line]');
      if (section && line) {
        e.preventDefault();
        cartChange(section, line.getAttribute('data-key'), 0);
      }
      return;
    }
    if (e.target.closest('[data-fc-toast-close]')) {
      hideToast();
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      return;
    }
    // Close header disclosures when clicking elsewhere
    $$('[data-fc-search][open], [data-fc-menu][open]').forEach(function (d) {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = $('[data-fc-search][open], [data-fc-menu][open]');
    if (open) {
      open.removeAttribute('open');
      var s = open.querySelector('summary');
      if (s) s.focus();
    }
    var toast = $('[data-fc-toast]');
    if (toast && !toast.hidden) hideToast();
  });

  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d.matches || !d.matches('[data-fc-search], [data-fc-menu]')) return;
    if (d.open) {
      var header = d.closest('[data-fc-header]');
      if (header) document.documentElement.style.setProperty('--fc-drawer-top', header.getBoundingClientRect().bottom + 'px');
      var field = d.querySelector('input[type="search"]');
      if (field && d.matches('[data-fc-search]')) setTimeout(function () { field.focus(); }, 30);
      document.documentElement.classList.toggle('fc-lock', d.matches('[data-fc-menu]'));
    } else if (d.matches('[data-fc-menu]')) {
      document.documentElement.classList.remove('fc-lock');
    }
  }, true);

  /* ---------- recommendations ---------- */

  function loadRecs(root) {
    $$('[data-fc-recs]', root).forEach(function (el) {
      if (el.children.length || !el.getAttribute('data-url')) return;
      fetch(el.getAttribute('data-url'))
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var fresh = doc.querySelector('[data-fc-recs]');
          if (fresh && fresh.innerHTML.trim()) el.innerHTML = fresh.innerHTML;
        })
        .catch(function () {});
    });
  }

  /* ---------- init & theme editor ---------- */

  function init(root) {
    $$('[data-fc-picker]', root).forEach(initPicker);
    $$('[data-fc-event-page]', root).forEach(initEventPage);
    if (root.matches && root.matches('[data-fc-event-page]')) initEventPage(root);
    pruneEndedRows(root);
    loadRecs(root);
  }

  function teardown(root) {
    $$('[data-fc-event-page]', root).forEach(function (p) { if (p._fcCleanup) p._fcCleanup(); });
  }

  FC.formatMoney = formatMoney;
  FC.init = init;
  window.FC = FC;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(document); });
  else init(document);

  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
  document.addEventListener('shopify:section:unload', function (e) { teardown(e.target); });
})();
