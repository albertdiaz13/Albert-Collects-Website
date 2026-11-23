# Full Circle theme — local preview

A stand-in for `shopify theme dev`, so you can review `../full-circle-theme` without
store credentials.

- **Renderer:** LiquidJS with Shopify's tags (`form`, `paginate`, `sections`, `style`,
  `schema`), filters (`image_url`, `image_tag`, `money`, `t`, `asset_url`,
  `font_face`, …) and objects.
- **Cart:** an in-memory cart that follows the Ajax Cart API (`/cart/add.js`,
  `/cart/change.js`, `/cart/update.js`, `/cart.js`). It enforces inventory and
  preserves line-item properties.
- **Section Rendering API:** supported.
- **Checkout:** stops at a stub page that shows exactly what would be handed to Shopify.

## Data

- Merchandise comes from the live public catalog (`fixtures/live-products.json`).
- **Shows are preview fixtures.** Each title starts with "Sample Show" and each venue
  says "sample venue". They are not part of the theme's settings or templates.
- The two collection assignments (merchandise and vending) are made in
  `server.js › globalSettings`. On the store, the merchant sets them in the theme
  editor.

## Commands

```bash
npm install
npm start      # http://localhost:9292
npm run check  # Shopify Theme Check
npm test       # browser journeys (with the server running)
```

To switch the sample show set, add `?fixture=full`, `?fixture=one` or `?fixture=none`
to any URL. The choice is remembered in a cookie.

- `?bar=0` hides the preview banner.
- `/__reset` empties the cart.
