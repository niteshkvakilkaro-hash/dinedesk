# DineDesk website design system

How the public restaurant websites look and move, and where each piece lives. Every theme shares one page structure (`frontend/src/site/ui`). Themes differ through design tokens, a few layout switches and small extras.

## Files

| What | Where |
|---|---|
| Token types | `frontend/src/themes/types.ts` (`ThemeTokens`, `ThemeStyle`, `ThemeMotion`) |
| Tokens per theme | `frontend/src/themes/<theme>/tokens.ts`, `motion.ts`, `fonts.ts` |
| Tokens → CSS variables | `themeVars()` in `frontend/src/themes/registry.ts` writes `--t-*` on `.site-root` |
| Component styles | `frontend/src/site/ui/site.css` (`.s-*` classes, in `@layer components`) |
| Components and pages | `frontend/src/site/ui/*.tsx` |
| Server-side catalogue and contrast check | `backend/app/Modules/Website/Support/Themes.php` |
| Live style guide | `/style-guide` on any business site. It is not linked anywhere and is never indexed |

## Themes

| Theme | For | Colours (bg · ink · primary · accent) | Display / body (+ mono) | Look |
|---|---|---|---|---|
| Haveli Royal | Heritage, fine dining, hotels | `#FFF8E9` · `#2B2118` · `#641E16` · gold `#C9A45C` | Rozha One / Mukta | Split hero with an arched (jharokha) photo, gold double-line dividers, jaali lattice at 4–8 % |
| Ember | Grills, bars, premium dinners (dark) | `#0C0A09` · `#F3EEE8` · `#E8692C` · `#F0A35E` | Unbounded 600, uppercase / Geist (+ Geist Mono) | Full-bleed hero with a warm radial glow, glass cards, hairlines |
| Bistro Editorial | Cafés, bakeries, modern restaurants | `#F6F3EE` · `#1E1D1B` · `#B5532D` · olive `#5B6B3A` | Gloock / Hanken Grotesk (+ IBM Plex Mono) | Magazine hero with a huge name, 1px rules, square photos, no rounding |
| Kulhad Warm | Chai cafés, breakfast, desserts | `#F4EDE4` · `#2E1A10` · clay `#9C4524` · chai `#C58646` | Young Serif / Geist | Split hero, 18px soft cards, warm glow |
| Modern QSR | Burgers, pizza, cloud kitchens | `#F3F1EC` · `#141414` · `#D2302A` · `#E8A54B` | Archivo at 125 % width, 800, uppercase / Geist | Full-bleed product hero, pill buttons, bold prices |
| Street Pop | Street food, youth brands | `#FFF9EC` · `#141414` · chilli `#D7261E` · mustard `#FFCB2E` (+ mint `#7ED9B5`) | Archivo Black / Archivo | 2.5px borders, 4px hard shadows, tilted sticker cards, chilli confetti, combo builder |
| Rajwada Royal | Heritage hotels with a restaurant, fine dining | `#F7F0E5` · `#1C2A21` · forest `#24392D` · gold `#F4D49A` | Playfair Display / Mukta | Royal hero, green header with gold pill navigation, rounded photos, green footer |
| Coastal | South Indian & coastal: tiffin, meals, seafood, filter coffee (Kerala, Tamil Nadu, Udupi, Andhra, Goa, Mangalore) | `#FBF8F0` · `#132A1F` · banana leaf `#15663B` · turmeric `#EBA72B` (+ sea teal `#0B5866`, deep teal `#08414B`) | Baloo 2 / Geist | Split hero with a leaf-shaped photo on a sea-teal leaf, kasavu gold stripes, kolam dots, wave into a teal footer |

Each theme uses at most two font families, plus a mono where listed. Latin subsets load with the theme. Devanagari (Mukta) loads only when a visitor switches to Hindi or Marathi. Coastal's stacks name the Noto Tamil, Malayalam, Kannada and Telugu faces Android phones already have, so those scripts stay in a matching sans without downloading anything.

### Tokens

Every theme provides the same colour roles: `bg`, `surface`, `surface2`, `text`, `muted`, `primary`, `onPrimary`, `link`, `accent`, `onAccent`, `line` and `overlay`. It also sets radii (`card`, `button`, `input`) and a heading style (case, tracking, weight and width).

Components never hard-code theme colours. They read `var(--t-*)` or the Tailwind aliases (`bg-t-primary`, `text-t-link`, …).

The look switches are data attributes on `.site-root`:

- `data-card`: `flat`, `soft`, `glass`, `sticker` or `rule`
- `data-mask`: `arch`, `square` or `rounded`
- `data-hero`: `fullbleed`, `split` or `editorial`
- `data-dark`
- `data-playful`

### Contrast (WCAG AA)

- Text, muted text and links reach at least 4.5:1 on `bg`, `surface` and `surface2` in every theme. Button text on `primary` and `accent` also reaches 4.5:1. `themes/registry.test.ts` checks all of this.
- Some colours fail as small text, so they are only used as fills or for large type:
  - Haveli gold
  - Kulhad chai
  - Rajwada gold and Coastal turmeric (fills and decoration only; text-level gold uses their darker `gold-ink`)
  - QSR and Bistro primary on the page background (4.4:1)

  Small text uses each theme's darker `link` colour instead.
