<?php

namespace App\Modules\Tenancy\Http\Middleware;

use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Support\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Public website requests: the tenant comes from the host the visitor is on.
 * Usage: ->middleware('tenant.host')
 */
class ResolveTenantFromHost
{
    public function __construct(
        private readonly TenantResolver $resolver,
        private readonly TenantContext $context,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $tenant = $this->resolver->resolve($this->resolver->hostFrom($request));

        if (! $tenant) {
            throw new ApiException('No business is set up at this address.', 404, 'tenant_not_found');
        }
        if ($tenant->status === 'suspended') {
            throw new ApiException('This website is currently unavailable.', 404, 'tenant_unavailable');
        }

        $this->context->set($tenant);

        return $next($request);
    }
}
