<?php

namespace App\Modules\Menu\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Addon extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'addon_group_id', 'name', 'name_hi', 'price', 'food_type', 'is_available', 'sort_order'];

    protected function casts(): array
    {
        return ['price' => 'decimal:2', 'is_available' => 'boolean', 'sort_order' => 'integer'];
    }
}
