<?php

namespace App\Modules\Plans\Http\Middleware;

use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Usage: ->middleware('feature:qr_ordering'). Must run after the tenant is set.
 */
class RequireFeature
{
    public function __construct(
        private readonly FeatureService $features,
        private readonly TenantContext $context,
    ) {}

    public function handle(Request $request, Closure $next, string $feature): Response
    {
        $this->features->assertEnabled($this->context->require(), $feature);

        return $next($request);
    }
}
