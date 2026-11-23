/* Full Circle preview core — renders the real theme files with LiquidJS.
 *
 * Environment-neutral: the Node preview server (server.js) and the in-browser storefront
 * (browser/storefront.js) both use this file, so both render the theme on the branch the
 * same way. It provides:
 *   - Shopify tags (form, paginate, sections, section, style, schema, stylesheet, javascript)
 *   - the Shopify filters and objects the theme uses
 *   - an Ajax Cart API with inventory checks and line item properties
 *   - the Section Rendering API (?sections= / ?section_id=)
 *   - routing for the storefront pages, plus a checkout stub (no orders are placed)
 *
 * createApp(options) → { handle(request) → Promise<response> }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.FCCore = factory;
})(typeof self !== 'undefined' ? self : this, function createApp(opts) {
  'use strict';

  const { Liquid, Tag, Value, Drop } = opts.liquidjs;
  const fixtures = opts.fixtures;
  const TZ = opts.timezone || 'America/New_York';
  const urls = opts.urls; // { asset(name), image(src, width), font(weight), headerHTML(mode) }
  const origin = opts.origin || 'http://localhost';

  const read = (p) => {
    const s = opts.readText(p);
    if (s == null) throw new Error(`Missing theme file: ${p}`);
    return s;
  };
  const exists = (p) => opts.readText(p) != null;
  const stripComments = (s) => s.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
  const readJSON = (p) => JSON.parse(stripComments(read(p)));

  const locale = readJSON('locales/en.default.json');
  const settingsSchema = readJSON('config/settings_schema.json');

  /* ---------------------------------------------------------------- drops */

  class ColorDrop extends Drop {
    constructor(hex) {
      super();
      this.hex = hex;
      const h = hex.replace('#', '');
      this.red = parseInt(h.slice(0, 2), 16);
      this.green = parseInt(h.slice(2, 4), 16);
      this.blue = parseInt(h.slice(4, 6), 16);
    }
    valueOf() { return this.hex; }
    toString() { return this.hex; }
  }

  class FontDrop extends Drop {
    constructor(weight) {
      super();
      this.family = 'Inter';
      this.fallback_families = 'sans-serif';
      this.weight = weight || 400;
      this.style = 'normal';
    }
    valueOf() { return `inter_n${this.weight / 100}`; }
  }

  /* --------------------------------------------------------------- engine */

  const snippetFiles = {};
  for (const name of opts.listSnippets()) snippetFiles[name] = read(`snippets/${name}`);

  const engine = new Liquid({
    templates: snippetFiles,
    extname: '.liquid',
    dynamicPartials: true,
    strictFilters: true,
    jsTruthy: false,
    timezoneOffset: TZ,
    cache: false,
  });

  function hashArgs(args) {
    const out = {};
    for (const a of args) if (Array.isArray(a)) out[a[0]] = a[1];
    return out;
  }

  function tzAbbrev(d) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'short' }).formatToParts(d);
    return (parts.find((p) => p.type === 'timeZoneName') || {}).value || '';
  }

  const builtinDate = engine.filters.date;
  engine.registerFilter('date', function (v, fmt, ...rest) {
    if (v == null || v === '') return v;
    const d = v === 'now' || v === 'today' ? new Date() : new Date(typeof v === 'number' ? v * 1000 : v);
    if (fmt && fmt.includes('%Z') && !isNaN(d)) fmt = fmt.replace(/%Z/g, tzAbbrev(d));
    return builtinDate.call(this, v, fmt, ...rest);
  });

  function lookup(key) {
    return key.split('.').reduce((o, k) => (o == null ? o : o[k]), locale);
  }
  engine.registerFilter('t', (key, ...args) => {
    const vars = hashArgs(args);
    let str = lookup(String(key));
    if (str && typeof str === 'object') str = Number(vars.count) === 1 ? str.one : str.other;
    if (str == null) return `translation missing: en.${key}`;
    return String(str).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  });

  function money(cents, withCurrency) {
    if (cents == null || cents === '') return '';
    const amount = (Number(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return withCurrency ? `$${amount} USD` : `$${amount}`;
  }
  engine.registerFilter('money', (c) => money(c));
  engine.registerFilter('money_with_currency', (c) => money(c, true));
  engine.registerFilter('money_without_currency', (c) => (c == null ? '' : (Number(c) / 100).toFixed(2)));
  engine.registerFilter('money_without_trailing_zeros', (c) => money(c).replace('.00', ''));

  const handleize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  engine.registerFilter('asset_url', (n) => urls.asset(String(n)));
  engine.registerFilter('shopify_asset_url', (n) => `/shopify-assets/${n}`);
  engine.registerFilter('stylesheet_tag', (u) => `<link href="${u}" rel="stylesheet" type="text/css" media="all" />`);
  engine.registerFilter('preload_tag', (u, ...args) => {
    const o = hashArgs(args);
    return `<link href="${u}" rel="preload" as="${o.as}"${o.type ? ` type="${o.type}"` : ''}${o.crossorigin ? ` crossorigin="${o.crossorigin}"` : ''}>`;
  });
  engine.registerFilter('script_tag', (u) => `<script src="${u}" type="text/javascript"></script>`);
  engine.registerFilter('handle', handleize);
  engine.registerFilter('handleize', handleize);
  engine.registerFilter('link_to', (text, href) => `<a href="${href}">${text}</a>`);
  engine.registerFilter('format_code', (s) => s);
  engine.registerFilter('default_errors', (e) => (e ? String(e) : ''));
  engine.registerFilter('structured_data', (p) => JSON.stringify({ '@context': 'http://schema.org/', '@type': 'Product', name: p && p.title, url: p && p.url }));
  engine.registerFilter('payment_type_svg_tag', (t) => `<svg class="fc-payment__icon" viewBox="0 0 38 24" width="38" height="24" role="img" aria-label="${t}"><rect width="38" height="24" rx="3" fill="#fff" stroke="#0f0e0c" stroke-opacity=".25"/><text x="19" y="15" font-size="6.5" text-anchor="middle" font-family="sans-serif" fill="#0f0e0c">${String(t).replace(/_/g, ' ').slice(0, 9)}</text></svg>`);
  for (const f of ['payment_button', 'video_tag', 'external_video_tag', 'model_viewer_tag', 'media_tag']) engine.registerFilter(f, () => '');

  engine.registerFilter('metafield_tag', (mf) => {
    if (mf == null) return '';
    const val = mf.value != null ? mf.value : mf;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (Array.isArray(val)) return `<ul>${val.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`;
    if (mf.type === 'rich_text_field') return String(val);
    if (mf.type === 'multi_line_text_field') return `<p>${esc(val).replace(/\n/g, '<br>')}</p>`;
    return esc(val);
  });

  engine.registerFilter('font_modify', (font, prop, value) => new FontDrop(prop === 'weight' ? parseInt(value, 10) : (font && font.weight) || 400));
  engine.registerFilter('font_face', (font) => {
    const w = (font && font.weight) || 400;
    return `@font-face { font-family: 'Inter'; font-weight: ${w}; font-style: normal; font-display: swap; src: url('${urls.font(w)}') format('woff2'); }`;
  });
  engine.registerFilter('font_url', (font) => urls.font((font && font.weight) || 400));

  function imageSrc(img) {
    if (!img) return '';
    if (img.__image || img.src) return img.src;
    if (img.preview_image) return img.preview_image.src;
    if (img.featured_image) return img.featured_image.src;
    return String(img);
  }
  engine.registerFilter('image_url', (img, ...args) => {
    const o = hashArgs(args);
    const base = imageSrc(img);
    const s = new String(urls.image(base, o.width || 1200)); // eslint-disable-line no-new-wrappers
    s.__img = img && (img.__image ? img : img.preview_image || img.featured_image || img);
    s.__base = base;
    s.__width = o.width;
    return s;
  });
  engine.registerFilter('image_tag', (u, ...args) => {
    const o = hashArgs(args);
    const img = u && u.__img;
    const base = (u && u.__base) || String(u);
    const maxW = (u && u.__width) || (img && img.width) || 1200;
    const width = o.width || Math.min(maxW, (img && img.width) || maxW);
    const height = o.height || (img && img.width ? Math.round(width * img.height / img.width) : '');
    const widths = String(o.widths || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean)
      .filter((w) => !img || !img.width || w <= img.width);
    const seen = new Set();
    const srcset = widths.map((w) => [urls.image(base, w), w]).filter(([u2]) => (seen.has(u2) ? false : seen.add(u2)))
      .map(([u2, w]) => `${u2} ${w}w`).join(', ');
    const attrs = [
      `src="${String(u)}"`,
      srcset && seen.size > 1 ? `srcset="${srcset}"` : '',
      o.sizes && seen.size > 1 ? `sizes="${o.sizes}"` : '',
      `alt="${String(o.alt != null ? o.alt : (img && img.alt) || '').replace(/"/g, '&quot;')}"`,
      width ? `width="${width}"` : '',
      height ? `height="${height}"` : '',
      o.loading ? `loading="${o.loading}"` : '',
      o.class ? `class="${o.class}"` : '',
      o.style ? `style="${o.style}"` : '',
      o.fetchpriority && o.fetchpriority !== 'auto' ? `fetchpriority="${o.fetchpriority}"` : '',
    ].filter(Boolean);
    return `<img ${attrs.join(' ')}>`;
  });

  /* ----------------------------------------------------------------- tags */

  function collect(liquid, remain, endName) {
    const tpls = [];
    const stream = liquid.parser.parseStream(remain)
      .on(`tag:${endName}`, () => stream.stop())
      .on('template', (tpl) => tpls.push(tpl))
      .on('end', () => { throw new Error(`${endName.slice(3)} not closed`); });
    stream.start();
    return tpls;
  }

  function rawBlock(name) {
    engine.registerTag(name, class extends Tag {
      constructor(token, remain, liquid) {
        super(token, remain, liquid);
        while (remain.length) { if (remain.shift().name === `end${name}`) return; }
        throw new Error(`tag ${name} not closed`);
      }
      * render() { return ''; }
    });
  }
  rawBlock('schema');
  rawBlock('stylesheet');
  rawBlock('javascript');

  engine.registerTag('style', class extends Tag {
    constructor(token, remain, liquid) { super(token, remain, liquid); this.tpls = collect(liquid, remain, 'endstyle'); }
    * render(ctx, emitter) {
      emitter.write('<style data-shopify>');
      yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
      emitter.write('</style>');
    }
  });

  engine.registerTag('layout', class extends Tag { * render() { return ''; } });

  engine.registerTag('form', class extends Tag {
    constructor(token, remain, liquid) {
      super(token, remain, liquid);
      const m = token.args.match(/^\s*(['"])([\w-]+)\1\s*,?\s*([\s\S]*)$/);
      this.type = m ? m[2] : 'unknown';
      let rest = m ? m[3] : '';
      const firstHash = rest.search(/(^|,)\s*[\w-]+\s*:/);
      if (firstHash > 0) rest = rest.slice(firstHash).replace(/^,/, '');
      else if (firstHash === -1) rest = '';
      this.pairs = [];
      const re = /([\w-]+)\s*:\s*('[^']*'|"[^"]*"|[^,]+)/g;
      let mm;
      while ((mm = re.exec(rest))) this.pairs.push([mm[1], new Value(mm[2].trim(), liquid)]);
      this.tpls = collect(liquid, remain, 'endform');
    }
    * render(ctx, emitter) {
      const attrs = {};
      for (const [k, v] of this.pairs) attrs[k] = yield v.value(ctx);
      const actions = { product: '/cart/add', localization: '/localization', contact: '/contact#ContactForm', storefront_password: '/password', customer: '/contact#contact_form' };
      const attr = Object.entries(attrs).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
      const enctype = this.type === 'product' ? ' enctype="multipart/form-data"' : '';
      emitter.write(`<form method="post" action="${actions[this.type] || '/'}" accept-charset="UTF-8"${enctype} ${attr}>`);
      emitter.write(`<input type="hidden" name="form_type" value="${this.type}"><input type="hidden" name="utf8" value="✓">`);
      ctx.push({ form: { 'posted_successfully?': false, errors: null } });
      yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
      ctx.pop();
      emitter.write('</form>');
    }
  });

  engine.registerTag('paginate', class extends Tag {
    constructor(token, remain, liquid) {
      super(token, remain, liquid);
      const m = token.args.match(/^\s*([\w.]+)\s+by\s+([\w.'"]+)/);
      this.path = m[1];
      this.by = new Value(m[2], liquid);
      this.tpls = collect(liquid, remain, 'endpaginate');
    }
    * render(ctx, emitter) {
      const size = Number(yield this.by.value(ctx)) || 12;
      const [rootName, prop] = this.path.split('.');
      const rootObj = yield new Value(rootName, this.liquid).value(ctx);
      const all = (rootObj && rootObj[prop]) || [];
      const req = ctx.getSync(['request']) || {};
      const page = Math.max(1, parseInt(req.__query && req.__query.page, 10) || 1);
      const pages = Math.max(1, Math.ceil(all.length / size));
      const pageUrl = (n) => {
        const q = new URLSearchParams(req.__query || {});
        q.set('page', n);
        return `${req.path}?${q.toString()}`;
      };
      const parts = [];
      for (let i = 1; i <= pages; i++) parts.push({ title: i, url: pageUrl(i), is_link: i !== page });
      const paginate = {
        current_page: page, pages, items: all.length, page_size: size, parts,
        previous: page > 1 ? { title: 'Previous', url: pageUrl(page - 1) } : null,
        next: page < pages ? { title: 'Next', url: pageUrl(page + 1) } : null,
      };
      const clone = Object.assign(Object.create(Object.getPrototypeOf(rootObj)), rootObj, { [prop]: all.slice((page - 1) * size, page * size) });
      ctx.push({ [rootName]: clone, paginate });
      yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
      ctx.pop();
    }
  });

  engine.registerTag('sections', class extends Tag {
    constructor(token, remain, liquid) { super(token, remain, liquid); this.group = token.args.trim().replace(/^['"]|['"]$/g, ''); }
    * render(ctx) { return yield renderGroup(this.group, ctx.getSync(['__page'])); }
  });
  engine.registerTag('section', class extends Tag {
    constructor(token, remain, liquid) { super(token, remain, liquid); this.name = token.args.trim().replace(/^['"]|['"]$/g, ''); }
    * render(ctx) { return yield renderSection(this.name, this.name, {}, ctx.getSync(['__page'])); }
  });

  /* ------------------------------------------------------ settings/sections */

  const schemaCache = {};
  function schemaOf(type) {
    if (schemaCache[type]) return schemaCache[type];
    const m = read(`sections/${type}.liquid`).match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
    return (schemaCache[type] = m ? JSON.parse(m[1]) : {});
  }

  function convertSetting(def, value, page) {
    const { collections, linklists } = page.data;
    switch (def.type) {
      case 'collection': return value ? collections[value] || null : null;
      case 'collection_list': return (value || []).map((h) => collections[h]).filter(Boolean);
      case 'product': return value ? page.data.byHandle[value] || null : null;
      case 'link_list': return value ? linklists[value] || null : null;
      case 'color': return value ? new ColorDrop(value) : null;
      case 'font_picker': return new FontDrop(400);
      case 'image_picker': return null;
      case 'page': return null;
      default: return value;
    }
  }

  function resolveSettings(defs, values, page) {
    const out = {};
    for (const def of defs || []) {
      if (!def.id) continue;
      const raw = values && Object.prototype.hasOwnProperty.call(values, def.id) ? values[def.id] : def.default;
      out[def.id] = convertSetting(def, raw, page);
    }
    return out;
  }

  function globalSettings(page) {
    const data = readJSON('config/settings_data.json');
    const current = typeof data.current === 'string' ? data.presets[data.current] : data.current;
    // Preview-only: the two collection choices the merchant makes in the theme editor.
    const overrides = { merch_collection: 'shop', vending_collection: 'vending-tables' };
    const defs = settingsSchema.flatMap((g) => g.settings || []);
    return resolveSettings(defs, { ...current, ...overrides }, page);
  }

  function renderSection(id, type, conf, page, extraClass) {
    const schema = schemaOf(type);
    const settings = resolveSettings(schema.settings, conf.settings || {}, page);
    const blockDefs = Object.fromEntries((schema.blocks || []).map((b) => [b.type, b]));
    const order = conf.block_order || Object.keys(conf.blocks || {});
    const blocks = order.map((bid) => {
      const b = conf.blocks[bid];
      const def = blockDefs[b.type] || {};
      return { id: bid, type: b.type, settings: resolveSettings(def.settings, b.settings || {}, page), shopify_attributes: '' };
    });
    const section = { id, settings, blocks, block_order: order };
    const tag = schema.tag || 'div';
    const cls = ['shopify-section', extraClass, schema.class].filter(Boolean).join(' ');
    return engine.parseAndRender(read(`sections/${type}.liquid`), { section }, { globals: page.globals })
      .then((html) => `<${tag} id="shopify-section-${id}" class="${cls}">${html}</${tag}>`);
  }

  async function renderGroup(group, page) {
    const conf = readJSON(`sections/${group}.json`);
    const out = [];
    for (const key of conf.order) {
      const s = conf.sections[key];
      if (!s.disabled) out.push(await renderSection(`sections--fc__${key}`, s.type, s, page, `shopify-section-group-${group}`));
    }
    return out.join('\n');
  }

  async function renderTemplate(name, page) {
    const conf = readJSON(`templates/${name}.json`);
    const html = [];
    for (const key of conf.order) {
      const s = conf.sections[key];
      if (!s.disabled) html.push(await renderSection(`template--${name.replace(/\./g, '-')}__${key}`, s.type, s, page));
    }
    return { html: html.join('\n'), layout: conf.layout || 'theme' };
  }

  async function renderSectionById(id, template, page) {
    const m = id.match(/^template--[\w-]+__(\w+)$/);
    if (m && exists(`templates/${template}.json`)) {
      const s = readJSON(`templates/${template}.json`).sections[m[1]];
      if (s) return renderSection(id, s.type, s, page);
    }
    const bare = id.replace(/^template--[\w-]+__/, '').replace(/^sections--fc__/, '');
    for (const t of [template, 'product', 'index', 'cart']) {
      if (!exists(`templates/${t}.json`)) continue;
      const conf = readJSON(`templates/${t}.json`);
      const key = Object.keys(conf.sections).find((k) => k === bare || conf.sections[k].type === bare);
      if (key) return renderSection(id, conf.sections[key].type, conf.sections[key], page);
    }
    for (const g of ['header-group', 'footer-group']) {
      const conf = readJSON(`sections/${g}.json`);
      if (conf.sections[bare]) return renderSection(id, conf.sections[bare].type, conf.sections[bare], page, `shopify-section-group-${g}`);
    }
    if (exists(`sections/${bare}.liquid`)) return renderSection(id, bare, {}, page);
    return null;
  }

  /* ----------------------------------------------------------------- cart */

  function hashKey(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
  function lineKey(variantId, props) { return `${variantId}:${hashKey(JSON.stringify(props || {}))}`; }

  function findVariant(data, id) {
    for (const p of data.products) {
      const v = p.variants.find((x) => String(x.id) === String(id));
      if (v) return { product: p, variant: v };
    }
    return null;
  }

  function cartError(status, description) {
    const e = new Error(description);
    e.status = status;
    e.body = { status, message: 'Cart Error', description };
    return e;
  }

  function addToCart(cart, data, id, qty, props) {
    const hit = findVariant(data, id);
    if (!hit) throw cartError(404, 'Cannot find variant');
    const { product, variant } = hit;
    if (!variant.available) throw cartError(422, `The product '${product.title}' is already sold out.`);
    const clean = {};
    for (const [k, v] of Object.entries(props || {})) if (v !== '') clean[k] = v;
    const key = lineKey(variant.id, clean);
    const existing = cart.lines.find((l) => l.key === key);
    const inCart = cart.lines.filter((l) => l.variant_id === variant.id).reduce((n, l) => n + l.quantity, 0);
    if (variant.inventory_management === 'shopify' && variant.inventory_policy === 'deny' && inCart + qty > variant.inventory_quantity) {
      const left = Math.max(0, variant.inventory_quantity - inCart);
      if (left === 0) throw cartError(422, `You can't add more ${product.title} - ${variant.title} to the cart.`);
      qty = left;
    }
    if (existing) existing.quantity += qty;
    else cart.lines.push({ key, variant_id: variant.id, quantity: qty, properties: clean });
  }

  function changeLine(cart, data, keyOrLine, qty) {
    const line = typeof keyOrLine === 'number'
      ? cart.lines[keyOrLine - 1]
      : cart.lines.find((l) => l.key === keyOrLine || String(l.variant_id) === String(keyOrLine));
    if (!line) throw cartError(400, 'no valid id or line parameter');
    if (qty <= 0) { cart.lines = cart.lines.filter((l) => l !== line); return; }
    const { variant } = findVariant(data, line.variant_id);
    if (variant.inventory_management === 'shopify' && variant.inventory_policy === 'deny' && qty > variant.inventory_quantity) {
      line.quantity = variant.inventory_quantity;
      throw cartError(422, `You can only add ${variant.inventory_quantity} of this item to your cart.`);
    }
    line.quantity = qty;
  }

  function cartDrop(cart, data) {
    cart.lines = cart.lines.filter((l) => findVariant(data, l.variant_id));
    const items = cart.lines.map((l, i) => {
      const { product, variant } = findVariant(data, l.variant_id);
      const price = variant.price * l.quantity;
      return {
        key: l.key, id: variant.id, index: i + 1, quantity: l.quantity,
        title: product.has_only_default_variant ? product.title : `${product.title} - ${variant.title}`,
        product, variant, variant_id: variant.id, product_id: product.id,
        url: `${product.url}?variant=${variant.id}`,
        image: variant.featured_image || product.featured_image,
        properties: l.properties,
        price: variant.price, final_price: variant.price, original_price: variant.price,
        line_price: price, final_line_price: price, original_line_price: price,
        requires_shipping: variant.requires_shipping,
        url_to_remove: `/cart/change?line=${i + 1}&quantity=0`,
        line_level_discount_allocations: [], selling_plan_allocation: null,
      };
    });
    const total = items.reduce((n, it) => n + it.final_line_price, 0);
    return {
      items, item_count: items.reduce((n, it) => n + it.quantity, 0), total_price: total, original_total_price: total,
      note: cart.note, currency: { iso_code: 'USD' }, cart_level_discount_applications: [], requires_shipping: items.some((it) => it.requires_shipping),
    };
  }

  function cartJSON(drop) {
    return {
      token: 'preview', note: drop.note, item_count: drop.item_count, total_price: drop.total_price, currency: 'USD', requires_shipping: drop.requires_shipping,
      items: drop.items.map((it) => ({
        key: it.key, id: it.id, variant_id: it.id, product_id: it.product_id, quantity: it.quantity,
        title: it.title, product_title: it.product.title, variant_title: it.variant.title,
        price: it.price, line_price: it.line_price, final_line_price: it.final_line_price,
        properties: it.properties, requires_shipping: it.requires_shipping, url: it.url,
      })),
    };
  }

  /* ---------------------------------------------------------------- pages */

  const dataCache = {};
  function dataFor(mode) {
    if (dataCache[mode]) return dataCache[mode];
    const c = fixtures.catalog(mode);
    return (dataCache[mode] = { ...c, linklists: fixtures.linklists, byHandle: Object.fromEntries(c.products.map((p) => [p.handle, p])) });
  }

  async function renderPage(req, data, cartState, opts2) {
    const { pathname, query } = req;
    const cart = cartDrop(cartState, data);
    const page = { data };
    let template = '404';
    let pageType = '404';
    let pageTitle = 'Page not found';
    const objects = { product: null, collection: null, page: null, search: null, recommendations: null };
    let m;

    if (pathname === '/') { template = 'index'; pageType = 'index'; pageTitle = fixtures.shop.name; }
    else if ((m = pathname.match(/^\/(?:collections\/[\w-]+\/)?products\/([\w-]+)$/))) {
      const p = data.byHandle[m[1]];
      if (p) {
        const selected = (query.variant && p.variants.find((v) => String(v.id) === String(query.variant))) || p.variants.find((v) => v.available) || p.variants[0];
        const options_with_values = p.options_with_values.map((o, i) => ({ ...o, selected_value: selected.options[i] }));
        objects.product = { ...p, selected_variant: query.variant ? selected : null, selected_or_first_available_variant: selected, options_with_values };
        const cm = pathname.match(/^\/collections\/([\w-]+)\//);
        if (cm) objects.collection = data.collections[cm[1]] || null;
        template = p.template_suffix ? `product.${p.template_suffix}` : 'product';
        pageType = 'product'; pageTitle = p.title;
      }
    } else if ((m = pathname.match(/^\/collections\/([\w-]+)$/))) {
      let c = data.collections[m[1]];
      if (c) {
        let products = c.products.slice();
        if (query.sort_by === 'price-ascending') products.sort((a, b) => a.price - b.price);
        if (query.sort_by === 'price-descending') products.sort((a, b) => b.price - a.price);
        if (query.sort_by === 'title-ascending') products.sort((a, b) => a.title.localeCompare(b.title));
        const avail = query['filter.v.availability'];
        if (avail != null && avail !== '') products = products.filter((p) => (String(avail) === '1' ? p.available : !p.available));
        const filters = (c.filters || []).map((f) => ({
          ...f,
          values: f.values.map((v) => ({ ...v, active: String(query[v.param_name]) === v.value })),
          active_values: f.values.filter((v) => String(query[v.param_name]) === v.value),
        }));
        c = { ...c, products, products_count: products.length, sort_by: query.sort_by || null, filters };
        objects.collection = c;
        template = c.template_suffix ? `collection.${c.template_suffix}` : 'collection';
        pageType = 'collection'; pageTitle = c.title;
      }
    } else if (pathname === '/collections') { template = 'list-collections'; pageType = 'list-collections'; pageTitle = 'Collections'; }
    else if (pathname === '/cart') { template = 'cart'; pageType = 'cart'; pageTitle = 'Your cart'; }
    else if (pathname === '/search') {
      const terms = String(query.q || '').trim();
      const t = terms.toLowerCase();
      const results = terms ? data.products.filter((p) => `${p.title} ${p.tags.join(' ')} ${p.description}`.toLowerCase().includes(t)).map((p) => ({ ...p, object_type: 'product' })) : [];
      objects.search = { performed: !!terms, terms, results, results_count: results.length };
      template = 'search'; pageType = 'search'; pageTitle = 'Search';
    } else if ((m = pathname.match(/^\/pages\/([\w-]+)$/))) {
      const pg = fixtures.pages[m[1]];
      if (pg) { objects.page = pg; template = pg.template_suffix ? `page.${pg.template_suffix}` : 'page'; pageType = 'page'; pageTitle = pg.title; }
    } else if (pathname === '/recommendations/products') {
      const p = data.products.find((x) => String(x.id) === String(query.product_id));
      const recs = data.products.filter((x) => x !== p).slice(0, parseInt(query.limit, 10) || 4);
      objects.recommendations = { performed: true, products: recs, products_count: recs.length };
      objects.product = p;
      pageType = 'product';
    }
    const status = template === '404' && pageType === '404' ? 404 : 200;
    const tparts = template.split('.');
    page.globals = {
      __page: page,
      settings: globalSettings(page),
      shop: fixtures.shop,
      cart,
      routes: {
        root_url: '/', cart_url: '/cart', cart_add_url: '/cart/add', cart_change_url: '/cart/change', cart_update_url: '/cart/update',
        search_url: '/search', collections_url: '/collections', all_products_collection_url: '/collections/all',
        product_recommendations_url: '/recommendations/products', account_url: '/account', predictive_search_url: '/search/suggest',
      },
      localization: fixtures.localization,
      linklists: data.linklists,
      collections: data.collections,
      all_products: data.byHandle,
      pages: fixtures.pages,
      request: { page_type: pageType, path: pathname, design_mode: false, locale: { iso_code: 'en' }, origin, __query: query },
      template: { name: tparts[0], suffix: tparts[1] || null },
      canonical_url: `${origin}${pathname}`,
      page_title: pageTitle,
      page_description: objects.product ? objects.product.description.replace(/<[^>]+>/g, '').slice(0, 160) : '',
      content_for_header: urls.headerHTML ? urls.headerHTML(opts2.mode) : '',
      additional_checkout_buttons: false,
      current_page: 1,
      customer: null,
      ...objects,
    };

    const ids = String(query.sections || query.section_id || '').split(',').filter(Boolean);
    if (ids.length) {
      const out = {};
      for (const id of ids) out[id] = await renderSectionById(id, template, page);
      if (query.section_id) return { status: 200, type: 'html', body: out[ids[0]] || '' };
      return { status: 200, type: 'json', body: out };
    }

    const { html: body, layout } = await renderTemplate(template, page);
    page.globals.content_for_layout = body;
    const html = await engine.parseAndRender(read(`layout/${layout}.liquid`), {}, { globals: page.globals });
    return { status, type: 'html', body: html, template, title: pageTitle };
  }

  function checkoutStub(drop) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rows = drop.items.map((it) => `<tr><td>${esc(it.product.title)}</td><td>${esc(it.variant.title)}</td><td>${it.quantity}</td><td>${Object.entries(it.properties).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>') || '—'}</td><td>${it.requires_shipping ? 'yes' : 'no'}</td><td>${money(it.final_line_price)}</td></tr>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Checkout (simulated)</title></head>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 16px;background:#fff;color:#111">
<h1 data-checkout-stub>Checkout (simulated)</h1>
<p>On the real store this is Shopify Checkout. The preview stops here, so no order is placed and no payment is taken. This is the cart Shopify would receive:</p>
<div style="overflow-x:auto"><table border="1" cellpadding="8" style="border-collapse:collapse;width:100%"><tr><th>Product</th><th>Option</th><th>Qty</th><th>Line properties</th><th>Ships</th><th>Total</th></tr>${rows || '<tr><td colspan="6">The cart is empty.</td></tr>'}</table></div>
<p><strong>Subtotal ${money(drop.total_price)}</strong>${drop.note ? ` · Note: ${esc(drop.note)}` : ''}</p>
<p><a href="/cart">Back to cart</a> · <a href="/">Back to the store</a></p></body></html>`;
  }

  function pairsToAdd(pairs) {
    let id; let quantity = 1; const properties = {};
    for (const [k, v] of pairs) {
      if (k === 'id') id = v;
      else if (k === 'quantity') quantity = parseInt(v, 10) || 1;
      else if (k.startsWith('properties[')) properties[k.slice(11, -1)] = v;
    }
    return { id, quantity, properties };
  }

  /* request: { method, pathname, query, pairs, json, cart: {lines, note}, mode } */
  async function handle(req) {
    const data = dataFor(req.mode || 'full');
    const cart = req.cart;
    const pathname = req.pathname.replace(/\/$/, '') || '/';
    const json = pathname.endsWith('.js');
    const route = pathname.replace(/\.js$/, '');
    const pairs = req.pairs || (req.json ? Object.entries(req.json) : []);
    const body = req.json || {};
    const query = req.query || {};
    const redirect = (to) => ({ status: 302, type: 'redirect', location: to });
    const out = (status, payload) => ({ status, type: 'json', body: payload });

    if (route === '/cart/add' && req.method === 'POST') {
      try {
        if (Array.isArray(body.items)) body.items.forEach((it) => addToCart(cart, data, it.id, it.quantity || 1, it.properties));
        else { const a = pairsToAdd(pairs); addToCart(cart, data, a.id, a.quantity, a.properties); }
      } catch (e) {
        return json ? out(e.status || 422, e.body) : redirect('/cart');
      }
      return json ? out(200, cartJSON(cartDrop(cart, data)).items.slice(-1)[0]) : redirect('/cart');
    }

    if ((route === '/cart/change' || route === '/cart/update') && (req.method === 'POST' || query.line)) {
      const b = req.method === 'POST' ? body : { line: parseInt(query.line, 10), quantity: parseInt(query.quantity, 10) };
      let error = null;
      try {
        if (route === '/cart/change') changeLine(cart, data, b.line ? parseInt(b.line, 10) : b.id, parseInt(b.quantity, 10));
        else {
          if (b.note != null) cart.note = String(b.note);
          const keys = cart.lines.map((l) => l.key);
          pairs.filter(([k]) => k === 'updates[]').map(([, v]) => parseInt(v, 10)).forEach((q, i) => { if (keys[i]) changeLine(cart, data, keys[i], q); });
          const note = pairs.find(([k]) => k === 'note');
          if (note) cart.note = note[1];
          if (pairs.some(([k]) => k === 'checkout')) return redirect('/checkout');
        }
      } catch (e) { error = e; }
      if (!json) return redirect('/cart');
      if (error) return out(error.status || 422, error.body);
      const result = cartJSON(cartDrop(cart, data));
      if (b.sections) {
        result.sections = {};
        const list = Array.isArray(b.sections) ? b.sections : String(b.sections).split(',');
        for (const id of list) {
          const r = await renderPage({ pathname: b.sections_url || '/cart', query: { sections: id } }, data, cart, req);
          result.sections[id] = r.body[id] || null;
        }
      }
      return out(200, result);
    }

    if (route === '/cart' && req.method === 'POST') {
      const keys = cart.lines.map((l) => l.key);
      try { pairs.filter(([k]) => k === 'updates[]').map(([, v]) => parseInt(v, 10)).forEach((q, i) => { if (keys[i]) changeLine(cart, data, keys[i], q); }); } catch (e) { /* clamped */ }
      const note = pairs.find(([k]) => k === 'note');
      if (note) cart.note = note[1];
      return redirect(pairs.some(([k]) => k === 'checkout') ? '/checkout' : '/cart');
    }
    if (route === '/cart' && json) return out(200, cartJSON(cartDrop(cart, data)));
    if (pathname === '/checkout') return { status: 200, type: 'html', body: checkoutStub(cartDrop(cart, data)), standalone: true };
    if (pathname === '/localization') return redirect('/');

    return renderPage({ pathname, query }, data, cart, req);
  }

  return { handle, money };
});
