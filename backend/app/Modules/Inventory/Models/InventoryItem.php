<?php

namespace App\Modules\Inventory\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** A raw material (stock kept in its unit). */
class InventoryItem extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'name', 'unit', 'stock', 'low_stock_level', 'cost_per_unit', 'is_active', 'low_alerted_at'];

    protected function casts(): array
    {
        return ['stock' => 'decimal:3', 'low_stock_level' => 'decimal:3', 'cost_per_unit' => 'decimal:2', 'is_active' => 'boolean', 'low_alerted_at' => 'datetime'];
    }

    public function isLow(): bool
    {
        return (float) $this->stock <= (float) $this->low_stock_level;
    }
}
