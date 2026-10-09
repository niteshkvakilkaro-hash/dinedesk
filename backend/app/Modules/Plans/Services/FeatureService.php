<?php

namespace App\Modules\Plans\Services;

use App\Modules\Plans\Models\FeatureOverride;
use App\Modules\Plans\Support\Features;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;

/**
 * Resolves what a tenant may use: plan features, then super-admin overrides
 * (which win), plus numeric limits. Results are memoised per request.
 */
class FeatureService
{
    /** @var array<int, array{features: array<string, bool>, limits: array<string, ?int>}> */
    private array $memo = [];

    /** @return array<string, bool> every catalogue key → enabled? */
    public function features(Tenant $tenant): array
    {
        return $this->resolve($tenant)['features'];
    }

    /** @return array<string, ?int> limit key → number, or null for unlimited */
    public function limits(Tenant $tenant): array
    {
        return $this->resolve($tenant)['limits'];
    }

    public function enabled(Tenant $tenant, string $feature): bool
    {
        return $this->features($tenant)[$feature] ?? false;
    }

    public function limit(Tenant $tenant, string $key): ?int
    {
        return $this->limits($tenant)[$key] ?? null;
    }

    public function assertEnabled(Tenant $tenant, string $feature): void
    {
        if (! $this->enabled($tenant, $feature)) {
            throw new ApiException(
                'This feature is not included in your current plan.',
                403,
                'feature_unavailable',
                ['feature' => $feature, 'upgrade' => true],
            );
        }
    }

    /** Throws when adding one more would exceed the plan limit. */
    public function assertWithinLimit(Tenant $tenant, string $key, int $currentCount): void
    {
        $limit = $this->limit($tenant, $key);
        if ($limit !== null && $currentCount >= $limit) {
            throw new ApiException(
                "Your plan allows {$limit} ".str_replace('_', ' ', $key).'. Upgrade to add more.',
                403,
                'plan_limit',
                ['limit' => $key, 'max' => $limit, 'upgrade' => true],
            );
        }
    }

    public function forget(Tenant $tenant): void
    {
        unset($this->memo[$tenant->id]);
    }

    /** Called whenever a plan or override changes (see FeatureOverride/Plan model events). */
    public function forgetAll(): void
    {
        $this->memo = [];
    }

    private function resolve(Tenant $tenant): array
    {
        if (isset($this->memo[$tenant->id])) {
            return $this->memo[$tenant->id];
        }

        $plan = $tenant->plan;
        $planFeatures = $plan?->features ?? [];
        $features = array_fill_keys(Features::keys(), false);
        foreach ($planFeatures as $key) {
            if (array_key_exists($key, $features)) {
                $features[$key] = true;
            }
        }

        $overrides = FeatureOverride::withoutTenancy()
            ->where('tenant_id', $tenant->id)
            ->current()
            ->pluck('enabled', 'feature');
        foreach ($overrides as $key => $enabled) {
            if (array_key_exists($key, $features)) {
                $features[$key] = (bool) $enabled;
            }
        }

        $limits = [];
        foreach (array_keys(Features::LIMITS) as $key) {
            $value = $plan?->limits[$key] ?? null;
            $limits[$key] = $value === null ? null : (int) $value;
        }

        return $this->memo[$tenant->id] = ['features' => $features, 'limits' => $limits];
    }
}
