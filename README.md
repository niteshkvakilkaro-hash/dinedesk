# DineDesk

Multi-tenant platform for Indian restaurants, cafes, cloud kitchens and hotels. Each business signs up, gets an animated website on its own subdomain, and runs orders, bookings, staff and billing from one dashboard. The platform owner manages every business from a super admin panel.

```
dinedesk/
├── backend/    Laravel 12 API (/api/v1), modular monolith in app/Modules/*
├── frontend/   React 18 + TypeScript + Vite — one app, three surfaces
└── docs/       openapi.yaml (API reference)
```

## Status: Phase 2 (Themes & public website) complete

### Phase 2

| Area | What works |
|---|---|
| Theme system | `frontend/src/themes/registry.ts` + one folder per theme (`tokens.ts`, `motion.ts`, `layouts/`, `preview.png`, fonts). Adding a theme = a folder + a registry entry + a line in the backend's `Themes::CATALOGUE`. Each theme (and its fonts) is its own lazily loaded chunk |
| Haveli | Maroon/gold/cream, Rozha One + Mukta, jaali patterns, jharokha arch masks, lotus dividers. Carved doors swing open (rotateY ±105°, 1.2s) onto golden light while the hero settles 1.15→1 (once per visit, Skip intro); words rise (0.08s stagger); dividers draw from the centre; diya flicker; cream-curtain photo reveals; pinned horizontal story timeline on desktop |
| Bistro | Paper/charcoal/olive/terracotta, Gloock + Hanken Grotesk + IBM Plex Mono, magazine grid with 1px rules and square photos. Giant name letters slide up then shrink into the navbar logo; hero clip-path wipe; floating cursor photo preview on the menu (tap to expand on mobile); line-mask reveals; odometer numbers; specials marquee driven by scroll velocity; Lenis + parallax; no bounce |
| Street | Mustard/chilli/ink/mint, Archivo Black + Space Mono, 2.5px borders, hard offset shadows, tilted sticker cards. Food stickers drop on springs (400/15); letters pop with overshoot (0.03s); buttons squash; sections skew with scroll speed; angled marquees. Add-to-cart confetti and the combo builder need ordering, so they arrive in Phase 3 |
| Motion rules | Only transform/opacity/clip-path/filter animate; content is visible without JS and never left at opacity 0; `prefers-reduced-motion` **and** a footer "Reduce motion" switch turn off intros, parallax, pinned scroll, flying elements, cursor effects and marquees; loops pause off screen and in background tabs; every GSAP context / ScrollTrigger / SplitText / Lenis is cleaned up on unmount. Dev-only playground at `/motion-lab` |
| Public pages | Home (owner-ordered sections: specials, story, menu preview, gallery, hours, find us), Menu (veg-only filter, veg/non-veg/egg marks, spice, bestseller/chef's special, unavailable), About (story + milestones), Gallery (filters, accessible lightbox), Contact. Live Open/Closed badge that understands overnight hours and **holiday closures**, in the business's timezone. Unpublished sites show "coming soon" to visitors |
| Hindi / English | Every page and dish has a Hindi version (owner fields `*_hi`, falling back to English); `?lang=hi` links; Hindi strings and Devanagari fonts load only when needed |
| SEO | Per-page title/description/canonical/hreflang/Open Graph, schema.org JSON-LD (Restaurant / CafeOrCoffeeShop / Hotel) built only from owner data — no ratings or claims. Per-business `/robots.txt` and `/sitemap.xml`; demo, unpublished and suspended sites are noindex |
| Onboarding 4–7 | Theme picker with the real site in a live preview iframe (desktop/mobile), logo + colours with live WCAG contrast warnings + tagline, sample menu (labelled Demo) or skip, subdomain check with suggestions, go live → celebration with a printable QR code |
| Dashboard | **Website** (theme, colours, section order/visibility with live preview; logo & cover upload; tagline/story/milestones/contact/WhatsApp (shown only once confirmed)/socials/SEO), **Gallery** (upload with required alt text, captions, categories, reorder, edit, delete), holiday closures on Business details, setup checklist with edit links |
| Images | Uploads become WebP at 480/960/1600 px (never upscaled) + a blur placeholder, stored under `tenants/{public_id}/…` |
| Demo data | Three demo businesses, one per theme (`haveli-demo`, `bistro-demo`, `street-demo`), each with a sample menu. All flagged and labelled Demo, never indexed, no invented contact details/reviews |
| Tests | Backend 53 tests / 353 assertions (theme validation, site/menu/gallery isolation, onboarding steps, slug rules, holidays, robots/sitemap, upload validation + WebP). Frontend 23 unit tests (contrast, open status with holidays, theme registry incl. every theme's contrast, i18n key/placeholder parity). End-to-end browser run of signup → go live → website/gallery editing → public site |

**Lighthouse (production build, mobile, simulated slow 4G + 4× CPU, on the development PC):** Accessibility 100 on every theme page checked; CLS 0; TBT ~0 ms. Performance 60–68 — below the ≥90 target. The remaining gap is first paint (~5–6 s in that simulation): the public site is a client-rendered SPA, so the browser needs the app, the business's data and its theme before anything shows. Already done to shorten that: `/site` is requested from `index.html` in parallel with the app, the theme chunk is fetched as soon as the data names it, a website never downloads the dashboard, Hindi and Devanagari fonts load on demand, and theme fonts are fetched before first paint (no layout shift). Reaching ≥90 needs the public pages served as pre-rendered HTML (server-side rendering or per-business pre-rendering) — recommended before launch.

### Phase 1

| Area | What works |
|---|---|
| Multi-tenancy | Tenant resolved from subdomain/custom domain; `tenant_id` global scope that **fails closed**; dashboard always acts on the user's own business; isolation tests |
| Auth & roles | Email + password, mobile OTP (+91), Sanctum tokens; roles owner/manager/cashier/waiter/kitchen/front_desk scoped per business (spatie teams); separate super admin flag |
| Plans & feature flags | Starter / Growth / Pro catalogue, limits (menu items, staff, branches), per-tenant overrides with expiry, `feature:` middleware, features exposed to the frontend |
| Onboarding | Steps 1–3: account → business type → details (name, city, GSTIN, hours). Creates subdomain + 14-day Growth trial (steps 4–7 added in Phase 2) |
| Business dashboard | Overview (trial, setup checklist, plan features, site link), team management with plan limits, business details/hours |
| Public site | Placeholder per subdomain (replaced by the themed site in Phase 2) |
| Super admin | Businesses list (search, filters, sort, MRR summary), detail (plan/status change with audited reason, feature overrides, activity), plan editor |
| i18n | English + Hindi everywhere, remembered per device |

Not built yet by design: menu management, ordering, payments, reservations, POS/KDS, hotel, Razorpay subscriptions, custom-domain SSL (Phases 3–8).

## Run it locally

Requirements: PHP 8.2+ (gd, intl, pdo_mysql, fileinfo), Composer 2, Node 20+, MySQL 8 or MariaDB 10.4+.

```bash
# Databases
mysql -uroot -e "CREATE DATABASE dinedesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE DATABASE dinedesk_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Backend (terminal 1)
cd backend
composer install
cp .env.example .env          # set DB_*, SUPER_ADMIN_PASSWORD; OTP_DEV_ECHO=true for local OTP testing
php artisan key:generate
php artisan migrate --seed
php artisan storage:link      # serves uploaded images from /storage
php artisan serve --port=8010

# Frontend (terminal 2)
cd frontend
npm install
cp .env.example .env          # VITE_DEV_BACKEND=http://127.0.0.1:8010
npm run dev                   # http://localhost:5173
```

| URL | What |
|---|---|
| http://localhost:5173 | Platform: landing, sign up, sign in |
| http://localhost:5173/platform | Super admin (`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`) |
| http://haveli-demo.localhost:5173 | **Demo** site, Haveli theme (Chrome/Firefox resolve `*.localhost` automatically) |
| http://bistro-demo.localhost:5173 | **Demo** site, Bistro theme |
| http://street-demo.localhost:5173 | **Demo** site, Street theme |
| http://localhost:5173/motion-lab | Motion lab: every theme's motion tokens and primitives with replay (dev server only) |
| demo-owner@example.com, demo-bistro@example.com, demo-street@example.com / DemoOwner2026 | Demo business owners (development seed only; never created when APP_ENV=production) |

Add `?preview=1&preview_theme=street` to a business site inside the dashboard's iframe to see the live preview mode; outside an iframe the flag is ignored.

Mobile OTP in development: codes are written to `backend/storage/logs/laravel.log`, and shown on screen when `APP_ENV=local` and `OTP_DEV_ECHO=true`. No SMS provider is connected yet.

## Tests

```bash
cd backend && php artisan test     # uses the dinedesk_test database
cd frontend && npm test            # vitest
cd frontend && npm run typecheck
```

Key backend suites: `Tenancy/TenantIsolationTest` (ORM + API isolation), `Identity/*` (auth, OTP, roles), `Onboarding/*` (incl. `SiteSetupTest`: steps 4–7, slug rules), `Website/WebsiteTest` (themes, content, uploads, isolation, holidays, robots/sitemap), `Plans/FeatureGatingTest`, `Platform/SuperAdminTest`.

## Architecture notes

- **Modules** (`backend/app/Modules`): Tenancy, Identity, Onboarding, Settings, Plans, Platform, Audit, Website (themes, content, gallery, public site, SEO files), Menu (models + sample menu; management arrives in Phase 3). Each has its own routes, models and controllers; business logic lives in Actions/Services.
- **Tenant isolation**: tenant-owned models use `BelongsToTenant` → `TenantScope`. No tenant in context ⇒ queries return nothing. Cross-tenant reads only via explicit `Model::withoutTenancy()` in super admin code.
- **Feature gating**: `FeatureService` merges plan features with super-admin overrides; the same map is returned by `/auth/me` for the UI.
- **Time**: stored in UTC, shown in the business's timezone (default Asia/Kolkata).
- **Public website delivery**: `/robots.txt` and `/sitemap.xml` must reach Laravel with the visitor's host (the Vite dev/preview proxy sets `X-Tenant-Host`; in production route those two paths to the backend). The dashboard previews the site in an iframe on the business's subdomain, so don't send `X-Frame-Options: DENY` for business sites (allow the platform origin via `frame-ancestors`).
- **Laravel 12** is used instead of 11: Composer blocks every Laravel 11 release over published security advisories. The structure is identical.
- **Development cache/queues** use the database (no Redis on XAMPP/Windows). Production uses Redis, Horizon and Reverb (Phases 5 and 8).

## Next: Phase 3 — Menu & ordering

Menu management (categories, variants, add-ons, photos, availability, CSV import), cart and checkout, online ordering, plus Street's add-to-cart confetti and combo builder.
