# DineDesk — kaise kaam karta hai

Yeh document batata hai ki DineDesk kya hai, isme kaun kaun se feature hain, har feature kaise kaam karta hai, aur abhi kya baaki hai. Technical setup (server, deploy) ke liye `docs/DEPLOYMENT.md` aur `README.md` dekhiye.

---

## 1. DineDesk kya hai

DineDesk ek **online software (SaaS)** hai jo restaurant, café, cloud kitchen aur hotel ke liye bana hai. Ek hi platform par bahut saare business (har ek alag) apna kaam chala sakte hain:

- har business ki **apni website** (apne naam ke address par),
- **online order, table booking, room booking**,
- dukaan ke andar **POS billing (GST ke saath), kitchen screen, waiter app**,
- **stock, hisaab, reports, staff, delivery riders**,
- aur ek **Android app** jo grahak aur owner dono ke kaam aati hai.

DineDesk ka malik (aap) **Super Admin** hai: saare business dekh sakta hai, plan aur keemat set karta hai, aur restaurants se subscription ka paisa leta hai.

---

## 2. Kaun kaun use karta hai

| Kaun | Kahan se | Kya karta hai |
|---|---|---|
| **Grahak (guest)** | Restaurant ki website ya DineDesk app | Menu dekhna, order, table/room booking, order track karna |
| **Owner** | Dashboard (`/dashboard`) | Sab kuch: menu, website, orders, billing, staff, reports, settings |
| **Manager** | Dashboard | Owner jaisa, par plan/billing aur staff banana nahi |
| **Cashier** | Dashboard → POS | Billing, payment, orders |
| **Waiter** | Waiter app (`/waiter/`) | Table par order lena, kitchen bhejna |
| **Kitchen** | Kitchen screen | Aaye hue orders (KOT) dekhna, "ready" karna |
| **Front desk** (hotel) | Dashboard → Hotel | Check-in, check-out, room bill |
| **Housekeeping** (hotel) | Dashboard → Hotel | Kamron ki safai ka status |
| **Delivery rider** | Rider screen (`/rider/`) | Duty, delivery, location share |
| **Super Admin** | Super admin panel (`/platform`) | Saare business, plans, revenue, keys, support |

Har role ko sirf wahi dikhta hai jiski use permission hai.

---

## 3. Kaise bana hai (simple bhasha mein)

```
 Grahak / Owner / Staff  ──►  Website + Dashboard (React)  ──►  Backend API (Laravel)  ──►  Database (MySQL)
        (phone, PC, app)          browser me chalta hai             saara logic yahan        saara data yahan
```

- **Backend (Laravel, PHP):** saara kaam yahin hota hai — order banana, GST lagana, paisa, messages, permission check. Har business ka data alag rehta hai; ek business doosre ka data kabhi nahi dekh sakta.
- **Frontend (React):** website, dashboard, app ki screens.
- **Live updates (Reverb):** naya order aate hi kitchen/POS/dashboard bina refresh ke update hote hain.
- **Queue:** WhatsApp/email messages background me bheje jaate hain taaki screen dheemi na ho.
- **Scheduler:** har kuch minute/roz chalne wale kaam (niche list hai).
- **Website server (SSR):** restaurant ki website Google ke liye server par pehle se ban kar jaati hai, taaki jaldi khule aur search me aaye.
- **Address:** har business ko `naam.dinedesk-domain` milta hai; chahe to apna domain (jaise `myrestaurant.in`) bhi laga sakta hai, HTTPS apne aap.

---

## 4. Features aur woh kaise kaam karte hain

### 4.1 Shuruaat (signup aur onboarding)
1. Owner email ya mobile (OTP) se account banata hai. Referral link se aaya ho to "Invited by …" dikhta hai.
2. **7 step setup:** account → business ka type → details (timing, GSTIN) → theme chunna (live preview) → logo/rang/tagline → **menu** → subdomain chunkar **Go live**.
3. Menu step me teen raste: **"Menu photo se AI padhe"** (printed menu ki photo/PDF → AI dishes aur daam nikalta hai → owner check karke save), **sample menu** ("Demo" label ke saath), ya **skip**.
4. Live hote hi QR code print karne ka page milta hai. Dashboard par **"Get started" checklist** dikhti hai (dishes, timing, logo, ordering, UPI, team) jab tak sab na ho jaye.
5. Naye business ko **14 din ka Growth trial** milta hai.

