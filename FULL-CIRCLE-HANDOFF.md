# Full Circle Collaborations — theme handoff

The theme is in `full-circle-theme/`. It is a Shopify Online Store 2.0 theme for
https://fullcirclecollabs.com (store `gixi0d-jz.myshopify.com`). The rest of this
repository holds the separate Albert Collects theme, which this work did not touch.

`full-circle-preview/` contains three tools: a local preview server, the Theme Check
runner, and an end-to-end browser test.

Nothing was pushed to the Full Circle store, and the live theme (Spotlight 15.3.0) and
catalog were not changed. The work used only the store's public pages and public
`products.json`.

## What the store looks like today (inspected 2026-11-23)

- **Products:** 3 public products. Custom Stickers is $30–35 per 100 stickers. Its
  options are Backing (QR code / Plain), Laminate (Holographic / Regular) and Shape (Die
  cut / Circle). There are also two $20 hats, and both are sold out.
- **Collections:** Hats (`frontpage`), Mini (`mini-binders`), Sleeve (`sleeved-binders`)
  and Top Loader (`top-loaders`). The three binder collections are empty on the public
  storefront. The theme hides empty collection links unless you turn on **Shop ›
  Show collection links with no products**.
- **Booking:** there is no booking app and there are no event products. The theme adds
  a Shopify-native booking model, described below.
- **Apps:** the Easify Product Options app embed is installed and is used on a hat.
  App embeds still load, and the product page supports app blocks. Check that the
  widget appears on the development theme (see step 2).
- **Policies:** only the privacy policy is published. The footer lists policies
  automatically once you add them under Settings › Policies.
- **Social:** no social links are set. A sticker photo shows the handle
  `@FULLCIRCLECOLLABORATIONS`. Confirm the URL before adding it in Theme settings ›
  Social media.

## Preview it

**Locally** (no store access needed). This uses the real public catalog plus clearly
labeled sample shows:

```bash
cd full-circle-preview && npm install && npm start
```

Open http://localhost:9292. The yellow bar at the top switches between several shows,
one show and no shows. Checkout stops at a stub page that shows the cart Shopify would
receive.

To run the checks:

```bash
npm run check   # Shopify Theme Check (0 offenses)
npm test        # 27 browser checks covering both journeys and edge cases (server must be running)
```

**On the Full Circle store.** This needs a staff or collaborator account with theme
permissions:

```bash
shopify theme push --store gixi0d-jz.myshopify.com --path full-circle-theme --unpublished
```

You can also run `shopify theme dev --store gixi0d-jz.myshopify.com --path full-circle-theme`
for a hot-reloading preview. Either way the theme goes up as an unpublished copy, and
the live theme stays as it is.

## Setup before client review (one time, in Shopify admin)

1. **Metafield definitions.** Add these under Settings › Custom data › Products.

   | Namespace and key | Type | Used for |
   |---|---|---|
   | `custom.price_unit` | Single line text | "per 100 stickers" beside prices |
   | `custom.order_instructions` | Multi-line text or rich text | The "Before you order" box above Add to cart. Put the artwork and QR submission steps here, including the email address to send to. |
   | `event.starts_at` | Date and time | Show date and start time. **Required for scheduling.** |
   | `event.ends_at` | Date and time | End time. Booking closes after this. |
   | `event.venue` | Single line text | Venue name |
   | `event.address` | Multi-line text | Street address. Also used for the Map link. |
   | `event.city` | Single line text | City |
   | `event.table_size` | Single line text | Table dimensions |
   | `event.included` | Multi-line text | What's included |
   | `event.load_in` | Multi-line text | Load-in instructions |
   | `event.cancellation` | Multi-line text or rich text | Cancellation terms |
   | `event.vendor_fields` | List of single line text | Optional. Each entry becomes a required field, such as "Business name". |
   | `event.map_url` | URL | Optional. Overrides the generated map link. |

   The page leaves out any field that is empty.

2. **Collections.**
   - **Vending tables.** Create an automated collection with the rule *Product type is
     Vending table*. Set its theme template to `collection.vending`.
   - **Shop all.** Create an automated collection with the rule *Product type is not
     equal to Vending table*. This keeps tables out of the merchandise grid and keeps
     product counts and pages accurate.
   - In **Theme settings › Shop & booking**, choose both collections and the inquiries
     link (it defaults to `/pages/contact`).
