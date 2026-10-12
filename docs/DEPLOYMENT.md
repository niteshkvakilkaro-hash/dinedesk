# Deploying DineDesk (one VPS)

This guide puts the whole platform on one Ubuntu 24.04 server: **Caddy** at the edge (automatic HTTPS for the platform, every business subdomain and every custom domain), **Nginx + PHP-FPM** for the Laravel API and the built React app, **MySQL 8** (or MariaDB 10.6+), **Redis** for cache, sessions and queues, **Horizon** for queue workers, **Reverb** for live updates, and cron for the scheduler. A 4 GB / 2 vCPU server is comfortable for a few hundred businesses; scale out later by moving MySQL and Redis to managed services.

```
visitor ──https──► Caddy :443 ──► Nginx :8081 ──► PHP-FPM (Laravel API, /api)
                     │                  └──────► /var/www/dinedesk/frontend/dist (React app)
                     └─ /app (WebSockets) ──────► Reverb :8080
```

Replace `dinedesk.in` below with your platform domain.

## 1. DNS

| Record | Value |
|---|---|
| `dinedesk.in` A | server IP |
| `*.dinedesk.in` A | server IP (every business gets `slug.dinedesk.in`) |
| `sites.dinedesk.in` A | server IP (custom domains CNAME to this) |

## 2. Packages

```bash
sudo apt update && sudo apt install -y nginx mysql-server redis-server supervisor unzip git \
  php8.3-fpm php8.3-cli php8.3-mysql php8.3-redis php8.3-mbstring php8.3-xml php8.3-curl \
  php8.3-zip php8.3-gd php8.3-intl php8.3-bcmath php8.3-pcntl
curl -sS https://getcomposer.org/installer | php && sudo mv composer.phar /usr/local/bin/composer
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs
# Caddy (official repository): https://caddyserver.com/docs/install#debian-ubuntu-raspbian
```

## 3. Database and Redis

```sql
CREATE DATABASE dinedesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'dinedesk'@'localhost' IDENTIFIED BY 'a-long-random-password';
GRANT ALL ON dinedesk.* TO 'dinedesk'@'localhost';
```

Redis: keep it bound to `127.0.0.1` (the default) and set a `requirepass` in `/etc/redis/redis.conf`.

## 4. Code

```bash
sudo mkdir -p /var/www && sudo chown $USER:www-data /var/www
git clone https://github.com/<you>/dinedesk.git /var/www/dinedesk
cd /var/www/dinedesk/backend
composer install --no-dev --optimize-autoloader
composer require laravel/horizon   # production only (needs pcntl, which Windows dev machines lack)
php artisan horizon:install
cp .env.example .env && php artisan key:generate
```

### `.env` (production values)

```ini
APP_ENV=production
APP_DEBUG=false
APP_URL=https://dinedesk.in
PLATFORM_DOMAIN=dinedesk.in
SITE_URL_PATTERN=https://{host}

DB_DATABASE=dinedesk
DB_USERNAME=dinedesk
DB_PASSWORD=...

CACHE_STORE=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
REDIS_PASSWORD=...

# Live updates
BROADCAST_CONNECTION=reverb
REVERB_APP_ID=dinedesk
REVERB_APP_KEY=<random>
REVERB_APP_SECRET=<random>
REVERB_HOST=dinedesk.in
REVERB_PORT=443
REVERB_SCHEME=https
REVERB_SERVER_HOST=127.0.0.1
REVERB_SERVER_PORT=8080

# The platform's own Razorpay account (business subscriptions)
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

# Custom domains point their CNAME here (and/or A records to these IPs)
CUSTOM_DOMAIN_TARGET=sites.dinedesk.in
CUSTOM_DOMAIN_IPS=203.0.113.10

SUPER_ADMIN_EMAIL=you@yourcompany.in
SUPER_ADMIN_PASSWORD=<strong password, remove after first login>
MAIL_MAILER=smtp
MESSAGING_DRIVER=...   # your WhatsApp / SMS provider
BACKUP_KEEP_DAYS=14
```

Then:

