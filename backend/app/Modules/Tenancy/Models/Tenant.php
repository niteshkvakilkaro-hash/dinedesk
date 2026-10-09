<?php

namespace App\Modules\Tenancy\Models;

use App\Models\User;
use App\Modules\Plans\Models\FeatureOverride;
use App\Modules\Plans\Models\Plan;
use App\Modules\Plans\Models\Subscription;
use App\Modules\Tenancy\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Tenant extends Model
{
    use HasUlids, SoftDeletes;

    public const TYPES = ['restaurant', 'cafe', 'cloud_kitchen', 'hotel'];

    public const STATUSES = ['onboarding', 'live', 'suspended', 'read_only'];

    protected $fillable = [
        'name', 'slug', 'business_type', 'city', 'gstin', 'timezone', 'status',
        'onboarding_step', 'plan_id', 'last_active_at', 'is_demo',
    ];

    protected function casts(): array
    {
        return [
            'onboarding_step' => 'integer',
            'last_active_at' => 'datetime',
            'is_demo' => 'boolean',
        ];
    }

    /** ULIDs only for public_id; the numeric id stays the primary key. */
    public function uniqueIds(): array
    {
        return ['public_id'];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function domains(): HasMany
    {
        return $this->hasMany(TenantDomain::class);
    }

    public function primaryDomain(): HasOne
    {
        return $this->hasOne(TenantDomain::class)->where('is_primary', true);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function subscriptions(): HasMany
    {
        // The relation already pins tenant_id to this tenant, so the global scope is
        // lifted here; platform (super admin) code has no tenant in context.
        return $this->hasMany(Subscription::class)->withoutGlobalScope(TenantScope::class)->latest('id');
    }

    public function currentSubscription(): HasOne
    {
        // Plain ordering instead of latestOfMany(): its inner subquery would get
        // the tenant scope re-applied and match nothing outside a tenant context.
        return $this->hasOne(Subscription::class)->withoutGlobalScope(TenantScope::class)->orderByDesc('id');
    }

    public function featureOverrides(): HasMany
    {
        return $this->hasMany(FeatureOverride::class)->withoutGlobalScope(TenantScope::class);
    }

    public function isWritable(): bool
    {
        return ! in_array($this->status, ['suspended', 'read_only'], true);
    }
}
