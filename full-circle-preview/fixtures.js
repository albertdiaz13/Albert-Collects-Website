/* Preview fixtures for the Full Circle theme.
 *
 * MERCHANDISE comes from the live public catalog (fixtures/live-products.json, pulled from
 * https://fullcirclecollabs.com/products.json): titles, descriptions, options, prices,
 * availability and photos are real.
 *
 * SHOWS are PREVIEW FIXTURES. Full Circle has no event products yet, so every show below is
 * sample data used only to exercise the booking layouts and edge cases. Titles start with
 * "Sample" and venues say "sample venue" so they can never be mistaken for real events.
 * None of this is in the theme's settings_data.json or templates.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.FCFixtures = factory;
})(typeof self !== 'undefined' ? self : this, function createFixtures(live) {
'use strict';

const CDN = 'https://cdn.shopify.com';
let mediaSeq = 900000;

function cents(v) { return Math.round(parseFloat(v) * 100); }

function imageFrom(img, alt) {
  return {
    id: img.id,
    src: img.src,
    url: img.src,
    width: img.width,
    height: img.height,
    aspect_ratio: img.width / img.height,
    alt: alt || '',
    presentation: { focal_point: '50% 50%' },
    __image: true,
  };
}

function buildProduct(raw, extra = {}) {
  const images = (raw.images || []).map((i) => imageFrom(i, raw.title));
  const media = images.map((img, idx) => ({
    ...img,
    id: img.id || ++mediaSeq,
    media_type: 'image',
    position: idx + 1,
    preview_image: img,
  }));
  const options = raw.options.map((o) => o.name);
  const hasOnlyDefault = options.length === 1 && options[0] === 'Title' && raw.options[0].values[0] === 'Default Title';
  const inv = extra.inventory || {};
  const variants = raw.variants.map((v) => {
    const opts = [v.option1, v.option2, v.option3].filter((x) => x != null);
    const tracked = inv[v.id] !== undefined;
    const qty = tracked ? inv[v.id] : null;
    const available = tracked ? qty > 0 : !!v.available;
    let featured = null;
    if (v.featured_image) featured = media.find((m) => m.id === v.featured_image.id) || null;
    return {
      id: v.id,
      title: v.title,
      option1: v.option1, option2: v.option2, option3: v.option3,
      options: opts,
      price: cents(v.price),
      compare_at_price: v.compare_at_price ? cents(v.compare_at_price) : null,
      available,
      inventory_management: tracked ? 'shopify' : null,
      inventory_policy: 'deny',
      inventory_quantity: tracked ? qty : 0,
      requires_shipping: extra.requires_shipping !== undefined ? extra.requires_shipping : v.requires_shipping !== false,
      featured_media: featured,
      featured_image: featured,
      sku: v.sku || '',
      url: `/products/${raw.handle}?variant=${v.id}`,
    };
  });
  const prices = variants.map((v) => v.price);
  const product = {
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    url: `/products/${raw.handle}`,
    vendor: raw.vendor,
    type: raw.product_type || '',
    tags: raw.tags || [],
    description: raw.body_html || '',
    content: raw.body_html || '',
    available: variants.some((v) => v.available),
    price: Math.min(...prices),
    price_min: Math.min(...prices),
    price_max: Math.max(...prices),
    price_varies: Math.min(...prices) !== Math.max(...prices),
    compare_at_price: null,
    images,
    media,
    featured_image: images[0] || null,
    featured_media: media[0] || null,
    options,
    has_only_default_variant: hasOnlyDefault,
    variants,
    template_suffix: extra.template_suffix || null,
    metafields: extra.metafields || {},
    __fixture: !!extra.fixture,
  };
  product.selected_or_first_available_variant = variants.find((v) => v.available) || variants[0];
  product.selected_variant = null;
  product.options_with_values = raw.options.map((o, idx) => ({
    name: o.name,
    position: idx + 1,
    values: o.values,
    selected_value: product.selected_or_first_available_variant.options[idx],
  }));
  return product;
}

/* ---------- merchandise (real) ---------- */

const liveByHandle = Object.fromEntries(live.map((p) => [p.handle, p]));