3. **Check the Easify widget** on the hat it applies to, then on Custom Stickers.

## Add the next show (no code, homepage untouched)

1. Go to Products › Add product. Use the real show name as the title. Set **Product
   type** to `Vending table`, and set **Theme template** to `product.event`.
2. Add an option named **Table** with one value per tier that is actually different,
   such as Standard table and Corner table. Give each tier its own price.
3. For each variant:
   - Turn **Track quantity** on.
   - Turn **Continue selling when out of stock** off.
   - Set the quantity to the number of tables.
   - Turn **This is a physical product** off, so there is no shipping.
   - Review the tax setting.
4. Fill in the `event.*` metafields. A product image is optional. If you add one, such as
   a show flyer, it appears in the brush circle. Without one, the page shows the date set
   large in the circle.
5. Save. The show appears in the schedule, on the homepage and in the header route,
   sorted by date. Sold-out tiers and shows update from inventory on their own.
6. **After the show,** set the remaining inventory to 0, or set the product to Draft. The
   theme hides past shows and closes booking itself. Shopify checkout does not know show
   dates, though, so a saved cart or a direct cart link could still buy leftover tables
   until inventory is zero.

## Safeguards that need Shopify settings, not just the theme

- **Shopify is the inventory authority.** Checkout refuses quantities beyond stock only
  when **Track quantity** is on and **Continue selling** is off for every table variant.
- **Adding to cart does not hold a table.** Shopify reserves stock only when the order
  is placed. The theme says so on the show page, in the toast message and in the cart.
  You can edit the cart wording under Theme settings › Cart.
- **No shipping** depends on each table variant being non-physical.
- **Vendor details** are line item properties. They appear on the order and stay on
  the cart line when the quantity changes. The theme requires them before adding to cart.
  A cart built outside the storefront could skip them.
- **Refund and cancellation policies** are not published yet. Add them under Settings ›
  Policies.

## Day-to-day editing (Online Store › Customize)

- **Feature different merchandise:** in the Shop section, choose a collection and a
  number of products. You can also reorder products inside the collection. The
  collection chips are blocks.
- **Replace the hero art:**
  - Go to **Hero › Circle image** and set the focal point in the image editor. Use a real
    product or show photo.
  - **Breakout cutout** is optional. Use a transparent PNG of one item from that photo,
    and place it with the X, Y and size sliders so it crosses the brush edge.
  - With no image chosen, the hero uses the bundled holographic-sticker photo.
- **Edit the text:** headline, supporting text and both button labels or links are in
  the Hero section. The Shop and Book labels are in Theme settings.
- **Change the logos:** go to Theme settings › Brand. The theme ships with transparent
  versions of the supplied logo, made from the client's files:
  - the full lockup, used in the footer
  - the mark alone, without the hand lettering, used in the header beside the typeset
    name so it stays readable at small sizes
  - the outer ring, the ink stroke and the crimson ring, used as design accents

  **Ask the client to approve the mark-only version.**
- **Motion:** turn it off under Theme settings › Motion. Visitors who ask their device for
  reduced motion always get a static site.

## Verified in a browser (local preview) vs. still needs the dev store

**Verified locally:**

- Desktop at 1440 px; tablet at 768 px; phones at 390 px and 320 px.
- Both journeys, through to the checkout handoff:
  - homepage → collection → stickers (variant pricing $35 → $30, unit, instructions) →
    cart edits → checkout
  - homepage or header → schedule → show → table tier and quantity (capped at the
    tables left) → sticky booking bar → cart → checkout
- Vendor details survive cart edits, and a cart can hold tables and merchandise
  together.
- Edge cases: no shows, one show, several shows, a sold-out tier, an entirely sold-out
  show, and a past show with leftover inventory.
- Keyboard focus, reduced motion, theme-editor section reloads, and fast scrolling.

**Needs the dev store:**

- Real Liquid rendering. The local server uses LiquidJS with Shopify shims, and Theme
  Check passes.
- Real checkout, taxes and shipping.
- Inventory refusal by Shopify itself.
- The Easify widget.
- Font picker output.
- Product recommendations data.
- Dynamic checkout buttons.
- Currency switching in the country selector.

## Client demo revision (Friday trade nights)

### Homepage

The homepage runs top to bottom as:

