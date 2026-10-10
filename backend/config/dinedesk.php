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

    // New businesses get a free trial of this plan.
    'trial' => [
        'plan' => 'growth',
        'days' => 14,
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

    // GST on room tariff by the price of one room for one night (SAC 996311). Highest slab last.
    // Check the current rates with your CA; change them here when the law changes.
    'hotel_gst' => [
        ['up_to' => 7500, 'rate' => 5],
        ['up_to' => null, 'rate' => 18],
    ],

    // Guest ID photos (hotel): stored encrypted on this private disk.
    'guest_documents_disk' => env('GUEST_DOCUMENTS_DISK', 'local'),

    // WhatsApp / SMS provider for customer updates ("log" writes them to the log).
    'messaging' => [
        'driver' => env('MESSAGING_DRIVER', 'log'),
    ],
];