- If the owner picks a primary colour, the button text becomes white or ink, whichever reads better. The link colour is derived from the owner's colour (`textSafe`). The dashboard warns only when neither white nor ink text reaches 4.5:1 on that colour (frontend `lib/contrast.ts` and backend `Themes::contrastWarnings`).
- Veg/non-veg marks are graphics (≥ 3:1) and also carry text labels. The open/closed status shows text as well as a dot.

## Layout

- **Grid:** 12 columns on tablets and desktops, 4 on phones. Content is at most 1240px wide, with 16, 24 or 32px side margins (`.s-wrap`, `.s-grid`).
- **Spacing scale:** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 120 px. Sections use 64–120px vertical padding (`.s-section`).
- **Type scale:**
  - display: 44–96px
  - h1: 40–72px
  - h2: 32–52px
  - h3: 20–24px
  - lead: 17–20px
  - body: 16px with line height 1.7
  - eyebrow: 13px, uppercase, tracked
- **Touch targets:** at least 44px. Buttons are 48px; Add buttons, quantity steppers, menu search and filter chips, and the offer bar's close button are 44px.
- **Menu category headings** (`.s-cat-title`) are one step below section headings (26–40px), so a long category name stays on a line or two next to its dish count.
- **Field edges** (`.s-input`) mix the muted ink into the hairline so they reach 3:1 against the card (WCAG 1.4.11); plain `--t-line` is for dividers only.
- **First screen on phones:** the hero's main action (Order online / Explore rooms) must be visible above the bottom tabs at 390×844 with the offer bar showing. Full-bleed heroes are `min(78svh, 680px)` tall on phones; the editorial hero puts its actions right under the name.

## Page structure

**Home**

1. **Header:** sticky. It is transparent over a full-bleed photo and turns into a blurred bar once you scroll.
2. **Hero:**
   - the business name as the headline
   - the tagline
   - CTAs: Order online or View menu, then Call to book, WhatsApp or Directions
   - live Open/Closed badge
   - info card: today's hours, address with directions, phone
