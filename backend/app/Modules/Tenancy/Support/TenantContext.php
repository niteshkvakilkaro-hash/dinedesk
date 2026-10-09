<?php

namespace App\Modules\Tenancy\Support;

use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;

/**
 * Holds the tenant for the current request (or job). Everything tenant-owned
 * reads it through TenantScope; nothing else decides "which business".
 */
final class TenantContext
{
    private ?Tenant $tenant = null;

    public function set(?Tenant $tenant): void
    {
        $this->tenant = $tenant;
        // Roles and permissions (spatie, teams mode) follow the same tenant.
        setPermissionsTeamId($tenant?->id);
    }

    public function get(): ?Tenant
    {
        return $this->tenant;
    }

    public function id(): ?int
    {
        return $this->tenant?->id;
    }

    public function check(): bool
    {
        return $this->tenant !== null;
    }

    public function require(): Tenant
    {
        return $this->tenant ?? throw new ApiException('No business selected for this request.', 400, 'tenant_required');
    }

    /** Run a callback as another tenant, restoring the previous one afterwards. */
    public function run(Tenant $tenant, callable $callback): mixed
    {
        $previous = $this->tenant;
        $this->set($tenant);
        try {
            return $callback($tenant);
        } finally {
            $this->set($previous);
        }
    }
}
