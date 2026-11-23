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

// Sample show dates are relative to today so the preview never goes stale.
// Times are fixed in UTC (15:00Z ≈ 10 AM Eastern); good enough for a fixture.
function daysFromNow(days, hourUTC) {
  const d = new Date();
  d.setUTCHours(hourUTC, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().replace('.000Z', 'Z');
}

const FIXTURE_NOTE = '<p><strong>Preview fixture.</strong> This sample show exists only in the local preview to demonstrate the booking page. It is not a real event.</p>';

const showOpen = buildProduct(
  eventRaw(800000001, 'sample-winter-card-show', 'Sample Show: Card & Collectibles Expo', [
    { id: 810000011, title: 'Standard table', price: '60.00' },
    { id: 810000012, title: 'Corner table', price: '85.00' },
  ], FIXTURE_NOTE),
  {
    fixture: true,
    template_suffix: 'event',
    requires_shipping: false,
    inventory: { 810000011: 4, 810000012: 0 },
    metafields: eventMeta({
      starts_at: daysFromNow(20, 15),
      ends_at: daysFromNow(20, 21),
      venue: 'Fixture Hall (sample venue)',
      city: 'Sample City',
      address: '100 Example Avenue',
      table_size: 'Sample value: 6 ft × 30 in',
      included: 'Sample value: one table and two chairs.',
      load_in: 'Sample value: vendor load-in opens 8:30 AM.',
      cancellation: 'Sample value: the merchant writes their real cancellation terms here.',
    }),
  }
);

const showVendor = buildProduct(
  eventRaw(800000002, 'sample-spring-convention', 'Sample Show: Collectors Convention & Trade Night at the Riverside Exhibition Pavilion', [
    { id: 810000021, title: 'Standard table', price: '55.00' },
    { id: 810000022, title: 'Double table', price: '100.00' },
  ], FIXTURE_NOTE),
  {
    fixture: true,
    template_suffix: 'event',
    requires_shipping: false,
    inventory: { 810000021: 18, 810000022: 6 },
    metafields: eventMeta({
      starts_at: daysFromNow(62, 14),
      ends_at: daysFromNow(62, 20),
      venue: 'Fixture Pavilion (sample venue)',
      city: 'Sample City',
      vendor_fields: ['Business name', 'Instagram or website'],
    }),
  }
);

const showSoldOut = buildProduct(
  eventRaw(800000003, 'sample-february-swap', 'Sample Show: Card Swap', [
    { id: 810000031, title: 'Standard table', price: '50.00' },
    { id: 810000032, title: 'Corner table', price: '70.00' },
  ], FIXTURE_NOTE),
  {
    fixture: true,
    template_suffix: 'event',
    requires_shipping: false,
    inventory: { 810000031: 0, 810000032: 0 },
    metafields: eventMeta({
      starts_at: daysFromNow(90, 16),
      ends_at: daysFromNow(90, 22),
      venue: 'Fixture Center (sample venue)',
      city: 'Sample City',
    }),
  }
);

const showPast = buildProduct(
  eventRaw(800000004, 'sample-october-show', 'Sample Show: Last Season’s Card Show', [
    { id: 810000041, title: 'Standard table', price: '50.00' },
  ], FIXTURE_NOTE),
  {
    fixture: true,
    template_suffix: 'event',
    requires_shipping: false,
    inventory: { 810000041: 3 },
    metafields: eventMeta({
      starts_at: daysFromNow(-36, 14),
      ends_at: daysFromNow(-36, 20),
      venue: 'Fixture Hall (sample venue)',
      city: 'Sample City',
    }),
  }
);

const EVENT_SETS = {
  full: [showVendor, showOpen, showSoldOut, showPast], // intentionally unsorted
  one: [showOpen],
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
