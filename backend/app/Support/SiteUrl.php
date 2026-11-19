<?php

namespace App\Support;

/**
 * The public address of a business website, from its host (<slug>.<platform domain> or its own
 * domain), following SITE_URL_PATTERN:
 *
 *  - "https://{host}"            → https://haveli.nikobite.in (wildcard subdomains, the default)
 *  - "https://example.in/s/{slug}" → https://example.in/s/haveli (hosting without wildcard
 *    subdomains; the frontend serves sites at /s/<slug> with VITE_SITE_PATHS=true). A business
 *    with its own domain keeps https://<its domain>.
 *
 * No trailing slash.
 */
class SiteUrl
{
    public static function for(string $host): string
    {
        $pattern = (string) config('dinedesk.site_url_pattern');

        if (str_contains($pattern, '{slug}')) {
            $suffix = '.'.config('dinedesk.platform_domain');
            if (! str_ends_with($host, $suffix)) {
                return 'https://'.$host;
            }

            return rtrim(str_replace('{slug}', substr($host, 0, -strlen($suffix)), $pattern), '/');
        }

        return rtrim(str_replace('{host}', $host, $pattern), '/');
    }
}
