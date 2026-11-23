/* Local preview server for the Full Circle Shopify theme.
 *
 * Renders ../full-circle-theme with LiquidJS plus a small set of Shopify tags, filters and
 * objects, an in-memory cart that follows Shopify's Ajax Cart API, and the Section Rendering
 * API. It is a stand-in for `shopify theme dev`, built so the theme can be reviewed without
 * store credentials. Checkout is a stub page that shows exactly what would be handed to
 * Shopify. Nothing here talks to a real store.
 *
 *   node server.js            → http://localhost:9292
 *   ?fixture=full|one|none    → switch the sample show set (remembered in a cookie)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { Liquid, Tag, Value, Hash, Drop } = require('liquidjs');
const fixtures = require('./fixtures');

const THEME = path.resolve(__dirname, '..', 'full-circle-theme');
const PORT = parseInt(process.env.PORT || '9292', 10);
const TZ = 'America/New_York';

const read = (p) => fs.readFileSync(path.join(THEME, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(THEME, p));
const stripComments = (s) => s.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
const readJSON = (p) => JSON.parse(stripComments(read(p)));

const locale = readJSON('locales/en.default.json');
const settingsSchema = readJSON('config/settings_schema.json');

/* ------------------------------------------------------------------ */
/* Drops                                                              */
/* ------------------------------------------------------------------ */

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
  constructor(weight = 400) {
    super();
    this.family = 'Inter';
    this.fallback_families = 'sans-serif';
    this.weight = weight;
    this.style = 'normal';
  }
  valueOf() { return `inter_n${this.weight / 100}`; }
}

/* ------------------------------------------------------------------ */
/* Liquid engine                                                       */
/* ------------------------------------------------------------------ */

const engine = new Liquid({
  root: [path.join(THEME, 'snippets')],
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
  let d = v === 'now' || v === 'today' ? new Date() : new Date(typeof v === 'number' ? v * 1000 : v);
  if (fmt && fmt.includes('%Z') && !isNaN(d)) fmt = fmt.replace(/%Z/g, tzAbbrev(d));
  return builtinDate.call(this, v, fmt, ...rest);
});

/* translations */
function lookup(key) {
  return key.split('.').reduce((o, k) => (o == null ? o : o[k]), locale);
}
engine.registerFilter('t', function (key, ...args) {
  const vars = hashArgs(args);
  let str = lookup(String(key));
  if (str && typeof str === 'object') {
    const n = Number(vars.count);
    str = n === 1 ? str.one : str.other;
  }
  if (str == null) return `translation missing: en.${key}`;
  return String(str).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
});

