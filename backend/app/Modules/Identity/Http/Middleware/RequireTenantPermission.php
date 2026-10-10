<?php

namespace App\Modules\Identity\Http\Middleware;

use App\Support\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Usage: ->middleware('tenant.can:staff.manage'). Runs after tenant.user, so
 * the spatie team is already the user's own tenant.
 */
class RequireTenantPermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();
        // A super admin in a support session has the owner's view of the business.
        $support = $user->supportSession() !== null;

        foreach ($permissions as $permission) {
            if ($support || $user->hasPermissionTo($permission)) {
                return $next($request);
            }
        }

        throw new ApiException('Your role does not allow this.', 403, 'forbidden', ['permission' => $permissions[0] ?? null]);
    }
}