const stickers = buildProduct(liveByHandle['custom-stickers'], {
  metafields: {
    custom: {
      // Preview values copied from the live product description. The merchant enters these
      // in Shopify (product metafields custom.price_unit and custom.order_instructions).
      price_unit: { type: 'single_line_text_field', value: 'per 100 stickers' },
      order_instructions: {
        type: 'multi_line_text_field',
        value: 'QR code back: the QR code must be sent through email after ordering.\nPrice is per 100 stickers.',
      },
    },
  },
});
const mpaa = buildProduct(liveByHandle['make-pokemon-affordable-again-hat']);
const scalper = buildProduct(liveByHandle['scalper-hat']);
const merch = [stickers, mpaa, scalper];

/* ---------- shows (PREVIEW FIXTURES) ---------- */

function eventRaw(id, handle, title, tiers, body) {
  return {
    id,
    handle,
    title,
    vendor: 'Full Circle Collaborations',
    product_type: 'Vending table',
    tags: ['vending-table', 'preview-fixture'],
    body_html: body || '',
    images: [],
    options: tiers.length === 1 && tiers[0].title === 'Default Title'
      ? [{ name: 'Title', values: ['Default Title'] }]
      : [{ name: 'Table', values: tiers.map((t) => t.title) }],
    variants: tiers.map((t) => ({ id: t.id, title: t.title, option1: t.title, price: t.price, available: true, requires_shipping: false })),
  };
}

function eventMeta(o) {
  const m = {};
  const put = (k, type, value) => { if (value != null && value !== '') m[k] = { type, value }; };
  put('starts_at', 'date_time', o.starts_at);
  put('ends_at', 'date_time', o.ends_at);
  put('venue', 'single_line_text_field', o.venue);
  put('city', 'single_line_text_field', o.city);
  put('address', 'multi_line_text_field', o.address);
  put('table_size', 'single_line_text_field', o.table_size);
  put('included', 'multi_line_text_field', o.included);
  put('load_in', 'multi_line_text_field', o.load_in);
  put('cancellation', 'multi_line_text_field', o.cancellation);
  put('vendor_fields', 'list.single_line_text_field', o.vendor_fields);
  return { event: m };
}

/* ORS TCG Trade Nights — one event product per Friday, as the merchant would set it up.
 * Event name, time (5:00–9:30 PM), venue and $60 table price come from the client brief.
 * PREVIEW SAMPLE DATA: the table counts below (and the past Nov 20 night) are invented for the
 * demo so the tables-left, sold-out and ended states are visible. The real counts come from
 * Shopify inventory once the products exist. */
const TRADE_NIGHT_BODY = '<p>Every Friday collectors meet at Orlando Racket Sports on Orange Blossom Trail to buy, sell and trade cards. Book a vending table to sell at this night.</p><p><em>Local preview: table counts are sample data.</em></p>';

function tradeNight(id, date, tablesLeft) {
  const raw = {
    id,
    handle: `ors-tcg-trade-nights-${date}`,
    title: 'ORS TCG Trade Nights',
    vendor: 'Full Circle Collaborations',
    product_type: 'Vending table',
    tags: ['vending-table', 'trade-night', 'preview-sample'],
    body_html: TRADE_NIGHT_BODY,
    images: [],
    options: [{ name: 'Title', values: ['Default Title'] }],
    variants: [{ id: id * 10 + 1, title: 'Default Title', option1: 'Default Title', price: '60.00', available: true, requires_shipping: false }],
  };
  // Eastern Standard Time in late November and December: UTC−5.
  return buildProduct(raw, {
    fixture: true,
    template_suffix: 'event',
    requires_shipping: false,
    inventory: { [id * 10 + 1]: tablesLeft },
    metafields: eventMeta({
      starts_at: `${date}T17:00:00-05:00`,
      ends_at: `${date}T21:30:00-05:00`,
      venue: 'Orlando Racket Sports',
      city: 'Orange Blossom Trail',
    }),
  });
}

const fridays = [
  tradeNight(800001120, '2026-11-20', 2),  // past night with leftover tables: shows the ended state
  tradeNight(800001127, '2026-11-27', 3),  // low: highlighted "3 tables left"
  tradeNight(800001204, '2026-12-04', 9),
  tradeNight(800001211, '2026-12-11', 0),  // sold out
  tradeNight(800001218, '2026-12-18', 14),
];

