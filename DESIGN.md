# Albert Collects — design system

## Brand overview

Albert Collects sells single Pokémon cards (mostly Japanese, many vintage, some graded slabs) curated by Albert, a collector in Orlando, FL who goes to card shows and likes talking about the details of individual cards. Buyers are collectors: some chasing a specific card, some buying their first single. They need to trust what they see — the edges, corners, surface and foil of the exact copy — before they pay.

The site should feel like being handed a collector's best binder: you slow down for one card, look closely, and then want to turn the page.

## Design thesis

**One card at a time, on a clean white pocket, inside a warm binder.** The photos are never altered; everything around them (cocoa binder cover, cream page, holographic edge on the frame) does the storytelling.

## Colors

Primitives (never used directly in components):

| Name | Value | Token |
| --- | --- | --- |
| Cocoa 950 | `#1E1210` | `--cocoa-950` |
| Cocoa 900 | `#2B1B17` | `--cocoa-900` |
| Cocoa 800 | `#3A2621` | `--cocoa-800` |
| Cocoa 600 | `#6A5248` | `--cocoa-600` |
| Cream 50 | `#FBF8F2` | `--cream-50` |
| Cream 100 | `#F4EEE3` | `--cream-100` |
| Cream 200 | `#E9E0D1` | `--cream-200` |
| Cream 300 | `#D9CCB8` | `--cream-300` |
| White | `#FFFFFF` | `--white` |
| Star | `#F2BE45` | `--star` |
| Lavender | `#B48AE6` | `--lavender` |
| Brick | `#A8321F` | `--brick` |

Semantic roles (the only names component CSS uses):

| Role | Points to | Use |
| --- | --- | --- |
| `--b-surface` | Cream 100 | Binder page, default background |
| `--b-surface-raised` | Cream 50 | Panels, fact tables |
| `--b-pocket` | White | Behind every card photo (blends with the white scan margin) |
| `--b-cover` | Cocoa 900 | Header, footer, hero stage |
| `--b-on-surface` | Cocoa 900 | Body text on cream |
| `--b-muted` | Cocoa 600 | Secondary text on cream (6.2:1) |
| `--b-on-cover` | Cream 100 | Text on cocoa |
| `--b-on-cover-muted` | `#CDBFAE` | Secondary text on cocoa |
| `--b-rule` | Cream 300 | Hairlines, pocket borders |
| `--b-accent` | Star | Index-tab fills (chips, active tabs, primary button on cocoa) — always with cocoa text |
| `--b-critical` | Brick | Errors, sold-out marks (text passes 4.5:1 on cream) |
| `--b-holo` | gradient of `#F7A8D8 → #F2BE45 → #A6EFC0 → #8FD3FF → #B48AE6` | Frames and navigation details only |

Dawn's color schemes are mapped to the same values in `config/settings_data.json` so the cart drawer, forms and search inherit the palette.

## Typography

| Role | Family | Weight | Size (mobile → desktop) | Line height | Tracking |
| --- | --- | --- | --- | --- | --- |
| Display (hero, page titles) | Fraunces Variable (self-hosted `fraunces-display.woff2`, opsz 9–144, wght 100–900) | 560 | 4.2rem → 8.8rem (clamp) | 0.94 | -0.02em |
| Heading 2 | Fraunces Variable | 560 | 2.8rem → 4.4rem | 1.02 | -0.015em |
| Heading 3 / card name | Fraunces Variable | 600 | 2rem → 2.4rem | 1.08 | -0.01em |
| Body | Figtree (theme setting `type_body_font`) | 400 / 700 | 1.6rem → 1.7rem | 1.55 | 0 |
| Labels, nav | Figtree | 600 | 1.3rem | 1.3 | 0.04em, sentence case |
| Collector data (numbers, codes, prices in tables) | Theme setting `binder_mono_font` (Space Mono) | 400 / 500 | 1.3rem → 1.4rem | 1.35 | 0.01em |