/* money */
function money(cents, withCurrency) {
  if (cents == null || cents === '') return '';
  const amount = (Number(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return withCurrency ? `$${amount} USD` : `$${amount}`;
}
engine.registerFilter('money', (c) => money(c));
engine.registerFilter('money_with_currency', (c) => money(c, true));
engine.registerFilter('money_without_currency', (c) => (c == null ? '' : (Number(c) / 100).toFixed(2)));
engine.registerFilter('money_without_trailing_zeros', (c) => money(c).replace('.00', ''));

/* assets & urls */
const assetVersion = {};
function assetUrl(name) {
  const file = path.join(THEME, 'assets', String(name));
  let v = assetVersion[name];
  try { v = Math.floor(fs.statSync(file).mtimeMs); } catch (e) { v = 0; }
  return `/assets/${name}?v=${v}`;
}
engine.registerFilter('asset_url', assetUrl);
engine.registerFilter('shopify_asset_url', (n) => `/shopify-assets/${n}`);
engine.registerFilter('stylesheet_tag', (u) => `<link href="${u}" rel="stylesheet" type="text/css" media="all" />`);
engine.registerFilter('preload_tag', (u, ...args) => { const o = hashArgs(args); return `<link href="${u}" rel="preload" as="${o.as}"${o.type ? ` type="${o.type}"` : ''}${o.crossorigin ? ` crossorigin="${o.crossorigin}"` : ''}>`; });
engine.registerFilter('script_tag', (u) => `<script src="${u}" type="text/javascript"></script>`);
engine.registerFilter('handle', (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
engine.registerFilter('handleize', (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
engine.registerFilter('link_to', (text, href) => `<a href="${href}">${text}</a>`);
engine.registerFilter('format_code', (s) => s);
engine.registerFilter('default_errors', (e) => (e ? String(e) : ''));
engine.registerFilter('structured_data', (p) => JSON.stringify({ '@context': 'http://schema.org/', '@type': 'Product', name: p && p.title, url: p && p.url }));
engine.registerFilter('payment_type_svg_tag', (t) => `<svg class="fc-payment__icon" viewBox="0 0 38 24" width="38" height="24" role="img" aria-label="${t}"><rect width="38" height="24" rx="3" fill="#fff" stroke="#0f0e0c" stroke-opacity=".25"/><text x="19" y="15" font-size="6.5" text-anchor="middle" font-family="sans-serif" fill="#0f0e0c">${String(t).replace(/_/g, ' ').slice(0, 9)}</text></svg>`);
engine.registerFilter('payment_button', () => '');
engine.registerFilter('video_tag', () => '');
engine.registerFilter('external_video_tag', () => '');
engine.registerFilter('model_viewer_tag', () => '');
engine.registerFilter('media_tag', () => '');

engine.registerFilter('metafield_tag', (mf) => {
  if (mf == null) return '';
  const val = mf.value != null ? mf.value : mf;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (Array.isArray(val)) return `<ul class="metafield-single_line_text_field-array">${val.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`;
  if (mf.type === 'rich_text_field') return String(val);
  if (mf.type === 'multi_line_text_field') return `<p>${esc(val).replace(/\n/g, '<br>')}</p>`;
  return esc(val);
});

/* fonts */
engine.registerFilter('font_modify', (font, prop, value) => new FontDrop(prop === 'weight' ? parseInt(value, 10) : (font && font.weight) || 400));
engine.registerFilter('font_face', (font) => {
  const w = (font && font.weight) || 400;
  return `@font-face { font-family: 'Inter'; font-weight: ${w}; font-style: normal; font-display: swap; src: url('/fonts/inter-latin-${w}-normal.woff2') format('woff2'); }`;
});
engine.registerFilter('font_url', (font) => `/fonts/inter-latin-${(font && font.weight) || 400}-normal.woff2`);

/* images */
function imageSrc(img) {
  if (!img) return '';
  if (img.__image || img.src) return img.src;
  if (img.preview_image) return img.preview_image.src;
  if (img.featured_image) return img.featured_image.src;
  return String(img);
}
function sized(src, w) {
  if (!src) return '';
  if (!/cdn\.shopify\.com/.test(src)) return src;
  return src + (src.includes('?') ? '&' : '?') + 'width=' + w;
}
engine.registerFilter('image_url', (img, ...args) => {
  const opts = hashArgs(args);
  const base = imageSrc(img);
  const s = new String(sized(base, opts.width || 1200)); // eslint-disable-line no-new-wrappers
  s.__img = img && (img.__image ? img : img.preview_image || img.featured_image || img);
  s.__base = base;
  s.__width = opts.width;
  return s;
});
engine.registerFilter('image_tag', (u, ...args) => {
  const o = hashArgs(args);
  const img = u && u.__img;
  const base = (u && u.__base) || String(u);
  const maxW = (u && u.__width) || (img && img.width) || 1200;
  let width = o.width || Math.min(maxW, (img && img.width) || maxW);
  let height = o.height || (img && img.width ? Math.round(width * img.height / img.width) : '');
  const widths = String(o.widths || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean)
    .filter((w) => !img || !img.width || w <= img.width);
  const srcset = widths.length && /cdn\.shopify\.com/.test(base) ? widths.map((w) => `${sized(base, w)} ${w}w`).join(', ') : '';
  const attrs = [
    `src="${String(u)}"`,
    srcset ? `srcset="${srcset}"` : '',
    o.sizes && srcset ? `sizes="${o.sizes}"` : '',
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

/* ------------------------------------------------------------------ */
/* Shopify tags                                                        */
/* ------------------------------------------------------------------ */

function rawBlock(name, open, close) {
  engine.registerTag(name, class extends Tag {
    constructor(token, remain, liquid) {
      super(token, remain, liquid);
      this.tpls = [];
      let closed = false;
      while (remain.length) {
        const t = remain.shift();
        if (t.name === `end${name}`) { closed = true; break; }
        this.tpls.push(t);
      }
      if (!closed) throw new Error(`tag ${name} not closed`);
    }
    * render() {
      if (!open) return '';
      return open + this.tpls.map((t) => t.getText()).join('') + close;
    }
  });
}
rawBlock('schema');
rawBlock('stylesheet');
rawBlock('javascript');

engine.registerTag('style', class extends Tag {
  constructor(token, remain, liquid) {
    super(token, remain, liquid);
    this.tpls = [];
    const stream = liquid.parser.parseStream(remain)
      .on('tag:endstyle', () => stream.stop())
      .on('template', (tpl) => this.tpls.push(tpl))
      .on('end', () => { throw new Error('style not closed'); });
    stream.start();
  }
  * render(ctx, emitter) {
    emitter.write('<style data-shopify>');
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    emitter.write('</style>');
  }
});

engine.registerTag('layout', class extends Tag { * render() { return ''; } });

/* {% form 'type', object, key: value %} */
engine.registerTag('form', class extends Tag {
  constructor(token, remain, liquid) {
    super(token, remain, liquid);
    const args = token.args;
    const m = args.match(/^\s*(['"])([\w-]+)\1\s*,?\s*(.*)$/s);
    this.type = m ? m[2] : 'unknown';
    let rest = m ? m[3] : '';
    const firstHash = rest.search(/(^|,)\s*[\w-]+\s*:/);
    if (firstHash > 0) {
      this.objectExpr = rest.slice(0, firstHash).replace(/,\s*$/, '').trim();
      rest = rest.slice(firstHash).replace(/^,/, '');
    } else if (firstHash === -1 && rest.trim()) {
      this.objectExpr = rest.trim();
      rest = '';
    }
    // hash keys may contain hyphens (data-foo) which liquidjs' Hash does not accept
    this.pairs = [];
    const re = /([\w-]+)\s*:\s*('[^']*'|"[^"]*"|[^,]+)/g;
    let mm;
    while ((mm = re.exec(rest))) this.pairs.push([mm[1], new Value(mm[2].trim(), liquid)]);
    this.tpls = [];
    const stream = liquid.parser.parseStream(remain)
      .on('tag:endform', () => stream.stop())
      .on('template', (tpl) => this.tpls.push(tpl))
      .on('end', () => { throw new Error('form not closed'); });
    stream.start();
  }
  * render(ctx, emitter) {
    const attrs = {};
    for (const [k, v] of this.pairs) attrs[k] = yield v.value(ctx);
    const actions = {
      product: '/cart/add', localization: '/localization', contact: '/contact#ContactForm',
      storefront_password: '/password', customer: '/contact#contact_form',
    };
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

/* {% paginate collection.products by 12 %} */
engine.registerTag('paginate', class extends Tag {
  constructor(token, remain, liquid) {
    super(token, remain, liquid);
    const m = token.args.match(/^\s*([\w.]+)\s+by\s+([\w.'"]+)/);
    this.path = m[1];
    this.by = new Value(m[2], liquid);
    this.tpls = [];
    const stream = liquid.parser.parseStream(remain)
      .on('tag:endpaginate', () => stream.stop())
      .on('template', (tpl) => this.tpls.push(tpl))
      .on('end', () => { throw new Error('paginate not closed'); });
    stream.start();
  }
  * render(ctx, emitter) {
    const size = Number(yield this.by.value(ctx)) || 12;
    const [rootName, prop] = this.path.split('.');
    const root = yield new Value(rootName, this.liquid).value(ctx);
    const all = (root && root[prop]) || [];
    const req = ctx.getSync(['request']) || {};
    const page = Math.max(1, parseInt(req.__query && req.__query.page, 10) || 1);
    const pages = Math.max(1, Math.ceil(all.length / size));
    const slice = all.slice((page - 1) * size, page * size);
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
    const clone = Object.assign(Object.create(Object.getPrototypeOf(root)), root, { [prop]: slice });
    ctx.push({ [rootName]: clone, paginate });
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    ctx.pop();
  }
});

/* {% sections 'header-group' %} */
engine.registerTag('sections', class extends Tag {
  constructor(token, remain, liquid) {
    super(token, remain, liquid);
    this.group = token.args.trim().replace(/^['"]|['"]$/g, '');
  }
  * render(ctx) {
    const page = ctx.getSync(['__page']);
    return yield renderGroup(this.group, page);
  }
});

engine.registerTag('section', class extends Tag {
  constructor(token, remain, liquid) {
    super(token, remain, liquid);
    this.name = token.args.trim().replace(/^['"]|['"]$/g, '');
  }
  * render(ctx) {
    const page = ctx.getSync(['__page']);
    return yield renderSection(this.name, this.name, {}, page);
  }
});

/* ------------------------------------------------------------------ */
/* Settings & sections                                                 */
/* ------------------------------------------------------------------ */

function schemaOf(type) {
  const src = read(`sections/${type}.liquid`);
  const m = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  return m ? JSON.parse(m[1]) : {};
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
  // Preview-only assignments the merchant makes in the theme editor (documented in the handoff).
  const overrides = { merch_collection: 'shop', vending_collection: 'vending-tables', ...page.settingsOverrides };
  const defs = settingsSchema.flatMap((g) => g.settings || []);
  return resolveSettings(defs, { ...current, ...overrides }, page);
}

function renderSection(id, type, conf, page, extraClass = '') {
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
  const tpl = read(`sections/${type}.liquid`);
  const tag = schema.tag || 'div';
  const cls = ['shopify-section', extraClass, schema.class].filter(Boolean).join(' ');
  return engine.parseAndRender(tpl, { section }, { globals: page.globals })
    .then((html) => `<${tag} id="shopify-section-${id}" class="${cls}">${html}</${tag}>`);
}

async function renderGroup(group, page) {
  const conf = readJSON(`sections/${group}.json`);
  const out = [];
  for (const key of conf.order) {
    const s = conf.sections[key];
    if (s.disabled) continue;
    out.push(await renderSection(`sections--fc__${key}`, s.type, s, page, `shopify-section-group-${group}`));
  }
  return out.join('\n');
}

async function renderTemplate(name, page) {
  const conf = readJSON(`templates/${name}.json`);
  const html = [];
  for (const key of conf.order) {
    const s = conf.sections[key];
    if (s.disabled) continue;
    html.push(await renderSection(`template--${name.replace(/\./g, '-')}__${key}`, s.type, s, page));
  }
  return { html: html.join('\n'), layout: conf.layout || 'theme' };
}

/* ------------------------------------------------------------------ */
/* Cart                                                                */
/* ------------------------------------------------------------------ */

const carts = new Map();

function getCart(sid) {
  if (!carts.has(sid)) carts.set(sid, { lines: [], note: '' });
  return carts.get(sid);
}

function lineKey(variantId, props) {
  const h = crypto.createHash('md5').update(JSON.stringify(props || {})).digest('hex').slice(0, 12);
  return `${variantId}:${h}`;
}

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
  const cleanProps = {};
  for (const [k, v] of Object.entries(props || {})) if (v !== '') cleanProps[k] = v;
  const key = lineKey(variant.id, cleanProps);
  const existing = cart.lines.find((l) => l.key === key);
  const inCart = cart.lines.filter((l) => l.variant_id === variant.id).reduce((n, l) => n + l.quantity, 0);
  if (variant.inventory_management === 'shopify' && variant.inventory_policy === 'deny' && inCart + qty > variant.inventory_quantity) {
    const left = Math.max(0, variant.inventory_quantity - inCart);
    if (left === 0) throw cartError(422, `You can't add more ${product.title} - ${variant.title} to the cart.`);
    qty = left;
  }
  if (existing) existing.quantity += qty;
  else cart.lines.push({ key, variant_id: variant.id, quantity: qty, properties: cleanProps });
  return key;
}

function changeLine(cart, data, keyOrLine, qty) {
  let line;
  if (typeof keyOrLine === 'number') line = cart.lines[keyOrLine - 1];
  else line = cart.lines.find((l) => l.key === keyOrLine || String(l.variant_id) === String(keyOrLine));
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
  const items = cart.lines.map((l, i) => {
    const { product, variant } = findVariant(data, l.variant_id);
    const image = variant.featured_image || product.featured_image;
    return {
      key: l.key,
      id: variant.id,
      index: i + 1,
      quantity: l.quantity,
      title: product.has_only_default_variant ? product.title : `${product.title} - ${variant.title}`,
      product,
      variant,
      variant_id: variant.id,
      product_id: product.id,
      url: `${product.url}?variant=${variant.id}`,
      image,
      properties: l.properties,
      price: variant.price,
      final_price: variant.price,
      original_price: variant.price,
      line_price: variant.price * l.quantity,
      final_line_price: variant.price * l.quantity,
      original_line_price: variant.price * l.quantity,
      requires_shipping: variant.requires_shipping,
      url_to_remove: `/cart/change?line=${i + 1}&quantity=0`,
      line_level_discount_allocations: [],
      selling_plan_allocation: null,
    };
  });
  return {
    items,
    item_count: items.reduce((n, it) => n + it.quantity, 0),
    total_price: items.reduce((n, it) => n + it.final_line_price, 0),
    original_total_price: items.reduce((n, it) => n + it.final_line_price, 0),
    note: cart.note,
    currency: { iso_code: 'USD' },
    cart_level_discount_applications: [],
    requires_shipping: items.some((it) => it.requires_shipping),
  };
}

function cartJSON(drop) {
  return {
    token: 'preview',
    note: drop.note,
    item_count: drop.item_count,
    total_price: drop.total_price,
    currency: 'USD',
    requires_shipping: drop.requires_shipping,
    items: drop.items.map((it) => ({
      key: it.key, id: it.id, variant_id: it.id, product_id: it.product_id, quantity: it.quantity,
      title: it.title, product_title: it.product.title, variant_title: it.variant.title,
      price: it.price, line_price: it.line_price, final_line_price: it.final_line_price,
      properties: it.properties, requires_shipping: it.requires_shipping, url: it.url,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
  }));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function parseMultipart(buf, boundary) {
  const out = [];
  const parts = buf.toString('utf8').split(`--${boundary}`);
  for (const part of parts) {
    const m = part.match(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/);
    if (m) out.push([m[1], m[2]]);
  }
  return out;
}

async function parseForm(req) {
  const buf = await readBody(req);
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) {
    const json = JSON.parse(buf.toString('utf8') || '{}');
    return { json, pairs: Object.entries(json) };
  }
  if (type.includes('multipart/form-data')) {
    const boundary = type.split('boundary=')[1];
    return { pairs: parseMultipart(buf, boundary) };
  }
  return { pairs: Array.from(new URLSearchParams(buf.toString('utf8')).entries()) };
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

const MIME = {
  '.css': 'text/css', '.js': 'application/javascript', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
};

function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function previewHeader(mode) {
  const link = (m, label) => `<a href="?fixture=${m}" style="color:inherit;${m === mode ? 'font-weight:700;text-decoration:underline' : ''}">${label}</a>`;
  return `<script>
document.addEventListener('DOMContentLoaded',function(){
  var b=document.createElement('div');
  b.setAttribute('data-preview-bar','');
  b.style.cssText='font:500 11px/1.35 system-ui,sans-serif;background:#fff3b0;color:#3a3000;padding:4px 12px;display:flex;gap:4px 12px;flex-wrap:wrap;justify-content:center;border-bottom:1px solid #d8c66a';
  b.innerHTML='<span><strong>Local preview</strong> · real catalog · sample shows are fixtures, not real events</span><span>Shows: ${link('full', 'several')} · ${link('one', 'one')} · ${link('none', 'none')}</span>';
  if(!/[?&]bar=0/.test(location.search)) document.body.insertBefore(b,document.body.firstChild);
});
</script>`;
}

async function renderPage(req, res, ctx) {
  const { pathname, query } = ctx;
  const data = ctx.data;
  const cart = cartDrop(ctx.cart, data);
  const page = { data, settingsOverrides: {} };
  let template = '404';
  let status = 200;
  const objects = { product: null, collection: null, page: null, search: null, recommendations: null };
  let pageType = '404';
  let pageTitle = 'Page not found';

  let m;
  if (pathname === '/') { template = 'index'; pageType = 'index'; pageTitle = fixtures.shop.name; }
  else if ((m = pathname.match(/^\/(?:collections\/[\w-]+\/)?products\/([\w-]+)$/))) {
    const p = data.byHandle[m[1]];
    if (p) {
      const selected = (query.variant && p.variants.find((v) => String(v.id) === query.variant)) || p.variants.find((v) => v.available) || p.variants[0];
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
      if (avail != null) products = products.filter((p) => (avail === '1' ? p.available : !p.available));
      c = { ...c, products, products_count: products.length, sort_by: query.sort_by || null };
      objects.collection = c;
      template = c.template_suffix ? `collection.${c.template_suffix}` : 'collection';
      pageType = 'collection'; pageTitle = c.title;
    }
  } else if (pathname === '/collections') { template = 'list-collections'; pageType = 'list-collections'; pageTitle = 'Collections'; }
  else if (pathname === '/cart') { template = 'cart'; pageType = 'cart'; pageTitle = 'Your cart'; }
  else if (pathname === '/search') {
    const terms = (query.q || '').trim();
    const t = terms.toLowerCase();
    const results = terms ? data.products.filter((p) => (p.title + ' ' + p.tags.join(' ') + ' ' + p.description).toLowerCase().includes(t)).map((p) => ({ ...p, object_type: 'product' })) : [];
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
  if (template === '404' && pageType === '404') status = 404;

  const settings = globalSettings(page);
  const routes = {
    root_url: '/', cart_url: '/cart', cart_add_url: '/cart/add', cart_change_url: '/cart/change',
    cart_update_url: '/cart/update', search_url: '/search', collections_url: '/collections',
    all_products_collection_url: '/collections/all', product_recommendations_url: '/recommendations/products',
    account_url: '/account', predictive_search_url: '/search/suggest',
  };
  const tparts = template.split('.');
  page.globals = {
    __page: page,
    settings,
    shop: fixtures.shop,
    cart,
    routes,
    localization: fixtures.localization,
    linklists: data.linklists,
    collections: data.collections,
    all_products: data.byHandle,
    pages: fixtures.pages,
    request: { page_type: pageType, path: pathname, design_mode: false, locale: { iso_code: 'en' }, origin: `http://localhost:${PORT}`, __query: query },
    template: { name: tparts[0], suffix: tparts[1] || null },
    canonical_url: `http://localhost:${PORT}${pathname}`,
    page_title: pageTitle,
    page_description: objects.product ? objects.product.description.replace(/<[^>]+>/g, '').slice(0, 160) : '',
    content_for_header: previewHeader(ctx.mode),
    additional_checkout_buttons: false,
    current_page: 1,
    customer: null,
    ...objects,
  };

  // Section Rendering API
  const ids = (query.sections || query.section_id || '').split(',').filter(Boolean);
  if (ids.length) {
    const out = {};
    for (const id of ids) out[id] = await renderSectionById(id, template, page);
    if (query.section_id) return send(res, 200, out[ids[0]] || '');
    return send(res, 200, JSON.stringify(out), 'application/json');
  }

  const { html: body, layout } = await renderTemplate(template, page);
  page.globals.content_for_layout = body;
  const html = await engine.parseAndRender(read(`layout/${layout}.liquid`), {}, { globals: page.globals });
  send(res, status, html);
}

async function renderSectionById(id, template, page) {
  const m = id.match(/^template--[\w-]+__(\w+)$/);
  if (m) {
    const conf = readJSON(`templates/${template}.json`);
    const s = conf.sections[m[1]];
    if (s) return renderSection(id, s.type, s, page);
  }
  // Bare section type (e.g. product-recommendations requested by section_id)
  const bare = id.replace(/^template--[\w-]+__/, '');
  for (const t of [template, 'product', 'index', 'cart']) {
    const conf = exists(`templates/${t}.json`) ? readJSON(`templates/${t}.json`) : null;
    if (!conf) continue;
    const key = Object.keys(conf.sections).find((k) => k === bare || conf.sections[k].type === bare);
    if (key) return renderSection(id, conf.sections[key].type, conf.sections[key], page);
  }
  if (exists(`sections/${bare}.liquid`)) return renderSection(id, bare, {}, page);
  return null;
}

function buildData(mode) {
  const c = fixtures.catalog(mode);
  return {
    ...c,
    linklists: fixtures.linklists,
    byHandle: Object.fromEntries(c.products.map((p) => [p.handle, p])),
  };
}

function checkoutStub(cartDrop_) {
  const rows = cartDrop_.items.map((it) => `<tr><td>${it.product.title}</td><td>${it.variant.title}</td><td>${it.quantity}</td><td>${Object.entries(it.properties).map(([k, v]) => `${k}: ${v}`).join('<br>') || '—'}</td><td>${it.requires_shipping ? 'yes' : 'no'}</td><td>${money(it.final_line_price)}</td></tr>`).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Checkout handoff (preview stub)</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 16px">
<h1 data-checkout-stub>Checkout handoff reached</h1>
<p>On a real store this is Shopify Checkout. The preview stops here so no order is placed. This is the cart Shopify would receive:</p>
<table border="1" cellpadding="8" style="border-collapse:collapse;width:100%"><tr><th>Product</th><th>Variant</th><th>Qty</th><th>Line properties</th><th>Ships</th><th>Total</th></tr>${rows}</table>
<p><strong>Subtotal ${money(cartDrop_.total_price)}</strong>${cartDrop_.note ? ` · Note: ${cartDrop_.note}` : ''}</p>
<p><a href="/cart">Back to cart</a></p></body>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname.replace(/\/$/, '') || '/';
    const query = parsed.query;
    const cookies = parseCookies(req);
    let sid = cookies.fc_sid;
    const setCookies = [];
    if (!sid) { sid = crypto.randomBytes(8).toString('hex'); setCookies.push(`fc_sid=${sid}; Path=/`); }
    let mode = cookies.fc_fixture || 'full';
    if (query.fixture && ['full', 'one', 'none'].includes(query.fixture)) { mode = query.fixture; setCookies.push(`fc_fixture=${mode}; Path=/`); }
    if (setCookies.length) res.setHeader('Set-Cookie', setCookies);

    const data = buildData(mode);
    const cart = getCart(sid);
    const ctx = { pathname, query, data, cart, mode };

    if (pathname.startsWith('/assets/')) {
      const file = path.join(THEME, 'assets', path.basename(pathname));
      if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain');
      return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
    }
    if (pathname.startsWith('/fonts/')) {
      const file = path.join(__dirname, 'node_modules/@fontsource/inter/files', path.basename(pathname));
      if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain');
      return send(res, 200, fs.readFileSync(file), 'font/woff2', { 'Cache-Control': 'max-age=3600' });
    }

    const json = pathname.endsWith('.js');
    const route = pathname.replace(/\.js$/, '');

    if (route === '/cart/add' && req.method === 'POST') {
      const { pairs, json: body } = await parseForm(req);
      try {
        if (body && Array.isArray(body.items)) body.items.forEach((it) => addToCart(cart, data, it.id, it.quantity || 1, it.properties));
        else { const a = pairsToAdd(pairs); addToCart(cart, data, a.id, a.quantity, a.properties); }
      } catch (e) {
        if (json) return send(res, e.status || 422, JSON.stringify(e.body), 'application/json');
        return send(res, 302, '', 'text/plain', { Location: '/cart' });
      }
      if (json) return send(res, 200, JSON.stringify(cartJSON(cartDrop(cart, data)).items.slice(-1)[0]), 'application/json');
      return send(res, 302, '', 'text/plain', { Location: '/cart' });
    }

    if ((route === '/cart/change' || route === '/cart/update') && (req.method === 'POST' || query.line)) {
      let body = {};
      let pairs = [];
      if (req.method === 'POST') ({ json: body = {}, pairs } = await parseForm(req));
      else body = { line: parseInt(query.line, 10), quantity: parseInt(query.quantity, 10) };
      let error = null;
      try {
        if (route === '/cart/change') {
          const target = body.line ? parseInt(body.line, 10) : body.id;
          changeLine(cart, data, target, parseInt(body.quantity, 10));
        } else {
          if (body.note != null) cart.note = String(body.note);
          const updates = pairs.filter(([k]) => k === 'updates[]').map(([, v]) => parseInt(v, 10));
          if (updates.length) {
            const keys = cart.lines.map((l) => l.key);
            updates.forEach((q, i) => { if (keys[i]) changeLine(cart, data, keys[i], q); });
          }
          const note = pairs.find(([k]) => k === 'note');
          if (note) cart.note = note[1];
          if (pairs.some(([k]) => k === 'checkout')) return send(res, 302, '', 'text/plain', { Location: '/checkout' });
        }
      } catch (e) { error = e; }
      if (!json) return send(res, 302, '', 'text/plain', { Location: '/cart' });
      if (error) return send(res, error.status || 422, JSON.stringify(error.body), 'application/json');
      const out = cartJSON(cartDrop(cart, data));
      if (body.sections) {
        out.sections = {};
        const sectionsUrl = body.sections_url || '/cart';
        const list = Array.isArray(body.sections) ? body.sections : String(body.sections).split(',');
        const fakeReq = { ...ctx, pathname: sectionsUrl, query: {} };
        for (const id of list) {
          const pg = { data, settingsOverrides: {} };
          // render in cart context
          const collect = {};
          await renderPage(req, { writeHead() {}, end(b) { collect.b = b; } }, { ...fakeReq, query: { sections: id } });
          out.sections[id] = JSON.parse(collect.b || '{}')[id] || null;
          void pg;
        }
      }
      return send(res, 200, JSON.stringify(out), 'application/json');
    }

    if (route === '/cart' && req.method === 'POST') {
      const { pairs } = await parseForm(req);
      const updates = pairs.filter(([k]) => k === 'updates[]').map(([, v]) => parseInt(v, 10));
      const keys = cart.lines.map((l) => l.key);
      try { updates.forEach((q, i) => { if (keys[i]) changeLine(cart, data, keys[i], q); }); } catch (e) { /* clamp */ }
      const note = pairs.find(([k]) => k === 'note');
      if (note) cart.note = note[1];
      if (pairs.some(([k]) => k === 'checkout')) return send(res, 302, '', 'text/plain', { Location: '/checkout' });
      return send(res, 302, '', 'text/plain', { Location: '/cart' });
    }
    if (route === '/cart' && json) return send(res, 200, JSON.stringify(cartJSON(cartDrop(cart, data))), 'application/json');
    if (pathname === '/checkout') return send(res, 200, checkoutStub(cartDrop(cart, data)));
    if (pathname === '/localization' && req.method === 'POST') return send(res, 302, '', 'text/plain', { Location: req.headers.referer || '/' });
    if (pathname === '/__reset') { carts.delete(sid); return send(res, 302, '', 'text/plain', { Location: '/' }); }

    await renderPage(req, res, ctx);
  } catch (err) {
    console.error(err);
    send(res, 500, `<pre>${String(err && err.stack).replace(/</g, '&lt;')}</pre>`);
  }
});

server.listen(PORT, () => console.log(`Full Circle preview on http://localhost:${PORT}`));
