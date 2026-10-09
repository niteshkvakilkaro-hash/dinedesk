<?php

namespace App\Modules\Tenancy\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Restricts every query on a tenant-owned model to the current tenant.
 *
 * Fails closed: with no tenant in context the query matches nothing, so a
 * forgotten context can never leak another business's rows. Platform code
 * that genuinely needs all tenants must opt out explicitly with
 * Model::withoutTenancy().
 */
class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $context = app(TenantContext::class);

        if ($context->check()) {
            $builder->where($model->qualifyColumn('tenant_id'), $context->id());
        } else {
            $builder->whereRaw('1 = 0');
        }
    }
}
