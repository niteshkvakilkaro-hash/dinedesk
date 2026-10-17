<?php

return [

    /*
    | Tenants live at {slug}.{platform_domain}. The platform app (sign-up,
    | dashboards, super admin) lives at {platform_domain} and app.{platform_domain}.
    */
    'platform_domain' => strtolower((string) env('PLATFORM_DOMAIN', 'localhost')),

    // Subdomains a business can never take.
    'reserved_slugs' => [
        'app', 'www', 'api', 'admin', 'mail', 'static', 'assets', 'cdn', 'help',
        'support', 'status', 'blog', 'docs', 'dashboard', 'billing', 'platform',
        'login', 'signup', 'auth', 'staff', 'kitchen', 'pos', 'test', 'demo',
    ],

    'default_timezone' => 'Asia/Kolkata',

    // Languages guests can use (same codes as the frontend's LANGUAGE_CODES). Guest messages
    // come from lang/<code>/guest.php; anything else falls back to English.
    'languages' => ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu', 'ur', 'kn', 'or', 'ml', 'pa'],

    // New businesses get a free trial of this plan.
    'trial' => [
        'plan' => 'growth',
        'days' => 14,
    ],

    // Refer a business: when a business that signed up with another's link makes its first
    // paid subscription payment, both get this many free days (see Modules/Referrals).
    'referrals' => [
        'reward_days' => (int) env('REFERRAL_REWARD_DAYS', 30),
    ],

    // The platform's own Razorpay account (subscriptions from businesses). Each business's
    // customer payments use that business's keys instead (Ordering settings).
    'platform_razorpay' => [
        'key_id' => env('RAZORPAY_KEY_ID'),
        'key_secret' => env('RAZORPAY_KEY_SECRET'),
        'webhook_secret' => env('RAZORPAY_WEBHOOK_SECRET'),
    ],

    // Custom domains point here (CNAME) or at these IPs (A records). TLS is issued on demand by Caddy.
    'domains' => [
        'cname_target' => env('CUSTOM_DOMAIN_TARGET') ?: 'sites.'.env('PLATFORM_DOMAIN', 'localhost'),
        'ips' => array_filter(explode(',', (string) env('CUSTOM_DOMAIN_IPS', ''))),
    ],

    // Nightly database backups (php artisan backup:database).
    'backups' => [
        'keep_days' => (int) env('BACKUP_KEEP_DAYS', 14),
        'mysqldump' => env('MYSQLDUMP_PATH') ?: 'mysqldump',
    ],

    'otp' => [
        'driver' => env('OTP_DRIVER', 'log'),
        'length' => 6,
        'ttl_minutes' => 10,
        'max_attempts' => 5,
        'resend_after_seconds' => 60,
        // Only honoured when APP_ENV=local.
        'dev_echo' => (bool) env('OTP_DEV_ECHO', false),
    ],

    // Uploads become WebP at these widths (never upscaled) plus a blur placeholder.
    'images' => [
        'widths' => [480, 960, 1600],
        'quality' => 80,
        'max_kb' => 8192,
    ],

    'gallery_max_images' => 60,

    'super_admin' => [
        'email' => env('SUPER_ADMIN_EMAIL', 'owner@example.com'),
        'password' => env('SUPER_ADMIN_PASSWORD'),
    ],

    // Public links to a business site (order tracking in messages). {host} = the business's domain.
    'site_url_pattern' => env('SITE_URL_PATTERN', 'https://{host}'),

    // Where owners open the dashboard (links in the owner's daily summary).
    'dashboard_url' => env('DASHBOARD_URL') ?: env('APP_URL', 'http://localhost'),

    // GST on room tariff by the price of one room for one night (SAC 996311). Highest slab last.
    // Check the current rates with your CA; change them here when the law changes.
    'hotel_gst' => [
        ['up_to' => 7500, 'rate' => 5],
        ['up_to' => null, 'rate' => 18],
    ],

    // Guest ID photos (hotel): stored encrypted on this private disk.
    'guest_documents_disk' => env('GUEST_DOCUMENTS_DISK', 'local'),

    // WhatsApp / SMS provider for customer updates ("log" writes them to the log).
    // Web Push alerts to staff phones (php artisan webpush:vapid makes the keys).
    'webpush' => [
        'public_key' => env('WEBPUSH_VAPID_PUBLIC'),
        'private_key' => env('WEBPUSH_VAPID_PRIVATE'),
        'subject' => env('WEBPUSH_SUBJECT') ?: 'mailto:support@example.com',
    ],

    // Notifications in the DineDesk Android app (Firebase Cloud Messaging, App\Support\Push\Fcm):
    // a service-account key JSON, or a path to the file. Super admin → Integrations → Firebase wins.
    'firebase' => [
        'credentials' => env('FIREBASE_CREDENTIALS'),
    ],

    'messaging' => [
        // log (development) | live (LiveMessenger: Meta WhatsApp Cloud API + MSG91 for codes)
        'driver' => env('MESSAGING_DRIVER', 'log'),
        'whatsapp' => [
            'token' => env('WHATSAPP_TOKEN'),
            'phone_number_id' => env('WHATSAPP_PHONE_NUMBER_ID'),
            // An approved utility template whose body is one variable: {{1}}
            'template' => env('WHATSAPP_TEMPLATE') ?: 'dinedesk_update',
            'language' => env('WHATSAPP_TEMPLATE_LANG') ?: 'en',
            'api_version' => env('WHATSAPP_API_VERSION') ?: 'v21.0',
        ],
        'sms' => [
            'auth_key' => env('MSG91_AUTH_KEY'),
            // A DLT-approved OTP template in MSG91 with one variable for the code
            'otp_template_id' => env('MSG91_OTP_TEMPLATE_ID'),
            'code_variable' => env('MSG91_CODE_VARIABLE') ?: 'otp',
        ],
    ],
    /*
    | Android apps (Trusted Web Activity) that open the platform dashboard full-screen.
    | Each business's own app is set per website with: php artisan android:app <host> <package> <sha256>
    | Fingerprint = SHA-256 of the app signing key (Play Console → App integrity), comma separated.
    */
    'android' => [
        'admin_package' => env('ANDROID_ADMIN_PACKAGE'),
        'admin_sha256' => array_values(array_filter(array_map('trim', explode(',', (string) env('ANDROID_ADMIN_SHA256', ''))))),
    ],
    /*
    | AI features (menu import from photos, dish descriptions) use Claude through the Anthropic API.
    | Without a key they stay switched off and the dashboard says so.
    */
    'ai' => [
        'api_key' => env('ANTHROPIC_API_KEY'),
        'model' => env('DINEDESK_AI_MODEL', 'claude-opus-5-5'),
    ],
    /*
    | Delivery riders (role "delivery"): while on duty their phone sends its location every
    | location_interval seconds (the DineDesk app in the background, the browser while /rider/ is
    | open). Points are kept retention_days (riders:purge-locations, daily), a duty ends by itself
    | after max_duty_hours, and guests see the rider on the tracking page only while the order is
    | out for delivery and the last point is at most guest_max_age_minutes old.
    */
    'riders' => [
        'location_interval' => (int) env('RIDER_LOCATION_INTERVAL', 300),
        'retention_days' => (int) env('RIDER_RETENTION_DAYS', 7),
        'stale_minutes' => 15,
        'guest_max_age_minutes' => 30,
        'max_duty_hours' => (int) env('RIDER_MAX_DUTY_HOURS', 14),
    ],
];
