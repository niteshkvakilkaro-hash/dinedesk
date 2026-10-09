<?php

namespace App\Modules\Tenancy\Support;

use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * Use on every model whose table has a tenant_id column.
 *
 *  - reads are scoped to the current tenant (TenantScope)
 *  - new rows get the current tenant_id automatically
 *  - tenant_id can never be changed after creation
 */
trait BelongsToTenant
{
    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope(new TenantScope());

        static::creating(function ($model) {
            if (empty($model->tenant_id)) {
                $context = app(TenantContext::class);
                if (! $context->check()) {
                    throw new LogicException('Cannot create '.static::class.' without a tenant in context.');
                }
                $model->tenant_id = $context->id();
            }
        });

        static::updating(function ($model) {
            if ($model->isDirty('tenant_id')) {
                throw new LogicException('tenant_id cannot be changed on '.static::class.'.');
            }
        });
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /** Explicit opt-out for platform (super admin) code paths. */
    public static function withoutTenancy(): Builder
    {
        return static::withoutGlobalScope(TenantScope::class);
    }
}
