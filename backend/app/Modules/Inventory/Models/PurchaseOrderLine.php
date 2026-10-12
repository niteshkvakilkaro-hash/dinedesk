<?php

namespace App\Modules\Inventory\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseOrderLine extends Model
{
    use BelongsToTenant;

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'purchase_order_id', 'inventory_item_id', 'quantity', 'unit_cost', 'received_quantity'];

    protected function casts(): array
    {
        return ['quantity' => 'decimal:3', 'unit_cost' => 'decimal:2', 'received_quantity' => 'decimal:3'];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }
}
