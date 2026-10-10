<?php

namespace App\Modules\Plans\Models;

use App\Modules\Plans\Services\FeatureService;
use Illuminate\Database\Eloquent\Model;

class Plan extends Model
{
    protected $fillable = ['code', 'name', 'description', 'price_monthly', 'price_yearly', 'features', 'limits', 'razorpay_plans', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return [
            'price_monthly' => 'decimal:2',
            'price_yearly' => 'decimal:2',
            'features' => 'array',
            'limits' => 'array',
            'razorpay_plans' => 'array',
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::saved(fn () => app(FeatureService::class)->forgetAll());
    }

    /** Monthly recurring value of this plan for a billing cycle (0 when not priced yet). */
    public function monthlyValue(string $cycle = 'monthly'): float
    {
        return $cycle === 'yearly'
            ? round(((float) $this->price_yearly) / 12, 2)
            : (float) $this->price_monthly;
    }
}
