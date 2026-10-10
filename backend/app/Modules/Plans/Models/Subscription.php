<?php

namespace App\Modules\Plans\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subscription extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'plan_id', 'scheduled_plan_id', 'status', 'billing_cycle', 'trial_ends_at', 'current_period_starts_at', 'current_period_ends_at',
        'grace_ends_at', 'cancel_at_period_end', 'provider', 'provider_subscription_id', 'checkout_url', 'last_charged_at', 'ended_at',
    ];

    protected function casts(): array
    {
        return [
            'trial_ends_at' => 'datetime',
            'current_period_starts_at' => 'datetime',
            'current_period_ends_at' => 'datetime',
            'grace_ends_at' => 'datetime',
            'cancel_at_period_end' => 'boolean',
            'last_charged_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function scheduledPlan(): BelongsTo
    {
        return $this->belongsTo(Plan::class, 'scheduled_plan_id');
    }
}
