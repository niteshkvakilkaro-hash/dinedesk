<?php

namespace App\Modules\Plans\Models;

use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class FeatureOverride extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'feature', 'enabled', 'reason', 'created_by', 'expires_at'];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'expires_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Resolved features are memoised; any change must invalidate them so
        // long-running workers never act on a stale plan.
        static::saved(fn () => app(FeatureService::class)->forgetAll());
        static::deleted(fn () => app(FeatureService::class)->forgetAll());
    }

    public function scopeCurrent(Builder $query): Builder
    {
        return $query->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }
}