Root font size is Dawn's 62.5% (1rem = 10px). Fallbacks: Fraunces → Georgia, "Times New Roman", serif. Figtree → its Shopify fallback stack (sans-serif). Mono → ui-monospace, Menlo, monospace. Headings use `text-wrap: balance`, prose `text-wrap: pretty`, measure ≤ 68ch.

## Spacing and composition

- Scale (px): 4, 8, 12, 16, 24, 32, 48, 72, 112 → `--s-1` … `--s-9`.
- Page max width 1320px; side gutter 16px phone, 32px tablet, 48px desktop.
- Section rhythm: `--s-8` (72px) desktop, `--s-7` (48px) phone between sections.
- Radius: pockets 14px, panels 18px, buttons 12px, chips 999px. Card photos: **no radius and no clipping** (corners must be judgeable).
- Shadows: one soft "lift" shadow for pockets (`0 1px 0 rgba(43,27,23,.06), 0 14px 30px -18px rgba(43,27,23,.35)`); none on text.
- Binder page detail: a column of three ring holes on the left edge of a binder page (desktop only), drawn with CSS.

## Components

- **Pocket**: white box with 1px `--b-rule` border, 14px radius, inner padding 6–10% so the scan's white margin disappears into it; subtle sleeve sheen as a top gradient line on the pocket, never over the photo.
- **Card tile** (catalog, shelves): pocket + name (Fraunces 600) + set · number (mono, muted) + condition chip + price (Figtree 700). Sold out: photo stays full color, "Sold" chip in brick text.
- **Condition chip**: pill, cream-50 fill, cocoa text, code in mono (e.g. `LP+`), a 6px dot whose shade darkens NM → DMG; on the product page it sits beside a "How we condition" link.
- **Primary button**: cocoa fill, cream text, 52px min height, 12px radius; on cocoa backgrounds it flips to star fill with cocoa text. Press: scale .97.
- **Secondary button**: 1.5px cocoa outline, transparent.
- **Header**: cocoa bar, logo mark + wordmark, nav links in cream; current link has a 2px holo underline. Phone: menu drawer (details/summary) with large links.
- **Footer**: cocoa, three columns (nav, help, small print), holo hairline at the top.
- **Fact table** (product): two-column definition list on cream-50, mono values.
- **Inputs**: 48px tall, white fill, 1.5px rule border, cocoa focus ring 2px offset.
- **Focus**: 2px solid `--b-on-surface` (or star on cocoa), 3px offset — always visible.

## Dos and don'ts

- Do show every card photo unfiltered, unclipped, at its real aspect ratio, on white.
- Do keep the holographic gradient on frames, rules and nav only — never over or behind a card at reduced opacity.
- Do write collector data in mono so numbers line up and read as catalog data.
- Do show only details the listing states; leave a field out rather than guess.
- Don't tilt, glare-sweep or recolor card images.
- Don't add eyebrow text, badges or decorative shapes for decoration's sake.
- Don't use italics; emphasize with weight or size.
- Don't describe shipping rates, inspection steps or guarantees the store hasn't confirmed.

## Motion philosophy

Calm and physical, like handling a sleeve: things slide a short distance and settle.

- Easing: `--ease-ui: cubic-bezier(.16,1,.3,1)` for small interactions, `--ease-drawer: cubic-bezier(.32,.72,0,1)` for surfaces.
- Durations: press 120ms, state 200ms, surfaces 300ms entry / 200ms exit, hero card change 420ms.
- Hero "next card": outgoing card slides left 24px and fades, incoming slides from the right and settles (WAAPI).
- Pocket hover (pointer devices): the pocket lifts 3px and its shadow deepens; the photo itself is untouched.
- Holo edges shift hue slowly only while hovered/focused.
- Grid reveal: one-shot 40ms stagger, capped at 8 items.
- `prefers-reduced-motion: reduce` → no animation at all, instant state changes.
