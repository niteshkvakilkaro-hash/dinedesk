# DineDesk

Multi-tenant platform for Indian restaurants, cafes, cloud kitchens and hotels. Each business signs up, gets an animated website on its own subdomain, and runs orders, bookings, staff and billing from one dashboard. The platform owner manages every business from a super admin panel.

```
dinedesk/
├── backend/    Laravel 12 API (/api/v1), modular monolith in app/Modules/*
├── frontend/   React 18 + TypeScript + Vite — one app, three surfaces
└── docs/       openapi.yaml (API reference)
```

## Status: Phase 1 (Foundation) complete

| Area | What works |
|---|---|
| Multi-tenancy | Tenant resolved from subdomain/custom domain; `tenant_id` global scope that **fails closed**; dashboard always acts on the user's own business; isolation tests |
| Auth & roles | Email + password, mobile OTP (+91), Sanctum tokens; roles owner/manager/cashier/waiter/kitchen/front_desk scoped per business (spatie teams); separate super admin flag |
| Plans & feature flags | Starter / Growth / Pro catalogue, limits (menu items, staff, branches), per-tenant overrides with expiry, `feature:` middleware, features exposed to the frontend |
| Onboarding | Steps 1–3: account → business type → details (name, city, GSTIN, hours). Creates subdomain + 14-day Growth trial. Steps 4–7 are shown as "next release" |
| Business dashboard | Overview (trial, setup checklist, plan features, site link), team management with plan limits, business details/hours |
| Public site | Placeholder per subdomain: name, live Open/Closed (IST), hours, "coming soon". Themes arrive in Phase 2 |
| Super admin | Businesses list (search, filters, sort, MRR summary), detail (plan/status change with audited reason, feature overrides, activity), plan editor |
| i18n | English + Hindi everywhere, remembered per device |
| Tests | Backend 42 tests / 211 assertions; frontend host-resolution unit tests |

Not in Phase 1 by design: themes, menu, ordering, payments, reservations, POS/KDS, hotel, Razorpay subscriptions, custom-domain SSL (Phases 2–8).

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
| http://haveli-demo.localhost:5173 | The seeded **demo** business's site (Chrome/Firefox resolve `*.localhost` automatically) |
| demo-owner@example.com / DemoOwner2026 | Demo business owner (development seed only; never created when APP_ENV=production) |

Mobile OTP in development: codes are written to `backend/storage/logs/laravel.log`, and shown on screen when `APP_ENV=local` and `OTP_DEV_ECHO=true`. No SMS provider is connected yet.

## Tests

```bash
cd backend && php artisan test     # uses the dinedesk_test database
cd frontend && npm test            # vitest
cd frontend && npm run typecheck
```

Key backend suites: `Tenancy/TenantIsolationTest` (ORM + API isolation), `Identity/*` (auth, OTP, roles), `Onboarding/*`, `Plans/FeatureGatingTest`, `Platform/SuperAdminTest`.

## Architecture notes

- **Modules** (`backend/app/Modules`): Tenancy, Identity, Onboarding, Settings, Plans, Platform, Audit. Each has its own routes, models and controllers; business logic lives in Actions/Services.
- **Tenant isolation**: tenant-owned models use `BelongsToTenant` → `TenantScope`. No tenant in context ⇒ queries return nothing. Cross-tenant reads only via explicit `Model::withoutTenancy()` in super admin code.
- **Feature gating**: `FeatureService` merges plan features with super-admin overrides; the same map is returned by `/auth/me` for the UI.
- **Time**: stored in UTC, shown in the business's timezone (default Asia/Kolkata).
- **Laravel 12** is used instead of 11: Composer blocks every Laravel 11 release over published security advisories. The structure is identical.
- **Development cache/queues** use the database (no Redis on XAMPP/Windows). Production uses Redis, Horizon and Reverb (Phases 5 and 8).

## Next: Phase 2 — Themes & public website

Theme registry and the three themes (Haveli, Bistro, Street), public pages, SEO, theme picker with live preview in onboarding and the dashboard, `/motion-lab`.
