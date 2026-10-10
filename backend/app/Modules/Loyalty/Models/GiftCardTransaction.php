<?php

namespace App\Modules\Loyalty\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class GiftCardTransaction extends Model
{
    use BelongsToTenant;

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'gift_card_id', 'type', 'amount', 'balance_after', 'mode', 'invoice_id', 'user_id', 'created_at'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'balance_after' => 'decimal:2', 'created_at' => 'datetime'];
    }
}
