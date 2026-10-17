# DineDesk ko live karna — poori process

Yeh document batata hai ki DineDesk ko internet par live karne ke liye **kya kharidna hai**, **server par kya install karna hai**, aur **step-by-step kya karna hai**. Har config file ka poora text `docs/DEPLOYMENT.md` mein hai; yahan process aur list hai.

Neeche har jagah `dinedesk.in` likha hai — isko apne asli domain se badal dijiye.

---

## 1. Pehle kya kharidna / banana hai

| # | Cheez | Kahan se | Kab chahiye | Kharcha (andaaza) |
|---|---|---|---|---|
| 1 | **Domain** (jaise `dinedesk.in`) | GoDaddy, Hostinger, BigRock, Namecheap | Sabse pehle | ~₹800–1,200 / saal |
| 2 | **VPS server** — Ubuntu 24.04, **4 GB RAM, 2 vCPU, 80 GB SSD** | Hostinger VPS, DigitalOcean, Hetzner, AWS Lightsail | Sabse pehle | ~₹600–1,500 / mahina |
| 3 | **Razorpay account** (live, KYC done) | razorpay.com | Restaurants se subscription ka paisa lene ke liye | Har payment par Razorpay fee |
| 4 | **Anthropic API key** | console.anthropic.com | AI menu import aur AI translation | Use ke hisaab se |
| 5 | **WhatsApp Business (Meta Cloud API)** — verified business, ek phone number, ek message template | business.facebook.com | Order/booking messages, subah ki report | Meta ka per-message charge |
| 6 | **MSG91** + **DLT registration** (India mein SMS ke liye zaroori) | msg91.com, Jio/Airtel/Vi DLT portal | Mobile OTP login | Per SMS |
| 7 | **Email (SMTP)** — jaise Zoho Mail, Google Workspace, Amazon SES, Brevo | — | Order/booking emails, invoice | Free se ~₹100 / mahina |
| 8 | **Backup storage** — Backblaze B2 / AWS S3 / Google Drive | — | Roz ka backup server ke bahar rakhne ke liye | Bahut kam |
| 9 | **Google Play Developer account** | play.google.com/console | Android app Play Store par | $25 ek baar |
| 10 | **Firebase project** (free) | console.firebase.google.com | App notifications (code ready hai, sirf project + 2 files chahiye) | Free |

> Keemat sirf andaaza hai — kharidne se pehle provider ki site par dekh lijiye.

**Faisle jo aapko lene hain:** domain ka naam, plan ki keemat (Starter / Growth / Pro, mahine aur saal ki), aapki company ka legal naam, GSTIN, address, invoice prefix.

---

## 2. Server par kya install hoga (software / library list)

### 2.1 Server software

| Software | Version | Kis kaam ka |
|---|---|---|
| **Ubuntu** | 24.04 LTS | Server ka operating system |
| **Caddy** | 2.x | Sabse aage: har domain/subdomain/custom domain par **apne aap HTTPS** (on-demand TLS) |
| **Nginx** | distro wala | Website files aur API ko PHP tak bhejna |
| **PHP-FPM + PHP CLI** | **8.3** (kam se kam 8.2) | Backend (Laravel) chalana |
| PHP extensions | `mysql, redis, mbstring, xml, curl, zip, gd, intl, bcmath, pcntl` | Database, cache, PDF, photos (WebP), Hindi/Indian text, paisa calculation, background workers |
| **Composer** | 2.x | PHP libraries install karna |
| **Node.js + npm** | **22** LTS | Frontend build karna aur website server (SSR) chalana |
| **MySQL** | 8 (ya MariaDB 10.6+) | Database |
| **Redis** | 7 | Cache, login session, queue |
| **Supervisor** | distro wala | Background programs hamesha chalu rakhna (queue, live updates, website server) |
| **cron** | Ubuntu mein pehle se | Scheduler har minute chalana |
| **git, unzip** | — | Code laana |
| **mysqldump** | MySQL ke saath aata hai | Roz ka database backup |
| **rclone** | latest | Backup server ke bahar (S3/B2/Drive) copy karna |
| **ufw** | Ubuntu mein pehle se | Firewall (sirf 22, 80, 443 khule) |

### 2.2 Backend (PHP) libraries — `composer install` apne aap daalta hai

| Library | Kis kaam ka |
|---|---|
| `laravel/framework` 12 | Poora backend |
| `laravel/sanctum` | Login tokens |
| `laravel/reverb` | Live updates (naya order bina refresh) |
| `laravel/horizon` | Queue workers (sirf server par: `composer require laravel/horizon`) |
| `spatie/laravel-permission` | Roles aur permissions |
| `barryvdh/laravel-dompdf` | PDF bills, day-end report, invoice |
| `intervention/image` | Photo chhoti karna, WebP banana |
| `minishlink/web-push` | Staff ko browser push alert |
| `anthropic-ai/sdk` | AI (menu photo padhna, translation) |

