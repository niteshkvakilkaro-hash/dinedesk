<?php

namespace App\Modules\Platform\Http\Middleware;

use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/** Super admin routes. Runs after auth:sanctum. No tenant is put in context. */
class EnsurePlatformAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user?->is_platform_admin || ! $user->isActive()) {
            throw new ApiException('Platform administrators only.', 403, 'forbidden');
        }
        // A support token only opens one business; it never reaches the platform panel.
        $token = $user->currentAccessToken();
        if ($token instanceof PersonalAccessToken && $token->name === 'support') {
            throw new ApiException('End the support session to use the platform panel.', 403, 'forbidden');
        }

        app(TenantContext::class)->set(null);

        return $next($request);
    }
}
