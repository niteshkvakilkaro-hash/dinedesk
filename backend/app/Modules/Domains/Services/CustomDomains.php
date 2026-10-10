<?php

namespace App\Modules\Domains\Services;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Models\TenantDomain;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;

/**
 * A business's own domain (Growth and Pro): the owner points it at the platform with a
 * CNAME (or A records for an apex domain), we verify the DNS, and Caddy issues the TLS
 * certificate on the first visit (it asks /api/v1/tls/ask first). The platform subdomain
 * keeps working.
 */
class CustomDomains
{
    public const MAX_PER_BUSINESS = 3;

    public function __construct(private readonly DnsLookup $dns) {}

    public function add(Tenant $tenant, string $input): TenantDomain
    {
        app(FeatureService::class)->assertEnabled($tenant, 'custom_domain');
        $domain = self::normalize($input);
        $platform = (string) config('dinedesk.platform_domain');
        if (! preg_match('/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $domain)) {
            throw new ApiException('Enter a domain like www.yourrestaurant.in', 422, 'invalid_domain', ['field' => 'domain']);
        }
        if ($domain === $platform || str_ends_with($domain, ".{$platform}")) {
            throw new ApiException('That is a platform address. Enter your own domain.', 422, 'invalid_domain', ['field' => 'domain']);
        }
        if (TenantDomain::where('domain', $domain)->exists()) {
            throw new ApiException('This domain is already connected to a business.', 422, 'domain_taken', ['field' => 'domain']);
        }
        if (TenantDomain::where('tenant_id', $tenant->id)->where('type', 'custom')->count() >= self::MAX_PER_BUSINESS) {
            throw new ApiException('Up to '.self::MAX_PER_BUSINESS.' domains per business.', 422, 'too_many');
        }
        $row = TenantDomain::create(['tenant_id' => $tenant->id, 'domain' => $domain, 'type' => 'custom', 'is_primary' => false]);
        AuditLog::record('domain.added', $tenant, ['domain' => $domain], $tenant->id);

        return $row;
    }

    /** Check DNS now: a CNAME to our target, or A records to our servers. */
    public function verify(TenantDomain $d): TenantDomain
    {
        $records = $this->dns->records($d->domain);
        $target = strtolower((string) config('dinedesk.domains.cname_target'));
        $ips = (array) config('dinedesk.domains.ips');
        $ok = in_array($target, $records['cname'], true) || ($ips && array_intersect($ips, $records['a']));
        if (! $ok) {
            $found = $records['cname'] ? 'CNAME '.implode(', ', $records['cname']) : ($records['a'] ? 'A '.implode(', ', $records['a']) : 'no records yet');
            throw new ApiException("DNS for {$d->domain} doesn't point to us yet (found: {$found}). DNS changes can take up to a few hours.", 422, 'dns_not_ready', ['found' => $records]);
        }
        $d->update(['verified_at' => now()]);
        AuditLog::record('domain.verified', $d, ['domain' => $d->domain], $d->tenant_id);

        return $d;
    }

    /** Links, messages and the sitemap use the primary domain. */
    public function makePrimary(TenantDomain $d): void
    {
        if (! $d->verified_at) {
            throw new ApiException('Verify the domain first.', 422, 'not_verified');
        }
        DB::transaction(function () use ($d) {
            TenantDomain::where('tenant_id', $d->tenant_id)->update(['is_primary' => false]);
            $d->update(['is_primary' => true]);
        });
        AuditLog::record('domain.primary', $d, ['domain' => $d->domain], $d->tenant_id);
    }

    public function remove(TenantDomain $d): void
    {
        if ($d->type !== 'custom') {
            throw new ApiException('The platform address can\'t be removed.', 422, 'not_removable');
        }
        DB::transaction(function () use ($d) {
            if ($d->is_primary) {
                TenantDomain::where('tenant_id', $d->tenant_id)->where('type', 'subdomain')->update(['is_primary' => true]);
            }
            $d->delete();
        });
        AuditLog::record('domain.removed', null, ['domain' => $d->domain], $d->tenant_id);
    }

    /** For Caddy's on-demand TLS: issue a certificate only for hosts we actually serve. */
    public function allowsCertificate(string $host): bool
    {
        $host = TenantResolver::normalize($host);
        if ($host === '') {
            return false;
        }
        if (app(TenantResolver::class)->isPlatformHost($host)) {
            return true;
        }

        return TenantDomain::where('domain', $host)->where(fn ($q) => $q->where('type', 'subdomain')->orWhereNotNull('verified_at'))->exists();
    }

    public static function normalize(string $input): string
    {
        $d = strtolower(trim($input));
        $d = preg_replace('#^https?://#', '', $d);

        return rtrim(explode('/', $d)[0], '.');
    }
}
