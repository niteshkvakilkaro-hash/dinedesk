<?php

namespace App\Modules\Identity\Support;

use App\Models\User;
use App\Modules\Branches\Services\Branches;
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
        $support = $user->supportSession();
        if ($support) {
            $user->enterSupport($support);
        }
        $tenant = $user->tenant;
        $features = app(FeatureService::class);

        $next = match (true) {
            (bool) $support => 'dashboard',
            $user->is_platform_admin => 'platform',
            ! $tenant => 'onboarding',
            // Steps 4–7 (theme, branding, menu, go live) are the owner's to finish.
            $tenant->status === 'onboarding' && $user->tenantRole() === 'owner' => 'onboarding',
            default => 'dashboard',
        };

        $payload = [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'locale' => $user->locale,
                'phone_verified' => (bool) $user->phone_verified_at,
                // Mobile sign-ups have none until they set one (My account).
                'has_password' => (bool) $user->password,
                'is_platform_admin' => $user->is_platform_admin,
            ],
            'tenant' => null,
            'role' => null,
            'permissions' => [],
            'features' => (object) [],
            'limits' => (object) [],
            'next' => $next,
            // A super admin inside a business for support (shown as a banner with "End").
            'support' => $support ? ['reason' => $support->reason, 'read_only' => $support->read_only, 'expires_at' => $support->expires_at->toIso8601String()] : null,
            // Other outlets this person can switch to (branches of the same business).
            'branches' => $tenant && ! $support ? Branches::switchable($user) : [],
        ];

        if ($tenant) {
            // Branches show their main business's subscription.
            $subscription = $tenant->billingRoot()->currentSubscription;
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
                    'grace_ends_at' => $subscription->grace_ends_at?->toIso8601String(),
                    'current_period_ends_at' => $subscription->current_period_ends_at?->toIso8601String(),
                    'cancel_at_period_end' => (bool) $subscription->cancel_at_period_end,
                ] : null,
                'is_branch' => (bool) $tenant->parent_tenant_id,
            ];
            $payload['role'] = $user->tenantRole();
            $payload['permissions'] = $user->tenantPermissions();
            $payload['features'] = $features->features($tenant);
            $payload['limits'] = $features->limits($tenant);
        }

        return $payload;
    }
}
