<?php

namespace App\Modules\Ordering\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class DeliveryZone extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'name', 'type', 'pincodes', 'radius_km', 'fee', 'min_order', 'free_above', 'is_active', 'sort_order', 'is_demo'];

    protected function casts(): array
    {
        return [
            'pincodes' => 'array',
            'radius_km' => 'decimal:2',
            'fee' => 'decimal:2',
            'min_order' => 'decimal:2',
            'free_above' => 'decimal:2',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
            'is_demo' => 'boolean',
        ];
    }
}