### 2.3 Frontend (JavaScript) libraries — `npm ci` apne aap daalta hai

React 18, React Router, TanStack Query, Zustand, React Hook Form + Zod, i18next (12 bhashayein), laravel-echo + pusher-js (live updates), Recharts (graphs), Leaflet (rider ka naqsha), QRCode, Motion (animation), Lucide icons, aur theme ke fonts (@fontsource).

---

## 3. Live karne ki process — step by step

### Step 1 — DNS (domain provider ke panel mein)

| Record | Value |
|---|---|
| `dinedesk.in` **A** | server ka IP |
| `*.dinedesk.in` **A** | server ka IP (har restaurant ko `naam.dinedesk.in`) |
| `sites.dinedesk.in` **A** | server ka IP (restaurant apna domain isi par CNAME karega) |

DNS failne mein kuch minute se kuch ghante lag sakte hain.

### Step 2 — Server software install karna

```bash
sudo apt update && sudo apt install -y nginx mysql-server redis-server supervisor unzip git \
  php8.3-fpm php8.3-cli php8.3-mysql php8.3-redis php8.3-mbstring php8.3-xml php8.3-curl \
  php8.3-zip php8.3-gd php8.3-intl php8.3-bcmath php8.3-pcntl
curl -sS https://getcomposer.org/installer | php && sudo mv composer.phar /usr/local/bin/composer
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs
# Caddy: https://caddyserver.com/docs/install#debian-ubuntu-raspbian
sudo apt install -y rclone
```

### Step 3 — Database aur Redis

```sql
CREATE DATABASE dinedesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'dinedesk'@'localhost' IDENTIFIED BY 'lamba-random-password';
GRANT ALL ON dinedesk.* TO 'dinedesk'@'localhost';
```

Redis: `/etc/redis/redis.conf` mein `requirepass` lagaiye, aur use sirf `127.0.0.1` par rakhiye.

### Step 4 — Code laana aur backend setup

```bash
sudo mkdir -p /var/www && sudo chown $USER:www-data /var/www
git clone https://github.com/niteshkvakilkaro-hash/dinedesk.git /var/www/dinedesk
cd /var/www/dinedesk/backend
composer install --no-dev --optimize-autoloader
composer require laravel/horizon && php artisan horizon:install
cp .env.example .env && php artisan key:generate
```

`.env` mein production values bharni hain (poori list `docs/DEPLOYMENT.md` → "`.env` (production values)"). Sabse zaroori:

```ini
APP_ENV=production
APP_DEBUG=false
APP_URL=https://dinedesk.in
PLATFORM_DOMAIN=dinedesk.in
DB_DATABASE=dinedesk
DB_USERNAME=dinedesk
DB_PASSWORD=...
CACHE_STORE=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
REDIS_PASSWORD=...
BROADCAST_CONNECTION=reverb
REVERB_APP_KEY=<random>   REVERB_APP_SECRET=<random>   REVERB_HOST=dinedesk.in  REVERB_PORT=443  REVERB_SCHEME=https
CUSTOM_DOMAIN_TARGET=sites.dinedesk.in
CUSTOM_DOMAIN_IPS=<server IP>
SUPER_ADMIN_EMAIL=aapka@email.in
SUPER_ADMIN_PASSWORD=<strong password — pehle login ke baad .env se hata dein>
```

> Razorpay, AI, WhatsApp, SMS, email ki keys `.env` mein daalne ki zaroorat nahi — live hone ke baad **Super Admin → Integrations** mein daal sakte hain.

Phir:

```bash
php artisan migrate --force
php artisan db:seed --class=PlanSeeder --force
php artisan db:seed --class=RoleSeeder --force
php artisan db:seed --class=SuperAdminSeeder --force
php artisan storage:link
php artisan config:cache && php artisan route:cache && php artisan view:cache
sudo chown -R $USER:www-data storage bootstrap/cache && sudo chmod -R ug+rwX storage bootstrap/cache
```

**Kabhi bhi `DemoTenantSeeder` production par mat chalaiye** (demo restaurants sirf test ke liye hain).

`bootstrap/app.php` mein proxy trust jodiye (sahi IP ke liye): `$middleware->trustProxies(at: '127.0.0.1');`

### Step 5 — Frontend build