```bash
php artisan migrate --force
php artisan db:seed --class=PlanSeeder --force
php artisan db:seed --class=RoleSeeder --force
php artisan db:seed --class=SuperAdminSeeder --force
php artisan storage:link
php artisan config:cache && php artisan route:cache && php artisan view:cache
sudo chown -R $USER:www-data storage bootstrap/cache && sudo chmod -R ug+rwX storage bootstrap/cache
```

Never run `DemoTenantSeeder` in production (it refuses to, but don't try).

### Frontend

```bash
cd /var/www/dinedesk/frontend
cat > .env.production <<'EOF'
VITE_PLATFORM_DOMAIN=dinedesk.in
VITE_REVERB_APP_KEY=<same as REVERB_APP_KEY>
VITE_REVERB_HOST=dinedesk.in
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https
EOF
npm ci && PRERENDER_API_URL=https://dinedesk.in/api/v1 npm run build      # → frontend/dist
```

The build also pre-renders DineDesk's own marketing pages (home, pricing, themes, feature
pages) into `dist/_marketing/…/index.html`, so search engines get real HTML. With
`PRERENDER_API_URL` the plan cards are filled in too (run it once the API is up; without it
they load in the browser). Nginx below serves those files on the platform domain only.

## 5. Nginx (behind Caddy, plain HTTP on 127.0.0.1:8081)

`/etc/nginx/sites-available/dinedesk`:

```nginx
# The platform domain gets the pre-rendered marketing pages; business sites never do.
map $host $marketing {
    dinedesk.in      /_marketing;
    www.dinedesk.in  /_marketing;
    default          "";
}

server {
    listen 127.0.0.1:8081 default_server;
    server_name _;
    root /var/www/dinedesk/frontend/dist;
    index index.html;
    client_max_body_size 12m;

    # API, webhooks, the TLS "ask" endpoint
    location /api/ {
        root /var/www/dinedesk/backend/public;
        try_files $uri /index.php?$query_string;
    }
    # Uploaded photos (public disk)
    location /storage/ {
        alias /var/www/dinedesk/backend/storage/app/public/;
        expires 30d;
        add_header Cache-Control "public";
    }
    # Per-business robots.txt and sitemap.xml come from Laravel (it reads the Host)
    location ~ ^/(robots\.txt|sitemap\.xml)$ {
        root /var/www/dinedesk/backend/public;
        try_files $uri /index.php?$query_string;
    }
    location ~ \.php$ {
        root /var/www/dinedesk/backend/public;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root/index.php;
        fastcgi_param HTTP_X_TENANT_HOST $host;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }
    # The React app (business websites, dashboard, platform panel)
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location / { try_files $marketing$uri/index.html $uri /index.html; }
}
```

Check: `curl -s https://dinedesk.in/pricing | grep -o '<h1[^<]*'` shows the page heading
(pre-rendered), and `curl -s https://<any-business>.dinedesk.in/ | grep -c prerender` prints 0.

```bash
sudo ln -s /etc/nginx/sites-available/dinedesk /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Don't send `X-Frame-Options: DENY` for business sites: the dashboard previews them in an iframe.

## 6. Caddy: automatic HTTPS for every host (on-demand TLS)

Caddy asks DineDesk before issuing a certificate, so certificates are issued only for the platform, real business subdomains and **verified** custom domains (`GET /api/v1/tls/ask?domain=…` answers 200 or 404).

`/etc/caddy/Caddyfile`:

```caddy
{
    email you@yourcompany.in
    on_demand_tls {
        ask http://127.0.0.1:8081/api/v1/tls/ask
    }
}

