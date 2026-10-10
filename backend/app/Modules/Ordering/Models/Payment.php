<?php

namespace App\Modules\Ordering\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'order_id', 'room_booking_id', 'provider', 'provider_order_id', 'provider_payment_id', 'amount', 'currency', 'status', 'method', 'error'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2'];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