```bash
cd /var/www/dinedesk/frontend
cat > .env.production <<'EOF'
VITE_PLATFORM_DOMAIN=dinedesk.in
VITE_REVERB_APP_KEY=<wahi jo REVERB_APP_KEY>
VITE_REVERB_HOST=dinedesk.in
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https
EOF
npm ci && PRERENDER_API_URL=https://dinedesk.in/api/v1 npm run build
```

Isse banta hai: `dist/` (app), `dist/_marketing/` (DineDesk ki marketing pages, Google ke liye), `dist-site-ssr/` (restaurant websites ka server renderer).

### Step 6 — Nginx

`/etc/nginx/sites-available/dinedesk` mein `docs/DEPLOYMENT.md` → **section 5** wala poora config copy kijiye (domain badal kar), phir:

```bash
sudo ln -s /etc/nginx/sites-available/dinedesk /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### Step 7 — Caddy (HTTPS apne aap)

`/etc/caddy/Caddyfile` mein `docs/DEPLOYMENT.md` → **section 6** wala config (email aur domain badal kar), phir `sudo systemctl reload caddy`.
Caddy har naye restaurant subdomain aur verified custom domain ka certificate **apne aap** banata hai.

### Step 8 — Background programs (Supervisor)

`/etc/supervisor/conf.d/dinedesk.conf` mein `docs/DEPLOYMENT.md` → **section 7** wala config. Teen programs:

| Program | Kaam |
|---|---|
| `horizon` | Queue: WhatsApp/email/SMS messages, notifications |
| `reverb` | Live updates (port 8080) |
| `site-ssr` | Restaurant websites ka server renderer (port 3005) |

```bash
sudo supervisorctl reread && sudo supervisorctl update && sudo supervisorctl status
```

### Step 9 — Scheduler (cron)

```cron
* * * * * www-data cd /var/www/dinedesk/backend && php artisan schedule:run >> /dev/null 2>&1
```

Isse yeh kaam apne aap chalte hain: unpaid orders band, booking reminder, hotel calendar sync, subscription check, owner ki subah ki report, marketing messages, roz backup, purane rider locations / exports delete. (`php artisan schedule:list` se dekh sakte hain.)

### Step 10 — Firewall

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

### Step 11 — Backup server ke bahar

```bash
rclone config      # Backblaze / S3 / Google Drive jodna (ek baar)
```

cron mein:

```cron
45 2 * * * www-data rclone sync /var/www/dinedesk/backend/storage/app/private/backups remote:dinedesk-backups
15 3 * * * www-data rclone sync /var/www/dinedesk/backend/storage/app/public remote:dinedesk-uploads
```

**`.env` file (khaaskar `APP_KEY`) ki copy alag aur surakshit jagah rakhiye** — iske bina encrypted keys aur hotel guest documents nahi khulenge.

---

## 4. Live hone ke baad Super Admin panel mein setup

1. `https://dinedesk.in/login` par super admin email/password se login → `/platform`.
2. **Settings:** company ka legal naam, GSTIN, state code, address, email, phone, invoice prefix, grace days.
3. **Plans:** Starter / Growth / Pro ki mahine aur saal ki keemat (GST se pehle).
4. **Integrations** (har ek ke baad **Test** dabaiye):
   - **Razorpay:** Key ID, Key secret, Webhook secret. Razorpay dashboard → Webhooks mein URL `https://dinedesk.in/api/v1/webhooks/razorpay-platform` aur yeh events chalu karein: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`.
   - **AI (Anthropic):** API key.
   - **WhatsApp:** access token, phone number ID, template naam (template ki body mein ek hi variable `{{1}}`, category Utility), template bhasha.
   - **SMS (MSG91):** auth key, OTP template ID (DLT approved).
   - **Email (SMTP):** host, port, user, password, from address/name.
   - **Web push:** "Generate keys".
   - **Firebase (app notifications):** Firebase console → Project settings → Service accounts → **Generate new private key** se mili `.json` file yahan paste karein (ya file chunein), password daal kar Save. Phone par DineDesk app mein super admin se sign in karke **Test** dabaiye. App ke liye alag file `google-services.json` chahiye (Step 6 dekhiye). Firebase project mein do Android apps jodiye: `in.dinedesk.app` aur `com.dinedesk.admin.local`.
   - **Messaging mode:** sab test hone ke baad **Live**.
5. `.env` se `SUPER_ADMIN_PASSWORD` hata dijiye.

Har restaurant apna **khud ka Razorpay** (grahakon se paisa) apne dashboard → Settings → Ordering & payments mein jodta hai.

---

## 5. Live hone ke baad check-list

- [ ] `https://dinedesk.in` khulta hai, padlock (HTTPS) sahi hai
- [ ] Ek test restaurant bana kar `https://test.dinedesk.in` khulta hai
- [ ] `curl -sI https://test.dinedesk.in/ | grep -i x-ssr` → `X-SSR: hit` (Google ke liye server-rendered page)
- [ ] Dashboard par **Live** (hara) dikhta hai — live updates chal rahe hain
- [ ] Test order → kitchen/POS par turant aata hai → grahak ko WhatsApp/email
- [ ] Razorpay test subscription → webhook "delivered", plan paid dikhta hai
- [ ] `supervisorctl status` mein horizon, reverb, site-ssr **RUNNING**
- [ ] `php artisan schedule:list` mein jobs; agle din `storage/app/private/backups` mein backup file aur woh bahar copy hui
- [ ] Custom domain test: kisi domain ka CNAME `sites.dinedesk.in` par → dashboard mein "Check DNS" → HTTPS ke saath khulta hai
- [ ] `APP_DEBUG=false`, firewall sirf 22/80/443
- [ ] Google Search Console mein `https://dinedesk.in` jodna aur restaurant ka `sitemap.xml` submit karna

