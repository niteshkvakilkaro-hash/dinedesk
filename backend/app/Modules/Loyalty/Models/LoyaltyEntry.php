<?php

namespace App\Modules\Loyalty\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** One line of a customer's points ledger. */
class LoyaltyEntry extends Model
{
    use BelongsToTenant;

    protected $table = 'loyalty_ledger';

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'customer_id', 'order_id', 'invoice_id', 'type', 'points', 'balance_after', 'note', 'user_id', 'created_at'];

    protected function casts(): array
    {
        return ['points' => 'integer', 'balance_after' => 'integer', 'created_at' => 'datetime'];
    }
}