- **Hero:** the animated logo.
- **Upcoming Shows:** one dated row per Friday, each with its own **Book now** link.
- **About Full Circle:** a short strip.
- **Shop:** the product grid.

The header's **About** link goes to `/#about`. You can change its label and link in Theme
settings › Shop & booking.

### The animated logo

The logo animation uses five layers, all cut from the supplied artwork on the same canvas:

| File | Layer |
|---|---|
| `fc-logo-ring.webp` | Brush ring |
| `fc-logo-stroke.webp` | Ink stroke |
| `fc-logo-crimson.webp` | Crimson mark |
| `fc-logo-text-black.webp` | Black lettering |
| `fc-logo-text-red.webp` | Red lettering |

Stacked, the layers rebuild the original. Under the crimson mark, the ink stroke is
filled with brush texture copied from the line beside it, so the line stays whole when the
mark rolls away.

Visitors who ask for reduced motion, or anyone with motion turned off, see the original
`fc-logo-hero.webp` as one image.

If you upload a different logo under **Hero › Logo**, that logo is shown with a simple fade
instead of the layered animation.

### Each Friday is its own event product

Set up one event product per Friday:

- **Title:** ORS TCG Trade Nights
- **Theme template:** `product.event`
- **Product type:** Vending table
- **Price:** $60 (one default variant)
- **Inventory:** Track quantity on, Continue selling when out of stock off, quantity = tables
  for that night
- **Shipping:** This is a physical product off
- **Metafields:** `event.starts_at` = that Friday at 5:00 PM, `event.ends_at` = 9:30 PM,
  `event.venue` = Orlando Racket Sports, `event.city` = Orange Blossom Trail

The calendar sorts the Fridays by date and shows tables left or "Sold out" from each date's
inventory. A Friday drops off once its end time passes.

### Sample data in the preview

All of this lives only in `full-circle-preview/fixtures.js`. None of it is in the theme
files or the ZIP.

- **Fridays:** Nov 27 and Dec 4, 11 and 18, 2026. The event name, time, venue and $60 price
  come from the client brief.
- **Table counts are invented for the demo:**

  | Friday | Tables in the preview | State shown |
  |---|---|---|
  | Nov 27 | 3 left | low |
  | Dec 4 | 9 left | available |
  | Dec 11 | 0 | sold out |
  | Dec 18 | 14 left | available |

- **Past night:** Nov 20, 2026, with 2 leftover tables, exists only to show the ended state
  on Book Vending Tables.
- **Merchandise:** still the real public catalog.

### Still needed from the client

- **An approved trade-night photo** for the About strip, added under **About › Event photo**.
  None was supplied, so the strip shows the brush mark for now.
- **The real table count** for each Friday.

## Public demo link

**URL:** https://full-circle-demo.albertdiaz13.workers.dev/

This is the same build as the private Claude preview. It is hosted as the Cloudflare Worker
`full-circle-demo` on the account `albertdiaz13@outlook.com`, using static assets.

**Demo mode:**

- The cart is kept in each visitor's own browser.
- Checkout stops at a "Checkout (simulated)" page.
- Nothing connects to Shopify, and no order or payment is possible.

**Who can open it:** anyone who has the link. There is no sign-in.

- The page sends `noindex` and the site's `robots.txt` blocks crawlers, so it should stay out of
  search results.
- To restrict it to named people, put Cloudflare Access in front of the Worker (Zero Trust ›
  Access › Applications).

**Expiry:** none. The link works until the Worker is deleted or disabled.

- To delete it: Workers & Pages › `full-circle-demo` › Settings › Delete.
- To keep the Worker but turn off its public URL: Settings › Domains & Routes, turn off
  workers.dev.

**Sharing a specific Friday:** add a `#name` to the URL. For example,
`…workers.dev/#p-ors-tcg-trade-nights-2026-12-04` opens the Dec 4 booking page.

**To update the demo:**

1. Run `npm run build:storefront`.
2. Run `node browser/build-public.js`. It writes `dist/public-demo` and its manifest.
3. Deploy with the Workers static-assets direct upload: open an upload session, upload each
   batch, then upload the Worker script. Alternatively, run
   `npx wrangler deploy --assets dist/public-demo --name full-circle-demo` with a Cloudflare API
   token.

**To check it:** `node browser/verify-public.js <url> <dir>` walks through the demo in fresh,
signed-out browsers at desktop and phone sizes.