---

## 6. Android app — Play Store par

(Server live hone ke baad, apne Windows PC se.)

1. **Upload key** ek baar banaiye aur bahut surakshit rakhiye (kho gayi to Play support se reset):
   ```powershell
   $jdk = (Get-ChildItem "$env:USERPROFILE\Android" -Directory -Filter 'jdk-17*')[0].FullName
   & "$jdk\bin\keytool.exe" -genkeypair -keystore android\keys\dinedesk-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
   aur `android\webview-app\upload-keystore.properties` (git mein nahi jaati): `storeFile=…`, `storePassword=…`, `keyAlias=upload`, `keyPassword=…`.
2. **Firebase file:** Firebase console → Project settings → Your apps se `google-services.json` download karke `android\webview-app\app\google-services.json` mein rakhiye (git mein nahi jaati). Iske bina app banegi, par notifications band rahenge.
3. **Build:**
   ```powershell
   cd android\webview-app
   $gradle = (Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists" -Recurse -Filter gradle.bat | Where-Object FullName -match 'gradle-8\.1[3-9]')[0].FullName
   & $gradle --no-daemon bundleProdRelease assembleProdRelease "-PplatformHost=dinedesk.in" "-PversionCode=5" "-PversionName=1.4"
   ```
   Output: `app/build/outputs/bundle/prodRelease/app-prod-release.aab` → Play Console mein upload. Har naye upload par `versionCode` badhaiye.
4. Play Console mein: app naam **DineDesk**, package `in.dinedesk.app` (ek baar publish ke baad badal nahi sakta), privacy policy URL, screenshots, **location permission ka kaaran** ("delivery rider ki location sirf duty ke dauraan, owner ko delivery track karne ke liye") aur data safety form.
5. Pehle **Internal testing** → phir Closed → phir Production.

---

## 7. Baad mein update kaise karein

```bash
cd /var/www/dinedesk && git pull
cd backend && composer install --no-dev --optimize-autoloader && php artisan migrate --force
php artisan db:seed --class=RoleSeeder --force
php artisan config:cache && php artisan route:cache && php artisan view:cache
php artisan horizon:terminate && sudo supervisorctl restart reverb site-ssr
cd ../frontend && npm ci && npm run build && sudo supervisorctl restart site-ssr
```

Update se pehle backup le lena achcha hai: `php artisan backup:database`.

---

## 8. Kuch problem aaye to

| Problem | Kya dekhein |
|---|---|
| Site par certificate error | DNS sahi IP par hai? Caddy log: `journalctl -u caddy` |
| Naya order dashboard mein turant nahi aata | `supervisorctl status reverb`; Caddy mein `/app/*` Reverb par jaa raha hai |
| WhatsApp/email nahi jaate | Integrations → Test; Messaging mode **Live**? `supervisorctl status horizon` |
| Restaurant website khaali ya dheemi | `supervisorctl status site-ssr`; frontend build ke baad restart kiya? |
| Subah ki report / reminders nahi | cron chal raha hai? `php artisan schedule:list` |
| 500 error | `backend/storage/logs/laravel.log` |
| Photos upload nahi hoti | `storage` folder ki permission (Step 4 ka `chown/chmod`), Nginx `client_max_body_size` |

---

## 9. Live ke baad bhi jo kaam baaki rahenge

- **App notifications (Firebase):** code ban gaya hai; Firebase project, `google-services.json` (app) aur service account key (Integrations) daalne par chalu.
- **Translations ka native speaker review** (12 bhashayein AI se bani hain).
- **Swiggy/Zomato, ONDC, Google Business Profile, MakeMyTrip** — inke partner program ki approval ke baad.
- Lighthouse / PageSpeed se asli domain par speed check.