const EVENT_SETS = {
  full: [fridays[3], fridays[0], fridays[1], fridays[4], fridays[2]], // deliberately unsorted
  one: [fridays[1]],
  none: [],
};

function catalog(mode) {
  const events = EVENT_SETS[mode] || EVENT_SETS.full;
  const products = [...merch, ...events];
  const col = (handle, title, prods, extra = {}) => ({
    id: handle.length * 1000 + prods.length,
    handle,
    title,
    url: `/collections/${handle}`,
    description: extra.description || '',
    products: prods,
    products_count: prods.length,
    all_products_count: prods.length,
    template_suffix: extra.template_suffix || null,
    filters: extra.filters || [],
    sort_options: [
      { value: 'manual', name: 'Featured' },
      { value: 'price-ascending', name: 'Price, low to high' },
      { value: 'price-descending', name: 'Price, high to low' },
      { value: 'title-ascending', name: 'Alphabetically, A–Z' },
    ],
    default_sort_by: 'manual',
    __fixture: !!extra.fixture,
  });
  const collections = {
    // Real public collections (binder collections are empty on the live storefront).
    frontpage: col('frontpage', 'Hats', [scalper, mpaa]),
    'mini-binders': col('mini-binders', 'Mini', []),
    'sleeved-binders': col('sleeved-binders', 'Sleeve', []),
    'top-loaders': col('top-loaders', 'Top Loader', []),
    // Setup the merchant performs (documented): a curated merchandise collection…
    shop: col('shop', 'Shop all', merch, {
      fixture: true,
      filters: [{
        type: 'list', label: 'Availability', param_name: 'filter.v.availability',
        active_values: [],
        values: [
          { label: 'In stock', value: '1', param_name: 'filter.v.availability', count: merch.filter((p) => p.available).length, active: false },
          { label: 'Out of stock', value: '0', param_name: 'filter.v.availability', count: merch.filter((p) => !p.available).length, active: false },
        ],
      }],
    }),
    // …and a vending collection using the collection.vending template.
    'vending-tables': col('vending-tables', 'Vending tables', events, {
      fixture: true,
      template_suffix: 'vending',
      description: '<p>Each show is listed with its date, venue and table options. Book a table and pay at checkout.</p><p><em>Local preview: every show on this page is a sample fixture, not a real event.</em></p>',
    }),
    all: col('all', 'Products', products),
  };
  return { products, events, merch, collections };
}

const linklists = {
  'main-menu': {
    handle: 'main-menu',
    title: 'Main menu',
    links: [
      { title: 'Mini binders', url: '/collections/mini-binders' },
      { title: 'Top loader binders', url: '/collections/top-loaders' },
      { title: 'Sleeved binders', url: '/collections/sleeved-binders' },
      { title: 'Contact', url: '/pages/contact' },
    ],
  },
  footer: { handle: 'footer', title: 'Footer menu', links: [{ title: 'Hats', url: '/collections/frontpage' }] },
};

const pages = {
  contact: { handle: 'contact', title: 'Contact', content: '', url: '/pages/contact', template_suffix: 'contact' },
};

const shop = {
  name: 'Full Circle Collaborations',
  description: '',
  email: null,
  url: 'http://localhost',
  money_format: '${{amount}}',
  money_with_currency_format: '${{amount}} USD',
  currency: 'USD',
  policies: [{ title: 'Privacy policy', url: '/policies/privacy-policy', handle: 'privacy-policy', body: '<p>Privacy policy text lives in Shopify settings.</p>' }],
  enabled_payment_types: ['american_express', 'apple_pay', 'discover', 'google_pay', 'master', 'paypal', 'shopify_pay', 'venmo', 'visa'],
  password_message: '',
};

const localization = {
  country: { iso_code: 'US', name: 'United States', currency: { iso_code: 'USD', symbol: '$' } },
  available_countries: [
    { iso_code: 'AU', name: 'Australia', currency: { iso_code: 'AUD', symbol: '$' } },
    { iso_code: 'CA', name: 'Canada', currency: { iso_code: 'CAD', symbol: '$' } },
    { iso_code: 'US', name: 'United States', currency: { iso_code: 'USD', symbol: '$' } },
  ],
};

return { catalog, linklists, pages, shop, localization, CDN };
});
