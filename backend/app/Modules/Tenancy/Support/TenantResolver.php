<?php

namespace App\Modules\Tenancy\Support;

use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Models\TenantDomain;
use Illuminate\Http\Request;

/**
 * Maps a host to a tenant:
 *  - {platform_domain}, app.{platform_domain}, www.{platform_domain} → platform (no tenant)
 *  - {slug}.{platform_domain}                                      → subdomain lookup
 *  - anything else                                                  → verified custom domain lookup
 */
class TenantResolver
{
    /** The host the visitor is actually on (the SPA forwards it in X-Tenant-Host). */
    public function hostFrom(Request $request): string
    {
        $host = (string) ($request->header('X-Tenant-Host') ?: $request->getHost());

        return self::normalize($host);
    }

    public static function normalize(string $host): string
    {
        $host = strtolower(trim($host));
        // Strip the port; hosts are never IPv6 literals here.
        if (str_contains($host, ':')) {
            $host = explode(':', $host, 2)[0];
        }

        return rtrim($host, '.');
    }

    public function isPlatformHost(string $host): bool
    {
        $domain = config('dinedesk.platform_domain');

        return in_array($host, [$domain, "app.{$domain}", "www.{$domain}", '127.0.0.1'], true);
    }

    public function resolve(string $host): ?Tenant
    {
        $host = self::normalize($host);
        if ($host === '' || $this->isPlatformHost($host)) {
            return null;
        }

        $domain = TenantDomain::query()
            ->where('domain', $host)
            ->where(fn ($q) => $q->where('type', 'subdomain')->orWhereNotNull('verified_at'))
            ->with('tenant')
            ->first();

        return $domain?->tenant;
    }

    public static function subdomainFor(string $slug): string
    {
        return $slug.'.'.config('dinedesk.platform_domain');
    }
}