3. **Quick actions:** only the ones the business really offers. On phones they are a row of app-style shortcuts (icon over label, no hint) that scrolls sideways past four; from tablets up they are cards with a hint line. Royal themes keep their four-icon bar over the photo's edge.
4. **Owner-ordered sections:**
   - Signature dishes
   - Story (split layout)
   - Menu preview with tabs
   - Ambience gallery (interior photos first)
   - Book a table (by phone or WhatsApp, until online reservations arrive in Phase 4)
   - Visit us (address, parking, the week's hours with today highlighted, and a map that loads only when asked)
5. **Footer:**
   - the business name, tagline and today's hours
   - pages, contact and socials
   - FSSAI licence number and GSTIN (only if the owner filled them in)
   - language switch and "Reduce motion" switch

**Other pages**

- **Menu:** sticky section chips that follow your scroll, search, a veg-only switch, dish rows with veg/non-veg/egg marks, spice (icons, not emoji), badges, "from ₹…" for dishes with sizes, and an Add button.
  - Phones pin only the slim chip row under the header; search, veg-only and filters sit above it and scroll away. Desktop pins one row with everything.
  - The highlighted chip scrolls itself into view inside the row (the row only, never the page), and goes back to the first chip above the first category.
  - Dish rows: name and price on the first line, then badges, a description (three lines at most on phones), and the Add button at the bottom right, on the thumb side. Serif themes (Bistro, Kulhad, Rajwada) and Coastal set dish names in their display face.
- **About:** the story and milestones.
- **Gallery:** filters and an accessible lightbox.
- **Contact:** contact cards, parking, hours and the map.
- **Cart, checkout and order tracking:** the Phase 3 screens, restyled through the shared `.s-*` classes.

**Phones**

App-style bottom tabs: up to four pages (Home, Rooms, Menu, Book, Offers… in that order of priority), Cart when ordering is on, and Profile, which also lists the pages without a tab. At a table or in a room, the table or room bar takes their place. The floating cart and WhatsApp buttons appear only on wider screens.

- **Offer bar:** the title, the coupon as a small dashed ticket (`.s-offer-code`) and the link, centred; at most two short lines on a phone. The close button sits at the inline end (it moves to the left in Urdu).
- **Booking band** (`.s-cta-band`): the primary colour with thin concentric rings fading out of the top corner. Thin lines only, so text contrast on the band never changes.
- **Never a dead end:** if online booking is off and there is no phone or WhatsApp, `/reserve` offers the menu and contact page instead. Copy that says "call us" (the booking band, the big-groups note on `/reserve`) only shows when there is a phone to call; otherwise a phone-less line takes its place.

**Per-theme details** (small touches on the shared structure, so each theme keeps its personality)

- Haveli: a gold diamond before section eyebrows.
- Rajwada: a short gold rule before section eyebrows; dish names in Playfair.
- Bistro: signature dishes numbered 01, 02… like a magazine feature; dish names in Gloock.
- Kulhad: terracotta eyebrows; dish names in Young Serif.
- Modern QSR: prices in the wide display face, like a menu board.
- Ember: capitals in Unbounded get a little extra word spacing.
- Street Pop: unchanged (stickers, rubber buttons, confetti).
- Coastal (South Indian & coastal kitchens):
  - a kasavu stripe (a 2px and a 1px turmeric line, like the gold border of a Kerala mundu) under the header and along the top of the bottom tabs
  - section eyebrows in sea teal, opened by a kolam (four turmeric dots in a diamond); the page divider is a dotted kolam line (`.s-kolam`)
  - the hero photo is leaf-shaped (two big rounded corners) and sits on a sea-teal backdrop with faint veins and a turmeric rim, with a patch of kolam dots behind it; the shapes mirror in Urdu
  - the booking band shows banana-leaf veins instead of rings, with a turmeric edge
  - the footer is deep sea teal and rises out of the page on a CSS-masked wave; its eyebrows and focus ring are turmeric (5.1:1)
  - dish names and prices in Baloo 2; the active chip and tab are leaf green
  - all of it is gradients, masks and inline SVG in `site.css`: no images or extra requests

**India specifics**

- Prices in ₹ with Indian digit grouping (`en-IN` / `hi-IN`)
- 12-hour times in the business's timezone (IST by default)
- `tel:` links with +91 and `wa.me` WhatsApp links
- English and Hindi everywhere

## Motion

All motion is subtle and uses one ease, `cubic-bezier(0.16, 1, 0.3, 1)`. Only `transform` and `opacity` animate. There is no animation library: CSS transitions run from `site/ui/motion.ts`.

| Effect | Rule |
|---|---|
| Reveal on scroll | Fade in and rise 24px over 0.6s, 60ms stagger (`.s-reveal` + `useRevealAll`) |
| Photos | Settle from 1.06 to 1 on reveal; 1.03 zoom on hover |
| Buttons | Lift 2px on hover and settle on press. Street presses like rubber |
| Cards | Lift 4px on hover. On desktop, tilt toward the pointer (6°, never more than 8°) |
| Hero | 0.3× parallax on desktop only, and only near the top of the page |
| Street | Playful extras: tilted stickers, chilli confetti (drawn shapes) and the combo builder |

`prefers-reduced-motion` and the footer "Reduce motion" switch both turn every effect off, and content then shows immediately. The hero photo (the LCP element) never fades.

## Accessibility and performance

- Every page has a skip link, landmarks and one `h1`. Section headings are linked to their sections (`aria-labelledby`).
- The keyboard works everywhere:
  - menu tabs use arrow keys
  - dialogs trap focus and return it when they close
  - the lightbox supports Esc and the arrow keys
- Focus shows a 3px outline in the theme's link colour.
- Images are responsive WebP (480/960/1600) with a blurred placeholder and their size reserved, so nothing shifts as they load. Theme fonts load before first paint.
- No third-party scripts load with the page. Google Maps loads only when a visitor asks for the map.
- Lighthouse targets:
  - Accessibility: target ≥ 95. All themes score 100 in the checks so far.
  - CLS: target < 0.05. Measured 0.
  - Performance: target ≥ 90. Not yet met: it needs pre-rendered HTML for public pages and `/storage` served by Nginx or a CDN (see the README).

## Placeholders to replace

All of these are demo or sample content, labelled "Demo" on the sites:

- **Demo businesses:** the demo businesses (`*-demo`), with their names, taglines, about text, milestones, prices and menus. Sample menus come from `backend/app/Modules/Menu/Support/SampleMenu.php`.
- **Demo photos:** `backend/database/seeders/demo-photos/`, credits in `credits.json`.
  - These are freely licensed pictures from Wikimedia Commons and from Flickr (found through Openverse), credited on every page.
  - They do not show the demo businesses.
  - A real business uploads its own cover, dish and gallery photos.
- **Drawn illustrations instead of photos:** these dishes show a drawing because no correct licensed photo was found:
  - Malai Paneer Tikka
  - Amritsari Fish
  - Kulhad Masala Chai
  - Kashmiri Kahwa
  - Bun Maska
  - Paneer Tikka Burger
  - Paneer Kathi Roll
  - Egg Roll

  The QSR demo also has no interior photo.
- **Contact details:** the demos have no phone, WhatsApp, email, parking, FSSAI or GSTIN, because none were invented. So on the demos:
  - the bottom bar shows only Directions and Order
  - the "Book a table" block is hidden

  Fill these in under Dashboard → Website → Content to see them.
- **Reviews:** there is no reviews section, and none will be shown until real reviews exist.
- **Privacy policy and terms pages:** not built yet.
- **Online table reservations:** Phase 4. Until then, booking is by phone or WhatsApp.
- **Theme preview images:** `frontend/src/themes/*/preview.png` are screenshots of the demo sites. Regenerate them after changing a theme.
