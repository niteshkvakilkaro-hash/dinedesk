<?php

namespace App\Modules\Ordering\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class OrderItem extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'order_id', 'menu_item_id', 'name', 'name_hi', 'variant_name', 'addons', 'food_type',
        'unit_price', 'quantity', 'tax_rate', 'line_subtotal', 'line_tax', 'line_total', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'addons' => 'array',
            'unit_price' => 'decimal:2',
            'quantity' => 'integer',
            'tax_rate' => 'decimal:2',
            'line_subtotal' => 'decimal:2',
            'line_tax' => 'decimal:2',
            'line_total' => 'decimal:2',
        ];
    }
}
