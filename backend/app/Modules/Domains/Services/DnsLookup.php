<?php

namespace App\Modules\Domains\Services;

/** DNS records of a host (swapped for a fake in tests). */
class DnsLookup
{
    /** @return array{cname: list<string>, a: list<string>} */
    public function records(string $host): array
    {
        $cname = @dns_get_record($host, DNS_CNAME) ?: [];
        $a = @dns_get_record($host, DNS_A) ?: [];

        return [
            'cname' => array_values(array_map(fn ($r) => rtrim(strtolower((string) ($r['target'] ?? '')), '.'), $cname)),
            'a' => array_values(array_map(fn ($r) => (string) ($r['ip'] ?? ''), $a)),
        ];
    }
}
