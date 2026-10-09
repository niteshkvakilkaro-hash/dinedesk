<?php

namespace App\Modules\Identity\Support;

use App\Models\User;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Support\TenantResolver;

/**
 * What the frontend needs after sign-in: who you are, your business, your
 * role and permissions, what your plan allows, and where to go next.
 */
final class SessionPayload
{
    public static function for(User $user): array
    {
        $tenant = $user->tenant;
        $features = app(FeatureService::class);

        $next = match (true) {
            $user->is_platform_admin => 'platform',
            ! $tenant => 'onboarding',
            default => 'dashboard',
        };

        $payload = [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'locale' => $user->locale,
                'is_platform_admin' => $user->is_platform_admin,
            ],
            'tenant' => null,
            'role' => null,
            'permissions' => [],
            'features' => (object) [],
            'limits' => (object) [],
            'next' => $next,
        ];

        if ($tenant) {
            $subscription = $tenant->currentSubscription;
            $payload['tenant'] = [
                'id' => $tenant->public_id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'business_type' => $tenant->business_type,
                'city' => $tenant->city,
                'status' => $tenant->status,
                'onboarding_step' => $tenant->onboarding_step,
                'is_demo' => $tenant->is_demo,
                'site_host' => TenantResolver::subdomainFor($tenant->slug),
                'plan' => ['code' => $tenant->plan->code, 'name' => $tenant->plan->name],
                'subscription' => $subscription ? [
                    'status' => $subscription->status,
                    'trial_ends_at' => $subscription->trial_ends_at?->toIso8601String(),
                ] : null,
            ];
            $payload['role'] = $user->tenantRole();
            $payload['permissions'] = $user->tenantPermissions();
            $payload['features'] = $features->features($tenant);
            $payload['limits'] = $features->limits($tenant);
        }

        return $payload;
    }
}
