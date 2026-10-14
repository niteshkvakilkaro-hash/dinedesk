<?php

namespace App\Modules\Onboarding\Actions;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Identity\Support\Roles;
use App\Modules\Plans\Models\Plan;
use App\Modules\Plans\Models\Subscription;
use App\Modules\Referrals\Services\ReferralCodes;
use App\Modules\Referrals\Services\ReferralRewards;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Models\TenantDomain;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Modules\Website\Models\ThemeSetting;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Onboarding steps 2–3: creates the business for a signed-in user who
 * doesn't have one yet. Everything happens in one transaction:
 * tenant + provisional subdomain + trial subscription + owner role +
 * opening hours.
 */
class CreateBusiness
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly TenantSettings $settings,
        private readonly ReferralRewards $referrals,
    ) {}

    /**
     * @param  array{business_type: string, name: string, city: string, gstin?: ?string, opening_hours: array, referral_code?: ?string}  $data
     */
    public function __invoke(User $owner, array $data): Tenant
    {
        if ($owner->tenant_id) {
            throw new ApiException('You have already set up a business.', 409, 'already_onboarded');
        }
        if ($owner->is_platform_admin) {
            throw new ApiException('Platform administrators cannot own a business account.', 403, 'forbidden');
        }

        $trial = config('dinedesk.trial');
        $plan = Plan::where('code', $trial['plan'])->firstOrFail();

        return DB::transaction(function () use ($owner, $data, $plan, $trial) {
            $tenant = Tenant::create([
                'name' => strip_tags($data['name']),
                'slug' => $this->uniqueSlug($data['name']),
                'business_type' => $data['business_type'],
                'city' => strip_tags($data['city']),
                'gstin' => $data['gstin'] ?? null,
                'timezone' => config('dinedesk.default_timezone'),
                'status' => 'onboarding',
                'onboarding_step' => 4, // steps 4–7 (theme, branding, menu, go live) come next
                'plan_id' => $plan->id,
                'referral_code' => ReferralCodes::unusedCode(),
            ]);
            // Signed up with another business's referral link (invalid codes are ignored).
            $this->referrals->recordSignup($tenant, $owner, $data['referral_code'] ?? null);

            TenantDomain::create([
                'tenant_id' => $tenant->id,
                'domain' => TenantResolver::subdomainFor($tenant->slug),
                'type' => 'subdomain',
                'is_primary' => true,
                'verified_at' => now(),
            ]);

            $this->context->run($tenant, function () use ($tenant, $owner, $plan, $trial, $data) {
                Subscription::create([
                    'plan_id' => $plan->id,
                    'status' => 'trialing',
                    'trial_ends_at' => now()->addDays($trial['days']),
                ]);

                $owner->forceFill(['tenant_id' => $tenant->id])->save();
                $owner->assignRole(Roles::OWNER);

                $this->settings->set('opening_hours', OpeningHours::normalize($data['opening_hours']));
                ThemeSetting::current();

                AuditLog::record('tenant.created', $tenant, ['business_type' => $tenant->business_type, 'trial_plan' => $plan->code]);
            });

            return $tenant->fresh(['plan', 'domains']);
        });
    }

    /** "The Hungry Haveli" → "the-hungry-haveli", "-2", "-3"... avoiding reserved words. */
    public function uniqueSlug(string $name): string
    {
        $base = Str::of(Str::ascii($name))->slug()->limit(40, '')->trim('-')->value() ?: 'business';
        if (in_array($base, config('dinedesk.reserved_slugs'), true) || strlen($base) < 3) {
            $base = Str::limit($base, 30, '').'-'.Str::lower(Str::random(4));
        }

        $slug = $base;
        $i = 2;
        while (Tenant::withTrashed()->where('slug', $slug)->exists() || TenantDomain::where('domain', TenantResolver::subdomainFor($slug))->exists()) {
            $slug = "{$base}-{$i}";
            $i++;
        }

        return $slug;
    }
}