### 4.2 Restaurant ki website
- **8 design (theme):** Haveli (Rajasthani), Rajwada (heritage hotel), Ember (grill/dark), Bistro (café), Kulhad (chai), QSR (fast food), Street (street food), Coastal (South Indian). Owner ek chunta hai, rang/logo khud badal sakta hai.
- **Pages:** Home, Menu, About, Gallery, Contact, Offers, Book a table, Rooms (hotel), Events, Tiffin.
- **Phone par app jaisa:** neeche tabs (Home, Menu/Rooms, Cart, Profile), "Open now/Closed" badge, Call/WhatsApp/Directions buttons.
- **Menu:** veg/non-veg/egg nishaan, mirch, bestseller, sold-out, veg-only filter, search, half/full jaise size, extras.
- **12 bhashayein:** English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu (right-to-left), Kannada, Odia, Malayalam, Punjabi. Grahak bhasha chunta hai; dish ke naam bhi owner ne translate kiye ho to usi bhasha me.
- **Google (SEO):** har page ka apna title/description, har bhasha ka alag page, sitemap, robots, Google ke liye restaurant/hotel/menu ki structured jaankari. Private pages (cart, checkout, tracking) Google me nahi aate. Nakli rating kahin nahi.

### 4.3 Online order (delivery / takeaway / dine-in)
1. Grahak dish cart me daalta hai → checkout par naam, phone, address (delivery) bharta hai, abhi ya baad ka samay chunta hai, coupon lagata hai.
2. **Delivery zone** ke hisaab se delivery charge; GST aur packaging apne aap.
3. **Payment:** cash on delivery, counter par, **Razorpay** (UPI/card — paisa seedha restaurant ke apne Razorpay me), ya **apne UPI ID par** (GPay/PhonePe; staff confirm karta hai).
4. Order dashboard me **ghanti** ke saath aata hai → staff confirm karta hai → **kitchen ko KOT** jaata hai → ready → out for delivery → completed.
5. Har step par grahak ko **WhatsApp/email message** jaata hai, **grahak ki bhasha me**. Grahak tracking page par status aur (delivery me) rider ka location dekh sakta hai.
6. **WhatsApp order:** grahak cart seedha restaurant ke WhatsApp par bhi bhej sakta hai.
7. **Swiggy/Zomato orders:** POS me haath se darj karte hain, commission P&L me aata hai (seedha jodna unki approval ke bina sambhav nahi).

### 4.4 Table par QR order
- Har table ka apna QR. Grahak scan karke menu kholta hai, order karta hai, **waiter bulana / bill maangna** button dabata hai.
- Dashboard → Tables par live dikhta hai: kaun si table bhari hai, kaun bula raha hai. Floor plan bhi bana sakte hain.

### 4.5 Table booking (reservation)
- Grahak din, samay, log chunta hai → request jaati hai → staff confirm/decline karta hai → grahak ko message.
- Booking se kuch ghante pehle **reminder** apne aap.

### 4.6 POS billing (dukaan ka counter)
- Order lena, kitchen bhejna, **GST invoice** (INV/FY/0001 jaisa number), discount (wajah ke saath), **split payment**, buyer ka GSTIN.
- **Din band (day-end)** report PDF.
- **Internet chala jaye to bhi billing** chalti rehti hai; internet aate hi bills apne aap sync (koi bill do baar nahi banta).
- **Printer:** 58/80 mm thermal printer par KOT aur bill; har device ki apni setting.

### 4.7 Kitchen screen
- Naye orders card ki tarah aate hain, "start" → "ready". **Stations** (jaise tandoor, chinese) — har section ka order sahi station par.

### 4.8 Hotel (Pro plan)
- **Room types** (photo, daam, weekend daam, season ke daam, extra guest charge), kamre bulk me jodna, har kamre ka QR.
- **Booking engine:** grahak dates chunkar room book karta hai.
- **Front desk:** check-in, folio, check-out par GST bill. **Housekeeping** status. **Room service** QR se (PIN ke saath).
- **Events/banquet** enquiry. **Occupancy report.**
- **Calendar sync (iCal):** Airbnb/Booking.com waghera se availability har 30 minute me sync.

### 4.9 Tiffin (mess/meal subscription)
- Grahak website se plan maangta hai → staff activate karta hai → pause/resume/cancel. Har badlaav par grahak ko message. Subah ki report me aaj ke meals.

### 4.10 Delivery riders (tracking)
1. Owner team me **Delivery rider** jodta hai; delivery order rider ko assign karta hai (rider ko alert).
2. Rider app me **"Duty shuru"** karta hai → **har 5 minute me location** (app band ho ya screen off ho tab bhi) — duty khatam = tracking band.
3. Owner ka **Riders page:** naqshe par saare riders, aakhri location kab mili, battery, aaj ka raasta.
4. Grahak ko tracking page par sirf apne order ke rider ki location (out for delivery ke dauraan).
5. Location sirf duty me save hoti hai, 7 din baad delete; duty 14 ghante baad apne aap band.

