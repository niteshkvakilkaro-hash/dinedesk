<?php

namespace App\Modules\Inventory\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    use BelongsToTenant;

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'inventory_item_id', 'type', 'quantity', 'balance_after', 'unit_cost', 'order_id', 'note', 'user_id', 'created_at'];

    protected function casts(): array
    {
        return ['quantity' => 'decimal:3', 'balance_after' => 'decimal:3', 'unit_cost' => 'decimal:2', 'created_at' => 'datetime'];
    }
}
