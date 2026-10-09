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

    'super_admin' => [
        'email' => env('SUPER_ADMIN_EMAIL', 'owner@example.com'),
        'password' => env('SUPER_ADMIN_PASSWORD'),
    ],
];