### 4.11 Stock, kharid, hisaab
- **Inventory:** saamaan, stock, recipe (kaun si dish me kitna), kam stock alert.
- **Suppliers aur purchase orders:** supplier ko WhatsApp par order, kitna dena baaki.
- **Profit & Loss:** bikri, food cost, kharche, Swiggy/Zomato commission.
- **Reports:** bikri, top dishes, ghante ke hisaab se; CSV.
- **GST:** mahine ka GSTR-1 data (B2B, B2CS, HSN) aur **Tally** ke liye XML — CA ke liye.

### 4.12 Grahak aur marketing
- **Customers:** har grahak ke orders, visits.
- **Coupons, loyalty points** (SMS OTP se), **gift cards**, website **banner/offer**.
- **Campaigns** (sirf jinhone haan kaha), **automatic messages** (birthday, anniversary, kaafi din se nahi aaye), Google review maangna.
- **Reviews:** sirf asli, grahak ki permission wale aur owner ke publish kiye.

### 4.13 Staff
- **Team:** staff jodna (email ya mobile), role dena. Plan ke hisaab se limit.
- **Shifts aur attendance (rota).**
- **Alerts:** staff ke phone/browser par push alert (naya order, booking) — har staff ki apni bhasha me.

### 4.14 Owner ke liye extra
- **Subah ki report (Morning summary):** kal ki bikri, orders, top dishes, bookings, occupancy, tiffin, kam stock — WhatsApp/email par, chune hue samay (7–11 baje) par, owner ki bhasha me. Shuru me band; owner chalu karta hai.
- **Menu ki bhashayein:** Dashboard → Menu → Languages: har dish/section/room/offer/website text ka translation, **"AI se bharo"** button, owner check karke save.
- **Referral:** Billing page par apna link; us link se aaya business pehli baar paise de to **dono ko 30 din free**.
- **Branches:** ek se zyada outlet (Pro).
- **Apna domain:** custom domain jodna, HTTPS apne aap.
- **Data download:** menu, orders, grahak ki copy.
- **My account:** naam, email, mobile (OTP), password, bhasha.

### 4.15 Dashboard ko aasaan banane wali cheezein
- **Search (Ctrl+K / upar search):** kuch bhi likho — "printer", "bill", "upi", "chutti", "hisab" — seedha sahi page/tab/dialog khulta hai. Dish, order number, grahak, booking bhi.
- **Settings page:** saari settings ek jagah cards me.
- Saaf groups: Aaj (orders, bookings, tables, POS, kitchen, riders), Menu aur kamre, Grahak aur offers, Paisa, Website, Settings.

### 4.16 DineDesk app (Android) — ek hi app sab ke liye
- Kholte hi: **grahak** ke liye restaurant/hotel dhundho (naam/shahar), **QR scan**, haal me dekhe; **business** ke liye Sign in / Free trial.
- Restaurant ki site app me app jaisi dikhti hai (upar back button aur title).
- App me photo upload, QR camera, PDF/CSV download, bill print, WhatsApp/call/UPI/Maps links, internet na ho to "Retry" page.
- Rider ke liye background location service.
- **App notifications (Firebase):** sign in kiye owner/staff/rider/super admin ko naye order, booking, tiffin request, rider job wagaira ke alert app mein (web push app ke andar nahi chalta). My account → "Alerts on this device" mein "Allow notifications".
- Owner apna business app ki list se chhupa sakta hai.

### 4.17 Plans aur subscription (DineDesk ki kamai)
| Feature | Starter | Growth | Pro |
|---|---|---|---|
| Website, theme, online order, table booking | ✅ | ✅ | ✅ |
| QR order, kitchen screen, POS, tables, inventory, loyalty, coupons, apna domain | — | ✅ | ✅ |
| Hotel, multi-branch | — | — | ✅ |
| Menu dishes | 50 | unlimited | unlimited |
| Staff accounts (owner ke alawa) | 2 | 10 | unlimited |

- Keemat Super Admin → Plans me **aap tay karenge** (abhi khaali hai).
- Paisa **Razorpay subscription** se. Trial ke beech pay kare to pehla charge trial khatam hone par.
- Payment fail → kuch din grace → phir **read-only** (data dikhta hai, badal nahi sakte) jab tak payment na ho.
- Har payment ka DineDesk ki taraf se GST invoice.

### 4.18 Super Admin panel (`/platform`)
- **Businesses:** list, search, status/plan badalna (wajah ke saath), feature on/off, activity.
- **Open dashboard (support mode):** kisi business ka dashboard usi tab me kholna — wajah likhni padti hai, default sirf dekhna, upar laal patti aur "Back to super admin". Sab audit log me.
- **Revenue:** MRR, payments.
- **Plans:** keemat aur feature.
- **Integrations:** platform ki keys — Razorpay, AI (Anthropic), WhatsApp, SMS (MSG91), email (SMTP), web push — har ek me **Test** button. Keys encrypted, dobara nahi dikhti, save karne par password.
- **Settings:** aapki company ki details (invoice ke liye), GST, grace days.

