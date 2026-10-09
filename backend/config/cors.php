<?php

/*
| FRONTEND_ORIGINS is a comma-separated list. Entries may contain one "*"
| for tenant subdomains, e.g. https://*.dinedesk.in or http://*.localhost:5173.
| Custom tenant domains are allowed at runtime in Phase 8 (verified domains).
*/

$exact = [];
$patterns = [];

foreach (array_filter(array_map('trim', explode(',', (string) env('FRONTEND_ORIGINS', 'http://localhost:5173')))) as $origin) {
    $origin = rtrim($origin, '/');
    if (str_contains($origin, '*')) {
        $patterns[] = '#^'.str_replace('\*', '[a-z0-9-]+', preg_quote($origin, '#')).'$#i';
    } else {
        $exact[] = $origin;
    }
}

return [
    'paths' => ['api/*', 'storage/*'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'allowed_origins' => $exact,
    'allowed_origins_patterns' => $patterns,
    'allowed_headers' => ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With', 'X-Tenant-Host', 'Accept-Language'],
    'exposed_headers' => ['Retry-After'],
    'max_age' => 3600,
    'supports_credentials' => false,
];
