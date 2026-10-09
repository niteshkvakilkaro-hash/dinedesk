<?php

namespace App\Modules\Tenancy\Http\Middleware;

use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Support\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Business dashboard requests: the tenant is the signed-in user's own
 * business, never something the client chooses. Runs after auth:sanctum.
 *
 * - no business yet          → 409 onboarding_required
 * - opened from another
 *   tenant's site host        → 403 tenant_mismatch
 * - suspended / read-only     → writes refused
 */
class UseUserTenant
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly TenantResolver $resolver,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user->tenant_id) {
            throw new ApiException('Finish setting up your business first.', 409, 'onboarding_required');
        }

        $tenant = $user->tenant;
        if (! $tenant) {
            throw new ApiException('Your business account is no longer available.', 403, 'tenant_unavailable');
        }

        // A dashboard token used from a different business's site must not act there.
        $hostTenant = $this->resolver->resolve($this->resolver->hostFrom($request));
        if ($hostTenant && $hostTenant->id !== $tenant->id) {
            throw new ApiException('You are signed in to a different business.', 403, 'tenant_mismatch');
        }

        if ($tenant->status === 'suspended') {
            throw new ApiException('This business account is suspended. Please contact support.', 403, 'tenant_suspended');
        }
        if ($tenant->status === 'read_only' && ! $request->isMethodSafe()) {
            throw new ApiException('Your account is read-only until billing is resolved. You can still view your data.', 403, 'tenant_read_only');
        }

        $this->context->set($tenant);

        // Cheap "last active" for the super admin list (at most every 5 minutes).
        if (! $tenant->last_active_at || $tenant->last_active_at->lt(now()->subMinutes(5))) {
            $tenant->forceFill(['last_active_at' => now()])->saveQuietly();
        }

        return $next($request);
    }
}