---

## 5. Apne aap chalne wale kaam (scheduler)

| Kaam | Kab |
|---|---|
| Bina payment ke purane online orders band karna | har 5 min |
| Table booking reminder | har 5 min |
| Hotel ki adhoori booking chhodna | har 5 min |
| Hotel calendar sync (iCal) | har 30 min |
| Subscription check (grace / read-only) | har ghante |
| Owner ki subah ki report | har ghante (jiska samay ho) |
| Marketing automatic messages | roz 10 baje |
| Database backup | roz 2:30 |
| Hotel guest ID documents purane delete | roz 3:30 |
| Rider ki purani locations delete | roz 3:45 |
| Purane data-export files delete | roz 4:00 |

---

## 6. Suraksha

- Har business ka data alag; doosre business ka id daalne par "not found".
- Har screen aur API par permission check (role ke hisaab se).
- Paise ki keys aur secrets encrypted; dobara poore nahi dikhte.
- Login OTP/password; zyada galat koshish par rok (rate limit).
- Super admin ka har support session aur zaroori badlaav **audit log** me.
- Grahak ki private jaankari (phone, address) public pages par nahi.

---

## 7. Abhi local (PC) par test kaise karein

- **Servers:** `scripts/dev-servers.ps1` (watchdog) — MySQL, backend, website, live updates, queue, scheduler chalu rakhta hai; PC restart par apne aap. Band karne ke liye `scripts/dev-servers-stop.ps1`.
- **PC par:** http://localhost:5180 — **phone par (same Wi-Fi):** http://192.168.1.42:5180/app (firewall rule zaroori, admin PowerShell me ek baar).
- **APK:** `android/apk/DineDesk-local.apk`.
- **Demo logins** (sirf local; live par nahi banenge):

| Kaun | Email | Password |
|---|---|---|
| Super Admin | owner@example.com | DineDesk@Admin2026 |
| Haveli Demo (restaurant, delivery) | demo-owner@example.com | DemoOwner2026 |
| Hotel Demo | demo-hotel@example.com | DemoOwner2026 |
| Coastal Demo | demo-coastal@example.com | DemoOwner2026 |
| Delivery rider (Haveli Demo) | demo-rider@example.com | DemoOwner2026 |
| Baaki demo | demo-ember / demo-bistro / demo-kulhad / demo-qsr / demo-street @example.com | DemoOwner2026 |

---

## 8. Live karne ke liye kya chahiye

| Kya | Kaun karega |
|---|---|
| Domain (jaise dinedesk.in) aur server (VPS, 2–4 GB) | Aap (kharidna) |
| Server par setup, HTTPS, backup, scheduler, website server | Developer (guide: `docs/DEPLOYMENT.md`) |
| Plan ki keemat, aapki company/GST details | Aap (Super Admin panel) |
| Razorpay live keys + webhook events | Aap (Super Admin → Integrations) |
| AI key (Anthropic) | Aap (Integrations) |
| WhatsApp Business (Meta) + SMS (MSG91, DLT) | Aap (Integrations) |
| Play Store app (domain ke baad) | Developer |
| Firebase project (app notifications): `google-services.json` + service account key | Aap (Firebase console) + Developer (app build) |
| Google Search Console me sitemap | Aap/Developer |

---

## 9. Abhi kya baaki hai / seemayein

- **App notifications (Firebase):** code ban gaya (app + server + Integrations card); chalu karne ke liye Firebase project aur do files chahiye — `google-services.json` (`android/webview-app/app/`, phir app dobara build) aur service account key (Super Admin → Integrations → Firebase). Tab tak alerts browser web push aur WhatsApp/email se.
- **Swiggy/Zomato, ONDC, Google Business Profile, MakeMyTrip:** seedha jodne ke liye unki partner approval chahiye; abhi Swiggy/Zomato orders haath se POS me.
- **PDF tax invoice** English me (PDF library Indian lipi theek se nahi jodti); browser se print hone wali receipt kisi bhi bhasha me.
- **Translations** AI ke banaye hue — launch se pehle native speaker se padhwana.
- **QR camera** sirf HTTPS (live domain) par; local test version me address type karna padta hai.
- Rider tracking aur app ki kuch cheezein asli phone par test baaki (permission, screen off).
- Kuch phones (Xiaomi, Oppo, Vivo) app ko band kar dete hain — rider ko battery setting "Unrestricted" karni hogi.
- Naqsha OpenStreetMap (free) — bahut zyada use par paid map service.