https:// {
    tls {
        on_demand
    }
    encode zstd gzip

    # Reverb WebSockets
    @ws path /app/* /apps/*
    reverse_proxy @ws 127.0.0.1:8080

    reverse_proxy 127.0.0.1:8081 {
        header_up Host {host}
        header_up X-Forwarded-Proto https
    }
}
```

```bash
sudo systemctl reload caddy
```

Trust the proxy in Laravel so client IPs (rate limits, audit log) are right: in `bootstrap/app.php` add `$middleware->trustProxies(at: '127.0.0.1');`.

**Alternative: Cloudflare for SaaS.** Put the platform behind Cloudflare, enable *SSL for SaaS* with fallback origin `sites.dinedesk.in`, and add each verified custom domain as a *custom hostname* (API call when the owner presses "Check DNS"). Caddy is then not needed; Nginx listens on 80/443 with a Cloudflare origin certificate.

## 7. Background processes (Supervisor)

`/etc/supervisor/conf.d/dinedesk.conf`:

```ini
[program:horizon]
command=php /var/www/dinedesk/backend/artisan horizon
user=www-data
autostart=true
autorestart=true
stopwaitsecs=3600
stdout_logfile=/var/log/dinedesk-horizon.log

[program:reverb]
command=php /var/www/dinedesk/backend/artisan reverb:start --host=127.0.0.1 --port=8080
user=www-data
autostart=true
autorestart=true
stdout_logfile=/var/log/dinedesk-reverb.log
```

Without Horizon, use `command=php artisan queue:work redis --sleep=1 --tries=3 --max-time=3600` with `numprocs=2`.

```bash
sudo supervisorctl reread && sudo supervisorctl update
```

Protect the Horizon dashboard (`/horizon`): in `app/Providers/HorizonServiceProvider.php` allow only users with `is_platform_admin`.

## 8. Scheduler (cron)

```cron
* * * * * www-data cd /var/www/dinedesk/backend && php artisan schedule:run >> /dev/null 2>&1
```

It runs: unpaid online orders and room holds released, booking reminders, **billing enforcement** (grace periods, read-only, hourly), guest-ID clean-up, export clean-up and the **nightly database backup** (02:30).

## 9. Razorpay (platform account)

1. Set the three `RAZORPAY_*` keys in `.env` (live keys from your Razorpay dashboard).
2. Webhook → URL `https://dinedesk.in/api/v1/webhooks/razorpay-platform`, secret = `RAZORPAY_WEBHOOK_SECRET`, events: `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`.
3. In the super admin panel: **Plans** → set monthly and yearly prices (before GST). **Settings** → legal name, GSTIN, address, invoice prefix, grace days. GST is charged on subscriptions only once a GSTIN is set.

Each business connects its **own** Razorpay account for customer payments (Dashboard → Ordering); those webhooks go to `/api/v1/webhooks/razorpay/{business id}`.

## 10. Backups

- `php artisan backup:database` runs nightly: a gzip'd `mysqldump --single-transaction` in `storage/app/private/backups`, kept `BACKUP_KEEP_DAYS` days. Set `MYSQLDUMP_PATH` if `mysqldump` is not on the PATH.
- **Copy backups off the server** every night, e.g. with rclone to S3 / Backblaze / Google Drive:
  ```cron
  45 2 * * * www-data rclone sync /var/www/dinedesk/backend/storage/app/private/backups remote:dinedesk-backups
  15 3 * * * www-data rclone sync /var/www/dinedesk/backend/storage/app/public remote:dinedesk-uploads
  ```
- Restore test (do it once a month): `gunzip -c file.sql.gz | mysql -u dinedesk -p dinedesk_restore_test`.
- Guest ID documents (hotel) live encrypted in `storage/app/private/guest-documents`; they are only readable with the same `APP_KEY`. **Back up `.env` (APP_KEY) separately and safely.**
- Owners can download all their data any time (Dashboard → Billing → Your data); the super admin can do it for them (with a reason, audited).

## 11. Updating

```bash
cd /var/www/dinedesk && git pull
cd backend && composer install --no-dev --optimize-autoloader && php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan view:cache
php artisan horizon:terminate && sudo supervisorctl restart reverb
cd ../frontend && npm ci && npm run build
```

## 12. Checklist

- [ ] `APP_DEBUG=false`, strong DB / Redis passwords, `SUPER_ADMIN_PASSWORD` removed from `.env` after the first login
- [ ] `https://dinedesk.in`, `https://any-business.dinedesk.in` and a test custom domain load with valid certificates
- [ ] Razorpay platform webhook shows "delivered" after a test subscription
- [ ] `php artisan schedule:list` shows the jobs; `storage/app/private/backups` has today's file and it is copied off-site
- [ ] Horizon and Reverb are running (`supervisorctl status`); the dashboard shows **Live**
- [ ] Firewall: only 22, 80 and 443 open (`ufw allow OpenSSH 80 443`)
