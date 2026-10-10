<?php

namespace App\Modules\Subscriptions\Services;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Models\Tenant;

/**
 * Read-only mode when billing lapses, and back to normal once paid. Applies to a business
 * and all its branches. Data is never deleted: owners can still sign in, see everything,
 * export their data and pay.
 */
class TenantAccess
{
    public function readOnly(Tenant $root, string $why): void
    {
        foreach ($this->family($root) as $t) {
            if (in_array($t->status, ['live', 'onboarding'], true)) {
                $t->update(['status' => 'read_only']);
                AuditLog::record('billing.read_only', $t, ['reason' => $why], $t->id);
            }
        }
    }

    public function restore(Tenant $root): void
    {
        foreach ($this->family($root) as $t) {
            if ($t->status === 'read_only') {
                $t->update(['status' => $t->onboarding_step >= 8 ? 'live' : 'onboarding']);
                AuditLog::record('billing.restored', $t, [], $t->id);
            }
        }
    }

    /** The plan follows the subscription, for the business and its branches. */
    public function setPlan(Tenant $root, int $planId): void
    {
        foreach ($this->family($root) as $t) {
            if ($t->plan_id !== $planId) {
                $t->update(['plan_id' => $planId]);
            }
            app(FeatureService::class)->forget($t);
        }
    }

    /** @return list<Tenant> */
    private function family(Tenant $root): array
    {
        return [$root, ...Tenant::where('parent_tenant_id', $root->id)->get()->all()];
    }
}
