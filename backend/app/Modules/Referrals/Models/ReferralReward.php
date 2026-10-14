<?php

namespace App\Modules\Referrals\Models;

use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Free days one business earned through a referral. Platform-level (not tenant-scoped):
 * readers filter by tenant_id. pending → applied (trial end or a non-renewing period end
 * moved, or applied by hand by the super admin).
 */
class ReferralReward extends Model
{
    protected $fillable = ['tenant_id', 'referred_tenant_id', 'role', 'days', 'status', 'applied_to', 'applied_at', 'new_end', 'note', 'applied_by'];

    protected function casts(): array
    {
        return ['days' => 'integer', 'applied_at' => 'datetime', 'new_end' => 'datetime'];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class)->withTrashed();
    }

    /** The business whose first payment earned this reward. */
    public function referred(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'referred_tenant_id')->withTrashed();
    }
}
