# DineDesk

Multi-tenant platform for Indian restaurants, cafes, cloud kitchens and hotels. Each business signs up, gets an animated website on its own subdomain, and runs orders, bookings, staff and billing from one dashboard. The platform owner manages every business from a super admin panel.

```
dinedesk/
├── backend/    Laravel 12 API (/api/v1), modular monolith in app/Modules/*
├── frontend/   React 18 + TypeScript + Vite — one app, three surfaces
└── docs/       openapi.yaml (API reference), DESIGN.md (website design system)
```

## Status: Phase 8 (SaaS billing & scale) complete — all eight phases done

### After Phase 8: guest conveniences, real messaging, marketing site

| Area | What works |
|---|---|
| WhatsApp / SMS | `MESSAGING_DRIVER=live`: WhatsApp through **Meta's WhatsApp Cloud API** (every order, booking and stay update goes through one approved utility template whose body is `{{1}}`, `WHATSAPP_TEMPLATE`), and SMS through **MSG91** for one-time codes only (sign-in with `OTP_DRIVER=sms`, loyalty codes) via a DLT-approved OTP template. Indian DLT rules make free-text SMS impossible, so update texts by SMS are skipped with a warning and the dashboard says so. Missing keys or a non-Indian number: skipped and logged; a provider error throws so the queued message is retried |
| My orders & order again | `/orders` on every site lists orders placed from that phone or browser (no account) with status, total and items; **Order again** puts them back in the cart from today's menu and prices (sold-out or removed dishes are listed, dropped extras left out). Linked from the More sheet and the footer |
| Ready-by time | The tracking page shows "should be ready by about …" (or "reach you by" for deliveries) from the owner's prep and delivery minutes, counted from confirmation; "taking a little longer" once it passes. Nothing for scheduled, unpaid online or finished orders |
| Diet labels & allergy filter | Dishes can be labelled **Jain, no onion & garlic, vegan, gluten-free** (the first three only on veg dishes; also a `diet_tags` CSV column). Badges on the dish; a **Filters** sheet on the menu (only the labels and allergens the menu uses) to show only matching dishes and hide dishes with chosen allergens, with a note to tell staff about serious allergies. Allergens now show on the site ("Contains: …") |
| Guest app | Every business website installs as its own app (no app store): `/site.webmanifest` and `/site-icon-{192,512}.png` per host (the owner's logo on their brand colour, or the first letter), a service worker that caches nothing, splash screen from the manifest, "Install" on the Profile tab (iPhone: Add to Home Screen hint). Bottom tabs like a native app: Home, Rooms, Dining / Menu, Cart, **Profile** (account, My orders, **My bookings** with Rooms / Tables tabs from this device and, signed in, any device, the other pages, call / WhatsApp / directions, language). Hotels also get a Rooms quick action and **Featured rooms** on the home page |
| Push alerts | Staff turn on alerts per device (header menu): new orders, table bookings, room bookings and event enquiries ring on that phone even when the dashboard is closed, for roles that see them. Web Push with VAPID keys (`php artisan webpush:vapid`), sent from a queued job; the dashboard installs as an app too. On Windows/XAMPP PHP needs `OPENSSL_CONF` set (see `.env.example`) |
| GST & Tally | Reports → GST and Tally: a month's GSTR-1 sections as CSV (B2B, B2CS, HSN/SAC, documents issued) including orders paid without a bill, and Tally Prime sales vouchers (XML, balanced, ledgers listed). For the CA to check; DineDesk doesn't file |
| Automatic messages | Marketing → Automatic: birthday, anniversary and "we miss you" messages by WhatsApp or email, daily at 10:00 IST, only to opted-in customers, never twice. Guests who rate an order are invited to review on Google (the same invitation for everyone) |
| Dashboard home | Redesigned Overview (`GET /tenant/dashboard`): bookings, orders, revenue (rooms + restaurant) and customers for the last 7 days with the change against the 7 days before; revenue chart; booking distribution; recent bookings and orders; rooms free tonight with photos; top-selling dishes; recent customers; quick actions and recent activity. Every number comes from the business's own records (empty states when there is nothing yet), and each block is sent only to roles that may see it (money needs `reports.view`) |
| Dashboard colours | **Appearance** menu in the header: light / dark and four palettes, **Classic**, **Haveli green** (forest green sidebar, antique gold), **Royal maroon** and **Ocean blue**, saved per device. Palettes set the sidebar, accent and page tint through CSS variables; their contrast in light and dark mode is checked in a test |
| Guest sign-in | On `/orders` guests can sign in with their mobile number and a 6-digit SMS code (5 tries, rate limited like loyalty codes). Signed in, they see orders placed from **any device** (matched by phone), their loyalty points and **saved addresses** (up to 5; checkout fills in their name and phone, offers saved addresses as one-tap chips and "Save this address for next time"). The token stays in that browser for 90 days (only its hash is stored) and is sent as `X-Guest-Token`. New `Accounts` module with its own tables, so signing in never adds anyone to the CRM, which stays built from real orders and bookings. Sessions are left out of data exports |
| Fix | `otp_codes.expires_at` and `support_sessions.expires_at` were TIMESTAMP columns that MariaDB gave `ON UPDATE CURRENT_TIMESTAMP`, so any change to the row (a wrong OTP attempt, ending a support session) moved the expiry to "now" (hidden locally because the database clock runs in IST). Now DATETIME; a schema test fails if any column updates itself again |
| UPI to the restaurant | Ordering settings → **UPI** with the restaurant's own UPI ID (checked format; payee name defaults to the business). Guests choose "Pay by UPI app" at checkout; the tracking page opens their UPI app with the amount filled in (phones) or shows a QR (computers), and asks for the UPI reference (UTR). There is no gateway, so nothing is marked paid automatically: staff see "UPI · payment pending" with the reference, check their UPI / bank app and press **Payment received** (audited); completing the order also settles it, like cash. The POS bill shows a **UPI QR for the amount due** for counter payments |
| Thermal printing | **Printer** button on the POS and the kitchen screen: 58 or 80 mm paper, auto-print a **KOT** when this device sends an order, auto-print the **receipt** when a bill is paid, test slip. Each kitchen ticket and bill has **Print**. Slips are laid out for the roll (KOT: big quantities and names, no prices; receipt: the same figures as the GST invoice) and go through the browser's print window, so any thermal printer with a driver works; Chrome with `--kiosk-printing` prints in one click. Settings are per device (the printer belongs to the counter) |
| Phones | Bottom tabs on business sites; nothing on any page is wider than the phone (map, combo builder and admin grids fixed). Dashboard dark mode |
| Marketing site | DineDesk's own pages on the platform domain: home (real product screenshots, modules, themes with live demos, steps, plans, FAQ), `/pricing`, `/themes`, and five feature pages under `/features/…` written for owner searches. Each has its own title, description, canonical, Open Graph tags and JSON-LD (Organization, SoftwareApplication, FAQPage, BreadcrumbList; no ratings or customer counts). `robots.txt` and `sitemap.xml` on the platform domain now allow and list these pages (before, the platform domain answered `Disallow: /`) |

**Pre-rendered:** `npm run build` also renders every marketing page to HTML (`src/prerender.tsx` built with `vite build --ssr`, written by `scripts/prerender.mjs` to `dist/_marketing/…`). Search engines and people without JavaScript get the full page; in the browser the HTML stays on screen until the app shows the same page, then the app takes over (no blank spinner). Nginx serves these files on the platform domain only (docs/DEPLOYMENT.md), so business websites are unaffected.

**To bring traffic:** add the domain to Google Search Console and submit `/sitemap.xml`, and create a Google Business Profile. Each restaurant should link its site from its own Google Business Profile and Instagram.

### Phase 8

| Area | What works |
|---|---|
| Subscriptions | **Razorpay Subscriptions** on the platform's own account (`RAZORPAY_*` in `.env`). Dashboard → **Billing** (owner): plans with monthly / yearly prices (yearly savings shown), GST shown, checkout in Razorpay, signature-checked verification, webhook `/api/v1/webhooks/razorpay-platform` (activated, charged, pending, halted, cancelled, completed; repeats ignored). A Razorpay plan is created per plan, cycle and price, so a new price never changes existing subscribers silently. Plans with no price can't be bought (no invented prices: the super admin sets them) |
| Trials, grace, read-only | 14-day Growth trial. When a trial ends, a payment fails or a cancelled period runs out, a **grace period** starts (default 7 days, platform setting); after it the business **and its branches** become **read-only**: everything can be viewed and exported, Billing works, nothing is deleted. Paying again restores it at once. Hourly `subscriptions:enforce`; demo businesses are left alone. Dashboard banners: trial ending, payment due, read-only |
| Upgrades & downgrades | Upgrades apply now (features on immediately); downgrades and cycle changes from the next period (applied with that period's first charge). Plan limits are enforced at once on new items; a downgrade warns when current use is over the new limits (nothing is deleted). Cancel = stop renewing, the paid period stays |
| Invoices | A tax invoice per charge, `DD/2026-27/0001` (prefix set by the platform): seller = the platform's legal name, GSTIN, address; buyer = the business (and its GSTIN); SAC; CGST + SGST within the platform's state, IGST across states; GST only once the platform has a GSTIN. PDF for the owner |
| Branches (Pro) | **Linked outlets**: each branch is its own business (website / subdomain, menu, staff, orders) tied to the main one; it shares the plan and the subscription. Add a branch (optionally copying the menu with photos, the theme and settings, never payment keys), switch outlets from the header (also in the set-up wizard), copy a menu into an empty outlet, combined report for all outlets. Billing only from the main business |
| Custom domains | Dashboard → **Domain** (Growth / Pro, up to 3): add a domain, see the CNAME / A records, **Check DNS**, make it the main address (links, messages, canonical). The platform subdomain keeps working. **Automatic TLS** with Caddy on-demand: `/api/v1/tls/ask` allows certificates only for the platform, real business subdomains and verified domains (Cloudflare for SaaS documented as the alternative) |
| Super admin | **Revenue**: MRR, ARR, paying, on trial, in grace, read-only, MRR at risk, trial → paid conversion (90 days), churn (30 days), MRR by plan, money collected by month, new businesses; demo businesses and branches left out. **Settings**: invoice details, GST, SAC, grace days, Razorpay / domain set-up. Plan prices on **Plans** |
| Support login | "Open as support" on a business: a reason (10+ characters), view-only unless changes are allowed, a separate 60-minute token in its own browser tab (it never replaces the admin's sign-in and can't reach the platform panel). The business's audit log shows the start, every change (with the admin's name) and the end. A banner with **End session** is always visible |
| Data export & backups | Owners download all their data as a ZIP (JSON per table + Excel-ready CSVs of orders, customers and menu; no passwords, tokens or payment keys; guest ID files left out), also while read-only; kept 7 days. The super admin can export a business (reason, audited). `backup:database` makes a nightly gzip'd `mysqldump` (kept `BACKUP_KEEP_DAYS`); copying it off the server is in the deployment guide |
| Deployment | **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**: one Ubuntu VPS with Caddy (on-demand TLS) → Nginx → PHP-FPM, MySQL, Redis, Horizon, Reverb, Supervisor, cron, Razorpay webhook set-up, backups off-site, updates, checklist |
| Tests | Backend 119 tests / 1,463 assertions (+ checkout with GST, signature checks, webhook charge → invoice once with CGST/SGST, halted → grace → read-only → paid → restored, trial end → grace → read-only with demos untouched, upgrade now / downgrade at period end / cancel, no price or no keys, support session view-only / changes audited / expiry / no platform access, revenue numbers, branches (feature, copy menu, switch, isolation, read-only follows the main business), custom domains with DNS and TLS ask, data export contents without secrets and purge). Frontend 36 unit tests. Browser run: revenue and settings pages; support session in its own tab with banner, write refused, end closes the tab and the admin stays signed in; owner billing page with prices; branch added and switched to (set-up wizard with the outlet switcher) and back; domain added and DNS checked |

**Try it:** sign in as the super admin (`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from `backend/.env`), set prices under **Plans**, see **Revenue** and **Settings**, open a business and use **Open as support**. As `demo-hotel@example.com` / `DemoOwner2026` (Pro) open **Billing**, **Branches** and **Domain**. Subscription checkout needs Razorpay test keys in `backend/.env` (without them the page says payments aren't switched on).

### Phase 7

| Area | What works |
|---|---|
| Room types & rates | `/dashboard/hotel` → Set up: room types with photos (up to 8, cover photo), Hindi name and description, amenities, beds, size, adults included / max adults / max children. Price per night before GST, a **Friday & Saturday** price, extra adult and child charges, **seasonal prices** between dates (the newest wins). Rooms added in bulk (`101-110, 201`), each with a **QR code** (printable sheet, can be regenerated). Pro plan only |
| GST on rooms | Per night by the price of the room for that night: **5% up to ₹7,500, 18% above** (SAC 996311). Slabs are in `config/dinedesk.php` (`hotel_gst`), so a rate change needs no code. Can be switched off for a business that is not registered |
| Booking engine | `/rooms` on the website: dates, adults, children → which types are free with the full price night by night (weekend, season, extra guests, GST). Only "few left" is shown, never the stock. Booking form (arrival time, requests, company GSTIN). **Never oversold**: a business-wide lock and a per-night count of bookings against sellable rooms (out-of-order rooms are not sold), from the website and from the desk |
| Advance & confirmation | Optional advance of 10–100% through **Razorpay** (the room is held, released after the hold time if unpaid; a payment after release takes the room back if it is still free). Webhook and checkout callback both confirm, and repeats are ignored. Without an advance the hotel confirms requests, or confirms them automatically. Guest messages for received / confirmed / cancelled stays (WhatsApp / SMS / email per the business's settings) |
| Guest booking page | `/stay/{id}?t=…` (private link) and `/stay` (find with booking ID + phone): status, price, pay the advance, **cancel online** up to the hotel's cut-off |
| Front desk | Today (arrivals, departures, guests in, requests, tonight's rooms), **calendar** (rooms × 14 days, bookings as bars, bookings without a room), search. Bookings by phone / walk-in with an advance. Confirm, assign / move room, **check-in** (room must be clean or inspected unless confirmed anyway; ID type and last 4 characters only), change dates (existing nights keep their price), agreed rate (audited), extra charges, payments and refunds, no-show, cancel |
| Folio & check-out | Room nights posted at check-in and kept in step with the dates, room-service food, extras, payments. **Check-out**: room-service orders must be finished, the balance paid (several modes), optionally charge only the nights stayed when leaving early. The **GST bill** (same `INV/FY/0001` series) lists room nights (996311), each dish (996331, its own GST rate) and extras, with the stay and every payment on the PDF. Hotel money is counted in **day-end** on the day it came in (advances, payments, refunds; cash goes into the expected drawer), never twice |
| In-room dining | The QR in each room (`/r/{token}`) opens the menu in room mode. Ordering needs a guest checked in to that room and the **last 4 digits of the phone** the stay is booked under (5 tries per room, then a pause). Orders are a new type, **room service**, go to the kitchen like any order, appear on the folio, can't be billed at the POS, and are marked paid at check-out |
| Housekeeping | Board of every room: clean / dirty / inspected / out of order (reason), occupied, arriving / leaving today, who changed what. Check-out marks the room dirty; a move marks the old room dirty. New **Housekeeping** role (board only); the front desk can update it too |
| Guest IDs | **Off by default** (owner turns it on, with a warning). Files are encrypted with the app key before they reach the private disk, served with `no-store`, every upload / view / deletion is in the audit log with the staff member and IP, and they are deleted automatically a set number of days after check-out |
| Events | `/events` enquiry form (wedding, birthday, anniversary, corporate, other; date, guests, message). Front desk follows up: status (new → contacted → quote sent → booked / not going ahead), follow-up date, notes |
| Reports | Rooms section: occupancy, room-nights sold / available, room revenue before GST, ADR, RevPAR, average stay, cancellations, no-shows, by source and room type, daily occupancy. **Stays CSV** |
| Website | Rooms and Events in the navigation, sitemap, `Hotel` JSON-LD with check-in / check-out times, room photos credited with the others |
| Tests | Backend 110 tests / 1,298 assertions (+ prices with weekends, seasons, extra guests and both GST slabs; overselling from the website and the desk; guest lookup and the cancellation cut-off; Razorpay advance, webhook repeats, hold expiry and late payment; a full stay with room service charged to the room, wrong PIN, check-out bill lines and SAC codes, day-end and occupancy; dates, agreed rate and early departure; housekeeping states and roles; guest IDs off by default, encrypted, logged and purged; event enquiries; Pro-plan gating and tenant isolation; setup with photos, bulk rooms and QR codes). Frontend 36 unit tests. End-to-end browser run on the demo hotel: rooms and prices → booking → booking page; event enquiry; confirm and check in; room QR → menu → wrong PIN refused → order charged to room 101 → kitchen completes it; check-out with the bill `INV/2026-27/0001`; housekeeping, reports, setup |

**Demo:** "Hotel Demo" (Haveli theme, Udaipur, Pro plan): three sample room types (prices and text are examples; photos are credited CC BY pictures, not this hotel), eight rooms, online booking, room service and events on. No guests, bookings or reviews are invented. Sign in as `demo-hotel@example.com` / `DemoOwner2026`; the site is http://hotel-demo.localhost:5173.

**Run it:** `php artisan schedule:work` also runs `hotel:expire-holds` (every 5 minutes) and `hotel:purge-documents` (daily). Guest IDs use the private `local` disk unless `GUEST_DOCUMENTS_DISK` says otherwise.

**Check with your CA:** room GST slabs, whether restaurant food served in a hotel with rooms above ₹7,500 needs a different rate (set it on the menu), and how long you must keep guest records.

### Phase 6

| Area | What works |
|---|---|
| Inventory | `/dashboard/inventory`: raw materials in kg / g / l / ml / pcs with opening stock, low-stock level and cost; **stock in / out** as purchase, wastage or a physical count; movement history; stock value. **Recipes** link dishes (or a single size) to ingredients per serving. Stock is deducted when the kitchen ticket is created and returned if the order is cancelled. A low-stock alert goes once to staff who manage inventory and again once stock has gone back above the level. **Suppliers and purchase orders**: suppliers with WhatsApp number and GSTIN; a purchase order can be filled from low stock (topped up to twice the level), sent to the supplier from the owner's own WhatsApp (pre-written message), then received: what actually arrived goes into stock at the price paid, which becomes the item's cost. Growth plan |
| AI menu import | Dashboard → Menu → **Import with AI**: photos (up to 6 pages) or a PDF of a printed menu are read by Claude (`claude-opus-5-5`, structured output, server-side fallback). Nothing is invented: an unreadable price comes back empty and must be filled in. The owner checks and edits every row, then the dishes are saved through the CSV import (same checks, plan limit, all or nothing). **Write with AI** in the dish editor suggests an English and Hindi description. Needs `ANTHROPIC_API_KEY`; without it the dashboard says AI is off. 30 AI requests per business per hour. All plans |
| Shifts & attendance | `/dashboard/rota` (owner, manager: `staff.schedule`): a weekly rota per person (shifts past midnight allowed, copy last week into an empty week). Every staff member clocks in and out from the dashboard home of their own login; a clock-in left open for 16 hours is closed with no time counted, for a manager to correct. The attendance report shows shifts, present, absent (a planned shift in the past with no clock-in), late (first clock-in more than 10 minutes after the shift start) and hours; managers can add or correct entries, which are marked as added by a manager and audited. All plans |
| Tiffin / meal subscriptions | `/dashboard/tiffin`: plans (meals, days valid, price, lunch / dinner / both; managed with `menu.manage`), subscribers and the day's list (with `orders.manage`). Guests ask to join from the website's **Tiffin** page (shown once a plan is active; staff get a push alert); the restaurant confirms once paid. Each meal marked delivered uses one; a skipped day (on leave) uses none and adds a day of validity; pausing adds the days away; renewing adds the plan's meals. The day's list can be sent to the delivery person on WhatsApp. Payments count as revenue in the profit and loss. All plans |
| Coupons | Flat or percent, max discount, minimum order, start / end, total and per-guest limits, online and/or POS, public (listed on `/offers`) or hidden. Taken off the food value before GST and shared across lines to the paisa; reversed if the order or bill is cancelled. Used coupons are switched off, never deleted |
| Loyalty points | Points per ₹100 on completed orders (food value only), point value, minimum to redeem, max % of a bill. Online redemption needs a **6-digit SMS code** (hashed, 5 tries) and a 30-minute token. At the POS, find the guest by phone and use points. Points come back on cancellation; manual adjustments need a reason and are audited |
| Gift cards | Issued from Marketing (cash / UPI / card / complimentary, optional expiry), code `XXXX-XXXX-XXXX-XXXX`, redeemed at the POS as a **Gift card** payment (partial use keeps the balance), refunded if the bill is cancelled, can be cancelled. Cash gift-card sales count in the day-end cash drawer |
| Website | Scheduled **banners**: top bar, a once-per-visit popup, cards on `/offers`. Offers box at checkout (coupon, points). A **Send me offers** checkbox, unticked by default. **Reviews** section only from real ratings that the guest agreed to show and the owner published. **Rate your order** form on the tracking page after completion. `/unsubscribe` page |
| Customers (CRM) | `/dashboard/customers`: built from real orders and bookings, with orders, visits, total spent, points, last order; search, tags, sorting; history and points log; private notes; birthday / anniversary only when the guest agreed. Staff can switch offers **off** but never on. Feedback tab: publish / hide (only with consent), reply |
| Messages | Campaigns by WhatsApp / SMS / email **only to opted-in guests**, filtered by tags, minimum visits, days since last visit, birthday month; audience count before sending; queued, rate limited, each with an unsubscribe link |
| Reports | `/dashboard/reports`: last 7 / 30 / 90 days or any range up to a year; sales, orders, GST, discounts, average order, repeat-guest rate; sales by day / week / month (chart); by order type, payment and source; **peak-hours heatmap**; top and slow dishes; categories; bookings and no-show rate; coupon use. **CSV** (opens in Excel, UTF-8, formula-safe) for sales, orders, dishes, categories, customers and bookings. Everything comes from real data; nothing is estimated |
| Roles | New permissions: `inventory.manage`, `marketing.manage` (manager); `customers.view` (manager, cashier, front desk); reports stay with `reports.view` |
| Tests | Backend 100 tests / 1,071 assertions (+ coupon limits and reversal, loyalty earn / OTP / redeem / reverse, gift card redeem / refund / expiry, stock deduction per size and return, low alert, CRM consent rules, feedback once per completed order and publishing only with consent, campaigns only to opted-in guests and unsubscribe, reports and CSV). Frontend 32 unit tests. End-to-end browser run: demo banner on the site, coupon DEMO10 at checkout (−₹86), recipe Paneer Tikka → POS order → stock 5 → 4.75 kg with a low alert, ₹500 gift card issued and used to pay a POS bill, customers and reports pages |

**Demo data:** each demo business has one coupon `DEMO10` and a banner, both labelled as demo. No sample reviews, customers or stock are created.

**Try it:** open http://haveli-demo.localhost:5173, use `DEMO10` at checkout and rate the order once it is completed; sign in as `demo-owner@example.com` / `DemoOwner2026` and open **Customers**, **Marketing**, **Inventory** and **Reports**.

### Phase 5

| Area | What works |
|---|---|
| Live updates | **Laravel Reverb** (WebSockets, Pusher protocol). Private channels per business and topic (`tenant.{business id}.orders / kitchen / tables / reservations`), authorised with the dashboard token and the matching permission. Events carry ids only; screens refetch through the API. Sent after the database commit and never allowed to break a request; without Reverb everything keeps working by polling (polling slows to 60 s while live). A **Live** badge shows the connection |
| Kitchen Display | Full-screen dark screen at `/kitchen` (TV, tablet or phone): New / Cooking / Ready columns, ticket per order (K-number, order #, table or type), sizes, extras, dish and kitchen notes, veg/non-veg dots, tap a dish to tick it, minutes since ordered (amber after 10, red after 20), Start → Ready → Served, **recall** a mistaken bump, chime for new tickets, full-screen button. Tickets are created when an order reaches the kitchen (pay-later at once, online once paid) and move with the order both ways: starting a ticket accepts the order and marks it preparing; the Orders board moves the ticket |
| POS | `/dashboard/pos`: menu grid with search, sections and sold-out marks, sizes / extras / dish notes, takeaway or dine-in on a table, guest name and phone (optional), **Send to kitchen** or **Charge** at once. **Open bills**: running tables (bill-asked highlighted), unbilled pay-later orders (website, QR, POS, waiter), unpaid bills |
| GST bills | Numbered per business per financial year (`INV/2026-27/0001`, April–March). **Tax invoice** with the business GSTIN (otherwise a **Bill**): seller name, address, GSTIN, FSSAI; buyer name / phone / **GSTIN for B2B**; lines with SAC 996331, rate, discount, taxable value, GST %, CGST, SGST; packaging / delivery; **round-off** to the rupee; amount in words; payments. **Discount** by percent or amount with a required reason (audited), taken off the taxable value, shared across lines in proportion (to the paisa) and GST worked out again per line. Table bills cover every order on the table; orders already paid online count as paid. **Cancel** an unpaid bill (reason, audited) to bill again. **PDF** download (A4, ₹ in an embedded font subset, ~25 kB) |
| Payments | Cash, UPI, card or other with UTR / card reference; **split** equally into 2–4 or any mix of modes; cash may be more than the bill (change shown, only the bill amount recorded); other modes may not. Fully paid → orders completed and paid, the table's bill closed and the table marked **cleaning** |
| Day-end | `/dashboard/day-end`: bills issued (range, discounts, taxable value, CGST, SGST, charges, round-off, total, cancelled), money by mode, orders by type and channel, average order, cancellations, orders **paid without a bill** shown separately (website online / COD / counter), top dishes, what is still open, and the **cash drawer** (opening + cash from bills + cash orders without a bill = expected, counted, difference). **Close the day** (kept with the figures, audited; closing again updates it), PDF. Any past date |
| Floor plan | Tables → Live shows the **floor plan** (or cards): tables where they stand, round / square / long, coloured free / occupied / bill asked / cleaning, running total and call badges, areas as filters. Tap a table: calls (done), the bill, **Bill & take payment**, **Move** guests to a free table, **Merge** two tables' bills, **Mark clean**. **Arrange floor** in Set up: drag tables (or arrow keys, Shift for bigger steps), choose shapes, save |
| Waiter app (PWA) | `/waiter/` on a phone, **installable** (manifest, icons, service worker that caches the app shell but never the API): tables grid with live state and calls, tap a table to see its orders, **add items** (sizes / extras) and **send to the kitchen**; Calls tab with one-tap done; chime for new calls |
| Roles | Kitchen: KDS only. Waiter: tables, waiter app, sending orders (no billing). Cashier: POS, bills, payments, day-end, table board. Manager: all of these. Kitchen display, POS and tables are Growth-plan features |
| Tests | Backend 93 tests / 896 assertions (+ tickets follow orders both ways and cancellations, staff orders and numbering, roles and plan for the kitchen, bill numbering per financial year, GST and round-off, discount before GST across mixed rates, split / mixed / short / over payments, cash change, B2B GSTIN and tax invoice, PDF, table bill closing the table, void and re-bill, bill privacy and permissions, floor layout, transfer, merge, cleaning, day-end figures and closing). Frontend 32 unit tests. End-to-end browser run with Reverb: POS ticket appears on the kitchen screen without a reload → Start → Ready; takeaway billed and paid with change; waiter app order for T3 reaches the kitchen; T3 billed with 10% discount, split cash + UPI → table goes to cleaning; floor plan and day-end checked |

**Run it:** start Reverb next to the backend: `php artisan reverb:start --port=8080` (the keys are in `backend/.env`; the frontend reads `VITE_REVERB_APP_KEY` / `VITE_REVERB_PORT`). Without Reverb, set `BROADCAST_CONNECTION=null` and screens poll.

**Try it:** sign in as `demo-owner@example.com` / `DemoOwner2026`, open **POS** and **Kitchen** side by side, send an order and watch it arrive; bill it from **Open bills**; open http://localhost:5173/waiter/ in a phone-sized window for the waiter app; see **Day-end** for the day's figures.

### Phase 4

### Phase 4

| Area | What works |
|---|---|
| Table booking (website) | "Book a table" page on every sit-down business's site: guests, day chips (blackout days greyed out), free times only, name/phone/email/notes. Each booking gets a 6-character **booking ID**; guests check or cancel it at `/reservation` with ID + phone (same answer for a wrong ID or phone, rate limited). Bookings made on the device are remembered. Online booking adds to the nav, hero, quick actions, mobile bar and the "Book a table" block; when it's off, the site falls back to Call / WhatsApp |
| Capacity rules | Weekly **slots with a capacity in guests** (from opening hours until the owner sets their own), table time, lead time, booking window, min/max party online, **blackout dates**, holiday closures. **Table-size matching**: the smallest free table that seats the party for the whole stay is held for the booking. Bookings are taken one at a time per business (row lock), so two guests can't take the last place together |
| Bookings (dashboard) | Day view with prev/next/today, Upcoming, status filters, search by name / phone / booking ID across dates. Confirm, decline or cancel (reason sent to the guest), seated, done, **no-show** (only after the time); auto-confirm option; move to another table (size and clash checked); phone / walk-in bookings with live capacity per time and an "allow over capacity" override. New website bookings ring, toast and badge the nav |
| Guest messages | Request received / confirmed / declined / cancelled and a **reminder** N hours before (`reservations:send-reminders`, scheduled every 5 min), in English or Hindi, on the business's email / WhatsApp / SMS channels |
| Tables & QR codes | Add tables one by one or in bulk (T1–T10), seats and area, switch a table's QR off, **regenerate** a QR (the old sticker stops working), download a QR as PNG, and **print an A4 sheet** of QR cards. Each QR has a secret token (`/t/{token}`) |
| QR dine-in | Scanning opens the menu for that table: a table bar (Table T4 · Waiter · cart / My table) replaces the usual bar, the cart and checkout are locked to dine-in for that table, phone is optional. Every guest at the table adds to the same **running bill**; the table page shows all orders with live status, the bill so far, **Call waiter** and **Request bill** (repeats are merged) |
| Live tables (dashboard) | Board of every table: free / occupied / bill asked, running total, orders in the kitchen, waiter and bill calls (chime + toast + nav badge, marked done in one tap), upcoming booking. **Bill** per table (every order, GST, paid online, to collect) and **Settle & free the table** with cash / UPI / card / online / no charge: orders are completed, pay-later ones marked paid, unpaid online ones released, audited |
| Roles & plans | Front desk and managers run bookings; waiters and cashiers run the table board; owners and managers set up tables (`tables.setup`). Bookings on every plan, QR ordering from Growth up. Kitchen staff see neither |
| Tests | Backend 81 tests / 739 assertions (+ slot capacity, party limits, lead time, blackout/holiday, table matching and moving, weekly slots, staff bookings with override, no-show timing, reminders once, guest lookup/cancel, isolation and roles; QR: running bill across guests, merged waiter calls, bill before ordering, settle closes and frees, fresh bill after, QR off / regenerated, table in use, plan gating, cross-business QR). Frontend 32 unit tests. End-to-end browser run: guest books → owner confirms → guest sees Confirmed; QR scan → order → table page → waiter call on the board → bill settled by UPI → table free |

**Try it:** on http://haveli-demo.localhost:5173/reserve (also Ember, Bistro, Kulhad) book a table, then confirm it as the demo owner under **Bookings**. For QR ordering, open **Tables → Set up & QR codes** as the owner, open a table's link (or scan its QR from a phone on the same network), order, call a waiter, then settle the bill on the **Live** tab.

### Website redesign (before Phase 4)

### Website redesign (before Phase 4)

The public websites were rebuilt on one shared, modern page structure with six themes. Details, tokens, motion rules and the list of placeholders: [docs/DESIGN.md](docs/DESIGN.md).

| Area | What changed |
|---|---|
| Themes | **Haveli Royal**, **Bistro Editorial** and **Street Pop** redesigned. New: **Ember** (dark grill/bar), **Kulhad Warm** (chai café) and **Modern QSR** (burgers/pizza). Each has its own demo business, sample menu, delivery zones and freely licensed photos |
| Design tokens | Colours (incl. surface-2, link, overlay), radii, heading style and motion as CSS variables from `themes/<theme>/tokens.ts`; look switches (card, photo mask, hero layout, dark, playful) as data attributes. WCAG AA checked in tests for every theme; owner colours get white or ink text, whichever reads better |
| Home page | Sticky header (transparent over the photo, blurred on scroll), hero with live Open badge and an info card (today's hours, address, phone), quick actions, signature dishes, story, menu preview tabs, ambience gallery, book-a-table by phone/WhatsApp, visit us (parking, hours with today highlighted, map on request), footer with FSSAI licence and GSTIN (owner's choice) |
| Phones | Bottom bar: Call · WhatsApp (or Directions) · Order/cart |
| Motion | Subtle and the same everywhere: reveal (fade + 24px, 60ms stagger), photo settle and hover zoom, button lift, desktop card tilt and hero parallax, all off with reduced motion. The heavy intros, GSAP and Lenis are gone (smaller pages); Street keeps confetti and the combo builder |
| Style guide | `/style-guide` on any business site: the live tokens, type, buttons/forms/cards with their states, and motion (never indexed). It replaces the old `/motion-lab` |
| Dashboard | Website → Content gains parking, FSSAI licence number and "show GSTIN in the footer" |

### Phase 3

| Area | What works |
|---|---|
| Menu management | Sections (GST per section, show/hide, reorder), dishes with Hindi names, sizes/variants (Half/Full…), extras groups with min/max rules, allergens, spice, bestseller / chef's special, dish photos (WebP), a one-tap **sold-out** switch, reorder, plan limit on dishes, audit log of price changes. **CSV import**: template download, every row validated first (row-by-row errors), then all-or-nothing import. "Remove sample menu" for businesses that started from the Demo menu |
| Ordering on the website | Add to cart from every theme (options dialog for sizes/extras/notes), cart sheet with live server price, menu search + veg-only filter. **Checkout**: delivery / takeaway (dine-in ready for QR in Phase 4), ASAP or a scheduled slot built from opening hours + prep time in the business timezone (holidays skipped), contact, address with pincode or current location, payment method, notes |
| Pricing | Server-side only, in paise: dish/size + extras, GST per line (dish → section → business default; exclusive or inclusive prices), CGST/SGST split, packaging charge, delivery fee by zone with minimum order and free-delivery threshold. The browser never sends prices |
| Delivery zones | By pincode list or by distance (radius from the restaurant's location) |
| Payments | Cash on delivery / pay at counter, and **Razorpay** with the business's own keys (secrets encrypted, never returned): server-created Razorpay order, Checkout signature verification, signed **webhook** (payment.captured / order.paid / payment.failed, idempotent), unpaid online orders released after 30 min (`orders:expire-unpaid`, scheduled), late payments flagged refund-due. Card/UPI data never touches DineDesk |
| Order tracking | Private link per order (`/order/{id}?t=…`): live status timeline (polling every 10 s), bill, payment state, call-the-restaurant |
| Staff | **Orders** board (New / In the kitchen / Ready) with one-tap next step, cancel with reason (audited, refund-due for paid orders), detail with items/extras/notes, address + directions, history; search, filters, list views. New orders: chime (Web Audio), toast, nav badge, optional desktop notification — polled every 8 s (WebSockets come with the KDS in Phase 5) |
| Notifications | Customers: order received / confirmed / ready / out for delivery / completed / cancelled, in English or Hindi, by email and/or WhatsApp/SMS through a configurable provider (`MESSAGING_DRIVER`, `log` in development), queued. Staff: in-app alerts |
| Street extras | Chilli confetti on add-to-cart, cart bounce, and a **combo builder** (one pick per section, price = plain sum) |
| Demo businesses | All three take real test orders (COD/counter) with delivery zones (e.g. Street: Bandra pincodes 400050–400052). Dish photos are freely licensed Wikimedia Commons images of those dishes, credited on every page (`backend/database/seeders/demo-photos/credits.json`); dishes without a correct photo keep the drawn illustration |
| Tests | Backend 71 tests / 570 assertions (pricing & GST maths incl. inclusive prices and rounding, option rules, zones/minimums, full order lifecycle, opening-hours & scheduling rules, Razorpay signature + webhook + expiry, cross-business isolation, menu CRUD/limits/photos, CSV import). Frontend 28 unit tests (schedule slots, cart, plus Phase 2). End-to-end browser run: options → cart → delivery checkout → staff moves the order through every status while the customer's page follows → sold-out switch reaches the site |

Lighthouse after Phase 3 (production build, mobile simulation, this PC): Accessibility 100 on the menu, home and checkout pages of all themes; CLS 0; TBT 0 ms. Performance 57–59 — LCP is now the real dish/cover photos, which in this setup are served one at a time by `php artisan serve`. Serve `/storage` from Nginx (or a CDN) in production, and see the pre-rendering note below.

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
# in two more terminals (customer emails/WhatsApp and releasing unpaid online orders):
php artisan queue:work
php artisan schedule:work
php artisan reverb:start --port=8080   # live updates (optional: screens poll without it)

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
| http://haveli-demo.localhost:5173 | **Demo** site, Haveli Royal theme (Chrome/Firefox resolve `*.localhost` automatically) |
| http://ember-demo.localhost:5173 | **Demo** site, Ember theme |
| http://bistro-demo.localhost:5173 | **Demo** site, Bistro Editorial theme |
| http://kulhad-demo.localhost:5173 | **Demo** site, Kulhad Warm theme |
| http://qsr-demo.localhost:5173 | **Demo** site, Modern QSR theme |
| http://street-demo.localhost:5173 | **Demo** site, Street Pop theme |
| http://haveli-demo.localhost:5173/style-guide | Style guide of that site's theme (works on every business site) |
| http://localhost:5173/kitchen | Kitchen Display (signed in as a kitchen-capable user) |
| http://localhost:5173/waiter/ | Waiter phone app (installable PWA) |
| http://localhost:5173/dashboard/pos | POS and billing · `/dashboard/day-end` for the day-end report |
| demo-owner@example.com (Haveli), demo-ember@, demo-bistro@, demo-kulhad@, demo-qsr@, demo-street@example.com / DemoOwner2026 | Demo business owners (development seed only; never created when APP_ENV=production) |

Add `?preview=1&preview_theme=street` to a business site inside the dashboard's iframe to see the live preview mode; outside an iframe the flag is ignored.

**Try an order:** open a demo site during its hours (Haveli 11:00–23:00, Ember 12:00–23:30, Bistro 08:00–22:00, Kulhad 07:00–22:00, QSR 11:00–01:00, Street 12:00–01:00 IST — otherwise schedule it for later), add dishes, check out with delivery to pincode `302001` (Haveli), `122002` (Ember), `560034` (Bistro), `226001` (Kulhad), `411001` (QSR) or `400050` (Street), then sign in as that demo's owner and open **Orders**. Customer messages are written to `backend/storage/logs/laravel.log` in development. To try Razorpay, paste your own **test** keys in Dashboard → Ordering.

Mobile OTP in development: codes are written to `backend/storage/logs/laravel.log`, and shown on screen when `APP_ENV=local` and `OTP_DEV_ECHO=true`. No SMS provider is connected yet.

## Tests

```bash
cd backend && php artisan test     # uses the dinedesk_test database
cd frontend && npm test            # vitest
cd frontend && npm run typecheck
```

Key backend suites: `Tenancy/TenantIsolationTest` (ORM + API isolation), `Identity/*` (auth, OTP, roles), `Onboarding/*` (incl. `SiteSetupTest`: steps 4–7, slug rules), `Website/WebsiteTest` (themes, content, uploads, isolation, holidays, robots/sitemap), `Plans/FeatureGatingTest`, `Platform/SuperAdminTest`, `Ordering/*` (pricing, lifecycle, payments), `Reservations/ReservationTest`, `Tables/QrOrderingTest`, `Operations/*` (kitchen, billing, floor, day-end).

## Architecture notes

- **Modules** (`backend/app/Modules`): Tenancy, Identity, Onboarding, Settings, Plans, Platform, Audit, Website (themes, content, gallery, public site, SEO files), Menu (menu management, CSV import, sample menus), Ordering (pricing, delivery zones, orders, Razorpay, notifications), Tables (tables, QR tokens, running table sessions, waiter/bill requests, floor plan), Reservations (slots, availability, bookings, reminders), Kitchen (KOT tickets), Billing (POS orders, GST bills, payments, day-end). Live updates go through `AppSupportRealtimeive` (reverb). Each has its own routes, models and controllers; business logic lives in Actions/Services.
- **Tenant isolation**: tenant-owned models use `BelongsToTenant` → `TenantScope`. No tenant in context ⇒ queries return nothing. Cross-tenant reads only via explicit `Model::withoutTenancy()` in super admin code.
- **Feature gating**: `FeatureService` merges plan features with super-admin overrides; the same map is returned by `/auth/me` for the UI.
- **Time**: stored in UTC, shown in the business's timezone (default Asia/Kolkata).
- **Public website delivery**: `/robots.txt` and `/sitemap.xml` must reach Laravel with the visitor's host (the Vite dev/preview proxy sets `X-Tenant-Host`; in production route those two paths to the backend). The dashboard previews the site in an iframe on the business's subdomain, so don't send `X-Frame-Options: DENY` for business sites (allow the platform origin via `frame-ancestors`).
- **Laravel 12** is used instead of 11: Composer blocks every Laravel 11 release over published security advisories. The structure is identical.
- **Development cache/queues** use the database (no Redis on XAMPP/Windows). Production uses Redis, Horizon and Reverb (Phases 5 and 8).

## Next: future work (from the master plan)

Swiggy / Zomato order sync, Tally export, native mobile apps on the same API, AI menu descriptions and photo enhancement, AI sales insights, more themes via the registry. Before launch: set plan prices and the platform's invoice details, add live Razorpay keys, and deploy with docs/DEPLOYMENT.md.

## Done: Phase 8 — SaaS billing & scale

See the Phase 8 section above.

## Done: Phase 7 — Hotel module

See the Phase 7 section above.

## Done: Phase 6 — Growth features

See the Phase 6 section above.

## Done: Phase 5 — Operations

See the Phase 5 section above.

## Done: Phase 4 — Reservations & QR table ordering

See the Phase 4 section above.
