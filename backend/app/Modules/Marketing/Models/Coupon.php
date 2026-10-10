<?php

namespace App\Modules\Marketing\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** Discount code (flat or percent) with minimum order, validity and usage limits. */
class Coupon extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'code', 'description', 'type', 'value', 'max_discount', 'min_order', 'starts_at', 'ends_at', 'usage_limit', 'per_customer_limit', 'used_count', 'online', 'pos', 'is_public', 'is_active'];

    protected function casts(): array
    {
        return ['value' => 'decimal:2', 'max_discount' => 'decimal:2', 'min_order' => 'decimal:2', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'usage_limit' => 'integer', 'per_customer_limit' => 'integer', 'used_count' => 'integer', 'online' => 'boolean', 'pos' => 'boolean', 'is_public' => 'boolean', 'is_active' => 'boolean'];
    }
}
