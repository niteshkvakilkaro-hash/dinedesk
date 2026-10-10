<?php

namespace App\Modules\Marketing\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class CouponRedemption extends Model
{
    use BelongsToTenant;

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'coupon_id', 'order_id', 'invoice_id', 'customer_id', 'amount', 'reversed_at', 'created_at'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'reversed_at' => 'datetime', 'created_at' => 'datetime'];
    }
}
